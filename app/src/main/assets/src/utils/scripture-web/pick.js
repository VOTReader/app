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
   shader draws with. There are TWO of them, and geometry.js owns both.
   Height (geometry.arcShape) — or arcs become untappable exactly where
   they look tappable. Visibility (geometry.arcAnchored + flyOverDim) — or
   the reverse: at full localize an arc with neither foot near the viewport
   paints alpha 0, and picking it silently focuses a line nobody can see.
   Visible equals pickable, in both directions.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  arcAnchored, arcDistance, arcShape, arcHeightAt, spanLogOf, flyOverDim, verseToX, xToVerse, DOME,
} from './geometry.js';
import { bucketDrawCount, fansOf } from './decode.js';

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
 *   localize:number, density:import('./decode.js').Density}} view
 * @param {number} px
 * @param {number} py
 * @param {number} tol
 * @param {number} [limit]
 * @returns {Array<{ index:number, distance:number, from:number, to:number, votes:number }>}
 */
export function pickArcs(g, cam, view, px, py, tol, limit) {
  const { width, ceil, squash, localize, density } = view;
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
        if (flyOverDim(arcAnchored(x0, x1, width), localize) === 0) continue;
        // One shape per FOOT: each foot's departure rank sets its quarter; the
        // apex is the same at both. Exactly the two calls the shader makes.
        const rx = (x1 - x0) * 0.5;
        const spanLog = spanLogOf(Math.abs(g.to[i] - g.from[i]), g.total);
        const shapeL = arcShape(rx, ceil, squash, localize, spanLog, fanA[i]);
        const shapeR = arcShape(rx, ceil, squash, localize, spanLog, fanB[i]);
        const d = arcDistance(px, py, x0, x1, base, shapeL.R, shapeR.R, shapeL.A, tol, bow);
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
 * @param {{width:number, localize:number, density:import('./decode.js').Density}} view
 * @param {number} limit — at most this many, so a dense screen bounds its own pass
 * @returns {number[]} instance indices
 */
export function visibleArcs(g, cam, view, limit) {
  const { width, localize, density } = view;
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
        if (flyOverDim(arcAnchored(x0, x1, width), localize) === 0) continue;
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
  const yAt = (x) => base - arcHeightAt(x, x0, x1, shapeL.R, shapeR.R, shapeL.A, bow);
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
  const half = width / 2, camX = cam.x, ppv = cam.ppv;
  for (const bucket of g.buckets) {
    const end = bucket.off + bucketDrawCount(bucket, density);
    for (let i = bucket.off; i < end; i++) {
      const x0 = (g.from[i] - camX) * ppv + half;
      const x1 = (g.to[i] - camX) * ppv + half;
      if (arcAnchored(x0, x1, width)) n++;
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
export { verseToX, xToVerse };
