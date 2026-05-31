/* READ-ONLY helper: print the repo's own NKJV (books.js) for a verse range,
   each verse prefixed with its "N." marker — the reference for placing verse
   markers into marker-less footnote values. Usage:
     node tools/nkjv-verses.js "Proverbs 2:12-18" "Genesis 2:21-24" ...
   Not wired into any gate. */

import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets', 'src', 'data');
const sandbox = {};
runInNewContext(readFileSync(resolve(dataDir, 'books.js'), 'utf-8'), sandbox);
runInNewContext(readFileSync(resolve(dataDir, 'matthew-plain.js'), 'utf-8'), sandbox);
const BOOKS = sandbox.BOOKS;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const list = Array.isArray(BOOKS) ? BOOKS : Object.keys(BOOKS).map((k) => BOOKS[k]);
// Matthew is served separately (matthew-plain.js), not in books.js.
const mp = sandbox.MATTHEW_PLAIN;
if (mp) list.push(Array.isArray(mp) ? mp[0] : mp);

function findBook(name) {
  const want = norm(name);
  const alias = { psalm: 'psalms', song: 'songofsolomon', songofsongs: 'songofsolomon', revelations: 'revelation' };
  const w2 = alias[want] || want;
  for (const b of list) {
    if (!b) continue;
    if (norm(b.id || '') === w2 || norm(b.title || '') === w2) return b;
  }
  return null;
}
function chapterVerses(book, chapNum) {
  const ch = (book.chapters || []).find((c) => +c.num === +chapNum || +c.n === +chapNum);
  if (!ch) return [];
  if (Array.isArray(ch.verses)) return ch.verses;
  const out = [];
  (ch.sections || []).forEach((s) => (s.verses || []).forEach((v) => out.push(v)));
  return out;
}

for (const ref of process.argv.slice(2)) {
  const m = ref.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?/);
  console.log(`\n──── ${ref} ────`);
  if (!m) { console.log('  (unparseable ref)'); continue; }
  const bookName = m[1], chap = +m[2], start = +m[3], end = m[4] ? +m[4] : +m[3];
  const book = findBook(bookName);
  if (!book) { console.log(`  (book not found: ${bookName})`); continue; }
  const verses = chapterVerses(book, chap);
  const parts = [];
  for (let n = start; n <= end; n++) {
    const v = verses.find((x) => +x.n === n);
    parts.push(`${n}. ${v ? v.text : '*** MISSING ***'}`);
  }
  console.log('  ' + parts.join(' '));
}
