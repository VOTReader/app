// @ts-check
/* audio-player/sleep — the sleep timer: the countdown, "when this recording ends", and the fade into
   both. Session-only by design. */

import {
  _el,
  late,
  _notify,
  _state,
  _toast,
  _toastAction,
} from './core.js';

/** Sleep timer — intentionally session-only: a closed app must never wake just to pause audio. */
let _sleepTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/** Disarms BOTH sleep modes — the countdown and the end-of-track flag are one
 *  user-facing setting with one Clear.
 *  @returns {void} */
export function _clearSleepTimer(notify = true) {
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  _sleepEndedAt = 0;   // a Clear or a stop: no quiet re-arm on the next Play
  _sleepToastOwed = false;
  const heldRun = _state.sleepAtQueueEnd;
  if (_state.sleepEndsAt || _state.sleepAtTrackEnd || _state.sleepAtQueueEnd) {
    _state.sleepEndsAt = 0;
    _state.sleepMinutes = 0;
    _state.sleepAtTrackEnd = false;
    _state.sleepAtQueueEnd = false;
    _letGoOfHeldRun(heldRun);
    if (notify) _notify();
  }
  _syncSleepVolume();   // a fade in progress ends with the timer: full voice again
}

/**
 * "End of the queue" held the run back from the site order (queue.js _extendQueue asks). Whatever disarms it on the
 * last recording lets go, so the run joins the order again: Clear, another sleep mode (a countdown chosen there used
 * to end the whole session when that recording ended, its minutes unused), and the queue-end sleep's own firing (the
 * next Play goes on into the next collection). Call it AFTER the flag is cleared.
 * @param {boolean} wasHeld sleepAtQueueEnd before it was cleared
 * @returns {void}
 */
function _letGoOfHeldRun(wasHeld) {
  if (wasHeld && !_state.sleepAtQueueEnd && _state.qi + 1 >= _state.queue.length) late._extendQueue();
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
  } else if (_sleepsAtThisEnd()) {
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
  const heldRun = _state.sleepAtQueueEnd;
  _state.sleepAtTrackEnd = false;
  _state.sleepAtQueueEnd = false;
  _letGoOfHeldRun(heldRun);
  const wasLive = _state.status === 'playing' || _state.status === 'loading';
  if (wasLive && _el) { try { _el.pause(); } catch (_e) { /* already detached */ } }
  late._markPaused();
  _syncSleepVolume();   // paused at the bottom of the fade; the next Play is at full voice
  if (!wasLive) _notify();
  if (wasLive) _sleepEndedToast();
}

/* ── AFTER A SLEEP END (audio-1, audit 2026-11-23) ─────────────────────────
   The end usually comes with the screen off. The "+15 min" offer used to be raised then, so its 8 s ran out unseen,
   and a Play from the lock screen or a headset then ran uncapped all night. Two rules: the offer waits until the
   page is visible again (and is shown only if playback is still paused), and a Play within SLEEP_REARM_MS of the
   end arms another SLEEP_REARM_MIN minutes by itself, once. A Clear, a stop or any sleep mode chosen in between
   cancels both. The stop itself is never late (the clock backstop above). */

/** How long after a sleep end a Play still counts as "a few more minutes, then sleep". */
export const SLEEP_REARM_MS = 10 * 60000;
/** What such a Play arms: the toast's own quarter hour. */
const SLEEP_REARM_MIN = 15;
/** When the last sleep end paused live playback (0: none pending). */
let _sleepEndedAt = 0;
/** The end came while hidden: the offer is shown on the return. */
let _sleepToastOwed = false;
/** When the offer was last put on screen: a Play while it is still up leaves it there (its button adds the same 15). */
let _offerShownAt = 0;
/** core.js _toastAction's duration. */
const OFFER_SHOWN_MS = 8000;

/** @returns {boolean} true while the page is hidden (the screen off, another app in front). */
function _pageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Every sleep end says so, with one tap to play on for another quarter hour (brief 3b, pl-l2). Hidden, it waits. */
function _sleepEndedToast() {
  _sleepEndedAt = Date.now();
  if (_pageHidden()) { _sleepToastOwed = true; return; }
  _sleepToastOwed = false;
  _showSleepEnded();
}

/** Back on screen (audio-player.js visibilitychange): raise the offer the hidden end held back, if still paused. */
export function _sleepOnVisible() {
  if (!_sleepToastOwed) return;
  _sleepToastOwed = false;
  if (_state.status === 'paused') _showSleepEnded();
}

/**
 * Playback started (engine.js _setStatus 'playing'). Within SLEEP_REARM_MS of a sleep end that left nothing armed,
 * arm another SLEEP_REARM_MIN minutes, once, so a lock-screen Play at bedtime does not run all night.
 * @returns {void}
 */
export function _sleepOnPlay() {
  const at = _sleepEndedAt;
  if (!at) return;
  _sleepEndedAt = 0;
  _sleepToastOwed = false;   // playing again: the paused offer is moot
  if (Date.now() - at > SLEEP_REARM_MS) return;
  if (_state.sleepEndsAt || _state.sleepAtTrackEnd || _state.sleepAtQueueEnd) return;
  if (!setSleepTimer(SLEEP_REARM_MIN)) return;
  if (!_pageHidden() && Date.now() - _offerShownAt > OFFER_SHOWN_MS) _toast('Sleep timer on again: ' + SLEEP_REARM_MIN + ' more minutes.');
}

/** The offer itself. @returns {void} */
function _showSleepEnded() {
  _offerShownAt = Date.now();
  _toastAction('Sleep timer ended. Playback paused.', 'Keep listening +15 min', () => {
    // Play only if still paused: the toast stays up 8 s, and a listener who already pressed Play (the bar, a headset)
    // must not be paused by a tap that says "keep listening".
    if (_state.status === 'paused') late.toggle();
    setSleepTimer(15);
  });
}

/** Is the playing recording the last the armed "End of the queue" lets play? @returns {boolean} */
export function _sleepsAtThisEnd() {
  return _state.sleepAtTrackEnd || (_state.sleepAtQueueEnd && _state.qi + 1 >= _state.queue.length);
}

/**
 * @returns {number} seconds remaining, rounded down; 0 means unarmed/expired.
 */
export function getSleepRemainingSeconds() {
  return _state.sleepEndsAt ? Math.max(0, Math.floor((_state.sleepEndsAt - Date.now()) / 1000)) : 0;
}

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
  if (wasLive) _sleepEndedToast();
}

/**
 * Arm a session-only timer that pauses—never stops—audio. Pausing preserves
 * the normal resume snapshot, which is kinder than silently discarding a
 * long recording's position at bedtime.
 *
 * @param {number} minutes
 * @returns {boolean}
 */
export function setSleepTimer(minutes) {
  const mins = Math.max(1, Math.min(120, Math.floor(Number(minutes) || 0)));
  if (_state.status === 'idle' || !_state.queue.length) return false;
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  _sleepEndedAt = 0;   // a mode chosen by hand replaces the quiet re-arm
  const heldRun = _state.sleepAtQueueEnd;
  _state.sleepAtTrackEnd = false;   // one sleep arming at a time
  _state.sleepAtQueueEnd = false;
  _letGoOfHeldRun(heldRun);
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
  _sleepEndedAt = 0;
  const heldRun = _state.sleepAtQueueEnd;
  _state.sleepAtTrackEnd = true;
  _state.sleepAtQueueEnd = false;
  _letGoOfHeldRun(heldRun);
  _syncSleepVolume();
  _notify();
  return true;
}

/**
 * The sleep sheet's "End of the queue" (brief 3b): play out what is in Up next, then pause. While it is armed the
 * run does not go on into the site order (queue.js _extendQueue asks), so the end of the queue is the end of what
 * the listener can see. Session-only, like the other modes.
 *
 * @returns {boolean}
 */
export function setSleepAtQueueEnd() {
  if (_state.status === 'idle' || !_state.queue.length) return false;
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  _state.sleepEndsAt = 0;
  _state.sleepMinutes = 0;
  _state.sleepAtTrackEnd = false;
  _state.sleepAtQueueEnd = true;
  _sleepEndedAt = 0;
  _syncSleepVolume();
  _notify();
  return true;
}

/** Disarms both sleep modes. @returns {void} */
export function clearSleepTimer() { _clearSleepTimer(); }
