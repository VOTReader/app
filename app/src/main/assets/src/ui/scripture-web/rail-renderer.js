/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/rail-renderer — Cluster F (bundle-d since lz1; lazy bundle-f before)

   "My web" — the reader's own links, drawn as a dual rail.

   The canonical web is one axis because scripture is one sequence. A personal
   web spans two corpora, so it gets two: scripture along the BOTTOM (the same
   axis, the same ruler, the same camera as the canonical view, so the mental
   model carries over) and the Volumes of Truth along the TOP in READING_CHAIN
   order. A link between the two is an S-curve spanning the gap; a link inside
   one corpus is a small arc that leaves and returns to its own rail.

   w3 (Q8, the r2-05 picture): every line is ONE smooth curve at every zoom
   of either rail, with vertical tangents at both feet and no elbow anywhere;
   a foot on screen is exact, so a line never shears from its foot when one
   rail zooms, and a foot off screen is drawn at a projected x (drawnFootX),
   so what is on screen still crosses the gap instead of running level to a
   foot forty screens away (fix-review #1). Only the part on screen is
   sampled, so a far foot costs nothing. Two ink
   families: Timothy's notes in teal-silver by source (sw-ink myWeb* rows),
   the reader's links in one warm gold (myWebReader).

   This is Canvas2D, not WebGL, and that is deliberate: a hand-made link
   collection is hundreds of records, not hundreds of thousands. 2D gives
   crisper thin curves, free dashes and text, and no second GL program to keep
   in sync — and it stays fast until the reader has tens of thousands of
   links, which is years away and would be a good problem to have.
   ═══════════════════════════════════════════════════════════════════════ */

import { MY_WEB_SOURCES, CONTEXT_BINS, myWebLinkColor, MY_WEB_LINK_KINDS } from '../../utils/scripture-web/palette.js';
import { placeRailLabels } from '../../utils/scripture-web/rail-labels.js';
import { css as inkCss, TAP_CONTEXT, FLYOVER_LEG_WIDTH, FONT, INK } from '../../utils/scripture-web/sw-ink.js';

/** The Volumes rail's height from the top, CSS px (spec §3, My Web: 150 PC, 62 phone). */
const TOP_RAIL_PC = 150;
const TOP_RAIL_COMPACT = 62;
/** The band the Volumes rail's names (and the PC's overline) need above the rail, CSS px. */
const NAME_BAND_PC = 58;
const NAME_BAND_COMPACT = 12;
/** A frame this short (CSS px) is the phone's: the compact rail, type and label rows. */
const COMPACT_H = 500;
/** Curve tension for the S-curves: how far the control points push out (a share of the gap). */
const RIBBON_BOW = 0.42;
/** A short rail-local arc is this share of the gap tall (spec §3, My Web: rail-local arcs within 12%). */
const LOCAL_ARC_GAP = 0.12;
/** A longer one keeps this width / height, up to LOCAL_ARC_MAX of the gap (fix-review #2: a
 * Genesis-to-Revelation arc held to 12% drew 26:1, a flat line along its rail). */
const LOCAL_ARC_ASPECT = 5.5;
const LOCAL_ARC_MAX = 0.72;
/** An endpoint this far past the screen edge still counts as on screen (device px). */
const EDGE_MARGIN = 24;
/** An off-screen foot is drawn at edge + k ln(1 + d / k), k this share of the width:
 * the S-curves' (FAR_FOOT) keeps a leg climbing over a third of the gap on
 * screen out to 400 screens; the rail-local arcs' (LOCAL_FAR_FOOT) is tighter,
 * an arc having no climb of its own to keep. */
export const FAR_FOOT = 0.12;
export const LOCAL_FAR_FOOT = 0.03;
/** A foot's hold on its line's ink fades out over this share of the width past the screen edge. */
const PRESENCE_FADE = 0.5;
/** The context's ink is stroked in at most this many rungs of zoom a frame, log-spaced between
 * the two rails' zooms with both ends exact (one batch set per rung, twice with fly-overs).
 * w3's sixteen global steps made 137 strokes at 20x / 3x (fix-review #5). */
export const INK_RUNGS = 8;
/** How much the samples of a line with both feet in view crowd toward its feet (0 even, 1 at most). */
const FOOT_EASE = 0.5;
/** How far a drawn line may stray from its curve, CSS px: Timothy's threads (faint, thousands)
 * and the reader's links. A line takes the samples that tolerance needs (chordCount), so a
 * short or nearly straight piece takes few and the overview's context about a dozen. */
const EPS_CONTEXT = 2.5;
const EPS_LINK = 0.5;
/** n = CHORD sqrt(turning * length / eps): the uniform-curvature chord law (1 / sqrt 8 = 0.354)
 * calibrated up so the overview's S, a leg and a fly-over all stay within eps (fix-review #5);
 * a rail-local arc's samples crowd to its feet, away from a round arc's even turn, so it
 * takes CHORD_ARC. */
const CHORD = 0.45;
const CHORD_ARC = 0.5;
/** Letter ticks show once letters are this far apart, CSS px. */
const LETTER_TICK_MIN = 1.8;
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
 * identical in both modes. The Volumes rail sits where the spec puts it (§3,
 * My Web: 150 CSS px from the top on a PC, 62 on a phone), its names in the
 * band above it, and lower when the top chrome ends below the spec's (v.inset,
 * the chrome's bottom edge in device px: 0 or absent when it is hidden), so a
 * name never prints under the header; never lower than 0.4 of the baseline.
 *
 * @param {{H:number, DPR:number, inset?:number}} v
 * @param {number} base — the scripture baseline (shared with the canonical view)
 */
export function railFrame(v, base) {
  const dpr = v.DPR || 1;
  const compact = isCompact(v);
  const spec = (compact ? TOP_RAIL_COMPACT : TOP_RAIL_PC) * dpr;
  const clear = v.inset > 0 ? v.inset + (compact ? NAME_BAND_COMPACT : NAME_BAND_PC) * dpr : 0;
  return { bottomY: base, topY: Math.min(Math.max(spec, clear), base * 0.4) };
}

/**
 * The top chrome's bottom edge in device px, the inset railFrame clears (0
 * without the element or before it has laid out). Every reader of the rails
 * (the draw's railOpts, camFor's split, the published rails) measures it so.
 * @param {{offsetTop:number, offsetHeight:number}|null|undefined} el the top bar
 * @param {number} dpr
 */
export function chromeInset(el, dpr) {
  return el && el.offsetHeight ? (el.offsetTop + el.offsetHeight) * (dpr || 1) : 0;
}

/** The phone's frame (spec §3's compact column): a frame under COMPACT_H CSS px tall. */
function isCompact(v) {
  return v.H / (v.DPR || 1) <= COMPACT_H;
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
 * Sample a link's whole curve (the overview shape, both feet in view).
 * Inter-rail links are the S-curve cubic, intra-rail links a half-ellipse;
 * threadPath() below is the same curve sampled over its visible part.
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
      const t = spacing(i / n, true, true), u = 1 - t;
      const x = u * u * u * ax + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * bx;
      const y = u * u * u * ay + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * by;
      pts.push([x, y]);
    }
    return pts;
  }
  // Same-rail: a half-ellipse bulging INTO the gap between the rails — up
  // from the bottom rail, down from the top.
  const rx = Math.abs(bx - ax) / 2;
  const cx = (ax + bx) / 2;
  const dir = opts.up === false ? 1 : -1;
  const maxRy = opts.maxRy || rx;
  const ry = Math.min(rx, maxRy);
  for (let i = 0; i <= n; i++) {
    const th = Math.PI * (1 - spacing(i / n, true, true));
    pts.push([cx + rx * Math.cos(th), ay + dir * ry * Math.sin(th)]);
  }
  return pts;
}

/**
 * Where an off-screen foot is drawn (fix-review #1, C16/C17). A foot on screen
 * (within EDGE_MARGIN) is its true x. Past the margin the distance d is drawn
 * as k ln(1 + d / k), k = scale * width: the same slope at the margin (C1, so
 * a foot crossing the edge moves its line smoothly), monotone, ever slower,
 * never back on screen. A foot one screen off still reads as one screen off;
 * one forty screens off reads farther, but its line still crosses the gap on
 * screen instead of running level to a foot nobody can see.
 * @param {number} x the true x, device px
 * @param {number} width
 * @param {number} scale FAR_FOOT or LOCAL_FAR_FOOT
 */
export function drawnFootX(x, width, scale) {
  const lo = -EDGE_MARGIN, hi = width + EDGE_MARGIN, k = Math.max(1, scale * width);
  if (x > hi) return hi + k * Math.log1p((x - hi) / k);
  if (x < lo) return lo - k * Math.log1p((lo - x) / k);
  return x;
}

/** smoothstep: the S-curve's x runs a -> b along it (its control points sit over the feet). */
const smooth = (t) => t * t * (3 - 2 * t);
/** The inverse of smoothstep on [0, 1]: the t at which the S-curve has run share s of its width. */
const unsmooth = (s) => 0.5 - Math.sin(Math.asin(1 - 2 * s) / 3);

/**
 * The thread: ONE smooth curve at every zoom, sampled over the part on screen
 * (Q8: "smooth S-curve fans ... with vertical tangents at both ends and no
 * elbows"; item 33).
 *
 * The r2 thread hid a line with no foot on screen and bent a line to a far
 * foot into a rise and a level run along the far rail: an elbow by the rail,
 * and a line that sheared away from its foot as one rail zoomed. w3 drew the
 * curve to the TRUE far foot, which at 20x runs level across the screen (the
 * smear, fix-review #1). Here a foot on screen is exact, a foot off it is
 * drawn at drawnFootX, and the curve runs between those drawn feet:
 *   - across the rails, the cubic with its control points straight over each
 *     foot: x runs a -> b as smoothstep(t), so the visible part is a t range
 *     in closed form (the inverse smoothstep) and is sampled densely however
 *     far off the other foot is; vertical at both feet, no elbow anywhere;
 *   - along one rail, a half-ellipse between the feet, bulging into the gap:
 *     LOCAL_ARC_GAP of it tall for a short span (the spec's rail-local arcs),
 *     width / height LOCAL_ARC_ASPECT for a longer one up to LOCAL_ARC_MAX of
 *     the gap, its visible part a range of the angle (acos);
 *   - a foot on screen is the exact first or last point; a line whose curve
 *     never crosses the screen is null (nothing to draw or pick), and a line
 *     that crosses with no foot on screen is a fly-over, drawn (Q3 ii).
 * The returned points carry `cls`: 'anchored' (both feet on screen), 'leg'
 * (one) or 'fly' (none).
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {boolean} crossRail
 * @param {{width:number, gap:number, up?:boolean, maxRy?:number, n?:number, eps?:number}} o
 * @returns {Array<[number, number]>|null}
 */
export function threadPath(a, b, crossRail, o) {
  const W = o.width, nMax = o.n || 24;
  const gap = o.gap || W;
  // o.eps (device px): as many samples as keep the drawn line within eps of
  // its curve, from 4 to nMax; without it every path takes nMax
  const count = (turn, len, k) => (o.eps > 0 ? Math.max(4, Math.min(nMax, Math.ceil(k * Math.sqrt((turn * len) / o.eps)))) : nMax);
  const lo = -EDGE_MARGIN, hi = W + EDGE_MARGIN;
  const onA = a[0] >= lo && a[0] <= hi, onB = b[0] >= lo && b[0] <= hi;
  // the drawn feet: exact on screen, projected off it (monotone, so a line
  // crosses the screen exactly when its true feet's span does)
  const far = crossRail ? FAR_FOOT : LOCAL_FAR_FOOT;
  if (!onA) a = [drawnFootX(a[0], W, far), a[1]];
  if (!onB) b = [drawnFootX(b[0], W, far), b[1]];
  /** @type {any} */
  let pts;
  if (crossRail) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let s0 = 0, s1 = 1;
    if (Math.abs(dx) > 1e-9) {
      const u = (lo - a[0]) / dx, v = (hi - a[0]) / dx;
      s0 = Math.max(0, Math.min(u, v)); s1 = Math.min(1, Math.max(u, v));
      if (s0 > s1) return null;
    } else if (!onA) return null;
    const t0 = s0 <= 0 ? 0 : unsmooth(s0), t1 = s1 >= 1 ? 1 : unsmooth(s1);
    const c1y = a[1] + dy * RIBBON_BOW, c2y = b[1] - dy * RIBBON_BOW;
    const yAt = (t) => { const u = 1 - t; return u * u * u * a[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * b[1]; };
    // the heading turns monotonically to the middle (t = 0.5) and back, so
    // the turning over [t0, t1] is exact from three headings
    const head = (t) => { const u = 1 - t; return Math.atan2(Math.abs(3 * ((c1y - a[1]) * u * u + 2 * (c2y - c1y) * u * t + (b[1] - c2y) * t * t)), Math.abs(6 * dx * t * u)); };
    const tm = Math.min(t1, Math.max(t0, 0.5));
    const turn = Math.abs(head(t0) - head(tm)) + Math.abs(head(tm) - head(t1));
    const n = count(turn, Math.abs(dx) * (s1 - s0) + Math.abs(yAt(t1) - yAt(t0)), CHORD);
    pts = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * spacing(i / n, onA, onB);
      pts.push([a[0] + dx * smooth(t), yAt(t)]);
    }
  } else {
    const rx = Math.abs(b[0] - a[0]) / 2, cx = (a[0] + b[0]) / 2;
    const dir = o.up === false ? 1 : -1;
    const ry = Math.min(rx, o.maxRy > 0 ? o.maxRy : localArcHeight(2 * rx, gap));
    // the angle runs from pi (the left foot) to 0 (the right foot)
    let th0 = Math.PI, th1 = 0;
    if (rx > 1e-9) {
      const cl = (lo - cx) / rx, ch = (hi - cx) / rx;
      if (cl > 1 || ch < -1) return null;
      th0 = Math.acos(Math.max(-1, Math.min(1, cl)));
      th1 = Math.acos(Math.max(-1, Math.min(1, ch)));
    } else if (!onA) return null;
    // a lone visible foot is the left one when the path runs left to right
    const left = a[0] <= b[0] ? onA : onB, right = a[0] <= b[0] ? onB : onA;
    // the heading runs from straight up (or down) at the left foot through
    // level at the top to straight down at the right: monotone in the angle
    const head = (th) => Math.atan2(ry * Math.cos(th), rx * Math.sin(th));
    const rise = th0 > Math.PI / 2 && th1 < Math.PI / 2 ? 2 - Math.sin(th0) - Math.sin(th1) : Math.abs(Math.sin(th0) - Math.sin(th1));
    const n = count(Math.abs(head(th1) - head(th0)), rx * Math.abs(Math.cos(th1) - Math.cos(th0)) + ry * rise, CHORD_ARC);
    pts = [];
    for (let i = 0; i <= n; i++) {
      const th = th0 + (th1 - th0) * spacing(i / n, left, right);
      pts.push([cx + rx * Math.cos(th), a[1] + dir * ry * Math.sin(th)]);
    }
    if (a[0] > b[0]) pts.reverse();      // sampled left to right; the path runs a -> b
  }
  if (onA) pts[0] = [a[0], a[1]];
  if (onB) pts[pts.length - 1] = [b[0], b[1]];
  pts.cls = onA && onB ? 'anchored' : (onA || onB) ? 'leg' : 'fly';
  return pts;
}

/**
 * A rail-local arc's height for its drawn span: LOCAL_ARC_GAP of the gap for a
 * short one, width / height LOCAL_ARC_ASPECT for a longer one, never past
 * LOCAL_ARC_MAX of the gap (it never reaches the far rail).
 * @param {number} span device px
 * @param {number} gap device px
 */
function localArcHeight(span, gap) {
  return Math.min(LOCAL_ARC_MAX * gap, Math.max(LOCAL_ARC_GAP * gap, span / LOCAL_ARC_ASPECT));
}

/**
 * Where sample f (0..1) of a visible range falls. A line turns fastest at its
 * feet (from the rail's vertical to its heading), so the samples crowd toward
 * each visible foot and the drawn polyline keeps the curve's own smooth turn
 * instead of a corner: both feet in view, an even ease (linkPath's spacing,
 * so the overview is linkPath's curve); one foot, quadratically toward it,
 * where a far foot makes the turn a few px tall; a fly-over, even.
 * @param {number} f
 * @param {boolean} first the range's first end is a visible foot
 * @param {boolean} last the range's last end is a visible foot
 */
function spacing(f, first, last) {
  if (first && last) return f - (FOOT_EASE * Math.sin(2 * Math.PI * f)) / (2 * Math.PI);
  if (first) return f * f;
  if (last) return 1 - (1 - f) * (1 - f);
  return f;
}

/**
 * How much a foot at x holds its line's ink to its rail's zoom: 1 on screen,
 * easing to 0 over PRESENCE_FADE of the width past the edge.
 * @param {number} x device px
 * @param {number} W
 */
function presence(x, W) {
  const d = x < 0 ? -x : x > W ? x - W : 0;
  if (d <= 0) return 1;
  const u = Math.min(1, d / (W * PRESENCE_FADE));
  return 1 - u * u * (3 - 2 * u);
}

/**
 * The zoom a line's ink follows: each rail's zoom, held by its foot's
 * presence on screen. Both feet in view: the deeper rail's zoom; one foot:
 * its rail's (at least the shallower rail's, so never under it); none (a
 * fly-over): what its feet's presence holds, near the view's depth while
 * they sit just past the edges and the overview's ink once they are far,
 * never less. Continuous as a foot crosses the edge, so panning never pops
 * a line's ink.
 *
 * A fly-over does NOT take the view's depth (fix-review #12 asked for it
 * once the geometry stopped fly-overs reading as a sky). Its on-screen part
 * is the middle of a curve whose feet are both past the edges, so a
 * corridor of them (Vol I-VII to the Gospels, the studies to the Law) lies
 * in one shallow ribbon whatever the feet's projection, and at the view's
 * depth that ribbon saturated: on e2e-myweb-r2's T arm (both rails 16x) the
 * band's pixels at full ink were 0.139 of it at 800x360 and 0.073 at
 * 1920x1080 against 0.060 and 0.006 with this law (the base's r2 picture
 * 0.064 and 0.024): the sky C17 forbids.
 * @param {number} zA the zoom of foot a's rail
 * @param {number} pA foot a's presence
 * @param {number} zB the zoom of foot b's rail
 * @param {number} pB foot b's presence
 */
function lineZoom(zA, pA, zB, pB) {
  return Math.max(Math.pow(Math.max(1, zA), pA), Math.pow(Math.max(1, zB), pB));
}

/**
 * This frame's ink rungs: INK_RUNGS zooms log-spaced from the shallower rail's
 * zoom to the deeper's, both ends exact (a line with a foot on screen never
 * leaves that range), so a thread on a zoomed rail is that rail's ink exactly
 * and one hanging from the other rail is the other's; only threads whose feet
 * sit in the fade past an edge take a rung between. One rung when the rails
 * share a zoom. The fly-overs take their own: inkRungs(1, the deeper zoom),
 * from the overview's ink to the deeper rail's.
 * @param {number} zB
 * @param {number} zV
 */
function inkRungs(zB, zV) {
  const lo = Math.max(1, Math.min(zB, zV)), span = Math.log(Math.max(1, zB, zV) / lo);
  const top = span > 1e-9 ? INK_RUNGS - 1 : 0;
  return {
    /** @param {number} z */
    of: (z) => (top ? Math.min(top, Math.max(0, Math.round((top * Math.log(Math.max(lo, z) / lo)) / span))) : 0),
    /** @param {number} r */
    zoom: (r) => (top ? lo * Math.exp((span * r) / top) : lo),
  };
}

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
 * the number of (bin, layer) pairs in view. One set of batches per ink rung
 * (the drawer keeps them apart): a rung is one alpha and one width.
 */
class ContextBatches {
  constructor() {
    /** @type {Array<{bin:number, bx:number, tx:number, layer:number, pts:Array<[number, number]>}>} */
    this.threads = [];
  }
  /**
   * @param {number} bin the source bin (MY_WEB_SOURCES index)
   * @param {number} bx the Bible end's x (device px)
   * @param {number} tx the Volumes end's x (device px)
   * @param {Array<[number, number]>} pts
   */
  add(bin, bx, tx, pts) {
    this.threads.push({ bin: Math.min(CONTEXT_BINS - 1, Math.max(0, bin | 0)), bx, tx, layer: 0, pts });
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
    /** @type {Map<number, Array<Array<[number, number]>>>} */
    const paths = new Map();
    // Layers beyond which one more thread moves a pixel by under 1/255 at this
    // alpha: (1 - alpha)^n * 255 < 1. 0.06 at 1x needs 87 of them, 0.30 needs
    // 16; past the cap threads share and nothing shows.
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
      const key = e.bin * 4096 + Math.min(layer, 4095);
      let list = paths.get(key);
      if (!list) { list = []; paths.set(key, list); }
      list.push(e.pts);
    }
    let n = 0;
    // keys sort by bin, then layer: consecutive paths share a style, and a
    // strokeStyle set is a colour parse the canvas need not repeat
    const keys = [...paths.keys()].sort((p, q) => p - q);
    let last = '';
    for (const key of keys) {
      const bin = Math.floor(key / 4096);
      const style = 'rgba(' + MY_WEB_SOURCES[bin].rgb + ',' + alpha + ')';
      if (style !== last) { ctx.strokeStyle = style; last = style; }
      ctx.beginPath();
      for (const pts of /** @type {Array<Array<[number, number]>>} */ (paths.get(key))) {
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
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
function distanceToPath(pts, px, py) {
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
 * One reader's link in this frame: its two feet and the path it is drawn
 * along. The draw, the pick and the Nearby order all read this, so what the
 * list calls near is what the eye sees near (item 29).
 * @param {any} personal
 * @param {number} i
 * @param {any} opts
 * @param {{bottomY:number, topY:number}} rails
 * @returns {{a:[number, number], b:[number, number], pts:Array<[number, number]>|null}}
 */
function linkGeometry(personal, i, opts, rails) {
  const a = endpointPoint({ rail: personal.aRail[i], pos: personal.aPos[i] }, opts, rails);
  const b = endpointPoint({ rail: personal.bRail[i], pos: personal.bPos[i] }, opts, rails);
  return { a, b, pts: linkPathOf(personal, i, a, b, opts, rails) };
}

/** A reader's link's drawn path between its feet a and b (linkGeometry's, and the pick's once its prefilter passes). */
function linkPathOf(personal, i, a, b, opts, rails) {
  const gap = Math.abs(rails.bottomY - rails.topY);
  const cross = personal.aRail[i] !== personal.bRail[i];
  return threadPath(a, b, cross, { width: opts.width, gap, n: 48, eps: EPS_LINK * (opts.DPR || 1), up: personal.aRail[i] === 0 });
}

/**
 * One of Timothy's threads in this frame (Bible foot a, Volumes foot b).
 * @param {any} underlay
 * @param {number} i
 * @param {any} opts
 * @param {{bottomY:number, topY:number}} rails
 * @returns {{a:[number, number], b:[number, number], pts:Array<[number, number]>|null}}
 */
function underlayGeometry(underlay, i, opts, rails) {
  const a = /** @type {[number, number]} */ ([opts.verseX(underlay.versePos[i]), rails.bottomY]);
  const b = endpointPoint({ rail: 1, pos: underlay.votPos[i] }, opts, rails);
  return { a, b, pts: underlayPathOf(a, b, opts, rails) };
}

/** One of Timothy's threads' drawn path between its feet. */
function underlayPathOf(a, b, opts, rails) {
  return threadPath(a, b, true, { width: opts.width, gap: Math.abs(rails.bottomY - rails.topY), n: 24, eps: EPS_CONTEXT * (opts.DPR || 1) });
}

/**
 * A pick at px misses a line whose DRAWN feet do not span px (within tol):
 * the drawn path never leaves that span, so the picks skip such a line
 * before building its path (fix-review #5: w3 built every path first).
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {boolean} cross
 * @param {number} width
 * @param {number} px
 * @param {number} tol
 */
function missesX(a, b, cross, width, px, tol) {
  const far = cross ? FAR_FOOT : LOCAL_FAR_FOOT;
  const xa = drawnFootX(a[0], width, far), xb = drawnFootX(b[0], width, far);
  return px < Math.min(xa, xb) - tol || px > Math.max(xa, xb) + tol;
}

/**
 * How far a line passes from the middle of the view (mid-width, mid-gap):
 * along its drawn path when it has one on screen, else from its nearer foot.
 * @param {{a:[number, number], b:[number, number], pts:Array<[number, number]>|null}} geo
 * @param {number} cx
 * @param {number} cy
 */
function distanceFromMiddle(geo, cx, cy) {
  if (geo.pts && geo.pts.length > 1) return distanceToPath(geo.pts, cx, cy);
  return Math.min(Math.hypot(geo.a[0] - cx, geo.a[1] - cy), Math.hypot(geo.b[0] - cx, geo.b[1] - cy));
}

/**
 * Every reader's link, the one passing nearest the middle of the view first
 * (the Nearby list on My Web, item 29: it was the first 36 in store order).
 * Ties keep store order.
 * @param {any} personal
 * @param {any} opts railOpts()
 * @returns {Array<{index:number, distance:number}>}
 */
export function nearestLinks(personal, opts) {
  if (!personal || !personal.count) return [];
  const rails = railFrame({ H: opts.height, DPR: opts.DPR, inset: opts.inset }, opts.base);
  const cx = opts.width / 2, cy = (rails.topY + rails.bottomY) / 2;
  const out = [];
  for (let i = 0; i < personal.count; i++) {
    out.push({ index: i, distance: distanceFromMiddle(linkGeometry(personal, i, opts, rails), cx, cy) });
  }
  return out.sort((p, q) => p.distance - q.distance || p.index - q.index);
}

/**
 * Timothy's threads nearest the middle of the view, up to `limit` (the
 * Nearby list's fallback while the reader has no link).
 * @param {any} underlay
 * @param {any} opts railOpts()
 * @param {number} limit
 * @returns {Array<{index:number, distance:number}>}
 */
export function nearestUnderlay(underlay, opts, limit) {
  if (!underlay || !underlay.count) return [];
  const rails = railFrame({ H: opts.height, DPR: opts.DPR, inset: opts.inset }, opts.base);
  const cx = opts.width / 2, cy = (rails.topY + rails.bottomY) / 2;
  const best = [];
  for (let i = 0; i < underlay.count; i++) {
    insertNearest(best, { index: i, distance: distanceFromMiddle(underlayGeometry(underlay, i, opts, rails), cx, cy) }, limit);
  }
  return best;
}

/**
 * The My Web ink law (design-perf, 2026-09-10; the note is
 * sessions/2026-09-10-orchestrator/myweb-visual-design.md, every number in it
 * measured). z = the corpus's on-screen width / the screen width: 1 at
 * overview, 1.8^n after n zoom steps.
 *
 * Context (the Volumes' own citations) is faint per edge at overview so
 * corridors glow where citations pile and a lone thread whispers, and rises
 * with zoom only until a PLATEAU: from there to the ceiling the picture only
 * thins and widens, it never brightens. The reader's links are the only
 * saturated ink: one warm gold (sw-ink myWebReader, 1.5 px at the overview,
 * thickening with depth like a canon ribbon to 2.1 px at 40x), haloed, pinned
 * at both ends by shape. The unit test reads this export; the walk reads the
 * pixels it makes.
 *
 * Call 07 (Corbin, 2026-09-12): "zooming (on either side, top or bottom)
 * makes the colors get brighter and brighter. Not necessarily bad, the normal
 * is probably too faint, but it's odd and feels confusing ... a little clearer
 * lines as you zoom in is fine." So: the floor rose 0.04 -> 0.06, the ramp
 * keeps its shape at 1.5x and STOPS at 0.30 (reached at 8.6x), and depth is
 * carried by width (0.8 -> 1.6 px at 40x), not alpha. The lone-thread 3:1 that
 * put the ceiling at 0.70 is given up on his word (palette-myweb-colour.test.js
 * records it); 0.70 stays as the hard BOUND the walk's knob may raise the
 * plateau to for a corridor comparison.
 */
/** Where the context's zoom ramp stops (call 07; C14); the default look past 8.6x. */
export const CONTEXT_PLATEAU = 0.30;
/** The context alpha's hard bound (design-myweb-colour.md, 2; the walk's knob may raise the plateau to it, never past). */
export const CONTEXT_CEILING = 0.70;
export function personalInk(z, ceiling) {
  const zz = Math.max(1, z || 1);
  const cap = ceiling > 0 ? Math.min(ceiling, CONTEXT_CEILING) : CONTEXT_PLATEAU;
  const t = Math.min(1, Math.log(zz) / Math.log(40));
  return {
    // each thread's rgb is its source's (MY_WEB_SOURCES, the sw-ink myWeb*
    // rows); only the alpha and width are the ink law's: 0.06 at 1x, 0.23 at
    // 6x, the plateau from 8.6x.
    context: { alpha: Math.min(cap, 0.06 * Math.pow(zz, 0.75)), width: 0.8 + 0.8 * t },
    // the reader's link (sw-ink myWebReader: .95, 1.5 px), thickening with depth
    // to 2.1 px at 40x so it stays at least 5x a context thread's ink to 5.8x and
    // 6x with its halo to 40x
    link: { alpha: 0.95, width: 1.5 + 0.6 * t, halo: 7, haloAlpha: 0.16, dot: 3, dotSolo: 4, ring: 5.5,
      hoverWidth: 2.5 + 0.6 * t, hoverHalo: 11, hoverHaloAlpha: 0.3 },
  };
}

/**
 * The two rails, the Volumes rail's ticks and names, and its overline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} opts
 * @param {{bottomY:number, topY:number}} rails
 */
function drawRails(ctx, opts, rails) {
  const { width, DPR, votRail } = opts;
  const compact = isCompact({ H: opts.height, DPR });
  // the Bible rail (the canon's baseline ink) and the Volumes rail (spec §4.2)
  ctx.lineWidth = DPR;
  ctx.strokeStyle = inkCss('baseline');
  ctx.beginPath();
  ctx.moveTo(0, rails.bottomY + 1.5 * DPR); ctx.lineTo(width, rails.bottomY + 1.5 * DPR);
  ctx.stroke();
  ctx.strokeStyle = inkCss('volumesRail');
  ctx.beginPath();
  ctx.moveTo(0, rails.topY); ctx.lineTo(width, rails.topY);
  ctx.stroke();
  if (!votRail || !votRail.segments || !(votRail.total > 0)) return;

  // The ticks stay under the names' baseline (fix-review #3): on a PC the
  // names sit 14 px over the rail, clear of 7 px ticks; on the phone the
  // header leaves a 12 px band and the names sit 4 px over the rail, so the
  // ticks there rise only 2 px over it and reach below it instead.
  const letterTick = compact ? [2, 2] : [4, 0], bandTick = compact ? [2, 5] : [7, 4];
  // letter ticks, 4 px, once the letters stand apart
  const pitch = Math.abs(votRailX(1, opts) - votRailX(0, opts));
  if (pitch >= LETTER_TICK_MIN * DPR) {
    const first = Math.max(0, Math.floor(votRailLeftPos(opts, pitch)));
    ctx.strokeStyle = inkCss('volumesTick');
    ctx.beginPath();
    for (let i = first; i < votRail.total; i++) {
      const x = votRailX(i + 0.5, opts);
      if (x > width) break;
      if (x < 0) continue;
      ctx.moveTo(x, rails.topY - letterTick[0] * DPR); ctx.lineTo(x, rails.topY + letterTick[1] * DPR);
    }
    ctx.stroke();
  }

  // the collections: a tick at each band's start, its name above the rail
  const size = (compact ? 11 : 13) * DPR;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = '500 ' + size + 'px ' + FONT;
  setTracking(ctx, 0.10 * size);
  // Measure before drawing: collection names are long ("Words To Live By:
  // Part One"), and a name wider than twice its band is not printed at all.
  // The rows are then given by the one placement law both rails share
  // (rail-labels.js): the top row first, the second when the top's last
  // name would be nearer than 5 px, and NO row when neither has room. Every
  // band keeps its tick either way. Before the law, a name is kept inside the
  // screen (a band cut by the edge printed its name past it: "VOL I" at
  // x = 0 on the phone, fix-review #3) and may slide right, over its own
  // band, to clear its neighbour on the top row rather than drop to the
  // second alone ("LAMB" by MTAM, fix-review #13).
  const names = [];
  const pad = 5 * DPR, inset = 4 * DPR;
  ctx.strokeStyle = inkCss('volumesTick');
  for (const seg of votRail.segments) {
    if (!seg.count) continue;
    const span = segmentSpan(seg, opts);
    if (!span) continue;
    ctx.beginPath();
    ctx.moveTo(span.x0, rails.topY - bandTick[0] * DPR); ctx.lineTo(span.x0, rails.topY + bandTick[1] * DPR);
    ctx.stroke();
    const label = (seg.short || seg.label).toUpperCase();
    const w = ctx.measureText(label).width;
    if (w > span.room * 2) continue;
    const lo = w / 2 + inset, hi = width - w / 2 - inset;
    let x = lo > hi ? width / 2 : Math.min(hi, Math.max(lo, span.labelX));
    const prev = names[names.length - 1];
    const need = prev ? prev.right + pad - (x - w / 2) : 0;
    if (need > 0 && x + need <= Math.min(hi, span.labelX + span.room / 2)) x += need;
    names.push({ label, x, left: x - w / 2, right: x + w / 2 });
  }
  const rows = placeRailLabels(names, pad, compact ? 1 : 2);
  // the phone has room for one row (spec §3: names 46-58 on the baseline 58,
  // the top chrome to 50); a name the row cannot take keeps its tick and
  // shows on a zoom. The PC's rows sit on 136 and 120 (names 116-136).
  const rowY = [14, 30];
  // every placed name in the one ink, the second row's too (fix-review #13)
  ctx.fillStyle = inkCss('volumesLabel');
  names.forEach((nm, i) => {
    if (rows[i] < 0) return;
    ctx.fillText(nm.label, nm.x, rails.topY - (compact ? 4 : rowY[rows[i] ? 1 : 0]) * DPR);
  });
  // the overline names the rail, in the left gutter over its names (PC: the
  // phone's header sits where it would go)
  if (!compact) {
    const osize = 14 * DPR;
    ctx.font = '500 ' + osize + 'px ' + FONT;
    setTracking(ctx, 0.15 * osize);
    ctx.textAlign = 'left';
    ctx.fillStyle = inkCss('volumesOverline');
    ctx.fillText('THE VOLUMES OF TRUTH', 16 * DPR, rails.topY - 46 * DPR);
  }
  setTracking(ctx, 0);
  ctx.textAlign = 'center';
}

/** The rail position at the screen's left edge, from the pitch (a cheap lower bound for the tick loop). */
function votRailLeftPos(opts, pitch) {
  const x0 = votRailX(0, opts);
  return x0 >= 0 ? 0 : -x0 / pitch - 1;
}

/** Tracked caps where the canvas has letterSpacing (Chrome 99+); a no-op where it does not. */
function setTracking(ctx, px) {
  if ('letterSpacing' in ctx) /** @type {any} */ (ctx).letterSpacing = px > 0 ? px.toFixed(2) + 'px' : '0px';
}

/**
 * Draw the personal web.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{count:number, aRail:Uint8Array, bRail:Uint8Array, aPos:Float32Array,
 *   bPos:Float32Array, kind:Uint8Array}|null} personal
 * @param {{count:number, versePos:Float32Array, votPos:Float32Array, source?:Uint8Array}|null} underlay
 * @param {{verseX:(v:number)=>number, votX?:(p:number)=>number, votRail:any, verseTotal:number, width:number, height:number,
 *   DPR:number, base:number, chrome:any, showUnderlay?:boolean, capFraction?:number,
 *   hoverIndex?:number, focusIndex?:number, hoverUnderlay?:boolean, focusUnderlay?:boolean,
 *   contextCeiling?:number, inset?:number}} opts
 *   hoverIndex / focusIndex index the reader's links, or Timothy's notes when
 *   hoverUnderlay / focusUnderlay is set (the Focus's underlay fields).
 */
export function drawPersonalWeb(ctx, personal, underlay, opts) {
  const { width, DPR, votRail, verseX } = opts;
  const rails = railFrame({ H: opts.height, DPR, inset: opts.inset }, opts.base);
  // the rails' zooms: z = the corpus's on-screen width / the screen width
  const zB = opts.verseTotal ? (verseX(opts.verseTotal) - verseX(0)) / width : 1;
  const zV = (votRail && votRail.total && opts.votX) ? (opts.votX(votRail.total) - opts.votX(0)) / width : zB;
  const z = Math.max(zB, zV);
  // a chosen line, the reader's link or Timothy's thread: the rest of the web
  // recedes to TAP_CONTEXT, never to black (fix-review #4)
  const focus = opts.focusIndex == null ? -1 : opts.focusIndex, hover = opts.hoverIndex == null ? -1 : opts.hoverIndex;
  const threads = underlay && opts.showUnderlay ? underlay.count : 0;
  const linkFocus = !opts.focusUnderlay && personal && focus < personal.count ? focus : -1;
  const linkHover = opts.hoverUnderlay ? -1 : hover;
  const threadFocus = opts.focusUnderlay && focus < threads ? focus : -1;
  const threadHover = opts.hoverUnderlay && hover < threads && hover !== threadFocus ? hover : -1;
  const chosen = linkFocus >= 0 || threadFocus >= 0;
  const rest = chosen ? TAP_CONTEXT : 1;

  // ── Timothy's notes, beneath everything ──
  if (underlay && opts.showUnderlay && underlay.count) {
    // FULL RESOLUTION, on the canvas the reader sees (Corbin, 2026-09-11:
    // the half-resolution layer read as "low resolution"). Each thread's ink
    // follows the zoom of the rails its feet hold on screen (lineZoom), in
    // the frame's rungs; a fly-over (no foot on screen) is held the same way,
    // on its own rungs from the overview's ink, at FLYOVER_LEG_WIDTH of its
    // width (Q3 ii), so anchored lines read first while every line stays
    // drawn and tappable.
    const rungs = inkRungs(zB, zV), flyRungs = inkRungs(1, Math.max(zB, zV));
    /** @type {Map<number, ContextBatches>} */
    const steps = new Map();
    for (let i = 0; i < underlay.count; i++) {
      if (i === threadFocus) continue;   // stroked last, on top of everything
      const { a, b, pts } = underlayGeometry(underlay, i, opts, rails);
      if (!pts) continue;
      const fly = /** @type {any} */ (pts).cls === 'fly';
      const step = (fly ? flyRungs : rungs).of(lineZoom(zB, presence(a[0], width), zV, presence(b[0], width)));
      const key = step * 2 + (fly ? 1 : 0);
      let batch = steps.get(key);
      if (!batch) { batch = new ContextBatches(); steps.set(key, batch); }
      batch.add(underlay.source ? underlay.source[i] : CONTEXT_BINS - 1, a[0], b[0], pts);
    }
    ctx.lineCap = 'round';
    for (const key of [...steps.keys()].sort((p, q) => p - q)) {
      const cx = personalInk((key & 1 ? flyRungs : rungs).zoom(key >> 1), opts.contextCeiling).context;
      ctx.lineWidth = cx.width * DPR * (key & 1 ? FLYOVER_LEG_WIDTH : 1);
      /** @type {ContextBatches} */ (steps.get(key)).stroke(ctx, cx.alpha * rest, ctx.lineWidth * 4, opts.capFraction);
    }
  }

  drawRails(ctx, opts, rails);
  if (personal && personal.count) drawLinks(ctx, personal, opts, rails, personalInk(z).link, linkHover, linkFocus, chosen);

  // ── Timothy's thread under the pointer, then the chosen one: on top, in its
  // own source's colour (never the reader's gold); hover dims nothing (C3) ──
  const compact = isCompact({ H: opts.height, DPR });
  if (threadHover >= 0) strokeThread(ctx, underlay, threadHover, opts, rails, INK.hoverHalo, INK.hover.alpha, INK.hover.width * DPR);
  if (threadFocus >= 0) {
    strokeThread(ctx, underlay, threadFocus, opts, rails, INK.chosenHalo, INK.chosen.alpha,
      (compact ? INK.chosen.widthCompact : INK.chosen.width) * DPR);
  }
  return rails;
}

/**
 * One of Timothy's threads, drawn alone: a halo, then its core. Sampled to
 * the reader's links' tolerance (EPS_LINK), not the faint pass's: stroked
 * alone at the chosen width with a halo, the context's 2.5 px chords showed
 * as facets on the one line the reader is looking at (Q8, item 33). The pick
 * keeps the context polyline: its 14 px reach dwarfs the difference.
 */
function strokeThread(ctx, underlay, i, opts, rails, halo, alpha, width) {
  const a = /** @type {[number, number]} */ ([opts.verseX(underlay.versePos[i]), rails.bottomY]);
  const b = endpointPoint({ rail: 1, pos: underlay.votPos[i] }, opts, rails);
  const pts = threadPath(a, b, true, { width: opts.width, gap: Math.abs(rails.bottomY - rails.topY), n: 48, eps: EPS_LINK * (opts.DPR || 1) });
  if (!pts) return;
  const bin = underlay.source ? Math.min(CONTEXT_BINS - 1, Math.max(0, underlay.source[i] | 0)) : CONTEXT_BINS - 1;
  const rgb = MY_WEB_SOURCES[bin].rgb;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [a, w] of [[halo.alpha, halo.width * opts.DPR], [alpha, width]]) {
    ctx.strokeStyle = 'rgba(' + rgb + ',' + a + ')';
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
  }
}

/** The reader's links: halo pass first so no halo covers a neighbour's core. */
function drawLinks(ctx, personal, opts, rails, L, linkHover, linkFocus, chosen) {
  const { width, DPR } = opts;

  const paths = [];
  for (let i = 0; i < personal.count; i++) {
    const { a, b, pts } = linkGeometry(personal, i, opts, rails);
    const kind = personal.kind ? personal.kind[i] : 2;
    const rgb = myWebLinkColor(kind);
    const pin = (MY_WEB_LINK_KINDS[kind] || MY_WEB_LINK_KINDS[2]).pin;
    const thin = pts && /** @type {any} */ (pts).cls === 'fly' ? FLYOVER_LEG_WIDTH : 1;
    paths.push({ a, b, pts, rgb, pin, thin });
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < personal.count; i++) {
    const { pts, rgb, thin } = paths[i];
    if (!pts) continue;
    const hot = i === linkHover || i === linkFocus;
    const dim = (chosen && i !== linkFocus) ? TAP_CONTEXT : 1;
    ctx.strokeStyle = 'rgba(' + rgb + ',' + ((hot ? L.hoverHaloAlpha : L.haloAlpha) * dim) + ')';
    ctx.lineWidth = (hot ? L.hoverHalo : L.halo) * DPR * thin;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
  }
  for (let i = 0; i < personal.count; i++) {
    const { a, b, pts, rgb, pin, thin } = paths[i];
    if (!pts) continue;
    const isHover = i === linkHover;
    const isFocus = i === linkFocus;
    const dim = (chosen && !isFocus) ? TAP_CONTEXT : 1;
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (L.alpha * dim) + ')';
    ctx.lineWidth = (isHover || isFocus ? L.hoverWidth : L.width) * DPR * thin;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
    // endpoint pins: a ring, a dot, or both, by the link's shape (the reader's
    // links are one gold, so the shape is the pin's to say), so both ends read
    // as places, not as where a line happened to stop; only on screen
    ctx.fillStyle = 'rgba(' + rgb + ',' + dim + ')';
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.9 * dim) + ')';
    ctx.lineWidth = 1 * DPR;
    for (const p of [a, b]) {
      if (p[0] < -EDGE_MARGIN || p[0] > width + EDGE_MARGIN) continue;
      if (pin !== 'dot') { ctx.beginPath(); ctx.arc(p[0], p[1], L.ring * DPR, 0, Math.PI * 2); ctx.stroke(); }
      if (pin !== 'ring') { ctx.beginPath(); ctx.arc(p[0], p[1], (pin === 'dot' ? L.dotSolo : L.dot) * DPR, 0, Math.PI * 2); ctx.fill(); }
    }
  }
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
 *   DPR:number, base:number, inset?:number}} opts
 * @param {number} px
 * @param {number} py
 * @param {number} tol
 * @param {number} [limit]
 * @returns {Array<{index:number, distance:number}>}
 */
export function pickPersonalLinks(personal, opts, px, py, tol, limit) {
  if (!personal || !personal.count) return [];
  const { base, DPR } = opts;
  const rails = railFrame({ H: opts.height, DPR, inset: opts.inset }, base);
  const cap = Math.max(1, Math.min(limit || 4, 8));
  const best = [];
  // every drawn line lies between the rails (an S between them, an arc into the gap)
  if (py < Math.min(rails.topY, rails.bottomY) - tol || py > Math.max(rails.topY, rails.bottomY) + tol) return best;
  for (let i = 0; i < personal.count; i++) {
    const a = endpointPoint({ rail: personal.aRail[i], pos: personal.aPos[i] }, opts, rails);
    const b = endpointPoint({ rail: personal.bRail[i], pos: personal.bPos[i] }, opts, rails);
    if (missesX(a, b, personal.aRail[i] !== personal.bRail[i], opts.width, px, tol)) continue;
    const pts = linkPathOf(personal, i, a, b, opts, rails);
    if (!pts) continue;
    const d = distanceToPath(pts, px, py);
    if (d < tol) insertNearest(best, { index: i, distance: d }, cap);
  }
  return best;
}

/**
 * Nearest curated underlay links. The draw and pick paths share the same
 * geometry so faint corpus context is honest: if it is visible, it can be
 * selected.
 *
 * @param {{count:number, versePos:Float32Array, votPos:Float32Array, records?:Array}|null} underlay
 * @param {{verseX:(v:number)=>number, votRail:any, verseTotal:number, width:number, height:number,
 *   DPR:number, base:number, inset?:number}} opts
 * @param {number} px
 * @param {number} py
 * @param {number} tol
 * @param {number} [limit]
 * @returns {Array<{index:number, distance:number, verse:number, votPos:number, record:any}>}
 */
export function pickUnderlayLinks(underlay, opts, px, py, tol, limit) {
  if (!underlay || !underlay.count) return [];
  const { base, DPR } = opts;
  const rails = railFrame({ H: opts.height, DPR, inset: opts.inset }, base);
  const cap = Math.max(1, Math.min(limit || 4, 8));
  const best = [];
  if (py < Math.min(rails.topY, rails.bottomY) - tol || py > Math.max(rails.topY, rails.bottomY) + tol) return best;
  for (let i = 0; i < underlay.count; i++) {
    const a = /** @type {[number, number]} */ ([opts.verseX(underlay.versePos[i]), rails.bottomY]);
    const b = endpointPoint({ rail: 1, pos: underlay.votPos[i] }, opts, rails);
    if (missesX(a, b, true, opts.width, px, tol)) continue;
    const pts = underlayPathOf(a, b, opts, rails);
    if (!pts) continue;
    const d = distanceToPath(pts, px, py);
    if (d < tol) insertNearest(best, {
      index: i, distance: d, verse: underlay.versePos[i], votPos: underlay.votPos[i],
      record: underlay.records && underlay.records[i],
    }, cap);
  }
  return best;
}
