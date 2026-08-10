// @ts-check
/*
   AudioPositionsStore — durable per-recording playback positions

   The player's `vot-audio-pos` localStorage snapshot is ONE slot: it remembers
   the last thing that was playing, so starting anything else overwrites where
   the reader was in everything else. This store is the per-recording memory
   that sits beside it — a bounded map from a recording's immutable release URL
   to where it was left, how long it runs, and when it was last touched.

   Deliberately tiny: three numbers per recording, capped at 200 entries by
   least-recent touch. Audio bytes are still streamed from the release assets;
   nothing here is media, and no arbitrary URL can enter the map (the key must
   pass the same `isVotAudioUrl` boundary the player and the library enforce).
*/

import { CachedStore, extendStore } from './cached-store.js';
import { isVotAudioUrl } from '../utils/audio-track.js';

/** Recordings remembered at once. The LRU drops the least recently touched. */
export const MAX_AUDIO_POSITIONS = 200;

/** Ceiling for a stored clock, seconds. 100 h is far longer than any VOT
 *  asset (the longest whole-book Bible track is ~4 h), so a real position can
 *  never hit it while a corrupt or hostile number is bounded. */
const MAX_POSITION_SECONDS = 360000;

/**
 * @typedef {{ t: number, d: number, at: number }} AudioPositionRecord
 *   t  - seconds into the recording
 *   d  - recording length in seconds, 0 when it was never known
 *   at - epoch ms of the last touch (the LRU key)
 */

/** @typedef {{ v: 1, positions: Record<string, AudioPositionRecord> }} AudioPositionsData */

/** @returns {AudioPositionsData} */
function _empty() {
  return { v: 1, positions: {} };
}

/** @param {unknown} value @returns {number} */
function _timestamp(value) {
  const stamp = Math.floor(Number(value) || 0);
  // Keep malformed imported dates from sorting above a real present-day entry.
  return stamp > 0 && stamp < 8640000000000000 ? stamp : 0;
}

/**
 * A clock value: finite, never negative, bounded, and kept to a tenth of a
 * second (the player's own resolution — a media element's currentTime carries
 * far more precision than a resume point can use).
 *
 * @param {unknown} value
 * @returns {number}
 */
function _seconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(Math.min(number, MAX_POSITION_SECONDS) * 10) / 10;
}

/**
 * The trusted release URL for a track object or a bare URL string. Anything
 * else — an arbitrary remote address, a `javascript:` string, a missing url —
 * resolves to '' and is never written or read.
 *
 * @param {unknown} track
 * @returns {string}
 */
function _url(track) {
  const url = typeof track === 'string'
    ? track
    : (track && typeof track === 'object' ? /** @type {any} */ (track).url : '');
  return typeof url === 'string' && isVotAudioUrl(url) ? url : '';
}

/**
 * Drop the least recently touched entries past the cap.
 *
 * The map's KEY ORDER is its LRU order: every write deletes before it
 * re-inserts, and URL keys are non-integer-like strings, so JS object key
 * order is insertion order. That makes the overflow exactly the front of
 * `Object.keys`, with no per-write sort.
 *
 * @param {AudioPositionsData} data
 * @returns {void}
 */
function _prune(data) {
  const keys = Object.keys(data.positions);
  const overflow = keys.length - MAX_AUDIO_POSITIONS;
  if (overflow <= 0) return;
  for (let i = 0; i < overflow; i++) delete data.positions[keys[i]];
}

/**
 * Trust boundary for imported and persisted data. Every key is re-checked
 * against the release-asset policy and every value is re-clamped, then the
 * surviving rows are re-inserted OLDEST FIRST so the restored map carries the
 * same LRU key order the writer maintains — which is what lets an oversized
 * import truncate to the 200 freshest recordings rather than an arbitrary 200.
 *
 * @param {unknown} value
 * @returns {AudioPositionsData}
 */
export function normalizeAudioPositions(value) {
  const out = _empty();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  const map = /** @type {Record<string, unknown>} */ (value).positions;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  const raw = /** @type {Record<string, unknown>} */ (map);
  /** @type {Array<{ url: string, record: AudioPositionRecord }>} */
  const rows = [];
  for (const url of Object.keys(raw)) {
    if (!isVotAudioUrl(url)) continue;
    const entry = raw[url];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const fields = /** @type {Record<string, unknown>} */ (entry);
    const t = _seconds(fields.t);
    // A position of zero is indistinguishable from having no memory at all.
    if (t <= 0) continue;
    rows.push({ url, record: { t, d: _seconds(fields.d), at: _timestamp(fields.at) } });
  }
  rows.sort((a, b) => a.record.at - b.record.at);
  const overflow = Math.max(0, rows.length - MAX_AUDIO_POSITIONS);
  for (let i = overflow; i < rows.length; i++) out.positions[rows[i].url] = rows[i].record;
  return out;
}

/**
 * Mutators promote a sanitized snapshot into the live cache before changing
 * it, so a store still in its pending-hydration state is never perturbed by a
 * read (mirrors AudioLibraryStore).
 *
 * @param {any} store
 * @returns {AudioPositionsData}
 */
function _writeableData(store) {
  const data = normalizeAudioPositions(store._load());
  store._cache = data;
  return data;
}

export const AudioPositionsStore = extendStore(
  CachedStore('vot-audio-positions', /** @type {AudioPositionsData} */ (_empty()), { idb: true }),
  {
    /** @returns {AudioPositionsData} */
    get() {
      return normalizeAudioPositions(this._load());
    },

    /**
     * Where a recording was left, or null when nothing is remembered.
     *
     * Reads the live cache directly instead of a full normalize: this runs
     * once per rendered row on the Listening Library surfaces, and a whole-map
     * re-validation per row would be O(rows x 200). The two numbers it returns
     * are still clamped on the way out.
     *
     * @param {unknown} track - a Track-shaped object or its release URL
     * @returns {{ t: number, d: number } | null}
     */
    getPosition(track) {
      const url = _url(track);
      if (!url) return null;
      const data = /** @type {any} */ (this._load());
      const map = data && data.positions;
      const record = map && typeof map === 'object' ? map[url] : null;
      if (!record || typeof record !== 'object') return null;
      const t = _seconds(record.t);
      return t > 0 ? { t, d: _seconds(record.d) } : null;
    },

    /**
     * Remember where a recording was left. A position of zero (or one that
     * cannot be trusted) FORGETS the recording instead of storing a row that
     * means the same thing as having none.
     *
     * @param {unknown} track - a Track-shaped object or its release URL
     * @param {unknown} t     - seconds into the recording
     * @param {unknown} d     - recording length, 0/absent when not yet known
     * @returns {void}
     */
    setPosition(track, t, d) {
      const url = _url(track);
      if (!url) return;
      const seconds = _seconds(t);
      if (seconds <= 0) { this.clearPosition(url); return; }
      if (this._shouldDefer('setPosition', track, t, d)) return;
      const data = _writeableData(this);
      // Delete before re-inserting: that is what makes key order LRU order.
      delete data.positions[url];
      data.positions[url] = { t: seconds, d: _seconds(d), at: Date.now() };
      _prune(data);
      this._cache = data;
      this._save();
      this._bump();
    },

    /**
     * Forget one recording — used when it plays through to its end.
     *
     * @param {unknown} track - a Track-shaped object or its release URL
     * @returns {void}
     */
    clearPosition(track) {
      const url = _url(track);
      if (!url) return;
      if (this._shouldDefer('clearPosition', track)) return;
      const data = _writeableData(this);
      if (!Object.prototype.hasOwnProperty.call(data.positions, url)) return;
      delete data.positions[url];
      this._cache = data;
      this._save();
      this._bump();
    },

    /**
     * Backup/import boundary. Nested values are re-validated and re-bounded
     * here, not trusted because the envelope had the expected top-level type.
     *
     * @param {unknown} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      this._cache = normalizeAudioPositions(data);
      this._save();
      this._bump();
    },
  }
);
