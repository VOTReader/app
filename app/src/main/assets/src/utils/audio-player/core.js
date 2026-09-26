// @ts-check
/* audio-player/core — what every part of the player shares: the ONE state object, its subscribers
   and version (the store contract), the lazy corpus globals read at call time, and the words the
   player says. Nothing here plays anything. The public face is utils/audio-player.js (AudioPlayer). */

import { showToast } from '../toast.js';
import {
  audioAssetUrl,
  bibleAudioAssetUrl,
  bibleReleaseTagFor,
  isSongKey,
  isSongUrl,
} from '../audio-track.js';
import { _syncNativeUpcoming } from './engine.js';
import { _followLibraryRate, _libraryWatched, _pendingRestore } from './persist.js';

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

/** @type {Set<() => void>} */
const _listeners = new Set();
let _version = 0;
/** @type {AudioPlayerState} */
export const _state = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false, restoring: false, sourceMode: /** @type {'letter'|'collection'|'section'|'custom'|'songs'|''} */ (''), shuffle: false, repeat: /** @type {'off'|'one'|'all'} */ ('off'), loop: null };
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
