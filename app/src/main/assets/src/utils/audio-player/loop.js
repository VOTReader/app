// @ts-check
/* audio-player/loop — REPEAT THIS PASSAGE (rp1 part 3): a span of the playing recording heard N times. */

import { nativeAudioAvailable } from '../native-audio.js';
import { _notify, _state } from './core.js';
import { _el, _markPaused, _native } from './engine.js';
import { _pendingRestore } from './persist.js';
import { _playRefused } from './restore.js';
import { seek } from './transport.js';

/* ── REPEAT THIS PASSAGE (rp1 part 3, 2026-09-25) ─────────────────────────
   A reader selects verses and presses REPEAT: the playing recording plays that span `times` times, then pauses at
   its end. The span is [start, end) in the recording's own seconds (the pane reads both from its timing rows; an end
   of Infinity runs to the recording's end). The
   wrap is a seek, checked on every timeupdate; those fire ~4x a second, so the last stretch before the end is timed
   (_loopTimer) and the voice goes back on the verse's last syllable, not a quarter second into the next verse. A
   span that runs to the recording's end wraps from 'ended' (_loopEnded) instead of advancing. A seek out of the
   span, another recording or a stop ends it. The web engine only: native (the APK) plays on by itself between
   the page's 1 Hz ticks, so setLoop refuses there and the button is not offered (isNative). */

/** Seconds a seek may land outside the span and still count as inside it (a tap on the span's first word). */
export const LOOP_SLACK_S = 0.5;
/** Seconds before the end at which the wrap is due (the clock is read, not predicted). */
const LOOP_EPS_S = 0.03;
/** Wall seconds before the end below which the wrap is timed instead of left to the next timeupdate. */
const LOOP_TIMED_S = 0.35;
let _loopTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

export function _clearLoopTimer() {
  if (_loopTimer) { clearTimeout(_loopTimer); _loopTimer = null; }
}

/** @param {boolean} [notify] @returns {void} */
export function _clearLoop(notify = true) {
  _clearLoopTimer();
  if (!_state.loop) return;
  _state.loop = null;
  if (notify) _notify();
}

/** The end of a pass: go round again, or, after the last, stop the loop and pause at the span's end. @returns {void} */
function _loopWrap() {
  const lp = _state.loop;
  if (!lp) return;
  _clearLoopTimer();
  if (lp.pass < lp.times) {
    _state.loop = { ...lp, pass: lp.pass + 1 };
    seek(lp.start);
    return;
  }
  _clearLoop(false);
  if (_el) { try { _el.pause(); } catch (_e) { /* already detached */ } }
  _markPaused();
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
  if (lp.pass >= lp.times) { _clearLoop(); return 'done'; }
  _state.loop = { ...lp, pass: lp.pass + 1 };
  seek(lp.start);
  try {
    const p = _el.play();
    if (p && typeof p.then === 'function') p.then(null, _playRefused);
  } catch (_e) { /* the element refused: the bar shows Play at the span's start */ }
  return 'wrap';
}

/**
 * REPEAT THIS PASSAGE: play [start, end) of the loaded recording `times` times, then pause at its end. Seeks to the
 * start; the play state is the caller's (the pane resumes a paused bar, as Listen from here does).
 * @param {{ start: number, end: number, times?: number, label?: string }} span
 * @returns {boolean} false when there is nothing to loop (no recording loaded, a bad span, the native engine)
 */
export function setLoop(span) {
  const track = _state.queue[_state.qi];
  const start = Number(span && span.start);
  const end = Number(span && span.end);
  const times = Math.max(1, Math.floor(Number(span && span.times) || 3));
  if (_native || !track || _state.status === 'idle') return false;
  // A bar restored after a restart has no element until its first Play: the loop waits for that start
  // (_start keeps it) and the seek below writes the place that Play resumes at.
  const waits = !_el && !!_pendingRestore && _pendingRestore.url === track.url;
  if (!_el && !waits) return false;
  // An end of Infinity is a span that runs to the recording's end: 'ended' wraps it.
  if (!Number.isFinite(start) || start < 0 || !(end > start)) return false;
  _clearLoopTimer();
  _state.loop = { url: track.url, start, end, times, pass: 1, label: String((span && span.label) || ''), waits };
  seek(start);
  return true;
}

/** End a repeated passage now; playback goes on from where it is. @returns {void} */
export function clearLoop() { _clearLoop(); }

/** True when the recording plays in the APK's native player (no passage loop there yet). @returns {boolean} */
export function isNative() { return _native || nativeAudioAvailable(); }
