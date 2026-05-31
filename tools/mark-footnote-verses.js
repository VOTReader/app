/* ONE-TIME data normalization: insert "N." verse markers into marker-less
   footnote scripture values, sourcing the verse BOUNDARIES from the repo's own
   NKJV (books.js). It NEVER changes a word — it only inserts markers, and
   asserts that the marked value with its inserted markers stripped is byte-for-
   byte the original. Any value whose text doesn't line up with the NKJV is
   SKIPPED + reported (handled manually). Review `git diff` before trusting.

   Usage: node tools/mark-footnote-verses.js          (dry run — prints plan)
          node tools/mark-footnote-verses.js --write  (rewrites the data files) */

import { readFileSync, writeFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets', 'src', 'data');
const WRITE = process.argv.includes('--write');

const sandbox = {};
runInNewContext(readFileSync(resolve(dataDir, 'books.js'), 'utf-8'), sandbox);
const BOOKS = sandbox.BOOKS;
const bookList = Array.isArray(BOOKS) ? BOOKS : Object.keys(BOOKS).map((k) => BOOKS[k]);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
function findBook(name) {
  const alias = { psalm: 'psalms', revelations: 'revelation' };
  const w = alias[norm(name)] || norm(name);
  return bookList.find((b) => b && (norm(b.id || '') === w || norm(b.title || '') === w)) || null;
}
function nkjvVerses(book, chap) {
  const ch = (book.chapters || []).find((c) => +c.num === +chap || +c.n === +chap);
  if (!ch) return [];
  if (Array.isArray(ch.verses)) return ch.verses;
  const out = [];
  (ch.sections || []).forEach((s) => (s.verses || []).forEach((v) => out.push(v)));
  return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The marker-less multi-verse footnote values to normalize (NKJV only). */
const WORKLIST = {
  'volume-two.js': [
    'Proverbs 2:12-18', 'Revelation 13:16-17', '1 Corinthians 5:7-8', 'John 1:10-11',
    '1 Corinthians 3:13-15', 'Psalm 50:3-4', 'John 15:1-2', 'Revelation 6:16-17',
    'Matthew 16:24-26', 'Matthew 10:37-38', 'Luke 3:23-38',
  ],
  'wtlb-scriptures.js': [
    'Luke 15:11-32', 'Genesis 2:21-24', 'Colossians 3:9-10', 'Numbers 6:24-26',
    'Matthew 18:3-4', 'John 9:6-7', 'Matthew 24:32-34', 'Ecclesiastes 9:2-3',
    'Matthew 11:28-30', 'Isaiah 26:20-21', 'Psalm 40:7-8',
  ],
};

/** Insert "N." markers into `value` at NKJV verse boundaries. Returns the
 *  marked string, or null if the text can't be aligned to the NKJV. */
function mark(ref, value) {
  const m = ref.match(/^(.+?)\s+(\d+):(\d+)-(\d+)$/);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  const verses = nkjvVerses(book, +m[2]);
  const start = +m[3], end = +m[4];
  const inserts = [{ pos: 0, n: start }];
  let from = 0;
  for (let n = start + 1; n <= end; n++) {
    const v = verses.find((x) => +x.n === n);
    if (!v) return null;
    // First ~6 words of NKJV verse n, leading non-word chars stripped, matched
    // flexibly (case-insensitive, any whitespace) somewhere after the prior verse.
    // First ~6 alphanumeric tokens of NKJV verse n, joined by "any non-word"
    // and matched case-insensitively — robust to punctuation/quote/case diffs.
    const tokens = v.text.split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 6).map(esc);
    const rx = new RegExp(tokens.join('[^A-Za-z0-9]+'), 'i');
    const sub = value.slice(from);
    const hit = sub.search(rx);
    if (hit < 0) return null;
    let pos = from + hit;
    // The marker goes BEFORE any opening quote the verse begins with, so the
    // quote stays in the verse's text and the marker stays whitespace-preceded
    // (Strategy 0's lookbehind is whitespace-only by design).
    while (pos > 0 && /[“‘"'(]/.test(value[pos - 1])) pos--;
    inserts.push({ pos, n });
    from = pos + 1;
  }
  // Build marked string by splicing inserts (back to front so positions hold).
  let out = value;
  for (let i = inserts.length - 1; i >= 0; i--) {
    const { pos, n } = inserts[i];
    out = out.slice(0, pos) + `${n}. ` + out.slice(pos);
  }
  // SAFETY: stripping the markers we inserted must reproduce the original exactly.
  let stripped = out;
  for (let n = start; n <= end; n++) stripped = stripped.replace(`${n}. `, '');
  if (stripped !== value) return null;
  return out;
}

let marked = 0, skipped = 0;
for (const file of Object.keys(WORKLIST)) {
  const path = resolve(dataDir, file);
  let text = readFileSync(path, 'utf-8');
  for (const ref of WORKLIST[file]) {
    let anchor = `"${ref}": "`;          // Format A letters: "ref": "value"
    let i = text.indexOf(anchor);
    if (i < 0) { anchor = `"${ref}":"`; i = text.indexOf(anchor); } // WTLB: "ref":"value"
    if (i < 0) { console.log(`SKIP (key not found): [${file}] ${ref}`); skipped++; continue; }
    const vStart = i + anchor.length;
    // Closing quote = first " not preceded by a backslash (some values carry \" inside).
    let vEnd = vStart;
    while (vEnd < text.length && !(text[vEnd] === '"' && text[vEnd - 1] !== '\\')) vEnd++;
    const value = text.slice(vStart, vEnd);
    const out = mark(ref, value);
    if (!out) { console.log(`SKIP (no NKJV alignment): [${file}] ${ref}`); skipped++; continue; }
    text = text.slice(0, vStart) + out + text.slice(vEnd);
    console.log(`MARK: [${file}] ${ref}  →  ${out.slice(0, 70)}…`);
    marked++;
  }
  if (WRITE) writeFileSync(path, text, 'utf-8');
}
console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} — marked ${marked}, skipped ${skipped}`);
