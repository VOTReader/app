/* A NUMBER TYPED IN WORDS IS ALSO ITS DIGITS (search200 fix1). "his number is six hundred and sixty six"
   never met Revelation 13:18's "His number is 666": kjvEncode reads a number under a hundred as its digits
   ("sixty six" is 66, B2), but a hundred or a thousand stayed a word, so the typed words found the texts
   saying "six" and "hundred" and the verse ranked #14. The query, alone, is also read with each such number
   as its digits: a units word (or "one", "a", "an") before "hundred", and any number before "thousand"
   ("six hundred sixty six" and "six hundred and sixty six" are 666, "a hundred and fifty three" is 153,
   "one hundred and forty four thousand" is 144000). The index keeps the words as written; this is a reading
   of what was typed, at query time. */

/** "one", or a number of one to three digits, as its value; anything else 0. @param {string|undefined} t */
const small = (t) => (t === 'one' ? 1 : t && /^\d{1,3}$/.test(t) ? +t : 0);

/**
 * The tokens with each number written in words over a hundred read as its digits (tokens as kjvEncode
 * folds them: ["6", "hundred", "66"] → ["666"]). Tokens that make no such number stay as they are.
 * @param {string[]} tokens
 * @returns {string[]}
 */
export function numberReading(tokens) {
  /** A value up to "N hundred [and] NN" starting at `i`, and the index after it. @param {number} i */
  const group = (i) => {
    const article = (tokens[i] === 'a' || tokens[i] === 'an') && (tokens[i + 1] === 'hundred' || tokens[i + 1] === 'thousand');
    const v0 = article ? 1 : small(tokens[i]);
    if (!v0) return null;
    let v = v0;
    let j = i + 1;
    let hundred = false;
    if (tokens[j] === 'hundred' && v0 <= 9) {
      v = v0 * 100;
      j++;
      hundred = true;
      const k = tokens[j] === 'and' ? j + 1 : j;
      const tens = /^\d{1,2}$/.test(tokens[k] || '') ? +tokens[k] : 0;
      if (tens) { v += tens; j = k + 1; }
    }
    return { v, j, hundred };
  };
  /** @type {string[]} */
  const out = [];
  for (let r = 0; r < tokens.length;) {
    const g = group(r);
    let v = -1;
    let j = r;
    if (g && tokens[g.j] === 'thousand') {
      v = g.v * 1000;
      j = g.j + 1;
      const k = tokens[j] === 'and' ? j + 1 : j;
      const rest = group(k);
      if (rest && (rest.hundred || k > j)) { v += rest.v; j = rest.j; }
    } else if (g && g.hundred) {
      v = g.v;
      j = g.j;
    }
    if (v >= 0) { out.push(String(v)); r = j; } else { out.push(tokens[r]); r++; }
  }
  return out;
}
