/* ═══════════════════════════════════════════════════════════════════════
   search/tokenize.js — shared tokenizer + archaic-pronoun folding
   ═══════════════════════════════════════════════════════════════════════
   `kjvEncode` is the ONE tokenizer used on BOTH sides of the engine — it is
   MiniSearch's `tokenize` AND `processTerm` (so index-time and query-time
   folding are identical), and it backs the contiguous-phrase check in
   ranking.js. Folding rules (ported verbatim from the FlexSearch engine):
     1. lowercase
     2. strip diacritics (NFD → drop combining marks) — lets an accented query
        ("resurrección") match its ASCII form; no-op on the ASCII corpus
     3. punctuation/symbols → space, then split on whitespace
     4. normalize archaic pronouns (thee/thou/ye→you, thy/thine→your) so KJV/ASV
        wording matches modern-translation wording and vice versa.
   `expandArchaicTerms` is the reverse: a query token expands to every form it
   should HIGHLIGHT/snippet on ("you" highlights "thee"/"thou"/"ye").
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Bidirectional archaic→modern pronoun normalization, applied at index AND
 * query time. Conservative (pronouns only) — verb-form stemming (saith/says)
 * would cost precision for little gain.
 * @type {Object<string,string>}
 */
export const ARCHAIC_NORMALIZE = {
  thee: 'you',
  thou: 'you',
  ye: 'you',
  thy: 'your',
  thine: 'your',
  thyself: 'yourself',
};

/**
 * Tokenize + fold a string into normalized tokens.
 * @param {string} str
 * @returns {string[]}
 */
export function kjvEncode(str) {
  if (typeof str !== 'string' || !str) return [];
  // NFD-decompose, strip combining marks (̀-ͯ), punctuation→space.
  const tokens = str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    out.push(ARCHAIC_NORMALIZE[t] || t);
  }
  return out;
}

/**
 * Reverse-expansion map: each token → every form it should visually match.
 * Built from ARCHAIC_NORMALIZE so it's bidirectional by construction
 * ("you"→[you,thee,thou,ye]; "thee"→[thee,you,thou,ye]).
 * @type {Object<string,string[]>}
 */
export const ARCHAIC_EXPAND = (function () {
  /** @type {Object<string,string[]>} */
  const m = {};
  const pairs = Object.keys(ARCHAIC_NORMALIZE);
  for (let i = 0; i < pairs.length; i++) {
    const archaic = pairs[i];
    const modern = ARCHAIC_NORMALIZE[archaic];
    (m[modern] = m[modern] || [modern]).push(archaic);
    m[archaic] = m[archaic] || [archaic, modern];
  }
  // Second pass: every archaic form also sees its siblings (forms that map to
  // the same modern word) — so "thee" highlights "thou" too.
  for (const a in m) {
    const modernForm = ARCHAIC_NORMALIZE[a];
    if (!modernForm) continue;
    const siblings = m[modernForm];
    for (let j = 0; j < siblings.length; j++) {
      if (m[a].indexOf(siblings[j]) < 0) m[a].push(siblings[j]);
    }
  }
  return m;
})();

/**
 * Expand query terms to all forms to highlight on, deduped.
 * @param {string[]} terms
 * @returns {string[]}
 */
export function expandArchaicTerms(terms) {
  if (!terms || !terms.length) return [];
  const out = [];
  const seen = Object.create(null);
  for (let i = 0; i < terms.length; i++) {
    const t = (terms[i] || '').toLowerCase();
    if (!t) continue;
    const variants = ARCHAIC_EXPAND[t] || [t];
    for (let j = 0; j < variants.length; j++) {
      if (!seen[variants[j]]) {
        seen[variants[j]] = true;
        out.push(variants[j]);
      }
    }
  }
  return out;
}
