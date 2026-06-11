/* ═══════════════════════════════════════════════════════════════════════
   excerpt-display — pure helper (inlined into bundle-b + bundle-d graphs)
   ═══════════════════════════════════════════════════════════════════════
   Display-normalization for STORED user-captured excerpt text (note
   anchors / fullText, annotation segment text, journal note-card
   anchors). Poetry blocks render each line in its own <div>; before the
   TreeWalker capture fix (8469f3b), a selection spanning a line break
   was stored with the lines collapsed together — "gird up your
   loins,And become the man…". Those records persist in user data, so
   every surface that RENDERS stored excerpt text routes through this
   helper: it re-inserts the missing space after sentence punctuation
   that is immediately followed by an uppercase letter (the collapsed-
   line signature). New captures store real whitespace, so this is a
   no-op for them. Same transform NoteRow shipped inline (now folded
   here); the punctuation set deliberately EXCLUDES `.` so dotted
   abbreviations ("U.S.") are never split.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function normalizeExcerptDisplay(text) {
  return (text || '').replace(/([,;:!?])([A-Z])/g, '$1 $2');
}
