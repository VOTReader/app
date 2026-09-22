/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/pick — Cluster F (esbuild bundle-f.js)

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
   Height (geometry.arcShape) — or arcs become untappable exactly where
   they look tappable. Visibility (geometry.arcAnchored + flyOverDim) — or
   the reverse: at full localize an arc with neither foot near the viewport
   paints alpha 0, and picking it silently focuses a line nobody can see.
   Density (geometry.lodShown over decode.lodOf's table, when the view
   carries a `level`) — the thread the law did not draw at this zoom is not
   there to tap; the tapped one (view.focusArc) and the focus range always
   are, as in the shader. Visible equals pickable, in both directions.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  arcAnchored, arcDistance, arcShape, arcHeightAt, spanLogOf, flyOverDim, verseToX, xToVerse, DOME,
  lodShown, LOD_OFF, FLYOVER_MARGIN, strataLift, stratumOf, STRATA_NAMES, STANDIN_MAX,
} from './geometry.js';
import { bucketDrawCount, fansOf, lodOf, minVotesFor } from './decode.js';

/**
 * The density law as the picker applies it: a closure over the view that
 * answers "is thread i drawn?" exactly as the shader's lodShown + its focus
 * override do. A view without a level switches the law off (every thread).
 *
 * The overrides: the tapped thread (focusArc) is always drawn, and so is a
 * chosen GROUP - a thread with a foot in focusRange and its other foot in
 * focusRange2 (a bundle badge's cell and one target chapter). A plain
 * focusRange (a chapter tap) spotlights what is drawn and reveals nothing:
 * lighting a chapter's thousand hidden threads would be the wall again.
 *
 * The stand-ins (view.standIns, standInsFor) are drawn too: the same list the
 * screen hands the shader as uStandIn this frame.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{level?:number, density:import('./decode.js').Density,
 *   focusArc?:number, focusRange?:(number[]|null), focusRange2?:(number[]|null),
 *   standIns?:ArrayLike<number>}} view
 * @returns {(i:number, anchored:(0|1)) => boolean}
 */
export function drawnTest(g, view) {
  const level = typeof view.level === 'number' ? view.level : LOD_OFF;
  if (!(level > LOD_OFF + 1)) return () => true;
  const { lod } = lodOf(g);
  const essential = view.density === 'essential';
  const focusArc = typeof view.focusArc === 'number' ? view.focusArc : -1;
  const standIns = view.standIns && view.standIns.length ? new Set(Array.from(view.standIns)) : null;
  const r1 = view.focusRange && view.focusRange[0] <= view.focusRange[1] ? view.focusRange : null;
  const r2 = r1 && view.focusRange2 && view.focusRange2[0] <= view.focusRange2[1] ? view.focusRange2 : null;
  return (i, anchored) => {
    if (lodShown(lod[i], essential, anchored, level)) return true;
    if (i === focusArc) return true;
    if (standIns && standIns.has(i)) return true;
    if (r2) {
      const a = g.from[i], b = g.to[i];
      const a1 = a >= r1[0] && a <= r1[1], b1 = b >= r1[0] && b <= r1[1];
      const a2 = a >= r2[0] && a <= r2[1], b2 = b >= r2[0] && b <= r2[1];
      return (a1 && b2) || (b1 && a2);
    }
    return false;
  };
}

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

/**
 * Nearest arcs to a screen point, retaining a small candidate set so dense
 * crossings can be disambiguated instead of silently choosing one line.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, ceil:number, squash:number,
 *   localize:number, density:import('./decode.js').Density, level?:number,
 *   focusArc?:number, focusRange?:(number[]|null)}} view
 * @param {number} px
 * @param {number} py
 * @param {number} tol
 * @param {number} [limit]
 * @returns {Array<{ index:number, distance:number, from:number, to:number, votes:number }>}
 */
export function pickArcs(g, cam, view, px, py, tol, limit) {
  const { width, ceil, squash, localize, density } = view;
  const drawn = drawnTest(g, view);
  // The baseline as DRAWN: the camera's y shifts the whole picture down the
  // frame, so the curve the finger meets stands cam.y below the frame's base.
  const base = view.base + (cam.y > 0 ? cam.y : 0);
  const bow = DOME * localize;
  const { fanA, fanB } = fansOf(g);
  const half = width / 2;
  const camX = cam.x, ppv = cam.ppv;
  const cap = Math.max(1, Math.min(limit || 4, 8));
  const best = [];
  const verseAtPoint = xToVerse(cam, width, px);
  const verseTolerance = tol / ppv;

  for (const bucket of g.buckets) {
    const draw = bucketDrawCount(bucket, density);
    const chunks = bucket.chunks || [];
    const chunkSize = g.chunkSize || 256;
    const chunkCount = Math.ceil(draw / chunkSize);
    for (let c = 0; c < chunkCount; c++) {
      const ext = chunks[c];
      if (ext && (ext[1] < verseAtPoint - verseTolerance || ext[0] > verseAtPoint + verseTolerance)) continue;
      const start = bucket.off + c * chunkSize;
      const end = Math.min(start + chunkSize, bucket.off + draw);
      for (let i = start; i < end; i++) {
        const x0 = (g.from[i] - camX) * ppv + half;
        const x1 = (g.to[i] - camX) * ppv + half;
        // Cheap x-range reject before any ellipse maths.
        if (x1 < px - tol || x0 > px + tol) continue;
        // Pickable iff painted. `width` is device px — the shader's uRes.x
        // frame — so this is the fly-over fade the GPU applies, evaluated
        // exactly. Only a full zero is skipped: an arc still showing the
        // partial fly-over floor is dim, but it is there to be tapped.
        const anchored = arcAnchored(x0, x1, width);
        if (flyOverDim(anchored, localize) === 0) continue;
        // ... and the density law drew it at this zoom.
        if (!drawn(i, anchored)) continue;
        // One shape per FOOT: each foot's departure rank sets its quarter; the
        // apex is the same at both. Exactly the two calls the shader makes.
        const rx = (x1 - x0) * 0.5;
        const spanLog = spanLogOf(Math.abs(g.to[i] - g.from[i]), g.total);
        const shapeL = arcShape(rx, ceil, squash, localize, spanLog, fanA[i]);
        const shapeR = arcShape(rx, ceil, squash, localize, spanLog, fanB[i]);
        // the strata lift the whole curve: the baseline it stands on, as drawn
        const lift = strataLift(Math.abs(g.to[i] - g.from[i]), g.total, x0, x1, width, ceil, localize);
        const d = arcDistance(px, py, x0, x1, base - lift, shapeL.R, shapeR.R, shapeL.A, tol, bow);
        if (d >= tol || (best.length === cap && d >= best[best.length - 1].distance)) continue;
        let at = best.length;
        while (at > 0 && best[at - 1].distance > d) at--;
        best.splice(at, 0, {
          index: i, distance: d, from: g.from[i], to: g.to[i], votes: g.votes[i],
        });
        if (best.length > cap) best.pop();
      }
    }
  }
  return best;
}

/**
 * The drawn threads whose span crosses the frame, in draw order: the set a
 * label pass walks (Corbin's brief, 2026-09-11: "when zoomed close, each
 * line shows its source and target beside it"). The same loop as pickArcs
 * without the distance test — the density prefix, the chunk extents and the
 * fly-over law — so a label is written for a line the reader can see and
 * never for one the shader skipped.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, localize:number, density:import('./decode.js').Density,
 *   level?:number, focusArc?:number, focusRange?:(number[]|null)}} view
 * @param {number} limit — at most this many, so a dense screen bounds its own pass
 * @returns {number[]} instance indices
 */
export function visibleArcs(g, cam, view, limit) {
  const { width, localize, density } = view;
  const drawn = drawnTest(g, view);
  const half = width / 2;
  const camX = cam.x, ppv = cam.ppv;
  const lo = xToVerse(cam, width, 0), hi = xToVerse(cam, width, width);
  const out = [];
  for (const bucket of g.buckets) {
    const draw = bucketDrawCount(bucket, density);
    const chunks = bucket.chunks || [];
    const chunkSize = g.chunkSize || 256;
    const chunkCount = Math.ceil(draw / chunkSize);
    for (let c = 0; c < chunkCount; c++) {
      const ext = chunks[c];
      if (ext && (ext[1] < lo || ext[0] > hi)) continue;
      const start = bucket.off + c * chunkSize;
      const end = Math.min(start + chunkSize, bucket.off + draw);
      for (let i = start; i < end; i++) {
        const x0 = (g.from[i] - camX) * ppv + half;
        const x1 = (g.to[i] - camX) * ppv + half;
        if (x1 < 0 || x0 > width) continue;
        const anchored = arcAnchored(x0, x1, width);
        if (flyOverDim(anchored, localize) === 0) continue;
        if (!drawn(i, anchored)) continue;
        out.push(i);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
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
 * draws, with the same per-foot fans, dome and cam.y the picker uses — so
 * the label sits on the ribbon and not beside where a flat arc would be.
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
  const { width, ceil, squash, localize } = view;
  const inset = view.inset > 0 ? view.inset : 0;
  const camY = cam.y > 0 ? cam.y : 0;
  const base = view.base + camY;
  const x0 = (g.from[i] - cam.x) * cam.ppv + width / 2;
  const x1 = (g.to[i] - cam.x) * cam.ppv + width / 2;
  const rx = (x1 - x0) * 0.5;
  const spanLog = spanLogOf(Math.abs(g.to[i] - g.from[i]), g.total);
  const { fanA, fanB } = fansOf(g);
  const shapeL = arcShape(rx, ceil, squash, localize, spanLog, fanA[i]);
  const shapeR = arcShape(rx, ceil, squash, localize, spanLog, fanB[i]);
  const bow = DOME * localize;
  const lift = strataLift(Math.abs(g.to[i] - g.from[i]), g.total, x0, x1, width, ceil, localize);
  const yAt = (x) => base - lift - arcHeightAt(x, x0, x1, shapeL.R, shapeR.R, shapeL.A, bow);
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
  const { width, ceil, squash, localize } = view;
  const inset = (view.inset > 0 ? view.inset : 0) + margin;
  const camY = cam.y > 0 ? cam.y : 0;
  const base = view.base + camY;
  const x0 = (g.from[i] - cam.x) * cam.ppv + width / 2;
  const x1 = (g.to[i] - cam.x) * cam.ppv + width / 2;
  const xa = Math.max(0, x0), xb = Math.min(width, x1);
  if (!(xb > xa)) return null;
  const rx = (x1 - x0) * 0.5;
  const spanLog = spanLogOf(Math.abs(g.to[i] - g.from[i]), g.total);
  const { fanA, fanB } = fansOf(g);
  const shapeL = arcShape(rx, ceil, squash, localize, spanLog, fanA[i]);
  const shapeR = arcShape(rx, ceil, squash, localize, spanLog, fanB[i]);
  const bow = DOME * localize;
  const lift = strataLift(Math.abs(g.to[i] - g.from[i]), g.total, x0, x1, width, ceil, localize);
  const yAt = (x) => base - lift - arcHeightAt(x, x0, x1, shapeL.R, shapeR.R, shapeL.A, bow);
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
 * @param {number} [level] - geometry.levelOf(): count only what the density
 *   law draws at this zoom, so the crowding law sees what the eye sees;
 *   absent = every anchored thread
 * @returns {number}
 */
export function countAnchored(g, cam, width, density, level) {
  let n = 0;
  const half = width / 2, camX = cam.x, ppv = cam.ppv;
  const drawn = drawnTest(g, { level, density });
  for (const bucket of g.buckets) {
    const end = bucket.off + bucketDrawCount(bucket, density);
    for (let i = bucket.off; i < end; i++) {
      const x0 = (g.from[i] - camX) * ppv + half;
      const x1 = (g.to[i] - camX) * ppv + half;
      if (arcAnchored(x0, x1, width) && drawn(i, 1)) n++;
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
  const v = Math.round(xToVerse(cam, width, px));
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
 * First and last verse ids of a chapter, inclusive.
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {number} chapterIndex
 * @returns {[number, number]}
 */
export function chapterRange(g, chapterIndex) {
  const ch = g.chapters[chapterIndex];
  return [ch[2], ch[2] + ch[3] - 1];
}

/**
 * Resolve a short Bible reference against the graph's canonical book table.
 * This deliberately accepts title, abbreviation, or book id and stays local
 * to the already-loaded graph, so Go to never depends on the search bundle.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {string} input
 * @returns {{chapterIndex:number, verse:number, lo:number, hi:number, hasVerse:boolean, label:string}|null}
 */
export function findWebReference(g, input) {
  const m = /^\s*(.+?)\s+(\d+)(?::(\d+))?\s*$/.exec(String(input || ''));
  if (!m) return null;
  const clean = (s) => String(s || '').toLowerCase()
    .replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();
  const wanted = clean(m[1]);
  const bookIndex = g.books.findIndex((book) => [book.id, book.title, book.abbr]
    .some((name) => clean(name) === wanted));
  if (bookIndex < 0) return null;
  const chapterNum = Number(m[2]);
  const chapterIndex = g.chapters.findIndex((ch) => ch[0] === bookIndex && ch[1] === chapterNum);
  if (chapterIndex < 0) return null;
  const [lo, hi] = chapterRange(g, chapterIndex);
  const requestedVerse = m[3] == null ? 1 : Number(m[3]);
  if (m[3] != null && (requestedVerse < 1 || requestedVerse > hi - lo + 1)) return null;
  const verse = lo + requestedVerse - 1;
  return {
    chapterIndex, verse, lo, hi,
    hasVerse: m[3] != null,
    label: g.books[bookIndex].title + ' ' + chapterNum + (m[3] == null ? '' : ':' + (verse - lo + 1)),
  };
}

/**
 * Centre a chapter in the viewport at a given zoom — used by "go to".
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {number} width
 * @param {number} chapterIndex
 * @param {number} [ppv]
 */
export function focusChapter(g, cam, width, chapterIndex, ppv) {
  const [lo, hi] = chapterRange(g, chapterIndex);
  cam.x = (lo + hi) / 2;
  if (ppv) cam.ppv = ppv;
  return cam;
}

/** Screen x of a verse — re-exported so callers need only this module. */
/* ── The density law, part 2: convergence (density-law.md section 2) ──────
 *
 * What the law hides is not gone: at each in-view FOOT CELL the hidden
 * anchored threads are a bundle with a count badge, and each fly-over
 * REPRESENTATIVE stands for its group with a count. These passes produce
 * those numbers for the badge layer, over the same visible chunks and the
 * same drawn test the shader uses, so a badge never counts a drawn line and
 * never misses a hidden one.
 */

/** Narrowest badge cell, CSS px: chapters narrower than this merge into runs. */
export const BUNDLE_MIN_CSS = 34;

/** CSS px per verse from which a badge cell is one VERSE, not a chapter (the tap law's threshold). */
export const BUNDLE_VERSE_PPV_CSS = 26;

/**
 * @typedef {{ lo:number, hi:number, x:number, hidden:number, drawn:number,
 *   chapterLo:number, chapterHi:number, verse:boolean }} FootBundle
 *   lo..hi: the cell's verse range (inclusive); x: its centre, device px;
 *   hidden: anchored threads with a foot here that the law did not draw;
 *   drawn: those it did; chapterLo..chapterHi: the chapters the cell spans;
 *   verse: the cell is a single verse.
 */

/**
 * The badge cells across the frame and what each hides. Cells are verses
 * once a verse is BUNDLE_VERSE_PPV_CSS wide, else chapters, adjacent
 * chapters merged left to right until a cell is BUNDLE_MIN_CSS wide (a
 * badge must be readable and tappable). A thread counts once per cell that
 * holds a foot of it.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, density:import('./decode.js').Density, level?:number,
 *   focusArc?:number, focusRange?:(number[]|null), focusRange2?:(number[]|null)}} view
 * @param {number} dpr
 * @returns {FootBundle[]}
 */
export function footBundles(g, cam, view, dpr) {
  const { width, density } = view;
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
  const drawn = drawnTest(g, view);
  const half = width / 2, camX = cam.x, ppv = cam.ppv;
  const chunkSize = g.chunkSize || 256;
  for (const bucket of g.buckets) {
    const draw = bucketDrawCount(bucket, density);
    const chunks = bucket.chunks || [];
    const chunkCount = Math.ceil(draw / chunkSize);
    for (let c = 0; c < chunkCount; c++) {
      const ext = chunks[c];
      if (ext && (ext[1] < first || ext[0] > first + span - 1)) continue;
      const start = bucket.off + c * chunkSize;
      const end = Math.min(start + chunkSize, bucket.off + draw);
      for (let i = start; i < end; i++) {
        const a = g.from[i], b = g.to[i];
        const ca = a - first >= 0 && a - first < span ? cellOf[a - first] : -1;
        const cb = b - first >= 0 && b - first < span ? cellOf[b - first] : -1;
        if (ca < 0 && cb < 0) continue;
        const x0 = (a - camX) * ppv + half, x1 = (b - camX) * ppv + half;
        const anchored = arcAnchored(x0, x1, width);
        if (!anchored) continue;
        const shown = drawn(i, anchored);
        if (ca >= 0) { if (shown) cells[ca].drawn++; else cells[ca].hidden++; }
        if (cb >= 0 && cb !== ca) { if (shown) cells[cb].drawn++; else cells[cb].hidden++; }
      }
    }
  }
  for (const cell of cells) cell.x = ((cell.lo + cell.hi + 1) / 2 - camX) * ppv + half;
  return cells;
}

/**
 * @typedef {{ key:number, rep:number, count:number, standIn:number }} FlyBundle
 *   rep: the representative's index (-1 when the group's representative does
 *   not cross the frame); count: the group's threads crossing the frame;
 *   standIn: when rep is -1, the strongest crossing member (ties by index),
 *   the line that stands for the group in this frame; else -1.
 */

/**
 * The fly-over groups crossing the frame and their counts, keyed by
 * decode.lodOf's group key. The representative is the one thread of each
 * the shader draws (its badge carries the count).
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, density:import('./decode.js').Density, level?:number}} view
 * @returns {Map<number, FlyBundle>}
 */
export function flyBundles(g, cam, view) {
  const { width, density } = view;
  const { lod, groupOf } = lodOf(g);
  const essential = density === 'essential';
  const half = width / 2, camX = cam.x, ppv = cam.ppv;
  const lo = xToVerse(cam, width, 0), hi = xToVerse(cam, width, width);
  const chunkSize = g.chunkSize || 256;
  /** @type {Map<number, FlyBundle>} */
  const out = new Map();
  for (const bucket of g.buckets) {
    const draw = bucketDrawCount(bucket, density);
    const chunks = bucket.chunks || [];
    const chunkCount = Math.ceil(draw / chunkSize);
    for (let c = 0; c < chunkCount; c++) {
      const ext = chunks[c];
      if (ext && (ext[1] < lo || ext[0] > hi)) continue;
      const start = bucket.off + c * chunkSize;
      const end = Math.min(start + chunkSize, bucket.off + draw);
      for (let i = start; i < end; i++) {
        const x0 = (g.from[i] - camX) * ppv + half;
        const x1 = (g.to[i] - camX) * ppv + half;
        if (x1 < 0 || x0 > width) continue;
        if (arcAnchored(x0, x1, width)) continue;
        const key = groupOf[i];
        let b = out.get(key);
        if (!b) { b = { key, rep: -1, count: 0, standIn: -1 }; out.set(key, b); }
        b.count++;
        if (lodShown(lod[i], essential, 0, 0)) b.rep = i;
        else if (b.standIn < 0 || g.votes[i] > g.votes[b.standIn]) b.standIn = i;
      }
    }
  }
  for (const b of out.values()) if (b.rep >= 0) b.standIn = -1;
  return out;
}

/**
 * The stand-ins this frame: for each group whose representative does not
 * cross the frame, its strongest crossing member - biggest groups first, at
 * most STANDIN_MAX (the shader's uniform array). The screen hands this list
 * to the shader (uStandIn) and to the picker (view.standIns), so the line
 * that carries a badge is a line that is drawn and tappable.
 *
 * @param {Map<number, FlyBundle>} bundles - flyBundles()
 * @returns {number[]}
 */
export function standInsFor(bundles) {
  const out = [];
  for (const b of bundles.values()) if (b.rep < 0 && b.standIn >= 0) out.push(b);
  out.sort((p, q) => q.count - p.count || p.standIn - q.standIn);
  return out.slice(0, STANDIN_MAX).map((b) => b.standIn);
}

/**
 * @typedef {{ k:number, name:string, cross:number, shown:number }} StratumRow
 */

/**
 * The legend's rows: per stratum, how many fly-over threads cross the frame
 * and how many of them are drawn (their groups' representatives).
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, density:import('./decode.js').Density, level?:number}} view
 * @returns {StratumRow[]}
 */
export function strataCounts(g, cam, view) {
  const rows = STRATA_NAMES.map((name, k) => ({ k, name, cross: 0, shown: 0 }));
  // per THREAD, by its own span: the shader lifts each thread by
  // strataLift(|b - a|), and the 48 log span cells straddle every stratum
  // bound, so a group's stratum is not one number (the refuter, 2026-09-21:
  // 115 groups, e.g. Ps 33:11 -> Jer 29:11 drawn in the canon band, counted
  // as testament-scale)
  const { width, density } = view;
  const { lod } = lodOf(g);
  const essential = density === 'essential';
  const half = width / 2, camX = cam.x, ppv = cam.ppv;
  const lo = xToVerse(cam, width, 0), hi = xToVerse(cam, width, width);
  const chunkSize = g.chunkSize || 256;
  const level = typeof view.level === 'number' ? view.level : LOD_OFF;
  for (const bucket of g.buckets) {
    const draw = bucketDrawCount(bucket, density);
    const chunks = bucket.chunks || [];
    const chunkCount = Math.ceil(draw / chunkSize);
    for (let c = 0; c < chunkCount; c++) {
      const ext = chunks[c];
      if (ext && (ext[1] < lo || ext[0] > hi)) continue;
      const start = bucket.off + c * chunkSize;
      const end = Math.min(start + chunkSize, bucket.off + draw);
      for (let i = start; i < end; i++) {
        const x0 = (g.from[i] - camX) * ppv + half;
        const x1 = (g.to[i] - camX) * ppv + half;
        if (x1 < 0 || x0 > width) continue;
        if (arcAnchored(x0, x1, width)) continue;
        const k = stratumOf(Math.abs(g.to[i] - g.from[i]));
        rows[k].cross++;
        if (lodShown(lod[i], essential, 0, level)) rows[k].shown++;
      }
    }
  }
  return rows;
}

/**
 * The members of one thread's fly-over group, strongest first: the list
 * behind a representative's "n more like it".
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {number} index - any member
 * @param {import('./decode.js').Density} density
 * @param {number} [limit]
 * @returns {number[]}
 */
export function groupMembers(g, index, density, limit) {
  const { groupOf } = lodOf(g);
  const key = groupOf[index];
  const min = minVotesFor(density, g.densityTiers);
  const out = [];
  for (let i = 0; i < g.count; i++) if (groupOf[i] === key && g.votes[i] >= min) out.push(i);
  out.sort((a, b) => g.votes[b] - g.votes[a] || a - b);
  return limit ? out.slice(0, limit) : out;
}

/**
 * @typedef {{ chapterIndex:number, lo:number, hi:number, count:number, hidden:number, votes:number }} BundleGroup
 *   one target chapter of a foot cell's threads: how many, how many of them
 *   the law hides here, and the strongest's votes.
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
  const drawn = drawnTest(g, view);
  const half = width / 2, camX = cam.x, ppv = cam.ppv;
  /** @type {Map<number, BundleGroup>} */
  const groups = new Map();
  for (const bucket of g.buckets) {
    const end = bucket.off + bucketDrawCount(bucket, density);
    for (let i = bucket.off; i < end; i++) {
      const a = g.from[i], b = g.to[i];
      const aIn = a >= lo && a <= hi, bIn = b >= lo && b <= hi;
      if (!aIn && !bIn) continue;
      const x0 = (a - camX) * ppv + half, x1 = (b - camX) * ppv + half;
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
      if (!drawn(i, anchored)) grp.hidden++;
    }
  }
  const out = [...groups.values()].sort((p, q) => q.count - p.count || q.votes - p.votes || p.chapterIndex - q.chapterIndex);
  return limit ? out.slice(0, limit) : out;
}

export { verseToX, xToVerse };
