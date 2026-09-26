// @ts-check
/* audio-player/sleep — the sleep timer: the countdown, "when this recording ends", and the fade into
   both. Session-only by design. */

import {
  _el,
  late,
  _notify,
  _state,
  _toast,
} from './core.js';

/** Sleep timer — intentionally session-only: a closed app must never wake just to pause audio. */
let _sleepTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/** Disarms BOTH sleep modes — the countdown and the end-of-track flag are one
 *  user-facing setting with one Clear.
 *  @returns {void} */
export function _clearSleepTimer(notify = true) {
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  if (_state.sleepEndsAt || _state.sleepAtTrackEnd) {
    _state.sleepEndsAt = 0;
    _state.sleepMinutes = 0;
    _state.sleepAtTrackEnd = false;
    if (notify) _notify();
  }
  _syncSleepVolume();   // a fade in progress ends with the timer: full voice again
}

/* ── THE SLEEP FADE (2026-09-22) ──────────────────────────────────────────
   Both sleep modes used to cut the voice off mid-word with a bare pause(), at
   bedtime — the one moment a listener most wants nothing sudden. The last
   SLEEP_FADE_S seconds now ramp the element's volume down, the pause lands
   exactly when it always did, and the volume returns to 1 once the mode is
   over. The wanted volume is a pure function of the state, re-applied on every
   timeupdate and wherever a sleep mode ends, so no single missed path can
   leave the player quiet. The countdown's remaining time is the clock's;
   "end of track" uses the recording's own remaining time at the playing rate. */

/** Seconds of wall time over which a sleep mode fades the voice to silence. */
const SLEEP_FADE_S = 20;

/**
 * The volume a sleep fade wants now: 1 unless a sleep mode is armed and inside
 * its last SLEEP_FADE_S seconds; then linear in the time left.
 * @returns {number}
 */
function _sleepFadeVolume() {
  let left = Infinity;
  if (_state.sleepEndsAt) {
    left = (_state.sleepEndsAt - Date.now()) / 1000;
  } else if (_state.sleepAtTrackEnd) {
    const d = Number(_state.duration) || 0;
    if (d > 0) left = Math.max(0, d - (Number(_state.time) || 0)) / (Number(_state.rate) || 1);
  }
  if (!(left < SLEEP_FADE_S)) return 1;
  return Math.max(0, Math.min(1, left / SLEEP_FADE_S));
}

/** Put the element at the volume the sleep state wants (no write when it already is). @returns {void} */
export function _syncSleepVolume() {
  if (!_el) return;
  const want = _sleepFadeVolume();
  try {
    const now = typeof _el.volume === 'number' ? _el.volume : 1;
    if (Math.abs(now - want) > 0.001) _el.volume = want;
  } catch (_e) { /* a host without a settable volume keeps the old hard stop */ }
}

/**
 * End-of-track sleep firing. Deliberately identical to the countdown timer's
 * expiry — pause, never stop, so the queue and the resume snapshot survive —
 * and one-shot: the flag clears itself, so the NEXT track boundary advances
 * normally without the listener having to disarm anything.
 *
 * @returns {void}
 */
export function _sleepAtTrackEndFire() {
  _state.sleepAtTrackEnd = false;
  const wasLive = _state.status === 'playing' || _state.status === 'loading';
  if (wasLive && _el) { try { _el.pause(); } catch (_e) { /* already detached */ } }
  late._markPaused();
  _syncSleepVolume();   // paused at the bottom of the fade; the next Play is at full voice
  if (!wasLive) _notify();
  if (wasLive) _toast('Sleep timer ended. Playback paused.');
}

/**
 * @returns {number} seconds remaining, rounded down; 0 means unarmed/expired.
 */
export function getSleepRemainingSeconds() {
  return _state.sleepEndsAt ? Math.max(0, Math.floor((_state.sleepEndsAt - Date.now()) / 1000)) : 0;
}

/**
 * Arm a session-only timer that pauses—never stops—audio. Pausing preserves
 * the normal resume snapshot, which is kinder than silently discarding a
 * long recording's position at bedtime.
 *
 * @param {number} minutes
 * @returns {boolean}
 */
/**
 * The countdown's end: pause (never stop, so the queue and the resume point survive) at the bottom of the fade.
 * The timeout calls it, and so does the clock when the timeout is overdue: a hidden page's timers may run late, and
 * under the native player (m3) the page is silent, so a late timeout would leave the listener in faded silence while
 * the recording, and the resume point, ran on (native's 1 Hz ticks keep the clock running with the screen off).
 * @returns {void}
 */
export function _sleepTimerFire() {
  if (_sleepTimer) { clearTimeout(_sleepTimer); }
  _sleepTimer = null;
  _state.sleepEndsAt = 0;
  _state.sleepMinutes = 0;
  const wasLive = _state.status === 'playing' || _state.status === 'loading';
  // Even when the bar says paused: a phone call holds native silent while it still means to play on (s2r S3).
  if (_el) _el.pause();
  late._markPaused();
  _syncSleepVolume();   // paused at the bottom of the fade; the next Play is at full voice
  if (!wasLive) _notify();
  if (wasLive) _toast('Sleep timer ended. Playback paused.');
}

export function setSleepTimer(minutes) {
  const mins = Math.max(1, Math.min(120, Math.floor(Number(minutes) || 0)));
  if (_state.status === 'idle' || !_state.queue.length) return false;
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  _state.sleepAtTrackEnd = false;   // one sleep arming at a time
  _state.sleepEndsAt = Date.now() + mins * 60000;
  // The PRESET, kept beside the deadline: the desk shows which chip is armed,
  // and the remaining seconds cannot answer that (a 30-minute timer with 15
  // minutes left is not the 15-minute chip).
  _state.sleepMinutes = mins;
  _sleepTimer = setTimeout(_sleepTimerFire, mins * 60000);
  _syncSleepVolume();     // a re-arm in the middle of a fade: full voice until the new last stretch
  _notify();
  return true;
}

/**
 * Arm the fourth sleep option: stop when the CURRENT recording ends. Session-
 * only like the countdown, and deliberately NOT clock math — the remaining
 * time is unknowable while the playback rate can change and the stream can
 * stall, so the flag is read by the 'ended' event instead. Replaces any armed
 * countdown; survives pause/resume because it holds no deadline at all.
 *
 * @returns {boolean}
 */
export function setSleepAtTrackEnd() {
  if (_state.status === 'idle' || !_state.queue.length) return false;
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  _state.sleepEndsAt = 0;
  _state.sleepMinutes = 0;
  _state.sleepAtTrackEnd = true;
  _syncSleepVolume();
  _notify();
  return true;
}

/** Disarms both sleep modes. @returns {void} */
export function clearSleepTimer() { _clearSleepTimer(); }
