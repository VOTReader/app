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

/** Clearance below the top chrome before the VOT rail is drawn, in CSS px. */
const TOP_INSET = 96;
/** Curve tension for inter-rail ribbons: how far control points push out. */
const RIBBON_BOW = 0.42;

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
export function drawPersonalWeb(ctx, personal, underlay, opts) {
  const { width, DPR, base, chrome, votRail, verseX } = opts;
  const rails = railFrame({ H: opts.height, DPR }, base);
  const ink = chrome.isLight ? '58,37,16' : '235,231,222';
  const gold = chrome.isLight ? '122,92,16' : '232,192,80';

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

  // ── the corpus's own curated edges, as a quiet underlay ──
  if (underlay && opts.showUnderlay && underlay.count) {
    // 2,000+ curated edges: at any real weight they become a brown wash that
    // buries the reader's own handful of links. This is context, not content.
    ctx.strokeStyle = 'rgba(' + gold + ',0.045)';
    ctx.lineWidth = 0.7 * DPR;
    ctx.beginPath();
    for (let i = 0; i < underlay.count; i++) {
      const a = [verseX(underlay.versePos[i]), rails.bottomY];
      const b = endpointPoint({ rail: 1, pos: underlay.votPos[i] }, opts, rails);
      if ((a[0] < -50 && b[0] < -50) || (a[0] > width + 50 && b[0] > width + 50)) continue;
      const pts = linkPath(a[0], a[1], b[0], b[1], true, 12);
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    }
    ctx.stroke();
  }

  if (!personal || !personal.count) return rails;

  // ── the reader's links ──
  for (let i = 0; i < personal.count; i++) {
    const a = endpointPoint({ rail: personal.aRail[i], pos: personal.aPos[i] }, opts, rails);
    const b = endpointPoint({ rail: personal.bRail[i], pos: personal.bPos[i] }, opts, rails);
    const cross = personal.aRail[i] !== personal.bRail[i];
    const gap = Math.abs(rails.bottomY - rails.topY);
    const pts = linkPath(a[0], a[1], b[0], b[1], cross,
      { n: 28, up: personal.aRail[i] === 0, maxRy: gap * 0.78 });
    const c = LINK_KIND_COLORS[personal.kind[i]] || LINK_KIND_COLORS[0];
    const rgb = c.map((n) => Math.round(n * 255)).join(',');
    const isHover = i === opts.hoverIndex;
    const isFocus = i === opts.focusIndex;
    const dim = (opts.focusIndex >= 0 && !isFocus) ? 0.18 : 1;
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.85 * dim) + ')';
    ctx.lineWidth = (isHover || isFocus ? 2.6 : 1.4) * DPR;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
    // endpoint dots
    ctx.fillStyle = 'rgba(' + rgb + ',' + dim + ')';
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], (isHover || isFocus ? 4 : 2.6) * DPR, 0, Math.PI * 2);
      ctx.fill();
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
