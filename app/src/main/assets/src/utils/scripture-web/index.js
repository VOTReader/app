/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/index — Cluster F (esbuild bundle-f.js)

   The exact visible set, as pure data over the SHIPPED layout.

   Corbin, 2026-09-11: "other lines that aren't even close to user screen
   don't continually update and hog resources." Today the renderer culls per
   256-instance chunk by verse extent, which at the desktop ceiling submits
   18,944 instances for the 336 that paint. This index answers the question
   the true law makes answerable: a thread is inside the frame's band only
   near a foot (geometry.threadVisible), so the candidates are the threads
   with a foot near the frame — a binary search on sorted feet per run.

   Per (bucket, tier) run — the unit a density draws whole — two Uint16Arrays
   of positions, one sorted by `from` and one by `to` (63,418 < 65,536; 254 KB
   in all, 3 ms once). The layout's own order is not assumed, so a generator
   that re-sorts a run changes nothing here. Nothing is regenerated: a
   regenerated layout reorders instances, and under premultiplied-over
   blending that moves the 1x picture the spine promises not to touch.

   The predicate that decides each candidate is the law's own
   (geometry.threadVisible) on the feet as DRAWN — at their departure slots
   inside the verse cell (decode.assignSlots) — so the renderer's gathered
   list, the ink law's crowding count and the hit test all read ONE
   definition of "on screen". The sorted feet are the integer verses, so the
   windows are widened by one verse each side and the predicate settles the
   rest.
   A thread is one entry however many of its pieces show — the shader splits
   a strip onto its two legs itself (geometry.sampleTau) — so nothing can
   be drawn twice by construction.
   ═══════════════════════════════════════════════════════════════════════ */

import { deltaRuns, bucketDrawCount, slotsOf, SLOT_UNIT } from './decode.js';
import { threadVisible, footWindow } from './geometry.js';

/**
 * One (bucket, tier) run of the layout; byFrom and byTo are offsets from
 * `start`, sorted by that foot.
 * @typedef {{ bucket:number, start:number, end:number, byFrom:Uint16Array,
 *   byTo:Uint16Array, spanLo:number, spanHi:number }} IndexRun
 * @typedef {{ runs:IndexRun[], mark:Uint32Array, gen:number }} ThreadIndex
 */

/**
 * Build the index for a decoded graph (3 ms for the shipped 63k threads).
 * @param {import('./decode.js').ScriptureGraph} g
 * @returns {ThreadIndex}
 */
export function buildIndex(g) {
  const runs = [];
  g.buckets.forEach((b, bi) => {
    for (const [start, len] of deltaRuns(b)) {
      const end = start + len;
      let spanLo = Infinity, spanHi = 0;
      for (let i = start; i < end; i++) {
        const s = g.to[i] - g.from[i];
        if (s < spanLo) spanLo = s;
        if (s > spanHi) spanHi = s;
      }
      runs.push({
        bucket: bi, start, end,
        byFrom: sortedBy(g.from, start, len), byTo: sortedBy(g.to, start, len),
        spanLo: spanLo === Infinity ? 0 : spanLo, spanHi,
      });
    }
  });
  return { runs, mark: new Uint32Array(g.count), gen: 0 };
}

/** One index per graph object, built on first use: the renderer, the hit test and the crowding count share it. */
const INDEX = new WeakMap();
/** @param {import('./decode.js').ScriptureGraph} g @returns {ThreadIndex} */
export function indexOf(g) {
  let idx = INDEX.get(g);
  if (!idx) { idx = buildIndex(g); INDEX.set(g, idx); }
  return idx;
}

/** Offsets 0..len-1 sorted by foot[start + offset]: a packed (foot << 16 | offset) key sorts as one number. */
function sortedBy(foot, start, len) {
  const keys = new Uint32Array(len);
  for (let k = 0; k < len; k++) keys[k] = (foot[start + k] << 16) | k;
  keys.sort();
  const out = new Uint16Array(len);
  for (let k = 0; k < len; k++) out[k] = keys[k] & 0xffff;
  return out;
}

/** First position in [lo, hi) whose key(pos) >= v; keys ascend over the range. */
function lowerBound(lo, hi, v, key) {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(mid) < v) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** First position in [lo, hi) whose key(pos) > v. */
function upperBound(lo, hi, v, key) {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(mid) <= v) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * The runs the density draws. A density is a prefix of each bucket and the
 * tiers are the run boundaries, so a run is drawn whole or not at all.
 */
function drawnRuns(g, idx, density) {
  const out = [];
  for (const run of idx.runs) {
    const b = g.buckets[run.bucket];
    const drawEnd = b.off + bucketDrawCount(b, density);
    if (run.start < drawEnd) out.push(run);
  }
  return out;
}

/**
 * How many candidates the windows hold for this rectangle — the regime
 * switch reads it BEFORE any walk: past the gather cap the whole-bucket path
 * is cheaper than the list.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {ThreadIndex} idx
 * @param {{xa:number, xb:number, y0:number, y1:number}} rect
 * @param {import('./decode.js').Density} density
 */
export function windowSize(g, idx, rect, density) {
  let n = 0;
  for (const run of drawnRuns(g, idx, density)) {
    const w = footWindow(run.spanLo, run.spanHi, rect.xa - 1, rect.xb + 1, rect.y0, rect.y1);
    const f0 = lowerBound(0, run.byFrom.length, w.fromLo, (k) => g.from[run.start + run.byFrom[k]]);
    const f1 = upperBound(0, run.byFrom.length, w.fromHi, (k) => g.from[run.start + run.byFrom[k]]);
    const t0 = lowerBound(0, run.byTo.length, w.toLo, (k) => g.to[run.start + run.byTo[k]]);
    const t1 = upperBound(0, run.byTo.length, w.toHi, (k) => g.to[run.start + run.byTo[k]]);
    n += Math.max(0, f1 - f0) + Math.max(0, t1 - t0);
  }
  return n;
}

/**
 * Walk the windows and hand every visible thread to `emit(position)` once,
 * in run order (bucket-major, so a bucket's threads are contiguous in any
 * list built from it). Returns how many candidates were examined — the
 * "nothing far from the frame is touched" number, registered beside the
 * visible count.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {ThreadIndex} idx
 * @param {{xa:number, xb:number, y0:number, y1:number}} rect
 * @param {import('./decode.js').Density} density
 * @param {(pos:number) => void} emit
 * @returns {number} visited
 */
export function walkVisible(g, idx, rect, density, emit) {
  const gen = ++idx.gen;
  const mark = idx.mark;
  const { xa, xb, y0, y1 } = rect;
  const { slotA, slotB } = slotsOf(g);
  let visited = 0;
  const consider = (p) => {
    visited++;
    if (mark[p] === gen) return;
    mark[p] = gen;
    if (threadVisible(g.from[p] + slotA[p] * SLOT_UNIT, g.to[p] + slotB[p] * SLOT_UNIT, xa, xb, y0, y1)) emit(p);
  };
  for (const run of drawnRuns(g, idx, density)) {
    const w = footWindow(run.spanLo, run.spanHi, xa - 1, xb + 1, y0, y1);
    const f0 = lowerBound(0, run.byFrom.length, w.fromLo, (k) => g.from[run.start + run.byFrom[k]]);
    const f1 = upperBound(0, run.byFrom.length, w.fromHi, (k) => g.from[run.start + run.byFrom[k]]);
    for (let k = f0; k < f1; k++) consider(run.start + run.byFrom[k]);
    const t0 = lowerBound(0, run.byTo.length, w.toLo, (k) => g.to[run.start + run.byTo[k]]);
    const t1 = upperBound(0, run.byTo.length, w.toHi, (k) => g.to[run.start + run.byTo[k]]);
    for (let k = t0; k < t1; k++) consider(run.start + run.byTo[k]);
  }
  return visited;
}

/**
 * The visible set as a list of positions, into `out.ids` (a Uint32Array the
 * caller sizes; a rectangle whose windows exceed it is the caller's cue to
 * draw the whole buckets instead — see windowSize).
 * @returns {{count:number, visited:number}}
 */
export function gather(g, idx, rect, density, out) {
  let count = 0;
  const ids = out.ids;
  const visited = walkVisible(g, idx, rect, density, (p) => { if (count < ids.length) ids[count++] = p; });
  out.count = count;
  out.visited = visited;
  return out;
}

/** How many threads have a piece inside the rectangle. */
export function countVisible(g, idx, rect, density) {
  let n = 0;
  walkVisible(g, idx, rect, density, () => { n++; });
  return n;
}
