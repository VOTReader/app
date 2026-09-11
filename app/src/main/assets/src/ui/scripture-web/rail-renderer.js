/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/rail-renderer — Cluster F (esbuild bundle-f.js)

   "My web" — the reader's own links, drawn as a dual rail.

   The canonical web is one axis because scripture is one sequence. A personal
   web spans two corpora, so it gets two: scripture along the BOTTOM (the same
   axis, the same ruler, the same camera as the canonical view, so the mental
   model carries over) and the Volumes of Truth along the TOP in READING_CHAIN
   order. A link between the two is a ribbon spanning the gap; a link inside
   one corpus is an arc that leaves and returns to its own rail.

   This is Canvas2D, not WebGL, and that is deliberate: a hand-made link
   collection is hundreds of records, not hundreds of thousands. 2D gives
   crisper thin curves, free dashes and text, and no second GL program to keep
   in sync — and it stays fast until the reader has tens of thousands of
   links, which is years away and would be a good problem to have.
   ═══════════════════════════════════════════════════════════════════════ */

import { myWebColor, myWebCanonT, myWebBinColor, CONTEXT_BINS } from '../../utils/scripture-web/palette.js';

/** Clearance below the top chrome before the VOT rail is drawn, in CSS px. */
const TOP_INSET = 96;
/** Curve tension for inter-rail ribbons: how far control points push out. */
const RIBBON_BOW = 0.42;
/** An endpoint this far past the screen edge still counts as on screen (device px). */
export const EDGE_MARGIN = 24;
/** How far past the screen edge a thread to an off-screen book completes its
 * rise, as a fraction of the width; grows with the log of the distance so a
 * thread to a far book exits shallower than one to the next book over. */
const REACH_MARGIN = 0.12;
/** A thread to a FAR-off book (more than a screen away, blended in over one
 * to three screens) completes its rise within this many gaps of its visible
 * end and then runs level along the far rail: on a frame whose gap is a
 * fraction of its width (800x360: 144 px under 800) a rise spread over the
 * whole width is a shallow streak, and 2,095 of them are the field again. */
const REACH_GAPS = 1.4;
/** The level run along the far rail is drawn at this share of the thread's alpha. */
export const RUN_ALPHA = 0.3;
/** Layers per colour bin while a gesture is live (opts.capFraction 0): about
 * 250 strokes a frame instead of a thousand, so a pinch on a phone keeps its
 * frames; at rest the cap is the full one (every visible layer) and the
 * picture is the approved one. Between the two the cap follows a coverage
 * ease, so the corridors brighten back over the fade without a step. */
export const LIVE_CAP = 16;

/**
 * Where the two rails sit.
 *
 * The scripture rail keeps the canonical baseline so the bottom axis is
 * identical in both modes. The VOT rail takes the top of the frame rather
 * than a fraction of the baseline — a personal web has no dome to centre, so
 * anchoring it high uses the height the arcs actually need instead of
 * leaving a dead band above.
 *
 * @param {{H:number, DPR:number}} v
 * @param {number} base — the scripture baseline (shared with the canonical view)
 */
export function railFrame(v, base) {
  const top = Math.min(TOP_INSET * v.DPR, base * 0.4);
  return { bottomY: base, topY: top };
}

/**
 * A position on the VOT rail → device px, THROUGH the camera.
 *
 * The VOT rail is still its own even axis — the corpus has no verse-count
 * geometry to honour, so its letters are spread evenly and sparse early data
 * stays legible instead of bunched. What changed is "evenly across WHAT".
 * Spreading across the VIEWPORT pins the rail to the screen, so the reader
 * zooms the Bible half while the Volumes half sits still (Corbin, 2026-09-05).
 * Spreading across the same VERSE SPAN the bottom rail uses, and mapping that
 * through the same camera, keeps the axis even and makes both halves move
 * together. At fit zoom the two forms are algebraically equal, so the overview
 * does not move at all — pinned by rail-camera.test.js.
 *
 * This is the ONLY place a rail position becomes an x. Three call sites used
 * to do it by hand (the endpoint and both ends of every collection band), and
 * a fix that moved one and not the others would be worse than no fix: before,
 * every reading was wrong and they at least AGREED.
 *
 * @param {number} pos — rail position, 0..votRail.total
 * @param {{verseX:(v:number)=>number, votX?:(p:number)=>number, votRail:{total:number}, verseTotal:number}} opts
 * @returns {number}
 */
export function votRailX(pos, opts) {
  const total = opts.verseTotal;
  // A missing verseTotal makes every top-rail x NaN: an invisible rail and a
  // dead hit test, which reads as a rendering bug rather than the wiring bug
  // it is. A null must never be able to impersonate a value.
  if (!(total > 0)) {
    throw new TypeError('rail-renderer: opts.verseTotal (the camera verse count) is required');
  }
  // r2: the Volumes rail carries its OWN camera when the screen gives one
  // (opts.votX), so the two rails zoom and pan independently; a caller with
  // one camera keeps the shared-span mapping.
  if (opts.votX) return opts.votX(pos);
  return opts.verseX((pos / Math.max(opts.votRail.total, 1)) * total);
}

/**
 * Where one collection's band sits on screen, and the room its name has.
 *
 * `null` when the band has left the frame entirely: at depth most of the rail
 * is off screen, and a band nobody can see is not measured or painted. A band
 * the frame CUTS keeps its label over the visible part — a name printed at the
 * true midpoint of a forty-screen-wide band is a name nobody ever sees. Both
 * clips are no-ops at fit zoom, where every band lies inside [0, width].
 *
 * @param {{start:number, count:number}} seg
 * @param {{verseX:(v:number)=>number, votRail:{total:number}, verseTotal:number,
 *   width:number}} opts
 * @returns {{x0:number, x1:number, labelX:number, room:number}|null}
 */
export function segmentSpan(seg, opts) {
  const x0 = votRailX(seg.start, opts);
  const x1 = votRailX(seg.start + seg.count, opts);
  if (x1 < 0 || x0 > opts.width) return null;
  const l = Math.max(x0, 0), r = Math.min(x1, opts.width);
  return { x0, x1, labelX: (l + r) / 2, room: r - l };
}

/**
 * The on-screen point of one endpoint. Both rails go through the same camera;
 * only the axis differs (see votRailX).
 *
 * @param {{rail:number, pos:number}} side
 * @param {{verseX:(v:number)=>number, votRail:{total:number}, verseTotal:number,
 *   width:number}} opts
 * @param {{bottomY:number, topY:number}} rails
 * @returns {[number, number]}
 */
export function endpointPoint(side, opts, rails) {
  if (side.rail === 1) return [votRailX(side.pos + 0.5, opts), rails.topY];
  return [opts.verseX(side.pos), rails.bottomY];
}

/**
 * Sample a link's curve. Inter-rail links bow outward as a cubic; intra-rail
 * links are the same half-ellipse the canonical view uses, so both webs share
 * one visual grammar. Returns [x, y] pairs.
 *
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {boolean} crossRail
 * @param {number|{n?:number, up?:boolean, maxRy?:number}} [steps]
 * @returns {Array<[number, number]>}
 */
export function linkPath(ax, ay, bx, by, crossRail, steps) {
  const pts = [];
  const opts = (typeof steps === 'number' || steps == null) ? {} : steps;
  const n = (typeof steps === 'number' ? steps : opts.n) || 24;
  if (crossRail) {
    const dy = by - ay;
    const c1 = [ax, ay + dy * RIBBON_BOW];
    const c2 = [bx, by - dy * RIBBON_BOW];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * u * ax + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * bx;
      const y = u * u * u * ay + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * by;
      pts.push([x, y]);
    }
    return pts;
  }
  // Same-rail: a half-ellipse bulging INTO the gap between the rails — up
  // from the bottom rail, down from the top — and never taller than the gap,
  // so a Genesis-to-Revelation link stays on screen instead of arcing out of
  // the frame the way an unclamped semicircle would.
  const rx = Math.abs(bx - ax) / 2;
  const cx = (ax + bx) / 2;
  const dir = opts.up === false ? 1 : -1;
  const maxRy = opts.maxRy || rx;
  const ry = Math.min(rx, maxRy);
  for (let i = 0; i <= n; i++) {
    const th = Math.PI * (1 - i / n);
    pts.push([cx + rx * Math.cos(th), ay + dir * ry * Math.sin(th)]);
  }
  return pts;
}

/**
 * The r2 thread: a link is a LINE WITH ENDPOINTS ON ITS BOOKS at every zoom.
 *
 * linkPath() above is the overview shape. At depth an endpoint can sit
 * thousands of px off screen, and the cubic's control points hang straight
 * under each endpoint, so every such thread crossed the screen flat at mid
 * gap: 2,095 of them made Corbin's cream band (measured 0.45-0.48 of the
 * band's rows lit edge to edge at 10.5x). Here:
 *   - neither endpoint on screen -> null. Nothing visible to attach to, so
 *     nothing is drawn (context) and nothing is pickable.
 *   - one endpoint on screen -> the thread completes its rise within a REACH
 *     of that endpoint (the distance to the screen edge plus a margin that
 *     grows with the log of the distance to the far book), so on screen it is
 *     a line leaving its book toward the far one, and the level run to the
 *     far endpoint lies off screen. Continuous with the both-visible shape:
 *     while the far end is within reach the two are the same curve.
 *   - both on screen -> the overview shape (ribbon cubic, half-ellipse).
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {boolean} crossRail
 * @param {{width:number, gap:number, up?:boolean, maxRy?:number, n?:number}} o
 * @returns {Array<[number, number]>|null}
 */
export function threadPath(a, b, crossRail, o) {
  const W = o.width;
  const on = (p) => p[0] >= -EDGE_MARGIN && p[0] <= W + EDGE_MARGIN;
  const onA = on(a), onB = on(b);
  if (!onA && !onB) return null;
  const adx = Math.abs(b[0] - a[0]);
  const n = o.n || 24;
  // the reach from the visible end toward the far one
  const vis = onA ? a : b, far = onA ? b : a;
  const sign = far[0] >= vis[0] ? 1 : -1;
  const distToEdge = sign > 0 ? (W + EDGE_MARGIN) - vis[0] : vis[0] + EDGE_MARGIN;
  const capEdge = distToEdge + W * REACH_MARGIN * (1 + Math.log10(1 + adx / W));
  const capGap = Math.min(capEdge, (o.gap || W) * REACH_GAPS);
  // smoothstep over adx from one screen to three: a far end just off screen
  // keeps the edge reach (continuous with the on-screen shape), a far-off one
  // dives within REACH_GAPS of its visible end
  const sf = Math.min(1, Math.max(0, (adx - W) / (2 * W)));
  const far3 = sf * sf * (3 - 2 * sf);
  const reach = (onA && onB) ? adx : Math.min(adx, capEdge + (capGap - capEdge) * far3);
  let pts;
  let rise = -1;   // index of the last sample of the rise; the run to the far end follows
  if (crossRail) {
    // a cubic from the visible end to where the rise completes, then level to the far end
    const ex = vis[0] + sign * reach, ey = far[1];
    const dy = ey - vis[1];
    const c1 = [vis[0], vis[1] + dy * RIBBON_BOW], c2 = [ex, ey - dy * RIBBON_BOW];
    pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * u * vis[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * ex,
        u * u * u * vis[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ey]);
    }
    if (reach < adx) { rise = pts.length - 1; pts.push([far[0], far[1]]); }
  } else {
    // a quarter-ellipse rising over `reach` (never more than the half span),
    // a level run at the apex, a quarter down to the far end
    const rxFull = adx / 2;
    const rx = Math.min(rxFull, reach);
    const dir = o.up === false ? 1 : -1;
    const ry = Math.min(rxFull, o.maxRy || rxFull);
    const half = Math.ceil(n / 2);
    pts = [];
    for (let i = 0; i <= half; i++) {
      const th = (Math.PI / 2) * (i / half);
      pts.push([vis[0] + sign * rx * (1 - Math.cos(th)), vis[1] + dir * ry * Math.sin(th)]);
    }
    if (rx < rxFull) { rise = pts.length - 1; pts.push([far[0] - sign * rx, vis[1] + dir * ry]); }
    for (let i = 1; i <= half; i++) {
      const th = (Math.PI / 2) * (1 - i / half);
      pts.push([far[0] - sign * rx * (1 - Math.cos(th)), vis[1] + dir * ry * Math.sin(th)]);
    }
  }
  if (!onA) { pts.reverse(); if (rise >= 0) rise = pts.length - 1 - rise; }
  pts[0] = [a[0], a[1]]; pts[pts.length - 1] = [b[0], b[1]];
  /** @type {any} */ (pts).rise = rise;
  /** @type {any} */ (pts).fromA = onA;
  return pts;
}

/**
 * The context's stroke batches. A thread's ink must ACCUMULATE where threads
 * overlap (a corridor of forty citations reads darker than one; R1), and
 * overlapping segments of ONE path are painted once, so a thread cannot share
 * a path with a thread it runs along. Two threads run along each other when
 * EITHER end sits within a few stroke widths of the other's on screen: at 1x
 * forty Matthew notes to one letter converge on it and overlap for half their
 * length whatever verses they leave from. So within a colour bin the threads
 * are sorted by their Bible end and each takes the lowest layer no such
 * neighbour (either end within `near` device px) already holds. Corridor
 * members get their own layers; threads that merely cross share one, and
 * lose accumulation only at the crossing. The 5080
 * read 8.3 ms a frame with a stroke per thread (2,100 strokeStyle changes
 * and stroke() calls) and 4.2 with one path: the batches bring the count to
 * the number of (bin, layer) pairs in view.
 *
 * The rise of a thread is stroked at the context's alpha; the level run along
 * the far rail (when there is one) at RUN_ALPHA of it, in its own batch, so a
 * thread to an off-screen book reads as a line diving into its rail.
 */
/**
 * Layers a corridor keeps at this alpha: the full count is the one past which
 * one more thread moves a pixel by under 1/255; the live count is LIVE_CAP;
 * between them the cap is chosen so the corridor's COVERAGE eases linearly
 * (smoothstep) in the fraction, never the layer count, because coverage is
 * what the eye sees and the first layers carry most of it.
 * @param {number} alpha
 * @param {number} f 0 live .. 1 full
 */
export function layerCap(alpha, f) {
  const a = Math.min(0.99, Math.max(0.001, alpha));
  const full = Math.max(1, Math.ceil(Math.log(1 / 255) / Math.log(1 - a)));
  const live = Math.min(full, LIVE_CAP);
  const u = Math.min(1, Math.max(0, f));
  if (u >= 1) return full;
  if (u <= 0) return live;
  const s = u * u * (3 - 2 * u);
  const cLive = 1 - Math.pow(1 - a, live), cFull = 1 - Math.pow(1 - a, full);
  const c = cLive + (cFull - cLive) * s;
  return Math.min(full, Math.max(live, Math.ceil(Math.log(1 - c) / Math.log(1 - a))));
}

class ContextBatches {
  constructor() {
    /** @type {Array<{bin:number, bx:number, tx:number, layer:number, pts:Array<[number, number]>}>} */
    this.threads = [];
  }
  /**
   * @param {number} t canon position 0..1
   * @param {number} bx the Bible end's x (device px)
   * @param {number} tx the Volumes end's x (device px)
   * @param {Array<[number, number]>} pts
   */
  add(t, bx, tx, pts) {
    this.threads.push({ bin: Math.min(CONTEXT_BINS - 1, Math.floor(t * CONTEXT_BINS)), bx, tx, layer: 0, pts });
  }
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} alpha
   * @param {number} near device px within which two ends count as one line
   * @param {number} [capFraction] 0 = live cap, 1 = full (default)
   * @returns {number} strokes made
   */
  stroke(ctx, alpha, near, capFraction) {
    const th = this.threads;
    th.sort((p, q) => p.bin - q.bin || p.bx - q.bx);
    /** @type {Map<number, Array<{pts:Array<[number, number]>, i0:number, i1:number}>>} */
    const paths = new Map();
    const push = (bin, layer, run, pts, i0, i1) => {
      const key = (bin * 4096 + Math.min(layer, 4095)) * 2 + run;
      let list = paths.get(key);
      if (!list) { list = []; paths.set(key, list); }
      list.push({ pts, i0, i1 });
    };
    // Layers beyond which one more thread moves a pixel by under 1/255 at this
    // alpha: (1 - alpha)^n * 255 < 1. 0.04 at 1x needs 136 of them, 0.23 at
    // 10x needs 21, 0.45 needs 9; past the cap threads share and nothing shows.
    const cap = layerCap(alpha, capFraction == null ? 1 : capFraction);
    const held = new Int32Array(cap + 1);   // stamp = i + 1 when a neighbour holds that layer
    let binStart = 0;
    for (let i = 0; i < th.length; i++) {
      const e = th[i];
      if (i > 0 && th[i - 1].bin !== e.bin) binStart = i;
      // neighbours by the Bible end are adjacent in the sort; by the Volumes
      // end they can be anywhere in the bin
      for (let j = i - 1; j >= binStart; j--) {
        if (e.bx - th[j].bx <= near || Math.abs(th[j].tx - e.tx) <= near) held[th[j].layer] = i + 1;
      }
      let layer = 0;
      while (layer < cap && held[layer] === i + 1) layer++;
      e.layer = layer;
      const rise = /** @type {any} */ (e.pts).rise;
      const fromA = /** @type {any} */ (e.pts).fromA;
      if (rise < 0) push(e.bin, layer, 0, e.pts, 0, e.pts.length - 1);
      // the rise is [0..rise] when the visible end is a, [rise..end] when it is b
      else if (fromA) { push(e.bin, layer, 0, e.pts, 0, rise); push(e.bin, layer, 1, e.pts, rise, e.pts.length - 1); }
      else { push(e.bin, layer, 1, e.pts, 0, rise); push(e.bin, layer, 0, e.pts, rise, e.pts.length - 1); }
    }
    let n = 0;
    // keys sort by bin, then layer, then run: consecutive paths mostly share a
    // style, and a strokeStyle set is a colour parse the canvas need not repeat
    const keys = [...paths.keys()].sort((p, q) => p - q);
    let last = '';
    for (const key of keys) {
      const list = paths.get(key);
      const run = key & 1, bin = Math.floor(key / 8192);
      const style = 'rgba(' + myWebBinColor(bin) + ',' + (run ? alpha * RUN_ALPHA : alpha) + ')';
      if (style !== last) { ctx.strokeStyle = style; last = style; }
      ctx.beginPath();
      for (const seg of list) {
        ctx.moveTo(seg.pts[seg.i0][0], seg.pts[seg.i0][1]);
        for (let k = seg.i0 + 1; k <= seg.i1; k++) ctx.lineTo(seg.pts[k][0], seg.pts[k][1]);
      }
      ctx.stroke();
      n++;
    }
    return n;
  }
}

/**
 * Distance from a point to a polyline, for hit testing.
 * @param {Array<[number, number]>} pts
 * @param {number} px
 * @param {number} py
 */
export function distanceToPath(pts, px, py) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const dx = x2 - x1, dy = y2 - y1;
    const len = dx * dx + dy * dy;
    let t = len > 0 ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = x1 + t * dx, qy = y1 + t * dy;
    const d = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Draw the personal web.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{count:number, aRail:Uint8Array, bRail:Uint8Array, aPos:Float32Array,
 *   bPos:Float32Array, kind:Uint8Array}|null} personal
 * @param {{count:number, versePos:Float32Array, votPos:Float32Array}|null} underlay
 * @param {{verseX:(v:number)=>number, votX?:(p:number)=>number, votRail:any, verseTotal:number, width:number, height:number,
 *   DPR:number, base:number, chrome:any, showUnderlay?:boolean, capFraction?:number,
 *   hoverIndex?:number, focusIndex?:number}} opts
 */
/**
 * The My Web ink law (design-perf, 2026-09-10; the note is
 * sessions/2026-09-10-orchestrator/myweb-visual-design.md, every number in it
 * measured). z = the corpus's on-screen width / the screen width: 1 at
 * overview, 1.8^n after n zoom steps.
 *
 * Context (the Volumes' own citations) is cream, faint per edge at overview
 * so corridors glow where citations pile and a lone thread whispers, rising
 * with zoom so a thread reads on its own at depth (0.15 at 5.8x, 0.45 at
 * 40x). The reader's links are the only saturated ink: their kind colour,
 * wider (2.0 -> 2.6 with depth, like a canon ribbon), haloed, pinned at both
 * ends. The unit test reads this export; the walk reads the pixels it makes.
 */
export function personalInk(z) {
  const zz = Math.max(1, z || 1);
  const t = Math.min(1, Math.log(zz) / Math.log(40));
  return {
    // each thread's rgb comes from myWebColor() (its canon position); only
    // the alpha and width are the ink law's
    context: { rgb: '204,196,180', alpha: Math.min(0.45, 0.04 * Math.pow(zz, 0.75)), width: 0.8 + 0.5 * t },
    // the link thickens with depth like a canon ribbon (2.0 -> 2.6 at 40x), so it
    // stays 6x a context thread with its halo even where the thread is 0.45 · 1.3
    link: { alpha: 0.95, width: 2.0 + 0.6 * t, halo: 7, haloAlpha: 0.16, dot: 3, ring: 5.5,
      hoverWidth: 3 + 0.6 * t, hoverHalo: 11, hoverHaloAlpha: 0.3 },
  };
}

export function drawPersonalWeb(ctx, personal, underlay, opts) {
  const { width, DPR, base, chrome, votRail, verseX } = opts;
  const rails = railFrame({ H: opts.height, DPR }, base);
  /* One palette. The Scripture Web is dark regardless of the app's theme
     (owner call, 2026-09-10), so these were a branch that could not be taken --
     dead code that reads as live, which is how the next reader concludes the
     rail still has a light mode. */
  const ink = '235,231,222';
  const gold = '232,192,80';

  // ── the two rails ──
  ctx.lineWidth = DPR;
  ctx.strokeStyle = 'rgba(' + gold + ',0.30)';
  ctx.beginPath();
  ctx.moveTo(0, rails.bottomY + 1.5 * DPR); ctx.lineTo(width, rails.bottomY + 1.5 * DPR);
  ctx.moveTo(0, rails.topY); ctx.lineTo(width, rails.topY);
  ctx.stroke();

  // VOT collection segments + names along the top rail
  if (votRail && votRail.segments && votRail.total > 0) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = '600 ' + (chrome.fsLabel * DPR) + 'px Cinzel,Georgia,serif';
    let row = 0;
    for (const seg of votRail.segments) {
      if (!seg.count) continue;
      const span = segmentSpan(seg, opts);
      if (!span) continue;
      ctx.strokeStyle = 'rgba(' + gold + ',0.22)';
      ctx.beginPath();
      ctx.moveTo(span.x0, rails.topY - 7 * DPR); ctx.lineTo(span.x0, rails.topY);
      ctx.stroke();
      // Measure before drawing: collection names are long ("Words To Live By:
      // Part One"), and printing one that doesn't fit just overlaps its
      // neighbour into mush. Alternate rows buy width for the tighter ones.
      const label = (seg.short || seg.label).toUpperCase();
      const w = ctx.measureText(label).width;
      const room = span.room;
      if (w <= room - 6 * DPR) {
        ctx.fillStyle = 'rgba(' + ink + ',0.8)';
        ctx.fillText(label, span.labelX, rails.topY - 11 * DPR);
      } else if (w <= room * 2) {
        row = 1 - row;
        ctx.fillStyle = 'rgba(' + ink + ',0.62)';
        ctx.fillText(label, span.labelX, rails.topY - (row ? 27 : 11) * DPR);
      }
    }
  }

  // ── the corpus's own curated edges, as context ──
  const zB = opts.verseTotal ? (verseX(opts.verseTotal) - verseX(0)) / width : 1;
  const zV = (votRail && votRail.total && opts.votX) ? (opts.votX(votRail.total) - opts.votX(0)) / width : zB;
  const z = Math.max(zB, zV);
  const gap = Math.abs(rails.bottomY - rails.topY);
  const geo = { width, gap };
  if (underlay && opts.showUnderlay && underlay.count) {
    const cx = personalInk(z).context;
    // FULL RESOLUTION, on the canvas the reader sees (Corbin, 2026-09-11:
    // the half-resolution layer read as "low resolution"). One stroke per
    // edge so corridors accumulate; a thread with no visible endpoint is not
    // drawn at all (threadPath), which is what keeps depth clean.
    ctx.lineWidth = cx.width * DPR;
    ctx.lineCap = 'round';
    const batches = new ContextBatches();
    for (let i = 0; i < underlay.count; i++) {
      const a = /** @type {[number, number]} */ ([verseX(underlay.versePos[i]), rails.bottomY]);
      const b = endpointPoint({ rail: 1, pos: underlay.votPos[i] }, opts, rails);
      const pts = threadPath(a, b, true, Object.assign({ n: 12 }, geo));
      if (!pts) continue;
      batches.add(myWebCanonT({ verse: underlay.versePos[i], verseTotal: opts.verseTotal }), a[0], b[0], pts);
    }
    batches.stroke(ctx, cx.alpha, ctx.lineWidth * 4, opts.capFraction);
  }

  if (!personal || !personal.count) return rails;

  // ── the reader's links: halo pass first so no halo covers a neighbour's core ──
  const L = personalInk(z).link;
  const paths = [];
  for (let i = 0; i < personal.count; i++) {
    const a = endpointPoint({ rail: personal.aRail[i], pos: personal.aPos[i] }, opts, rails);
    const b = endpointPoint({ rail: personal.bRail[i], pos: personal.bPos[i] }, opts, rails);
    const cross = personal.aRail[i] !== personal.bRail[i];
    const pts = threadPath(a, b, cross, Object.assign({ n: 28, up: personal.aRail[i] === 0, maxRy: gap * 0.78 }, geo));
    const rgb = myWebColor({ link: true });
    paths.push({ a, b, pts, rgb });
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < personal.count; i++) {
    const { pts, rgb } = paths[i];
    if (!pts) continue;
    const hot = i === opts.hoverIndex || i === opts.focusIndex;
    const dim = (opts.focusIndex >= 0 && i !== opts.focusIndex) ? 0.18 : 1;
    ctx.strokeStyle = 'rgba(' + rgb + ',' + ((hot ? L.hoverHaloAlpha : L.haloAlpha) * dim) + ')';
    ctx.lineWidth = (hot ? L.hoverHalo : L.halo) * DPR;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
  }
  for (let i = 0; i < personal.count; i++) {
    const { a, b, pts, rgb } = paths[i];
    if (!pts) continue;
    const isHover = i === opts.hoverIndex;
    const isFocus = i === opts.focusIndex;
    const dim = (opts.focusIndex >= 0 && !isFocus) ? 0.18 : 1;
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (L.alpha * dim) + ')';
    ctx.lineWidth = (isHover || isFocus ? L.hoverWidth : L.width) * DPR;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
    // endpoint pins: a ring on the rail with a filled dot, so both ends read
    // as places, not as where a line happened to stop; only on screen
    ctx.fillStyle = 'rgba(' + rgb + ',' + dim + ')';
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.9 * dim) + ')';
    ctx.lineWidth = 1 * DPR;
    for (const p of [a, b]) {
      if (p[0] < -EDGE_MARGIN || p[0] > width + EDGE_MARGIN) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], L.ring * DPR, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], L.dot * DPR, 0, Math.PI * 2); ctx.fill();
    }
  }
  return rails;
}

function insertNearest(out, candidate, limit) {
  if (out.length === limit && candidate.distance >= out[out.length - 1].distance) return;
  let at = out.length;
  while (at > 0 && out[at - 1].distance > candidate.distance) at--;
  out.splice(at, 0, candidate);
  if (out.length > limit) out.pop();
}

/**
 * Nearest personal links to a point.
 * @param {{count:number, aRail:Uint8Array, bRail:Uint8Array, aPos:Float32Array,
 *   bPos:Float32Array}|null} personal
 * @param {{verseX:(v:number)=>number, votRail:any, verseTotal:number, width:number, height:number,
 *   DPR:number, base:number}} opts
 * @param {number} px
 * @param {number} py
 * @param {number} tol
 * @param {number} [limit]
 * @returns {Array<{index:number, distance:number}>}
 */
export function pickPersonalLinks(personal, opts, px, py, tol, limit) {
  if (!personal || !personal.count) return [];
  const { base, DPR } = opts;
  const rails = railFrame({ H: opts.height, DPR }, base);
  const cap = Math.max(1, Math.min(limit || 4, 8));
  const best = [];
  for (let i = 0; i < personal.count; i++) {
    const a = endpointPoint({ rail: personal.aRail[i], pos: personal.aPos[i] }, opts, rails);
    const b = endpointPoint({ rail: personal.bRail[i], pos: personal.bPos[i] }, opts, rails);
    const minX = Math.min(a[0], b[0]) - tol, maxX = Math.max(a[0], b[0]) + tol;
    if (px < minX || px > maxX) continue;
    const cross = personal.aRail[i] !== personal.bRail[i];
    const gap = Math.abs(rails.bottomY - rails.topY);
    const pts = threadPath(a, b, cross, { width: opts.width, gap, n: 28, up: personal.aRail[i] === 0, maxRy: gap * 0.78 });
    if (!pts) continue;
    const d = distanceToPath(pts, px, py);
    if (d < tol) insertNearest(best, { index: i, distance: d }, cap);
  }
  return best;
}

/** Backwards-compatible nearest-link helper for small callers. */
export function pickPersonal(personal, opts, px, py, tol) {
  const hit = pickPersonalLinks(personal, opts, px, py, tol, 1)[0];
  return hit ? hit.index : -1;
}

/**
 * Nearest curated underlay links. The draw and pick paths share the same
 * cubic sampling so faint corpus context is honest: if it is visible, it can
 * be selected.
 *
 * @param {{count:number, versePos:Float32Array, votPos:Float32Array, records?:Array}|null} underlay
 * @param {{verseX:(v:number)=>number, votRail:any, verseTotal:number, width:number, height:number,
 *   DPR:number, base:number}} opts
 * @param {number} px
 * @param {number} py
 * @param {number} tol
 * @param {number} [limit]
 * @returns {Array<{index:number, distance:number, verse:number, votPos:number, record:any}>}
 */
export function pickUnderlayLinks(underlay, opts, px, py, tol, limit) {
  if (!underlay || !underlay.count) return [];
  const { base, DPR, verseX } = opts;
  const rails = railFrame({ H: opts.height, DPR }, base);
  const cap = Math.max(1, Math.min(limit || 4, 8));
  const best = [];
  for (let i = 0; i < underlay.count; i++) {
    const a = [verseX(underlay.versePos[i]), rails.bottomY];
    const b = endpointPoint({ rail: 1, pos: underlay.votPos[i] }, opts, rails);
    const minX = Math.min(a[0], b[0]) - tol, maxX = Math.max(a[0], b[0]) + tol;
    if (px < minX || px > maxX) continue;
    const pts = threadPath(/** @type {[number, number]} */ (a), b, true, { width: opts.width, gap: Math.abs(rails.bottomY - rails.topY), n: 12 });
    if (!pts) continue;
    const d = distanceToPath(pts, px, py);
    if (d < tol) insertNearest(best, {
      index: i, distance: d, verse: underlay.versePos[i], votPos: underlay.votPos[i],
      record: underlay.records && underlay.records[i],
    }, cap);
  }
  return best;
}
