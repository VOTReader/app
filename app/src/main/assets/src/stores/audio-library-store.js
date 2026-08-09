// @ts-check
/*
   AudioLibraryStore — durable Listening Library metadata

   This store owns only small metadata: saved recordings, a bounded recent
   list, and the user's playback-rate preference. Audio bytes remain streamed
   from the app's immutable GitHub release assets; there is deliberately no
   local-media cache or arbitrary URL field here.
*/

import { CachedStore, extendStore } from './cached-store.js';
import { normalizeAudioRate, normalizeAudioTrack } from '../utils/audio-track.js';

export const MAX_SAVED_AUDIO_TRACKS = 100;
export const MAX_RECENT_AUDIO_TRACKS = 30;

/**
 * @typedef {{
 *   key: string | null,
 *   title: string,
 *   sub: string | null,
 *   url: string,
 *   readerCode: string,
 *   partLabel: string | null,
 *   savedAt: number
 * }} SavedAudioTrack
 */

/** @typedef {SavedAudioTrack & { playedAt: number }} RecentAudioTrack */

/**
 * @typedef {{ v: 1, saved: SavedAudioTrack[], recent: RecentAudioTrack[], rate: number }} AudioLibraryData
 */

/** @returns {AudioLibraryData} */
function _empty() {
  return { v: 1, saved: [], recent: [], rate: 1 };
}

/** @param {unknown} value @returns {number} */
function _timestamp(value) {
  const stamp = Math.floor(Number(value) || 0);
  // Keep malformed imported dates from sorting above a real present-day entry.
  return stamp > 0 && stamp < 8640000000000000 ? stamp : 0;
}

/** @param {unknown} value @param {'savedAt'|'playedAt'} stampKey @returns {SavedAudioTrack | RecentAudioTrack | null} */
function _libraryTrack(value, stampKey) {
  const track = normalizeAudioTrack(value);
  if (!track) return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const stamp = _timestamp(raw[stampKey]);
  return stampKey === 'playedAt'
    ? { ...track, savedAt: _timestamp(raw.savedAt), playedAt: stamp }
    : { ...track, savedAt: stamp };
}

/**
 * One recording can have multiple corpus keys across old manifests, but its
 * immutable release URL remains stable. URL identity makes dedupe resistant to
 * future title or reader-credit corrections.
 *
 * @param {{ url?: string } | null | undefined} track
 * @returns {string}
 */
function _identity(track) { return (track && track.url) || ''; }

/**
 * Normalize an imported list, then sort before deduping so an import carrying
 * two copies of the same recording keeps its newest saved/played event rather
 * than whichever malformed ordering happened to arrive first.
 *
 * @param {unknown} value
 * @param {'savedAt'|'playedAt'} stampKey
 * @param {number} maximum
 * @returns {Array<SavedAudioTrack | RecentAudioTrack>}
 */
function _sortedUniqueTracks(value, stampKey, maximum) {
  /** @type {Array<SavedAudioTrack | RecentAudioTrack>} */
  const candidates = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const track = _libraryTrack(item, stampKey);
      if (track && _identity(track)) candidates.push(track);
    }
  }
  candidates.sort((a, b) => (Number(b[stampKey]) || 0) - (Number(a[stampKey]) || 0));
  const seen = new Set();
  /** @type {Array<SavedAudioTrack | RecentAudioTrack>} */
  const result = [];
  for (const track of candidates) {
    const key = _identity(track);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(track);
    if (result.length >= maximum) break;
  }
  return result;
}

/** @param {unknown} value @returns {AudioLibraryData} */
export function normalizeAudioLibrary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return _empty();
  const raw = /** @type {Record<string, unknown>} */ (value);
  const saved = /** @type {SavedAudioTrack[]} */ (_sortedUniqueTracks(raw.saved, 'savedAt', MAX_SAVED_AUDIO_TRACKS));
  const recent = /** @type {RecentAudioTrack[]} */ (_sortedUniqueTracks(raw.recent, 'playedAt', MAX_RECENT_AUDIO_TRACKS));

  return {
    v: 1,
    saved,
    recent,
    rate: normalizeAudioRate(raw.rate),
  };
}

/**
 * Mutators promote a sanitized snapshot into the live cache before changing
 * it. Read-only callers get a normalized view without perturbing an IDB store
 * that is still in its pending-hydration state.
 *
 * @param {any} store
 * @returns {AudioLibraryData}
 */
function _writeableData(store) {
  const data = normalizeAudioLibrary(store._load());
  store._cache = data;
  return data;
}

export const AudioLibraryStore = extendStore(
  CachedStore('vot-audio-library', /** @type {AudioLibraryData} */ (_empty()), { idb: true }),
  {
    /** @returns {AudioLibraryData} */
    get() {
      return normalizeAudioLibrary(this._load());
    },

    /** @returns {SavedAudioTrack[]} */
    saved() { return this.get().saved.map((track) => ({ ...track })); },

    /** @returns {RecentAudioTrack[]} */
    recent() { return this.get().recent.map((track) => ({ ...track })); },

    /** @returns {number} */
    getPlaybackRate() { return this.get().rate; },

    /** @param {unknown} track @returns {boolean} */
    isSaved(track) {
      const normalized = normalizeAudioTrack(track);
      return !!normalized && this.get().saved.some((item) => item.url === normalized.url);
    },

    /**
     * Save a recording, or remove it if already saved. Returns true when it is
     * saved after the operation, which lets compact star buttons stay stateless.
     *
     * @param {unknown} track
     * @returns {boolean}
     */
    toggleSaved(track) {
      const normalized = normalizeAudioTrack(track);
      if (!normalized) return false;
      const wasSaved = this.isSaved(normalized);
      if (this._shouldDefer('toggleSaved', normalized)) return !wasSaved;
      const data = _writeableData(this);
      const at = data.saved.findIndex((item) => item.url === normalized.url);
      if (at >= 0) {
        data.saved.splice(at, 1);
        this._save();
        this._bump();
        return false;
      }
      data.saved.unshift({ ...normalized, savedAt: Date.now() });
      data.saved = data.saved.slice(0, MAX_SAVED_AUDIO_TRACKS);
      this._cache = data;
      this._save();
      this._bump();
      return true;
    },

    /**
     * Put a playback start at the top of the bounded recent list. A repeat of
     * the same release asset moves its one row forward instead of creating
     * noise in the library.
     *
     * @param {unknown} track
     * @returns {void}
     */
    recordPlayed(track) {
      const normalized = normalizeAudioTrack(track);
      if (!normalized) return;
      if (this._shouldDefer('recordPlayed', normalized)) return;
      const data = _writeableData(this);
      data.recent = data.recent.filter((item) => item.url !== normalized.url);
      data.recent.unshift({ ...normalized, savedAt: 0, playedAt: Date.now() });
      data.recent = data.recent.slice(0, MAX_RECENT_AUDIO_TRACKS);
      this._cache = data;
      this._save();
      this._bump();
    },

    /** @returns {void} */
    clearRecent() {
      if (this._shouldDefer('clearRecent')) return;
      const data = _writeableData(this);
      if (!data.recent.length) return;
      data.recent = [];
      this._cache = data;
      this._save();
      this._bump();
    },

    /** @param {unknown} rate @returns {number} */
    setPlaybackRate(rate) {
      const next = normalizeAudioRate(rate);
      if (this._shouldDefer('setPlaybackRate', next)) return next;
      const data = _writeableData(this);
      if (data.rate === next) return next;
      data.rate = next;
      this._cache = data;
      this._save();
      this._bump();
      return next;
    },

    /**
     * Backup/import boundary. Nested values are normalized and bounded here,
     * not trusted merely because the envelope had the expected top-level type.
     *
     * @param {unknown} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      this._cache = normalizeAudioLibrary(data);
      this._save();
      this._bump();
    },
  }
);
