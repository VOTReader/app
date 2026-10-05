// @ts-check
/* audio-player/offline — no signal (listening item 8): what can play offline, and what the player says
   when nothing can. */

import { showToast, hideToast } from '../toast.js';
import { OfflineAudio } from '../offline-audio.js';
import { SongKeep } from '../song-keep.js';
import { songIdOfKey } from '../audio-track.js';
import { bibleChapterOfTrack, renditionsFor, _volKeyOf } from './catalog.js';
import { NetStatus } from '../net-status.js';
import {
  _isSong,
  _native,
  _el,
  _offline,
  OFFLINE_MSG,
  _toast,
} from './core.js';

/** @typedef {import('../audio-player.js').Track} Track */
/** @typedef {import('../audio-player.js').Rendition} Rendition */

/**
 * Offline, and this recording is not downloaded to the phone, so it cannot load (listening item 8: the Android app
 * answers a downloaded one from disk; on the web nothing is ever downloaded).
 * @param {Track | null | undefined} track
 * @returns {boolean}
 */
export function _unreachable(track) {
  return _offline() && !(track && typeof track.url === 'string' && (OfflineAudio.isSaved(track.url) || _songKept(track)));
}

/**
 * A song kept on this phone (K1): on the web its bytes are in the offline-songs store and play from an object URL; in
 * the phone app they are native's file under the song's own URL (OfflineAudio.isSaved already answers for those).
 * @param {Track | null | undefined} track @returns {boolean}
 */
export function _songKept(track) {
  return !!track && _isSong(track) && SongKeep.isKept(songIdOfKey(track.key));
}

/**
 * What the element loads for `track`: a kept song's object URL on the web (one alive at a time, revoked when the
 * track moves on), a recording saved in this browser from the service worker's copy (cf1), else the track's own
 * URL. Native reads a kept song's or a downloaded recording's file under its URL, so it always gets that.
 * @param {Track} track @returns {string}
 */
export function _srcFor(track) {
  if (_native) return track.url;
  if (!_isSong(track)) return OfflineAudio.webSrc(track.url, _el && !_el.error ? _el.src : '');
  return SongKeep.objectUrlFor(songIdOfKey(track.key)) || track.url;
}

/**
 * The element, unfailed, holds `track` in its other web form (streamed, or the saved copy): a resume that swaps
 * the one for the other when the signal changed carries on from where it was, not from 0:00 (cf1).
 * @param {Track} track @returns {boolean}
 */
export function _holdsOtherForm(track) {
  return !_native && !!_el && !_el.error && OfflineAudio.webSameRecording(track.url, _el.src);
}

/**
 * Offline, and nothing in `queue` is on the phone: the whole request is refused BEFORE any state changes, which is
 * what the old blanket offline guards did (a queue with something downloaded plays that, from where it starts).
 * @param {Array<{ url?: string }>} queue
 * @returns {boolean}
 */
export function _offlineRefuses(queue) {
  return _offline() && !queue.some((t) => !_unreachable(/** @type {any} */ (t)) || !!_downloadedReading(/** @type {any} */ (t)));
}

/**
 * Offline, the reading of `track`'s letter that IS on the phone when the queue holds another one (a listener with a
 * chosen reader downloads that reading; a Play all queues the primary for every letter after the first), or null.
 * @param {Track | null | undefined} track
 * @returns {Rendition | null}
 */
export function _downloadedReading(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const volKey = _volKeyOf(key);
  if (!volKey) return null;
  // The letter's title rides along: every reading of a letter carries its title (the swapped-in one read
  // 'Untitled recording' on the bar and in the snapshot, the refutation of 2026-09-24, N7).
  const item = { id: key.slice(volKey.length + 1), title: (track && track.title) || '' };
  const all = renditionsFor(volKey, item, track ? track.sub : null);
  return all.find((r) => r.tracks.length > 0 && r.tracks.every((t) => !_unreachable(t))) || null;
}

/**
 * Can a Listen for this unit make sound right now? Online, yes. Offline (NetStatus: navigator.onLine or a request
 * that just failed), only when some recording of it is on the phone, the rule _offlineRefuses applies to the queue
 * the Listen would build. A Bible chapter (`chapterNum`) asks only for that chapter's recording. The hero Listen
 * pills disable on false (Corbin 2026-10-05: "Disable certain features when offline"). The player itself keeps
 * navigator.onLine (_offline): a tap that does reach it is the next probe, and its 'playing' clears a failure.
 * @param {string} volKey
 * @param {string} id the letter, entry or Bible book
 * @param {number} [chapterNum]
 * @returns {boolean}
 */
export function playableNow(volKey, id, chapterNum) {
  if (!NetStatus.isOffline()) return true;
  return renditionsFor(volKey, { id }, null).some((r) => {
    const tracks = chapterNum ? r.tracks.filter((t) => bibleChapterOfTrack(t) === chapterNum) : r.tracks;
    return tracks.some((t) => typeof t.url === 'string' && (OfflineAudio.isSaved(t.url) || _songKept(t)));
  });
}

/** The toast a song not kept on this phone raises offline (W2-02); its own id, so its class and button stay its own. */
export const SONG_OFFLINE_TOAST_ID = 'vot-toast-song-offline';

/**
 * Offline and refused: a song says it is not on this phone and links to the kept songs (they play); a reading
 * keeps the readings' notice. Static words only in the markup (showToast's html is for trusted markup).
 * @param {Track | { key?: string } | null | undefined} track
 */
export function _offlineNotice(track) {
  if (!_isSong(/** @type {any} */ (track))) { _toast(OFFLINE_MSG); return; }
  showToast({
    id: SONG_OFFLINE_TOAST_ID, className: 'vot-toast vot-toast-action', durationMs: 6000, ariaLive: 'assertive',
    html: 'This song isn’t on this phone. Songs you keep play without internet. <button type="button" class="vot-escape-btn">Kept songs ›</button>',
  });
  const el = typeof document !== 'undefined' ? document.getElementById(SONG_OFFLINE_TOAST_ID) : null;
  const btn = el && el.querySelector('button');
  if (btn) {
    btn.onclick = () => {
      hideToast(SONG_OFFLINE_TOAST_ID);
      const open = typeof window !== 'undefined' ? /** @type {any} */ (window).__openSongs : null;
      if (typeof open === 'function') open([{ k: 'list', v: 'kept' }], '');
    };
  }
}
