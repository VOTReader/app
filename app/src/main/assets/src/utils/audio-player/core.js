// @ts-check
/* audio-player/core — what every part of the player shares: the ONE state object, its subscribers
   and version (the store contract), the handles every module reads (the element, which engine, the
   source descriptor, the pending restore, the reading speed), the lazy corpus globals read at call time,
   the words the player says, and `late`, the table of verbs called up the module order. Nothing here
   plays anything. The public face is utils/audio-player.js (AudioPlayer). */

import { showToast } from '../toast.js';
import {
  audioAssetUrl,
  bibleAudioAssetUrl,
  bibleReleaseTagFor,
  isSongKey,
  isSongUrl,
  normalizeAudioRate,
} from '../audio-track.js';

/** @typedef {import('../audio-player.js').Track} Track */
/** @typedef {import('../audio-player.js').AudioPlayerState} AudioPlayerState */

/** Shared DOM id so every audio message replaces the previous one. */
export const AUDIO_TOAST_ID = 'vot-toast-audio';

export const OFFLINE_MSG = 'Playing audio requires an internet connection.';
export const LOAD_FAIL_MSG = 'Couldn’t load this track.';

/**
 * Stream URL for a track. The manifest stores Google Drive file ids, but the
 * app does NOT stream from Drive: drive.usercontent.google.com returns 403 to
 * any request whose Sec-Fetch-Site is `cross-site` (hard anti-hotlinking —
 * verified identically from desktop Chrome, headless, and the on-device
 * WebView; plain curl passes only because it sends no sec-fetch headers).
 * The tracks are mirrored to a GitHub release (tools/mirror-audio-release.py,
 * same host family as the Garden images) with each asset named
 * `<driveFileId>.mp3` and an explicit audio/mpeg content type (the release
 * CDN sends `X-Content-Type-Options: nosniff`, under which Chromium media
 * elements refuse application/octet-stream). Verified: HTTP 206 range
 * support, cross-site sec-fetch allowed.
 *
 * @param {string} id - Google Drive file id (doubles as the release asset name)
 * @returns {string}
 */
export function trackUrl(id) {
  return audioAssetUrl(id);
}

/** @type {HTMLAudioElement | null} */
export let _el = null;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _el} v */
export function _setEl(v) { _el = v; }
/** True once _ensureEl chose the native stand-in (native-audio.js, m3). */
export let _native = false;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _native} v */
export function _setNative(v) { _native = v; }
/** @type {Set<() => void>} */
const _listeners = new Set();
let _version = 0;
/** @type {AudioPlayerState} */
export const _state = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false, restoring: false, sourceMode: /** @type {'letter'|'collection'|'section'|'custom'|'songs'|''} */ (''), shuffle: false, repeat: /** @type {'off'|'one'|'all'} */ ('off'), loop: null };
/** The READING speed — the listener's chosen rate for letters and chapters.
 *  `_state.rate` is the EFFECTIVE rate of what is playing, which is 1 for a
 *  song: the reader's 1.5× must not warp music (W3-05), and it must come back
 *  unchanged on the next reading. */
export let _readingRate = 1;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _readingRate} v */
export function _setReadingRate(v) { _readingRate = v; }
export const _g = () => /** @type {any} */ (globalThis);
/** AudioLibraryStore lives in bundle-b; resolve it at call time to avoid a second bundled singleton. */
export const _library = () => _g().AudioLibraryStore || null;
/** AudioPositionsStore is the same bundle and the same rule — the per-recording
 *  resume map is reached by runtime bridge, never imported from bundle-d. */
export const _positions = () => _g().AudioPositionsStore || null;
/** @returns {Record<string, Array<any[]>> | null} */
export const _manifest = () => _g().AUDIO_MANIFEST || null;
/** @returns {Record<string, Array<any[]>> | null} */
export const _sections = () => _g().AUDIO_SECTIONS || null;
/** Cross-reader alternate renditions, ordered by reader rank. Same lazy
 *  corpus + same call-time read as the manifest above. Only the ~42 letters
 *  with a genuine second reading appear.
 *  @returns {Record<string, Array<any[]>> | null} */
export const _alternates = () => _g().AUDIO_ALTERNATES || null;
/** Bible-edition manifest — rides bundle-a (critical path), so it exists from boot. */
export const _bibleManifest = () => _g().BIBLE_AUDIO_MANIFEST || null;
/** 'bible-*' volKeys stream a recorded Bible edition — per-chapter tracks off
 *  that edition's own OT/NT release tags (the retired whole-book tracks on
 *  audio-bible-v1 resolve through the same routing). */
export const _isBibleVol = (volKey) => typeof volKey === 'string' && volKey.lastIndexOf('bible-', 0) === 0;
/** A Songs of the Letters track (`song:<id>`, or anything streaming a song
 *  URL). Songs are not readings: they earn no read credit, no lifetime counts,
 *  no resume point, and play at 1×. */
export const _isSong = (track) => !!track && (isSongKey(track.key) || isSongUrl(track.url));
/** The manifest a volKey's entries live in. */
export const _mapFor = (volKey) => (_isBibleVol(volKey) ? _bibleManifest() : _manifest());
/** Release-aware asset → stream URL for a volKey's tracks. */
// The edition's declared release tag travels with every Bible asset URL this
// module builds. ONE place resolves it, so a URL built here and a URL
// compared against a saved track cannot route differently.
export const _assetUrlFor = (volKey, id) => (_isBibleVol(volKey)
  ? bibleAudioAssetUrl(id, bibleReleaseTagFor(volKey))
  : trackUrl(id));

export function _notify() {
  _version++;
  _syncNativeUpcoming();
  for (const cb of _listeners) {
    try { cb(); } catch (e) { console.warn('[audio] subscriber threw', e); }
  }
}

/** @returns {boolean} */
export function _offline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** @param {string} text */
export function _toast(text) {
  showToast({ id: AUDIO_TOAST_ID, className: 'vot-toast', text, ariaLive: 'assertive' });
}

/** Keep native's next recording in step with the queue and its modes (cheap: one short JSON compare). */
function _syncNativeUpcoming() {
  if (_native && _el) /** @type {any} */ (_el).syncUpcoming();
}
/** How the current queue was built — replayed to rebuild it after a boot.
 * `custom` persists a user-edited queue rather than rebuilding corpus order.
 * `startKey`/`startIndex` record the queue's forward-only horizon (where the
 * listener chose to begin), so a rebuilt queue never regrows the tracks that
 * were deliberately left behind it. `startReader` records the voice chosen for
 * the start letter, so the rebuild resumes on that rendition and not the
 * manifest's primary one.
 *
 * `startPartIndex` is the same promise ONE LEVEL DOWN, and it used to stop at
 * the boundary of this object: a multi-part letter shares one key across its
 * parts, so `startKey` alone rebuilds at part 1 however far in the listener
 * actually began. Recorded here, written by _persist and replayed by the boot
 * rebuild through the same slice playCollection uses.
 *
 * A SONGS queue (`mode: 'songs'`) is described, never listed: a `filter` plus a
 * `seed` (shuffle) or an explicit `ids` list, and `startKey`. A 900-song shuffle
 * is a few dozen bytes here, where a `custom` queue would re-serialize 900
 * tracks into IDB every second. song-catalog.js's songQueue() turns it back
 * into the same queue.
 * @type {{ mode: 'letter'|'collection'|'section'|'custom'|'songs', volKey: string, label: string|null, startKey?: string|null, startIndex?: number|null, startReader?: string|null, startPartIndex?: number|null, filter?: any, one?: boolean, seed?: number, shuffle?: boolean, ids?: string[] | null, wrap?: boolean, swaps?: Record<string, string> | null } | null} */
export let _source = null;
/** Descriptor waiting for its queue rebuild (set only by _restoreFromSaved). */
export let _pendingRestore = /** @type {any} */ (null);
/* Both descriptors above are module-private, but the listening desk has to
   DESCRIBE the queue they define — "1 recording" and a Restart-labelled prev
   are lies while a restore placeholder stands in for an unknown queue, and a
   voice switch must warn before discarding a queue the listener edited. Each
   gets one writer that mirrors the fact the desk needs into public state, so
   the mirror cannot drift from the descriptor. */

/** @param {typeof _source} next @returns {void} */
export function _setSource(next) {
  _source = next;
  _state.sourceMode = next ? next.mode : '';
  // Shuffle is a fact about the songs descriptor; repeat is a songs-session
  // setting that no other queue may inherit (a letter must never loop).
  _state.shuffle = !!(next && next.mode === 'songs' && next.shuffle);
  if (!next || next.mode !== 'songs') _state.repeat = 'off';
}

/** @param {any} next @returns {void} */
export function _setPendingRestore(next) {
  _pendingRestore = next || null;
  _state.restoring = !!_pendingRestore;
}
/* A paused restore puts the desk up before any track loads, and _load is where
   the rate is pulled from the library — so the readout said 1× over a store
   holding 1.37 (item 5 look, 2026-09-21; ra3). While the restore is pending the
   player follows the store instead: bundle-b hydrates IDB after this module
   evaluates, so the pull repeats on each store notify. Once a track is live
   the store is written BY the player and never drives it from behind. */
let _libraryWatched = false;
export function _followLibraryRate() {
  const pull = () => {
    if (!_pendingRestore) return;
    const library = _library();
    if (!library || typeof library.getPlaybackRate !== 'function') return;
    _readingRate = normalizeAudioRate(library.getPlaybackRate());
    const next = isSongKey(_pendingRestore.key) ? 1 : _readingRate;   // a restored song still plays at 1×
    if (next !== _state.rate) { _state.rate = next; _notify(); }
  };
  pull();
  if (_libraryWatched) return;
  const library = _library();
  if (library && typeof library.subscribe === 'function') { _libraryWatched = true; library.subscribe(pull); }
}

/* ── store contract ───────────────────────────────────────────────────── */

/**
 * @param {() => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribe(callback) {
  if (_pendingRestore && !_libraryWatched) _followLibraryRate();   // ra3: the store may not exist at module eval
  _listeners.add(callback);
  return () => { _listeners.delete(callback); };
}

/**
 * Monotonic version counter — the useSyncExternalStore snapshot.
 *
 * @returns {number}
 */
export function getVersion() { return _version; }

/**
 * The LIVE state object (not a copy — a per-call clone would allocate on every
 * timeupdate). Callers MUST treat it, and the Track objects inside `queue`, as
 * READ-ONLY; mutating them corrupts the store without bumping the version.
 *
 * @returns {AudioPlayerState}
 */
export function getState() { return _state; }


/* ── the late-bound verbs (the split, 2026-09-26) ─────────────────────────
   The player is mutually recursive: a recording's end calls next(), next()
   starts a recording, a start that cannot play stops. smoke-lite forbids
   import cycles, so the modules are ordered (core, catalog, offline, prefetch,
   sections, credit, persist, sleep, loop, media-session, engine, songs,
   queue, restore, transport) and a module calls a function of one ABOVE it
   through this table, which that module fills when it loads. Every module
   has loaded before anything plays (utils/audio-player.js imports them all
   ahead of its boot), so no call can find the table empty. */
/** @type {Record<string, any>} */
export const late = {};
