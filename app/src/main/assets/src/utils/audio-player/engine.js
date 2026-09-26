// @ts-check
/* audio-player/engine — the ONE element and what drives it: an <audio>, or in the APK native-audio.js's
   stand-in with the same surface (m3). Create-on-first-play and its event wiring, _start (load and play
   queue[qi]), the status edge, load errors, the cold-start watchdog, prewarm, the deferred seek, and the
   native player's seam (what it plays next without the page). */

import { SongKeep } from '../song-keep.js';
import { NativeAudio, nativeAudioAvailable } from '../native-audio.js';
import { isVotAudioUrl, normalizeAudioRate } from '../audio-track.js';
import { _locateTrack } from './catalog.js';
import {
  _assetUrlFor,
  _isSong,
  _library,
  LOAD_FAIL_MSG,
  _mapFor,
  _notify,
  _offline,
  OFFLINE_MSG,
  _state,
  _toast,
} from './core.js';
import { _notifyListened, _recordSongStart } from './credit.js';
import { _clearLoop, _loopEnded, _loopTick } from './loop.js';
import {
  _cardAlbum,
  _cardArtist,
  _cardTitle,
  _installMediaArbiter,
  _mediaSession,
  _pauseOtherDomAudio,
  _raiseKeepAlive,
  _setAudioActive,
  _syncMediaSessionPosition,
  _syncMediaSessionState,
} from './media-session.js';
import { _downloadedReading, _offlineNotice, _srcFor, _unreachable } from './offline.js';
import {
  _finishedUrl,
  _forgetPosition,
  _lastPersistSec,
  _pendingRestore,
  _persist,
  _persistDurableOnly,
  _setFinishedUrl,
  _setLastPersistSec,
} from './persist.js';
import { _maybePrefetchNext } from './prefetch.js';
import { _crossInto, _extendQueue } from './queue.js';
import { _playRefused, _setResumeAfterUpdateArmed } from './restore.js';
import { _followSectionLetter, _resetSectionFollow } from './sections.js';
import { _sleepAtTrackEndFire, _sleepTimerFire, _syncSleepVolume } from './sleep.js';
import { _repeatMode, _replayCurrent } from './songs.js';
import { next, stop } from './transport.js';

/* ── module state (singleton) ─────────────────────────────────────────── */

/** @type {HTMLAudioElement | null} */
export let _el = null;
/** True once _ensureEl chose the native stand-in (native-audio.js, m3). */
export let _native = false;
/** Songs passed over in a row because they would not play (n3-03); a song that plays resets it. */
let _songSkips = 0;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _songSkips} v */
export function _setSongSkips(v) { _songSkips = v; }
const SONG_SKIP_CAP = 3;
const SONG_SKIP_MSG = "Couldn't play this song. Skipping to the next.";
/** Offline, a song not kept on the phone says "Not on this phone" on the bar this long, then the next kept one plays (README 3.5). */
const SONG_OFFLINE_SKIP_MS = 3000;
/** The pending offline skip past a song not on the phone (cleared by any new start or a stop). */
let _offlineSkipTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/* Bumped by every start. A `loadedmetadata` seek captures it when armed and
   refuses to fire once it has moved — see _seekOnMetadata. */
let _seekGen = 0;
/** The READING speed — the listener's chosen rate for letters and chapters.
 *  `_state.rate` is the EFFECTIVE rate of what is playing, which is 1 for a
 *  song: the reader's 1.5× must not warp music (W3-05), and it must come back
 *  unchanged on the next reading. */
export let _readingRate = 1;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _readingRate} v */
export function _setReadingRate(v) { _readingRate = v; }
/** Last whole second notified — the timeupdate re-render storm guard. */
export let _lastTick = -1;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _lastTick} v */
export function _setLastTick(v) { _lastTick = v; }
/** Position to resume from after a load error (see toggle()). */
export let _errorTime = 0;
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _errorTime} v */
export function _setErrorTime(v) { _errorTime = v; }
/** One-shot cold-start watchdog (see _start) — timer id + per-track flag. */
let _stallTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
let _stallRetried = false;
/** Letter key whose first track is pre-warmed in the idle element (prewarm). */
let _prewarmKey = /** @type {string | null} */ (null);
/** Write from another module of the player (the binding is read-only outside this one). @param {typeof _prewarmKey} v */
export function _setPrewarmKey(v) { _prewarmKey = v; }
/** The watchdog is valid only while playback is actively loading. */
export function _clearStallWatchdog() {
  if (_stallTimer) { clearTimeout(_stallTimer); _stallTimer = null; }
}

/**
 * @param {'idle'|'loading'|'playing'|'paused'} next
 * @returns {void}
 */
function _setStatus(next) {
  if (_state.status === next) return;
  _state.status = next;
  if (next === 'playing') { _clearStallWatchdog(); _songSkips = 0; }
  // Keep-alive tracks the listening SESSION, not the play state (media-card
  // rework 2026-08-09): 'paused' keeps the anchor so the system media card
  // survives a pause with its Play button LIVE — resuming from the card needs
  // the WebView (this player) alive in the background, which is exactly what
  // the anchor guarantees. Only 'idle' (stop / queue end) releases it; a
  // paused card is also swipeable (native detaches it from the foreground
  // service), and the swipe stops the service without touching this state —
  // the next 'playing' edge simply re-starts it. 'loading' is a mid-stream
  // stall ('waiting'); releasing there would let the OS kill the very
  // playback we're waiting on.
  // While the tour is showing, the true edge is held back: setAudioActive(true) is also the
  // moment Kotlin asks for POST_NOTIFICATIONS (API 33+), and on a fresh install the tour's own
  // Listen press is the first playback — the system prompt landed on top of the tour card
  // (emulator-5554, 2026-09-04). The app is in the foreground for the whole tour and the tour
  // stops what it started, so the keep-alive buys nothing there; the reader's next Listen after
  // the tour raises the ask as before. TourController is a bundle-b global; absent on a bare host.
  if (next === 'playing') _raiseKeepAlive();
  else if (next === 'idle') _setAudioActive(false);
  _syncMediaSessionState(next);
  _notify();
}

/** Drop the pending "Not on this phone" skip. */
export function _clearOfflineSkip() {
  if (_offlineSkipTimer) { clearTimeout(_offlineSkipTimer); _offlineSkipTimer = null; }
}

/* ── element ──────────────────────────────────────────────────────────── */

/**
 * Create-on-first-play. preload='none' so the element itself never opens a
 * connection — the per-track `src` assignment in _start() does.
 *
 * @returns {HTMLAudioElement}
 */
function _ensureEl() {
  if (_el) return _el;
  // In the APK the recording plays natively (m3): a stand-in with <audio>'s surface, so every rule below holds.
  _native = nativeAudioAvailable();
  const el = _native
    ? /** @type {HTMLAudioElement} */ (/** @type {unknown} */ (new NativeAudio({ meta: _nativeMeta, upcoming: _nativeUpcoming })))
    : new Audio();
  _installMediaArbiter();
  el.preload = 'none';
  // Plain no-cors embed, DELIBERATELY no crossOrigin: the GitHub release
  // hosts send no Cross-Origin-Resource-Policy (so no-cors media is allowed)
  // and don't guarantee Access-Control-Allow-Origin (so CORS mode could be
  // rejected). no-cors is the mode that always works here.

  el.addEventListener('playing', () => {
    _setStatus('playing');
    _recordSongStart();
  });
  el.addEventListener('waiting', () => _setStatus('loading'));
  // Only downgrade a genuinely-playing element: our own stop()/track-switch
  // pauses fire this too, and they've already set the status they want.
  el.addEventListener('pause', () => {
    // A recording's END fires 'pause' too (the spec: paused, then 'pause' with ended already true, then 'ended'):
    // a seam, not the listener's pause. Filed as one, it told native "not playing" at every seam, the keep-alive
    // left the foreground and, with the screen off, could not come back, so Android 17 muted the next chapter
    // while its clock ran (sf1, 2026-09-24). 'ended' owns the seam, including the pause a sleep-at-end asks for.
    if (el.ended) return;
    _markPaused();
  });
  el.addEventListener('durationchange', () => {
    if (_state.status === 'idle') return;   // prewarm fetch — nothing to show
    _state.duration = el.duration || 0;
    _syncMediaSessionPosition();
    _notify();
  });
  el.addEventListener('timeupdate', () => {
    _state.time = el.currentTime || 0;
    if (el.duration) _state.duration = el.duration;
    if (_state.sleepEndsAt && Date.now() >= _state.sleepEndsAt) { _sleepTimerFire(); return; }   // an overdue timeout
    if (_state.loop && _loopTick()) return;   // a repeated passage wrapped (or ended): the seek notified
    _syncSleepVolume();       // the sleep fade (a no-op unless a sleep mode is in its last stretch)
    _followSectionLetter();   // a compilation: name the letter, credit the one heard (cheap: ~30 keys)
    // timeupdate fires ~4x/second. Only re-render subscribers when the
    // displayed (whole-second) clock actually changes.
    const sec = Math.floor(_state.time);
    if (sec !== _lastTick) {
      _lastTick = sec;
      _syncMediaSessionPosition();
      _notify();
      // Durable resume: snapshot every ~5s of playback (and on the pause
      // below, and on pagehide / hidden — _flushOnHide). Cheap — ~300 bytes
      // to localStorage.
      if (sec - _lastPersistSec >= 5 || sec < _lastPersistSec) { _setLastPersistSec(sec); _persist(); }
      else _persistDurableOnly();   // every other second: the durable copy alone (a kill fires nothing)
      _maybePrefetchNext();   // 1 Hz — re-arms the gentle warm after a hiccup
    }
  });
  // Fires while the CURRENT track buffers, including when paused — the last
  // one lands right as it finishes, which is exactly when warming may begin.
  el.addEventListener('progress', () => _maybePrefetchNext());
  // Both the listen-count bridge and the position map read PRE-advance state,
  // so they run in this slot, before next() moves qi.
  el.addEventListener('ended', () => {
    // An 'ended' always belongs to queue[qi]: a src swap fires 'emptied', never 'ended', so no url
    // guard is needed here — and none would work, el.src being the RESOLVED absolute URL.
    const finished = _state.queue[_state.qi];
    // A repeated passage that runs to the recording's end wraps here, before anything counts the recording finished.
    // The last pass pauses at the end, and it is not the whole recording heard: no listen credit.
    const looped = _state.loop ? _loopEnded() : '';
    if (looped === 'wrap') return;
    if (looped === 'done') { _markPaused(); return; }
    _notifyListened();
    // A recording heard to its end has no place to return to. Drop the record,
    // and flag the URL so the advance can't write the ending clock back in.
    _setFinishedUrl((finished && finished.url) || null);
    _forgetPosition(_finishedUrl);
    try {
      // The sleep mode a clock cannot express, checked BEFORE the advance:
      // "stop when this recording ends" has no computable moment (playback
      // rate and buffering both move it), so the END EVENT is the trigger.
      if (_state.sleepAtTrackEnd) _sleepAtTrackEndFire();
      else if (_repeatMode() === 'one') _replayCurrent();
      else next();
    } finally { _setFinishedUrl(null); }
  });
  el.addEventListener('error', _onError);

  _el = el;
  return el;
}

/* ── the native player's seam (m3) ─────────────────────────────────────── */

/**
 * The lock-screen text for the recording at `url`.
 * @param {string} url
 * @returns {{ title: string, artist: string, album: string }}
 */
export function _nativeMeta(url) {
  const t = _state.queue[_state.qi];
  if (!t || t.url !== url) return { title: '', artist: '', album: '' };
  return { title: _cardTitle(t), artist: _cardArtist(t), album: _cardAlbum(t) };
}

/**
 * What native plays after this recording without the page: exactly what the 'ended' handler would start, when that
 * is a plain step it can take alone. Nothing when the end must stop (sleep at the end of this recording, the end of
 * the order) or needs the page (a recording not on the phone while offline: the page substitutes or pauses).
 * Repeat 'one' is this recording again. A song plays at 1x; a reading at the reading speed.
 * @returns {{ url: string, title: string, artist: string, album: string, rate: number }[]}
 */
function _nativeUpcoming() {
  if (_state.sleepAtTrackEnd || _pendingRestore) return [];
  const cur = _state.queue[_state.qi];
  if (!cur) return [];
  let t = null;
  if (_repeatMode() === 'one') t = cur;
  else if (_state.qi + 1 < _state.queue.length) {
    // Offline, _start passes over what is not on the phone to the next recording that is; one with a downloaded
    // reading to put in its place is the page's to substitute, so native stops there and the page takes over.
    for (let j = _state.qi + 1; j < _state.queue.length && !t; j++) {
      const q = _state.queue[j];
      if (!_unreachable(q)) t = q;
      else if (_downloadedReading(q)) return [];
    }
  } else if (_repeatMode() === 'all') t = _state.queue[0];
  if (!t || !isVotAudioUrl(t.url) || _unreachable(t)) return [];
  return [{ url: t.url, title: _cardTitle(t), artist: _cardArtist(t), album: _cardAlbum(t), rate: _isSong(t) ? 1 : _readingRate }];
}

/** Keep native's next recording in step with the queue and its modes (cheap: one short JSON compare). */
export function _syncNativeUpcoming() {
  if (_native && _el) /** @type {any} */ (_el).syncUpcoming();
}

/**
 * A song that would not LOAD, with one to go on to (n3-03): not a drop partway through one (that pauses at its place,
 * as before), not while paused (nothing to go on from), not the last one (nothing to skip to: it pauses, and Play
 * tries again), not offline (nothing ahead would load either). The refutation of s2r, S1 S2 N1.
 * @returns {boolean}
 */
function _songLoadFailed() {
  const track = _state.queue[_state.qi];
  if (!_isSong(track) || _offline()) return false;
  if (_state.status !== 'loading' && _state.status !== 'playing') return false;
  if (!(_state.qi + 1 < _state.queue.length || _repeatMode() === 'all')) return false;
  const code = _el && _el.error ? Number(_el.error.code) || 0 : 0;
  // 3 decode, 4 not a playable source: this file. Otherwise only a failure before any of it was heard.
  return code === 3 || code === 4 || (_state.status === 'loading' && !((_el && _el.currentTime) > 0.5));
}

/**
 * Let the element go of what it holds without ending the session: paused, its stream released (the src attribute
 * removed, which fires no 'error' the way src='' does), its stall watchdog cleared. Play (toggle) loads the bar's
 * recording into it again.
 * @returns {void}
 */
function _releaseEl() {
  _clearStallWatchdog();
  if (!_el) return;
  try { _el.pause(); } catch (_e) { /* already detached */ }
  try { _el.removeAttribute('src'); _el.load(); } catch (_e) { /* jsdom / older WebViews */ }
}

/** Move a live loading/playing element into one intentional paused state. */
export function _markPaused() {
  if (_state.status !== 'playing' && _state.status !== 'loading') return;
  _clearStallWatchdog();
  _setStatus('paused');
  _persist();
}

function _onError() {
  // stop() sets src='' + load(), which itself fires 'error' in real browsers.
  // Without this guard, every stop() would flash a failure toast.
  if (_state.status === 'idle' || !_state.queue.length) return;
  _clearStallWatchdog();
  // A song that will not play is passed over, so hands-off listening goes on (songs README 3.5: "Couldn't play
  // this song", then it skips; sweep n3-03). Not offline (nothing ahead would play either), and at most
  // SONG_SKIP_CAP in a row: a run of failures is the network, and the player pauses on it as before.
  if (_songLoadFailed() && _songSkips < SONG_SKIP_CAP) {
    _songSkips++;
    _toast(SONG_SKIP_MSG);
    next();
    return;
  }
  // Keep queue + qi + position: toggle() retries from here.
  _errorTime = _state.time;
  _setStatus('paused');
  _persist();
  // A downloaded recording failing offline is a load failure, not a missing connection.
  _toast(_unreachable(_state.queue[_state.qi]) ? OFFLINE_MSG : LOAD_FAIL_MSG);
}

/** Load + play queue[qi]. Assumes queue/qi are already set. */
export function _start() {
  // Before anything else: whatever this start does, a seek armed for the
  // PREVIOUS track is no longer this element's business.
  _seekGen++;
  _clearOfflineSkip();
  _resetSectionFollow();   // a new file: no letter under its clock yet, nothing heard
  const track = _state.queue[_state.qi];
  if (!track) { stop(); return; }
  // A repeated passage belongs to the play that set it: any new start ends it, except the first start of a
  // restored bar that took the loop before it had an element (setLoop's `waits`), which is that play.
  if (_state.loop) {
    if (_state.loop.waits && _state.loop.url === track.url) _state.loop = { ..._state.loop, waits: false };
    else _clearLoop(false);
  }
  if (!isVotAudioUrl(track.url)) {
    stop();
    _toast(LOAD_FAIL_MSG);
    return;
  }
  // No signal (item 8): a recording that is not on the phone cannot load. The queue plays what IS on the phone,
  // passing over the rest; with nothing downloaded ahead, it pauses on this one with the offline notice, and Play
  // (toggle) loads it once the connection is back.
  if (_unreachable(track)) {
    const reading = _downloadedReading(track);
    if (reading) {
      // Replace this letter's run of tracks with the downloaded reading, at the same part where it has one. The run
      // may start past part 1 (a queue started at part 2 leaves part 1 behind), so parts are counted from this
      // track's own place in its reading, not from the run (the refutation of 2026-09-24, S6).
      let a = _state.qi;
      while (a > 0 && _state.queue[a - 1] && _state.queue[a - 1].key === track.key) a--;
      let b = _state.qi;
      while (b + 1 < _state.queue.length && _state.queue[b + 1] && _state.queue[b + 1].key === track.key) b++;
      const at = _locateTrack(track);
      const own = at ? at.partIndex : _state.qi - a;
      const first = Math.min(Math.max(0, own - (_state.qi - a)), reading.tracks.length - 1);
      const tail = reading.tracks.slice(first);
      _state.queue = _state.queue.slice(0, a).concat(tail, _state.queue.slice(b + 1));
      _state.qi = a + Math.min(own - first, tail.length - 1);
      _start();
      return;
    }
    const ahead = _state.queue.findIndex((t, i) => i > _state.qi && (!_unreachable(t) || !!_downloadedReading(t)));
    if (ahead < 0) {
      _state.time = 0;
      _state.duration = 0;
      _errorTime = 0;
      // Paused BEFORE the element lets go, so its 'pause' finds nothing live to file.
      _setStatus('paused');
      // A manual Next or Prev lands here with the element still playing the recording being LEFT: it would play on
      // under a bar naming this one, its clock saved as this one's place (the refutation of 2026-09-24, M1).
      _releaseEl();
      _persist();
      _offlineNotice(track);
      return;
    }
    if (_isSong(track)) {
      // A song not kept on this phone: the bar says "Not on this phone" (paused on it), then the next kept song
      // plays (README 3.5, picture final-08). Any start or stop before then cancels the skip.
      _state.time = 0;
      _state.duration = 0;
      _errorTime = 0;
      _setStatus('paused');
      _releaseEl();
      _persist();
      _offlineSkipTimer = setTimeout(() => {
        _offlineSkipTimer = null;
        if (_state.status !== 'paused' || _state.queue[_state.qi] !== track) return;
        _state.qi = ahead;
        _start();
      }, SONG_OFFLINE_SKIP_MS);
      return;
    }
    _state.qi = ahead;
    _start();
    return;
  }
  // THE QUEUE IS THE SITE ORDER, ONE UNIT AHEAD (w-audio-continue, 2026-09-11). Crossing into
  // another collection moves the descriptor FIRST — the desk and the boot snapshot describe THIS
  // track's collection, and a restart rebuilds around it (the rebuild reads r.volKey, not a saved
  // queue). Then a unit's LAST track appends the next unit, here and not later: _maybePrefetchNext
  // reads queue[qi+1 ..] from the first timeupdate after this returns, so the boundary track is
  // warmed during this track instead of played cold at the seam.
  _crossInto(track);
  if (_state.qi === _state.queue.length - 1) _extendQueue();
  const el = _ensureEl();
  _clearStallWatchdog();
  // The preference store hydrates independently in bundle-b. Pull its latest
  // value at a real playback boundary so a delayed IDB hydrate still affects
  // the next recording without coupling the player to store internals.
  try {
    const library = _library();
    if (library && typeof library.getPlaybackRate === 'function') {
      _readingRate = normalizeAudioRate(library.getPlaybackRate());
    }
  } catch (_e) { /* library metadata is an enhancement, never a playback dependency */ }
  // A song plays at 1× whatever the reading speed; the next reading gets that
  // speed back because it is read afresh here, at every start.
  _state.rate = _isSong(track) ? 1 : _readingRate;
  _state.time = 0;
  // A kept song on the web plays from its stored bytes; leaving one lets its object URL go.
  const src = _srcFor(track);
  if (src === track.url) SongKeep.releaseObjectUrl();
  _state.duration = el.src === src ? (el.duration || 0) : 0;
  _lastTick = -1;
  _errorTime = 0;
  // A prewarm(…) already pointed the element at THIS url and buffered its
  // head — reassigning src would throw that away and restart the fetch. A warm
  // whose load FAILED (el.error set, NO_SOURCE) is re-pointed instead: nothing
  // is buffered to lose, and the fresh load's error fires at status 'loading'
  // where _onError can say so, not 20 s later from the stall watchdog (row 5).
  if (el.src !== src || el.error) el.src = src;
  // AFTER src: the media load algorithm resets playbackRate to
  // defaultPlaybackRate, so a rate applied pre-assignment is silently lost.
  // Setting default too keeps any internal reload at the chosen speed.
  try { el.defaultPlaybackRate = _state.rate; el.playbackRate = _state.rate; } catch (_e) { /* older media engines can ignore rates */ }
  // A pre-warm deliberately uses metadata; live playback should return the
  // reusable singleton to its connection-conservative baseline afterwards.
  el.preload = 'none';
  _prewarmKey = null;
  // Assign directly rather than via _setStatus: queue/qi changed too, so this
  // must notify even when the previous track was already 'loading'.
  _state.status = 'loading';
  // The keep-alive rises HERE, at the start, not at the first 'playing' event
  // (v02-audio-01, improvement sweep 2026-09-22): MainActivity.onPause halts the
  // WebView's media unless streamAudioActive, so a screen turned off during the
  // cold start (1-2 s over TLS, 20 s in a stall) stopped the letter before it
  // began. The app is in the foreground at the tap, so starting the service is
  // legal; the tour guard is the same one _setStatus applies. At a seam with the screen off it is not, and a
  // refusal pauses honestly instead of playing muted (sf1).
  _raiseKeepAlive();
  _notify();
  _mediaSession(track);
  _pauseOtherDomAudio(null);
  const p = el.play();
  // play() rejects on autoplay policy / load failure; the 'error' listener owns
  // the load-failure message. A policy refusal fires no 'error' at all, so it
  // is handled here: the bar must not sit in 'loading' forever, and the update
  // resume (below) turns it into a tap on the update toast.
  if (p && typeof p.then === 'function') p.then(() => { _setResumeAfterUpdateArmed(false); }, (err) => { _playRefused(err); });
  // Cold-start stall watchdog (observed on-device 2026-08-06): the very first
  // request of a session can hang inside the WebView network stack — no
  // 'error', no progress, 'loading' forever — while an immediate retry
  // streams instantly. If NOTHING has arrived after 20s, re-arm the src ONCE;
  // a genuinely dead network then surfaces through the normal error path.
  _stallRetried = false;
  _stallTimer = setTimeout(() => {
    _stallTimer = null;
    if (_stallRetried || _state.status !== 'loading' || !_el) return;
    if ((_el.currentTime || 0) > 0 || _el.readyState > 0) return; // data arrived
    _stallRetried = true;
    _el.src = src;
    const p2 = _el.play();
    if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
  }, 20000);
}

/**
 * Warm the pipe for a letter the reader just opened: point the idle element
 * at the letter's first track with preload='metadata', so the tap on Listen
 * starts from a live connection with the redirect resolved and headers in
 * hand instead of two cold TLS handshakes (~1-2s on mobile). Costs a few
 * hundred KB at most; NEVER runs while something is playing/paused/restored,
 * and re-warming the same letter is a no-op.
 *
 * @param {string} volKey
 * @param {string} letterId
 * @returns {void}
 */
export function prewarm(volKey, letterId) {
  if (_state.status !== 'idle' || _pendingRestore) return;
  if (_offline()) return;
  const connection = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator).connection : null;
  if (connection && connection.saveData) return;
  const m = _mapFor(volKey);
  const parts = m && m[volKey + ':' + letterId];
  if (!parts || !parts.length) return;
  const key = volKey + ':' + letterId;
  if (_prewarmKey === key) return;
  const el = _ensureEl();
  el.preload = 'metadata';
  const url = _assetUrlFor(volKey, parts[0][0]);
  if (!url) return;
  el.src = url;
  _prewarmKey = key;
}

/**
 * Seek once the element can honor it. HAVE_METADATA is the earliest safe
 * moment — a currentTime assignment before that is ignored or throws — but it
 * is a STATE, not only an event, and the two are not interchangeable. A
 * prewarm(…) points the idle element at the track with preload='metadata', so
 * `loadedmetadata` fires with nobody listening; _start() then deliberately
 * keeps that src, no second load runs, and the event never comes again. A
 * listener armed at that point would never fire and the seek would be lost
 * (the reader's hour-deep letter restarting at zero). So: seek NOW when the
 * element already has metadata, and defer to the event only when it doesn't.
 * This IS the boot-restore timing contract; every deferred seek in this
 * module goes through here.
 *
 * @param {number} at
 * @returns {void}
 */
export function _seekOnMetadata(at) {
  if (!(at > 0) || !_el) return;
  /* THE INTENT OF THE SEEK IS THE CLOCK, from this line on — not from whenever
     metadata lands. _start() has just set _state.time = 0, and everything that
     reads the clock before the first timeupdate (the bar, the media-session
     position, and _persist()) would otherwise read that 0 as the reader's
     place. The case that made it a loss: the update resume's play() refused
     by the autoplay policy (_playRefused -> _markPaused -> _persist) wrote 0
     into the boot snapshot over a 41 s position, with the seek still waiting
     for metadata a refused play() never loads (measured by
     tools/e2e-update-reload.mjs --autoplay-refused, r5). seek() already keeps
     the same rule for an unseekable element: "state still reflects intent". */
  _state.time = at;
  _lastTick = Math.floor(at);
  _notify();
  // HAVE_METADATA (1) or better — duration and the seekable ranges are known,
  // which is the whole precondition the event was standing in for.
  if (_el.readyState >= 1) {
    try { /** @type {HTMLAudioElement} */ (_el).currentTime = at; } catch (_e) { /* unseekable — start over */ }
    return;
  }
  /* A DEFERRED SEEK IS A PROMISE ABOUT ONE TRACK, and nothing used to check
     which track collected it. There is one element and one listener slot: if
     this metadata never arrives before the reader taps something else, this
     listener is still armed when the NEXT track's metadata fires, and the
     reader opens a recording they have never played ten minutes in. Neither
     the bar nor the position store looks wrong afterwards — the app believes
     it is where it seeked to.
     `noResume` (the desk's voice switch) is the worst case: it arms no seek of
     its own, so it has nothing to overwrite the stale one with, and the
     promise it exists to keep is precisely "start this again".
     The generation is captured here and compared inside the handler, so a
     start that happened in between makes this a no-op.
     REMOVING the listener instead was the other option and is not done: `_el`
     is assigned exactly once (see _ensureEl) so removal by reference would
     work today, but it would make correctness depend on the element never
     being replaced, and two mechanisms deciding which seek is current is one
     more than can be kept in step. `{ once: true }` means a stale listener
     costs one no-op call and then unregisters itself. */
  const gen = _seekGen;
  _el.addEventListener('loadedmetadata', () => {
    if (gen !== _seekGen) return;              // a later start owns the element now
    try { /** @type {HTMLAudioElement} */ (_el).currentTime = at; } catch (_e) { /* unseekable — start over */ }
  }, { once: true });
}

/**
 * The element's LIVE position, not the store's. `_state.time` is only notified
 * when the whole SECOND changes (the timeupdate re-render guard above), which
 * is the right cadence for a displayed clock and far too coarse for anything
 * that has to land on a syllable — read-along's rAF driver reads this instead.
 * Deliberately notifies nothing and allocates nothing: it is a pull, called up
 * to once per animation frame. Falls back to the store's value before the
 * element exists (boot-restore placeholder) so the caller never sees NaN —
 * AND before the element has metadata: with nothing loaded its currentTime
 * reads 0, which is not a position but the absence of one, while the seek's
 * intent is already the store's clock (_seekOnMetadata). A null must not
 * impersonate a value; the frame loop would paint sentence one for the
 * length of the metadata gap. HAVE_METADATA (1) is the same line
 * _seekOnMetadata draws for the seek itself.
 *
 * @returns {number}
 */
export function getPreciseTime() { return _el && _el.readyState >= 1 ? (_el.currentTime || 0) : _state.time; }
