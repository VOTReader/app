#!/usr/bin/env node
// tools/regen-rvr.js
// Builds app/src/main/assets/src/data/bible-rvr.js: the Reina-Valera 1960 (Spanish) as an alternate
// translation (es1, 2026-10-14). Corbin asked for a Spanish Bible; the RVR1960 is the one almost every
// Spanish-speaking church reads, from the same Textus Receptus line as the app's default NKJV.
//
// Source: YouVersion's RVR1960 (bible.com version 149, the Sociedades Biblicas Unidas text), one page per
// chapter: https://www.bible.com/bible/149/{USFM}.{chapter}.RVR1960 (1,189 pages). Checked before it was
// chosen: bolls.life's RV1960 (the source of the app's Matthew) carries ~370 old typos ("estabecieron",
// "dieciendo", "seÑor", "levitaCoré") that the YouVersion text does not, and a GitHub copy scraped from
// YouVersion lost the space at every poetry line break ("unidosContra"). Each poetry line is its own
// verse span on the page, so a verse seen again starts with a space here.
//
// Writes the exact shape the app expects (same as regen-kjv.js):
//   var BIBLE_RVR = { "genesis": { "1": [{ "n": 1, "text": "..." }, ...], ... }, ... }
// Verse numbers follow the KJV reference (bible-kjv.js) the validator checks: the RVR1960 splits two
// verses the KJV keeps whole (Psalm 47:9-10, 3 John 14-15), and those are joined back below. Any other
// difference from the reference's verse set stops the run.
//
// Usage: node tools/regen-rvr.js [--cache <dir>] [--offline]
//   --cache    each page's chapter text block is kept here (default tools/_rvr-cache, git-ignored, ~40 MB), so
//              a re-run fetches nothing; delete the folder to fetch the text fresh.
//   --offline  never fetch; a chapter missing from the cache is an error.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../app/src/main/assets/src/data');
const OUT_PATH = path.join(DATA_DIR, 'bible-rvr.js');
const REF_PATH = path.join(DATA_DIR, 'bible-kjv.js');

// [USFM book code, app book ID], canonical order.
const BOOKS = [
  ['GEN', 'genesis'], ['EXO', 'exodus'], ['LEV', 'leviticus'], ['NUM', 'numbers'], ['DEU', 'deuteronomy'],
  ['JOS', 'joshua'], ['JDG', 'judges'], ['RUT', 'ruth'], ['1SA', '1samuel'], ['2SA', '2samuel'],
  ['1KI', '1kings'], ['2KI', '2kings'], ['1CH', '1chronicles'], ['2CH', '2chronicles'], ['EZR', 'ezra'],
  ['NEH', 'nehemiah'], ['EST', 'esther'], ['JOB', 'job'], ['PSA', 'psalms'], ['PRO', 'proverbs'],
  ['ECC', 'ecclesiastes'], ['SNG', 'songofsolomon'], ['ISA', 'isaiah'], ['JER', 'jeremiah'],
  ['LAM', 'lamentations'], ['EZK', 'ezekiel'], ['DAN', 'daniel'], ['HOS', 'hosea'], ['JOL', 'joel'],
  ['AMO', 'amos'], ['OBA', 'obadiah'], ['JON', 'jonah'], ['MIC', 'micah'], ['NAM', 'nahum'],
  ['HAB', 'habakkuk'], ['ZEP', 'zephaniah'], ['HAG', 'haggai'], ['ZEC', 'zechariah'], ['MAL', 'malachi'],
  ['MAT', 'matthew-plain'], // 'matthew' key = Study Bible; 'matthew-plain' = Bible chapter nav
  ['MRK', 'mark'], ['LUK', 'luke'], ['JHN', 'john'], ['ACT', 'acts'], ['ROM', 'romans'],
  ['1CO', '1corinthians'], ['2CO', '2corinthians'], ['GAL', 'galatians'], ['EPH', 'ephesians'],
  ['PHP', 'philippians'], ['COL', 'colossians'], ['1TH', '1thessalonians'], ['2TH', '2thessalonians'],
  ['1TI', '1timothy'], ['2TI', '2timothy'], ['TIT', 'titus'], ['PHM', 'philemon'], ['HEB', 'hebrews'],
  ['JAS', 'james'], ['1PE', '1peter'], ['2PE', '2peter'], ['1JN', '1john'], ['2JN', '2john'],
  ['3JN', '3john'], ['JUD', 'jude'], ['REV', 'revelation'],
];

// RVR1960 verses the KJV numbering keeps inside the verse before: 'appId chapter' -> { extra: into }.
const JOIN_INTO_PREVIOUS = {
  'psalms 47': { 10: 9 },  // KJV 47:9 = "...Abraham: for the shields of the earth belong unto God..."
  '3john 1': { 15: 14 },   // KJV 3 John 14 ends "Peace be to thee. Our friends salute thee..."
};

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const CACHE_DIR = path.resolve(opt('--cache', path.join(__dirname, '_rvr-cache')));
const OFFLINE = args.includes('--offline');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)); }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { buf += chunk; });
      res.on('end', () => resolve(buf));
    }).on('error', reject);
  });
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * One bible.com chapter page -> { verseNumber: text }. Text is taken from inside the verse spans only,
 * leaving out the verse-number labels, footnotes and cross references, and headings (Psalm titles and
 * section headings sit outside the verse spans).
 * @param {string} html
 * @param {string} usfm  e.g. 'PSA.47'
 */
export function parseChapter(html, usfm) {
  const verses = {};
  const stack = [];
  let cur = null;
  let skip = 0;
  const tok = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  let m;
  while ((m = tok.exec(html))) {
    if (m[4] !== undefined) {
      if (cur && !skip) verses[cur].push(decode(m[4]));
      continue;
    }
    const [, close, tag, attrs] = m;
    if (tag === 'br') { if (cur) verses[cur].push(' '); continue; }
    if (tag !== 'span') continue;
    if (close) {
      const kind = stack.pop();
      if (kind === 'verse') cur = null;
      else if (kind === 'skip') skip--;
      continue;
    }
    if (/\/\s*$/.test(attrs)) continue; // self-closed
    const cls = (/\bclass="([^"]*)"/.exec(attrs) || [])[1] || '';
    const ref = (/\bdata-usfm="([^"]*)"/.exec(attrs) || [])[1] || '';
    if (/__verse\b/.test(cls) && ref) {
      const vm2 = new RegExp('^' + usfm.replace('.', '\\.') + '\\.(\\d+)$').exec(ref);
      if (!vm2) throw new Error(`${usfm}: verse span "${ref}" is not one verse of this chapter (a combined verse needs handling)`);
      cur = vm2[1];
      if (!verses[cur]) verses[cur] = [];
      else verses[cur].push(' '); // the verse goes on in the next poetry line or paragraph
      stack.push('verse');
    } else if (/__(label|note|heading)\b/.test(cls)) {
      skip++;
      stack.push('skip');
    } else {
      stack.push(null);
    }
  }
  const out = {};
  for (const [n, parts] of Object.entries(verses)) out[n] = clean(parts.join(''));
  return out;
}

/**
 * Spaces as a printed page has them: one between words, none before closing punctuation. A doubled
 * comma is a slip in the source (2 Chronicles 8:13, Colossians 2:16, Philemon 10 read "reposo,,").
 */
export function clean(s) {
  return s.normalize('NFC').replace(/\s+/g, ' ').replace(/ ([,;:.!?)\]»])/g, '$1').replace(/([(¿¡«]) /g, '$1')
    .replace(/([,;:])\1+/g, '$1').trim();
}

/** The chapter's text block of a bible.com page: from the first ChapterContent element to the copyright line. */
export function contentSlice(html, key) {
  const first = html.indexOf('ChapterContent-module');
  const end = html.indexOf('version-copyright', first);
  if (first < 0 || end < 0) throw new Error(`${key}: no chapter text block in the page`);
  return html.slice(html.lastIndexOf('<', first), html.lastIndexOf('<', end));
}

async function chapter(usfm, chNum) {
  const key = `${usfm}.${chNum}`;
  const file = path.join(CACHE_DIR, key + '.html');
  if (!fs.existsSync(file)) {
    if (OFFLINE) throw new Error(`${key} is not in ${CACHE_DIR} (--offline)`);
    let block;
    for (let attempt = 1; ; attempt++) {
      // A busy server can answer 200 with a page that has no chapter in it: that is retried too.
      try { block = contentSlice(await get(`https://www.bible.com/bible/149/${key}.RVR1960`), key); break; }
      catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
    fs.writeFileSync(file, block, 'utf8');
  }
  const verses = parseChapter(fs.readFileSync(file, 'utf8'), key);
  if (!Object.keys(verses).length) throw new Error(`${key}: no verses found in the page`);
  return verses;
}

async function main() {
  const reference = vm.runInNewContext(fs.readFileSync(REF_PATH, 'utf8') + '\n;BIBLE_KJV');
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const jobs = [];
  for (const [usfm, bookId] of BOOKS) {
    if (!reference[bookId]) throw new Error(`the KJV reference has no book ${bookId}`);
    for (const chNum of Object.keys(reference[bookId])) jobs.push({ usfm, bookId, chNum });
  }
  // A few pages at a time: 1,189 fetches on the first run, none after.
  const pages = new Array(jobs.length);
  let next = 0;
  let fetched = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < jobs.length) {
      const i = next++;
      pages[i] = await chapter(jobs[i].usfm, jobs[i].chNum);
      if (++fetched % 100 === 0) process.stdout.write(`  ${fetched}/${jobs.length} chapters\n`);
    }
  }));

  const result = {};
  const problems = [];
  let total = 0;
  jobs.forEach(({ bookId, chNum }, i) => {
    const verses = { ...pages[i] };
    const joins = JOIN_INTO_PREVIOUS[`${bookId} ${chNum}`] || {};
    for (const [extra, into] of Object.entries(joins)) {
      if (!verses[extra] || !verses[into]) { problems.push(`${bookId} ${chNum}: expected verses ${into} and ${extra} to join`); continue; }
      verses[into] = verses[into] + ' ' + verses[extra];
      delete verses[extra];
    }
    const want = reference[bookId][chNum].map((v) => v.n);
    const have = Object.keys(verses).map(Number).sort((a, b) => a - b);
    const missing = want.filter((n) => !verses[n]);
    const extra = have.filter((n) => !want.includes(n));
    if (missing.length) problems.push(`${bookId} ${chNum}: missing ${missing.join(',')}`);
    if (extra.length) problems.push(`${bookId} ${chNum}: extra ${extra.join(',')}`);
    if (!result[bookId]) result[bookId] = {};
    result[bookId][chNum] = want.filter((n) => verses[n]).map((n) => ({ n, text: verses[n] }));
    total += result[bookId][chNum].length;
  });
  if (problems.length) {
    console.error(`\nFATAL: the verse set differs from the KJV reference:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  fs.writeFileSync(OUT_PATH, `var BIBLE_RVR = ${JSON.stringify(result)};\n`, 'utf8');
  const kb = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`\nDone. ${BOOKS.length} books, ${jobs.length} chapters, ${total} verses, ${kb} KB -> ${OUT_PATH}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
  });
}
