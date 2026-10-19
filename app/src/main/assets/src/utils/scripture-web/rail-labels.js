/* rail-labels — where a rail's names may be printed without printing over each other.
   ─────────────────────────────────────────────────────────────────────────────────
   Global-scope module (bundle-d since lz1). ONE rule for both rails. The scripture rail
   (drawRuler, now in ui/scripture-web/overlay-renderer.js) always had it inline: two rows, prefer the
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

/**
 * The same law with a rank (w3, the canvas stream): the major books (GEN,
 * PSALMS, ISAIAH, MATT, JOHN, REV) are placed before their neighbours, so a
 * crowd at the right end gives way to REV and not the other way round. A
 * label takes the first row where it keeps `pad` from every label already on
 * that row; -1 when no row has room. With one rank for every box this is
 * placeRailLabels exactly: boxes in x order meet only the last on a row.
 *
 * A box may carry the range its left edge may slide over (`lo`..`hi`: the
 * canon's names, along their own books, w4 review 2): where it meets a
 * neighbour on every row at its own place, it takes the nearest place in
 * that range a pad clear of every name on the row (beside one of them), the
 * row order as before; `at` is handed each placed box's left. A box with no
 * range is placed exactly as before.
 *
 * @param {ReadonlyArray<{left:number, right:number, lo?:number, hi?:number}>} boxes  left to right
 * @param {number} pad
 * @param {number} [rows=2]
 * @param {ReadonlyArray<number>} [rank]  per box, lower first (default all 0)
 * @param {(index: number, row: number, left: number) => boolean} [blocked]  a row the box may not
 *   take there, at that left edge (the corner buttons sit over the right end of the lower row on a phone)
 * @param {number[]} [at]  filled with each placed box's left edge (its own, or where it slid)
 * @returns {number[]}  row per box, or -1
 */
export function placeRailLabelsRanked(boxes, pad, rows = 2, rank, blocked, at) {
  const R = Math.max(1, rows | 0);
  /** @type {Array<Array<[number, number]>>} */
  const taken = Array.from({ length: R }, () => []);
  const out = new Array(boxes.length).fill(-1);
  const order = boxes.map((_, i) => i).sort((a, b) => ((rank ? rank[a] || 0 : 0) - (rank ? rank[b] || 0 : 0)) || (a - b));
  /** @param {number} r @param {number} i @param {number} x0 @param {number} w */
  const fits = (r, i, x0, w) => !(blocked && blocked(i, r, x0)) && taken[r].every(([l, rt]) => x0 >= rt + pad || x0 + w + pad <= l);
  /** @param {number} r @param {number} i @param {number} x0 @param {number} w */
  const take = (r, i, x0, w) => { taken[r].push([x0, x0 + w]); out[i] = r; if (at) at[i] = x0; };
  for (const i of order) {
    const b = boxes[i];
    if (!b || !(b.right > b.left)) continue;
    const w = b.right - b.left;
    let r = 0;
    while (r < R && !fits(r, i, b.left, w)) r++;
    if (r < R) { take(r, i, b.left, w); continue; }
    if (!(b.lo != null && b.hi != null && b.hi > b.lo)) continue;
    const lo = Math.min(b.lo, b.left), hi = Math.max(b.hi, b.left);
    for (r = 0; r < R; r++) {
      // beside each name on the row, nearest first: a free place, if any, starts or ends a pad from one
      const tries = [];
      for (const [l, rt] of taken[r]) tries.push(rt + pad, l - pad - w);
      const ok = tries.filter((x) => x >= lo && x <= hi && fits(r, i, x, w)).sort((p, q) => Math.abs(p - b.left) - Math.abs(q - b.left));
      if (ok.length) { take(r, i, ok[0], w); break; }
    }
  }
  return out;
}
