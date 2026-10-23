// @ts-check
/* audio-player/seam — the web app's chapter seam on Android (rv4, 2026-10-15). In Chrome a page's recording plays in
   Chrome's own media session, and Chrome's media notification service is what holds Chrome in the foreground with the
   screen off. One <audio> leaves that session EMPTY from a recording's end to the next one's first sound: Chrome gives
   up audio focus and the service leaves the foreground at every seam (S22, MediaFocusControl + usagestats), and coming
   back is a background start Android allowed only inside a 10 s media allowance. Without the service, Chrome with the
   screen off is a sleeping app, and Android 15 cuts the network of those (network_blocked_for_top_sleeping_and_above):
   2.7 min into a screen-off run the next chapter's fetch failed 5 s after the service stopped
   (net::ERR_NAME_NOT_RESOLVED) and the player stopped on "Couldn't load this track". On Android 17 the same gap is the
   mute (no foreground service, digest A10). A silent recording that plays across the seam keeps the session: it starts in a recording's last
   seconds and stops once the next one plays (the S22 held focus through the seam with it, and dropped it without).
   Chrome on Android only: the APK plays natively (m3); an iPhone plays one sound at a time, so it would pause the
   reading; a desktop has no Doze. */

import { _native, _state } from './core.js';

/** Listening seconds before a recording's end that the bridge starts (timeupdate comes every ~250 ms). */
const LEAD_SEC = 2;
/** The silent recording's length: Chrome takes a sound under 5 s for a one-shot that cannot hold the session. */
const SILENCE_SEC = 8;
/** The bridge never outlives this; a next recording that takes longer has the stall watchdog's answer by then. */
const MAX_MS = 45000;

/** @type {HTMLAudioElement | null} */
let _keeper = null;
/** When the bridge went up (Date.now()); 0 while it is down. */
let _since = 0;
/** The track it went up in (a seek back out of its last seconds takes it down). */
let _from = /** @type {unknown} */ (null);
/** Down once the recording after the seam has played this far: Chrome has its player in the session by then (the
 *  S22 check let it go 0.5 s in). Not at 'playing', and not at 0: the src swap fires a timeupdate at 0 before a sound. */
const HELD_SEC = 0.5;

/** @returns {boolean} the installed web app (or a tab) in Chrome on Android */
function _wanted() {
  if (_native || typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (/** @type {any} */ (window).AndroidBridge) return false;
  return /Android/i.test(navigator.userAgent || '');
}

/** A silent 8-bit mono WAV at 8 kHz, as an object URL; null where a blob cannot be made. @returns {string | null} */
function _silenceUrl() {
  try {
    const rate = 8000;
    const n = SILENCE_SEC * rate;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const tag = (/** @type {number} */ at, /** @type {string} */ s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + n, true); tag(8, 'WAVE');
    tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    tag(36, 'data'); v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128);   // 8-bit PCM is unsigned: 128 is silence
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  } catch (_e) { return null; }
}

/** @param {HTMLAudioElement} el @returns {number} listening seconds left in its recording, Infinity while unknown */
function _left(el) {
  const d = Number(el.duration);
  if (!(d > 0) || !Number.isFinite(d)) return Infinity;
  return (d - (Number(el.currentTime) || 0)) / (Number(el.playbackRate) || 1);
}

/** The player's timeupdate: up in a playing recording's last seconds; down once the next one plays (or the same one
 *  again, repeat 'one'), or after a seek back out of them.
 *  @param {HTMLAudioElement} el */
export function _seamTick(el) {
  const track = _state.queue[_state.qi];
  if (_since) {
    if (!el.paused && (Number(el.currentTime) || 0) >= HELD_SEC && (track !== _from || _left(el) > LEAD_SEC + 1)) _seamStop();
    return;
  }
  // Nothing to bridge into: a sleep that ends with this recording, or a repeated passage (it goes round, ra2).
  if (_state.status !== 'playing' || _state.sleepAtTrackEnd || _state.loop) return;
  if (_state.sleepAtQueueEnd && _state.qi + 1 >= _state.queue.length) return;
  if (_left(el) > LEAD_SEC || !_wanted()) return;
  if (!_keeper) {
    const url = _silenceUrl();
    if (!url) return;
    // Never mounted, like the player's own element: the one-recording arbiter (document 'play') does not see it.
    const k = new Audio(url);
    k.loop = true;
    k.preload = 'auto';
    // Its own guard, for an end that reaches no hook below: down with the session, and never past MAX_MS.
    k.addEventListener('timeupdate', () => {
      if (!_since) return;
      if ((_state.status !== 'playing' && _state.status !== 'loading') || Date.now() - _since > MAX_MS) _seamStop();
    });
    _keeper = k;
  }
  _since = Date.now();
  _from = track;
  try {
    const p = _keeper.play();
    // Refused (no user activation yet): the seam is as it was before, no worse.
    if (p && typeof p.catch === 'function') p.catch(() => { _since = 0; });
  } catch (_e) { _since = 0; }
}

/** Down: a pause, a stop, a load error, the next recording playing. */
export function _seamStop() {
  _since = 0;
  _from = null;
  if (_keeper && !_keeper.paused) {
    try { _keeper.pause(); } catch (_e) { /* already detached */ }
  }
}
