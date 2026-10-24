/* ═══════════════════════════════════════════════════════════════════════
   edition-compare — one reference in every Bible edition on this device (n166)
   ═══════════════════════════════════════════════════════════════════════
   The scripture sheets show a reference in the NKJV. "Compare editions" adds
   the same verses as each other edition prints them, for the editions the
   reader already has: one in memory is read where it is; one on the device
   (the service worker's cache on the web, the APK's own assets) is read from
   its file, its verses taken and the ~32 MB object let go before the next
   (one at a time, never put on window, so nothing stays held); one not on
   the device is named on a quiet "Not downloaded" line and never fetched.
   Where the device cannot say (a page no worker controls), only the editions
   in memory show.
   ═══════════════════════════════════════════════════════════════════════ */

import { editionVerse } from '../data/translations.js';
import { OfflineEditions, editionCodes, editionUrl } from './offline-editions.js';
import { findBook, splitCompoundRef } from '../data/scripture-resolution.js';

/** The most verses one comparison reads per part (a whole-chapter cite is not compared). */
const MAX_VERSES = 12;

/**
 * @typedef {{ label: string, bookId: string, chapter: number, from: number, to: number }} ComparePart
 * @typedef {{ label: string, verses: { n: number, text: string | null }[] }[]} CompareText  one entry per part
 * @typedef {{ code: string, label: string, name: string, text: CompareText | null }} CompareRow  text null: still reading
 */

function _books() {
  const w = /** @type {any} */ (window);
  return w.__ALL_BOOKS || (typeof BOOKS !== 'undefined' ? BOOKS : null);
}

/** True once the NKJV Bible is on the page (findBook and the NKJV verses need it). */
export function bibleReady() { return !!_books(); }

/**
 * The verse parts of a cite: "Daniel 7:9; Revelation 1:14-16" → two parts. Chapter-only parts and unknown
 * books are left out; a long range is cut to its first MAX_VERSES verses.
 * @param {string} cite
 * @returns {ComparePart[]}
 */
export function compareParts(cite) {
  /** @type {ComparePart[]} */
  const out = [];
  for (const p of splitCompoundRef(cite)) {
    const q = p.parsed;
    if (!q || q.verse == null) continue;
    const bookId = findBook(q.rawBook);
    if (!bookId) continue;
    const to = Math.max(q.verse, Math.min(q.verseEnd || q.verse, q.verse + MAX_VERSES - 1));
    out.push({ label: p.ref, bookId, chapter: q.chapter, from: q.verse, to });
  }
  return out;
}

/** @param {string} bookId @param {number} chapter @param {number} n @returns {string | null} */
function _nkjvVerse(bookId, chapter, n) {
  const books = _books();
  const book = books && books[bookId];
  const ch = book && (book.chapters || []).find((/** @type {any} */ c) => c.num === chapter);
  if (!ch) return null;
  const verses = ch.sections ? ch.sections.flatMap((/** @type {any} */ s) => s.verses || []) : (ch.verses || []);
  const v = verses.find((/** @type {any} */ x) => x.n === n);
  return v && typeof v.text === 'string' && v.text.trim() ? v.text : null;
}

/**
 * The parts' verses in one edition.
 * @param {ComparePart[]} parts
 * @param {string} code
 * @param {Record<string, any>} [dataOf]
 * @returns {CompareText}
 */
export function compareText(parts, code, dataOf) {
  return parts.map((p) => {
    const verses = [];
    for (let n = p.from; n <= p.to; n++) {
      verses.push({ n, text: editionVerse(p.bookId, p.chapter, n, code, dataOf, _nkjvVerse(p.bookId, p.chapter, n)) });
    }
    return { label: p.label, verses };
  });
}

/**
 * An edition file's object, read without running it: every bible-<code>.js is one `var BIBLE_<CODE> = {…};`
 * (the overlays after a comment), and its object is JSON.
 * @param {string} src
 * @returns {any}
 */
export function parseEditionFile(src) {
  const m = /var BIBLE_[A-Z]+\s*=\s*/.exec(src);
  if (!m) throw new Error('not an edition file');
  return JSON.parse(src.slice(m.index + m[0].length, src.lastIndexOf('}') + 1));
}

function _android() {
  return typeof PlatformBridge !== 'undefined' && !!PlatformBridge && !!PlatformBridge.isAndroid;
}

/** @param {string} code */
function _baseOf(code) {
  const opts = typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS) ? TRANSLATION_OPTIONS : [];
  const o = opts.find((x) => x && x.id === code);
  return (o && o.base) || null;
}

/** @param {string} code */
function _inMemory(code) { return !!(/** @type {any} */ (window))['BIBLE_' + code.toUpperCase()]; }

/**
 * Which editions a comparison can show, in the picker's order, and which are not on the device. Reads the
 * offline store as it stands; the caller asks it to check first.
 * @returns {{ shown: string[], missing: string[] }}
 */
export function compareEditions() {
  const st = OfflineEditions.getState();
  const android = _android();
  const there = (/** @type {string} */ c) => _inMemory(c) || android || st.have.includes(c);
  const shown = [];
  const missing = [];
  for (const code of editionCodes()) {
    const base = _baseOf(code);
    if (there(code) && (!base || base === 'nkjv' || there(base))) shown.push(code);
    else if (st.missing.includes(code) || (base && st.missing.includes(base))) missing.push(code);
  }
  return { shown, missing };
}

/** Results by edition and cite, for the page's life: a second look is instant. @type {Map<string, CompareText>} */
const _done = new Map();

/** @param {string} code */
async function _readFile(code) {
  const res = await fetch(editionUrl(code));
  if (!res.ok) throw new Error('edition ' + code + ' ' + res.status);
  return parseEditionFile(await res.text());
}

/**
 * Read a cite in each shown edition, one edition at a time, calling `onRow` as each lands. An edition
 * file read here is dropped once its verses (and those of any overlay on it) are taken. `isLive` false
 * stops the run between editions.
 * @param {string} cite
 * @param {ComparePart[]} parts
 * @param {string[]} codes
 * @param {(code: string, text: CompareText | null) => void} onRow  text null: the edition could not be read
 * @param {() => boolean} [isLive]
 */
export async function readCompare(cite, parts, codes, onRow, isLive = () => true) {
  /** @type {Record<string, any>} */
  const borrowed = {};
  const later = (/** @type {number} */ i) => codes.slice(i + 1).map(_baseOf);
  for (let i = 0; i < codes.length; i++) {
    if (!isLive()) return;
    const code = codes[i];
    const key = code + '|' + cite;
    let text = _done.get(key) || null;
    if (!text) {
      try {
        const need = [code, _baseOf(code)].filter((c) => c && c !== 'nkjv' && !_inMemory(/** @type {string} */ (c)) && !borrowed[/** @type {string} */ (c)]);
        for (const c of /** @type {string[]} */ (need)) borrowed[c] = await _readFile(c);
        // An overlay over an edition in memory but not loaded through it (KJV-R over a freed KJV) reads the same.
        text = compareText(parts, code, borrowed);
        _done.set(key, text);
      } catch (_e) {
        text = null;
      }
    }
    for (const c of Object.keys(borrowed)) if (!later(i).includes(c)) delete borrowed[c];
    if (!isLive()) return;
    onRow(code, text);
  }
}

/** Tests only. */
export function _resetCompareForTests() { _done.clear(); }
