/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/pick — Cluster F (bundle-d since lz1; lazy bundle-f before)

   "Tap any point on any line, whether at the peak of the curve or the
   beginning or ending" — this is that.

   No GPU readback, no ID buffer, no spatial index. Every arc is an analytic
   half-ellipse, so the distance from the finger to each curve is a closed
   form (geometry.arcDistance), and a bounding-box reject kills the vast
   majority before the maths runs. The shipped famous view is ~64k arcs, and
   the visible set is always far smaller than that because the density prefix
   and the bucket loop bound it.

   The one invariant that matters: this must use the SAME laws the vertex
   shader draws with. There are THREE of them, and geometry.js owns all.
   Height (geometry.arcShape, the half-ellipse of a thread's own span, its
   feet at geometry.footX) — or arcs become untappable exactly where they
   look tappable. A fly-over (geometry.arcAnchored + flyOverWidth) only
   thins, its alpha unchanged, so no thread the shader draws is refused a
   tap for it. Nothing is hidden (the structure law, 2026-09-21): every thread crossing
   the frame is drawn and pickable, so there is no third law. Visible equals
   pickable, in both directions: the picker, the label pass and the pills
   read the frame's visible set (frame-set.frameSet, E1), the set the
   renderer draws, so a thread whose body never reaches the frame is
   neither drawn nor tapped, labelled or counted.

   One exception, and it is the reader's own choice (A1, w2 digest item 7):
   while a thread or a range is chosen, the rest recede to the tap context
   and step back as targets too (focusedPickFilter). A tap beside the chosen
   line then lands on what reads as empty sky, and empty sky clears the
   choice; once it clears, every thread is a target again.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  arcAnchored, arcDistance, arcShape, arcHeightAt, verseToX, xToVerse, footX,
  FLYOVER_MARGIN, LOCALIZE_START,
} from './geometry.js';
import { bucketDrawCount, fansOf } from './decode.js';
import { walkDrawnRuns } from './chunk-walk.js';
import { prophecySet, frameSet, inFrame, drawOrder } from './frame-set.js';

/** The most threads one pick returns: one past the tap chooser's eight, so the tap can tell eight
 * threads from the nearest eight of more (s27.3). */
const PICK_MOST = 9;

/**
 * Nearest arc to a screen point.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, ceil:number, squash:number,
 *   localize:number, density:import('./decode.js').Density,
 *   rulerDepth?:number}} view
 * @param {number} px
 * @param {number} py
 * @param {number} tol — hit tolerance, device px
 * @returns {{ index:number, distance:number, from:number, to:number, votes:number }|null}
 */
export function pickArc(g, cam, view, px, py, tol) {
  return pickArcs(g, cam, view, px, py, tol, 1)[0] || null;
}

/** The lit sets already turned into lookups, by the (never mutated) array focus-state hands over. */
const LIT_SETS = new WeakMap();
function litSetOf(lit) {
  if (!lit || !lit.length) return null;
  let set = LIT_SETS.get(lit);
  if (!set) { set = new Set(lit); LIT_SETS.set(lit, set); }
  return set;
}

/**
 * Which threads are targets while something is chosen (A1): the ones the shader keeps lit
 * (web-renderer.js, its focus rule) - the chosen thread; a thread with a foot in the chosen range;
 * and a thread in the lit set (go-to's fan, verse mode). Null when nothing is chosen (no focusArc, no focusProphecy, no focusRange): then every
 * thread is a target. A chosen prophecy pair recedes the rest as an arc does (the shader's
 * `chosen` counts it), so it filters too: its own OpenBible arc, when it is one (`g` names it), is
 * the chosen thread. `index` -1 is a prophecy pair that is no arc (pickProphecy): only the range
 * law can keep it.
 * @param {{ focusArc?: number, focusProphecy?: number, focusRange?: (number[]|null),
 *   lit?: (ArrayLike<number>|null) }} view
 * @param {any} [g]  the decoded graph, for a chosen prophecy pair's arc
 * @returns {((index: number, from: number, to: number) => boolean) | null}
 */
export function focusedPickFilter(view, g) {
  const arc = view.focusArc != null ? view.focusArc : -1;
  const pair = view.focusProphecy != null ? view.focusProphecy : -1;
  const r = view.focusRange && view.focusRange[0] <= view.focusRange[1] ? view.focusRange : null;
  if (arc < 0 && pair < 0 && !r) return null;
  const lit = litSetOf(view.lit);
  const ps = pair >= 0 && g ? prophecySet(g) : null;
  const pairArc = ps && pair < ps.count ? ps.arcOf[pair] : -1;
  return (i, from, to) => {
    if (i >= 0 && (i === arc || i === pairArc)) return true;
    if (i >= 0 && lit && lit.has(i)) return true;
    if (!r) return false;
    return (from >= r[0] && from <= r[1]) || (to >= r[0] && to <= r[1]);
  };
}

/**
 * Nearest arcs to a screen point, retaining a small candidate set so dense
 * crossings can be disambiguated instead of silently choosing one line.
 * While something is chosen only the lit threads are candidates (focusedPickFilter).
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, ceil:number, squash:number,
 *   localize:number, density:import('./decode.js').Density,
 *   focusArc?:number, focusRange?:(number[]|null),
 *   lit?:(ArrayLike<number>|null)}} view
 * @param {number} px
 * @param {number} py
 * @param {number} tol
 * @param {number} [limit]
 * @returns {Array<{ index:number, distance:number, from:number, to:number, votes:number }>}
 */
export function pickArcs(g, cam, view, px, py, tol, limit) {
  const { width, squash, density } = view;
  // The baseline as DRAWN: the camera's y shifts the whole picture down the
  // frame, so the curve the finger meets stands cam.y below the frame's base.
  const base = view.base + (cam.y > 0 ? cam.y : 0);
  const { fanA, fanB } = fansOf(g);
  const ppv = cam.ppv;
  const cap = Math.max(1, Math.min(limit || 4, PICK_MOST));
  const best = [];
  const verseAtPoint = xToVerse(cam, width, px);
  // a verse of slack for the chunk cull: a foot stands anywhere in its verse's cell (footX)
  const verseTolerance = tol / ppv + 1;
  const chunkSize = g.chunkSize || 256;
  const lo = verseAtPoint - verseTolerance, hi = verseAtPoint + verseTolerance;
  // the frame's visible set (E1): a thread the renderer did not draw is not there to tap
  const set = frameSet(g, cam, view);
  const target = focusedPickFilter(view, g);

  for (const bucket of g.buckets) {
    walkDrawnRuns(bucket, bucketDrawCount(bucket, density), chunkSize, lo, hi, (start, end) => {
      for (let i = start; i < end; i++) {
        if (!inFrame(set, i)) continue;
        if (target && !target(i, g.from[i], g.to[i])) continue;
        // the feet as drawn: in their verses' cells, by rank (geometry.footX)
        const x0 = footX(cam, width, g.from[i], fanA[i]);
        const x1 = footX(cam, width, g.to[i], fanB[i]);
        // Cheap x-range reject before any ellipse maths.
        if (x1 < px - tol || x0 > px + tol) continue;
        // Pickable iff painted: a fly-over draws thinner, never fainter
        // (geometry.flyOverWidth), so it is there to be tapped.
        // the curve as the shader draws it: the half-ellipse of its own span
        const { A } = arcShape((x1 - x0) * 0.5, squash);
        const d = arcDistance(px, py, x0, x1, base, A, tol);
        if (d >= tol || (best.length === cap && d >= best[best.length - 1].distance)) continue;
        let at = best.length;
        while (at > 0 && best[at - 1].distance > d) at--;
        best.splice(at, 0, {
          index: i, distance: d, from: g.from[i], to: g.to[i], votes: g.votes[i],
        });
        if (best.length > cap) best.pop();
      }
    });
  }
  return best;
}

/**
 * The prophecy class under a point (GL item 4): every g.prophecy pair is
 * drawn, always, at every density, by the top pass (web-renderer.js) on the
 * feet frame-set.prophecySet gives it, so it is pickable on the same curve.
 * A hit names the pair (`prophecy`, an index into g.prophecy) and the
 * OpenBible arc that joins the same verses (`index`, or -1 when none: 107 of
 * the asset's 132 pairs). Nearest first. While a line is chosen the class
 * recedes with the rest (frame-set.topSet) and steps back as targets too
 * (A1): only the chosen pair, a pair whose arc is a target
 * (focusedPickFilter) and the pairs the chosen range keeps lit are found.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, squash:number, focusArc?:number, focusProphecy?:number,
 *   focusRange?:(number[]|null), lit?:(ArrayLike<number>|null)}} view
 * @param {number} px @param {number} py
 * @param {number} tol  device px
 * @param {number} [limit]
 * @returns {Array<{ prophecy:number, index:number, distance:number, from:number, to:number, votes:number }>}
 */
export function pickProphecy(g, cam, view, px, py, tol, limit) {
  const ps = prophecySet(g);
  if (!ps.count) return [];
  const { width, squash } = view;
  const base = view.base + (cam.y > 0 ? cam.y : 0);
  const cap = Math.max(1, Math.min(limit || 4, PICK_MOST));
  const best = [];
  const target = focusedPickFilter(view, g);
  const chosen = view.focusProphecy != null ? view.focusProphecy : -1;
  for (let k = 0; k < ps.count; k++) {
    if (ps.twin[k] !== k) continue;   // a pair given twice is one thread, found as the first
    if (target && k !== chosen && !target(ps.arcOf[k], ps.from[k], ps.to[k])) continue;
    const x0 = footX(cam, width, ps.from[k], ps.fanA[k]);
    const x1 = footX(cam, width, ps.to[k], ps.fanB[k]);
    if (x1 < px - tol || x0 > px + tol) continue;
    const { A } = arcShape((x1 - x0) * 0.5, squash);
    const d = arcDistance(px, py, x0, x1, base, A, tol);
    if (d >= tol || (best.length === cap && d >= best[best.length - 1].distance)) continue;
    let at = best.length;
    while (at > 0 && best[at - 1].distance > d) at--;
    const i = ps.arcOf[k];
    best.splice(at, 0, { prophecy: k, index: i, distance: d, from: ps.from[k], to: ps.to[k], votes: i >= 0 ? g.votes[i] : 0 });
    if (best.length > cap) best.pop();
  }
  return best;
}

/**
 * The threads under a point, the tap's and the hover's candidate set: the
 * drawn arcs (pickArcs), an arc that is a prophecy pair flagged with it
 * (`prophecy`, its index in g.prophecy; -1 otherwise), and the prophecy pairs
 * the arcs did not bring (no arc, or one outside the density) as threads of
 * their own. Nearest first, at most `limit`.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, ceil:number, squash:number,
 *   localize:number, density:import('./decode.js').Density}} view
 * @param {number} px @param {number} py
 * @param {number} tol  device px
 * @param {number} [limit]
 * @returns {Array<{ index:number, prophecy:number, distance:number, from:number, to:number, votes:number }>}
 */
export function pickThreads(g, cam, view, px, py, tol, limit) {
  // the ruler band is the ruler's: the renderer scissors every thread pass at
  // the ruler's top (view.base, whatever cam.y), so a line sunk through it by
  // a camera looking up is not drawn there and is not picked there either
  if (py > view.base + tol) return [];
  const cap = Math.max(1, Math.min(limit || 4, PICK_MOST));
  const ps = prophecySet(g);
  const hits = pickArcs(g, cam, view, px, py, tol, cap).map((h) => {
    const k = ps.pairOf.get(h.index);
    return Object.assign(h, { prophecy: k === undefined ? -1 : k });
  });
  for (const p of pickProphecy(g, cam, view, px, py, tol, cap)) {
    if (!hits.some((h) => h.prophecy === p.prophecy || (p.index >= 0 && h.index === p.index))) hits.push(p);
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits.slice(0, cap);
}

/**
 * The drawn threads, in draw order: the set a label pass walks (Corbin's
 * brief, 2026-09-11: "when zoomed close, each line shows its source and
 * target beside it"). It IS the frame's visible set (frame-set.frameSet,
 * the renderer's), widest first, so a label is written for a line the
 * reader can see and never for one the shader skipped.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, squash:number, density:import('./decode.js').Density, dpr?:number}} view
 * @param {number} limit — at most this many, so a dense screen bounds its own pass
 * @returns {number[]} instance indices
 */
export function visibleArcs(g, cam, view, limit) {
  const set = frameSet(g, cam, view);
  const n = set.count < limit ? set.count : Math.max(0, Math.floor(limit));
  const out = new Array(n);
  for (let k = 0; k < n; k++) out[k] = set.list[k];
  return out;
}

/**
 * @typedef {{ i:number, x0:number, x1:number, A:number, fromOn:boolean, toOn:boolean, anchored:boolean }} FeedThread
 *   i: the instance; x0, x1: its feet as drawn (footX), device px; A: its apex
 *   height (arcShape); fromOn / toOn: that foot stands on the frame (0..width);
 *   anchored: the shader's word (arcAnchored, a foot within the margin)
 */

/**
 * The label pass's feed for one frame (digest C2: "a label engine fed from
 * the visible list"): every drawn thread a reader can see on this frame, in
 * draw order, each with its feet and apex so the labeller ranks and places
 * without walking the curve again. Seen means some point of its drawn body
 * is in the sky - x in [0, width], y between the sky's top (view.inset) and
 * the baseline - which the half-ellipse answers in closed form: over the
 * frame's x range the height runs from its lower end to the apex (or the
 * higher end, when the apex is off the frame), and that range must meet
 * [camY, base + camY - inset]. A foot on the frame at camY 0 is always seen.
 *
 * This replaces walking visibleArcs for labels: that list is the CROSSING
 * set in bucket order, cut at a limit, so at the ceiling the label pass
 * stopped among fly-overs whose bodies were in the sky far above the frame
 * and labelled 22 of the 86 threads on screen (digest item 3). Here nothing
 * is cut by order: fly-overs (both feet off the frame) come only when asked
 * for, and only those whose bodies are in the frame.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, squash:number, density:import('./decode.js').Density, inset?:number}} view
 * @param {{ flyovers?: boolean, limit?: number }} [opts]  flyovers: include threads with
 *   neither foot on the frame; limit: a safety cap (default 50,000)
 * @returns {FeedThread[]}
 */
export function labelFeed(g, cam, view, opts) {
  /** @type {FeedThread[]} */
  const out = [];
  const width = view.width;
  eachLabelThread(g, cam, view, opts, (i, x0, x1, A, fromOn, toOn) => {
    out.push({ i, x0, x1, A, fromOn, toOn, anchored: arcAnchored(x0, x1, width) === 1 });
  });
  return out;
}

/**
 * labelFeed's walk without the list: `visit(i, x0, x1, A, fromOn, toOn)` for
 * every thread labelFeed would hold, in the same order, with nothing made
 * per thread. The overlay's chip pass ranks every foot on the frame this way
 * (some 17,000 threads at 6x) and keeps the few dozen that can win, so the
 * thousands that cannot cost no object. Returns how many it visited.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, squash:number, density:import('./decode.js').Density, inset?:number}} view
 * @param {{ flyovers?: boolean, limit?: number }|null|undefined} opts  as labelFeed's
 * @param {(i:number, x0:number, x1:number, A:number, fromOn:boolean, toOn:boolean) => void} visit
 * @returns {number}
 */
export function eachLabelThread(g, cam, view, opts, visit) {
  const { width, squash, density } = view;
  if (!g || !g.count || !(width > 0)) return 0;
  const inset = view.inset > 0 ? view.inset : 0;
  const camY = cam.y > 0 ? cam.y : 0;
  // the sky, as heights above the DRAWN baseline (base + camY)
  const hLow = camY, hHigh = view.base + camY - inset;
  if (!(hHigh > hLow)) return 0;
  const flyovers = !!(opts && opts.flyovers);
  const limit = opts && opts.limit > 0 ? opts.limit : 50000;
  const { fanA, fanB } = fansOf(g);
  const lo = xToVerse(cam, width, 0) - 1, hi = xToVerse(cam, width, width) + 1;
  const chunkSize = g.chunkSize || 256;
  let n = 0;
  for (const bucket of g.buckets) {
    const full = walkDrawnRuns(bucket, bucketDrawCount(bucket, density), chunkSize, lo, hi, (start, end) => {
      for (let i = start; i < end; i++) {
        const x0 = footX(cam, width, g.from[i], fanA[i]);
        const x1 = footX(cam, width, g.to[i], fanB[i]);
        if (x1 < 0 || x0 > width) continue;
        const fromOn = x0 >= 0 && x0 <= width, toOn = x1 >= 0 && x1 <= width;
        if (!fromOn && !toOn && !flyovers) continue;
        const { A } = arcShape((x1 - x0) * 0.5, squash);
        // a foot on the frame with the camera on the baseline is always seen (height 0 there,
        // the sky's floor); every other thread asks the curve
        if (!((fromOn || toOn) && hLow <= 0)) {
          const xa = x0 > 0 ? x0 : 0, xb = x1 < width ? x1 : width;
          const ha = arcHeightAt(xa, x0, x1, A), hb = arcHeightAt(xb, x0, x1, A);
          const cx = (x0 + x1) * 0.5;
          const hMax = cx >= xa && cx <= xb ? A : (ha > hb ? ha : hb);
          const hMin = ha < hb ? ha : hb;
          if (hMax < hLow || hMin > hHigh) continue;
        }
        visit(i, x0, x1, A, fromOn, toOn);
        if (++n >= limit) return true;
      }
      return false;
    });
    if (full) break;
  }
  return n;
}

/**
 * @typedef {{ verse:number, x:number, onScreen:boolean,
 *   at:({x:number, y:number, angle:number}|null) }} ThreadEnd
 *   x: the foot's screen x, device px. at: for a foot the frame does not
 *   hold, the body's nearest on-screen point to it (where its reference is
 *   written) with the tangent's angle read left to right, screen radians;
 *   null when the foot is on screen or nothing of the body is.
 */

/**
 * The two ends of one thread as the reader sees them (the brief's "the
 * verse refs at the two feet, or at the body when the feet are off-screen").
 * The height is arcHeightAt — the analytic form of the curve the shader
 * draws, from the same feet (footX) and cam.y the picker uses — so the
 * label sits on the ribbon and not beside where a flat arc would be.
 *
 * The frame a body point must fall in is the sky: x in [0, width], y in
 * [view.inset, view.base] — the ruler below the baseline is not the web, and
 * the chrome across the top (view.inset, device px, 0 when hidden) covers
 * whatever is written under it. A body that climbs past that line is
 * labelled where it crosses it.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, ceil:number, squash:number, localize:number, inset?:number}} view
 * @param {number} i — instance index
 * @returns {{ from: ThreadEnd, to: ThreadEnd }}
 */
export function threadEnds(g, cam, view, i) {
  const { width, squash } = view;
  const inset = view.inset > 0 ? view.inset : 0;
  const camY = cam.y > 0 ? cam.y : 0;
  const base = view.base + camY;
  const { fanA, fanB } = fansOf(g);
  const x0 = footX(cam, width, g.from[i], fanA[i]);
  const x1 = footX(cam, width, g.to[i], fanB[i]);
  const { A } = arcShape((x1 - x0) * 0.5, squash);
  const yAt = (x) => base - arcHeightAt(x, x0, x1, A);
  const inSky = (x) => { const y = yAt(x); return y >= inset && y <= view.base; };
  // the body's x range the frame holds; empty when the thread is wholly off it
  const xa = Math.max(0, x0), xb = Math.min(width, x1);
  const STEPS = 32;
  /** walk from the `from` side (dir 1) or the `to` side (dir -1) to the first on-screen point */
  const nearest = (dir) => {
    if (!(xb > xa)) return null;
    let prev = dir > 0 ? xa : xb;
    if (inSky(prev)) return point(prev, dir);
    for (let k = 1; k <= STEPS; k++) {
      const x = dir > 0 ? xa + ((xb - xa) * k) / STEPS : xb - ((xb - xa) * k) / STEPS;
      if (inSky(x)) {
        // bisect the crossing between the last off-screen sample and this one
        let off = prev, on = x;
        for (let b = 0; b < 8; b++) {
          const mid = (off + on) / 2;
          if (inSky(mid)) on = mid; else off = mid;
        }
        return point(on, dir);
      }
      prev = x;
    }
    return null;
  };
  const point = (x, dir) => {
    // the tangent by a short difference toward the frame's inside, read left to right
    const d = Math.max(1, (xb - xa) / 512) * dir;
    const y = yAt(x), y2 = yAt(x + d);
    return { x, y, angle: Math.atan2((y2 - y) * dir, Math.abs(d)) };
  };
  const end = (verse, x, dir) => ({
    verse, x, onScreen: x >= 0 && x <= width,
    at: x >= 0 && x <= width ? null : nearest(dir),
  });
  return { from: end(g.from[i], x0, 1), to: end(g.to[i], x1, -1) };
}

/**
 * Where a thread's body is best labelled from the middle: the on-screen
 * point of its drawn curve nearest the centre of the x range the frame
 * holds, walking outward in both directions, or null when no point of the
 * body is in the sky. A fly-over representative's badge goes here - its
 * feet are both off the frame, so threadEnds' nearest points sit at the
 * frame's edges, where a badge is clipped.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, ceil:number, squash:number, localize:number, inset?:number}} view
 * @param {number} i
 * @param {number} [margin] - device px the point must clear the sky's top and the baseline by
 * @returns {{x:number, y:number}|null}
 */
export function bodyMidpoint(g, cam, view, i, margin = 0) {
  const { width, squash } = view;
  const inset = (view.inset > 0 ? view.inset : 0) + margin;
  const camY = cam.y > 0 ? cam.y : 0;
  const base = view.base + camY;
  const { fanA, fanB } = fansOf(g);
  const x0 = footX(cam, width, g.from[i], fanA[i]);
  const x1 = footX(cam, width, g.to[i], fanB[i]);
  const xa = Math.max(0, x0), xb = Math.min(width, x1);
  if (!(xb > xa)) return null;
  const { A } = arcShape((x1 - x0) * 0.5, squash);
  const yAt = (x) => base - arcHeightAt(x, x0, x1, A);
  const mid = (xa + xb) / 2;
  const STEPS = 16;
  for (let k = 0; k <= STEPS; k++) {
    for (const dir of k === 0 ? [1] : [1, -1]) {
      const x = mid + (dir * (xb - xa) * k) / (2 * STEPS);
      const y = yAt(x);
      if (y >= inset && y <= view.base - margin) return { x, y };
    }
  }
  return null;
}

/**
 * How many DRAWN arcs are anchored to the passage on screen.
 *
 * Not `stats.instances`, which counts what was submitted to the GPU: chunk
 * extents overlapping the viewport, 18,944 on desktop at the ceiling against
 * the 336 that actually paint — 50x off the population the eye sees. This
 * applies the shader's own arcAnchored law to the same instances the shader
 * draws, so the style law is fed the number a reader is looking at.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {number} width — viewport width, device px
 * @param {import('./decode.js').Density} density
 * @returns {number}
 */
export function countAnchored(g, cam, width, density) {
  let n = 0;
  const { fanA, fanB } = fansOf(g);
  for (const bucket of g.buckets) {
    const end = bucket.off + bucketDrawCount(bucket, density);
    for (let i = bucket.off; i < end; i++) {
      // the feet as drawn (geometry.footX), so the count is the shader's
      if (arcAnchored(footX(cam, width, g.from[i], fanA[i]), footX(cam, width, g.to[i], fanB[i]), width)) n++;
    }
  }
  return n;
}

/**
 * Every arc touching a verse range — the focus set behind "show me this
 * chapter's whole web". Returns indices in draw order.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {number} lo
 * @param {number} hi
 * @param {import('./decode.js').Density} density
 * @param {number} [limit] stop after this many (0/undefined = no cap)
 */
export function arcsTouching(g, lo, hi, density, limit) {
  const out = [];
  for (const bucket of g.buckets) {
    const end = bucket.off + bucketDrawCount(bucket, density);
    for (let i = bucket.off; i < end; i++) {
      const a = g.from[i], b = g.to[i];
      if ((a >= lo && a <= hi) || (b >= lo && b <= hi)) {
        out.push(i);
        if (limit && out.length >= limit) return out;
      }
    }
  }
  return out;
}

/**
 * How many arcs touch a verse range (cheaper than materializing them).
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {number} lo
 * @param {number} hi
 * @param {import('./decode.js').Density} density
 */
export function countTouching(g, lo, hi, density) {
  let n = 0;
  for (const bucket of g.buckets) {
    const end = bucket.off + bucketDrawCount(bucket, density);
    for (let i = bucket.off; i < end; i++) {
      const a = g.from[i], b = g.to[i];
      if ((a >= lo && a <= hi) || (b >= lo && b <= hi)) n++;
    }
  }
  return n;
}

/**
 * The chapter under a point in the ruler strip below the baseline.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, rulerDepth?:number}} view
 * @param {number} px
 * @param {number} py
 * @returns {number} chapter index, or -1
 */
export function pickChapter(g, cam, view, px, py) {
  const { width, base, rulerDepth } = view;
  if (py < base - 2 || py > base + (rulerDepth || 40)) return -1;
  const v = Math.floor(xToVerse(cam, width, px));
  if (!(v >= 0 && v < g.total)) return -1;
  return g.chapterOfVerse[v];
}

/**
 * The verse under a point, once zoomed far enough that verses are addressable.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, rulerDepth?:number}} view
 * @param {number} px
 * @param {number} py
 * @returns {number} verse id, or -1
 */
export function pickVerse(g, cam, view, px, py) {
  const { width, base, rulerDepth } = view;
  if (py < base - 2 || py > base + (rulerDepth || 40)) return -1;
  const v = Math.floor(xToVerse(cam, width, px));
  if (!(v >= 0 && v < g.total)) return -1;
  return v;
}

/**
 * Resolve a verse id to a human reference.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {number} verseId
 * @returns {{ bookId:string, bookTitle:string, abbr:string, chapter:number,
 *   verse:number, chapterIndex:number, label:string }}
 */
export function refOfVerse(g, verseId) {
  const ci = g.chapterOfVerse[verseId];
  const ch = g.chapters[ci];
  const book = g.books[ch[0]];
  const verse = verseId - ch[2] + 1;
  return {
    bookId: book.id,
    bookTitle: book.title,
    abbr: book.abbr,
    chapter: ch[1],
    verse,
    chapterIndex: ci,
    label: `${book.title} ${ch[1]}:${verse}`,
  };
}

/**
 * The chapter under the frame's centre, as a verse range, once the reader is
 * past the overview (LOCALIZE_START x fit); null at the overview, where the
 * dome is the picture. It dims nothing: the lens that kept the rest at 0.35
 * is retired (Q2). The Nearby list and the screen's list eyebrow read it;
 * the emphasised centre chapter is web-frame.centreRange (the canvas area's
 * centre, with a hold), which agrees with this whenever no panel is open
 * and the camera is not inside a hold.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {number} width - device px
 * @returns {[number, number]|null}
 */
export function lensRange(g, cam, width) {
  if (!g || !g.chapters || !g.chapters.length || !g.chapterOfVerse || !(width > 0) || !(cam.ppv > 0)) return null;
  const zoom = cam.ppv / (width / cam.total);
  if (!(zoom >= LOCALIZE_START)) return null;
  const v = Math.floor(xToVerse(cam, width, width / 2));
  if (!(v >= 0) || v >= g.total) return null;
  const ci = g.chapterOfVerse[v];
  if (!(ci >= 0) || ci >= g.chapters.length) return null;
  return chapterRange(g, ci);
}

/**
 * The chapter the Nearby list reads (landing 15): lensRange's chapter once
 * the reader is past the overview, else the chapter under the frame's
 * centre - the same verse either way (cam.x IS the centre). -1 for an
 * empty graph.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {number} width - device px
 */
export function nearbyChapter(g, cam, width) {
  if (!g || !g.chapters || !g.chapters.length || !g.chapterOfVerse || !(g.total > 0)) return -1;
  const lens = lensRange(g, cam, width);
  const v = lens ? lens[0] : Math.max(0, Math.min(g.total - 1, Math.round(cam.x)));
  const ci = g.chapterOfVerse[v];
  return ci >= 0 && ci < g.chapters.length ? ci : -1;
}

/**
 * The threads of a verse range for a list a reader walks: every thread
 * touching [lo, hi] (arcsTouching, nothing hidden), the strongest first
 * (votes descending), the shorter first among equals, cut to `limit`.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {number} lo @param {number} hi
 * @param {import('./decode.js').Density} density
 * @param {number} limit
 * @returns {number[]} instance indices
 */
export function nearbyThreads(g, lo, hi, density, limit) {
  const all = arcsTouching(g, lo, hi, density, 0);
  all.sort((i, j) => (g.votes[j] - g.votes[i])
    || (Math.abs(g.to[i] - g.from[i]) - Math.abs(g.to[j] - g.from[j]))
    || (i - j));
  return limit > 0 ? all.slice(0, limit) : all;
}

/**
 * First and last verse ids of a chapter, inclusive.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {number} chapterIndex
 * @returns {[number, number]}
 */
export function chapterRange(g, chapterIndex) {
  const ch = g.chapters[chapterIndex];
  return [ch[2], ch[2] + ch[3] - 1];
}

/** Screen x of a verse — re-exported so callers need only this module. */
/* ── Convergence (structure-law.md; density-law.md section 2 before it) ──
 *
 * Every thread is drawn; what converges is counted: at each in-view FOOT
 * CELL the anchored threads with a foot there are a bundle with a count
 * pill. These passes produce those numbers for the badge layer, over the
 * frame's visible set and the same feet (geometry.footX) the shader uses,
 * so a pill counts exactly what is drawn there.
 */

/** Narrowest badge cell, CSS px: chapters narrower than this merge into runs. */
export const BUNDLE_MIN_CSS = 34;

/** CSS px per verse from which a badge cell is one VERSE, not a chapter (the tap law's threshold). */
export const BUNDLE_VERSE_PPV_CSS = 26;

/**
 * @typedef {{ lo:number, hi:number, x:number, hidden:number, drawn:number,
 *   chapterLo:number, chapterHi:number, verse:boolean }} FootBundle
 *   lo..hi: the cell's verse range (inclusive); x: its centre, device px;
 *   drawn: anchored threads with a foot here (every one is drawn: hidden is
 *   0, kept so the sheet's wording has one field to read); chapterLo..
 *   chapterHi: the chapters the cell spans; verse: the cell is a single verse.
 */

/**
 * The badge cells across the frame and how many threads converge on each.
 * Cells are verses once a verse is BUNDLE_VERSE_PPV_CSS wide, else chapters,
 * adjacent chapters merged left to right until a cell is BUNDLE_MIN_CSS wide
 * (a badge must be readable and tappable). A thread counts once per cell
 * that holds a foot of it: every thread of the density anchored to the frame
 * (arcAnchored on its drawn feet), whatever its body - the count its sheet
 * (bundleGroups) and the crowding law (countAnchored) read, so in the sky
 * too (C14). Until GL review 2026-10-18 (finding 7) it counted only the
 * frame's visible set, which in the sky drops a thread whose body passes
 * under the frame: the pill read 274 where its sheet listed 1,044.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, squash:number, density:import('./decode.js').Density, dpr?:number}} view
 * @param {number} dpr
 * @returns {FootBundle[]}
 */
export function footBundles(g, cam, view, dpr) {
  const { width } = view;
  const ppvCss = cam.ppv / (dpr || 1);
  const minVerses = (BUNDLE_MIN_CSS * (dpr || 1)) / cam.ppv;
  const lo = Math.max(0, Math.floor(xToVerse(cam, width, -FLYOVER_MARGIN)));
  const hi = Math.min(g.total - 1, Math.ceil(xToVerse(cam, width, width + FLYOVER_MARGIN)));
  if (hi < lo) return [];
  /** @type {FootBundle[]} */
  const cells = [];
  if (ppvCss >= BUNDLE_VERSE_PPV_CSS) {
    for (let v = lo; v <= hi; v++) {
      const ci = g.chapterOfVerse[v];
      cells.push({ lo: v, hi: v, x: 0, hidden: 0, drawn: 0, chapterLo: ci, chapterHi: ci, verse: true });
    }
  } else {
    let ci = g.chapterOfVerse[lo];
    while (ci < g.chapters.length && g.chapters[ci][2] <= hi) {
      const start = g.chapters[ci][2];
      let end = ci;
      // merge chapters until the run is wide enough
      while (g.chapters[end][2] + g.chapters[end][3] - start < minVerses && end + 1 < g.chapters.length) end++;
      const last = g.chapters[end][2] + g.chapters[end][3] - 1;
      cells.push({ lo: start, hi: last, x: 0, hidden: 0, drawn: 0, chapterLo: ci, chapterHi: end, verse: false });
      ci = end + 1;
    }
  }
  if (!cells.length) return cells;
  // verse -> cell index over the covered range, for the counting pass
  const first = cells[0].lo, span = cells[cells.length - 1].hi - first + 1;
  const cellOf = new Int32Array(span).fill(-1);
  for (let c = 0; c < cells.length; c++) {
    for (let v = cells[c].lo; v <= cells[c].hi; v++) if (v - first >= 0 && v - first < span) cellOf[v - first] = c;
  }
  const half = width / 2, camX = cam.x, ppv = cam.ppv;
  // the density's threads (the visible set's own order, E1), walked by the feet that stand in the cells
  const { ids, fx0, fx1, footStart, foot } = drawOrder(g, view.density);
  const cellAt = (v) => (v - first >= 0 && v - first < span ? cellOf[v - first] : -1);
  const end = footStart[first + span];
  for (let j = footStart[first]; j < end; j++) {
    const rank = foot[j] >> 1;
    const i = ids[rank];
    const ca = cellAt(g.from[i]), cb = cellAt(g.to[i]);
    // a thread with both feet in one cell counts once, at its from-foot
    const isTo = (foot[j] & 1) === 1;
    if (isTo && cb === ca) continue;
    // the feet as drawn (geometry.footX): anchored is the shader's word
    if (!arcAnchored((fx0[rank] - camX) * ppv + half, (fx1[rank] - camX) * ppv + half, width)) continue;
    const c = isTo ? cb : ca;
    if (c >= 0) cells[c].drawn++;
  }
  for (const cell of cells) cell.x = ((cell.lo + cell.hi + 1) / 2 - camX) * ppv + half;
  return cells;
}

/**
 * @typedef {{ chapterIndex:number, lo:number, hi:number, count:number, hidden:number, votes:number }} BundleGroup
 *   one target chapter of a foot cell's threads: how many, hidden (always 0:
 *   every thread is drawn; the sheet still reads the field), and the
 *   strongest's votes.
 */

/**
 * A foot cell's threads grouped by the chapter at the OTHER end - the list
 * behind a "+n" badge. Threads with both feet in the cell group under their
 * own chapter. Sorted by count, then votes. Counts exactly what footBundles
 * counted: a thread ANCHORED to the frame with a foot in the cell (a cell at
 * the frame's edge runs off screen, and the badge does not count the
 * threads out there - the refuter, 2026-09-21: badge +50, sheet 157).
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, density:import('./decode.js').Density, level?:number}} view
 * @param {number} lo @param {number} hi - the cell's verse range
 * @param {number} [limit]
 * @returns {BundleGroup[]}
 */
export function bundleGroups(g, cam, view, lo, hi, limit) {
  const { width, density } = view;
  const { fanA, fanB } = fansOf(g);
  /** @type {Map<number, BundleGroup>} */
  const groups = new Map();
  for (const bucket of g.buckets) {
    const end = bucket.off + bucketDrawCount(bucket, density);
    for (let i = bucket.off; i < end; i++) {
      const a = g.from[i], b = g.to[i];
      const aIn = a >= lo && a <= hi, bIn = b >= lo && b <= hi;
      if (!aIn && !bIn) continue;
      const x0 = footX(cam, width, a, fanA[i]), x1 = footX(cam, width, b, fanB[i]);
      const anchored = arcAnchored(x0, x1, width);
      if (!anchored) continue;
      const other = aIn ? b : a;
      const ci = g.chapterOfVerse[other];
      let grp = groups.get(ci);
      if (!grp) {
        const ch = g.chapters[ci];
        grp = { chapterIndex: ci, lo: ch[2], hi: ch[2] + ch[3] - 1, count: 0, hidden: 0, votes: 0 };
        groups.set(ci, grp);
      }
      grp.count++;
      if (g.votes[i] > grp.votes) grp.votes = g.votes[i];
    }
  }
  const out = [...groups.values()].sort((p, q) => q.count - p.count || q.votes - p.votes || p.chapterIndex - q.chapterIndex);
  return limit ? out.slice(0, limit) : out;
}

export { verseToX, xToVerse };
