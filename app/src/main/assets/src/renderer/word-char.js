/* What counts as part of a word when a mark snaps, a note icon slides, or a mark re-anchors (audit 2026-11-23
   heart-1 + i18n-text-n1). Letters in any script with their combining marks ("amó", "él", "Ænon", Hebrew with
   niqqud), decimal digits, both apostrophes, underscore and the hyphen (so "self-control" stays whole). ASCII \w
   trimmed the accents off 6.6% of RVR words. \p{Nd}, not \p{N}: \p{N} would pull superscript verse numbers
   ("¹⁶For") into marks. */
const WORD_RX = /[\p{L}\p{M}\p{Nd}’'_-]/u;
var LETTER_OR_DIGIT_RX = /[\p{L}\p{M}\p{Nd}]/u;

/** @param {string | undefined | null} c one character @returns {boolean} */
export function isWordChar(c) { return !!c && WORD_RX.test(c); }

/** A letter (any script, with its marks) or a decimal digit: the neighbour test for re-anchoring.
 * @param {string | undefined | null} c @returns {boolean} */
export function isLetterOrDigit(c) { return !!c && LETTER_OR_DIGIT_RX.test(c); }
