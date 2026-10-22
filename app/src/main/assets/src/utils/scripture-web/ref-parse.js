/* ═══════════════════════════════════════════════════════════════════════
   ref-parse — what the go-to's words name, on the web's own verse ids.
   Cluster F (bundle-d), used by ui/scripture-web/goto.jsx.
   The navigation stream owns this file (w3, spec section 4.5).
   ═══════════════════════════════════════════════════════════════════════

   NO NEW PARSER. The words go through the app's own reference parser
   (search/ref-parser.js parseReference, the search screen's, in its
   scriptures corpus): "John 3:16", "Isaiah 53", "Romans", "Gen 1:1",
   "jn 3 16", "1st cor 13", "Psalm 23:1-6", "Sermon on the Mount". This module
   only maps its answer onto the graph (a book id to g.books, a chapter to
   g.chapters, a verse to its id) and builds the box's rows from it. A book
   name not yet finished ("Ro", "1 jo") is completed from the same parser's
   own table (BOOK_ABBREVS in search-data.js), never from a list of its own.

   A place is one of:
     { kind: 'verse',   verse, lo, hi, chapterIndex, label }   lo === hi === verse
     { kind: 'range',   lo, hi, chapterIndex, label }          "John 3:16-18", "Matthew 5-7"
     { kind: 'chapter', lo, hi, chapterIndex, label }
     { kind: 'book',    lo, hi, book, label }
   lo and hi are verse ids, inclusive. Labels use the ASCII hyphen (Permanent Rule 1). */

import { parseReference } from '../../search/ref-parser.js';
import { searchData } from '../../search/search-data.js';
import { refOfVerse, chapterRange, arcsTouching } from './pick.js';
import { verseTextFor } from './describe.js';

/**
 * @typedef {{ kind: 'verse'|'range'|'chapter'|'book', lo: number, hi: number, label: string,
 *   verse?: number, chapterIndex?: number, book?: number }} Place
 * @typedef {{ key: string, label: string, sub: string, text: string, place: Place }} GoToRow
 *   label  "John 3:16"; sub: " · whole chapter" names a chapter or book row; text: the verse's
 *   own words when the Bible has landed (the row's preview after " - ")
 */

/**
 * The graph's book for an app book id: the parser and the reader say "matthew" for Matthew, and
 * the web's plain-Bible Matthew is "matthew-plain" (as the search engine maps it).
 * @param {any} g
 * @param {string | null | undefined} bookId
 * @returns {number} index into g.books, or -1
 */
export function bookIndexOf(g, bookId) {
  if (!g || !g.books || !bookId) return -1;
  const id = String(bookId);
  let i = g.books.findIndex((b) => b.id === id);
  if (i < 0) i = g.books.findIndex((b) => b.id === id + '-plain');
  if (i < 0 && id.endsWith('-plain')) i = g.books.findIndex((b) => b.id === id.slice(0, -6));
  return i;
}

/** A chapter's index in g.chapters, or -1. */
export function chapterIndexOf(g, book, chapter) {
  if (!g || !(book >= 0) || !(chapter >= 1)) return -1;
  return g.chapters.findIndex((c) => c[0] === book && c[1] === chapter);
}

/** A book's verse ids, first and last, inclusive; null for a book with no chapters. */
export function bookSpan(g, book) {
  let lo = -1, hi = -1;
  for (let ci = 0; ci < g.chapters.length; ci++) {
    const c = g.chapters[ci];
    if (c[0] !== book) { if (lo >= 0) break; continue; }
    if (lo < 0) lo = c[2];
    hi = c[2] + c[3] - 1;
  }
  return lo < 0 ? null : [lo, hi];
}

/**
 * The place a verse id is.
 * @param {any} g
 * @param {number} v
 * @returns {Place}
 */
export function versePlace(g, v) {
  const r = refOfVerse(g, v);
  return { kind: 'verse', verse: v, lo: v, hi: v, chapterIndex: r.chapterIndex, label: r.label };
}

/**
 * The place a chapter index is.
 * @param {any} g
 * @param {number} ci
 * @returns {Place}
 */
export function chapterPlace(g, ci) {
  const [lo, hi] = chapterRange(g, ci);
  const c = g.chapters[ci];
  return { kind: 'chapter', lo, hi, chapterIndex: ci, label: g.books[c[0]].title + ' ' + c[1] };
}

/**
 * The place a book index is, or null.
 * @param {any} g
 * @param {number} book
 * @returns {Place | null}
 */
export function bookPlace(g, book) {
  const span = book >= 0 && book < g.books.length ? bookSpan(g, book) : null;
  return span ? { kind: 'book', lo: span[0], hi: span[1], book, label: g.books[book].title } : null;
}

/**
 * The place a parsed reference names, on this graph; null when it is not a Bible place the web
 * holds (a text query, a chapter past the book's end).
 * @param {any} g
 * @param {any} r  parseReference's answer
 * @returns {Place | null}
 */
export function placeOfRef(g, r) {
  if (!g || !r) return null;
  if (r.kind !== 'ref-bible' && r.kind !== 'ref-book' && r.kind !== 'named-passage') return null;
  const bi = bookIndexOf(g, r.bookId);
  if (bi < 0) return null;
  const title = g.books[bi].title;
  if (r.kind === 'ref-book') return bookPlace(g, bi);
  const ci = chapterIndexOf(g, bi, r.chapter);
  if (ci < 0) return null;
  const [clo, chi] = chapterRange(g, ci);
  const vs = r.verseStart || null, ve = r.verseEnd || null;
  if (r.chapterEnd && r.chapterEnd > r.chapter) {
    const ce = chapterIndexOf(g, bi, r.chapterEnd);
    if (ce < 0) return null;
    const [elo, ehi] = chapterRange(g, ce);
    const lo = vs ? Math.min(chi, clo + vs - 1) : clo;
    const hi = ve ? Math.min(ehi, elo + ve - 1) : ehi;
    const label = r.kind === 'named-passage' ? passageLabel(title, r)
      : title + ' ' + r.chapter + (vs ? ':' + vs : '') + '-' + r.chapterEnd + (ve ? ':' + ve : '');
    return { kind: 'range', lo, hi, chapterIndex: ci, label };
  }
  if (vs) {
    const v = clo + vs - 1;
    if (v > chi) return null;
    if (ve && ve > vs) {
      return { kind: 'range', lo: v, hi: Math.min(chi, clo + ve - 1), chapterIndex: ci,
        label: title + ' ' + r.chapter + ':' + vs + '-' + Math.min(ve, chi - clo + 1) };
    }
    return versePlace(g, v);
  }
  return chapterPlace(g, ci);
}

/** A named passage's label as the web says it: "Matthew 5-7", "Psalms 23". */
function passageLabel(title, r) {
  return title + ' ' + r.chapter + (r.verseStart ? ':' + r.verseStart : '')
    + (r.chapterEnd && r.chapterEnd !== r.chapter ? '-' + r.chapterEnd + (r.verseEnd ? ':' + r.verseEnd : '') : r.verseEnd ? '-' + r.verseEnd : '');
}

/**
 * The books whose names begin as typed (a name not yet finished), in canon order, read from the
 * parser's own name table. Empty for anything with a digit after the name's first letter.
 * @param {any} g
 * @param {string} typed
 * @returns {number[]} book indices
 */
export function booksStarting(g, typed) {
  const t = String(typed || '').toLowerCase().replace(/\s+/g, '');
  if (!g || !/^[123]?[a-z]{1,}$/.test(t)) return [];
  const table = searchData().BOOK_ABBREVS || {};
  const found = new Set();
  for (const k of Object.keys(table)) {
    if (k.replace(/\s+/g, '').startsWith(t)) {
      const bi = bookIndexOf(g, table[k]);
      if (bi >= 0) found.add(bi);
    }
  }
  return Array.from(found).sort((a, b) => a - b);
}

/** How many drawn threads touch each verse of [lo, hi], in one pass. */
function countsIn(g, lo, hi, density) {
  const n = new Int32Array(hi - lo + 1);
  for (const i of arcsTouching(g, lo, hi, density, 0)) {
    const a = g.from[i], b = g.to[i];
    if (a >= lo && a <= hi) n[a - lo]++;
    if (b >= lo && b <= hi && b !== a) n[b - lo]++;
  }
  return n;
}

/** A row for a place: its label, whether it is a whole chapter or book, the verse's words. */
export function rowOf(g, place) {
  let sub = '', text = '';
  if (place.kind === 'chapter') sub = 'whole chapter';
  else if (place.kind === 'book') sub = 'whole book';
  else {
    const r = refOfVerse(g, place.lo);
    text = verseTextFor({ bookId: r.bookId, chapter: r.chapter, verse: r.verse });
  }
  return { key: place.kind + ':' + place.lo + '-' + place.hi, label: place.label, sub, text, place };
}

/**
 * The go-to's rows for what is typed, live: the place it names first (the row Enter takes), then
 * where it is probably going - for a verse, the chapter's verses that begin with the typed number,
 * the most connected first, and the whole chapter last; for a chapter, its most connected verses;
 * for a book, its most connected chapters; for a book name not finished, the books it begins.
 * @param {any} g
 * @param {string} query
 * @param {{ density?: any, limit?: number }} [opts]  limit: 5 on PC, 3 on the phone
 * @returns {GoToRow[]}
 */
export function goToRows(g, query, opts) {
  const limit = (opts && opts.limit) || 5;
  const density = (opts && opts.density) || 'famous';
  const q = String(query || '').trim();
  if (!g || !g.chapters || !q) return [];
  const rows = [];
  const seen = new Set();
  const add = (place) => {
    if (!place || rows.length >= limit) return;
    const row = rowOf(g, place);
    if (seen.has(row.key)) return;
    seen.add(row.key);
    rows.push(row);
  };
  const r = parseReference(q, { corpus: 'scriptures' });
  const place = placeOfRef(g, r);
  if (!place) {
    for (const bi of booksStarting(g, q)) add(bookPlace(g, bi));
    return rows;
  }
  add(place);
  if (place.kind === 'verse' && r && r.verseStart && !r.verseEnd) {
    // "John 3:1": 3:1 itself, then 3:10-3:19 by how connected they are, then John 3
    const ci = /** @type {number} */ (place.chapterIndex);
    const [lo, hi] = chapterRange(g, ci);
    const typed = String(r.verseStart);
    const n = countsIn(g, lo, hi, density);
    const more = [];
    for (let v = lo; v <= hi; v++) {
      const num = String(v - lo + 1);
      if (num !== typed && num.startsWith(typed)) more.push(v);
    }
    more.sort((a, b) => (n[b - lo] - n[a - lo]) || (a - b));
    for (const v of more.slice(0, Math.max(0, limit - 2))) add(versePlace(g, v));
    add(chapterPlace(g, ci));
  } else if (place.kind === 'chapter' || place.kind === 'range') {
    const n = countsIn(g, place.lo, place.hi, density);
    const top = [];
    for (let v = place.lo; v <= place.hi; v++) if (n[v - place.lo] > 0) top.push(v);
    top.sort((a, b) => (n[b - place.lo] - n[a - place.lo]) || (a - b));
    for (const v of top) add(versePlace(g, v));
  } else if (place.kind === 'book') {
    const per = new Map();
    for (const i of arcsTouching(g, place.lo, place.hi, density, 0)) {
      for (const v of [g.from[i], g.to[i]]) {
        if (v >= place.lo && v <= place.hi) {
          const ci = g.chapterOfVerse[v];
          per.set(ci, (per.get(ci) || 0) + 1);
        }
      }
    }
    const chapters = Array.from(per.keys()).sort((a, b) => (per.get(b) - per.get(a)) || (a - b));
    for (const ci of chapters) add(chapterPlace(g, ci));
  }
  return rows;
}

/**
 * Where the camera frames a place (flyTo's { x0, x1 }, canon x; a verse v spans [v, v + 1)): a
 * book fills the canvas area, a chapter or a range about 70 % of it, and a verse the five
 * chapters around it, centred on the verse (spec section 4.5). A deviation the camera makes, not
 * this frame: flyTo clamps the zoom at the ceiling (44 CSS px a verse, geometry.js maxZoomFor), so
 * a chapter shorter than about 0.7 x width / 44 verses (22 at 1366 px) lands at the ceiling,
 * centred, smaller than 70 % (CONTRACTS.md ledger; pinned in goto.test.jsx).
 * @param {any} g
 * @param {Place} place
 * @returns {{ x0: number, x1: number }}
 */
export function frameOf(g, place) {
  if (place.kind === 'book') return { x0: place.lo, x1: place.hi + 1 };
  if (place.kind === 'verse') {
    const ci = /** @type {number} */ (place.chapterIndex);
    const first = Math.max(0, ci - 2), last = Math.min(g.chapters.length - 1, ci + 2);
    const span = chapterRange(g, last)[1] + 1 - chapterRange(g, first)[0];
    const mid = place.lo + 0.5;
    return { x0: mid - span / 2, x1: mid + span / 2 };
  }
  const span = place.hi + 1 - place.lo;
  const pad = span * (1 / 0.7 - 1) / 2;
  return { x0: place.lo - pad, x1: place.hi + 1 + pad };
}

/**
 * The place a `start` prop names (CONTRACTS.md section 8), or a letter to open; null when the
 * web holds no such place.
 * @param {any} g
 * @param {any} start  { verse: { bookId, chapter, verse } } | { book, chapter? } | { letterKey }
 * @returns {Place | { kind: 'letter', letterKey: string } | null}
 */
export function startPlace(g, start) {
  if (!g || !start) return null;
  if (start.letterKey) return { kind: 'letter', letterKey: String(start.letterKey) };
  if (start.verse) {
    const s = start.verse;
    const ci = chapterIndexOf(g, bookIndexOf(g, s.bookId), Number(s.chapter));
    if (ci < 0) return null;
    const [lo, hi] = chapterRange(g, ci);
    const v = lo + Math.max(1, Number(s.verse) || 1) - 1;
    return v <= hi ? versePlace(g, v) : chapterPlace(g, ci);
  }
  if (start.book) {
    const bi = bookIndexOf(g, start.book);
    if (bi < 0) return null;
    if (start.chapter) {
      const ci = chapterIndexOf(g, bi, Number(start.chapter));
      if (ci >= 0) return chapterPlace(g, ci);
    }
    return bookPlace(g, bi);
  }
  return null;
}

/**
 * A reader's reference as the web's start (the doors in: a footnote's "Isaiah 13:11", a sheet's
 * cite), read by the app's own parser: its first passage (a compound's tail and a translation tag
 * read past), as a verse, or a chapter, or a book. Null when it names no Bible place.
 * @param {string | null | undefined} refStr
 * @returns {{ verse: { bookId: string, chapter: number, verse: number } } | { book: string, chapter?: number } | null}
 */
export function webStartOfRef(refStr) {
  // Permanent Rule 1: a range's dash is a hyphen before anything parses it
  const first = String(refStr || '').replace(/[\u2013\u2014]/g, '-').split(/[;,]/)[0]
    .replace(/\([^)]*\)/g, ' ').trim();
  if (!first) return null;
  const r = parseReference(first, { corpus: 'scriptures' });
  if (!r || !r.bookId) return null;
  if (r.kind === 'ref-book') return { book: r.bookId };
  if (r.kind !== 'ref-bible' || !r.chapter) return null;
  return r.verseStart
    ? { verse: { bookId: r.bookId, chapter: r.chapter, verse: r.verseStart } }
    : { book: r.bookId, chapter: r.chapter };
}
