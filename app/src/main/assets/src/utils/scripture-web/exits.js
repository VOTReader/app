/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/exits — where a column's lines go. Cluster F (bundle-d)
   ═══════════════════════════════════════════════════════════════════════

   Deep in, most of what the frame holds is legs: threads with one foot on
   the canvas area and the other off it, in another chapter or another book
   (the curtain: at Isaiah 50-57 on a PC, 1,705 of the 1,814 threads drawn).
   Every thread is the half-ellipse of its own span (the structure law), so
   a leg cannot be bent, cut or hidden to make room; what it can be is READ.
   A "+n" pill's fan names where the legs standing on its cell go, by the
   book (or the run of books) their far foot stands in, with how many:
   earlier books on the left, later ones on the right, the nearest lowest.

   This file is the census, pure: the overlay paints it (overlay-renderer.js
   drawFan), the panel lists it (panel-model.js exitsModel), and the tests
   can hold it without a canvas. It runs only while a fan is up: the
   overlay asks it for the cell of focus.ask, and nothing else calls it.

   A leg is a thread of the frame's visible set (frame-set.js, E1: exactly
   what is drawn) with ONE foot inside [0, Wc], the canvas area the open
   panel leaves; its far foot is the other one. A thread with both feet in
   the area (a dome) or neither (a fly-over) is no exit. A foot under the
   open panel is off the frame the reader sees (Q12), so its thread exits
   to the right.

   A chip's words are a book ("Isaiah") or a run of books ("Job - Song",
   "Rom - Phlm"), never a section's name: the sections are only how a side
   with more books than its stack holds is folded. ASCII hyphens (Permanent
   Rule 1).
   ═══════════════════════════════════════════════════════════════════════ */

import { spanT } from './geometry.js';
import { refOfVerse } from './pick.js';
import { filterMasksOf } from './filters.js';

/**
 * What a run of verses holds, in words: "Isaiah 50-57", "Isaiah 53:1-12", "Malachi 3 - Matthew 2"
 * (ASCII hyphens: Permanent Rule 1).
 * @param {any} g @param {number} lo @param {number} hi  inclusive verse ids
 */
export function areaLabel(g, lo, hi) {
  const a = refOfVerse(g, lo), b = refOfVerse(g, hi);
  if (a.bookId !== b.bookId) return a.bookTitle + ' ' + a.chapter + ' - ' + b.bookTitle + ' ' + b.chapter;
  if (a.chapter !== b.chapter) return a.bookTitle + ' ' + a.chapter + '-' + b.chapter;
  return a.bookTitle + ' ' + a.chapter + ':' + a.verse + (b.verse > a.verse ? '-' + b.verse : '');
}

/**
 * The runs of books a side with more books than its stack holds is folded into, by canon index (the
 * asset's 66 books, Genesis 0 to Revelation 65). They are fold units only: a chip never wears their
 * names, it names the books it reaches (spanOf). The frame's own book is always its own.
 */
export const EXIT_SECTIONS = Object.freeze([
  { lo: 0, hi: 4 },     // Genesis - Deuteronomy
  { lo: 5, hi: 16 },    // Joshua - Esther
  { lo: 17, hi: 21 },   // Job - Song of Solomon
  { lo: 22, hi: 26 },   // Isaiah - Daniel
  { lo: 27, hi: 38 },   // Hosea - Malachi
  { lo: 39, hi: 42 },   // Matthew - John
  { lo: 43, hi: 43 },   // Acts
  { lo: 44, hi: 56 },   // Romans - Philemon
  { lo: 57, hi: 64 },   // Hebrews - Jude
  { lo: 65, hi: 65 },   // Revelation
]);

/**
 * @typedef {{ count: Int32Array, t: Float64Array }} ExitSide
 *   per book: the legs whose far foot stands in it, and the sum of their spans' ramp t (geometry.spanT)
 * @typedef {{ legs: number, left: ExitSide, right: ExitSide, home: number, lo: number, hi: number }} ExitCensus
 *   left: the far foot earlier in the canon (off the area's left edge); right: later (off its right
 *   edge, or under the open panel); home: the book under the area's middle, or -1; lo..hi: the verses
 *   the area holds (inclusive)
 * @typedef {{ lo: number, hi: number }} ExitCell  a verse range, inclusive (a "+n" pill's cell)
 */

/** @type {WeakMap<object, { serial: number, Wc: number, cell: string, masks: object | null, out: ExitCensus }>} */
const CENSUS = new WeakMap();

/**
 * The verses the canvas area [0, Wc] holds under the frame's camera (inclusive verse ids), and its
 * words (areaLabel).
 * @param {any} g @param {import('./frame-set.js').FrameSet} set @param {number} Wc  device px
 * @returns {{ lo: number, hi: number, label: string }}
 */
export function areaOf(g, set, Wc) {
  const half = set.width / 2, camX = set.camX, ppv = set.ppv, total = g.total;
  const lo = Math.max(0, Math.min(total - 1, Math.floor((0 - half) / ppv + camX)));
  const hi = Math.max(0, Math.min(total - 1, Math.floor((Wc - half) / ppv + camX)));
  return { lo, hi, label: total > 0 ? areaLabel(g, lo, hi) : '' };
}

const bookOfVerse = (g, v) => g.chapters[g.chapterOfVerse[v]][0];

/**
 * The legs standing on a cell, by the book their far foot stands in, in one pass over the frame's
 * visible set. Memoised per set serial, Wc and cell: the same frame asked again (a hover's redraw)
 * returns the same census; a pan (a new set) or a panel inset (a new Wc) counts again.
 * @param {any} g  the decoded graph
 * @param {import('./frame-set.js').FrameSet} set  the frame's visible set (frame-set.frameSet)
 * @param {number} Wc  the canvas area's right edge, device px (the frame's width less the open panel)
 * @param {ExitCell|null} [cell]  only the legs whose near foot stands in this verse range (a column's
 *   fan); null: every leg of the area
 * @returns {ExitCensus}
 */
export function exitCensus(g, set, Wc, cell = null) {
  const ck = cell ? cell.lo + '-' + cell.hi : '';
  const memo = CENSUS.get(set);
  const masks = filterMasksOf(g);
  if (memo && memo.serial === set.serial && memo.Wc === Wc && memo.cell === ck && memo.masks === masks) return memo.out;
  const nb = g.books.length;
  const left = { count: new Int32Array(nb), t: new Float64Array(nb) };
  const right = { count: new Int32Array(nb), t: new Float64Array(nb) };
  const { fx0, fx1, rankOf } = set.order;
  const half = set.width / 2, camX = set.camX, ppv = set.ppv, total = g.total, list = set.list;
  let legs = 0;
  for (let k = 0; k < set.count; k++) {
    const i = list[k];
    if (masks && !masks.threads[i]) continue;   // a ghost leaves for nowhere (filters.js)
    const r = rankOf[i];
    const x0 = (fx0[r] - camX) * ppv + half, x1 = (fx1[r] - camX) * ppv + half;
    const on0 = x0 >= 0 && x0 <= Wc, on1 = x1 >= 0 && x1 <= Wc;
    if (on0 === on1) continue;
    if (cell) {
      const near = on0 ? g.from[i] : g.to[i];
      if (near < cell.lo || near > cell.hi) continue;
    }
    const book = bookOfVerse(g, on0 ? g.to[i] : g.from[i]);
    const side = on0 ? right : left;
    side.count[book]++;
    side.t[book] += spanT(g.to[i] - g.from[i], total);
    legs++;
  }
  const { lo, hi } = total > 0 ? areaOf(g, set, Wc) : { lo: 0, hi: 0 };
  const mid = Math.max(0, Math.min(total - 1, Math.floor((Wc / 2 - half) / ppv + camX)));
  const out = { legs, left, right, home: total > 0 ? bookOfVerse(g, mid) : -1, lo, hi };
  CENSUS.set(set, { serial: set.serial, Wc, cell: ck, masks, out });
  return out;
}

/**
 * The legs of one chip, OpenBible arc ids: the frame's legs exiting on `side` whose far foot stands
 * in books [bookLo, bookHi] (and, with a cell, whose near foot stands in it).
 * @param {any} g @param {import('./frame-set.js').FrameSet} set @param {number} Wc
 * @param {'left'|'right'} side @param {number} bookLo @param {number} bookHi
 * @param {ExitCell|null} [cell]
 * @returns {Int32Array}
 */
export function exitIds(g, set, Wc, side, bookLo, bookHi, cell = null) {
  const { fx0, fx1, rankOf } = set.order;
  const half = set.width / 2, camX = set.camX, ppv = set.ppv, list = set.list;
  const masks = filterMasksOf(g);
  const out = [];
  for (let k = 0; k < set.count; k++) {
    const i = list[k];
    if (masks && !masks.threads[i]) continue;
    const r = rankOf[i];
    const x0 = (fx0[r] - camX) * ppv + half, x1 = (fx1[r] - camX) * ppv + half;
    const on0 = x0 >= 0 && x0 <= Wc, on1 = x1 >= 0 && x1 <= Wc;
    if (on0 === on1 || (side === 'right') !== on0) continue;
    if (cell) {
      const near = on0 ? g.from[i] : g.to[i];
      if (near < cell.lo || near > cell.hi) continue;
    }
    const book = bookOfVerse(g, on0 ? g.to[i] : g.from[i]);
    if (book >= bookLo && book <= bookHi) out.push(i);
  }
  return Int32Array.from(out);
}

/**
 * One chip: a run of books on one side, its legs and their mean ramp t (the swatch's colour).
 * @typedef {{ side: 'left'|'right', lo: number, hi: number, count: number, t: number,
 *   kind: 'book'|'section'|'range', name: string, title: string, books: number[] }} ExitGroup
 *   lo..hi: the stretch of the canon the chip names, canon book indices, inclusive (spanOf: no two
 *   chips of a side share a book); books: those of them with legs, in canon order; kind: one book,
 *   a whole fold unit's run, or a merged run; name: the chip's words ("Isaiah", "Gen - Esth"),
 *   title: the panel's ("Genesis - Esther")
 */

/** The fold unit a book is in (an index into EXIT_SECTIONS), or -1 off the 66-book canon. */
export function sectionOf(book) {
  for (let k = 0; k < EXIT_SECTIONS.length; k++) if (book >= EXIT_SECTIONS[k].lo && book <= EXIT_SECTIONS[k].hi) return k;
  return -1;
}

/** A chip's words: the book's title (one book with legs), or the stretch it names, "Gen - Esth". */
function nameOf(g, kind, lo, hi, books) {
  if (kind === 'book') return g.books[books[0]].title;
  return lo === hi ? g.books[lo].title : g.books[lo].abbr + ' - ' + g.books[hi].abbr;
}

/** A chip's words in full, for the panel and the live region: a run reads "Genesis - Esther". */
function titleOf(g, kind, lo, hi, books) {
  if (kind === 'book') return g.books[books[0]].title;
  return lo === hi ? g.books[lo].title : g.books[lo].title + ' - ' + g.books[hi].title;
}

/**
 * Fold a run of present books into one chip, naming `span` (spanOf; its books' own ends without one).
 * @param {[number, number]|null} [span]
 * @returns {ExitGroup}
 */
function groupOf(g, sideName, census, kind, books, span = null) {
  const side = census[sideName];
  let count = 0, t = 0;
  for (const b of books) { count += side.count[b]; t += side.t[b]; }
  const lo = span ? span[0] : books[0], hi = span ? span[1] : books[books.length - 1];
  return { side: sideName, lo, hi, count, t: count ? t / count : 0, kind, name: nameOf(g, kind, lo, hi, books),
    title: titleOf(g, kind, lo, hi, books), books };
}

/** The books of a side that have legs, in canon order. */
function present(census, sideName) {
  const c = census[sideName].count;
  const out = [];
  for (let b = 0; b < c.length; b++) if (c[b] > 0) out.push(b);
  return out;
}

/** A side's books, one chip each. @returns {ExitGroup[]} */
export function bookGroups(g, census, sideName) {
  return present(census, sideName).map((b) => groupOf(g, sideName, census, 'book', [b]));
}

/**
 * Whether a run of books is every book of one fold unit that has legs on this side, so it reaches to
 * the unit's ends. The unit the frame stands in is not whole (its own book is on screen, whatever its
 * legs): what is left reads as its run of books ("Jer - Dan" in Isaiah, "Matt - Luke" in John).
 * @param {ExitCensus} census @param {'left'|'right'} sideName @param {number[]} books
 */
function wholeSection(census, sideName, books) {
  const k = sectionOf(books[0]);
  if (k < 0 || !books.every((b) => sectionOf(b) === k)) return false;
  const c = census[sideName].count, sec = EXIT_SECTIONS[k];
  if (census.home >= sec.lo && census.home <= sec.hi) return false;
  for (let b = sec.lo; b <= sec.hi; b++) if (c[b] > 0 && books.indexOf(b) < 0) return false;
  return true;
}

/**
 * The stretch of the canon a run of sectionGroups names: a book standing on its own (the frame's own,
 * or off the 66-book canon) is that book, and a unit's run reaches to the unit's ends, short of the
 * frame's own book (its own chip). So a chip's words hold while a book at its end gains or loses its
 * last leg (a pan: "Gen - Esth" whether or not Esther's legs are in the frame), and no two chips of a
 * side name one book.
 * @param {ExitCensus} census @param {number} sec  the run's key (sectionGroups) @param {number[]} run
 * @returns {[number, number]}
 */
function spanOf(census, sec, run) {
  const a = run[0], b = run[run.length - 1];
  if (sec < 0) return [a, b];
  const s = EXIT_SECTIONS[sec];
  let lo = s.lo, hi = s.hi;
  const x = census.home;
  if (x >= 0) {
    if (x >= s.lo && x < a) lo = Math.max(lo, x + 1);
    if (x <= s.hi && x > b) hi = Math.min(hi, x - 1);
  }
  return [lo, hi];
}

/**
 * A side's books folded by EXIT_SECTIONS, the frame's own book its own chip; a unit holding one present
 * book is that book. Off the 66-book canon every book is its own.
 * @param {any} g @param {ExitCensus} census @param {'left'|'right'} sideName
 * @returns {ExitGroup[]}
 */
export function sectionGroups(g, census, sideName) {
  const books = present(census, sideName);
  const canon = g.books.length === 66;
  /** @type {ExitGroup[]} */
  const out = [];
  let run = [], runSec = -2;
  const flush = () => {
    if (!run.length) return;
    const kind = run.length === 1 ? 'book' : wholeSection(census, sideName, run) ? 'section' : 'range';
    out.push(groupOf(g, sideName, census, kind, run, spanOf(census, runSec, run)));
    run = [];
  };
  for (const b of books) {
    const sec = !canon || b === census.home ? -3 - b : sectionOf(b);
    if (sec !== runSec) { flush(); runSec = sec; }
    run.push(b);
  }
  flush();
  return out;
}

/** Two neighbouring chips as one run of books, naming both stretches. @returns {ExitGroup} */
function mergeGroups(g, census, a, b) {
  return groupOf(g, a.side, census, 'range', a.books.concat(b.books), [a.lo, b.hi]);
}

/** A neighbouring pair's cost to merge: its legs, or far more where one is the frame's own book
 * (beside the column, it goes last). */
const pairCost = (census, a, b) => a.count + b.count
  + (a.books.indexOf(census.home) >= 0 || b.books.indexOf(census.home) >= 0 ? 1e9 : 0);

/**
 * Merge a side's neighbouring chips, the smallest pair first (the frame's own book last), until at
 * most `most` remain.
 * @param {any} g @param {ExitCensus} census @param {ExitGroup[]} groups @param {number} most
 * @returns {ExitGroup[]}
 */
export function mergeTo(g, census, groups, most) {
  let list = groups.slice();
  while (list.length > Math.max(1, most)) {
    let at = 0, best = Infinity;
    for (let k = 0; k + 1 < list.length; k++) {
      const n = pairCost(census, list[k], list[k + 1]);
      if (n < best) { best = n; at = k; }
    }
    list = list.slice(0, at).concat([mergeGroups(g, census, list[at], list[at + 1])], list.slice(at + 2));
  }
  return list;
}

/**
 * A column's fan: each side's books, nearest first (the bottom of its stack: "altitude IS span"),
 * folded by EXIT_SECTIONS and then merged, the smallest neighbours first, to at most `most` chips.
 * Every leg of the census is in exactly one chip.
 * @param {any} g @param {ExitCensus} census @param {number} most
 * @returns {{ left: ExitGroup[], right: ExitGroup[] }}
 */
export function fanGroups(g, census, most) {
  /** @param {'left'|'right'} side */
  const one = (side) => {
    let list = bookGroups(g, census, side);
    if (list.length > most) list = sectionGroups(g, census, side);
    if (list.length > most) list = mergeTo(g, census, list, most);
    return side === 'left' ? list.slice().reverse() : list;
  };
  return { left: one('left'), right: one('right') };
}
