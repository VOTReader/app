/* ═══════════════════════════════════════════════════════════════════════
   srch-empty — WHAT A SEARCH THAT FOUND NOTHING OFFERS (search200 ideas G, 2026-10-22)
   ═══════════════════════════════════════════════════════════════════════
   "No results" was a dead end with a tip. It now offers the query trimmed to
   the words some text holds ("Try fewer words: seven trumpets"), when that
   finds something, and the texts the on-device model ranks nearest what was
   typed, only when the model is sure enough (NEAREST_MEANING_FLOOR): under it
   the model is guessing, and a guess is not shown.
   ═══════════════════════════════════════════════════════════════════════ */

/* The model's cosine a nearest text must reach (tools/search-bench/nearest-floor.mjs, 2026-10-22). Of the 262 open
   cases written by what a text means, 180 had the target among the nearest three, at a cosine of 0.614 to 0.95
   (median 0.788); twenty queries nothing here is about ("zxqvw", "photosynthesis", "wifi password") topped out at
   0.661. At 0.70 the floor keeps 171 of the 180 and none of the twenty, 0.04 clear of the highest guess. */
export const NEAREST_MEANING_FLOOR = 0.7;
/** The nearest texts shown, at most. */
export const NEAREST_SHOWN = 3;

/**
 * The query trimmed to its content words: quote marks and + off, a -word (one ruled out) dropped, the small words
 * (`isStop`) dropped, and with `knows`, the words no text holds dropped. '' when that leaves nothing, or leaves the
 * query as it was. Pure.
 * @param {string} query
 * @param {(word: string) => boolean} isStop
 * @param {((word: string) => boolean) | null} [knows]
 * @returns {string}
 */
export function fewerWords(query, isStop, knows) {
  const raw = String(query || '').replace(/["“”„‟]/g, ' ').trim();
  const kept = [];
  const seen = new Set();
  for (const piece of raw.split(/\s+/)) {
    if (!piece || piece[0] === '-') continue;
    const w = piece.replace(/^\++/, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
    if (!w || seen.has(w) || isStop(w)) continue;
    if (knows && !knows(w)) continue;
    seen.add(w);
    kept.push(w);
  }
  const out = kept.join(' ');
  const same = String(query || '').toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
  return out && out !== same ? out : '';
}

/**
 * The nearest texts the empty screen shows: those at the floor or above, at most NEAREST_SHOWN. Pure.
 * @param {Array<{meaning?: number, doc?: any}>} nearest  engine.js nearest(), best first
 * @returns {Array<any>}
 */
export function nearestShown(nearest) {
  return (nearest || []).filter((e) => typeof e.meaning === 'number' && e.meaning >= NEAREST_MEANING_FLOOR).slice(0, NEAREST_SHOWN);
}
