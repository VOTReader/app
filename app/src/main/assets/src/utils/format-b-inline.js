/* ═══════════════════════════════════════════════════════════════════════
   format-b-inline — Format B (WTLB / The Blessed / Holy Days) inline markup
   ═══════════════════════════════════════════════════════════════════════
   Splits a paragraph's `text` into the alternating plain-text / markup
   segments that WtlbEntryView.renderLine classifies (**bold**, _italic_,
   {{ref:…}}, {{nav:…}}, [From "…" ~ Volume N]).

   The emphasis patterns use `[\s\S]*?` (NOT `.*?`) on purpose: a `_italic_`
   or `**bold**` span may wrap a whole poetic stanza, so its closing marker
   can sit AFTER one or more soft line breaks (`\n`). `.` excludes `\n`, so
   the old per-line parse left those spans' literal underscores on screen
   (the "_Blessed … marriage, \n Who keep My Commandments…_" bug). Matching
   across newlines — and parsing the paragraph whole rather than line-by-line
   — fixes it. The quantifier stays LAZY so adjacent per-line spans
   (`_a_\n\n_b_`) still pair correctly. Every Format B paragraph carries a
   balanced count of `_` and `**` (enforced by the corpus), so lazy whole-
   paragraph matching never swallows an unintended run. */

/** Source of the inline-markup splitter. Build a fresh RegExp per call so the
    `g` flag's lastIndex can never leak between callers. */
export const FORMAT_B_INLINE_SOURCE =
  '(\\*\\*[\\s\\S]*?\\*\\*|_[\\s\\S]*?_|\\{\\{ref:[^}]+\\}\\}|\\{\\{nav:[^}]+\\}\\}|\\[From [^\\]]+\\])';

/**
 * Split a Format B line/paragraph into alternating text + markup segments.
 * Capturing-group split, so the matched markers are KEPT in the output (the
 * renderer classifies them). Empty strings are preserved so the caller's keys
 * stay stable; the renderer skips them.
 * @param {string} text
 * @returns {string[]}
 */
export function splitFormatBInline(text) {
  if (typeof text !== 'string' || text === '') return text === '' ? [''] : [];
  return text.split(new RegExp(FORMAT_B_INLINE_SOURCE, 'g'));
}
