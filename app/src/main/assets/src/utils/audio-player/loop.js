// @ts-check
/* audio-player/loop — REPEAT THIS PASSAGE (rp1 part 3): a span of the playing recording heard N times. */

import { nativeAudioAvailable, nativeLoopAvailable } from '../native-audio.js';
import {
  _el,
  late,
  _native,
  _notify,
  _pendingRestore,
  _state,
} from './core.js';

/* ── REPEAT THIS PASSAGE (rp1 part 3, 2026-09-25) ─────────────────────────
   A reader selects verses and presses REPEAT: the playing recording plays that span `times` times, then pauses at
   its end. The span is [start, end) in the recording's own seconds (the pane reads both from its timing rows; an end
   of Infinity runs to the recording's end). The
   wrap is a seek, checked on every timeupdate; those fire ~4x a second, so the last stretch before the end is timed
   (_loopTimer) and the voice goes back on the verse's last syllable, not a quarter second into the next verse. A
   span that runs to the recording's end wraps from 'ended' (_loopEnded) instead of advancing. A seek out of the
   span, another recording or a stop ends it.
   Native (the APK, ra2 2026-10-13): the page cannot time it there (native plays on between its 1 Hz ticks, and
   with the screen off the page sleeps), so native plays the span round itself (NativeAudio.setLoop -> audioLoop)
   and the bar follows native's word on the pass in every event (_loopTick). No upcoming recording while a loop
   plays, so a span to the end ends there instead of crossing a seam. An APK from before ra2 has no loop: setLoop
   refuses and the button is not offered (canLoop). */

/** Seconds a seek may land outside the span and still count as inside it (a tap on the span's first word). */
export const LOOP_SLACK_S = 0.5;
/** Seconds before the end at which the wrap is due (the clock is read, not predicted). */
const LOOP_EPS_S = 0.03;
/** Wall seconds before the end below which the wrap is timed instead of left to the next timeupdate. */
const LOOP_TIMED_S = 0.35;
let _loopTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/** Each loop's number, so native's word about an older one is not taken for this one's. */
let _loopSerial = 0;
/** The loop native said it plays (its id), 0 until it does: from then on its silence is the loop's end. */
let _nativeTook = 0;

export function _clearLoopTimer() {
  if (_loopTimer) { clearTimeout(_loopTimer); _loopTimer = null; }
}

/** @param {boolean} [notify] @returns {void} */
export function _clearLoop(notify = true) {
  _clearLoopTimer();
  if (!_state.loop) return;
  _state.loop = null;
  _loopToNative();
  if (notify) _notify();
}

/** Hand native the loop (or its end) and what plays next: nothing while a loop is on (ra2). @returns {void} */
export function _loopToNative() {
  const el = /** @type {any} */ (_el);
  if (!_native || !el) return;
  const lp = _state.loop;
  _nativeTook = 0;
  if (typeof el.setLoop === 'function') {
    el.setLoop(lp && !lp.waits ? { id: lp.id, start: lp.start, end: lp.end, times: lp.times, pass: lp.pass } : null);
  }
  if (typeof el.syncUpcoming === 'function') el.syncUpcoming();
}

/** The end of a pass: go round again, or, after the last, stop the loop and pause at the span's end. @returns {void} */
function _loopWrap() {
  const lp = _state.loop;
  if (!lp) return;
  _clearLoopTimer();
  if (lp.pass < lp.times) {
    _state.loop = { ...lp, pass: lp.pass + 1 };
    late.seek(lp.start);
    return;
  }
  _clearLoop(false);
  if (_el) { try { _el.pause(); } catch (_e) { /* already detached */ } }
  late._markPaused();
  _notify();
}

/**
 * The timeupdate side: wrap when the clock is at the span's end, or time the last stretch.
 * @returns {boolean} true when it wrapped (the caller's tick is over)
 */
export function _loopTick() {
  const lp = _state.loop;
  const track = _state.queue[_state.qi];
  if (!lp || !_el) return false;
  if (!track || track.url !== lp.url) { _clearLoop(); return false; }
  if (_native) {
    // Native goes round by itself: the bar shows the pass it says, and once it took this loop, its silence is the
    // loop's end (the last pass paused at the end, or a seek from the lock screen left the passage).
    const word = /** @type {any} */ (_el).loopState;
    if (word && word.id === lp.id) {
      _nativeTook = lp.id;
      const pass = Math.min(lp.times, Math.max(1, Number(word.pass) || 1));
      if (pass !== lp.pass) { _state.loop = { ...lp, pass }; _notify(); }
    } else if (_nativeTook === lp.id) _clearLoop();
    return false;
  }
  const t = _el.currentTime || 0;
  if (t >= lp.end - LOOP_EPS_S) { _loopWrap(); return true; }
  const left = (lp.end - t) / (Number(_state.rate) || 1);
  if (left < LOOP_TIMED_S && !_loopTimer && !_el.paused) {
    _loopTimer = setTimeout(() => {
      _loopTimer = null;
      const cur = _state.loop;
      // Only if the clock really is at the end: a pause or a seek back in the meantime leaves it to the ticks.
      if (cur && _el && !_el.paused && (_el.currentTime || 0) >= cur.end - LOOP_TIMED_S / 2) _loopWrap();
    }, Math.max(0, left * 1000));
  }
  return false;
}

/**
 * 'ended' with a loop on: the span ran to the recording's end.
 * @returns {'wrap'|'done'|''} 'wrap' played it again, 'done' was the last pass (the caller pauses), '' not ours
 */
export function _loopEnded() {
  const lp = _state.loop;
  const track = _state.queue[_state.qi];
  if (!lp || !_el || !track || track.url !== lp.url) { _clearLoop(false); return ''; }
  _clearLoopTimer();
  if (_native) {
    // Native goes round from the end itself; an end it lets through is the last pass, paused there. One that still
    // names a pass to come is native already on its way round: nothing here to do.
    const word = /** @type {any} */ (_el).loopState;
    if (word && word.id === lp.id && Number(word.pass) < lp.times) return 'wrap';
    _clearLoop();
    return 'done';
  }
  if (lp.pass >= lp.times) { _clearLoop(); return 'done'; }
  _state.loop = { ...lp, pass: lp.pass + 1 };
  late.seek(lp.start);
  try {
    const p = _el.play();
    if (p && typeof p.then === 'function') p.then(null, late._playRefused);
  } catch (_e) { /* the element refused: the bar shows Play at the span's start */ }
  return 'wrap';
}

/**
 * REPEAT THIS PASSAGE: play [start, end) of the loaded recording `times` times, then pause at its end. Seeks to the
 * start; the play state is the caller's (the pane resumes a paused bar, as Listen from here does).
 * @param {{ start: number, end: number, times?: number, label?: string }} span
 * @returns {boolean} false when there is nothing to loop (no recording loaded, a bad span, an APK with no native loop)
 */
export function setLoop(span) {
  const track = _state.queue[_state.qi];
  const start = Number(span && span.start);
  const end = Number(span && span.end);
  const times = Math.max(1, Math.floor(Number(span && span.times) || 3));
  if (!canLoop() || !track || _state.status === 'idle') return false;
  // A bar restored after a restart has no element until its first Play: the loop waits for that start
  // (_start keeps it) and the seek below writes the place that Play resumes at.
  const waits = !_el && !!_pendingRestore && _pendingRestore.url === track.url;
  if (!_el && !waits) return false;
  // An end of Infinity is a span that runs to the recording's end: 'ended' wraps it.
  if (!Number.isFinite(start) || start < 0 || !(end > start)) return false;
  _clearLoopTimer();
  _state.loop = { id: ++_loopSerial, url: track.url, start, end, times, pass: 1, label: String((span && span.label) || ''), waits };
  late.seek(start);
  // Native: after the seek, so it takes the loop at the span's start (a restored bar's waits for its first start).
  if (!waits) _loopToNative();
  return true;
}

/** End a repeated passage now; playback goes on from where it is. @returns {void} */
export function clearLoop() { _clearLoop(); }

/** True when the recording plays in the APK's native player. @returns {boolean} */
export function isNative() { return _native || nativeAudioAvailable(); }

/** Can a passage be repeated here: the web's player, or an APK whose native player loops (ra2). @returns {boolean} */
export function canLoop() { return !isNative() || nativeLoopAvailable(); }
