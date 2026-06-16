/* ═══════════════════════════════════════════════════════════════════════
   search/recent-searches.js — persisted recent-query list
   ═══════════════════════════════════════════════════════════════════════
   Finishes the long-dead "/clear history" command (search-data COMMANDS had a
   "Clear search history" entry with nothing behind it). Stored in localStorage
   (same store family as vot-state); the historyEnabled privacy gate is applied
   by the CALLER (SearchScreen) so a user who turned history off records nothing.
   Capped + deduped (most-recent-first).
   ═══════════════════════════════════════════════════════════════════════ */

const KEY = 'vot-recent-searches';
const MAX = 20;

/** @returns {string[]} */
function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return []; // unavailable / malformed — non-fatal
  }
}

/** @param {string[]} arr */
function write(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
  } catch {
    // quota exceeded / storage unavailable — recent searches are best-effort
  }
}

/** @returns {string[]} most-recent-first */
export function getRecentSearches() {
  return read();
}

/**
 * Record a query at the front (deduped, capped). Ignores blanks / 1-char queries.
 * @param {string} query
 * @returns {string[]} the updated list
 */
export function addRecentSearch(query) {
  const q = (query || '').trim();
  if (q.length < 2) return read();
  const next = read().filter((x) => x.toLowerCase() !== q.toLowerCase());
  next.unshift(q);
  const capped = next.slice(0, MAX);
  write(capped);
  return capped;
}

/** @returns {string[]} the (now empty) list */
export function clearRecentSearches() {
  write([]);
  return [];
}
