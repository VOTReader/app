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
 * row order as before; `at` is handed each placed box's left. Given `roomy`
 * (a wider gap), a slide first looks for the nearest place that far clear, so
 * a slid name does not sit hard against its neighbour where its range has
 * room ("LUKE |JOHN| ACTS"), and only then for one a pad clear. A box with no
 * range is placed exactly as before.
 *
 * Given `at` as well, a box with no free place on a row, at its own or a slid
 * place, may make one (w4 readdown: JUDG, MARK and ROM went on a PC's one row
 * where their neighbours had taken the middle of their own books): the row's
 * names move along their own ranges, the box the roomy gap from each where the
 * ranges allow it, else a pad, and every other pair the roomy gap apart staying
 * that far apart. Only a box marked `squeeze` (on a PC, the names r2-01a's row
 * draws) may then close those cells to a pad as well. The box takes the place
 * nearest its own; each name keeps as near where it stood as the room allows.
 * A name without a range holds; one that would move onto a blocked place holds
 * there and the rest try again; with no room left the box goes as before. `at`
 * is how each moved name learns its new left edge, so without it nothing moves.
 *
 * @param {ReadonlyArray<{left:number, right:number, lo?:number, hi?:number, squeeze?:boolean}>} boxes  left to right
 * @param {number} pad
 * @param {number} [rows=2]
 * @param {ReadonlyArray<number>} [rank]  per box, lower first (default all 0)
 * @param {(index: number, row: number, left: number) => boolean} [blocked]  a row the box may not
 *   take there, at that left edge (the corner buttons sit over the right end of the lower row on a phone)
 * @param {number[]} [at]  filled with each placed box's left edge (its own, or where it slid)
 * @param {number} [roomy]  the gap a slide looks for first (default `pad`)
 * @returns {number[]}  row per box, or -1
 */
export function placeRailLabelsRanked(boxes, pad, rows = 2, rank, blocked, at, roomy) {
  const R = Math.max(1, rows | 0);
  /** @type {Array<Array<[number, number]>>} */
  const taken = Array.from({ length: R }, () => []);
  const out = new Array(boxes.length).fill(-1);
  const order = boxes.map((_, i) => i).sort((a, b) => ((rank ? rank[a] || 0 : 0) - (rank ? rank[b] || 0 : 0)) || (a - b));
  /** @param {number} r @param {number} i @param {number} x0 @param {number} w @param {number} [p] */
  const fits = (r, i, x0, w, p = pad) => !(blocked && blocked(i, r, x0)) && taken[r].every(([l, rt]) => x0 >= rt + p || x0 + w + p <= l);
  const gaps = roomy > pad ? [roomy, pad] : [pad];
  const roomGap = roomy > pad ? roomy : pad;
  /** Each row's boxes (their indices), so a repack knows whose places it moves. @type {number[][]} */
  const members = Array.from({ length: R }, () => []);
  /** Each placed box's left edge. @type {number[]} */
  const pos = new Array(boxes.length);
  /** @param {number} r @param {number} i @param {number} x0 @param {number} w */
  const take = (r, i, x0, w) => { taken[r].push([x0, x0 + w]); members[r].push(i); pos[i] = x0; out[i] = r; if (at) at[i] = x0; };
  /** The range a box's left edge may take: its own place when it has none. @param {number} k */
  const rangeOf = (k) => {
    const b = boxes[k];
    return b.lo != null && b.hi != null && b.hi > b.lo ? [Math.min(b.lo, b.left), Math.max(b.hi, b.left)] : [b.left, b.left];
  };
  /** Make room for box i on row r by moving the row's names along their ranges; true when placed.
   * `mine`: the gap the box keeps from its two neighbours; `keep`: every other pair of neighbours
   * already the roomy gap apart stays that far apart (else a pad).
   * @param {number} r @param {number} i @param {number} w @param {number} mine @param {boolean} keep */
  const repack = (r, i, w, mine, keep) => {
    const ks = members[r].concat(i).sort((u, v) => (u === i ? boxes[i].left : pos[u]) - (v === i ? boxes[i].left : pos[v]));
    const n = ks.length, wid = ks.map((k) => boxes[k].right - boxes[k].left), pref = ks.map((k) => (k === i ? boxes[i].left : pos[k]));
    const bound = ks.map((k) => rangeOf(k));
    const me = ks.indexOf(i);
    // gp[j]: the gap between ks[j] and ks[j + 1]
    const gp = ks.slice(1).map((_, j) => (j === me || j + 1 === me ? mine
      : keep && pref[j + 1] - (pref[j] + wid[j]) >= roomGap - 1e-9 ? roomGap : pad));
    for (let pass = 0; pass <= n; pass++) {
      // the leftmost and rightmost places each name can take with every pair its gap apart
      const L = new Array(n), Rt = new Array(n);
      for (let j = 0; j < n; j++) L[j] = Math.max(bound[j][0], j ? L[j - 1] + wid[j - 1] + gp[j - 1] : -Infinity);
      for (let j = n - 1; j >= 0; j--) Rt[j] = Math.min(bound[j][1], j < n - 1 ? Rt[j + 1] - wid[j] - gp[j] : Infinity);
      for (let j = 0; j < n; j++) if (L[j] > Rt[j] + 1e-9) return false;
      // the box nearest its own place, then each side outward, each name nearest where it stood
      const x = new Array(n);
      x[me] = Math.min(Math.max(pref[me], L[me]), Rt[me]);
      for (let j = me - 1; j >= 0; j--) x[j] = Math.min(Math.max(pref[j], L[j]), Math.min(Rt[j], x[j + 1] - wid[j] - gp[j]));
      for (let j = me + 1; j < n; j++) x[j] = Math.min(Math.max(pref[j], Math.max(L[j], x[j - 1] + wid[j - 1] + gp[j - 1])), Rt[j]);
      if (blocked && blocked(i, r, x[me])) return false;
      // a name that would move onto a blocked place holds where it stands, and the rest try again
      const stuck = ks.map((k, j) => (j !== me && x[j] !== pref[j] && blocked && blocked(k, r, x[j]) ? j : -1)).filter((j) => j >= 0);
      if (stuck.length) { for (const j of stuck) bound[j] = [pref[j], pref[j]]; continue; }
      taken[r] = [];
      members[r] = [];
      ks.forEach((k, j) => { if (k !== i) take(r, k, x[j], wid[j]); });
      take(r, i, x[me], w);
      return true;
    }
    return false;
  };
  for (const i of order) {
    const b = boxes[i];
    if (!b || !(b.right > b.left)) continue;
    const w = b.right - b.left;
    let r = 0;
    while (r < R && !fits(r, i, b.left, w)) r++;
    if (r < R) { take(r, i, b.left, w); continue; }
    const ranged = b.lo != null && b.hi != null && b.hi > b.lo;
    const [lo, hi] = rangeOf(i);
    let done = false;
    slide: for (const p of ranged ? gaps : []) {
      for (r = 0; r < R; r++) {
        // beside each name on the row, nearest first: a free place, if any, starts or ends a gap from one
        const tries = [];
        for (const [l, rt] of taken[r]) tries.push(rt + p, l - p - w);
        const ok = tries.filter((x) => x >= lo && x <= hi && fits(r, i, x, w, p)).sort((u, v) => Math.abs(u - b.left) - Math.abs(v - b.left));
        if (ok.length) { take(r, i, ok[0], w); done = true; break slide; }
      }
    }
    if (done || !at) continue;
    // keeping the row's roomy cells roomy first; only a box marked `squeeze` may close them to a pad
    const tries = /** @type {Array<[number, boolean]>} */ (gaps.map((p) => [p, true]));
    if (b.squeeze && roomGap > pad) tries.push([pad, false]);
    repack: for (const [p, keep] of tries) {
      for (r = 0; r < R; r++) if (repack(r, i, w, p, keep)) break repack;
    }
  }
  return out;
}

/**
 * The law for names that may slide (the Volumes rail, w4): a label stands
 * centred over its band on the first row with room for it there; only when no
 * row has, it moves right, over its own band, as far as its bound, to the row
 * that needs the least slide, keeping `pad` from that row's last label. A name
 * that cannot is -1 (draw the tick, not the name). Through w3 the slide looked
 * only at the previous name, whichever row it sat on, so on a phone a slide
 * could leave the next name no room on either row; the first w4 law asked each
 * row in turn but took the first one a slide reached, so on a PC "TIMOTHY HOLY
 * DAYS MTAM" slid off their slots into one string while the second row stood
 * empty (w4 review). With every bound at the label's own centre it is
 * placeRailLabels exactly.
 *
 * @param {ReadonlyArray<{x:number, w:number, max:number}>} items  each label's
 *   centre, width and rightmost centre, left to right (device px)
 * @param {number} pad  the gap two neighbours on one row must keep
 * @param {number} [rows=2]
 * @returns {Array<{row:number, x:number}>}  the row (or -1) and the centre it takes
 */
export function placeRailLabelsSliding(items, pad, rows = 2) {
  const ends = new Array(Math.max(1, rows | 0)).fill(-Infinity);
  return items.map((it) => {
    if (!it || !(it.w > 0)) return { row: -1, x: it ? it.x : 0 };
    const bound = Math.max(it.x, it.max);
    let row = -1, at = Infinity;
    for (let r = 0; r < ends.length; r++) {
      const x = Math.max(it.x, ends[r] + pad + it.w / 2);
      if (x <= bound && x < at) { row = r; at = x; }
    }
    if (row < 0) return { row: -1, x: it.x };
    ends[row] = at + it.w / 2;
    return { row, x: at };
  });
}
