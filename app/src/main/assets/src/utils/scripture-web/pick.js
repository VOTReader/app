/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/pick — Cluster F (esbuild bundle-f.js)

   "Tap any point on any line, whether at the peak of the curve or the
   beginning or ending" — this is that.

   No GPU readback, no ID buffer. Every arc is an analytic half-ellipse, so
   the distance from the finger to each curve is a closed form
   (geometry.arcDistance), and the index (index.js) hands over only the
   threads with a piece inside the finger's tolerance box — the same
   predicate the renderer gathers with, so what is drawn is what is
   tappable, and nothing far from the finger is examined.

   The one invariant that matters: this must use the SAME law the vertex
   shader draws with, and geometry.js owns it: threadShape, the true world
   (a thread's height is its span, at every zoom) — or arcs become
   untappable exactly where they look tappable. The camera has a y: the
   frame's baseline row sits camY verses above the world's, so the hit test
   measures against the world baseline (view.base + camY·ppv·squash).
   There is no fly-over law any more: every thread with a piece inside the
   frame is drawn at full dim, so visible equals pickable by construction.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  arcDistance, threadShape, verseToX, xToVerse,
} from './geometry.js';
import { bucketDrawCount } from './decode.js';
import { indexOf, walkVisible } from './index.js';

/**
 * Nearest arc to a screen point.
 *
 * @param {import('./decode.js').ScriptureGraph} g
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, ceil:number, squash:number,
 *   camY?:number, density:import('./decode.js').Density,
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
 * @param {{x:number, ppv:number, total:number}} cam
 * @param {{width:number, base:number, ceil:number, squash:number,
 *   camY?:number, density:import('./decode.js').Density}} view
 * @param {number} px
 * @param {number} py
 * @param {number} tol
 * @param {number} [limit]
 * @returns {Array<{ index:number, distance:number, from:number, to:number, votes:number }>}
 */
export function pickArcs(g, cam, view, px, py, tol, limit) {
  const { width, base, squash, density } = view;
  const half = width / 2;
  const camX = cam.x, ppv = cam.ppv;
  // The world baseline, device px: below the frame's baseline row by the
  // camera's height — the same `uBase - (hgt - hOff)` the shader positions with.
  const worldBase = base + (view.camY || 0) * ppv * squash;
  const cap = Math.max(1, Math.min(limit || 4, 8));
  const best = [];
  // The finger's tolerance box as a rectangle of the world, verse units: a
  // curve point within tol px of the finger lies inside it, so the index's
  // walk hands over every thread that can be hit and none that cannot.
  const rise = ppv * squash;                          // device px per verse of height
  const hv = (worldBase - py) / rise;                 // the finger's height above the world baseline
  const dv = tol / rise;
  const rect = {
    xa: xToVerse(cam, width, px - tol), xb: xToVerse(cam, width, px + tol),
    y0: hv - dv > 0 ? hv - dv : 0, y1: hv + dv,
  };
  if (rect.y1 < 0) return best;                       // more than tol below the baseline: nothing to hit
  walkVisible(g, indexOf(g), rect, density, (i) => {
    const x0 = (g.from[i] - camX) * ppv + half;
    const x1 = (g.to[i] - camX) * ppv + half;
    const shape = threadShape((x1 - x0) * 0.5, squash);
    const d = arcDistance(px, py, x0, x1, worldBase, shape.R, shape.A, tol);
    if (d >= tol || (best.length === cap && d >= best[best.length - 1].distance)) return;
    let at = best.length;
    while (at > 0 && best[at - 1].distance > d) at--;
    best.splice(at, 0, {
      index: i, distance: d, from: g.from[i], to: g.to[i], votes: g.votes[i],
    });
    if (best.length > cap) best.pop();
  });
  return best;
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
