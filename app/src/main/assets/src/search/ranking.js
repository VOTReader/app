/* ═══════════════════════════════════════════════════════════════════════
   search/ranking.js — ranking signals MiniSearch BM25 can't express natively
   ═══════════════════════════════════════════════════════════════════════
   The engine runs one BM25 search per query "unit" (a literal term or a
   synonym), then accumulates per-doc scores. On top of that raw BM25 signal,
   three project-specific signals (ported from the audited FlexSearch ranking)
   re-order results:

     • KIND_BOOST       — gently order doc kinds (a verse and a letter rank
                          alike; a Bible-study chapter slightly lower). Title-
                          vs-body weighting is handled by MiniSearch's per-field
                          `boost`, so it's NOT duplicated here.
     • coverage         — how many DISTINCT original query terms a doc matched
                          (popcount of a per-doc term bitmask). A doc matching
                          more of the query's words outranks one matching fewer.
     • phrase proximity — a contiguous-token run of the FULL query (a remembered
                          verse) gets a decisive boost over docs that merely
                          scatter the same words.
     • synonym demotion — handled in the engine via the `literal` flag; a doc
                          that matched ONLY a synonym (no literal term) is halved
                          so the exact word always outranks its expansions.
   ═══════════════════════════════════════════════════════════════════════ */

import { kjvEncode } from './tokenize.js';

/**
 * Per-kind score multipliers. Only the kinds the narrow index emits appear here
 * (verse / letter / wtlb / blessed / holy-day / bible-study). Unknown kinds get
 * 1.0 via the lookup fallback at the call site.
 * @type {Object<string,number>}
 */
export const KIND_BOOST = {
  verse: 1.0,
  letter: 1.0,
  wtlb: 1.0,
  blessed: 1.0,
  'holy-day': 1.0,
  'bible-study': 0.8,
};

/** Coverage multiplier curve: cov2→3×, cov3→5×, cov4→7×, … (gentle, not a hard tier). */
export function coverageMultiplier(distinctTerms) {
  return distinctTerms > 1 ? 1 + (distinctTerms - 1) * 2 : 1;
}

/** Decisive boost when the full query appears as a contiguous token run. */
export const PHRASE_BOOST = 6;

/** Synonym-only hit demotion (matched no literal query term). */
export const SYNONYM_DEMOTION = 0.5;

/**
 * Count set bits — the number of DISTINCT original query terms a doc matched.
 * @param {number} mask
 * @returns {number}
 */
export function popcount(mask) {
  let m = mask | 0;
  let n = 0;
  while (m) { m &= (m - 1); n++; }
  return n;
}

/**
 * Does `text` contain `qTokens` as a contiguous run? Tokenized via kjvEncode, so
 * it's punctuation- AND archaic-immune ("be still, and know" matches the query
 * "be still and know"; "thou art" matches "you are").
 * @param {string} text
 * @param {string[]} qTokens
 * @returns {boolean}
 */
export function phraseTokenMatch(text, qTokens) {
  if (!text || !qTokens || qTokens.length < 2) return false;
  const toks = kjvEncode(text);
  const n = toks.length;
  const m = qTokens.length;
  if (m > n) return false;
  for (let i = 0; i + m <= n; i++) {
    let ok = true;
    for (let j = 0; j < m; j++) {
      if (toks[i + j] !== qTokens[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}
