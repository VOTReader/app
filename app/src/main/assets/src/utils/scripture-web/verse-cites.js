/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/verse-cites — Search's "Letters that cite John 3:16" (FEAT1, bundle-d)

   src/data/verse-cites.js (written by tools/gen-scripture-web.mjs in the same
   run as the graph asset) holds the graph's own votCites rows and mirrors and
   each book's chapter lengths: ~119 KB raw, ~37 KB gzipped, against the
   graph's 693 KB. It is injected once, the first time a Bible reference
   result shows, never at boot. The answers come from vot-citations.js
   citationsForVerse over a graph made of just those rows, so Search and the
   Scripture Web cannot disagree (verse-cites.test.js holds them together).

   A verse reference counts the letters citing that verse; a range
   ("John 3:16-18") or a chapter ("John 3") the letters citing any verse in
   it. One row per letter, in reading order, opening at its first citation.
   ═══════════════════════════════════════════════════════════════════════ */

import { expandCites, citationsForVerse, COLLECTION_ORDER } from './vot-citations.js';

/** @type {Promise<any> | null} */
let _loading = null;

/** Inject src/data/verse-cites.js once; resolves with VERSE_CITES, or null when it cannot load. */
export function ensureVerseCites() {
  const w = /** @type {any} */ (typeof window !== 'undefined' ? window : globalThis);
  if (w.VERSE_CITES) return Promise.resolve(w.VERSE_CITES);
  if (_loading) return _loading;
  if (typeof document === 'undefined') return Promise.resolve(null);
  _loading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'src/data/verse-cites.js';
    script.async = true;
    script.onload = () => resolve(w.VERSE_CITES || null);
    script.onerror = () => { _loading = null; resolve(null); };
    document.head.appendChild(script);
  });
  return _loading;
}

/** @type {WeakMap<object, any>} */
const GRAPHS = new WeakMap();
/** The graph citationsForVerse reads, from the file's rows (the asset's own, decoded the way decodeGraph does). @param {any} data */
export function citesGraph(data) {
  let g = GRAPHS.get(data);
  if (!g) {
    /** @type {Record<string, number>} */
    const rank = {};
    (data.votCites || []).forEach((/** @type {any} */ row, /** @type {number} */ i) => {
      const key = row.c === 'studies' ? 'study:' + row.sid + '/' + row.id : row.c + '/' + row.id;
      if (!(key in rank)) rank[key] = i;
    });
    g = { votEdges: expandCites(data.votCites), mirrors: data.mirrors || {}, rank };
    GRAPHS.set(data, g);
  }
  return g;
}

/**
 * The graph's verse id of a verse (0 = Genesis 1:1), or -1 when the book, chapter or verse is not there.
 * @param {any} data @param {string} bookId @param {number} chapter @param {number} verse
 */
export function verseIdOf(data, bookId, chapter, verse) {
  const b = data && Array.isArray(data.books) ? data.books.indexOf(bookId) : -1;
  if (b < 0) return -1;
  const lens = data.verses[b] || [];
  if (!(chapter >= 1 && chapter <= lens.length && verse >= 1 && verse <= lens[chapter - 1])) return -1;
  let id = 0;
  for (let i = 0; i < b; i++) for (const n of data.verses[i]) id += n;
  for (let c = 0; c < chapter - 1; c++) id += lens[c];
  return id + verse - 1;
}

/**
 * The letters citing a verse, a range in one chapter (verseEnd), or a whole chapter (no verse):
 * one per letter in reading order (collection, then its place), each with its first citation
 * (the one a tap opens) and how many places in it cite the passage.
 * @param {any} data VERSE_CITES
 * @param {{ bookId: string, chapter: number, verse?: number | null, verseEnd?: number | null }} ref
 * @param {any} [corpus] a CitationCorpus (windowCorpus()) for the citing sentences
 * @returns {Array<{ letterKey: string, title: string, collectionName: string, first: any, places: number }>}
 */
export function lettersCiting(data, ref, corpus) {
  if (!data || !ref || !ref.bookId || !(ref.chapter >= 1)) return [];
  const b = data.books.indexOf(ref.bookId);
  const len = b >= 0 ? (data.verses[b] || [])[ref.chapter - 1] || 0 : 0;
  if (!len) return [];
  const from = ref.verse >= 1 ? Math.min(ref.verse, len) : 1;
  const to = ref.verse >= 1 ? Math.min(Math.max(ref.verseEnd || ref.verse, from), len) : len;
  const g = citesGraph(data);
  const start = verseIdOf(data, ref.bookId, ref.chapter, from);
  /** @type {Map<string, any>} */
  const byLetter = new Map();
  /** @type {Set<string>} */
  const places = new Set();
  for (let id = start; id <= start + (to - from); id++) {
    for (const c of citationsForVerse(g, id, corpus || null)) {
      const place = c.letterKey + '#' + c.paragraph + (c.sub ? ':' + c.sub.join(':') : '');
      if (places.has(place)) continue;
      places.add(place);
      const got = byLetter.get(c.letterKey);
      if (!got) byLetter.set(c.letterKey, { letterKey: c.letterKey, title: c.title, collectionName: c.collectionName, collection: c.collection, first: c, places: 1 });
      else {
        got.places++;
        if (c.paragraph < got.first.paragraph) got.first = c;
      }
    }
  }
  const order = (/** @type {string} */ col) => { const i = COLLECTION_ORDER.indexOf(col); return i < 0 ? COLLECTION_ORDER.length : i; };
  const rank = (/** @type {string} */ k) => (k in g.rank ? g.rank[k] : Infinity);
  return [...byLetter.values()]
    .sort((x, y) => order(x.collection) - order(y.collection) || rank(x.letterKey) - rank(y.letterKey))
    .map(({ collection: _c, ...l }) => l);
}
