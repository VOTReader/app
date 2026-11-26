/* Accent fold that keeps every offset where it was (audit 2026-11-23 heart-2 + i18n-text-n4).
   The search index folds accents, so a typed "jesus" finds RVR's "Jesús", but Find, the result marks and the
   Highlights and journal filters compared raw text and missed it. foldAccents takes the accents off each
   character whose base letter is one UTF-16 unit ("ó" -> "o", "É" -> "E") and keeps any other character as it is
   ("Æ", a lone combining mark, Hebrew), so the folded string is the same length as the source and an index
   found in it is the same index in the source: a match can be sliced or marked in the text as written. */
var NON_ASCII = /[\u0080-\uFFFF]/g;
/** @type {Map<string, string>} */
var cache = new Map();

/** @param {string} ch @returns {string} */
function foldChar(ch) {
  var hit = cache.get(ch);
  if (hit !== undefined) return hit;
  var f = ch.normalize('NFD').replace(/\p{M}/gu, '');
  if (f.length !== 1) f = ch;
  cache.set(ch, f);
  return f;
}

/** Accents off, length kept. @param {string} s @returns {string} */
export function foldAccents(s) {
  s = String(s == null ? '' : s);
  return /[\u0080-\uFFFF]/.test(s) ? s.replace(NON_ASCII, foldChar) : s;
}

/** Lowercase, then accents off: the key a typed filter and the text it filters are compared by.
 * @param {string} s @returns {string} */
export function foldLower(s) { return foldAccents(String(s == null ? '' : s).toLowerCase()); }
