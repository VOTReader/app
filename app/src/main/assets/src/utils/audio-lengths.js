// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   audio-lengths — bytes and seconds of every shipped recording
   ═══════════════════════════════════════════════════════════════════════
   Downloads brief 2026-10-23, 3d, and player brief U04.1 ("lengths in the
   manifest"): sizes were looked up one HEAD at a time (929 for one Bible
   edition; the phone app through GitHub's API at 60 calls an hour), so
   whole-set totals came back partial or hidden, and nothing knew how long a
   recording runs until it loaded. tools/gen-audio-lengths.py bakes both for
   every recording on the trusted release tags into src/data/audio-lengths.js
   (AUDIO_LENGTHS: "<asset>" -> [bytes, seconds]), a lazy file: the first ask
   fetches it (sync-loaders.js) and answers null until it lands; a screen that
   shows lengths subscribes to lengthsStore to paint when it does.
   ═══════════════════════════════════════════════════════════════════════ */

import { loadAudioLengths, audioLengthsStore, audioLengthsSettled } from './sync-loaders.js';

/** @returns {Record<string, [number, number]> | null} the baked table, null until it lands */
function _table() {
  const t = /** @type {any} */ (globalThis).AUDIO_LENGTHS;
  return t && typeof t === 'object' ? t : null;
}

/** The asset a track URL names (its file name without .mp3), or ''. @param {unknown} url */
function _asset(url) {
  if (typeof url !== 'string') return '';
  const tail = url.slice(url.lastIndexOf('/') + 1);
  return tail.slice(-4).toLowerCase() === '.mp3' ? tail.slice(0, -4) : '';
}

/**
 * Bytes and seconds of a recording, or null (not a shipped recording, or the table has not landed: the ask fetches it).
 * @param {unknown} url @returns {{ bytes: number, seconds: number } | null}
 */
export function lengthOf(url) {
  const t = _table();
  if (!t) { void loadAudioLengths(); return null; }
  const a = _asset(url);
  const row = a && Object.prototype.hasOwnProperty.call(t, a) ? t[a] : null;
  return Array.isArray(row) && row[0] > 0 ? { bytes: row[0], seconds: row[1] } : null;
}

/** @param {unknown} url @returns {number | null} */
export const bytesOf = (url) => { const l = lengthOf(url); return l ? l.bytes : null; };

/** @param {unknown} url @returns {number | null} */
export const secondsOf = (url) => { const l = lengthOf(url); return l ? l.seconds : null; };

/** The table has landed (or this page has none to fetch). @returns {boolean} */
export const lengthsLoaded = () => !!_table();

/** Nothing more will land: the table is here, failed, or this page cannot fetch it. @returns {boolean} */
export const lengthsSettled = () => !!_table() || audioLengthsSettled();

/** Settles once the table has landed or failed to (never rejects). @returns {Promise<void>} */
export const lengthsReady = () => loadAudioLengths();

/** useSyncExternalStore contract: bumps when the table lands. */
export const lengthsStore = audioLengthsStore;

/** The lazy screens' view of this module (the AudioLengths global, _entry-d.js). */
export const AudioLengths = { lengthOf, bytesOf, secondsOf, lengthsLoaded, lengthsSettled, lengthsReady, lengthsStore };
