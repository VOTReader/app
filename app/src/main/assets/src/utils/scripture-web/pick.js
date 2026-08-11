/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/pick — Cluster F (esbuild bundle-f.js)

   "Tap any point on any line, whether at the peak of the curve or the
   beginning or ending" — this is that.

   No GPU readback, no ID buffer, no spatial index. Every arc is an analytic
   half-ellipse, so the distance from the finger to each curve is a closed
   form (geometry.arcDistance), and a bounding-box reject kills the vast
   majority before the maths runs. Measured ~2 ms across all 301,539 arcs on
   desktop, and the visible set is always far smaller than that because the
   density prefix and the bucket loop bound it.

   The one invariant that matters: this must use the SAME height law the
   vertex shader draws with, or arcs become untappable exactly where they
   look tappable. Both call geometry.arcRadiusY.
   ═══════════════════════════════════════════════════════════════════════ */

import { arcDistance, arcRadiusY, verseToX, xToVerse } from './geometry.js';
import { bucketDrawCount } from './decode.js';

/**
 * Nearest arc to a screen point.
 *
 * @param {object} g — decoded graph (decode.js)
 * @param {object} cam — camera (geometry.js)
 * @param {object} view — { width, height, base, ceil, squash, localize, density }
 * @param {number} px @param {number} py — device px, y down
 * @param {number} tol — hit tolerance, device px
 * @returns {{ index:number, distance:number, from:number, to:number, votes:number }|null}
 */
export function pickArc(g, cam, view, px, py, tol) {
  const { width, base, ceil, squash, localize, density } = view;
  const half = width / 2;
  const camX = cam.x, ppv = cam.ppv;
  let best = -1;
  let bestD = tol;

  for (const bucket of g.buckets) {
    const draw = bucketDrawCount(bucket, density);
    const end = bucket.off + draw;
    for (let i = bucket.off; i < end; i++) {
      const x0 = (g.from[i] - camX) * ppv + half;
      const x1 = (g.to[i] - camX) * ppv + half;
      // Cheap x-range reject before any ellipse maths.
      if (x1 < px - tol || x0 > px + tol) continue;
      const ry = arcRadiusY((x1 - x0) * 0.5, ceil, squash, localize);
      const d = arcDistance(px, py, x0, x1, base, ry, tol);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  if (best < 0) return null;
  return { index: best, distance: bestD, from: g.from[best], to: g.to[best], votes: g.votes[best] };
}

/**
 * Every arc touching a verse range — the focus set behind "show me this
 * chapter's whole web". Returns indices in draw order.
 *
 * @param {object} g @param {number} lo @param {number} hi — inclusive verse ids
 * @param {'essential'|'classic'|'complete'} density
 * @param {number} [limit] — stop after this many (0/undefined = no cap)
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

/** How many arcs touch a verse range (cheaper than materializing them). */
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

/** First and last verse ids of a chapter, inclusive. */
export function chapterRange(g, chapterIndex) {
  const ch = g.chapters[chapterIndex];
  return [ch[2], ch[2] + ch[3] - 1];
}

/** Centre a chapter in the viewport at a given zoom — used by "go to". */
export function focusChapter(g, cam, width, chapterIndex, ppv) {
  const [lo, hi] = chapterRange(g, chapterIndex);
  cam.x = (lo + hi) / 2;
  if (ppv) cam.ppv = ppv;
  return cam;
}

/** Screen x of a verse — re-exported so callers need only this module. */
export { verseToX, xToVerse };
