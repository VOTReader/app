/* rail-labels — where a rail's names may be printed without printing over each other.
   ─────────────────────────────────────────────────────────────────────────────────
   Global-scope module (bundle-f). ONE rule for both rails. The scripture rail
   (drawRuler, ScriptureWebScreen.jsx) always had it inline: two rows, prefer the
   top, fall to the second, and a book that fits on neither goes unlabelled
   rather than overprinting. The Volumes rail (drawPersonalWeb, rail-renderer.js)
   had an ALTERNATION instead — a name up to twice its band flipped rows — which
   tracked nothing about where the previous name on that row ended, so the short
   collections at the right end (TIMOTHY, HOLY DAYS, MTAM, LAMB, FLOCK) printed
   over one another at 1920 and at the phone's landscape width (Design & Perf's
   captures, 2026-09-11). Two definitions that must agree is the root; this is
   the one that stays.

   Pure: takes measured boxes, hands back rows. The caller keeps every tick
   whether or not the name was placed — a skipped label is the rule working,
   and the band is still marked. */

/**
 * Place labels on up to `rows` rows without overlap, in the order given (the
 * caller sorts by x). A label takes the first row whose last occupant ends at
 * least `pad` before the label's left edge; a label that fits on no row is
 * returned as -1 (draw the tick, not the name).
 *
 * @param {ReadonlyArray<{left:number, right:number}>} boxes  label extents in
 *   draw units (device px), left to right
 * @param {number} pad  the gap two neighbours on one row must keep
 * @param {number} [rows=2]
 * @returns {number[]}  row per box: 0..rows-1, or -1 when it does not fit
 */
export function placeRailLabels(boxes, pad, rows = 2) {
  const rowEnd = new Array(Math.max(1, rows | 0)).fill(-Infinity);
  const out = new Array(boxes.length).fill(-1);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b || !(b.right > b.left)) continue;
    for (let r = 0; r < rowEnd.length; r++) {
      if (b.left >= rowEnd[r] + pad) { rowEnd[r] = b.right; out[i] = r; break; }
    }
  }
  return out;
}
