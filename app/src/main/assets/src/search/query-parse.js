/* ═══════════════════════════════════════════════════════════════════════
   search/query-parse.js — free-text query operator parser
   ═══════════════════════════════════════════════════════════════════════
   Parses the operator grammar of a plain text query: a quoted "exact phrase",
   +required terms, -excluded terms, and the remaining bare terms. (Bible /
   letter REFERENCE parsing — "John 3:16", "V2 L5" — lives in ref-parser.js;
   this module is only reached once a query is known NOT to be a reference.)
   Ported from the FlexSearch engine's parseTextQuery.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} TextQuery
 * @property {'text'} kind
 * @property {string|null} phrase    quoted exact phrase (or null)
 * @property {string} cleanQuery
 * @property {string[]} must         +required terms
 * @property {string[]} mustNot      -excluded terms
 * @property {string[]} terms        remaining bare terms
 */

/**
 * @param {string} q
 * @returns {TextQuery}
 */
export function parseTextQuery(q) {
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
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.charAt(0) === '"' && p.charAt(p.length - 1) === '"') {
      const quoted = p.slice(1, -1);
      // F28: `phrase` is one slot. A second quoted phrase used to overwrite the
      // first, so the reader's first phrase vanished with no signal. Keep the
      // first as the phrase (it is the one the engine can enforce as adjacent —
      // engine.js:285 indexOf's it whole) and push every later phrase's words
      // onto `must`, which engine.js already concatenates onto the term list
      // (:165) and requires against the combined text (:288). Every phrase then
      // constrains the result set; only the first keeps its adjacency.
      if (phrase === null) phrase = quoted;
      else for (const w of quoted.split(/\s+/)) { if (w) must.push(w.toLowerCase()); }
      continue;
    }
    if (p.charAt(0) === '-' && p.length > 1) { mustNot.push(p.slice(1).toLowerCase()); continue; }
    if (p.charAt(0) === '+' && p.length > 1) { must.push(p.slice(1).toLowerCase()); continue; }
    const up = p.toUpperCase();
    if (up === 'NOT' || up === 'OR' || up === 'AND') continue; // boolean glue — eaten
    terms.push(p.toLowerCase());
  }
  return { kind: 'text', phrase, cleanQuery: q.toLowerCase(), must, mustNot, terms };
}
