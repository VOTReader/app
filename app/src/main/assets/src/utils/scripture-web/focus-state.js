/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/focus-state — what is chosen, hovered and lit. Cluster F (bundle-d)
   ═══════════════════════════════════════════════════════════════════════

   The focus is the per-frame state every stream shares (CONTRACTS.md §2):
   use-web-camera.js holds it in focusRef, use-web-selection.js writes it,
   web-frame.js webViewArgs hands it to the GL renderer each frame, and the
   overlay reads the same split values. One shape, built here, so a writer
   that sets one field can never drop the others:

     arc       the chosen thread, -1 for none. With prophecy false it indexes
               the OpenBible arcs (g.from / g.to / g.votes, 0..g.count-1); on
               My Web it is the chosen link's index (the rail renderer's).
               With prophecy true it indexes g.prophecy (0..length-1): 107 of
               the asset's 132 prophecy pairs are not OpenBible arcs, so the
               class is its own list, not a flag on an arc.
     prophecy  which list `arc` indexes (above).
     range     a verse range kept lit, [lo, hi] inclusive verse ids, or null
               (a chapter, a bundle, a verse: today's focusRange).
     range2    the group chosen inside a range (chooseGroup), or null.
     hover     the thread under a resting pointer, -1 for none. Hover dims
               nothing (C3). Written IN PLACE (the hover rAF, dropHover): it
               changes per pointer move.
     hoverProphecy  the prophecy pair under a resting pointer when no
               OpenBible arc is (hover -1): its index in g.prophecy, or -1.
               107 of the asset's pairs are no arc, so `hover` cannot name
               them (GL review 2026-10-18). Written in place with `hover`.
     lit       Int32Array of OpenBible arc ids drawn in the lit ink in the
               top pass (go-to, verse mode, a chooser row under hover or
               focus), or null. Never mutate it: replace it with withLit().
     litKey    a content key of `lit` ('' for none), so the renderer uploads
               a new id set only when the key changes.

   Every other field's write replaces focusRef.current with focusState(...) or
   withLit(...). */

/**
 * @typedef {{ arc: number, prophecy: boolean, range: [number, number] | null,
 *   range2: [number, number] | null, hover: number, hoverProphecy: number, lit: Int32Array | null,
 *   litKey: string }} Focus
 */

/**
 * A whole focus: the defaults (nothing chosen, hovered or lit) with `patch` over them.
 * @param {Partial<Omit<Focus, 'lit'>> & { lit?: ArrayLike<number> | null }} [patch]  `lit` may be any
 *   array of arc ids (it is copied into an Int32Array); `litKey` is always recomputed from it
 * @returns {Focus}
 */
export function focusState(patch) {
  /** @type {Focus} */
  const f = { arc: -1, prophecy: false, range: null, range2: null, hover: -1, hoverProphecy: -1, lit: null, litKey: '' };
  if (patch) Object.assign(f, patch);
  if (f.arc == null) f.arc = -1;
  if (f.hover == null) f.hover = -1;
  if (f.hoverProphecy == null) f.hoverProphecy = -1;
  if (!f.range2) f.range2 = null;
  if (!f.range) f.range = null;
  f.prophecy = !!f.prophecy;
  // the key always follows the set, so no writer can hand the renderer a stale one
  const ids = f.lit;
  f.lit = ids && ids.length ? (ids instanceof Int32Array ? ids : Int32Array.from(ids)) : null;
  f.litKey = litKeyOf(f.lit);
  return f;
}

/**
 * The content key of a lit set: its length and an FNV-1a hash of its ids, so two sets with the
 * same ids in the same order share a key and the renderer skips the upload.
 * @param {ArrayLike<number> | null | undefined} ids
 * @returns {string}  '' for none
 */
export function litKeyOf(ids) {
  if (!ids || !ids.length) return '';
  let h = 0x811c9dc5;
  for (let i = 0; i < ids.length; i++) {
    let v = ids[i] | 0;
    for (let k = 0; k < 4; k++) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); v >>>= 8; }
  }
  return ids.length + ':' + (h >>> 0).toString(36);
}

/**
 * The same focus with a new lit set (null or empty clears it). A copy, never a mutation.
 * @param {Focus} focus
 * @param {ArrayLike<number> | null | undefined} ids  OpenBible arc ids
 * @returns {Focus}
 */
export function withLit(focus, ids) {
  return focusState(Object.assign({}, focus, { lit: ids || null }));
}

const PROPHECY_INDEX = new WeakMap();
/**
 * The index in g.prophecy of the pair joining verses a and b (either order), or -1. Built once
 * per graph. The panel's "Prophecy fulfilled" and the GL's prophecy class both ask this.
 * @param {{ prophecy?: Array<{ a: number, b: number }> }} g
 * @param {number} a @param {number} b  verse ids
 */
export function prophecyIndexOf(g, a, b) {
  if (!g || !g.prophecy || !g.prophecy.length) return -1;
  let map = PROPHECY_INDEX.get(g);
  if (!map) {
    map = new Map();
    g.prophecy.forEach((p, k) => {
      const key = p.a < p.b ? p.a + ':' + p.b : p.b + ':' + p.a;
      if (!map.has(key)) map.set(key, k);
    });
    PROPHECY_INDEX.set(g, map);
  }
  const k = map.get(a < b ? a + ':' + b : b + ':' + a);
  return k === undefined ? -1 : k;
}

/**
 * The chosen thread's two verse ids, whichever list it is in, or null when nothing is chosen
 * (or the index is out of its list). Canon web only: a My Web link's ends are the rail's.
 * @param {any} g  the decoded graph
 * @param {Focus} focus
 * @returns {{ from: number, to: number } | null}
 */
export function chosenEnds(g, focus) {
  if (!g || !focus || !(focus.arc >= 0)) return null;
  if (focus.prophecy) {
    const p = g.prophecy && g.prophecy[focus.arc];
    return p ? { from: p.a, to: p.b } : null;
  }
  if (!(focus.arc < g.count)) return null;
  return { from: g.from[focus.arc], to: g.to[focus.arc] };
}
