// @ts-check
/*
   AudioLibraryStore — durable Listening Library metadata

   This store owns only small metadata: saved recordings, a bounded recent
   list, the user's playback-rate preference, and two monotonic lifetime
   counters (recordings started / recordings finished). Audio bytes remain
   streamed from the app's immutable GitHub release assets; there is
   deliberately no local-media cache or arbitrary URL field here.
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
 * @typedef {{ v: 1, saved: SavedAudioTrack[], recent: RecentAudioTrack[], rate: number, plays: number, completions: number }} AudioLibraryData
 */

/** Lifetime counters are monotonic and bounded — one ceiling for both. */
const MAX_LIFETIME_COUNT = 10000000;

/** @returns {AudioLibraryData} */
function _empty() {
  // `plays` (2026-08-09): lifetime recordings-started counter for the
  // milestones system. Additive to v1 — older records retain the conservative
  // lower bound already present in their recent-history shelf.
  // `completions` (2026-08-09): recordings heard all the way to their END,
  // which `plays` cannot express — starting a recording and finishing one are
  // different acts, and My Progress shows both. Additive to v1 as well, but
  // with NO lower-bound inference: a pre-counter library holds no evidence
  // about which of its recordings ever reached their last second, and an
  // invented number would be a lie about the reader's own listening.
  return { v: 1, saved: [], recent: [], rate: 1, plays: 0, completions: 0 };
}

/** @param {unknown} value @returns {number} */
function _lifetimeCount(value) {
  return Math.max(0, Math.min(MAX_LIFETIME_COUNT, Math.floor(Number(value) || 0)));
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

  const hasLifetimePlayCount = Object.prototype.hasOwnProperty.call(raw, 'plays');
  const normalizedPlays = _lifetimeCount(raw.plays);
  return {
    v: 1,
    saved,
    recent,
    rate: normalizeAudioRate(raw.rate),
    // Pre-counter libraries still prove one prior start for each distinct
    // recent release. It is a conservative lower bound, never a guess at
    // playback events that were not retained.
    plays: hasLifetimePlayCount ? normalizedPlays : Math.max(normalizedPlays, recent.length),
    // No lower-bound sibling: the recent shelf records that a recording was
    // STARTED, which says nothing about whether it was finished.
    completions: _lifetimeCount(raw.completions),
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
     * noise in the library. The shelf answers "what was I listening to", so
     * every track start belongs here — the lifetime counter does NOT (see
     * countPlay).
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

    /**
     * Count one user-initiated play. Deliberately separate from recordPlayed:
     * the player starts a track on every auto-advance, prev/next and resume
     * rebuild, so counting starts would credit a whole queue's worth of
     * listening to a single tap on Play All.
     *
     * @returns {number} the lifetime count after this play
     */
    countPlay() {
      if (this._shouldDefer('countPlay')) return this.get().plays;
      const data = _writeableData(this);
      data.plays = Math.min(MAX_LIFETIME_COUNT, data.plays + 1);
      this._cache = data;
      this._save();
      this._bump();
      return data.plays;
    },

    /** Lifetime recordings-played count (milestones). @returns {number} */
    getPlays() { return this.get().plays; },

    /**
     * Count one recording heard to its END. Fired from the player's
     * end-of-track notification (the same moment the listened-to-the-end read
     * credit is granted), so it counts WHOLE recordings: a multi-part letter
     * counts once, when its last part finishes.
     *
     * Monotonic and separate from countPlay for the reason plays is separate
     * from the recent shelf — starting and finishing are different facts, and
     * a listener who abandons a recording halfway has not finished it.
     *
     * @returns {number} the lifetime count after this completion
     */
    countCompletion() {
      if (this._shouldDefer('countCompletion')) return this.get().completions;
      const data = _writeableData(this);
      data.completions = Math.min(MAX_LIFETIME_COUNT, data.completions + 1);
      this._cache = data;
      this._save();
      this._bump();
      return data.completions;
    },

    /** Lifetime recordings-heard-to-the-end count. @returns {number} */
    getCompletions() { return this.get().completions; },

    /**
     * Drop ONE recording from the recent shelf, by its immutable release URL —
     * the same identity save/dedupe use. An in-place mutator like clearRecent:
     * no persisted shape changes, so no schema version moves.
     *
     * @param {unknown} url
     * @returns {boolean} true when a row was actually removed
     */
    removeRecent(url) {
      if (typeof url !== 'string' || !url) return false;
      if (this._shouldDefer('removeRecent', url)) return true;
      const data = _writeableData(this);
      const remaining = data.recent.filter((item) => item.url !== url);
      if (remaining.length === data.recent.length) return false;
      data.recent = remaining;
      this._cache = data;
      this._save();
      this._bump();
      return true;
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
