/* ═══════════════════════════════════════════════════════════════════════
   srch-memory — what the reader opened in one search's results (bundle-d)
   ═══════════════════════════════════════════════════════════════════════
   Back from a result re-mounted the search screen with every collection closed
   and every "more places" list shut, so the reader opened them again and scrolled
   for the card they had left ("flood": Volume Seven opened, a letter read, Back:
   the group closed and 920 px of scroll became 379; search audit 2026-09-27).
   Kept for one search at a time, under SearchScreen's memo of the query and its
   settings: a new search forgets the last one's. */

let forMemo = '';
/** @type {Map<string, any>} */
const opened = new Map();

/**
 * What was kept under `key` for the search `memo`; undefined when nothing was.
 * @param {string} memo
 * @param {string} key
 * @returns {any}
 */
export function recall(memo, key) {
  return memo && memo === forMemo ? opened.get(key) : undefined;
}

/**
 * Keep `value` under `key` for the search `memo`, forgetting any other search's.
 * @param {string} memo
 * @param {string} key
 * @param {any} value
 */
export function remember(memo, key, value) {
  if (!memo) return;
  if (memo !== forMemo) { forMemo = memo; opened.clear(); }
  opened.set(key, value);
}

/**
 * One result's key: its doc, not its place in the list (the engine's dedup key
 * plus the unit ids), so Book order and a re-run keep it.
 * @param {any} d
 * @returns {string}
 */
export function docKey(d) {
  return [d.kind, d.volumeId, d.letterId, d.ref, d.title, String(d.text || '').slice(0, 60)].join('|');
}
