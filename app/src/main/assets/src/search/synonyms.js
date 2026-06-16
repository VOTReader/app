/* ═══════════════════════════════════════════════════════════════════════
   search/synonyms.js — query-time synonym expansion with coverage bookkeeping
   ═══════════════════════════════════════════════════════════════════════
   Expands each filtered query term into a set of search "units". A unit carries:
     • term    — the string to search
     • origin  — index of the ORIGINAL query term it belongs to (a synonym maps
                 to the term it expanded from), so term-COVERAGE counts distinct
                 original terms even when a synonym is what actually matched.
     • literal — true for the verbatim term, false for a synonym; the engine
                 searches literals fuzzy+prefix and synonyms EXACT-only, and
                 demotes synonym-only hits so the exact word always wins.
   Synonyms are owned by search-data.js (SYNONYM_MAP) — single source of truth.
   Opt-in via the existing settings.searchSynonyms toggle (default on).
   ═══════════════════════════════════════════════════════════════════════ */

import { searchData } from './search-data.js';

/**
 * @typedef {Object} SearchUnit
 * @property {string} term
 * @property {number} origin
 * @property {boolean} literal
 */

/**
 * @param {string[]} filtered  content terms (post stop-word filtering)
 * @param {{enabled?: boolean}} [opts]  enabled defaults true
 * @returns {{units: SearchUnit[], didExpand: boolean}}
 */
export function expandQueryTerms(filtered, opts) {
  const useSyn = !opts || opts.enabled !== false;
  const SYN = searchData().SYNONYM_MAP || {};
  /** @type {SearchUnit[]} */
  const units = [];
  const seen = Object.create(null);
  let didExpand = false;
  for (let ti = 0; ti < filtered.length; ti++) {
    const baseTerm = String(filtered[ti]).toLowerCase();
    if (!seen[baseTerm]) {
      seen[baseTerm] = true;
      units.push({ term: filtered[ti], origin: ti, literal: true });
    }
    if (useSyn) {
      const grp = SYN[baseTerm];
      if (grp) {
        for (let gi = 0; gi < grp.length; gi++) {
          const syn = String(grp[gi]).toLowerCase();
          if (!seen[syn]) {
            seen[syn] = true;
            units.push({ term: syn, origin: ti, literal: false });
            didExpand = true;
          }
        }
      }
    }
  }
  return { units, didExpand };
}
