/* selection-word — a selection with no letter or digit in it (a lone comma, a dash) grows to the nearest word.

   Half-baked 14: a long-press that landed on a comma raised the colour bar over a selection with nothing to mark, so
   a colour tap saved nothing and said nothing. The bar now opens over a word: the one the comma follows, or, when
   the comma opens the text, the one after it. Only inside the same text node; anywhere else the selection is left
   as it was. */

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
const APOSTROPHE = /['’]/;

/** @param {string} s */
export function hasWordChar(s) { return WORD_CHAR.test(s); }

/** @param {string} text @param {number} i */
const isWordAt = (text, i) => i >= 0 && i < text.length && WORD_CHAR.test(text[i]);

/**
 * The whole word around `at` in `text`, as [start, end), taking an apostrophe between two letters as part of it.
 * @param {string} text @param {number} at an index inside the word
 * @returns {[number, number]}
 */
function wordAround(text, at) {
  let s = at;
  while (s > 0 && (isWordAt(text, s - 1) || (APOSTROPHE.test(text[s - 1]) && isWordAt(text, s - 2) && isWordAt(text, s)))) s--;
  let e = at + 1;
  while (e < text.length && (isWordAt(text, e) || (APOSTROPHE.test(text[e]) && isWordAt(text, e - 1) && isWordAt(text, e + 1)))) e++;
  return [s, e];
}

/**
 * A range over the word nearest a selection that holds no letter or digit, or null when there is nothing to grow to
 * (a selection that already has a word, one that starts outside a text node, a node with no word in it).
 * @param {Range} range
 * @returns {Range | null}
 */
export function nearestWordRange(range) {
  const node = range.startContainer;
  if (!node || node.nodeType !== 3) return null;
  const text = /** @type {Text} */ (node).data;
  const a = range.startOffset;
  const b = range.endContainer === node ? range.endOffset : text.length;
  if (hasWordChar(text.slice(a, b))) return null;
  let before = a;                       // the end of the word before the selection
  while (before > 0 && !isWordAt(text, before - 1)) before--;
  const hasBefore = before > 0;
  let after = b;                        // the start of the word after it
  while (after < text.length && !isWordAt(text, after)) after++;
  const hasAfter = after < text.length;
  if (!hasBefore && !hasAfter) return null;
  const useBefore = hasBefore && (!hasAfter || a - before <= after - b);
  const [s, e] = useBefore ? wordAround(text, before - 1) : wordAround(text, after);
  const grown = range.cloneRange();
  grown.setStart(node, s);
  grown.setEnd(node, e);
  return grown;
}
