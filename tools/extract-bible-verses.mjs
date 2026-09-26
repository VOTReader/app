/**
 * extract-bible-verses — one chapter's verses as alignment reference JSON.
 *
 *   node tools/extract-bible-verses.mjs <bookId> <chapter> [out.json] [--translation nkjv|kjv|web|...]
 *   node tools/extract-bible-verses.mjs --all <out.json> [--translation ...]
 *
 * --all: every chapter the translation holds, in one process, as
 * {bookId: {chapter: [{n, text}]}} — audio-manifest ids (Matthew is "matthew"),
 * verses sorted, through the same readers and the same zero-verse refusal as one
 * chapter. validate-bible-sync uses it so a books.js edition costs one node spawn
 * instead of 1,189 (sweep-2 n7-04: 152 s of CI).
 *
 * ALIGNMENT INVARIANT: the reference translation must match the RECORDING's
 * translation (wop -> nkjv, brm -> kjv, web -> web). Two source shapes:
 *   nkjv (default)  — books.js BOOKS, Format C (chapters[].sections[].verses);
 *                     Matthew lives in matthew-plain.js (MATTHEW_PLAIN).
 *   anything else   — bible-<code>.js flat map data[bookId][chapterStr]=[{n,text}].
 * BOOK-ID ALIAS (the one place it lives): audio manifests say "matthew"; every
 * flat-map translation stores it as "matthew-plain". Callers always pass the
 * audio-manifest id; the resolver translates.
 * Headings (Format C only) are printed chrome, never spoken — sample-page use only.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const args = process.argv.slice(2);
const tIdx = args.indexOf('--translation');
const translation = tIdx >= 0 ? args.splice(tIdx, 2)[1] : 'nkjv';
const aIdx = args.indexOf('--all');
const allOut = aIdx >= 0 ? args.splice(aIdx, 2)[1] : null;
const [bookId, chapterArg, outArg] = args;
if (aIdx >= 0 ? !allOut : (!bookId || !chapterArg)) {
  console.error('usage: node tools/extract-bible-verses.mjs <bookId> <chapter> [out.json] [--translation nkjv|kjv|web|...]\n'
    + '       node tools/extract-bible-verses.mjs --all <out.json> [--translation ...]');
  process.exit(1);
}

class ExtractError extends Error {}
function fail(msg) { throw new ExtractError(msg); }

// Each corpus file is evaluated once per process (--all asks for every chapter).
const contexts = {};
function load(file, globalName) {
  if (!(file in contexts)) {
    const ctx = {};
    runInNewContext(readFileSync(resolve(ASSETS, 'src', 'data', file), 'utf8'), ctx, { filename: file });
    contexts[file] = ctx;
  }
  return contexts[file][globalName];
}

// One chapter: { bookTitle, headings, verses } with verses sorted by n.
function readChapter(bookId, chapterNum) {
  const verses = [];
  const headings = [];
  let bookTitle = bookId;

  if (translation === 'vot-matthew') {
    // The text the Matthew SCREEN renders: matthew.js / MATTHEW, with the
    // restored divine names the TSOT recording actually speaks. This is its OWN
    // code and not an alias, because `nkjv` must keep resolving Matthew to
    // matthew-plain.js — that is the Word of Promise's reference, and moving it
    // would silently change what a future WOP Matthew belt was aligned against.
    // Same Format C shape as books.js: chapters[].sections[].verses[].
    // Alignment target only: MATTHEW and MATTHEW_PLAIN score 0.907 against this
    // recording with a shared versification, so one timeline serves both
    // surfaces and the choice cannot make the wash land on the wrong verse.
    // This edition IS one book, so a bookId it does not cover must be refused
    // rather than quietly answered with Matthew's chapter of that number —
    // `genesis 1 --translation vot-matthew` returned Matthew 1 and exit 0.
    if (bookId !== 'matthew' && bookId !== 'matthew-plain') {
      fail(`vot-matthew covers only Matthew; asked for ${bookId}`);
    }
    const book = load('matthew.js', 'MATTHEW');
    if (!book) fail('MATTHEW not found in matthew.js');
    bookTitle = book.title || 'Matthew';
    const chapter = (book.chapters || []).find((c) => c.num === chapterNum);
    if (!chapter) fail(`chapter ${chapterNum} not found in matthew.js`);
    // A FOURTH corpus shape: matthew.js nests verses directly under the chapter,
    // with NO sections layer (books.js Format C has one; the flat-map editions
    // have neither). Reading it as Format C returns zero verses and writes a
    // perfectly valid empty file — the failure that reads like a result. The
    // zero-verse guard below is what stops that for every branch, not just this one.
    if (chapter.title) headings.push(chapter.title);
    for (const v of chapter.verses || []) verses.push({ n: v.n, text: String(v.text) });
  } else if (translation === 'nkjv') {
    const isMatthew = bookId === 'matthew' || bookId === 'matthew-plain';
    const file = isMatthew ? 'matthew-plain.js' : 'books.js';
    const books = isMatthew ? null : load(file, 'BOOKS');
    const book = isMatthew
      ? load(file, 'MATTHEW_PLAIN')
      : (books[bookId] || Object.values(books).find((b) => b && b.id === bookId));
    if (!book) fail('book not found: ' + bookId);
    bookTitle = book.title;
    const chapter = (book.chapters || []).find((c) => c.num === chapterNum);
    if (!chapter) fail(`chapter ${chapterNum} not found in ${bookId}`);
    for (const s of chapter.sections || []) {
      if (s.heading) headings.push(s.heading);
      for (const v of s.verses || []) verses.push({ n: v.n, text: String(v.text) });
    }
  } else {
    const file = `bible-${translation}.js`;
    const globalName = 'BIBLE_' + translation.toUpperCase();
    const data = load(file, globalName);
    if (!data) fail(`${globalName} not found in ${file}`);
    const flatId = bookId === 'matthew' ? 'matthew-plain' : bookId;   // the alias
    const bookMap = data[flatId];
    if (!bookMap) fail(`book not found in ${translation}: ${bookId} (tried ${flatId})`);
    const rows = bookMap[String(chapterNum)];
    if (!rows) fail(`chapter ${chapterNum} not found in ${translation}:${flatId}`);
    bookTitle = flatId === 'matthew-plain' ? 'Matthew' : bookId[0].toUpperCase() + bookId.slice(1);
    for (const v of rows) verses.push({ n: v.n, text: String(v.text) });
  }

  // A chapter with no verses is a READER bug, never a corpus fact — every
  // chapter of every shipped translation has verses. Writing the empty file
  // instead produces a valid JSON reference that aligns a whole chapter against
  // nothing, and the belt that comes back looks like a scoring failure rather
  // than an extraction one. Measured 2026-09-05: reading matthew.js as Format C
  // returned 0 verses and exit 0.
  if (!verses.length) {
    fail(`no verses extracted for ${bookId} ${chapterNum} [${translation}] — `
      + 'the corpus shape this branch expects does not match the file. Nothing written.');
  }
  verses.sort((a, b) => a.n - b.n);
  return { bookTitle, headings, verses };
}

// Every [bookId, [chapter nums]] the translation holds, in audio-manifest ids.
function allChapters() {
  const nums = (book) => (book.chapters || []).map((c) => c.num);
  if (translation === 'vot-matthew') return [['matthew', nums(load('matthew.js', 'MATTHEW'))]];
  if (translation === 'nkjv') {
    return [
      ...Object.values(load('books.js', 'BOOKS')).filter(Boolean).map((b) => [b.id, nums(b)]),
      ['matthew', nums(load('matthew-plain.js', 'MATTHEW_PLAIN'))],
    ];
  }
  const globalName = 'BIBLE_' + translation.toUpperCase();
  const data = load(`bible-${translation}.js`, globalName);
  if (!data) fail(`${globalName} not found in bible-${translation}.js`);
  return Object.keys(data).map((k) => [k === 'matthew-plain' ? 'matthew' : k, Object.keys(data[k]).map(Number)]);
}

try {
  if (allOut) {
    const all = {};
    let chapters = 0;
    for (const [id, nums] of allChapters()) {
      all[id] = {};
      for (const n of nums) { all[id][String(n)] = readChapter(id, n).verses; chapters++; }
    }
    mkdirSync(dirname(resolve(allOut)), { recursive: true });
    writeFileSync(allOut, JSON.stringify(all));
    console.log(`[${translation}] --all: ${Object.keys(all).length} books, ${chapters} chapters -> ${allOut}`);
  } else {
    const chapterNum = Number(chapterArg);
    const { bookTitle, headings, verses } = readChapter(bookId, chapterNum);
    const out = { book: bookTitle, bookId, translation, chapter: chapterNum, headings, verses };
    const outPath = outArg || resolve(HERE, '_align-work', 'bible', `${bookId}-${chapterNum}.${translation}.verses.json`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(out, null, 1));
    console.log(`${bookTitle} ${chapterNum} [${translation}]: ${verses.length} verses, ${headings.length} headings -> ${outPath}`);
  }
} catch (e) {
  if (!(e instanceof ExtractError)) throw e;
  console.error(e.message);
  process.exit(1);
}
