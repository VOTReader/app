/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/frame-set — the threads the top pass draws. Cluster F (bundle-d)
   ═══════════════════════════════════════════════════════════════════════

   The GL renderer (web-renderer.js) draws the web in two passes. The main
   pass is every thread of the density, from the asset's static buffers, in
   the distance ramp. The top pass redraws, over it, the few threads the
   reader has asked about, in the ink table's colours (sw-ink.js) and with
   their own tessellation (geometry.topSegmentsFor), so the chosen line is a
   smooth gold core under a soft halo at every zoom (GL item 3; digest C1,
   C3, item 10):

     lit      focus.lit: go-to, verse mode, a chooser row under hover or focus
     hover    the thread under a resting pointer (dims nothing)
     chosen   the chosen thread: an OpenBible arc or a prophecy pair

   in that order, so the chosen line is drawn last, on top. This file builds
   that small set as instance data (feet and fans), once per change of what
   is chosen, hovered or lit: the set carries a key, and a renderer uploads
   it only when the key differs from the one it holds.

   A thread here stands on the same feet as in the main pass (decode.fansOf),
   so the redraw lies exactly over the line it covers and the picker
   (pick.js) hits the same curve. A prophecy pair that is also an OpenBible
   arc stands on that arc's fans; any other pair stands mid-cell (fan 0),
   and the picker reads the same table (prophecySet). */

import { fansOf } from './decode.js';

/** The top pass's kinds, in drawing order: the chosen line last, on top. */
export const TOP_ORDER = Object.freeze(['lit', 'hover', 'chosen']);

/** Compact mode (the build spec, mockups README.md "Compact mode"): the root at most this tall, CSS px. */
export const COMPACT_HEIGHT_CSS = 500;
/**
 * Whether the frame is in compact mode, where the ink table's compact widths apply (inkWidth).
 * @param {number} heightCss  the frame's height, CSS px
 */
export function isCompact(heightCss) {
  return heightCss > 0 && heightCss <= COMPACT_HEIGHT_CSS;
}

/**
 * @typedef {{ count: number, from: Uint16Array, to: Uint16Array, fanA: Float32Array,
 *   fanB: Float32Array, arcOf: Int32Array }} ProphecySet
 *   from < to: each pair's verse ids in canon order; fanA at from, fanB at to;
 *   arcOf: the OpenBible arc joining the same two verses (the strongest, by votes), or -1
 */

const PROPHECY_SETS = new WeakMap();
/**
 * The prophecy pairs (g.prophecy, the Bible Studies' Old Testament prophecy and its New Testament
 * fulfilment) as threads, cached per graph. 107 of the asset's 132 pairs are not OpenBible arcs,
 * so the class is its own list (focus-state.js); the 25 that are stand on their arc's feet.
 * @param {any} g  the decoded graph
 * @returns {ProphecySet}
 */
export function prophecySet(g) {
  const cached = PROPHECY_SETS.get(g);
  if (cached) return cached;
  const list = (g && g.prophecy) || [];
  const n = list.length;
  const from = new Uint16Array(n), to = new Uint16Array(n);
  const fanA = new Float32Array(n), fanB = new Float32Array(n);
  const arcOf = new Int32Array(n).fill(-1);
  /** @type {Map<string, number[]>} */
  const want = new Map();
  for (let k = 0; k < n; k++) {
    const p = list[k];
    const lo = Math.min(p.a, p.b), hi = Math.max(p.a, p.b);
    from[k] = lo; to[k] = hi;
    const key = lo + ':' + hi;
    const ks = want.get(key);
    if (ks) ks.push(k); else want.set(key, [k]);
  }
  // one pass over the arcs, looking up only the pairs' few keys
  const count = g && g.count > 0 ? g.count : 0;
  if (n && count) {
    const fans = fansOf(g);
    const best = new Map();
    for (let i = 0; i < count; i++) {
      const a = g.from[i], b = g.to[i];
      const key = (a < b ? a : b) + ':' + (a < b ? b : a);
      if (!want.has(key)) continue;
      const j = best.get(key);
      if (j === undefined || g.votes[i] > g.votes[j]) best.set(key, i);
    }
    for (const [key, i] of best) {
      const swap = g.from[i] > g.to[i];
      for (const k of want.get(key)) {
        arcOf[k] = i;
        fanA[k] = swap ? fans.fanB[i] : fans.fanA[i];
        fanB[k] = swap ? fans.fanA[i] : fans.fanB[i];
      }
    }
  }
  const set = { count: n, from, to, fanA, fanB, arcOf };
  if (g && typeof g === 'object') PROPHECY_SETS.set(g, set);
  return set;
}

/**
 * @typedef {{ kind: string, first: number, count: number }} TopRange
 * @typedef {{ key: string, count: number, from: Uint16Array, to: Uint16Array,
 *   fanA: Float32Array, fanB: Float32Array, ranges: TopRange[] }} TopSet
 */

/**
 * The key of the frame's top set: what is lit, hovered and chosen.
 * @param {{ litKey?: string, hoverArc?: number, focusArc?: number, focusProphecy?: number }} v
 */
export function topSetKey(v) {
  const n = (x) => (x == null || !(x >= 0) ? -1 : x);
  return (v.litKey || '') + '|' + n(v.hoverArc) + '|' + n(v.focusArc) + '|' + n(v.focusProphecy);
}

/**
 * The top pass's threads for one frame, as instance data in TOP_ORDER: the
 * lit arcs, the hovered arc (unless it is the chosen one), the chosen
 * thread. `prev` comes back as it is when nothing changed (its key).
 * @param {any} g  the decoded graph
 * @param {{ lit?: ArrayLike<number> | null, litKey?: string, hoverArc?: number,
 *   focusArc?: number, focusProphecy?: number }} v  the frame's view args (webViewArgs)
 * @param {TopSet | null} [prev]
 * @returns {TopSet}
 */
export function topSet(g, v, prev) {
  const key = topSetKey(v);
  if (prev && prev.key === key) return prev;
  const count = g && g.count > 0 ? g.count : 0;
  const isArc = (i) => i != null && i >= 0 && i < count && Number.isInteger(i);
  const arcs = { lit: /** @type {number[]} */ ([]), hover: /** @type {number[]} */ ([]), chosen: /** @type {number[]} */ ([]) };
  if (v.lit) for (let k = 0; k < v.lit.length; k++) if (isArc(v.lit[k])) arcs.lit.push(v.lit[k]);
  if (isArc(v.hoverArc) && v.hoverArc !== v.focusArc) arcs.hover.push(/** @type {number} */ (v.hoverArc));
  if (isArc(v.focusArc)) arcs.chosen.push(/** @type {number} */ (v.focusArc));
  const ps = prophecySet(g);
  const chosenPair = !isArc(v.focusArc) && v.focusProphecy != null && v.focusProphecy >= 0
    && v.focusProphecy < ps.count ? v.focusProphecy : -1;
  const total = arcs.lit.length + arcs.hover.length + arcs.chosen.length + (chosenPair >= 0 ? 1 : 0);
  const from = new Uint16Array(total), to = new Uint16Array(total);
  const fanA = new Float32Array(total), fanB = new Float32Array(total);
  const fans = count ? fansOf(g) : null;
  /** @type {TopRange[]} */
  const ranges = [];
  let at = 0;
  const putArc = (i) => {
    // canon order, the fans following their feet
    const swap = g.from[i] > g.to[i];
    from[at] = swap ? g.to[i] : g.from[i];
    to[at] = swap ? g.from[i] : g.to[i];
    fanA[at] = swap ? fans.fanB[i] : fans.fanA[i];
    fanB[at] = swap ? fans.fanA[i] : fans.fanB[i];
    at++;
  };
  for (const kind of TOP_ORDER) {
    const first = at;
    for (const i of arcs[kind]) putArc(i);
    if (kind === 'chosen' && chosenPair >= 0) {
      from[at] = ps.from[chosenPair]; to[at] = ps.to[chosenPair];
      fanA[at] = ps.fanA[chosenPair]; fanB[at] = ps.fanB[chosenPair];
      at++;
    }
    ranges.push({ kind, first, count: at - first });
  }
  return { key, count: total, from, to, fanA, fanB, ranges };
}
