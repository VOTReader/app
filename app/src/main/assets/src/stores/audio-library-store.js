// @ts-check
/*
   AudioLibraryStore — durable Listening Library metadata

   This store owns only small metadata: saved recordings, a bounded recent
   list, the user's playback-rate preference, two monotonic lifetime
   counters (recordings started / recordings finished), and the Songs of the
   Letters shelves (saved and recent song IDS — songs count in neither
   counter). Audio bytes remain
   streamed from the app's immutable GitHub release assets; there is
   deliberately no local-media cache or arbitrary URL field here.
*/

import { CachedStore, extendStore } from './cached-store.js';
import { isSongId, normalizeAudioRate, normalizeAudioTrack, songIdOfKey } from '../utils/audio-track.js';

export const MAX_SAVED_AUDIO_TRACKS = 100;
export const MAX_RECENT_AUDIO_TRACKS = 30;
/** Songs of the Letters keep their OWN two shelves, by song id (never URL: a
 *  song's shard can be re-hosted, its id cannot change). Separate from the
 *  recordings' shelves on purpose: one evening of shuffle must not flush the
 *  letters a reader was hearing off the 30-row recent shelf. */
export const MAX_SAVED_SONGS = 500;
export const MAX_RECENT_SONGS = 30;
/** Songs kept on this phone (K1): every song the catalog holds, with room to grow. */
export const MAX_KEPT_SONGS = 5000;

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
 * @typedef {{ v: 1, saved: SavedAudioTrack[], recent: RecentAudioTrack[], rate: number, plays: number, completions: number, songSaved: string[], songRecent: string[], songKept: string[] }} AudioLibraryData
 */

/** Lifetime counters are monotonic and bounded — one ceiling for both. */
const MAX_LIFETIME_COUNT = 10000000;

/** @returns {AudioLibraryData} */
function _empty() {
  // `plays` (2026-08-09): lifetime recordings-started counter (My
  // Progress's "Recordings played"). Additive to v1 — older records retain the conservative
  // lower bound already present in their recent-history shelf.
  // `completions` (2026-08-09): recordings heard all the way to their END,
  // which `plays` cannot express — starting a recording and finishing one are
  // different acts, and My Progress shows both. Additive to v1 as well, but
  // with NO lower-bound inference: a pre-counter library holds no evidence
  // about which of its recordings ever reached their last second, and an
  // invented number would be a lie about the reader's own listening.
  // `songSaved` / `songRecent` (2026-09-24): song ids, newest first. Additive
  // to v1 like the counters: an older record simply has none.
  // `songKept` (2026-09-25, K1): the ids of the songs kept on this phone, newest
  // first. Only the LIST travels in the backup; the bytes live in the
  // offline-songs store, which no backup carries, so a restore offers them again.
  return { v: 1, saved: [], recent: [], rate: 1, plays: 0, completions: 0, songSaved: [], songRecent: [], songKept: [] };
}

/**
 * An imported or stored id list, reduced to valid song ids, deduplicated
 * (first — newest — occurrence wins) and bounded.
 * @param {unknown} value @param {number} maximum @returns {string[]}
 */
function _songIds(value, maximum) {
  if (!Array.isArray(value)) return [];
  // A Set, not out.indexOf: the kept list runs to thousands of ids, and a
  // linear search per id made this dedupe quadratic (sweep v019).
  /** @type {Set<string>} */
  const seen = new Set();
  for (const id of value) {
    if (isSongId(id)) seen.add(id);
    if (seen.size >= maximum) break;
  }
  return Array.from(seen);
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
    songSaved: _songIds(raw.songSaved, MAX_SAVED_SONGS),
    songRecent: _songIds(raw.songRecent, MAX_RECENT_SONGS),
    songKept: _songIds(raw.songKept, MAX_KEPT_SONGS),
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

/**
 * The normalized library the read accessors share (sweep v019). Rows ask
 * isSaved / isSongSaved once each, and a full normalize per ask made one
 * render cost rows x library. The view is rebuilt when the record behind it
 * is a different object or the store has bumped: every mutator writes through
 * _writeableData (a fresh object) and ends in _bump, and a rebase both swaps
 * the record and bumps. A queue replay suppresses _bump, so reads inside a
 * replay (or an overlay apply) are built fresh. Mutators read before their
 * _writeableData, never between it and their _bump. The view is never handed
 * out: the accessors return copies or primitives, and get() builds its own.
 *
 * @param {any} store
 * @returns {AudioLibraryData}
 */
function _readView(store) {
  const source = store._load();
  if (store._replaying || store._applyingPending) return normalizeAudioLibrary(source);
  const memo = store._view;
  if (memo && memo.source === source && memo.version === store._version) return memo.data;
  const data = normalizeAudioLibrary(source);
  store._view = { source, version: store._version, data };
  return data;
}

export const AudioLibraryStore = extendStore(
  CachedStore('vot-audio-library', /** @type {AudioLibraryData} */ (_empty()), { idb: true }),
  {
    /** _readView's memo: the record it normalized, at which _version, and the result.
     *  @type {{ source: unknown, version: number, data: AudioLibraryData } | null} */
    _view: null,

    /** A fresh normalized copy, the caller's to keep or change. @returns {AudioLibraryData} */
    get() {
      return normalizeAudioLibrary(this._load());
    },

    /** @returns {SavedAudioTrack[]} */
    saved() { return _readView(this).saved.map((track) => ({ ...track })); },

    /** @returns {RecentAudioTrack[]} */
    recent() { return _readView(this).recent.map((track) => ({ ...track })); },

    /** @returns {number} */
    getPlaybackRate() { return _readView(this).rate; },

    /** @param {unknown} track @returns {boolean} */
    isSaved(track) {
      const normalized = normalizeAudioTrack(track);
      const songId = normalized ? songIdOfKey(normalized.key) : '';
      if (songId) return this.isSongSaved(songId);   // a song's star is the songs shelf's
      return !!normalized && _readView(this).saved.some((item) => item.url === normalized.url);
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
      // A song saves to the SONGS shelf, by id: every star (the desk's, a row's)
      // stays right for songs, and the 100 recordings slots stay the readings'.
      const songId = songIdOfKey(normalized.key);
      if (songId) return this.toggleSongSaved(songId);
      // The flip is decided HERE, from the star the reader sees, and handed on
      // as a value (sweep v018). Before the library loads, that star reads the
      // empty overlay; a queued flip would replay onto the real library and
      // take an already-saved recording off. A queued set lands as tapped.
      return this.setSaved(normalized, !this.isSaved(normalized));
    },

    /**
     * Put a recording on the saved shelf (on: true) or take it off (on: false).
     * Idempotent, so it is what a tap queues while the store is still loading:
     * replayed onto the real library it sets the state the reader chose, and a
     * recording already saved keeps its row and its savedAt.
     *
     * @param {unknown} track
     * @param {boolean} on
     * @returns {boolean} whether it is saved after the call
     */
    setSaved(track, on) {
      const normalized = normalizeAudioTrack(track);
      if (!normalized) return false;
      const songId = songIdOfKey(normalized.key);
      if (songId) return this.setSongSaved(songId, on);
      const want = !!on;
      if (this._shouldDefer('setSaved', normalized, want)) return want;
      const data = _writeableData(this);
      const at = data.saved.findIndex((item) => item.url === normalized.url);
      if ((at >= 0) === want && !this._lastWriteFailed) return want;   // already so (W70: unless a write failed)
      if (want && at < 0) {
        data.saved.unshift({ ...normalized, savedAt: Date.now() });
        data.saved = data.saved.slice(0, MAX_SAVED_AUDIO_TRACKS);
      } else if (!want && at >= 0) {
        data.saved.splice(at, 1);
      }
      this._cache = data;
      this._save();
      this._bump();
      return want;
    },

    /** The saved shelf's cap, for the line that says a save pushed one off (utils/saved-shelf.js). */
    maxSaved: MAX_SAVED_AUDIO_TRACKS,

    /**
     * s09.3 (idea sweep 2026-10-22): the saved recording a save of `track` would push off the full shelf (the oldest),
     * or null: room left, already saved, or a song (songs keep their own shelf).
     *
     * @param {unknown} track
     * @returns {SavedAudioTrack | null}
     */
    wouldEvict(track) {
      const normalized = normalizeAudioTrack(track);
      if (!normalized || songIdOfKey(normalized.key)) return null;
      const saved = _readView(this).saved;
      if (saved.length < MAX_SAVED_AUDIO_TRACKS || saved.some((item) => item.url === normalized.url)) return null;
      return { ...saved[saved.length - 1] };
    },

    /**
     * Undo of a save that pushed `pushed` off the full shelf: `track` comes off again and `pushed` goes back last,
     * with its own savedAt.
     *
     * @param {unknown} track
     * @param {SavedAudioTrack} pushed
     * @returns {void}
     */
    undoEviction(track, pushed) {
      const normalized = normalizeAudioTrack(track);
      const back = normalizeAudioTrack(pushed);
      if (!normalized || !back) return;
      if (this._shouldDefer('undoEviction', track, pushed)) return;
      const data = _writeableData(this);
      data.saved = data.saved.filter((item) => item.url !== normalized.url);
      if (!data.saved.some((item) => item.url === back.url)) data.saved.push({ ...back, savedAt: Number(pushed.savedAt) || Date.now() });
      data.saved = data.saved.slice(0, MAX_SAVED_AUDIO_TRACKS);
      this._cache = data;
      this._save();
      this._bump();
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
      const songId = songIdOfKey(normalized.key);
      if (songId) { this.recordSongPlayed(songId); return; }   // songs have their own shelf
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
      if (this._shouldDefer('countPlay')) return _readView(this).plays;
      const data = _writeableData(this);
      data.plays = Math.min(MAX_LIFETIME_COUNT, data.plays + 1);
      this._cache = data;
      this._save();
      this._bump();
      return data.plays;
    },

    /** Lifetime recordings-played count (My Progress). @returns {number} */
    getPlays() { return _readView(this).plays; },

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
      if (this._shouldDefer('countCompletion')) return _readView(this).completions;
      const data = _writeableData(this);
      data.completions = Math.min(MAX_LIFETIME_COUNT, data.completions + 1);
      this._cache = data;
      this._save();
      this._bump();
      return data.completions;
    },

    /** Lifetime recordings-heard-to-the-end count. @returns {number} */
    getCompletions() { return _readView(this).completions; },

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

    /** Saved song ids, newest first. @returns {string[]} */
    songSaved() { return _readView(this).songSaved.slice(); },

    /** Recently played song ids, newest first. @returns {string[]} */
    songRecent() { return _readView(this).songRecent.slice(); },

    /** @param {unknown} id @returns {boolean} */
    isSongSaved(id) { return isSongId(id) && _readView(this).songSaved.indexOf(/** @type {string} */ (id)) >= 0; },

    /**
     * Save a song, or remove it if already saved. True when it is saved after.
     * @param {unknown} id
     * @returns {boolean}
     */
    toggleSongSaved(id) {
      if (!isSongId(id)) return false;
      // Decided from what the reader sees, handed on as a value (see toggleSaved, sweep v018).
      return this.setSongSaved(id, !this.isSongSaved(id));
    },

    /**
     * Save a song (on: true) or remove it (on: false). Idempotent, like
     * setSaved, so a tap queued before the library loads lands as tapped.
     * @param {unknown} id
     * @param {boolean} on
     * @returns {boolean} whether it is saved after the call
     */
    setSongSaved(id, on) {
      if (!isSongId(id)) return false;
      const songId = /** @type {string} */ (id);
      const want = !!on;
      if (this._shouldDefer('setSongSaved', songId, want)) return want;
      const data = _writeableData(this);
      const at = data.songSaved.indexOf(songId);
      if ((at >= 0) === want && !this._lastWriteFailed) return want;   // already so (W70: unless a write failed)
      if (want && at < 0) data.songSaved = [songId].concat(data.songSaved).slice(0, MAX_SAVED_SONGS);
      else if (!want && at >= 0) data.songSaved.splice(at, 1);
      this._cache = data;
      this._save();
      this._bump();
      return want;
    },

    /**
     * A song the listener put on goes to the top of the songs shelf. Like
     * recordPlayed it records a DECISION (the player calls it from its entry
     * points only), and it counts no lifetime play: songs are not readings.
     * @param {unknown} id
     * @returns {void}
     */
    recordSongPlayed(id) {
      if (!isSongId(id)) return;
      const songId = /** @type {string} */ (id);
      if (this._shouldDefer('recordSongPlayed', songId)) return;
      const data = _writeableData(this);
      data.songRecent = [songId].concat(data.songRecent.filter((x) => x !== songId)).slice(0, MAX_RECENT_SONGS);
      this._cache = data;
      this._save();
      this._bump();
    },

    /** @param {unknown} id @returns {boolean} true when a row was removed */
    removeSongRecent(id) {
      if (!isSongId(id)) return false;
      if (this._shouldDefer('removeSongRecent', id)) return true;
      const data = _writeableData(this);
      const remaining = data.songRecent.filter((x) => x !== id);
      if (remaining.length === data.songRecent.length) return false;
      data.songRecent = remaining;
      this._cache = data;
      this._save();
      this._bump();
      return true;
    },

    /** The songs kept on this phone, as the backup lists them (newest first). @returns {string[]} */
    songKept() { return _readView(this).songKept.slice(); },

    /**
     * Mark songs kept on this phone (on: true, newest first) or not (on: false). The list the
     * backup carries; song-keep.js writes it as the bytes land or leave.
     * @param {unknown[]} ids @param {boolean} on
     * @returns {void}
     */
    setSongsKept(ids, on) {
      const list = (Array.isArray(ids) ? ids : []).filter(isSongId).map(String);
      if (!list.length) return;
      if (this._shouldDefer('setSongsKept', list, on)) return;
      const data = _writeableData(this);
      const rest = data.songKept.filter((x) => list.indexOf(x) < 0);
      const next = on ? list.concat(rest).slice(0, MAX_KEPT_SONGS) : rest;
      if (next.length === data.songKept.length && next.every((x, i) => x === data.songKept[i])) return;
      data.songKept = next;
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
