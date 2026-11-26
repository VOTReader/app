// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   song-votes-backup — Liked Songs in every backup, snapshot and copy
   ═══════════════════════════════════════════════════════════════════════
   data-rest-n1 (audit 11-23): this device's 👍/👎 map (`song-votes` in IDB's
   `meta` store, utils/song-votes.js) drives the Liked Songs shelf and the
   shuffle weighting, but export, the automatic snapshots and the Google copy
   carried only registered stores, so a phone move or a wipe left Liked Songs
   empty without a word.

   It rides as a top-level `meta: { 'song-votes': {id: {v, at}} }` beside
   `stores` (never inside it: a restore writes each `stores` name back as an
   object store, and an older app would throw on one it has not got). Only
   the votes map: never the outbox, the install id or the tallies.

   Coming back it MERGES, the newest `at` per song winning: a vote is never
   taken away by a restore. Stateless on purpose (bundle-b's backup and
   data-safety and bundle-d's song-votes each get their own copy of this).
   ═══════════════════════════════════════════════════════════════════════ */

export const SONG_VOTES_META = 'song-votes';

/** @typedef {Record<string, { v: 1 | -1, at: number }>} VotesMap */

/** Only well-formed votes (the song-id check runs again when song-votes loads). @param {unknown} raw @returns {VotesMap} */
export function cleanVotesMap(raw) {
  /** @type {VotesMap} */ const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, e] of Object.entries(/** @type {Record<string, any>} */ (raw))) {
    if (!id || id === '__proto__' || !e || (e.v !== 1 && e.v !== -1)) continue;
    out[id] = { v: e.v, at: Number(e.at) || 0 };
  }
  return out;
}

/**
 * The votes the live map lacks, or holds older: newest `at` wins, a tie keeps the live one.
 * @param {unknown} live @param {unknown} incoming
 * @returns {{ merged: VotesMap, changed: boolean }}
 */
export function mergeVotesMaps(live, incoming) {
  const merged = cleanVotesMap(live);
  let changed = false;
  for (const [id, e] of Object.entries(cleanVotesMap(incoming))) {
    const have = merged[id];
    if (!have || e.at > have.at) { merged[id] = e; changed = true; }
  }
  return { merged, changed };
}

/**
 * What a backup carries from `meta`: `{ 'song-votes': map }`, or null when there are no votes.
 * Throws when the read throws (export treats it like any other read failure).
 * @param {{ get(store: string, key: string): Promise<any> }} idb
 * @returns {Promise<{ [SONG_VOTES_META]: VotesMap } | null>}
 */
export async function readBackupMeta(idb) {
  const votes = cleanVotesMap(await idb.get('meta', SONG_VOTES_META));
  return Object.keys(votes).length ? { [SONG_VOTES_META]: votes } : null;
}

/**
 * Merge a backup's `meta` into this device. Resolves true when it wrote.
 * @param {{ get(store: string, key: string): Promise<any>, put(store: string, key: string, v: any): Promise<any> }} idb
 * @param {unknown} meta the backup's top-level `meta`
 * @returns {Promise<boolean>}
 */
export async function applyBackupMeta(idb, meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  const incoming = /** @type {Record<string, unknown>} */ (meta)[SONG_VOTES_META];
  if (!Object.keys(cleanVotesMap(incoming)).length) return false;
  const { merged, changed } = mergeVotesMaps(await idb.get('meta', SONG_VOTES_META), incoming);
  if (!changed) return false;
  await idb.put('meta', SONG_VOTES_META, merged);
  return true;
}
