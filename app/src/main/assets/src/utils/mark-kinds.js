/* ═══════════════════════════════════════════════════════════════════════
   utils/mark-kinds.js — which annotations are MARKS (v05-04)
   ═══════════════════════════════════════════════════════════════════════
   A mark is a highlight, an underline or a squiggle: the three styles the
   selection toolbar paints (SelectionToolbar, AnnotationActionChip, NoteSheet).
   A note is an annotation too, but it is counted as a note. Squiggle shipped as
   the third style (6705374f) and every tally of marks kept testing
   highlight | underline, so a plain squiggle never reached Highlights &
   Underlines, the Library's count or My Progress: the reader
   could find it only in the text. One predicate now. Pure, with no state, so
   each bundle that imports it may carry its own copy.
   ═══════════════════════════════════════════════════════════════════════ */

/** The annotation kinds that are marks, in the toolbar's order. */
export const MARK_KINDS = ['highlight', 'underline', 'squiggle'];

/**
 * @param {any} kind
 * @returns {boolean}
 */
export function isMarkKind(kind) {
  return MARK_KINDS.includes(kind);
}

/**
 * A stored annotation that counts as a mark. A note made with "No color (icon
 * only)" (color 'blank') marks no text: it is a note, not a mark (A06.4).
 * @param {any} a
 * @returns {boolean}
 */
export function isCountedMark(a) {
  return !!a && isMarkKind(a.kind) && a.color !== 'blank';
}

/**
 * How many marks AnnotationStore.all() holds: one per groupId (a mark spanning
 * several keys is one mark), blank-colour notes left out (n363 / n236). The
 * one walk behind the Library's and My Progress's highlight counts.
 * @param {Record<string, any[]> | null | undefined} data
 * @returns {number}
 */
export function countMarks(data) {
  if (!data) return 0;
  /** @type {Record<string, 1>} */
  const seen = {};
  Object.keys(data).forEach((k) => (data[k] || []).forEach((a) => {
    if (isCountedMark(a)) seen[a.groupId || a.id] = 1;
  }));
  return Object.keys(seen).length;
}
