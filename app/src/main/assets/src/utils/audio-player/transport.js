// @ts-check
/* audio-player/transport — the listener's controls on a live queue: play/pause, next/prev, jump, seek,
   speed, stop, and the pause other parts of the app ask for. */

import { SongKeep } from '../song-keep.js';
import { normalizeAudioRate } from '../audio-track.js';
import {
  _el,
  _isSong,
  late,
  _library,
  _native,
  NEXT_OFFLINE_MSG,
  _notify,
  _pendingRestore,
  PORTION_DONE_MSG,
  PREV_OFFLINE_MSG,
  _setPendingRestore,
  _setReadingRate,
  _setSkipSec,
  _setSource,
  _skipSec,
  SKIP_DEFAULT_SEC,
  SKIP_MAX_SEC,
  SKIP_MIN_SEC,
  _source,
  _state,
  _toast,
} from './core.js';
import { _setSongRecordPending } from './credit.js';
import {
  _clearOfflineSkip,
  _clearStallWatchdog,
  _errorTime,
  _forgetLastGood,
  _lastTick,
  _markPaused,
  _seekOnMetadata,
  _setErrorTime,
  _setLastTick,
  _setPrewarmKey,
  _start,
  _startAt,
} from './engine.js';
import { _clearLoop, _clearLoopTimer, LOOP_SLACK_S } from './loop.js';
import { _clearMediaSession, _setAudioActive, _syncMediaSessionPosition, _syncNative } from './media-session.js';
import { _holdsOtherForm, _offlineRefuses, _srcFor, _unreachable } from './offline.js';
import {
  _applyUndoSnapshot,
  _clearPersist,
  _persist,
  _rememberCurrentPosition,
  _rememberOutgoingPosition,
  _setLastPersistSec,
  _undoSnapshot,
} from './persist.js';
import { _stopWarming } from './prefetch.js';
import { _rebuildInFlight, _rebuildRestored, _rebuildRestoredQueue, _toggleRebuildStart } from './restore.js';
import { _seamStop } from './seam.js';
import { _resetSectionFollow, _setSecLastT } from './sections.js';
import { _clearSleepTimer } from './sleep.js';
import { _repeatMode } from './songs.js';

/** Restart-vs-step-back threshold for prev(), seconds (the usual media convention). */
const PREV_RESTART_SEC = 3;

/* ── transport ────────────────────────────────────────────────────────── */

/**
 * Pause when playing, resume when paused, no-op when idle.
 *
 * @returns {void}
 */
export function toggle() {
  if (_state.status === 'idle') return;
  // A restored bar has no live element yet — the first tap rebuilds the real
  // queue from the persisted descriptor and starts at the saved position.
  if (_pendingRestore) { void _rebuildRestoredQueue(); return; }
  // A tap while that rebuild waits for its corpus (the bar says Loading) takes the Play back, or asks again (s32.1).
  if (_rebuildInFlight()) { _toggleRebuildStart(); return; }
  if (!_el) return;
  // Anything that isn't 'paused' is a live element — pause it and let the
  // 'pause' listener own the status flip (one source of truth).
  if (_state.status !== 'paused') {
    _el.pause();
    // Some WebViews skip `pause` when a play request is still settling. The
    // state transition is still intentional, so never leave transport stuck
    // in loading while the element is already paused.
    _markPaused();
    return;
  }

  const track = _state.queue[_state.qi];
  if (!track) return;
  // A failed element stays failed until src is re-assigned; an element still
  // holding ANOTHER recording (a seam that paused offline, item 8) must load
  // the one the bar names.
  const src = _srcFor(track);
  if (_el.error || _el.src !== src) {
    // Re-load it and seek back to where playback died once metadata is
    // available (currentTime can't be set before then). A pause across a
    // change of signal swaps a saved recording's stream for its saved copy
    // (cf1): that carries on from where it was paused.
    const resumeAt = _holdsOtherForm(track) ? _state.time : _errorTime;
    _el.src = src;
    // AFTER src: the load algorithm resets playbackRate (see _start).
    try { _el.defaultPlaybackRate = _state.rate; _el.playbackRate = _state.rate; } catch (_e) { /* older media engines can ignore rates */ }
    // Through the shared helper, not a hand-written listener: this seek is a
    // promise about THIS track, and if the reader gives up and opens another
    // one before the metadata arrives, the raw version landed on that one
    // instead. _seekOnMetadata carries the generation guard that says so.
    // (It also no-ops for resumeAt 0, which is the same nothing the old
    // assignment achieved.)
    _seekOnMetadata(resumeAt);
  }
  const p = _el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

/**
 * Advance one track; extend into the next unit of the site order at the end of the queue, and
 * stop() only at the end of the order. Also the 'ended' handler, which passes `atSeam` true.
 *
 * @param {boolean} [atSeam] the recording ended (nothing is left playing to keep): no offline refusal
 * @returns {void}
 */
export function next(atSeam) {
  if (!_state.queue.length) return;
  // A restored bar's queue is a placeholder. The rebuild alone resumes the SAVED recording, which is Play, not Next:
  // once the real queue is in, step past it (sweep v021). A tap while the rebuild still waits for its corpus joins
  // that rebuild, as a step of its own, rather than reading the placeholder as the end of a queue of one. A step
  // is taken only where there is somewhere to go. With no corpus the rebuild resumes the placeholder itself; and a
  // real queue resumed on its LAST track (a letter, a custom queue, a songs queue with repeat off, a book's last
  // chapter: the rebuild's _start already appended whatever _extendQueue would) has nothing after it. A step past
  // either ends the session and erases the snapshot, the listener's place with it; the resume stands instead.
  if (_pendingRestore || _rebuildInFlight()) {
    void _rebuildRestored().then((built) => {
      if (built === 'queue' && (_state.qi + 1 < _state.queue.length || _repeatMode() === 'all')) next();
    });
    return;
  }
  // RC.1 (UX sweep re-check 2026-10-22): offline, a Next onto recordings that are not on the phone stopped the one
  // playing from its buffer and parked a 0:00 bar over Home. With nothing ahead on the phone it is refused before
  // qi moves, and the one playing plays on; with something ahead on it, _start passes over the rest to reach it.
  // A seam has nothing left to keep: it moves on and pauses on what cannot load, with the offline notice (item 8).
  // Repeat all's wrap is a step too (n366): what lies ahead is the rest, then the top round to the one playing.
  const ahead = _state.qi + 1 < _state.queue.length ? _state.queue.slice(_state.qi + 1)
    : _repeatMode() === 'all' ? _state.queue.slice(0, _state.qi + 1) : [];
  if (atSeam !== true && ahead.length && _offlineRefuses(ahead)) {
    _toast(NEXT_OFFLINE_MSG);
    return;
  }
  _rememberOutgoingPosition();   // R8 — attribute the clock before qi moves
  // The end of the queue is the end of the ORDER, not merely of a unit: the site order was
  // already appended when this unit's last track STARTED (_start → _extendQueue, so the boundary
  // track is warmed during this one), and nothing between that start and this end can turn a
  // refused extension into a granted one — a queue edit that leaves the playing track last extends
  // at once (s31.1), and Clear upcoming ends the run. So a queue that still ends here has nowhere to go: stop().
  // (A second _extendQueue() call lived here until 2026-09-12; verifier-2 measured that nothing
  // exercised it and its comment's reason was false.)
  // …unless a songs queue repeats: 'all' wraps to its top instead of ending.
  if (_state.qi + 1 >= _state.queue.length) {
    if (_repeatMode() !== 'all') {
      // The end says so (player brief 2026-10-22, section 7: the bar just vanished): a plan's portion in its own
      // words, anything else by the collection the bar named. The new bar's Finished state replaces this (L4).
      const last = _state.queue[_state.qi];
      const named = (last && last.sub) || (_source && _source.label) || '';
      const done = _source && _source.portion ? PORTION_DONE_MSG : 'Finished' + (named ? ' · ' + named : '') + '.';
      stop();
      _toast(done);
      return;
    }
    _state.qi = 0;
  } else {
    _state.qi++;
  }
  _start();
  _setLastPersistSec(-1);
  _persist();   // track boundary — remember the new position immediately
}

/**
 * Restart the current track when it's more than PREV_RESTART_SEC in; otherwise
 * step back one. At the HEAD of the queue there is nothing to step back to, so
 * "previous" means restart there too — including under the threshold, where the
 * old clamp walked `qi` to itself and handed `_start()` the SAME url. `_start()`
 * skips the src assignment in that case (deliberately, so a prewarm isn't
 * thrown away), which left the element playing on undisturbed: at the one
 * position a listener presses prev most, it did nothing at all.
 *
 * @returns {void}
 */
export function prev() {
  if (!_state.queue.length) return;
  // In flight too: stepping "back" on the placeholder started it from 0:00 under the rebuild about to resume it.
  if (_pendingRestore || _rebuildInFlight()) { void _rebuildRestoredQueue(); return; }
  if (_el && (_el.currentTime || 0) > PREV_RESTART_SEC) { seek(0); return; }
  const target = Math.max(0, _state.qi - 1);
  // Landing on the track already playing: a seek, not a reload — the stream
  // stays open and the position is the only thing that moves.
  if (target === _state.qi && _el) { seek(0); return; }
  // RC.1: the same refusal stepping back onto a recording that is not on the phone.
  if (_offlineRefuses([_state.queue[target]])) { _toast(PREV_OFFLINE_MSG); return; }
  _rememberOutgoingPosition();   // R8 — same rule stepping backwards
  _state.qi = target;
  _start();
  _setLastPersistSec(-1);
  _persist();
}

/**
 * Seek within the current track. Clamped to [0, duration].
 *
 * @param {number} seconds
 * @returns {void}
 */
export function seek(seconds) {
  _setSecLastT(-1);   // a jump is never "heard": the compilation follower re-bases on the next tick
  _clearLoopTimer();   // the timed wrap was for the old clock; the next timeupdate re-arms it
  const lp = _state.loop;
  if (lp && !(seconds >= lp.start - LOOP_SLACK_S && seconds <= lp.end + LOOP_SLACK_S)) _clearLoop(false);   // left the passage
  if (!_el || _pendingRestore) {
    /* THE BOOT-RESTORED BAR HAS NO ELEMENT YET, and returning silently here
       was read-along-4: a reader who opens a timed chapter after a cold boot
       and taps a verse got NOTHING. The bar is real, the timings are real,
       and the only missing thing is the media element the placeholder never
       created (the prewarm at :858 is guarded by _pendingRestore).

       WRITING THE DESCRIPTOR *IS* THE SEEK: _rebuildRestoredQueue resumes at
       `r.time || 0`, so the next play starts at the tapped verse.

       It deliberately does NOT rebuild the queue the way play/next/prev do
       at :1902/:1942/:1964. Those are play COMMANDS; a reposition is not
       one, and _rebuildRestoredQueue toasts and aborts when offline — which
       would turn a tap on a verse into an error message about the network.

       AND IT IS NOT CLAMPED, which is the part not to tidy away. The clamp
       below reads `_state.duration || _el.duration || 0`, and on a restored
       bar every term of that is 0 — meaning UNKNOWN, not zero-length. Fall
       through to it and `Math.min(seconds, 0)` seeks every tap to the START
       of the recording: a wrong answer in place of no answer, which is the
       worse trade. The real ceiling is applied by the element itself when
       metadata arrives (_seekOnMetadata), and the only live caller reads its
       target out of that recording's own timings file.

       A RESTORED BAR CAN HAVE AN ELEMENT, just never its own: the durable (IDB)
       copy is adopted while the player is merely idle, and a prewarm leaves it
       idle with an element pointed at another recording. Taking the element
       branch then seeked that recording and left the descriptor's clock where
       it was, so Play resumed at the old place (sweep v83). Every play path
       clears _pendingRestore first, so while it is set this branch is the bar. */
    if (!_pendingRestore) return;          // idle: no element and nothing to restore
    const at = Math.max(0, Math.floor(seconds || 0));
    _pendingRestore.time = at;
    _state.time = at;
    _setLastTick(at);
    _setLastPersistSec(at);
    _notify();
    _persist();
    return;
  }
  const max = _state.duration || _el.duration || 0;
  if (!(max > 0) && _state.queue[_state.qi] && seconds > 0) {
    /* A TRACK WITH NO METADATA YET HAS NO CEILING, and 0 is not one. Every new
       src leaves duration NaN until loadedmetadata, so a seek in that window —
       a search landing whose reader pressed Listen inside the flash, the
       read-along seekTo firing as the chapter's timings arrive — used to clamp
       to Math.min(seconds, 0) and play the chapter from its top: the same
       wrong-answer-for-no-answer the no-element branch above refuses. The
       deferred seek is _seekOnMetadata's job (the clock carries the intent now,
       the element takes it when metadata lands, a later start voids it); the
       element applies the real ceiling itself. Found by the flake hunt: the
       read-along test for this passed only on a stale duration an earlier test
       left on the shared element. */
    _seekOnMetadata(seconds);
    _syncMediaSessionPosition();
    _syncNative();
    _setLastPersistSec(_lastTick);
    _persist();
    return;
  }
  const t = Math.max(0, Math.min(seconds || 0, max || 0));
  try { _el.currentTime = t; } catch (_e) { /* not seekable yet — state still reflects intent */ }
  _state.time = t;
  _setLastTick(Math.floor(t));
  _syncMediaSessionPosition();
  _syncNative();   // a position JUMP breaks the card's interpolation — resync
  _notify();
  // A paused seek is a deliberate reposition — snapshot it now, or closing
  // the app right after would resume at the pre-seek position.
  _setLastPersistSec(_lastTick);
  _persist();
}

/**
 * Seek relative to the current clock. Used by the manager's deliberate
 * short-jump controls instead of duplicating clamp logic in the UI.
 *
 * @param {number} seconds
 * @returns {void}
 */
export function skip(seconds) {
  seek((_state.time || 0) + (Number(seconds) || 0));
}

/**
 * A skip step as whole seconds within SKIP_MIN_SEC..SKIP_MAX_SEC; anything that is not a number is the default.
 * @param {unknown} v @returns {number}
 */
export function clampSkipSeconds(v) {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Math.round(Number(v)) : NaN;
  return Number.isFinite(n) ? Math.min(SKIP_MAX_SEC, Math.max(SKIP_MIN_SEC, n)) : SKIP_DEFAULT_SEC;
}

/** The skip buttons' step, seconds. @returns {number} */
export function skipSeconds() { return _skipSec; }

/** The step the phone app's media service was last told; 0 = not yet (it outlives a page reload, so tell it once). */
let _nativeSkipSec = 0;

/**
 * Set the skip buttons' step (Settings › Listening › Skip Buttons). The player's buttons redraw with the new number,
 * and in the phone app the lock screen's, notification's and headset's skips take it too. Idempotent: the settings
 * render pushes it every time.
 * @param {unknown} v @returns {number} the step now in force
 */
export function setSkipSeconds(v) {
  const n = clampSkipSeconds(v);
  const bridge = typeof window !== 'undefined' ? /** @type {any} */ (window).AndroidBridge : null;
  if (n !== _nativeSkipSec && bridge && typeof bridge.audioSkip === 'function') {
    try { bridge.audioSkip(n); _nativeSkipSec = n; } catch (_e) { /* an older app: its own 15 stays */ }
  }
  if (n === _skipSec) return n;
  _setSkipSec(n);
  // Settings pushes it from a render: tell the player's subscribers after it, not during it.
  queueMicrotask(_notify);
  return n;
}

/**
 * Set the playback rate (any 1 % step in the product range) and persist it in
 * the Listening Library. Playback itself never depends on the metadata store succeeding.
 *
 * @param {unknown} rate
 * @returns {number}
 */
export function setPlaybackRate(rate) {
  const next = normalizeAudioRate(rate);
  _setReadingRate(next);
  // The READING speed moves; a song playing now stays at 1× and the new speed
  // takes effect at the next reading.
  const effective = _isSong(_state.queue[_state.qi]) ? 1 : next;
  const changed = _state.rate !== effective;
  _state.rate = effective;
  if (changed) _clearLoopTimer();   // a repeated passage's timed wrap was set for the old speed
  if (_el) {
    // Default too: the next load algorithm resets playbackRate to default.
    try { _el.defaultPlaybackRate = effective; _el.playbackRate = effective; } catch (_e) { /* unsupported engines retain normal speed */ }
  }
  _syncMediaSessionPosition();
  _syncNative();   // rate feeds the card's position interpolation
  try {
    const library = _library();
    if (library && typeof library.setPlaybackRate === 'function') library.setPlaybackRate(next);
  } catch (_e) { /* metadata persistence is best-effort */ }
  if (changed) _notify();
  return next;
}

/**
 * Jump directly to a queued track. Queue order remains intact, so a normal
 * collection source can still be rebuilt on the next app launch.
 *
 * @param {number} index
 * @param {number} [at] seconds into that recording to start from. The place rides the load, as a resume's does: a
 *   seek right after it fell where the APK's player cannot yet seek and was dropped, so Listen from here in another
 *   part of a letter played that part from its top (W62, emulator look).
 * @returns {void}
 */
export function playAt(index, at) {
  if (_pendingRestore || !_state.queue.length) return;
  const nextIndex = Math.floor(Number(index));
  if (!Number.isFinite(nextIndex) || nextIndex < 0 || nextIndex >= _state.queue.length) return;
  // A place belongs to its own recording. One not on the phone offline would be passed over (or swapped for another
  // reading) and the place carried into a recording it is not in: no move at all, and what plays goes on (W62
  // refuter round 3). The caller sees qi unchanged.
  const place = Number(at);
  const target = _state.queue[nextIndex];
  if (place > 0 && _unreachable(target)) return;
  _rememberOutgoingPosition();   // R8 — the jumped-away-from track keeps its clock
  _state.qi = nextIndex;
  if (place > 0) _startAt((/** @type {any} */ tr) => (tr === target ? place : 0));
  else _start();
  _setLastPersistSec(-1);
  _persist();
}

/**
 * Stop playback and clear the queue. Dropping `src` + load() tears down the
 * live release-asset connection — a merely-paused element keeps holding it.
 *
 * @returns {void}
 */
export function stop() {
  const wasActive = _state.status !== 'idle';
  // The ✕ means "I'm done with THIS SESSION", not "forget where I was": the
  // per-recording map survives, so closing the bar no longer erases the place
  // in a 90-minute reading. Written before the live state is cleared.
  _rememberCurrentPosition(true);
  // The boot snapshot is the part that must not resurrect the bar.
  _setPendingRestore(null);
  _setSource(null);
  _forgetLastGood();
  _clearPersist();
  _clearStallWatchdog();
  _clearSleepTimer(false);
  _stopWarming();
  _clearOfflineSkip();
  _setSongRecordPending(false);
  _clearLoop(false);
  _seamStop();
  if (_el) {
    try { _el.pause(); } catch (_e) { /* already detached */ }
    _el.src = '';
    SongKeep.releaseObjectUrl();
    try { _el.load(); } catch (_e) { /* jsdom / older WebViews */ }
  }
  _state.queue = [];
  _state.qi = 0;
  _state.time = 0;
  _state.duration = 0;
  _state.status = 'idle';
  _state.failed = null;
  _setLastTick(-1);
  _setErrorTime(0);
  _setPrewarmKey(null);
  _resetSectionFollow();
  _clearMediaSession();
  if (wasActive) _setAudioActive(false);
  _notify();
}

/**
 * The bar's Close (player brief 3a: "Stopped · Undo"): stop, and hand back what Undo needs to bring the session
 * back. The record is the one a reload restores from, so Undo restores it the same way.
 *
 * @returns {{ snap: any, playing: boolean } | null} null when nothing was playing
 */
export function stopWithUndo() {
  if (_state.status === 'idle') return null;
  const snap = _undoSnapshot();
  const playing = _state.status === 'playing' || _state.status === 'loading';
  stop();
  return snap ? { snap, playing } : null;
}

/**
 * Undo a Close: the session comes back at its place, paused with nothing loaded (as after a reload), and plays
 * again when it was playing. Once anything else has started, the Undo is spent.
 *
 * @param {{ snap: any, playing: boolean } | null} token what stopWithUndo returned
 * @returns {boolean} whether the session came back
 */
export function undoStop(token) {
  if (!token || _state.status !== 'idle') return false;
  if (!_applyUndoSnapshot(token.snap)) return false;
  _persist();
  if (token.playing) toggle();
  return true;
}

/**
 * Pause only if currently playing. Called by the journal voice recorder before
 * it takes the mic.
 *
 * @returns {void}
 */
export function pauseIfPlaying() {
  // A restored bar's Play still waiting for its corpus (the bar says Loading, s32.1) has no element to pause: take
  // the start back, or it would begin once the corpus lands (a screen with no audio, Corbin 2026-10-22 23:5x).
  if (_rebuildInFlight() && _state.status === 'loading') { _toggleRebuildStart(); return; }
  if ((_state.status === 'playing' || _state.status === 'loading') && _el) {
    _el.pause();
    _markPaused();
  } else if (_native && _el) {
    // A phone call holds native silent: the bar says paused, but native means to play on after it (s2r S3).
    _el.pause();
  }
}


// This module's verbs that the modules below it call (core.js `late`).
Object.assign(late, { next, pauseIfPlaying, prev, seek, skip, stop, toggle });
