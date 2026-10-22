/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/chunk-walk — Cluster F (bundle-d)

   The one walk over a bucket's drawn threads. The renderer (web-renderer
   draw), the picker (pick.pickArcs), the label pass (pick.visibleArcs) and
   the convergence counts (pick.footBundles) all read the same instances in
   the same order: a bucket's density prefix (decode.bucketDrawCount), cut
   into chunks of `chunkSize` threads whose verse extents ([lo, hi] of every
   foot in the chunk) the generator wrote, with every chunk whose extent
   misses the window skipped. There were four copies of this loop; a fifth
   reader, or a change to how chunks cull, now has one place to go.

   A chunk with no extent (a bucket without chunks, or one shorter than its
   count) is always visible, and a bucket without chunks is one run of its
   whole prefix: the renderer drew it in one call, and the picker walked it
   chunk by chunk to the same instances.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Every maximal run of consecutive visible chunks in a bucket's drawn
 * prefix, in draw order, as absolute instance indices [start, end).
 * `visit` may return true to stop the walk; the walk then returns true.
 *
 * @param {{off:number, chunks?:Array<[number, number]>}} bucket
 * @param {number} draw — the bucket's drawn prefix (decode.bucketDrawCount)
 * @param {number} chunkSize
 * @param {number} lo — the window's first verse (a chunk ending before it is skipped)
 * @param {number} hi — the window's last verse (a chunk starting after it is skipped)
 * @param {(start:number, end:number) => (boolean|void)} visit
 * @returns {boolean} true when visit stopped the walk
 */
export function walkDrawnRuns(bucket, draw, chunkSize, lo, hi, visit) {
  if (!(draw > 0)) return false;
  const off = bucket.off;
  const chunks = bucket.chunks || [];
  if (!chunks.length) return visit(off, off + draw) === true;
  let runStart = -1;
  for (let c = 0; c * chunkSize < draw; c++) {
    const ext = chunks[c];
    const start = c * chunkSize;
    // A thread is visible if its span overlaps the window at all: the apex
    // of a long arc can cross the frame with both feet off it.
    if (!ext || (ext[1] >= lo && ext[0] <= hi)) {
      if (runStart < 0) runStart = start;
    } else if (runStart >= 0) {
      if (visit(off + runStart, off + start) === true) return true;
      runStart = -1;
    }
  }
  if (runStart >= 0) return visit(off + runStart, off + draw) === true;
  return false;
}
