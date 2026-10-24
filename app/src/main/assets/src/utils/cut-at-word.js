/* ═══════════════════════════════════════════════════════════════════════
   cutAtWord — a preview's head, cut between words (s01.9, s14.6)
   ═══════════════════════════════════════════════════════════════════════
   The journal, note and footnote previews cut at a fixed character count and so mid-word ("…the beginni…").
   This cuts at the last space at or before `max` instead, as long as that keeps most of the length (a single
   80-letter run, a URL, has no space to go back to, so it keeps the hard cut), and never between the two halves
   of an emoji. Trailing spaces and a dangling comma, colon, semicolon or dash go; the caller adds the ellipsis.
   ═══════════════════════════════════════════════════════════════════════ */

/** Go back at most this share of `max` to find a space. */
const MIN_KEEP = 0.6;

/**
 * @param {string} text
 * @param {number} max
 * @returns {string} text itself when it fits, else its head of at most `max` characters
 */
export function cutAtWord(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  let end = max;
  const last = s.charCodeAt(end - 1);
  if (last >= 0xD800 && last <= 0xDBFF) end--;   // never split a surrogate pair
  // the cut falls inside a word when the characters on both sides of it are not spaces
  if (!/\s/.test(s.charAt(end)) && !/\s/.test(s.charAt(end - 1))) {
    const space = s.slice(0, end).search(/\s\S*$/);
    if (space >= Math.ceil(max * MIN_KEEP)) end = space;
  }
  return s.slice(0, end).replace(/[\s,;:–—-]+$/, '');
}
