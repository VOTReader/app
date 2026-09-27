/* ═══════════════════════════════════════════════════════════════════════
   utils/mark-kinds.js — which annotations are MARKS (v05-04)
   ═══════════════════════════════════════════════════════════════════════
   A mark is a highlight, an underline or a squiggle: the three styles the
   selection toolbar paints (SelectionToolbar, AnnotationActionChip, NoteSheet).
   A note is an annotation too, but it is counted as a note. Squiggle shipped as
   the third style (6705374f) and every tally of marks kept testing
   highlight | underline, so a plain squiggle never reached Highlights &
   Underlines, the Library's count, My Progress or the achievements: the reader
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
  return kind === 'highlight' || kind === 'underline' || kind === 'squiggle';
}
