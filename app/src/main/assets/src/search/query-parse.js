/* ═══════════════════════════════════════════════════════════════════════
   search/query-parse.js — free-text query operator parser
   ═══════════════════════════════════════════════════════════════════════
   Parses the operator grammar of a plain text query: a quoted "exact phrase",
   +required terms, -excluded terms, and the remaining bare terms. (Bible /
   letter REFERENCE parsing — "John 3:16", "V2 L5" — lives in ref-parser.js;
   this module is only reached once a query is known NOT to be a reference.)
   Ported from the FlexSearch engine's parseTextQuery.
   ═══════════════════════════════════════════════════════════════════════ */

import { kjvEncode } from './tokenize.js';

/**
 * @typedef {Object} TextQuery
 * @property {'text'} kind
 * @property {string|null} phrase    quoted exact phrase (or null)
 * @property {string} cleanQuery
 * @property {string[]} must         +required terms, and each quoted phrase after the first (a run of words)
 * @property {string[]} mustNot      -excluded terms
 * @property {string[]} terms        remaining bare terms
 */

/**
 * @param {string} q
 * @returns {TextQuery}
 */
export function parseTextQuery(q) {
  // Curly double quotes are quotes: a phone keyboard types “love one another”,
  // and a phrase in them used to be read as loose words (v07-02).
  q = String(q).replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  const phraseMatch = q.match(/^"([^"]+)"$/);
  if (phraseMatch) {
    const ph = phraseMatch[1].trim();
    return { kind: 'text', phrase: ph, cleanQuery: ph, must: [], mustNot: [], terms: [] };
  }
  // Mixed — phrase + bare terms + ±.
  const terms = [];
  const must = [];
  const mustNot = [];
  let phrase = null;
  const parts = q.match(/"[^"]+"|\S+/g) || [];
  /* Only NOT, OR and AND typed in capitals are glue (search200 bugcheck #3): "fear not", "judge not" and "love not
     the world" lost their "not". A query typed all in capitals ("FEAR NOT") has no capitals to tell them by: words. */
  const glue = q !== q.toUpperCase();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    // The first quoted phrase is THE phrase; a later one replaced it (sweep low, REPORT.md:646) and is a run the
    // text must hold now, as a +word is (the engine reads each `must` entry as a run of words).
    if (p.charAt(0) === '"' && p.charAt(p.length - 1) === '"') {
      const ph = p.slice(1, -1).trim();
      if (!ph) continue;
      if (phrase === null) phrase = ph;
      else must.push(ph.toLowerCase());
      continue;
    }
    if (p.charAt(0) === '-' && p.length > 1) { mustNot.push(p.slice(1).toLowerCase()); continue; }
    if (p.charAt(0) === '+' && p.length > 1) { must.push(p.slice(1).toLowerCase()); continue; }
    if (glue && (p === 'NOT' || p === 'OR' || p === 'AND')) continue; // boolean glue — eaten
    terms.push(p.toLowerCase());
  }
  return { kind: 'text', phrase, cleanQuery: q.toLowerCase(), must, mustNot, terms };
}

/**
 * The query with each corrected word put in (the engine's `corrections`: a typed
 * word nothing of its own reached, searched as the nearest indexed word, or as the
 * words a compound is written as). A query word is matched the way the engine read
 * it (kjvEncode: any case, accents and apostrophes folded), so an accented typo is
 * rewritten too; a word it cannot find leaves the query as it was. The engine
 * re-runs the corrected query, and the screen offers it ("Showing results for ...").
 * @param {string} query
 * @param {Array<{from:string, to:string}>} corrections
 * @returns {string}
 */
export function applyCorrections(query, corrections) {
  const q = String(query || '').trim();
  const to = Object.create(null);
  for (const c of corrections || []) if (c && c.from && c.to) to[c.from] = c.to;
  return q.replace(/[\p{L}\p{M}\p{N}'\u2019]+/gu, (w) => {
    const toks = kjvEncode(w);
    return toks.length === 1 && to[toks[0]] ? to[toks[0]] : w;
  });
}
