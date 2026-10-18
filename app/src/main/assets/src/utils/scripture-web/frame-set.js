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
   (ORDER_STEPS), so the draw is shortest first and the widest on top, in
   the same order at every zoom: the web is blended over (premultiplied), so
   the order IS the picture, and a thread never changes layer as the reader
   zooms (C20). Within a step the threads go by x (their from-verse, then
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
              (GL item 4; Q1 a): the Bible Studies' prophecy and its fulfilment
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

import { fansOf, bucketDrawCount } from './decode.js';
import {
  arcFrameTau, frameSegments, frameHeights, CLIP_MARGIN, FLYOVER_MARGIN,
} from './geometry.js';

/** The top pass's kinds, in drawing order: the chosen line last, on top. */
export const TOP_ORDER = Object.freeze(['prophecy', 'lit', 'hover', 'chosen']);

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
 *   fanA: Float32Array, fanB: Float32Array, ranges: TopRange[], litKey: string,
 *   hoverArc: number, focusArc: number, focusProphecy: number }} TopSet
 *   litKey .. focusProphecy: the ask it was built for, as topSetKey reads it (-1 for none)
 */

/**
 * The key of the frame's top set: what is lit, hovered and chosen (the
 * prophecy class is the graph's own, the same every frame).
 * @param {{ litKey?: string, hoverArc?: number, focusArc?: number, focusProphecy?: number }} v
 */
export function topSetKey(v) {
  return (v.litKey || '') + '|' + askOf(v.hoverArc) + '|' + askOf(v.focusArc) + '|' + askOf(v.focusProphecy);
}

/** One asked-about index as the key reads it: -1 for none. @param {number | null | undefined} x */
function askOf(x) {
  return x == null || !(x >= 0) ? -1 : x;
}

/**
 * The top pass's threads for one frame, as instance data in TOP_ORDER: every
 * prophecy pair, the lit arcs, the hovered arc (unless it is the chosen
 * one), the chosen thread. `prev` comes back as it is when nothing changed
 * (its key) and it was built over the same graph.
 * @param {any} g  the decoded graph
 * @param {{ lit?: ArrayLike<number> | null, litKey?: string, hoverArc?: number,
 *   focusArc?: number, focusProphecy?: number }} v  the frame's view args (webViewArgs)
 * @param {TopSet | null} [prev]
 * @returns {TopSet}
 */
export function topSet(g, v, prev) {
  const ps = prophecySet(g);
  // the same ask, field by field: a frame that changes nothing builds no key (E3)
  if (prev && prev.ranges.length && prev.ranges[0].count === ps.unique && prev.litKey === (v.litKey || '')
    && prev.hoverArc === askOf(v.hoverArc) && prev.focusArc === askOf(v.focusArc)
    && prev.focusProphecy === askOf(v.focusProphecy)) return prev;
  const key = topSetKey(v);
  const count = g && g.count > 0 ? g.count : 0;
  const isArc = (i) => i != null && i >= 0 && i < count && Number.isInteger(i);
  const arcs = { lit: /** @type {number[]} */ ([]), hover: /** @type {number[]} */ ([]), chosen: /** @type {number[]} */ ([]) };
  if (v.lit) for (let k = 0; k < v.lit.length; k++) if (isArc(v.lit[k])) arcs.lit.push(v.lit[k]);
  if (isArc(v.hoverArc) && v.hoverArc !== v.focusArc) arcs.hover.push(/** @type {number} */ (v.hoverArc));
  if (isArc(v.focusArc)) arcs.chosen.push(/** @type {number} */ (v.focusArc));
  const chosenPair = !isArc(v.focusArc) && v.focusProphecy != null && v.focusProphecy >= 0
    && v.focusProphecy < ps.count ? v.focusProphecy : -1;
  const total = ps.unique + arcs.lit.length + arcs.hover.length + arcs.chosen.length + (chosenPair >= 0 ? 1 : 0);
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
    if (kind === 'prophecy' && ps.unique === ps.count) {
      from.set(ps.from, at); to.set(ps.to, at); fanA.set(ps.fanA, at); fanB.set(ps.fanB, at);
      at += ps.count;
    } else if (kind === 'prophecy') {
      // a pair given twice is drawn once: twice, its line would carry double ink
      for (let k = 0; k < ps.count; k++) {
        if (ps.twin[k] !== k) continue;
        from[at] = ps.from[k]; to[at] = ps.to[k]; fanA[at] = ps.fanA[k]; fanB[at] = ps.fanB[k];
        at++;
      }
    } else {
      for (const i of arcs[kind]) putArc(i);
    }
    if (kind === 'chosen' && chosenPair >= 0) {
      from[at] = ps.from[chosenPair]; to[at] = ps.to[chosenPair];
      fanA[at] = ps.fanA[chosenPair]; fanB[at] = ps.fanB[chosenPair];
      at++;
    }
    ranges.push({ kind, first, count: at - first });
  }
  return {
    key, count: total, from, to, fanA, fanB, ranges, litKey: v.litKey || '',
    hoverArc: askOf(v.hoverArc), focusArc: askOf(v.focusArc), focusProphecy: askOf(v.focusProphecy),
  };
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
 * drawn (spanStep of (to + fanB) - (from + fanA), shortest first), then by their from-verse, then
 * in asset order, with each verse's feet.
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
  members.sort((p, q) => step[p] - step[q] || from[p] - from[q] || p - q);
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
  // current run [start, start + len) at max segments, and its tail since its last peak
  const { list, runN, runFirst, runCount } = set;
  const ids = order.ids;
  const lam = RUN_DRAW_VERTICES;
  let li = 0, runs = 0, start = 0, len = 0, max = 0, tailLen = 0, tailMax = 0;
  for (let rank = 0; rank < N && li < count; rank++) {
    const n = seg[rank];
    if (!n) continue;
    list[li++] = ids[rank];
    if (!len) { len = 1; max = n; continue; }
    const room = runs < RUN_CAP - 1;
    if (n > max) {
      // raising the run to n costs its threads more than a draw: n starts a run of its own
      if (room && 2 * len * (n - max) > lam) {
        runFirst[runs] = start; runCount[runs] = len; runN[runs] = max; runs++;
        start += len; len = 1; max = n;
      } else { len++; max = n; }
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
      start += len - tailLen; len = tailLen; max = tailMax; tailLen = 0; tailMax = 0;
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
