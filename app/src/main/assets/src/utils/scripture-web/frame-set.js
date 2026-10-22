/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/frame-set — what one frame draws. Cluster F (bundle-d)
   ═══════════════════════════════════════════════════════════════════════

   THE VISIBLE SET (E1). One pass per camera finds every thread of the
   density whose body touches the frame (geometry.arcFrameTau: the x window
   AND the heights, so a span crossing the frame with its body far above it
   is not in it), how many segments its piece needs (geometry.frameSegments,
   by its own size on screen), and how many threads are anchored (a foot near
   the frame, the crowding law's count). The renderer draws exactly this set,
   in rank order, a few runs of it per frame; the picker (pick.pickArcs) hits only threads
   in it, the label pass walks it (pick.visibleArcs) and the convergence
   pills count it (pick.footBundles). So what is drawn, counted, labelled and
   pickable are one set by construction, and a frame that redraws for a
   hover or a fade finds the set it already has (frameSet keeps the last two
   cameras).

   Order. A density's threads are ranked once by their span on screen (the
   feet as drawn, fans included) in steps of an eighth of an octave
   (ORDER_STEPS), so the draw is widest first and the shortest on top, in
   the same order at every zoom: the web is blended over (premultiplied), so
   the order IS the picture, and a thread never changes layer as the reader
   zooms (C20). Shortest on top because every long thread's two legs come
   down through the feet band: drawn last they covered the short spans
   there and the picture's violet feet went grey (w4 INK, item 2;
   D:/Swarm/lanes/sweb/out/w4/ink/diagnosis.md, cause 2). Within a step the
   threads go by x (their from-verse, then
   the asset's order), so consecutive draws stand side by side on the
   screen: ranked by exact span they scattered across the frame, and the
   GPU paid for it (6x on the 890M, perf.md: 12.9 ms by exact span, 6.4 by
   step and x, 7.3 in the asset's bucket order).

   Runs. The set goes to the renderer as RUNS of consecutive ranks, one draw
   each, every thread of a run with the run's most segments (more than a
   thread asked for only refines it): a run splits where the vertex
   invocations that saves pass RUN_DRAW_VERTICES, the worth of one more
   draw. At the overview a thread's segments follow its span alone, so a
   step's threads ask for nearly one count and the overview is drawn within
   a couple of percent of every thread's own; deeper in, the long threads'
   legs need fewer segments than the arches beside them, and the runs follow
   that.

   Candidates come from a scan of every rank, or, once the frame is deep,
   from the feet in the frame widened by the farthest a foot can stand from
   it and still lift its body into the frame (see feetWindow).

   THE TOP PASS. The GL renderer (web-renderer.js) draws the web in two
   passes. The main pass is the visible set above, in the distance ramp. The
   top pass redraws, over it, the few threads the
   reader has asked about, in the ink table's colours (sw-ink.js) and with
   their own tessellation (geometry.topSegmentsFor), so the chosen line is a
   smooth gold core under a soft halo at every zoom (GL item 3; digest C1,
   C3, item 10):

     prophecy every prophecy pair (g.prophecy), always, at every density
              (GL item 4; Q1 a): the Bible Studies' prophecy and its fulfilment;
              it recedes with a tap, as the main pass's web does
     prophecyInRange  the pairs the chosen range keeps lit, by the main
              pass's own law (a foot in the range; with a group, a foot in
              each): they keep their ink, as the range's own threads do
     lit      focus.lit: go-to, verse mode, a chooser row under hover or focus
     hover    the thread under a resting pointer (dims nothing): an arc, or a
              prophecy pair that is none (hoverProphecy)
     chosen   the chosen thread: an OpenBible arc or a prophecy pair

   in that order, so the chosen line is drawn last, on top. This file builds
   that small set as instance data (feet and fans), once per change of what
   is chosen, hovered or lit (topSet: the same ask is the same set). Each
   frame topDraws keeps of it what touches the frame, by the main pass's own
   cull, and draws each kind in a few runs by segment class, every thread
   near its own count (GL review 2026-10-18: the uncut pass sent the whole
   class at its most segments wherever the camera stood); a renderer uploads
   the packing only when it changes.

   A thread here stands on the same feet as in the main pass (decode.fansOf),
   so the redraw lies exactly over the line it covers and the picker
   (pick.js) hits the same curve. A prophecy pair that is also an OpenBible
   arc stands on that arc's fans; any other pair stands mid-cell (fan 0),
   and the picker reads the same table (prophecySet). */

import { fansOf, bucketDrawCount } from './decode.js';
import {
  arcFrameTau, frameSegments, frameHeights, topSegmentsFor, CLIP_MARGIN, FLYOVER_MARGIN, TOP_SEGMENT_MIN,
} from './geometry.js';

/** The top pass's kinds, in drawing order: the chosen line last, on top. */
export const TOP_ORDER = Object.freeze(['prophecy', 'prophecyInRange', 'lit', 'hover', 'chosen']);

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
 * @typedef {{ count: number, unique: number, from: Uint16Array, to: Uint16Array, fanA: Float32Array,
 *   fanB: Float32Array, arcOf: Int32Array, twin: Int32Array, pairOf: Map<number, number> }} ProphecySet
 *   from < to: each pair's verse ids in canon order; fanA at from, fanB at to;
 *   twin: the first pair joining the same two verses (k itself when it is the first): a pair given
 *   twice is one thread, drawn and picked once; unique: how many pairs are their own twin;
 *   arcOf: the OpenBible arc joining the same two verses (the strongest, by votes), or -1;
 *   pairOf: the other way, an arc id to its pair (the first, when two pairs join the same verses)
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
  const twin = new Int32Array(n);
  let unique = 0;
  /** @type {Map<number, number>} */
  const pairOf = new Map();
  /** @type {Map<string, number[]>} */
  const want = new Map();
  for (let k = 0; k < n; k++) {
    const p = list[k];
    const lo = Math.min(p.a, p.b), hi = Math.max(p.a, p.b);
    from[k] = lo; to[k] = hi;
    const key = lo + ':' + hi;
    const ks = want.get(key);
    if (ks) ks.push(k); else want.set(key, [k]);
    twin[k] = ks ? ks[0] : k;
    if (!ks) unique++;
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
      pairOf.set(i, want.get(key)[0]);
      for (const k of want.get(key)) {
        arcOf[k] = i;
        fanA[k] = swap ? fans.fanB[i] : fans.fanA[i];
        fanB[k] = swap ? fans.fanA[i] : fans.fanB[i];
      }
    }
  }
  const set = { count: n, unique, from, to, fanA, fanB, arcOf, twin, pairOf };
  if (g && typeof g === 'object') PROPHECY_SETS.set(g, set);
  return set;
}

/**
 * @typedef {{ kind: string, first: number, count: number }} TopRange
 * @typedef {{ key: string, count: number, from: Uint16Array, to: Uint16Array,
 *   fanA: Float32Array, fanB: Float32Array, ranges: TopRange[], pairs: ProphecySet, litKey: string,
 *   hoverArc: number, hoverProphecy: number, focusArc: number, focusProphecy: number,
 *   range: ReadonlyArray<number> }} TopSet
 *   pairs: the prophecySet it was built over (one per graph);
 *   litKey .. focusProphecy: the ask it was built for, as topSetKey reads it (-1 for none);
 *   range: the chosen range as the shader reads it, [lo, hi], or [1, 0] for none
 */

/**
 * The key of the frame's top set: what is lit, hovered and chosen (the
 * prophecy class is the graph's own, split only by the chosen range).
 * @param {{ litKey?: string, hoverArc?: number, hoverProphecy?: number, focusArc?: number, focusProphecy?: number,
 *   focusRange?: ArrayLike<number> | null }} v
 */
export function topSetKey(v) {
  const r = spanOf(v.focusRange);
  return (v.litKey || '') + '|' + askOf(v.hoverArc) + '|' + askOf(v.focusArc) + '|' + askOf(v.focusProphecy)
    + '|' + askOf(v.hoverProphecy) + '|' + (r[0] <= r[1] ? r[0] + '-' + r[1] : '');
}

/** One asked-about index as the key reads it: -1 for none. @param {number | null | undefined} x */
function askOf(x) {
  return x == null || !(x >= 0) ? -1 : x;
}

const NO_SPAN = Object.freeze([1, 0]);
/**
 * A focus range as the shader reads it: [lo, hi], or [1, 0] (lo > hi) for none.
 * @param {ArrayLike<number> | null | undefined} r
 * @returns {ReadonlyArray<number>}
 */
function spanOf(r) {
  return r && r[0] <= r[1] ? [r[0], r[1]] : NO_SPAN;
}

/**
 * The top pass's threads for one frame, as instance data in TOP_ORDER: every
 * prophecy pair (those the chosen range keeps lit apart, as prophecyInRange),
 * the lit arcs, the hovered thread (an arc, or a prophecy pair that is none;
 * never the chosen one), the chosen thread. `prev` comes back as it is when
 * nothing changed (the ask, field by field) and it was built over the same graph.
 *
 * The range law is the main pass's (web-renderer.js: inRange): a pair with a
 * foot in the chosen range keeps its ink; the rest of the class recedes with
 * a tap (GL review 2026-10-18).
 * @param {any} g  the decoded graph
 * @param {{ lit?: ArrayLike<number> | null, litKey?: string, hoverArc?: number, hoverProphecy?: number,
 *   focusArc?: number, focusProphecy?: number, focusRange?: ArrayLike<number> | null }} v  the frame's
 *   view args (webViewArgs)
 * @param {TopSet | null} [prev]
 * @returns {TopSet}
 */
export function topSet(g, v, prev) {
  const ps = prophecySet(g);
  const range = spanOf(v.focusRange);
  const ranged = range[0] <= range[1];
  // the same ask, field by field: a frame that changes nothing builds no key (E3)
  if (prev && prev.pairs === ps && prev.litKey === (v.litKey || '')
    && prev.hoverArc === askOf(v.hoverArc) && prev.focusArc === askOf(v.focusArc)
    && prev.focusProphecy === askOf(v.focusProphecy) && prev.hoverProphecy === askOf(v.hoverProphecy)
    && prev.range[0] === range[0] && prev.range[1] === range[1]) return prev;
  const key = topSetKey(v);
  const count = g && g.count > 0 ? g.count : 0;
  const isArc = (i) => i != null && i >= 0 && i < count && Number.isInteger(i);
  const arcs = { lit: /** @type {number[]} */ ([]), hover: /** @type {number[]} */ ([]), chosen: /** @type {number[]} */ ([]) };
  if (v.lit) for (let k = 0; k < v.lit.length; k++) if (isArc(v.lit[k])) arcs.lit.push(v.lit[k]);
  if (isArc(v.hoverArc) && v.hoverArc !== v.focusArc) arcs.hover.push(/** @type {number} */ (v.hoverArc));
  if (isArc(v.focusArc)) arcs.chosen.push(/** @type {number} */ (v.focusArc));
  const isPair = (k) => k != null && k >= 0 && k < ps.count && Number.isInteger(k);
  const chosenPair = !isArc(v.focusArc) && isPair(v.focusProphecy) ? /** @type {number} */ (v.focusProphecy) : -1;
  // the pair under the pointer when no arc is (107 of the asset's pairs are none): drawn once,
  // so not when it is the chosen thread (by its twin, or by the arc it is)
  const hp = !isArc(v.hoverArc) && isPair(v.hoverProphecy) ? ps.twin[/** @type {number} */ (v.hoverProphecy)] : -1;
  const hoverPair = hp >= 0 && !(chosenPair >= 0 && ps.twin[chosenPair] === hp)
    && !(isArc(v.focusArc) && ps.arcOf[hp] === v.focusArc) ? hp : -1;
  // the shader's range law over a pair's feet: a foot in the range
  const keeps = (k) => {
    if (!ranged) return false;
    const a = ps.from[k], b = ps.to[k];
    return (a >= range[0] && a <= range[1]) || (b >= range[0] && b <= range[1]);
  };
  const total = ps.unique + arcs.lit.length + arcs.hover.length + arcs.chosen.length
    + (hoverPair >= 0 ? 1 : 0) + (chosenPair >= 0 ? 1 : 0);
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
  const putPair = (k) => {
    from[at] = ps.from[k]; to[at] = ps.to[k]; fanA[at] = ps.fanA[k]; fanB[at] = ps.fanB[k];
    at++;
  };
  for (const kind of TOP_ORDER) {
    const first = at;
    if (kind === 'prophecy' && ps.unique === ps.count && !ranged) {
      from.set(ps.from, at); to.set(ps.to, at); fanA.set(ps.fanA, at); fanB.set(ps.fanB, at);
      at += ps.count;
    } else if (kind === 'prophecy' || kind === 'prophecyInRange') {
      // a pair given twice is drawn once: twice, its line would carry double ink
      const kept = kind === 'prophecyInRange';
      for (let k = 0; k < ps.count; k++) {
        if (ps.twin[k] === k && keeps(k) === kept) putPair(k);
      }
    } else {
      for (const i of arcs[kind]) putArc(i);
    }
    if (kind === 'hover' && hoverPair >= 0) putPair(hoverPair);
    if (kind === 'chosen' && chosenPair >= 0) putPair(chosenPair);
    ranges.push({ kind, first, count: at - first });
  }
  return {
    key, count: total, from, to, fanA, fanB, ranges, pairs: ps, litKey: v.litKey || '',
    hoverArc: askOf(v.hoverArc), hoverProphecy: askOf(v.hoverProphecy),
    focusArc: askOf(v.focusArc), focusProphecy: askOf(v.focusProphecy),
    range,
  };
}

/**
 * The top pass's segment classes: from TOP_SEGMENT_MIN up by sqrt 2, rounded up. A thread is
 * drawn at the first class at or over its own count (geometry.topSegmentsFor, under its kind's
 * cap), so it is drawn at most about sqrt 2 over what it asks for, and a kind in a few runs.
 */
export const TOP_CLASSES = Object.freeze(Array.from({ length: 12 }, (_, c) => Math.ceil(TOP_SEGMENT_MIN * 2 ** (c / 2))));

/**
 * @typedef {{ kind: string, first: number, count: number, segments: number }} TopRun
 * @typedef {{ width: number, base: number, camX: number, camY: number, ppv: number,
 *   squash: number, dpr: number }} TopFrame
 * @typedef {{ set: TopSet, frame: TopFrame, caps: number[], pads: number[], fresh: boolean,
 *   count: number, ids: Int32Array, from: Uint16Array, to: Uint16Array, fanA: Float32Array,
 *   fanB: Float32Array, runs: TopRun[], vertices: number }} TopDraws
 *   ids[k]: the set's thread drawn k-th (an index into set.from); from .. fanB: its instance data,
 *   packed in draw order; runs: one draw each, in TOP_ORDER, a kind's threads by class;
 *   fresh: whether the packing differs from prev's (the renderer uploads only then)
 */

const TOP_TAU = new Float64Array(2);
const TOP_HEIGHTS = new Float64Array(2);
/**
 * What the top pass draws this frame (GL review 2026-10-18): of the set's threads, those whose
 * ribbon touches the frame, by the main pass's own test (arcFrameTau on the drawn feet, the
 * heights frameHeights gives widened by the kind's ribbon half width), each kind in runs by
 * segment class (TOP_CLASSES), the threads of a class in the set's order. A kind is one ink, so
 * the order inside it does not change the picture; the kinds keep TOP_ORDER, the chosen last.
 * `prev` comes back as it is when nothing it reads changed.
 * @param {TopSet} set
 * @param {TopFrame} f  the frame and camera, device px (camY: the camera's height)
 * @param {ArrayLike<number>} caps  per TOP_ORDER kind: its most segments
 * @param {ArrayLike<number>} pads  per TOP_ORDER kind: its ribbon's half width, device px
 * @param {TopDraws | null} [prev]
 * @returns {TopDraws}
 */
export function topDraws(set, f, caps, pads, prev) {
  if (prev && prev.set === set && sameFrame(prev.frame, f) && sameList(prev.caps, caps) && sameList(prev.pads, pads)) return prev;
  const n = set.count;
  const W = f.width, half = W / 2, ppv = f.ppv;
  const s = f.squash > 0 ? f.squash : 1, d = f.dpr > 0 ? f.dpr : 1;
  frameHeights(f.base, f.camY, d, TOP_HEIGHTS);
  const cls = new Int8Array(n).fill(-1);
  const ids = new Int32Array(n);
  /** @type {TopRun[]} */
  const runs = [];
  const tally = new Int32Array(TOP_CLASSES.length);
  let at = 0, vertices = 0;
  for (const range of set.ranges) {
    if (!range.count) continue;
    const ki = TOP_ORDER.indexOf(range.kind);
    const cap = caps[ki] > TOP_SEGMENT_MIN ? caps[ki] : TOP_SEGMENT_MIN;
    const pad = pads[ki] > 0 ? pads[ki] : 0;
    const hLo = TOP_HEIGHTS[0] - pad, hHi = TOP_HEIGHTS[1] + pad;
    tally.fill(0);
    for (let j = range.first; j < range.first + range.count; j++) {
      // geometry.footX, without a camera object; the feet are in canon order
      const x0 = (set.from[j] + 0.5 + set.fanA[j] - f.camX) * ppv + half;
      const x1 = (set.to[j] + 0.5 + set.fanB[j] - f.camX) * ppv + half;
      const r = (x1 - x0) * 0.5;
      if (!arcFrameTau(x0, x1, W, (r > 0 ? r : 0) * s, hLo, hHi, TOP_TAU)) continue;
      const own = topSegmentsFor(x0, x1, W, s, d, cap);
      let c = 0;
      while (c < TOP_CLASSES.length - 1 && TOP_CLASSES[c] < own && TOP_CLASSES[c] < cap) c++;
      cls[j] = c;
      tally[c]++;
    }
    for (let c = 0; c < TOP_CLASSES.length; c++) {
      if (!tally[c]) continue;
      const segments = TOP_CLASSES[c] < cap ? TOP_CLASSES[c] : cap;
      runs.push({ kind: range.kind, first: at, count: tally[c], segments });
      for (let j = range.first; j < range.first + range.count; j++) if (cls[j] === c) ids[at++] = j;
      vertices += 2 * (segments + 1) * tally[c];
    }
  }
  const from = new Uint16Array(at), to = new Uint16Array(at);
  const fanA = new Float32Array(at), fanB = new Float32Array(at);
  for (let k = 0; k < at; k++) {
    const j = ids[k];
    from[k] = set.from[j]; to[k] = set.to[j]; fanA[k] = set.fanA[j]; fanB[k] = set.fanB[j];
  }
  let fresh = !prev || prev.set !== set || prev.count !== at;
  for (let k = 0; !fresh && k < at; k++) fresh = prev.ids[k] !== ids[k];
  return {
    set, frame: { width: W, base: f.base, camX: f.camX, camY: f.camY, ppv, squash: f.squash, dpr: f.dpr },
    caps: Array.from(caps), pads: Array.from(pads), fresh,
    count: at, ids, from, to, fanA, fanB, runs, vertices,
  };
}

/** @param {TopFrame} a @param {TopFrame} b */
function sameFrame(a, b) {
  return a.width === b.width && a.base === b.base && a.camX === b.camX && a.camY === b.camY
    && a.ppv === b.ppv && a.squash === b.squash && a.dpr === b.dpr;
}

/** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
function sameList(a, b) {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

/* ── the visible set (E1) ─────────────────────────────────────────────── */

/**
 * @typedef {{ density: string, count: number, ids: Uint16Array | Uint32Array,
 *   fx0: Float64Array, fx1: Float64Array, rankOf: Int32Array,
 *   footStart: Int32Array, foot: Int32Array, stamp: Uint32Array }} DrawOrder
 *   ids[rank]: the thread at that rank (an index into g.from); rankOf[id]: its rank, -1 outside the
 *   density; fx0, fx1: its feet as canon x (verse + 0.5 + fan: geometry.footX before the camera);
 *   foot[footStart[v] .. footStart[v + 1]): rank * 2 + (1 at its to-foot) for every foot standing in
 *   verse v; stamp: scratch for one pass's dedupe
 */

const ORDERS = new WeakMap();

/** Steps of the drawing order per octave of span: a step's threads differ by under 9% in span. */
export const ORDER_STEPS = 8;

/**
 * A thread's step in the drawing order: floor(ORDER_STEPS log2 span), spans under 1/1024 of a
 * verse taken as 1/1024.
 * @param {number} span  (to + fanB) - (from + fanA), in verses
 * @returns {number}
 */
export function spanStep(span) {
  return Math.floor(ORDER_STEPS * Math.log2(Math.max(span, 1 / 1024)));
}

/**
 * A density's threads in drawing order, cached per graph: ranked by the step of their span as
 * drawn (spanStep of (to + fanB) - (from + fanA), widest first, so the shortest lie on top), then
 * by their from-verse, then in asset order, with each verse's feet.
 * @param {any} g  the decoded graph
 * @param {import('./decode.js').Density} density
 * @returns {DrawOrder}
 */
export function drawOrder(g, density) {
  const which = density === 'essential' ? 'essential' : 'famous';
  let per = ORDERS.get(g);
  if (!per) { per = {}; ORDERS.set(g, per); }
  if (per[which]) return per[which];
  const count = g && g.count > 0 ? g.count : 0;
  const fans = count ? fansOf(g) : null;
  let n = 0;
  for (const b of (g && g.buckets) || []) n += Math.max(0, bucketDrawCount(b, which));
  const members = new Uint32Array(n);
  const step = new Int32Array(count);
  let at = 0;
  for (const b of (g && g.buckets) || []) {
    const end = b.off + Math.max(0, bucketDrawCount(b, which));
    for (let i = b.off; i < end; i++) {
      members[at++] = i;
      step[i] = spanStep((g.to[i] + fans.fanB[i]) - (g.from[i] + fans.fanA[i]));
    }
  }
  const from = g.from;
  members.sort((p, q) => step[q] - step[p] || from[p] - from[q] || p - q);
  const ids = count <= 0xffff ? new Uint16Array(n) : new Uint32Array(n);
  const rankOf = new Int32Array(count).fill(-1);
  const fx0 = new Float64Array(n), fx1 = new Float64Array(n);
  const total = g && g.total > 0 ? g.total : 0;
  const footStart = new Int32Array(total + 1);
  for (let r = 0; r < n; r++) {
    const i = members[r];
    ids[r] = i; rankOf[i] = r;
    fx0[r] = g.from[i] + 0.5 + fans.fanA[i];
    fx1[r] = g.to[i] + 0.5 + fans.fanB[i];
    footStart[g.from[i] + 1]++; footStart[g.to[i] + 1]++;
  }
  for (let v = 0; v < total; v++) footStart[v + 1] += footStart[v];
  const fill = footStart.slice(0, total);
  const foot = new Int32Array(2 * n);
  for (let r = 0; r < n; r++) {
    const i = members[r];
    foot[fill[g.from[i]]++] = r * 2;
    foot[fill[g.to[i]]++] = r * 2 + 1;
  }
  const order = { density: which, count: n, ids, fx0, fx1, rankOf, footStart, foot, stamp: new Uint32Array(n) };
  per[which] = order;
  return order;
}

/**
 * @typedef {{ serial: number, order: DrawOrder,
 *   width: number, base: number, squash: number, camX: number, camY: number, ppv: number, dpr: number,
 *   segments: Uint8Array, count: number, list: Uint16Array | Uint32Array,
 *   runs: number, runN: Int32Array, runFirst: Int32Array, runCount: Int32Array,
 *   vertices: number, anchored: number, all: boolean, scan: string }} FrameSet
 *   segments[rank]: the thread's segments, 0 when nothing of it is in the frame; count: how many are;
 *   list[0 .. count): their ids in rank order (the renderer's id stream, the labels' walk); runs: how
 *   many draws, the k-th over list[runFirst[k] .. runFirst[k] + runCount[k]) at runN[k] segments,
 *   its threads' most; vertices: the main pass's vertex invocations, the sum over the runs of
 *   2 (runN + 1) runCount; anchored: threads with a foot within FLYOVER_MARGIN of the frame
 *   (geometry.arcAnchored), in the frame or not; all: every thread of the density is in the frame;
 *   scan: 'all' (every rank was a candidate) or 'feet' (the feet window's)
 */

/**
 * What one more draw is worth, in vertex invocations: a run of the set splits where drawing its
 * threads at their own segment counts saves more than this. A draw call's fixed cost is some
 * microseconds of CPU and GPU, about what a phone GPU spends on a thousand vertices; on the asset
 * it keeps every frame to a few dozen draws (frame-set.test.js holds the bounds).
 */
export const RUN_DRAW_VERTICES = 1024;
/** The most runs a set holds: past it the last run takes the rest (never reached on the asset). */
export const RUN_CAP = 1024;

/** Two cameras per graph: the frame's, and one other (a test, a walk) without evicting it. */
const SLOTS = new WeakMap();
let SERIAL = 0;
const TAU = new Float64Array(2);
/* A run's rises, scratch for the cut: a thread's segments are a byte, so a run's most rises at most
   255 times. */
const RISE_AT = new Int32Array(256), RISE_FROM = new Int32Array(256);
const HEIGHTS = new Float64Array(2);
const FEET = new Int32Array(2);

/**
 * The frame's own window of verses for its candidates (see the file's header): the feet that can
 * hold a thread's body in the frame. A thread spanning the whole window with both feet a distance
 * d and d' (device px) past its edges stands at least squash sqrt(d (W + 2m)) high over the window
 * (the ellipse, from the nearer foot), so once d exceeds hHi^2 / (squash^2 (W + 2m)) nothing of it
 * can reach down into the frame. Returns [lo, hi], inclusive verses, a verse of slack for the fans.
 * @param {number} total @param {number} width @param {number} squash @param {number} hHi
 * @param {number} camX @param {number} ppv
 * @param {number[] | Int32Array} [out] - receives [lo, hi] (a fresh array when not given)
 * @returns {number[] | Int32Array}
 */
export function feetWindow(total, width, squash, hHi, camX, ppv, out) {
  const s = squash > 0 ? squash : 1;
  const reach = (hHi * hHi) / (s * s * (width + 2 * CLIP_MARGIN)) + 1;
  const lo = Math.floor((-CLIP_MARGIN - reach - width / 2) / ppv + camX) - 1;
  const hi = Math.ceil((width + CLIP_MARGIN + reach - width / 2) / ppv + camX) + 1;
  const o = out || [0, 0];
  o[0] = lo < 0 ? 0 : lo;
  o[1] = hi > total - 1 ? total - 1 : hi;
  return o;
}

/**
 * THE frame's visible set (see the file's header), for a camera and a frame given as numbers;
 * the same camera and frame return the same set without a second pass. A set stays valid until two
 * other cameras have been asked for on the same graph.
 * @param {any} g  the decoded graph
 * @param {import('./decode.js').Density} density
 * @param {number} width - the frame, device px
 * @param {number} base - its baseline row, device px
 * @param {number} squash - geometry.squashFactor
 * @param {number} camX @param {number} camY @param {number} ppv - the camera (camY: its height, device px)
 * @param {number} dpr
 * @returns {FrameSet}
 */
export function frameSetAt(g, density, width, base, squash, camX, camY, ppv, dpr) {
  const order = drawOrder(g, density);
  const y = camY > 0 ? camY : 0;
  const d = dpr > 0 ? dpr : 1;
  let slots = SLOTS.get(g);
  if (!slots) { slots = []; SLOTS.set(g, slots); }
  for (let k = 0; k < slots.length; k++) {
    const s = slots[k];
    if (s.order === order && s.width === width && s.base === base && s.squash === squash && s.camX === camX
      && s.camY === y && s.ppv === ppv && s.dpr === d) {
      if (k) { slots.splice(k, 1); slots.unshift(s); }
      return s;
    }
  }
  const N = order.count;
  let set = slots.length >= 2 ? slots.pop() : null;
  if (!set || set.order !== order) {
    const Ids = /** @type {any} */ (order.ids.constructor);
    set = /** @type {FrameSet} */ ({
      serial: 0, order, width: 0, base: 0, squash: 0, camX: 0, camY: 0, ppv: 0, dpr: 0,
      segments: new Uint8Array(N), count: 0, list: new Ids(N), runs: 0,
      runN: new Int32Array(RUN_CAP), runFirst: new Int32Array(RUN_CAP), runCount: new Int32Array(RUN_CAP),
      vertices: 0, anchored: 0, all: false, scan: 'all',
    });
  }
  slots.unshift(set);
  set.serial = ++SERIAL;
  set.width = width; set.base = base; set.squash = squash; set.camX = camX; set.camY = y; set.ppv = ppv; set.dpr = d;
  const seg = set.segments;
  seg.fill(0);
  const s = squash > 0 ? squash : 1;
  frameHeights(base, y, d, HEIGHTS);
  const hLo = HEIGHTS[0], hHi = HEIGHTS[1];
  const half = width / 2, m = CLIP_MARGIN, fm = FLYOVER_MARGIN, right = width + m;
  const { fx0, fx1, footStart, foot, stamp } = order;
  // the candidates: every rank, or the feet in the frame's own window once that is the smaller
  let cand = null, candCount = N;
  set.scan = 'all';
  if (N && ppv > 0 && g.total > 0) {
    feetWindow(g.total, width, s, hHi, camX, ppv, FEET);
    const vLo = FEET[0], vHi = FEET[1];
    const feet = vHi >= vLo ? footStart[vHi + 1] - footStart[vLo] : 0;
    if (feet < N / 2) {
      set.scan = 'feet';
      cand = set.list;   // scratch: the list is written after the pass, from the segments
      candCount = 0;
      const mark = set.serial >>> 0;
      const end = vHi >= vLo ? footStart[vHi + 1] : 0;
      for (let j = vHi >= vLo ? footStart[vLo] : 0; j < end; j++) {
        const rank = foot[j] >> 1;
        if (stamp[rank] === mark) continue;
        stamp[rank] = mark;
        cand[candCount++] = rank;
      }
    }
  }
  let count = 0, anchored = 0;
  for (let k = 0; k < candCount; k++) {
    const rank = cand ? cand[k] : k;
    const x0 = (fx0[rank] - camX) * ppv + half;
    const x1 = (fx1[rank] - camX) * ppv + half;
    // geometry.arcAnchored on the drawn feet: the crowding law counts these, in the frame or not
    if ((x0 >= -fm && x0 <= width + fm) || (x1 >= -fm && x1 <= width + fm)) anchored++;
    if (x1 < -m || x0 > right) continue;
    const r = (x1 - x0) * 0.5;
    const A = (r > 0 ? r : 0) * s;   // geometry.arcShape
    if (!arcFrameTau(x0, x1, width, A, hLo, hHi, TAU)) continue;
    const n = frameSegments(TAU[0], TAU[1], r, A, d);
    seg[rank] = n;
    count++;
  }
  // every id in rank order into the list, cut into runs as it goes (see the file's header): the
  // current run [start, start + len) at max segments, its rises (the k-th of `rises`: RISE_AT[k]
  // threads into the run its most went up from RISE_FROM[k]) and its tail since its last peak
  const { list, runN, runFirst, runCount } = set;
  const ids = order.ids;
  const lam = RUN_DRAW_VERTICES;
  let li = 0, runs = 0, start = 0, len = 0, max = 0, tailLen = 0, tailMax = 0, rises = 0;
  for (let rank = 0; rank < N && li < count; rank++) {
    const n = seg[rank];
    if (!n) continue;
    list[li++] = ids[rank];
    if (!len) { len = 1; max = n; rises = 0; continue; }
    const room = runs < RUN_CAP - 1;
    if (n > max) {
      if (room && 2 * len * (n - max) > lam) {
        // raising the run to n costs its threads more than a draw: n starts a run of its own
        runFirst[runs] = start; runCount[runs] = len; runN[runs] = max; runs++;
        start += len; len = 1; max = n; rises = 0;
      } else {
        // the tail's mirror, for counts that climb (the widest-first order deep in, where the long
        // legs need few segments and the arches after them many): the threads before one of the
        // run's rises, raised to n, would pay more than a draw over their own most; the dearest
        // such head becomes a run of its own
        let cut = -1, dearest = lam;
        for (let k = 0; k < rises; k++) {
          const cost = 2 * RISE_AT[k] * (n - RISE_FROM[k]);
          if (cost > dearest) { dearest = cost; cut = k; }
        }
        if (room && cut >= 0) {
          const head = RISE_AT[cut];
          runFirst[runs] = start; runCount[runs] = head; runN[runs] = RISE_FROM[cut]; runs++;
          start += head; len -= head;
          let j = 0;
          for (let k = cut + 1; k < rises; k++, j++) { RISE_AT[j] = RISE_AT[k] - head; RISE_FROM[j] = RISE_FROM[k]; }
          rises = j;
        }
        RISE_AT[rises] = len; RISE_FROM[rises] = max; rises++;
        len++; max = n;
      }
      tailLen = 0; tailMax = 0;
      continue;
    }
    len++;
    if (n === max) { tailLen = 0; tailMax = 0; continue; }
    tailLen++;
    if (n > tailMax) tailMax = n;
    // the threads since the run's last peak are cheaper by more than a draw at their own most
    if (room && 2 * tailLen * (max - tailMax) > lam) {
      runFirst[runs] = start; runCount[runs] = len - tailLen; runN[runs] = max; runs++;
      start += len - tailLen; len = tailLen; max = tailMax; tailLen = 0; tailMax = 0; rises = 0;
    }
  }
  if (len) { runFirst[runs] = start; runCount[runs] = len; runN[runs] = max; runs++; }
  let vertices = 0;
  for (let k = 0; k < runs; k++) vertices += 2 * (runN[k] + 1) * runCount[k];
  set.runs = runs;
  set.count = count;
  set.vertices = vertices;
  set.anchored = anchored;
  set.all = count === N;
  return set;
}

/**
 * The visible set for a camera and a view (pick.js, the overlay): frameSetAt over the view's frame.
 * @param {any} g
 * @param {{x:number, y?:number, ppv:number}} cam
 * @param {{width:number, base:number, squash:number, density:import('./decode.js').Density, dpr?:number}} view
 * @param {number} [dpr]  the device pixel ratio when the view does not carry one
 * @returns {FrameSet}
 */
export function frameSet(g, cam, view, dpr) {
  return frameSetAt(g, view.density, view.width, view.base, view.squash, cam.x, cam.y > 0 ? cam.y : 0, cam.ppv,
    view.dpr > 0 ? view.dpr : (dpr > 0 ? dpr : 1));
}

/**
 * Whether thread i is in the set: drawn, and so countable, labellable and pickable.
 * @param {FrameSet} set @param {number} i
 */
export function inFrame(set, i) {
  if (set.all) return set.order.rankOf[i] >= 0;
  const rank = set.order.rankOf[i];
  return rank >= 0 && set.segments[rank] > 0;
}
