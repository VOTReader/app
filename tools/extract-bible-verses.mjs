/**
 * extract-bible-verses — one chapter's verses as alignment reference JSON.
 *
 *   node tools/extract-bible-verses.mjs <bookId> <chapter> [out.json] [--translation nkjv|kjv|web|...]
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
const [bookId, chapterArg, outArg] = args;
if (!bookId || !chapterArg) {
  console.error('usage: node tools/extract-bible-verses.mjs <bookId> <chapter> [out.json] [--translation nkjv|kjv|web|...]');
  process.exit(1);
}
const chapterNum = Number(chapterArg);

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
    console.error(`vot-matthew covers only Matthew; asked for ${bookId}`);
    process.exit(1);
  }
  const ctx = {};
  runInNewContext(readFileSync(resolve(ASSETS, 'src', 'data', 'matthew.js'), 'utf8'), ctx, { filename: 'matthew.js' });
  const book = ctx.MATTHEW;
  if (!book) { console.error('MATTHEW not found in matthew.js'); process.exit(1); }
  bookTitle = book.title || 'Matthew';
  const chapter = (book.chapters || []).find((c) => c.num === chapterNum);
  if (!chapter) { console.error(`chapter ${chapterNum} not found in matthew.js`); process.exit(1); }
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
  const ctx = {};
  runInNewContext(readFileSync(resolve(ASSETS, 'src', 'data', file), 'utf8'), ctx, { filename: file });
  const book = isMatthew
    ? ctx.MATTHEW_PLAIN
    : (ctx.BOOKS[bookId] || Object.values(ctx.BOOKS).find((b) => b && b.id === bookId));
  if (!book) { console.error('book not found: ' + bookId); process.exit(1); }
  bookTitle = book.title;
  const chapter = (book.chapters || []).find((c) => c.num === chapterNum);
  if (!chapter) { console.error(`chapter ${chapterNum} not found in ${bookId}`); process.exit(1); }
  for (const s of chapter.sections || []) {
    if (s.heading) headings.push(s.heading);
    for (const v of s.verses || []) verses.push({ n: v.n, text: String(v.text) });
  }
} else {
  const file = `bible-${translation}.js`;
  const globalName = 'BIBLE_' + translation.toUpperCase();
  const ctx = {};
  runInNewContext(readFileSync(resolve(ASSETS, 'src', 'data', file), 'utf8'), ctx, { filename: file });
  const data = ctx[globalName];
  if (!data) { console.error(`${globalName} not found in ${file}`); process.exit(1); }
  const flatId = bookId === 'matthew' ? 'matthew-plain' : bookId;   // the alias
  const bookMap = data[flatId];
  if (!bookMap) { console.error(`book not found in ${translation}: ${bookId} (tried ${flatId})`); process.exit(1); }
  const rows = bookMap[String(chapterNum)];
  if (!rows) { console.error(`chapter ${chapterNum} not found in ${translation}:${flatId}`); process.exit(1); }
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
  console.error(`no verses extracted for ${bookId} ${chapterNum} [${translation}] — `
    + 'the corpus shape this branch expects does not match the file. Nothing written.');
  process.exit(1);
}
verses.sort((a, b) => a.n - b.n);
const out = { book: bookTitle, bookId, translation, chapter: chapterNum, headings, verses };
const outPath = outArg || resolve(HERE, '_align-work', 'bible', `${bookId}-${chapterNum}.${translation}.verses.json`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`${bookTitle} ${chapterNum} [${translation}]: ${verses.length} verses, ${headings.length} headings -> ${outPath}`);
