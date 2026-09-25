// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   listen-from — a text selection becomes LISTEN FROM HERE (2026-09-22)
   ═══════════════════════════════════════════════════════════════════════
   The live reading pane's ReadAlongHighlight registers window.__votListenFrom
   ({ has, start }) while its unit has a recording. This is the selection
   toolbar's side of it: the block the selection STARTS in (its data-hl-key)
   and the offset of that start inside the block's textContent — the domain
   the timing rows and the paint both use — so the voice begins at the clause
   the reader chose. Nothing here knows about audio; the pane decides.
   ═══════════════════════════════════════════════════════════════════════ */

/** @returns {{ has: (hlKey: string) => boolean, start: (hlKey: string, offset: number | null) => boolean, repeat?: (keys: string[], label: string, times: number) => boolean } | null} */
function pane() {
  const lf = typeof window !== 'undefined' ? /** @type {any} */ (window).__votListenFrom : null;
  return lf && typeof lf.has === 'function' && typeof lf.start === 'function' ? lf : null;
}

/**
 * Where "listen from here" would start for this selection, or null when there
 * is nothing to offer (no pane with a recording, or the selection does not
 * start in one of its timed blocks).
 *
 * @param {Selection | null | undefined} selection
 * @returns {{ hlKey: string, offset: number | null } | null}
 */
export function listenFromTarget(selection) {
  const lf = pane();
  if (!lf || !selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const host = node && (node.nodeType === 3 ? node.parentElement : /** @type {Element} */ (node));
  const block = host && typeof host.closest === 'function' ? host.closest('[data-hl-key]') : null;
  const hlKey = block ? block.getAttribute('data-hl-key') : null;
  if (!block || !hlKey || !lf.has(hlKey)) return null;
  let offset = null;
  try {
    const upTo = block.ownerDocument.createRange();
    upTo.setStart(block, 0);
    upTo.setEnd(range.startContainer, range.startOffset);
    offset = upTo.toString().length;
  } catch (_e) { /* a boundary outside the block: the pane falls back to the block's first clause */ }
  return { hlKey, offset };
}

/**
 * Act on a target listenFromTarget gave: the pane starts (or seeks) the unit
 * at the chosen clause. The toolbar keeps the target it offered, so the tap
 * does not depend on the selection surviving the press.
 *
 * @param {{ hlKey: string, offset: number | null } | null | undefined} target
 * @returns {boolean} false when there was nothing to start
 */
export function startListenFrom(target) {
  const lf = pane();
  return !!(target && lf && lf.start(target.hlKey, target.offset));
}

/* REPEAT THIS PASSAGE (rp1 part 3, 2026-09-25): the selected blocks, looped three times by the pane
   (window.__votListenFrom.repeat). A pane with no repeat (the APK's native player) offers no button. */

/** How many times REPEAT plays the passage. */
export const REPEAT_TIMES = 3;

/**
 * The blocks of a selection the pane can repeat, in reading order, or null.
 *
 * @param {string[] | null | undefined} hlKeys - the data-hl-keys the selection covers, in order
 * @returns {{ keys: string[] } | null}
 */
export function repeatTarget(hlKeys) {
  const lf = pane();
  if (!lf || typeof lf.repeat !== 'function' || !Array.isArray(hlKeys)) return null;
  const keys = hlKeys.filter((k) => !!k && lf.has(k));
  return keys.length ? { keys } : null;
}

/**
 * Act on a target repeatTarget gave: the pane loops those blocks REPEAT_TIMES times under `label`.
 *
 * @param {{ keys: string[] } | null | undefined} target
 * @param {string} label - the passage's reference, for the bar ("Psalm 23:1–3")
 * @returns {boolean} false when there was nothing to repeat
 */
export function startRepeat(target, label) {
  const lf = /** @type {any} */ (pane());
  return !!(target && lf && typeof lf.repeat === 'function' && lf.repeat(target.keys, label, REPEAT_TIMES));
}

/**
 * Act on a selection: listenFromTarget, then startListenFrom.
 *
 * @param {Selection | null | undefined} selection
 * @returns {boolean} false when there was nothing to start
 */
export function listenFromSelection(selection) {
  return startListenFrom(listenFromTarget(selection));
}
