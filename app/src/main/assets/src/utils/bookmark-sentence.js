// @ts-check
/* bookmark-sentence — a bookmark made on a word or two is labelled with the sentence around it (ideas audit A06.9):
   "Christmas" alone told the Bookmarks list nothing about where it was. */

/** Under this many words, a selection is too short to name a bookmark. */
export const SHORT_LABEL_WORDS = 4;

/**
 * The sentence holding [start, end) in `text`: from after the last . ! ? (or a line break) before it to the next
 * one after it, trimmed. Returns the range unchanged when the text has no sentence break around it.
 * @param {string} text @param {number} start @param {number} end
 * @returns {{ start: number, end: number }}
 */
export function sentenceAround(text, start, end) {
  const s = String(text || '');
  let a = Math.max(0, Math.min(start, s.length));
  let b = Math.max(a, Math.min(end, s.length));
  while (a > 0 && !/[.!?\n]/.test(s[a - 1])) a--;
  while (b < s.length && !/[.!?\n]/.test(s[b])) b++;
  if (b < s.length && /[.!?]/.test(s[b])) b++;
  while (a < b && /\s/.test(s[a])) a++;
  while (b > a && /\s/.test(s[b - 1])) b--;
  return { start: a, end: b };
}

/** @param {string} label @returns {boolean} */
export function isShortLabel(label) {
  return String(label || '').trim().split(/\s+/).filter(Boolean).length < SHORT_LABEL_WORDS;
}
