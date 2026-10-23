/* ═══════════════════════════════════════════════════════════════════════
   filters — what the reader keeps of the web, and the rest as a ghost
   Cluster F (bundle-d): read by the renderer, the picker and the overlay.
   ═══════════════════════════════════════════════════════════════════════

   Corbin, 2026-10-22: "should be able to tap the prophecy full filled legend
   que and filter out everything else. Maybe should add various kinds of nice
   filters to explore". He chose the mix of the three mockups
   (lanes/sweb/out/mockups/filters/r1-*): the legend's cues are chips that
   filter at a tap, a Filters sheet holds the rest, and a pill at the top
   names what is on.

   A filter KEEPS threads; the rest stay on screen as a ghost (FILTER_GHOST of
   their ink), so the reader keeps their bearings. Kinds combine (all must
   pass):
     distance   a third of the threads by the colour scale (geometry.spanT):
                nearby (about a book apart or less), middle, far
     cited      a foot on a verse the Volumes cite (graph.votEdges)
     prophecy   the Bible Studies' prophecy pairs only (graph.prophecy): no
                OpenBible thread is kept, the pairs that pass are drawn gold
     testament  Old to Old, Old to New, New to New
     book       a foot in one book, or one in each of two
     strength   readers' votes: strong 50 or more, strongest 100 or more

   The masks are held per graph (setFilterMasks) so the picker, the overlay
   and the renderer read the one answer: the renderer still draws a ghost (it
   is in the frame's visible set), but the picker, the label feeds and the
   badge counts skip it, so a ghost is never tapped, labelled or counted. */

import { spanT } from './geometry.js';

/** A ghost thread's share of its ink. */
export const FILTER_GHOST = 0.08;

/** The distance bands, on geometry.spanT: each holds about a third of the asset's threads (0.26 is
 *  about 1,070 verses apart, 0.51 about 5,800). */
export const DISTANCE_BANDS = Object.freeze({ all: [0, 1], near: [0, 0.26], middle: [0.26, 0.51], far: [0.51, 1] });

/** Readers' votes a strength filter keeps from (the asset's 63,418: 4,132 have 50 or more, 1,278 have 100). */
export const STRENGTH_VOTES = Object.freeze({ all: 0, strong: 50, strongest: 100 });

/**
 * @typedef {{ distance: 'all'|'near'|'middle'|'far', cited: boolean, prophecy: boolean,
 *   testament: 'all'|'oo'|'on'|'nn', fromBook: number, toBook: number,
 *   strength: 'all'|'strong'|'strongest' }} WebFilters
 *   distance: a DISTANCE_BANDS key; fromBook / toBook: book indexes into graph.books, -1 for any
 */

/** @type {WebFilters} */
export const NO_FILTERS = Object.freeze({
  distance: 'all', cited: false, prophecy: false, testament: 'all', fromBook: -1, toBook: -1, strength: 'all',
});

/** @param {WebFilters | null | undefined} f */
export function filtersOn(f) {
  if (!f) return false;
  return f.distance !== 'all' || f.cited || f.prophecy || f.testament !== 'all'
    || f.fromBook >= 0 || f.toBook >= 0 || f.strength !== 'all';
}

/**
 * The filters as the pill and the chips name them, in the sheet's order.
 * @param {any} g @param {WebFilters} f
 * @returns {Array<{ key: string, label: string }>}
 */
export function filterLabels(g, f) {
  /** @type {Array<{ key: string, label: string }>} */
  const out = [];
  if (!f) return out;
  if (f.prophecy) out.push({ key: 'prophecy', label: 'Prophecy fulfilled' });
  if (f.cited) out.push({ key: 'cited', label: 'Cited in the Volumes' });
  if (f.distance !== 'all') out.push({ key: 'distance', label: DISTANCE_LABEL[f.distance] });
  if (f.testament !== 'all') out.push({ key: 'testament', label: TESTAMENT_LABEL[f.testament] });
  const book = (/** @type {number} */ b) => (g && g.books && g.books[b] ? g.books[b].title : '');
  if (f.fromBook >= 0 && f.toBook >= 0) out.push({ key: 'book', label: book(f.fromBook) + ' and ' + book(f.toBook) });
  else if (f.fromBook >= 0 || f.toBook >= 0) out.push({ key: 'book', label: book(f.fromBook >= 0 ? f.fromBook : f.toBook) });
  if (f.strength !== 'all') out.push({ key: 'strength', label: f.strength === 'strong' ? 'Strong links' : 'Strongest links' });
  return out;
}

/** @type {Record<string, string>} */
export const DISTANCE_LABEL = { all: 'All', near: 'Nearby', middle: 'Middle distance', far: 'Far' };

/** @type {Record<string, string>} */
export const TESTAMENT_LABEL = { all: 'All', oo: 'Old to Old', on: 'Old to New', nn: 'New to New' };

/**
 * The first verse of the New Testament (Matthew's first), or the canon's end.
 * @param {any} g
 */
export function newTestamentStart(g) {
  const books = (g && g.books) || [];
  return books.length > 39 ? books[39].start : (g && g.total) || 0;
}

/** @param {any} g @param {number} v  the book a verse is in */
const bookOf = (g, v) => g.chapters[g.chapterOfVerse[v]][0];

const CITED = new WeakMap();
/** The verses the Volumes cite (graph.votEdges), as a mask over the canon, cached per graph. @param {any} g */
export function citedVerses(g) {
  let m = CITED.get(g);
  if (m) return m;
  m = new Uint8Array(g.total || 0);
  for (const e of g.votEdges || []) {
    const hi = e.ve > e.v ? e.ve : e.v;
    for (let v = e.v; v <= hi && v < m.length; v++) if (v >= 0) m[v] = 1;
  }
  CITED.set(g, m);
  return m;
}

/**
 * Whether one pair of verses passes every filter but `prophecy` (which picks the kind, not the pair).
 * @param {any} g @param {WebFilters} f @param {number} a @param {number} b  verse ids, either order
 * @param {number} votes  readers' votes (a prophecy pair has none and is not held to strength)
 * @param {number} nt  newTestamentStart
 * @param {Uint8Array | null} cited  citedVerses, when the cited filter is on
 */
function passes(g, f, a, b, votes, nt, cited) {
  const lo = a < b ? a : b, hi = a < b ? b : a;
  if (f.distance !== 'all') {
    const band = DISTANCE_BANDS[f.distance], t = spanT(hi - lo, g.total);
    if (t < band[0] || t > band[1]) return false;
  }
  if (cited && !cited[lo] && !cited[hi]) return false;
  if (f.testament !== 'all') {
    const nLo = lo >= nt, nHi = hi >= nt;
    if (f.testament === 'oo' ? (nLo || nHi) : f.testament === 'nn' ? !(nLo && nHi) : (nLo || !nHi)) return false;
  }
  if (f.fromBook >= 0 || f.toBook >= 0) {
    const ba = bookOf(g, lo), bb = bookOf(g, hi);
    if (f.fromBook >= 0 && f.toBook >= 0) {
      if (!((ba === f.fromBook && bb === f.toBook) || (ba === f.toBook && bb === f.fromBook))) return false;
    } else {
      const want = f.fromBook >= 0 ? f.fromBook : f.toBook;
      if (ba !== want && bb !== want) return false;
    }
  }
  if (votes >= 0 && votes < (STRENGTH_VOTES[f.strength] || 0)) return false;
  return true;
}

let SERIAL = 0;

/**
 * The masks a set of filters makes: one byte a thread (1 kept) and one a prophecy pair, or null
 * for both when nothing is filtered.
 * @param {any} g @param {WebFilters} f
 * @param {{ count: number, from: Uint16Array, to: Uint16Array }} [pairs]  frame-set.prophecySet
 * @returns {FilterMasks | null}
 */
export function filterMasks(g, f, pairs) {
  if (!g || !filtersOn(f)) return null;
  const n = g.count || 0;
  const threads = new Uint8Array(n);
  const nt = newTestamentStart(g);
  const cited = f.cited ? citedVerses(g) : null;
  let kept = 0;
  if (!f.prophecy) {
    for (let i = 0; i < n; i++) {
      if (passes(g, f, g.from[i], g.to[i], g.votes[i], nt, cited)) { threads[i] = 1; kept++; }
    }
  }
  const np = pairs ? pairs.count : 0;
  const pairMask = new Uint8Array(np);
  let keptPairs = 0;
  for (let k = 0; k < np; k++) {
    // the pairs are the prophecy filter's own; with it off they follow the rest of the filters
    if (passes(g, f, pairs.from[k], pairs.to[k], -1, nt, cited)) { pairMask[k] = 1; keptPairs++; }
  }
  return { threads, pairs: pairMask, kept, keptPairs, serial: ++SERIAL };
}

/**
 * @typedef {{ threads: Uint8Array, pairs: Uint8Array, kept: number, keptPairs: number, serial: number }} FilterMasks
 *   threads: 1 a kept thread, by instance; pairs: 1 a kept prophecy pair, by index into g.prophecy;
 *   kept / keptPairs: how many; serial: new for every set of masks made (a cache's key)
 */

/* ── the masks in force, one set per graph ─────────────────────────────── */

const HELD = new WeakMap();

/**
 * Put a set of masks in force for a graph (null: nothing filtered).
 * @param {any} g @param {FilterMasks | null} masks
 */
export function setFilterMasks(g, masks) {
  if (!g) return;
  if (masks) HELD.set(g, masks); else HELD.delete(g);
}

/** The masks in force for a graph, or null. @param {any} g @returns {FilterMasks | null} */
export function filterMasksOf(g) {
  return (g && HELD.get(g)) || null;
}

/** The serial of the masks in force, 0 for none: a cache keyed on it is rebuilt when a filter changes. @param {any} g */
export function filterSerial(g) {
  const m = g && HELD.get(g);
  return m ? m.serial : 0;
}

/** Whether thread i is kept (always, with nothing filtered). @param {any} g @param {number} i */
export function kept(g, i) {
  const m = g && HELD.get(g);
  return !m || m.threads[i] === 1;
}

/** Whether prophecy pair k is kept. @param {any} g @param {number} k */
export function pairKept(g, k) {
  const m = g && HELD.get(g);
  return !m || m.pairs[k] === 1;
}
