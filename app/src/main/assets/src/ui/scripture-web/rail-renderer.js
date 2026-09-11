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

import { LINK_KIND_COLORS } from '../../utils/scripture-web/palette.js';
import { placeRailLabels } from '../../utils/scripture-web/rail-labels.js';

/** Clearance below the top chrome before the VOT rail is drawn, in CSS px. */
const TOP_INSET = 96;
/** Curve tension for inter-rail ribbons: how far control points push out. */
const RIBBON_BOW = 0.42;
/** The corpus-context layer's resolution relative to the canvas (see drawPersonalWeb). */
export const CONTEXT_SCALE = 0.5;
let contextCanvas = null;
/** One reusable offscreen canvas for the context; null where 2D is unavailable (tests). */
function contextLayer(w, h) {
  if (typeof document === 'undefined') return null;
  if (!contextCanvas) contextCanvas = document.createElement('canvas');
  if (contextCanvas.width !== w || contextCanvas.height !== h) { contextCanvas.width = w; contextCanvas.height = h; }
  let lc = null;
  try { lc = contextCanvas.getContext('2d'); } catch (_e) { lc = null; }
  return lc ? { canvas: contextCanvas, ctx: lc } : null;
}

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
 * @param {{verseX:(v:number)=>number, votRail:{total:number}, verseTotal:number}} opts
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
 * @param {{verseX:(v:number)=>number, votRail:any, verseTotal:number, width:number, height:number,
 *   DPR:number, base:number, chrome:any, showUnderlay?:boolean,
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
    // Measure before drawing: collection names are long ("Words To Live By:
    // Part One"), and a name wider than twice its band is not printed at all.
    // The rows are then given by the one placement law both rails share
    // (rail-labels.js): the top row first, the second when the top's last
    // name would be nearer than 5 px, and NO row when neither has room — the
    // old alternation (row = 1 - row) tracked nothing about where a row's last
    // name ended, and HOLY DAYS met MTAM 3 px apart at 1920 wide. Every band
    // keeps its tick either way.
    const names = [];
    for (const seg of votRail.segments) {
      if (!seg.count) continue;
      const span = segmentSpan(seg, opts);
      if (!span) continue;
      ctx.strokeStyle = 'rgba(' + gold + ',0.22)';
      ctx.beginPath();
      ctx.moveTo(span.x0, rails.topY - 7 * DPR); ctx.lineTo(span.x0, rails.topY);
      ctx.stroke();
      const label = (seg.short || seg.label).toUpperCase();
      const w = ctx.measureText(label).width;
      if (w > span.room * 2) continue;
      names.push({ label, x: span.labelX, left: span.labelX - w / 2, right: span.labelX + w / 2, fits: w <= span.room - 6 * DPR });
    }
    const rows = placeRailLabels(names, 5 * DPR);
    names.forEach((n, i) => {
      if (rows[i] < 0) return;
      ctx.fillStyle = 'rgba(' + ink + ',' + (n.fits && rows[i] === 0 ? 0.8 : 0.62) + ')';
      ctx.fillText(n.label, n.x, rails.topY - (rows[i] ? 27 : 11) * DPR);
    });
  }

  // ── the corpus's own curated edges, as a quiet underlay ──
  if (underlay && opts.showUnderlay && underlay.count) {
    // 2,000+ curated edges: at any real weight they become a brown wash that
    // buries the reader's own handful of links. This is context, not content.
    const z = opts.verseTotal ? (verseX(opts.verseTotal) - verseX(0)) / width : 1;
    const cx = personalInk(z).context;
    // The context is stroked into a HALF-RESOLUTION layer and blitted up: the
    // cost of 2,095 antialiased strokes is fill-bound on a 2x canvas (measured
    // 175-320 ms a frame at full resolution), and a quarter of the pixels is
    // a quarter of the fill. The blur it buys is the point as much as the
    // speed: context reads as soft silk, the reader's links stay crisp.
    const L = contextLayer(Math.ceil(width * CONTEXT_SCALE), Math.ceil(opts.height * CONTEXT_SCALE));
    const c2 = L ? L.ctx : ctx;
    if (L) {
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, L.canvas.width, L.canvas.height);
      c2.setTransform(CONTEXT_SCALE, 0, 0, CONTEXT_SCALE, 0, 0);
    }
    c2.strokeStyle = 'rgba(' + cx.rgb + ',' + cx.alpha + ')';
    c2.lineWidth = L ? Math.max(cx.width * DPR, 1 / CONTEXT_SCALE) : cx.width * DPR;
    // ONE STROKE PER EDGE. A single path stroked once composites every edge at
    // the same flat value whatever piles up (measured: a uniform 10/255 over
    // half the band). Per-edge strokes let corridors accumulate, which is the
    // structure the reader's eye follows.
    for (let i = 0; i < underlay.count; i++) {
      const a = [verseX(underlay.versePos[i]), rails.bottomY];
      const b = endpointPoint({ rail: 1, pos: underlay.votPos[i] }, opts, rails);
      if ((a[0] < -50 && b[0] < -50) || (a[0] > width + 50 && b[0] > width + 50)) continue;
      const pts = linkPath(a[0], a[1], b[0], b[1], true, 12);
      c2.beginPath();
      c2.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) c2.lineTo(pts[k][0], pts[k][1]);
      c2.stroke();
    }
    if (L) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(L.canvas, 0, 0, width, opts.height);
    }
  }

  if (!personal || !personal.count) return rails;

  // ── the reader's links: halo pass first so no halo covers a neighbour's core ──
  const L = personalInk(opts.verseTotal ? (verseX(opts.verseTotal) - verseX(0)) / width : 1).link;
  const paths = [];
  for (let i = 0; i < personal.count; i++) {
    const a = endpointPoint({ rail: personal.aRail[i], pos: personal.aPos[i] }, opts, rails);
    const b = endpointPoint({ rail: personal.bRail[i], pos: personal.bPos[i] }, opts, rails);
    const cross = personal.aRail[i] !== personal.bRail[i];
    const gap = Math.abs(rails.bottomY - rails.topY);
    paths.push({ a, b, pts: linkPath(a[0], a[1], b[0], b[1], cross,
      { n: 28, up: personal.aRail[i] === 0, maxRy: gap * 0.78 }) });
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < personal.count; i++) {
    const c = LINK_KIND_COLORS[personal.kind[i]] || LINK_KIND_COLORS[0];
    const rgb = c.map((n) => Math.round(n * 255)).join(',');
    const hot = i === opts.hoverIndex || i === opts.focusIndex;
    const dim = (opts.focusIndex >= 0 && i !== opts.focusIndex) ? 0.18 : 1;
    ctx.strokeStyle = 'rgba(' + rgb + ',' + ((hot ? L.hoverHaloAlpha : L.haloAlpha) * dim) + ')';
    ctx.lineWidth = (hot ? L.hoverHalo : L.halo) * DPR;
    const pts = paths[i].pts;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
  }
  for (let i = 0; i < personal.count; i++) {
    const { a, b, pts } = paths[i];
    const c = LINK_KIND_COLORS[personal.kind[i]] || LINK_KIND_COLORS[0];
    const rgb = c.map((n) => Math.round(n * 255)).join(',');
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
    // as places, not as where a line happened to stop
    ctx.fillStyle = 'rgba(' + rgb + ',' + dim + ')';
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.9 * dim) + ')';
    ctx.lineWidth = 1 * DPR;
    for (const p of [a, b]) {
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
    const d = distanceToPath(linkPath(a[0], a[1], b[0], b[1], cross,
      { n: 28, up: personal.aRail[i] === 0, maxRy: gap * 0.78 }), px, py);
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
    const d = distanceToPath(linkPath(a[0], a[1], b[0], b[1], true, 12), px, py);
    if (d < tol) insertNearest(best, {
      index: i, distance: d, verse: underlay.versePos[i], votPos: underlay.votPos[i],
      record: underlay.records && underlay.records[i],
    }, cap);
  }
  return best;
}
