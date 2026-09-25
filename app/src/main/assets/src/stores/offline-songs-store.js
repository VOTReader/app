// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   OfflineSongsStore — the songs kept on this phone (IDB v12, Songs K1)
   ═══════════════════════════════════════════════════════════════════════
   `offline-songs`: song id → { id, blob, bytes, sha256, keptAt }. The mp3 as
   the song site served it (a Blob, which IDB keeps on disk and hands back as a
   handle, never as bytes in memory), its byte count (the catalog's `b`, checked
   on the way in), the SHA-256 of those bytes, and when it was kept.

   Bundle-b beside the other stores; utils/song-keep.js (bundle-d) drives it,
   through the OfflineSongsStore global, at call time.

   NOT BACKED UP, deliberately (the only store besides `meta` that the backup
   skips; user-data-parity.test.js pins both by name): the bytes can run to
   gigabytes and come back from the song sites. The LIST of kept ids travels as
   `songKept` in vot-audio-library, so a restore can offer them again.
   ═══════════════════════════════════════════════════════════════════════ */

import { IDBAdapter } from './idb-adapter.js';

const STORE = 'offline-songs';
const ID_RE = /^[0-9a-f]{12}$/;

/** @typedef {{ id: string, blob: Blob, bytes: number, sha256: string, keptAt: number }} KeptSong */

/**
 * A stored value, or null when it is not one this build wrote.
 * @param {string} key @param {unknown} v @returns {KeptSong | null}
 */
function _record(key, v) {
  const r = /** @type {any} */ (v);
  if (!ID_RE.test(key) || !r || typeof r !== 'object' || r.id !== key) return null;
  if (typeof Blob === 'undefined' || !(r.blob instanceof Blob)) return null;
  const bytes = Number(r.bytes);
  if (!(bytes > 0)) return null;
  return { id: key, blob: r.blob, bytes, sha256: typeof r.sha256 === 'string' ? r.sha256 : '', keptAt: Number(r.keptAt) || 0 };
}

export const OfflineSongsStore = {
  STORE,

  /** Every kept song (records whose shape this build does not read are left out). @returns {Promise<KeptSong[]>} */
  async all() {
    const raw = await IDBAdapter.getAll(STORE);
    /** @type {KeptSong[]} */
    const out = [];
    for (const key of Object.keys(raw || {})) {
      const rec = _record(key, raw[key]);
      if (rec) out.push(rec);
    }
    return out;
  },

  /** @param {string} id @returns {Promise<KeptSong | null>} */
  async get(id) {
    if (!ID_RE.test(String(id))) return null;
    return _record(id, await IDBAdapter.get(STORE, id));
  },

  /** @param {KeptSong} rec @returns {Promise<void>} */
  async put(rec) {
    if (!rec || !ID_RE.test(String(rec.id))) throw new Error('offline-songs: not a song id');
    if (typeof Blob === 'undefined' || !(rec.blob instanceof Blob) || !(rec.bytes > 0)) throw new Error('offline-songs: no song bytes');
    await IDBAdapter.put(STORE, rec.id, { id: rec.id, blob: rec.blob, bytes: rec.bytes, sha256: String(rec.sha256 || ''), keptAt: Number(rec.keptAt) || Date.now() });
  },

  /** @param {string} id @returns {Promise<void>} */
  async delete(id) {
    if (!ID_RE.test(String(id))) return;
    await IDBAdapter.delete(STORE, id);
  },
};
