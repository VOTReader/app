// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   audio-player — streaming playback for letters and Bible (singleton store)
   ═══════════════════════════════════════════════════════════════════════
   Two corpora stream from immutable GitHub Release assets: letters across the
   14 VOT collections (src/data/audio-manifest.js, auto-generated, rides
   bundle-a-vot) and the recorded Bible editions, which are PER-CHAPTER —
   1,189 tracks each (src/data/bible-audio-manifest.js, rides bundle-a). Both
   map ids to asset ids; this module turns either into a queue and drives ONE
   <audio> element. Deep reference: ARCHITECTURE.md § Audio subsystem.

   Store contract (the repo's useSyncExternalStore idiom):
     subscribe(cb) -> unsubscribe · getVersion() -> number · getState()

   Two things this module deliberately does NOT do at import time:
     1. touch AUDIO_MANIFEST / AUDIO_SECTIONS — they're LAZY corpus globals
        that only exist after __loadVotCorpus() runs, so every read goes
        through _manifest()/_sections() at CALL time.
     2. construct the Audio element — created on first play() so boot order
        and jsdom tests never see a media element they didn't ask for.

   The manifest globals are read via globalThis rather than as bare names:
   they are classic-script `var`s (real globals) at runtime, but they are
   NOT in tools/globals.generated.d.ts, so a bare `AUDIO_MANIFEST` fails
   `npm run typecheck` until someone re-runs `npm run lint:globals`. The
   globalThis read is identical at runtime and immune to that ordering.
   ═══════════════════════════════════════════════════════════════════════ */

import { showToast } from './toast.js';
import {
  AUDIO_BIBLE_RELEASE_PREFIX,
  AUDIO_RESUME_END_FRACTION,
  AUDIO_RESUME_MIN_SEC,
  AUDIO_RESUME_REWIND_SEC,
  BIBLE_AUDIO_EDITIONS,
  audioAssetUrl,
  audioReaderLabel,
  bibleAudioAssetUrl,
  isVotAudioUrl,
  normalizeAudioRate,
  normalizeAudioTrack,
} from './audio-track.js';

/**
 * @typedef {Object} Track
 * @property {string | null} key       - "volKey:letterId"; null for range-compilation sections
 * @property {string} title            - letter title, or the section's own label
 * @property {string | null} sub       - collection label (Media Session "album")
 * @property {string} url              - immutable VOT release-asset stream URL
 * @property {string} readerCode       - 'B' | 'T' | 'V' | 'M'
 * @property {string | null} partLabel - "Part 2" / "Addendum" on multi-part letters
 */

/**
 * @typedef {Object} Rendition
 * @property {string} reader   - reader code the WHOLE rendition is read by
 * @property {Track[]} tracks  - the complete letter as that reader recorded it
 */

/**
 * @typedef {Object} AudioPlayerState
 * @property {'idle'|'loading'|'playing'|'paused'} status
 * @property {Track[]} queue
 * @property {number} qi        - index of the playing track within queue
 * @property {number} time      - current position, seconds
 * @property {number} duration  - current track length, seconds (0 until known)
 * @property {number} rate      - selected playback-rate preset
 * @property {number} sleepEndsAt - epoch ms, 0 when no sleep timer is armed
 * @property {number} sleepMinutes - the countdown preset that was armed, 0 when none
 * @property {boolean} sleepAtTrackEnd - stop when the CURRENT recording ends
 * @property {boolean} restoring - the bar is a boot placeholder; the real queue
 *   has not been rebuilt yet, so its SHAPE is unknown (see _pendingRestore)
 * @property {'letter'|'collection'|'section'|'custom'|''} sourceMode - how this
 *   queue was built; 'custom' means a user-edited queue or a lone recording
 */

/** Shared DOM id so every audio message replaces the previous one. */
export const AUDIO_TOAST_ID = 'vot-toast-audio';

const OFFLINE_MSG = 'Playing audio requires an internet connection.';
const LOAD_FAIL_MSG = 'Couldn’t load this track.';

/** Restart-vs-step-back threshold for prev(), seconds (the usual media convention). */
const PREV_RESTART_SEC = 3;

/** Default short-jump, seconds — the same step the listening desk's ∓15 buttons
 *  take, so a host media card that omits `seekOffset` agrees with the app. */
const SEEK_STEP_SEC = 15;

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

/* ── module state (singleton) ─────────────────────────────────────────── */

/** @type {HTMLAudioElement | null} */
let _el = null;
/** @type {Set<() => void>} */
const _listeners = new Set();
let _version = 0;
/** @type {AudioPlayerState} */
const _state = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false, restoring: false, sourceMode: /** @type {'letter'|'collection'|'section'|'custom'|''} */ ('') };
/** Last whole second notified — the timeupdate re-render storm guard. */
let _lastTick = -1;
/** Position to resume from after a load error (see toggle()). */
let _errorTime = 0;
/** One-shot cold-start watchdog (see _start) — timer id + per-track flag. */
let _stallTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
let _stallRetried = false;
/** Sleep timer — intentionally session-only: a closed app must never wake just to pause audio. */
let _sleepTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/** Letter key whose first track is pre-warmed in the idle element (prewarm). */
let _prewarmKey = /** @type {string | null} */ (null);
/** volKey → has-any-audio. The manifest is immutable once loaded. */
const _volHasAudio = new Map();

const _g = () => /** @type {any} */ (globalThis);
/** AudioLibraryStore lives in bundle-b; resolve it at call time to avoid a second bundled singleton. */
const _library = () => _g().AudioLibraryStore || null;
/** AudioPositionsStore is the same bundle and the same rule — the per-recording
 *  resume map is reached by runtime bridge, never imported from bundle-d. */
const _positions = () => _g().AudioPositionsStore || null;
/** @returns {Record<string, Array<any[]>> | null} */
const _manifest = () => _g().AUDIO_MANIFEST || null;
/** @returns {Record<string, Array<any[]>> | null} */
const _sections = () => _g().AUDIO_SECTIONS || null;
/** Cross-reader alternate renditions, ordered by reader rank. Same lazy
 *  corpus + same call-time read as the manifest above. Only the ~42 letters
 *  with a genuine second reading appear.
 *  @returns {Record<string, Array<any[]>> | null} */
const _alternates = () => _g().AUDIO_ALTERNATES || null;
/** Bible-edition manifest — rides bundle-a (critical path), so it exists from boot. */
const _bibleManifest = () => _g().BIBLE_AUDIO_MANIFEST || null;
/** 'bible-*' volKeys stream a recorded Bible edition — per-chapter tracks off
 *  that edition's own OT/NT release tags (the retired whole-book tracks on
 *  audio-bible-v1 resolve through the same routing). */
const _isBibleVol = (volKey) => typeof volKey === 'string' && volKey.lastIndexOf('bible-', 0) === 0;
/** The manifest a volKey's entries live in. */
const _mapFor = (volKey) => (_isBibleVol(volKey) ? _bibleManifest() : _manifest());
/** Release-aware asset → stream URL for a volKey's tracks. */
const _assetUrlFor = (volKey, id) => (_isBibleVol(volKey) ? bibleAudioAssetUrl(id) : trackUrl(id));

/** The watchdog is valid only while playback is actively loading. */
function _clearStallWatchdog() {
  if (_stallTimer) { clearTimeout(_stallTimer); _stallTimer = null; }
}

/** Disarms BOTH sleep modes — the countdown and the end-of-track flag are one
 *  user-facing setting with one Clear.
 *  @returns {void} */
function _clearSleepTimer(notify = true) {
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  if (_state.sleepEndsAt || _state.sleepAtTrackEnd) {
    _state.sleepEndsAt = 0;
    _state.sleepMinutes = 0;
    _state.sleepAtTrackEnd = false;
    if (notify) _notify();
  }
}

function _notify() {
  _version++;
  for (const cb of _listeners) {
    try { cb(); } catch (e) { console.warn('[audio] subscriber threw', e); }
  }
}

/**
 * @param {'idle'|'loading'|'playing'|'paused'} next
 * @returns {void}
 */
function _setStatus(next) {
  if (_state.status === next) return;
  _state.status = next;
  if (next === 'playing') _clearStallWatchdog();
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
  if (next === 'playing') _setAudioActive(true);
  else if (next === 'idle') _setAudioActive(false);
  _syncMediaSessionState(next);
  _notify();
}

/** @returns {boolean} */
function _offline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** @param {string} text */
function _toast(text) {
  showToast({ id: AUDIO_TOAST_ID, className: 'vot-toast', text, ariaLive: 'assertive' });
}

/**
 * Android keep-alive. NOTE: PlatformBridge is normally the ONLY place that
 * touches window.AndroidBridge — setAudioActive is not on PlatformBridgeShape
 * yet because the Kotlin side lands in a separate commit. Fold this into
 * PlatformBridge when it does.
 *
 * @param {boolean} active
 */
function _setAudioActive(active) {
  try {
    const b = typeof window !== 'undefined' && /** @type {any} */ (window).AndroidBridge;
    if (b && typeof b.setAudioActive === 'function') b.setAudioActive(active);
  } catch (_e) { /* PWA has no bridge / native threw — keep-alive is best-effort */ }
}

/* ── Media Session (lock screen + headset controls) ───────────────────── */
// Every runtime API here is guarded AND try/catch'd: mediaSession is absent in
// jsdom and on older WebViews, and setActionHandler throws on actions a given
// browser doesn't implement.

/* One audible app-owned recording at a time. Journal memo <audio> elements
   live outside this singleton, so a small document-level lease closes the
   gap without creating another playback store or changing their components. */
let _mediaArbiterInstalled = false;

/** @param {HTMLMediaElement | null} except */
function _pauseOtherDomAudio(except) {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  for (const media of document.querySelectorAll('audio')) {
    if (media === except || media.paused) continue;
    try { media.pause(); } catch (_e) { /* another app-owned player may already be detaching */ }
  }
}

function _installMediaArbiter() {
  if (_mediaArbiterInstalled || typeof document === 'undefined' || !document.addEventListener) return;
  const g = _g();
  const previous = g.__votAudioArbiter;
  if (typeof previous === 'function') document.removeEventListener('play', previous, true);
  const handler = (event) => {
    const media = /** @type {any} */ (event.target);
    if (!media || typeof media.pause !== 'function') return;
    _pauseOtherDomAudio(media);
    // The singleton element is created with new Audio(), not mounted in the
    // document, so a journal play event cannot be the player itself.
    pauseIfPlaying();
  };
  g.__votAudioArbiter = handler;
  _mediaArbiterInstalled = true;
  document.addEventListener('play', handler, true);
}

function _mediaSession(track) {
  // Native twin FIRST — the early-returns below bail on hosts without the web
  // MediaSession API (jsdom, old WebViews), and the Android media card must
  // not depend on the web API existing.
  _installNativeTransport();
  _syncNative();
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = /** @type {any} */ (navigator).mediaSession;
    const MM = _g().MediaMetadata;
    if (typeof MM === 'function') {
      ms.metadata = new MM({
        title: track.title + (track.partLabel ? ' — ' + track.partLabel : ''),
        artist: _cardArtist(track),
        album: track.sub || '',
      });
    }
    _setAction(ms, 'play', () => toggle());
    _setAction(ms, 'pause', () => toggle());
    _setAction(ms, 'seekto', (/** @type {any} */ d) => seek((d && d.seekTime) || 0));
    // Desktop-PWA reach: Chrome's own media hub and hardware media keys
    // offer these three; the phone reads the NATIVE card instead (the web
    // MediaSession is inert inside the WebView), so this is desktop-only value
    // for three lines. `offset` is optional in the spec — default to the same
    // 15s the listening desk's ∓15 buttons use.
    _setAction(ms, 'seekbackward', (/** @type {any} */ d) => skip(-((d && d.seekOffset) || SEEK_STEP_SEC)));
    _setAction(ms, 'seekforward', (/** @type {any} */ d) => skip((d && d.seekOffset) || SEEK_STEP_SEC));
    _setAction(ms, 'stop', () => stop());
    _syncMediaSessionActions();
    _syncMediaSessionState(_state.status);
    _syncMediaSessionPosition();
  } catch (_e) { /* unsupported action / no Media Session — cosmetic only */ }
}

/**
 * setActionHandler throws on actions a given host doesn't implement, so each
 * registration is isolated: one unsupported action must not skip the rest.
 *
 * @param {any} ms
 * @param {string} action
 * @param {((detail?: any) => void) | null} handler
 */
function _setAction(ms, action, handler) {
  try { ms.setActionHandler(action, handler); } catch (_e) { /* action unsupported here */ }
}

/**
 * Prev/next exist only while the queue has somewhere to go. A media card that
 * shows dead skip buttons for a single saved recording is worse than one that
 * shows none, so these are re-applied on every queue-SHAPE change — track
 * starts (through _mediaSession) and queue edits alike.
 *
 * @returns {void}
 */
function _syncMediaSessionActions() {
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = /** @type {any} */ (navigator).mediaSession;
    const multi = _state.queue.length > 1;
    _setAction(ms, 'previoustrack', multi ? () => prev() : null);
    _setAction(ms, 'nexttrack', multi ? () => next() : null);
  } catch (_e) { /* no Media Session on this host — cosmetic only */ }
}

/** Keep lock-screen scrubbers and Bluetooth displays in step with the player. */
function _syncMediaSessionPosition() {
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = /** @type {any} */ (navigator).mediaSession;
    const duration = Number(_state.duration);
    if (typeof ms.setPositionState !== 'function' || !Number.isFinite(duration) || duration <= 0) return;
    const position = Math.max(0, Math.min(Number(_state.time) || 0, duration));
    ms.setPositionState({ duration, position, playbackRate: _state.rate });
  } catch (_e) { /* a partially-supported Media Session must stay cosmetic */ }
  // NO _syncNative() here: this runs at 1 Hz from 'timeupdate', and the native
  // card interpolates position from (position, rate, timestamp) on its own —
  // per-second Intents would be pure binder/notification churn. Native syncs
  // ride the EDGES instead: state changes, track starts, seeks, rate changes.
}

/** @param {'idle'|'loading'|'playing'|'paused'} status */
function _syncMediaSessionState(status) {
  // Native twin FIRST — the guard below returns on hosts without the web API.
  _syncNative();
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = /** @type {any} */ (navigator).mediaSession;
    // Buffering remains an active listening session. Reporting "playing" is
    // less surprising on a headset than briefly flickering back to paused.
    ms.playbackState = status === 'playing' || status === 'loading'
      ? 'playing'
      : status === 'paused' ? 'paused' : 'none';
  } catch (_e) { /* playbackState is absent on some otherwise-valid hosts */ }
}

function _clearMediaSession() {
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = /** @type {any} */ (navigator).mediaSession;
    for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward', 'stop']) {
      _setAction(ms, a, null);
    }
    ms.metadata = null;
    ms.playbackState = 'none';
  } catch (_e) { /* same guards as _mediaSession */ }
}

/* ── native media card (Android system UI) ────────────────────────────── */
// The web MediaSession above is INERT inside the Android WebView — it never
// reaches the Quick Settings media card / lock screen. These mirrors feed the
// SAME metadata + state to the native MediaSessionCompat that
// AudioKeepAliveService renders (AndroidBridge.setAudioNowPlaying), and
// receive the system's transport taps back as window.__votMediaCommand.
// Best-effort like every bridge touch: the PWA has no bridge, older APKs may
// predate the method, and a native throw must never disturb playback.

/**
 * The line under the title on a media card — the web MediaSession "artist" and
 * its native twin. A letter's is the app plus the reader who read it; a Bible
 * chapter's is the EDITION, because that is the voice the listener chose and
 * bible-* tracks carry no reader code at all (without this, every edition's
 * card said "The Volumes of Truth" and the three were indistinguishable).
 *
 * @param {Track} track
 * @returns {string}
 */
function _cardArtist(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const divider = key.indexOf(':');
  if (divider > 0 && _isBibleVol(key)) {
    const volKey = key.slice(0, divider);
    const edition = Object.values(BIBLE_AUDIO_EDITIONS).find((entry) => entry && entry.volKey === volKey);
    if (edition) return edition.short || edition.label;
  }
  const reader = readerLabel(track.readerCode);
  return 'The Volumes of Truth' + (reader ? ' · ' + reader : '');
}

/** Push the current track + state snapshot to the native media card. */
function _syncNative() {
  try {
    const b = typeof window !== 'undefined' && /** @type {any} */ (window).AndroidBridge;
    if (!b || typeof b.setAudioNowPlaying !== 'function') return;
    const track = _state.queue[_state.qi];
    if (!track) return;
    b.setAudioNowPlaying(
      track.title + (track.partLabel ? ' — ' + track.partLabel : ''),
      _cardArtist(track),
      // Buffering counts as playing — same rule as _syncMediaSessionState.
      _state.status === 'playing' || _state.status === 'loading',
      Number(_state.time) || 0,
      Number(_state.duration) || 0,
      Number(_state.rate) || 1
    );
  } catch (_e) { /* the card is cosmetic; playback must never notice */ }
}

let _nativeTransportInstalled = false;

/** Install the system-transport receiver (idempotent). */
function _installNativeTransport() {
  if (_nativeTransportInstalled || typeof window === 'undefined') return;
  _nativeTransportInstalled = true;
  /** @param {string} cmd @param {number} posMs */
  _g().__votMediaCommand = (cmd, posMs) => {
    try {
      if (cmd === 'next') next();
      else if (cmd === 'prev') prev();
      else if (cmd === 'seekTo') seek((Number(posMs) || 0) / 1000);
      // play / pause / toggle all resolve through toggle(): the system only
      // offers Play while paused and Pause while playing, so the edge is
      // always the right one.
      else toggle();
    } catch (_e) { /* a bad system command must never crash the player */ }
  };
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
  const el = new Audio();
  _installMediaArbiter();
  el.preload = 'none';
  // Plain no-cors embed, DELIBERATELY no crossOrigin: the GitHub release
  // hosts send no Cross-Origin-Resource-Policy (so no-cors media is allowed)
  // and don't guarantee Access-Control-Allow-Origin (so CORS mode could be
  // rejected). no-cors is the mode that always works here.

  el.addEventListener('playing', () => _setStatus('playing'));
  el.addEventListener('waiting', () => _setStatus('loading'));
  // Only downgrade a genuinely-playing element: our own stop()/track-switch
  // pauses fire this too, and they've already set the status they want.
  el.addEventListener('pause', () => {
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
    // timeupdate fires ~4x/second. Only re-render subscribers when the
    // displayed (whole-second) clock actually changes.
    const sec = Math.floor(_state.time);
    if (sec !== _lastTick) {
      _lastTick = sec;
      _syncMediaSessionPosition();
      _notify();
      // Durable resume: snapshot every ~5s of playback (and on the pause
      // below). Cheap — ~300 bytes to localStorage.
      if (sec - _lastPersistSec >= 5 || sec < _lastPersistSec) { _lastPersistSec = sec; _persist(); }
      _maybePrefetchNext();   // 1 Hz — re-arms the gentle warm after a hiccup
    }
  });
  // Fires while the CURRENT track buffers, including when paused — the last
  // one lands right as it finishes, which is exactly when warming may begin.
  el.addEventListener('progress', () => _maybePrefetchNext());
  // Both the listen-count bridge and the position map read PRE-advance state,
  // so they run in this slot, before next() moves qi.
  el.addEventListener('ended', () => {
    const finished = _state.queue[_state.qi];
    _notifyListened();
    // A recording heard to its end has no place to return to. Drop the record,
    // and flag the URL so the advance can't write the ending clock back in.
    _finishedUrl = (finished && finished.url) || null;
    _forgetPosition(_finishedUrl);
    try {
      // The sleep mode a clock cannot express, checked BEFORE the advance:
      // "stop when this recording ends" has no computable moment (playback
      // rate and buffering both move it), so the END EVENT is the trigger.
      if (_state.sleepAtTrackEnd) _sleepAtTrackEndFire();
      else next();
    } finally { _finishedUrl = null; }
  });
  el.addEventListener('error', _onError);

  _el = el;
  return el;
}

/**
 * End-of-track sleep firing. Deliberately identical to the countdown timer's
 * expiry — pause, never stop, so the queue and the resume snapshot survive —
 * and one-shot: the flag clears itself, so the NEXT track boundary advances
 * normally without the listener having to disarm anything.
 *
 * @returns {void}
 */
function _sleepAtTrackEndFire() {
  _state.sleepAtTrackEnd = false;
  const wasLive = _state.status === 'playing' || _state.status === 'loading';
  if (wasLive && _el) { try { _el.pause(); } catch (_e) { /* already detached */ } }
  _markPaused();
  if (!wasLive) _notify();
  if (wasLive) _toast('Sleep timer ended. Playback paused.');
}

/** Move a live loading/playing element into one intentional paused state. */
function _markPaused() {
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
  // Keep queue + qi + position: toggle() retries from here.
  _errorTime = _state.time;
  _setStatus('paused');
  _persist();
  _toast(_offline() ? OFFLINE_MSG : LOAD_FAIL_MSG);
}

/* ── gentle queue prefetch (owner directive 2026-08-09) ───────────────────
   When the CURRENT track is fully buffered and the connection is healthy,
   quietly warm the next couple of queued tracks through a second, detached,
   never-playing <audio> element. The bytes land in the HTTP cache (measured:
   a warmed release asset re-serves in ~65ms vs ~750ms cold, redirect
   included), so the real player starts the next letter near-instantly and
   survives a brief network drop at the track boundary. The warmer is NOT a
   second player: it has no listeners that surface state, it never plays, and
   the one-audio arbitration never sees it (detached elements emit no
   document-level events). fetch() is not an option here — connect-src
   deliberately excludes the asset hosts; media-src is the allowed lane. */

/** How many upcoming tracks may be warm at once. Deliberately small. */
const PREFETCH_AHEAD = 2;
let _warmEl = /** @type {HTMLAudioElement | null} */ (null);
/** URL currently warming; null = chain idle. */
let _warmingUrl = /** @type {string | null} */ (null);
let _warmTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/** Session-level "already warmed" set — the HTTP cache holds the bytes. */
const _warmedUrls = new Set();

/** Save-Data or a 2g-class link means: never spend speculative bytes. */
function _connectionPoor() {
  const c = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator).connection : null;
  if (!c) return false;
  if (c.saveData) return true;
  const t = c.effectiveType || '';
  return t === 'slow-2g' || t === '2g';
}

/** The current track has everything it needs — spare bandwidth exists. */
function _mainFullyBuffered() {
  if (!_el) return false;
  const dur = _el.duration || 0;
  const b = _el.buffered;
  if (!(dur > 0) || !b || !b.length) return false;
  return b.end(b.length - 1) >= dur - 0.5;
}

/** Un-warmed URLs within the NEXT PREFETCH_AHEAD queue positions — a sliding
 *  window, so deeper tracks only become eligible as playback advances. */
function _warmTargets() {
  const out = [];
  const limit = Math.min(_state.queue.length, _state.qi + 1 + PREFETCH_AHEAD);
  for (let i = _state.qi + 1; i < limit; i++) {
    const url = _state.queue[i] && _state.queue[i].url;
    // Whole-book Bible tracks are 30–260 MB each — "warming" one is a full
    // audiobook download, not a head-of-file cache fill. That shape now lives
    // ONLY on audio-bible-v1 (legacy saved tracks + pre-switch resumes), so
    // the skip is a single prefix test; every shipped edition is per-chapter
    // and warms like a letter.
    if (url && !_warmedUrls.has(url) && url.lastIndexOf(AUDIO_BIBLE_RELEASE_PREFIX, 0) !== 0) out.push(url);
  }
  return out;
}

/** @param {boolean} markWarmed - false leaves the URL eligible for a retry. */
function _finishWarm(markWarmed) {
  if (!_warmingUrl) return;   // src='' teardown re-fires 'error' — ignore it
  if (_warmTimer) { clearTimeout(_warmTimer); _warmTimer = null; }
  if (markWarmed) _warmedUrls.add(_warmingUrl);
  _warmingUrl = null;
  if (_warmEl) {
    _warmEl.removeAttribute('src');
    try { _warmEl.load(); } catch (_e) { /* release the connection */ }
  }
  if (markWarmed) _maybePrefetchNext();   // walk on to the second target
}

function _stopWarming() {
  if (_warmTimer) { clearTimeout(_warmTimer); _warmTimer = null; }
  _warmingUrl = null;
  if (_warmEl) {
    _warmEl.removeAttribute('src');
    try { _warmEl.load(); } catch (_e) { /* already idle */ }
  }
}

function _maybePrefetchNext() {
  if (_state.status === 'idle' || _pendingRestore || _warmingUrl) return;
  if (_offline() || _connectionPoor() || !_mainFullyBuffered()) return;
  const targets = _warmTargets();
  if (!targets.length) return;
  if (!_warmEl) {
    const w = new Audio();
    w.preload = 'auto';
    // Full download → warmed. 'suspend' = the browser chose to stop fetching;
    // with usable data buffered that still caches the head, which is the
    // start-latency win — mark it done rather than thrash re-requests.
    w.addEventListener('canplaythrough', () => _finishWarm(true));
    w.addEventListener('suspend', () => { if (w.readyState >= 3) _finishWarm(true); });
    w.addEventListener('error', () => _finishWarm(false));
    _warmEl = w;
  }
  _warmingUrl = targets[0];
  _warmEl.src = targets[0];
  // Backstop: a wedged fetch never blocks the chain; URL stays retryable.
  _warmTimer = setTimeout(() => _finishWarm(false), 45000);
}

/**
 * The chapter a "Chapter N" part label names, or 0. Every shipped Bible
 * edition labels its parts that way (bible-audio-manifest.js expands them from
 * one loop), so the label IS the answer; a legacy whole-book recording carries
 * no part label and has no single chapter to name.
 *
 * @param {unknown} partLabel
 * @returns {number}
 */
function _chapterOfLabel(partLabel) {
  const match = typeof partLabel === 'string' ? partLabel.match(/^Chapter (\d+)$/) : null;
  return match ? Number(match[1]) : 0;
}

/** @param {Track | null | undefined} track @returns {number} */
function _chapterOfTrack(track) {
  return _chapterOfLabel(track && track.partLabel);
}

/**
 * Which Bible chapter a track is, or 0 when it is not a per-chapter Bible
 * recording. Exported because read-along must answer the same question — a
 * book queues its whole remaining run, so the reader can be looking at
 * Genesis 3 while Genesis 1 plays, and painting then would be a confident lie.
 * Exported rather than re-parsed there: the label format is this module's, and
 * a second copy of the regex is a second thing to drift.
 *
 * @param {Track | null | undefined} track
 * @returns {number}
 */
function bibleChapterOfTrack(track) {
  return _chapterOfTrack(track);
}

/**
 * A recording finished playing to its end (owner directive 2026-08-09: a full
 * listen counts like a full read — the item's read count increments). Fired
 * from 'ended' BEFORE next() advances; range-compilation sections carry key
 * null and never notify. The App-side bridge (useReadProgress) owns the
 * actual counting.
 *
 * TWO completion grains, because the corpus has two (2026-08-10):
 *   - a LETTER is one recording that may be split across parts, so it scores
 *     when its LAST part ends and the same-key guard is what waits for it;
 *   - a BIBLE CHAPTER is a whole recording of its own. Every shipped edition
 *     is per-chapter and a book's chapters all share one key, so applying the
 *     letter guard there credited a 50-chapter book exactly once — and only
 *     when the queue happened to hold the whole book. Bible tracks therefore
 *     notify PER TRACK, independent of queue shape.
 */
function _notifyListened() {
  try {
    const track = _state.queue[_state.qi];
    if (!track || !track.key) return;
    const divider = track.key.indexOf(':');
    if (divider <= 0) return;
    const volKey = track.key.slice(0, divider);
    const itemId = track.key.slice(divider + 1);
    const perTrack = _isBibleVol(volKey);
    if (!perTrack) {
      const following = _state.queue[_state.qi + 1];
      if (following && following.key === track.key) return;   // more parts remain
    }
    // One WHOLE recording finished. Counted before the bridge lookup below so
    // the tally does not depend on the App-side hook being mounted.
    _countCompletion();
    const g = _g();
    if (typeof g.__votAudioListened !== 'function') return;
    // The chapter rides along so the bridge can credit the BIBLE read-items key
    // space (bookId + chapter), which is where a chapter read is recorded.
    g.__votAudioListened(volKey, itemId, perTrack ? _chapterOfTrack(track) : 0);
  } catch (_e) { /* listen counting must never interfere with queue advance */ }
}

/**
 * Persist one "heard to the end" in the Listening Library. Same fail-quiet
 * contract as _countPlay: My Progress's listening block is an enhancement,
 * never something that may stand between a finished track and the advance.
 *
 * @returns {void}
 */
function _countCompletion() {
  try {
    const library = _library();
    if (library && typeof library.countCompletion === 'function') library.countCompletion();
  } catch (_e) { /* a counter must never interfere with the queue advance */ }
}

/** Load + play queue[qi]. Assumes queue/qi are already set. */
function _start() {
  const track = _state.queue[_state.qi];
  if (!track) { stop(); return; }
  if (!isVotAudioUrl(track.url)) {
    stop();
    _toast(LOAD_FAIL_MSG);
    return;
  }
  const el = _ensureEl();
  _clearStallWatchdog();
  // The preference store hydrates independently in bundle-b. Pull its latest
  // value at a real playback boundary so a delayed IDB hydrate still affects
  // the next recording without coupling the player to store internals.
  try {
    const library = _library();
    if (library && typeof library.getPlaybackRate === 'function') {
      _state.rate = normalizeAudioRate(library.getPlaybackRate());
    }
  } catch (_e) { /* library metadata is an enhancement, never a playback dependency */ }
  _state.time = 0;
  _state.duration = el.src === track.url ? (el.duration || 0) : 0;
  _lastTick = -1;
  _errorTime = 0;
  // A prewarm(…) already pointed the element at THIS url and buffered its
  // head — reassigning src would throw that away and restart the fetch.
  if (el.src !== track.url) el.src = track.url;
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
  _notify();
  _mediaSession(track);
  _pauseOtherDomAudio(null);
  const p = el.play();
  // play() rejects on autoplay policy / load failure; the 'error' listener owns
  // the user-visible message, so this just stops an unhandled rejection.
  if (p && typeof p.catch === 'function') p.catch(() => {});
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
    _el.src = track.url;
    const p2 = _el.play();
    if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
  }, 20000);
}

/* ── manifest queries ─────────────────────────────────────────────────── */

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
function prewarm(volKey, letterId) {
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
 * Does this letter have a recording?
 *
 * @param {string} volKey
 * @param {string} letterId
 * @returns {boolean}
 */
function hasAudio(volKey, letterId) {
  const m = _mapFor(volKey);
  return !!(m && m[volKey + ':' + letterId]);
}

/**
 * Reader code of a letter's FIRST track — what the hero button badges
 * ("Read by Benjamin" etc.) key off. Null when the manifest is absent or has
 * no entry for the letter.
 *
 * @param {string} volKey
 * @param {string} letterId
 * @returns {string | null}
 */
function firstReaderCode(volKey, letterId) {
  const m = _mapFor(volKey);
  const parts = m && m[volKey + ':' + letterId];
  return (parts && parts[0] && parts[0][1]) || null;
}

/**
 * Does ANY letter in this collection have a recording? (Drives the
 * collection-level play button.) Cached per volKey after the first real
 * answer — the manifest never changes within a session.
 *
 * @param {string} volKey
 * @returns {boolean}
 */
function collectionHasAudio(volKey) {
  if (_volHasAudio.has(volKey)) return _volHasAudio.get(volKey);
  const m = _mapFor(volKey);
  // Do NOT cache a pre-corpus "no": the manifest arrives lazily, and a poisoned
  // false would hide the play button for the rest of the session.
  if (!m) return false;
  const prefix = volKey + ':';
  let found = false;
  for (const k in m) {
    if (k.lastIndexOf(prefix, 0) === 0) { found = true; break; }
  }
  _volHasAudio.set(volKey, found);
  return found;
}

/**
 * Play a recorded Bible book, queueing THAT BOOK's chapters from the one
 * tapped (the letters' album behavior, book-scoped). Book titles come from
 * BIBLE_AUDIO_BOOKS, which ships in the same lazy bundle as the Bible corpus —
 * any screen showing a Listen pill has it by construction.
 *
 * @param {{ volKey: string, bookId: string, label?: string | null, chapterNum?: number | null, noResume?: boolean }} opts
 * @returns {void}
 */
function playBibleBook(opts) {
  const o = opts || /** @type {any} */ ({});
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  const books = Array.isArray(_g().BIBLE_AUDIO_BOOKS) ? _g().BIBLE_AUDIO_BOOKS : [];
  // Queue scope is THE BOOK (owner directive 2026-08-10): a chapter tap
  // queues that book's remaining chapters, never the rest of the Bible —
  // auto-advance ends where the book ends.
  const items = books.filter((b) => b[0] === o.bookId).map((b) => ({ id: b[0], title: b[1] }));
  if (!items.length) return;
  // Two edition SHAPES, and the branch is on the shape, not on the edition id
  // — every shipped edition (BRM, WOP, WEB) is PER-CHAPTER, carrying one
  // manifest part per chapter, so "play chapter N" is a queue POSITION. The
  // retired whole-book shape carries one part per book, so there it is a SEEK
  // into the book track via BIBLE_AUDIO_CHAPTERS (loadedmetadata timing — the
  // restore contract). A fourth edition of either shape needs no change here.
  const m = _mapFor(o.volKey);
  const parts = (m && m[o.volKey + ':' + o.bookId]) || [];
  const perChapter = parts.length > 1;
  const n = Number(o.chapterNum);
  playCollection({
    volKey: o.volKey, items, collectionLabel: o.label || null, startId: o.bookId,
    startPartIndex: perChapter && Number.isInteger(n) && n >= 2 ? Math.min(n - 1, parts.length - 1) : 0,
    noResume: !!o.noResume,
  });
  if (perChapter) return;
  // A whole-book edition seeks INTO the book track. The chapter the reader
  // actually tapped outranks a remembered position: playCollection queued its
  // resume listener first, so this one — added second — wins the assignment.
  _seekOnMetadata(bibleChapterStart(o.volKey, o.bookId, o.chapterNum));
}

/**
 * Chapter-start offset (seconds) into a book's whole-book track, or 0 when
 * the chapter index doesn't cover it (chapter 1, unknown book, no scan row).
 *
 * @param {string} volKey
 * @param {string} bookId
 * @param {number | null | undefined} chapterNum
 * @returns {number}
 */
function bibleChapterStart(volKey, bookId, chapterNum) {
  const n = Number(chapterNum);
  if (!Number.isInteger(n) || n < 2) return 0;   // ch1 = book start (keep the book intro)
  const map = _g().BIBLE_AUDIO_CHAPTERS;
  const secs = map && map[volKey + ':' + bookId];
  const at = Array.isArray(secs) ? Number(secs[n - 1]) : NaN;
  return Number.isFinite(at) && at > 0 ? at : 0;
}

/**
 * Range-compilation tracks for a collection (WTLB parts 1-7), or null.
 *
 * @param {string} volKey
 * @returns {Array<any[]> | null}
 */
function sectionsFor(volKey) {
  const s = _sections();
  return (s && s[volKey]) || null;
}

/**
 * Human label for a reader code, or null when unknown. The names live in
 * audio-track.js's AUDIO_READERS registry — one source of truth shared with the
 * listening desk's Voice chips and the Settings default-reader options.
 *
 * @param {string} code - 'B' | 'T' | 'V' | 'M'
 * @returns {string | null}
 */
function readerLabel(code) {
  return audioReaderLabel(code);
}

/* ── preferred reader (settings.letterReader) ─────────────────────────────
   'auto' (the default) means the manifest's own choice — Benjamin supersedes,
   then reader rank. A listener who prefers one voice sets it once in Settings
   and every letter that HAS a reading by that reader starts with it; letters
   that don't simply keep the primary. App keeps this in step through
   AudioPlayer.setPreferredReader (screen-routes), so the player never reaches
   into React state. */

/** @type {string} '' = automatic. */
let _preferredReader = '';

/**
 * @param {unknown} code - a reader code, or 'auto'/'' for the manifest primary
 * @returns {void}
 */
function setPreferredReader(code) {
  const next = typeof code === 'string' && code !== 'auto' && readerLabel(code) ? code : '';
  _preferredReader = next;
}

/**
 * The reader a start should use when the caller named none: the preference,
 * but only when this item actually HAS a reading by that reader. Null means
 * "leave the manifest's primary alone" — the one-line fallback.
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @returns {string | null}
 */
function _preferredReaderFor(volKey, item, collectionLabel) {
  if (!_preferredReader || !item) return null;
  return _renditionByReader(volKey, item, collectionLabel, _preferredReader) ? _preferredReader : null;
}

/**
 * Manifest parts for one corpus item → Tracks. Empty array when the item has
 * no audio (which is how playCollection skips it).
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @returns {Track[]}
 */
function _tracksFor(volKey, item, collectionLabel) {
  const m = _mapFor(volKey);
  if (!m || !item || !item.id) return [];
  const key = volKey + ':' + item.id;
  const parts = m[key];
  if (!parts || !parts.length) return [];
  // A per-chapter Bible edition titles by CHAPTER (owner directive
  // 2026-08-10): a book's parts share one item title, so 150 desk rows, 150
  // shelf rows, 150 bar titles and 150 native cards all read "Psalms" and told
  // the listener nothing about which one they were hearing. "Psalms 117" is
  // the recording's name; the chapter still rides partLabel as well, which is
  // where the desk's head line, the jump-to-text and the read credit read it.
  const byChapter = _isBibleVol(volKey) && parts.length > 1;
  const title = item.title || '';
  return parts.map((p) => {
    const partLabel = p[2] || null;
    const chapter = byChapter ? _chapterOfLabel(partLabel) : 0;
    return {
      key,
      title: chapter ? title + ' ' + chapter : title,
      sub: collectionLabel || null,
      url: _assetUrlFor(volKey, p[0]),
      readerCode: p[1] || '',
      partLabel,
    };
  });
}

/**
 * Every rendition of one letter, PRIMARY first. The manifest holds the single
 * reading the app picked (Benjamin supersedes, then reader rank); AUDIO_ALTERNATES
 * carries the other complete readings of the same letter so a listener can
 * choose a voice. Each entry is a standalone queue — never interleaved with
 * another reader's parts. Empty when the letter has no audio at all; Bible
 * editions have exactly one voice, so they return the primary alone.
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @returns {Rendition[]}
 */
function renditionsFor(volKey, item, collectionLabel) {
  const primary = _tracksFor(volKey, item, collectionLabel);
  if (!primary.length) return [];
  /** @type {Rendition[]} */
  const out = [{ reader: primary[0].readerCode || '', tracks: primary }];
  if (_isBibleVol(volKey)) return out;
  const alternates = _alternates();
  const key = volKey + ':' + (item && item.id);
  const pairs = alternates && item && item.id ? alternates[key] : null;
  if (!Array.isArray(pairs)) return out;
  for (const pair of pairs) {
    const reader = pair && pair[0];
    const rows = pair && pair[1];
    if (!reader || !Array.isArray(rows) || !rows.length) continue;
    out.push({
      reader,
      tracks: rows.map((row) => ({
        key,
        title: (item && item.title) || '',
        sub: collectionLabel || null,
        url: trackUrl(row[0]),
        readerCode: reader,
        partLabel: row[1] || null,
      })),
    });
  }
  return out;
}

/**
 * The rendition a listener asked for, or null when this letter has no reading
 * by that reader. Kept separate so every caller resolves a reader the same way.
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @param {string | null | undefined} reader
 * @returns {Rendition | null}
 */
function _renditionByReader(volKey, item, collectionLabel, reader) {
  if (!reader) return null;
  return renditionsFor(volKey, item, collectionLabel).find((r) => r.reader === reader) || null;
}

/* ── position persistence (owner directive 2026-08-06) ────────────────────
   Playback position survives app close AND phone restart. A tiny throttled
   localStorage snapshot (~300 bytes) records HOW the queue was built (its
   source descriptor) + the current track's display fields + the clock; on
   the next boot the bar reappears PAUSED at that position with zero network
   and zero corpus loading — the full queue is rebuilt lazily from the
   manifest on the first transport tap (the VOT corpus is a lazy bundle; the
   snapshot's display fields are what let the bar render before it loads).
   stop() (the ✕) and finishing the queue both CLEAR the snapshot. */

const PERSIST_KEY = 'vot-audio-pos';
/** How the current queue was built — replayed to rebuild it after a boot.
 * `custom` persists a user-edited queue rather than rebuilding corpus order.
 * `startKey`/`startIndex` record the queue's forward-only horizon (where the
 * listener chose to begin), so a rebuilt queue never regrows the tracks that
 * were deliberately left behind it. `startReader` records the voice chosen for
 * the start letter, so the rebuild resumes on that rendition and not the
 * manifest's primary one.
 * @type {{ mode: 'letter'|'collection'|'section'|'custom', volKey: string, label: string|null, startKey?: string|null, startIndex?: number|null, startReader?: string|null } | null} */
let _source = null;
/** Descriptor waiting for its queue rebuild (set only by _restoreFromSaved). */
let _pendingRestore = /** @type {any} */ (null);
/** Last persisted whole-second, so the 1 Hz tick writes every ~5s, not 1 Hz. */
let _lastPersistSec = -1;

/* Both descriptors above are module-private, but the listening desk has to
   DESCRIBE the queue they define — "1 recording" and a Restart-labelled prev
   are lies while a restore placeholder stands in for an unknown queue, and a
   voice switch must warn before discarding a queue the listener edited. Each
   gets one writer that mirrors the fact the desk needs into public state, so
   the mirror cannot drift from the descriptor. */

/** @param {typeof _source} next @returns {void} */
function _setSource(next) {
  _source = next;
  _state.sourceMode = next ? next.mode : '';
}

/** @param {any} next @returns {void} */
function _setPendingRestore(next) {
  _pendingRestore = next || null;
  _state.restoring = !!_pendingRestore;
}

/* ── durable per-recording positions (owner directive 2026-08-09) ─────────
   The snapshot above is ONE slot — it remembers the last thing playing, so
   starting anything else forgets where the reader was in everything else.
   AudioPositionsStore (bundle-b, reached by the fail-quiet globalThis bridge)
   holds the per-recording map beside it: URL → {t, d, at}.

   Everything here is best-effort by construction. Playback must never depend
   on the store: every call is wrapped, a missing bridge is a no-op, and the
   writes are throttled so a scrub or a busy tick can't become an IDB storm. */

/** Floor between position writes, ms. */
const POSITION_WRITE_MS = 1000;

/** Epoch ms of the last position write — the >= 1/s throttle. */
let _lastPositionWriteAt = 0;
/** URL of a track that just played to its end. Its record was deliberately
 *  deleted, so the advance it triggers must not write the position back. */
let _finishedUrl = /** @type {string | null} */ (null);

/**
 * Remember where a track was left — but only from a position that could ever
 * be RESUMED from.
 *
 * The floor is `AUDIO_RESUME_MIN_SEC`, applied uniformly (2026-08-10),
 * including at the forced stop/pause boundaries. It is not a throttle: a
 * position under 30 s can never resume — `_resumeAt` refuses it, and every
 * library row that quotes "N left" refuses it too — so storing one writes a
 * row that means exactly what having no row means, while consuming one of the
 * 200 LRU slots. Skipping chapters through a book used to file a dead row for
 * every chapter passed, evicting the real places the listener left. A zero
 * clock is covered by the same test, which matters because `_start()` sets
 * `_state.time = 0` before metadata lands and a piggybacked write there would
 * erase the very record a resume is about to read.
 *
 * @param {Track | null | undefined} track
 * @param {number} time
 * @param {number} duration
 * @param {boolean} [force] - bypass the throttle at a deliberate boundary
 *   (track change, stop, the ✕) where losing the write loses the position.
 * @returns {void}
 */
function _rememberPosition(track, time, duration, force) {
  try {
    const t = Number(time) || 0;
    if (!track || !track.url || !(t >= AUDIO_RESUME_MIN_SEC)) return;
    if (_finishedUrl && track.url === _finishedUrl) return;
    const now = Date.now();
    if (!force && now - _lastPositionWriteAt < POSITION_WRITE_MS) return;
    const store = _positions();
    if (!store || typeof store.setPosition !== 'function') return;
    _lastPositionWriteAt = now;
    store.setPosition(track, t, Number(duration) || 0);
  } catch (_e) { /* position memory must never stand between a tap and audio */ }
}

/** Write the CURRENT track's position — the piggyback for `_persist()`. */
function _rememberCurrentPosition(force) {
  _rememberPosition(_state.queue[_state.qi], _state.time, _state.duration, force);
}

/**
 * R8 — the position belongs to the track being LEFT. Every transport move that
 * mutates `_state.qi` calls this FIRST, or the outgoing clock lands on the
 * incoming recording.
 *
 * @returns {void}
 */
function _rememberOutgoingPosition() {
  _rememberCurrentPosition(true);
}

/** @param {string | null} url @returns {void} */
function _forgetPosition(url) {
  try {
    const store = _positions();
    if (url && store && typeof store.clearPosition === 'function') store.clearPosition(url);
  } catch (_e) { /* same rule: the map is an enhancement, never a dependency */ }
}

/**
 * Where a track should start, given what the map remembers. 0 means "from the
 * top" — either nothing is remembered, the listener barely began, or they
 * reached the tail (which reads as finished, not as a place to return to).
 *
 * A record with an UNKNOWN length (d = 0, metadata never arrived) resumes on
 * the clock alone: not knowing how long a recording runs is no reason to throw
 * away an hour of it.
 *
 * EMERGENT AND CORRECT: a recording shorter than ~31s can never resume, since
 * `t >= 30` and `t < 0.97 * d` together require d > 30 / 0.97 ≈ 30.9. Nothing
 * that brief is worth resuming — restarting it costs the listener half a
 * minute, and the rewind nudge would land at or before its beginning anyway.
 *
 * @param {Track | null | undefined} track
 * @returns {number} seconds to seek to, 0 for no resume
 */
function _resumeAt(track) {
  try {
    const store = _positions();
    if (!track || !track.url || !store || typeof store.getPosition !== 'function') return 0;
    const saved = store.getPosition(track.url);
    if (!saved) return 0;
    const t = Number(saved.t) || 0;
    const d = Number(saved.d) || 0;
    if (!(t >= AUDIO_RESUME_MIN_SEC)) return 0;
    if (d > 0 && t >= d * AUDIO_RESUME_END_FRACTION) return 0;
    return Math.max(0, t - AUDIO_RESUME_REWIND_SEC);
  } catch (_e) { return 0; }
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
function _seekOnMetadata(at) {
  if (!(at > 0) || !_el) return;
  // HAVE_METADATA (1) or better — duration and the seekable ranges are known,
  // which is the whole precondition the event was standing in for.
  if (_el.readyState >= 1) {
    try { /** @type {HTMLAudioElement} */ (_el).currentTime = at; } catch (_e) { /* unseekable — start over */ }
    return;
  }
  _el.addEventListener('loadedmetadata', () => {
    try { /** @type {HTMLAudioElement} */ (_el).currentTime = at; } catch (_e) { /* unseekable — start over */ }
  }, { once: true });
}

function _persist() {
  // Durable per-recording memory rides the same call sites as the boot
  // snapshot, and ahead of its localStorage guard: the two are independent.
  _rememberCurrentPosition(false);
  try {
    if (typeof localStorage === 'undefined') return;
    const src = _pendingRestore || _source;
    const track = _pendingRestore ? _state.queue[0] : _state.queue[_state.qi];
    const savedTrack = normalizeAudioTrack(track);
    if (!src || !savedTrack) return;
    const queueForCustomSource = _pendingRestore && Array.isArray(_pendingRestore.queue)
      ? _pendingRestore.queue
      : _state.queue;
    const customQueue = src.mode === 'custom'
      ? queueForCustomSource.map(normalizeAudioTrack).filter(Boolean)
      : undefined;
    localStorage.setItem(PERSIST_KEY, JSON.stringify({
      v: 2,
      mode: src.mode, volKey: src.volKey, label: src.label,
      qi: _pendingRestore ? _pendingRestore.qi : _state.qi,
      key: savedTrack.key,
      time: Math.floor(_state.time || 0),
      track: savedTrack,
      customQueue,
      startKey: src.startKey || undefined,
      startIndex: typeof src.startIndex === 'number' ? src.startIndex : undefined,
      startReader: src.startReader || undefined,
    }));
  } catch (_e) { /* storage full/blocked — resume is best-effort */ }
}

function _clearPersist() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(PERSIST_KEY); } catch (_e) { /* ditto */ }
}

/**
 * Boot-time restore: show the bar paused at the saved position. Pure display
 * state — one placeholder queue entry from the snapshot; the real queue is
 * rebuilt by _rebuildRestoredQueue() on the first transport tap.
 * @returns {void}
 */
function _restoreFromSaved() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || (s.v !== 1 && s.v !== 2)) return;
    const track = normalizeAudioTrack(s.track);
    const mode = s.mode === 'letter' || s.mode === 'collection' || s.mode === 'section' || s.mode === 'custom'
      ? s.mode
      : null;
    if (!track || !mode) return;
    const customQueue = mode === 'custom' && Array.isArray(s.customQueue)
      ? s.customQueue.map(normalizeAudioTrack).filter(Boolean)
      : [];
    if (mode === 'custom' && !customQueue.length) return;
    _setPendingRestore({
      mode,
      volKey: typeof s.volKey === 'string' ? s.volKey : '',
      label: typeof s.label === 'string' ? s.label : null,
      qi: Math.max(0, Math.floor(Number(s.qi) || 0)),
      key: typeof s.key === 'string' ? s.key : track.key,
      url: track.url,
      time: Math.max(0, Math.floor(Number(s.time) || 0)),
      queue: customQueue,
      startKey: typeof s.startKey === 'string' ? s.startKey : null,
      startIndex: Number.isInteger(s.startIndex) && s.startIndex >= 0 ? s.startIndex : null,
      startReader: typeof s.startReader === 'string' ? s.startReader : null,
    });
    _state.queue = [track];
    _state.qi = 0;
    _state.time = _pendingRestore.time;
    _state.duration = 0;
    _state.status = 'paused';
    _notify();
  } catch (_e) { _setPendingRestore(null); }
}

/**
 * Reader-alternate restore fidelity. `saved` is the placeholder track the bar
 * is already showing, which carries the reader when the snapshot predates the
 * startReader field. Every lookup that doesn't line up returns the queue
 * untouched, so a missing corpus or a retired alternate simply resumes on the
 * primary rendition rather than losing the position.
 *
 * @param {any} restore - the pending-restore descriptor
 * @param {Track[]} queue
 * @param {Track | undefined} saved
 * @returns {Track[]}
 */
function _withRestoredAlternate(restore, queue, saved) {
  try {
    const reader = restore.startReader || (saved && saved.readerCode) || '';
    if (!reader || !restore.key || !restore.url) return queue;
    const at = queue.findIndex((t) => t.key === restore.key);
    if (at < 0) return queue;
    const divider = restore.key.indexOf(':');
    if (divider <= 0) return queue;
    const item = { id: restore.key.slice(divider + 1), title: queue[at].title };
    const rendition = renditionsFor(restore.volKey, item, restore.label)
      .find((rd) => rd.reader === reader && rd.tracks.some((t) => t.url === restore.url));
    if (!rendition) return queue;
    let end = at;
    while (end < queue.length && queue[end].key === restore.key) end++;
    return queue.slice(0, at).concat(rendition.tracks, queue.slice(end));
  } catch (_e) { return queue; }
}

/**
 * Whole-book → per-chapter resume migration (2026-08-09, the BRM switch).
 *
 * A snapshot written before an edition moved to per-chapter tracks holds a
 * whole-book audio-bible-v1 URL and a clock measured against the WHOLE BOOK —
 * e.g. 9,000s into Genesis. The rebuilt queue is now one track per chapter, so
 * replaying that clock verbatim would seek 9,000s into a ~300s file: the
 * element reports 'ended' immediately and the listener's place is gone. Map
 * the book-relative time through BIBLE_AUDIO_CHAPTERS instead — the LAST
 * chapter start <= the saved time is the chapter, and the remainder is the
 * offset INSIDE that chapter.
 *
 * Every degradation lands on chapter 1 at 0. A deep seek into a short file is
 * the one outcome worth ruling out, so an absent/short index never guesses.
 *
 * @param {any} r - the pending-restore descriptor
 * @param {Track[]} queue - the rebuilt queue
 * @returns {{ qi: number, time: number } | null} null when nothing to migrate
 */
function _migrateWholeBookResume(r, queue) {
  if (!r || typeof r.url !== 'string' || typeof r.key !== 'string' || !r.key) return null;
  // Whole-book tracks exist on exactly one release, and only there.
  if (r.url.lastIndexOf(AUDIO_BIBLE_RELEASE_PREFIX, 0) !== 0) return null;
  if (queue.some((t) => t.url === r.url)) return null;   // still a whole-book queue
  const first = queue.findIndex((t) => t.key === r.key);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < queue.length && queue[last + 1].key === r.key) last++;
  if (last === first) return null;   // one part = not per-chapter; nothing to map
  const map = _g().BIBLE_AUDIO_CHAPTERS;
  const secs = map && map[r.key];
  const saved = Math.max(0, Number(r.time) || 0);
  if (!Array.isArray(secs) || !secs.length) return { qi: first, time: 0 };
  let chapter = 0;
  for (let i = 0; i < secs.length; i++) {
    const at = Number(secs[i]);
    if (!Number.isFinite(at) || at > saved) break;
    chapter = i;
  }
  // An index longer than the queue's chapters means the two disagree — take
  // the last real chapter from its start rather than an unbacked offset.
  if (chapter > last - first) return { qi: last, time: 0 };
  return { qi: first + chapter, time: Math.max(0, saved - (Number(secs[chapter]) || 0)) };
}

/**
 * Rebuild the full queue a _restoreFromSaved() bar stands in for, then start
 * at the saved track + position. Loads the lazy VOT corpus first when needed
 * (index.html's __loadVotCorpus is idempotent).
 * @returns {Promise<void>}
 */
async function _rebuildRestoredQueue() {
  const r = _pendingRestore;
  if (!r) return;
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  _setPendingRestore(null);
  const g = _g();
  if (r.mode !== 'custom') {
    try {
    if (_isBibleVol(r.volKey)) {
      if (!_bibleManifest() && typeof g.__loadBibleCorpus === 'function') await g.__loadBibleCorpus();
    } else if (!_manifest() && typeof g.__loadVotCorpus === 'function') await g.__loadVotCorpus();
  } catch (_e) { /* corpus load failed — fall through to the placeholder track */ }
  }
  /** @type {Track[]} */
  let queue = [];
  if (r.mode === 'custom') {
    queue = Array.isArray(r.queue) ? r.queue.map(normalizeAudioTrack).filter(Boolean) : [];
  } else if (r.mode === 'section') {
    // Forward-only horizon: rebuild only from the section the listener chose.
    const sections = (sectionsFor(r.volKey) || []).slice(r.startIndex || 0);
    queue = sections.map((s) => ({ key: null, title: s[0] || '', sub: r.label, url: trackUrl(s[1]), readerCode: s[2] || '', partLabel: null }));
  } else if (_isBibleVol(r.volKey)) {
    // Bible editions have no COL_BY_KEY registry — canonical book order ships
    // in the manifest bundle as BIBLE_AUDIO_BOOKS [[id, title], …]. Queue
    // scope is THE BOOK (owner directive 2026-08-10): whatever mode the
    // snapshot carries, only the saved track's book is rebuilt. Legacy
    // whole-Bible snapshots degrade to the same book scope via r.key.
    const books = Array.isArray(g.BIBLE_AUDIO_BOOKS) ? g.BIBLE_AUDIO_BOOKS : [];
    const items = books
      .filter((b) => r.key === r.volKey + ':' + b[0])
      .map((b) => ({ id: b[0], title: b[1] }));
    for (const item of items) {
      for (const t of _tracksFor(r.volKey, item, r.label)) queue.push(t);
    }
  } else {
    const col = (typeof g.COL_BY_KEY !== 'undefined') ? g.COL_BY_KEY.get(r.volKey) : null;
    const pref = (col && typeof g.colPreface === 'function') ? g.colPreface(col) : null;
    const arr = (col && typeof g.colLetterArr === 'function') ? g.colLetterArr(col) : [];
    const items = r.mode === 'letter'
      ? [pref, ...arr].filter((i) => i && (r.key === r.volKey + ':' + i.id))
      : (pref ? [pref, ...arr] : arr);
    for (const item of items) {
      for (const t of _tracksFor(r.volKey, item, r.label)) queue.push(t);
    }
  }
  // Forward-only horizon (owner directive 2026-08-09): a queue that began at
  // a chosen letter must rebuild from that letter, never regrowing the tracks
  // deliberately left behind it. Legacy snapshots without a startKey keep the
  // full rebuilt queue (a one-time transition; the next fresh queue records it).
  if (r.startKey && r.mode !== 'custom' && r.mode !== 'section') {
    const horizon = queue.findIndex((item) => item.key === r.startKey);
    if (horizon > 0) queue = queue.slice(horizon);
  }
  let resumeAt = r.time || 0;
  if (!queue.length) {
    // Corpus/manifest unavailable (or the letter vanished) — play the
    // placeholder track the bar is already showing; it has a real URL.
    queue = _state.queue.slice();
  }
  // A pre-per-chapter snapshot's URL is gone from this queue and its clock is
  // book-relative — translate both before the url/key search below, which
  // would otherwise land on chapter 1 and seek the whole book's time into it.
  const migrated = _migrateWholeBookResume(r, queue);
  if (migrated) resumeAt = migrated.time;
  let qi = migrated ? migrated.qi : (r.url ? queue.findIndex((item) => item.url === r.url) : -1);
  if (qi < 0 && r.key) {
    // A rebuilt queue always holds each letter's PRIMARY rendition, so a
    // listener resuming an alternate reader finds no url match. Swap that one
    // letter for the rendition that actually contains the saved track.
    queue = _withRestoredAlternate(r, queue, _state.queue[0]);
    qi = r.url ? queue.findIndex((item) => item.url === r.url) : -1;
  }
  if (qi < 0 && r.key) {
    const hits = queue.map((t, i) => ({ t, i })).filter((x) => x.t.key === r.key);
    if (hits.length) {
      // Multi-part letters share a key; land on the saved part when possible.
      const withinKey = Math.max(0, Math.min(hits.length - 1, (r.qi || 0) - hits[0].i));
      qi = hits[withinKey].i;
    }
  } else if (qi < 0) {
    qi = Math.max(0, Math.min(r.qi || 0, queue.length - 1));
  }
  _setSource({ mode: r.mode, volKey: r.volKey, label: r.label, startKey: r.startKey || null, startIndex: r.startIndex, startReader: r.startReader || null });
  _state.queue = queue;
  _state.qi = qi;
  _start();
  // The snapshot's own clock is authoritative here — it is the freshest thing
  // known about this exact track — so the boot restore does NOT consult the
  // per-recording map. Unchanged behavior; only the seek call is now shared.
  _seekOnMetadata(resumeAt);
}

/* ── playback entry points ────────────────────────────────────────────── */

/**
 * One listening DECISION: one lifetime play (the Milestones tier reads this)
 * and one row at the top of the recent shelf. Called only from the four entry
 * points a listener actually taps — never from _start(), which also runs for
 * auto-advance, next/prev, playAt and the boot-resume rebuild.
 *
 * recordPlayed moved here on 2026-08-10 for exactly the reason countPlay was
 * never in _start(): the shelf is capped at 30 rows, so one Genesis evening of
 * auto-advance flushed every letter out of it AND repointed "Resume last" at a
 * chapter nobody chose. The shelf answers "what did I put on" — a decision,
 * not a track boundary.
 *
 * The two counters are isolated from each other: a failing shelf write must
 * not cost the play count, and neither may stand between a tap and audio.
 *
 * @returns {void}
 */
function _countPlay() {
  try {
    const library = _library();
    if (!library) return;
    const track = _state.queue[_state.qi];
    try {
      if (track && typeof library.recordPlayed === 'function') library.recordPlayed(track);
    } catch (_e) { /* recent-history failures must not interfere with listening */ }
    try {
      if (typeof library.countPlay === 'function') library.countPlay();
    } catch (_e) { /* the milestones counter must never stand between a tap and audio */ }
  } catch (_e) { /* no library bridge at all — nothing to record */ }
}

/**
 * A collection's caller-ordered items (preface first where one exists), read
 * from the lazy VOT registry globals. Null when that registry has not landed —
 * every caller then falls back to the smaller queue it can build alone.
 *
 * @param {string} volKey
 * @returns {Array<any> | null}
 */
function _collectionItems(volKey) {
  const g = _g();
  const col = typeof g.COL_BY_KEY !== 'undefined' && g.COL_BY_KEY ? g.COL_BY_KEY.get(volKey) : null;
  if (!col || typeof g.colLetterArr !== 'function') return null;
  const preface = typeof g.colPreface === 'function' ? g.colPreface(col) : null;
  const letters = g.colLetterArr(col) || [];
  return preface ? [preface, ...letters] : letters;
}

/**
 * Where a stored recording sits in the LIVE corpus: the item it belongs to,
 * which of that item's renditions holds this exact asset, and which part or
 * chapter the asset is. Null when no manifest carries the URL at all — a
 * retired recording, or a legacy whole-book Bible asset whose edition now
 * ships per chapter — which is precisely when rebuilding a queue around it
 * would play something the listener never chose.
 *
 * Identity is the immutable URL, never the stored partLabel: the label is
 * display data a future manifest may reword, the URL cannot change.
 *
 * @param {{ key: string | null, title: string, sub: string | null, url: string }} track
 * @returns {{ volKey: string, id: string, bible: boolean, partIndex: number, reader: string } | null}
 */
function _locateTrack(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const divider = key.indexOf(':');
  if (divider < 1 || divider >= key.length - 1) return null;
  const volKey = key.slice(0, divider);
  const id = key.slice(divider + 1);
  if (_isBibleVol(volKey)) {
    const manifest = _bibleManifest();
    const parts = manifest && manifest[key];
    if (!Array.isArray(parts)) return null;
    const at = parts.findIndex((p) => p && bibleAudioAssetUrl(p[0]) === track.url);
    return at < 0 ? null : { volKey, id, bible: true, partIndex: at, reader: '' };
  }
  for (const rendition of renditionsFor(volKey, { id, title: track.title || '' }, track.sub)) {
    const at = rendition.tracks.findIndex((t) => t.url === track.url);
    if (at >= 0) return { volKey, id, bible: false, partIndex: at, reader: rendition.reader || '' };
  }
  return null;
}

/**
 * Play one letter (all of its parts, in order). `reader` picks a cross-reader
 * alternate rendition when the letter has one; with none named, the listener's
 * default voice (settings.letterReader) applies where this letter has a
 * reading by it. No-op when the letter has no audio; leaves state untouched
 * and toasts when offline.
 *
 * @param {{ volKey: string, letter: { id?: string, title?: string }, collectionLabel?: string, reader?: string }} opts
 * @returns {void}
 */
function playLetter(opts) {
  const o = opts || /** @type {any} */ ({});
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  let queue = _tracksFor(o.volKey, o.letter, o.collectionLabel);
  if (!queue.length) return;
  const reader = o.reader || _preferredReaderFor(o.volKey, o.letter, o.collectionLabel);
  // Album behavior (owner directive 2026-08-08): a hero Listen queues the
  // WHOLE collection positioned at this letter, so the bar's prev/next walk
  // neighboring letters and playback continues past the letter's end. The
  // registry globals live in index.html; when absent (tests, stripped
  // harnesses) the letter still plays alone.
  const items = o.letter && o.letter.id ? _collectionItems(o.volKey) : null;
  if (items && items.some((item) => item && item.id === o.letter.id)) {
    playCollection({ volKey: o.volKey, items, collectionLabel: o.collectionLabel, startId: o.letter.id, startReader: reader });
    return;
  }
  const rendition = _renditionByReader(o.volKey, o.letter, o.collectionLabel, reader);
  if (rendition) queue = rendition.tracks;
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'letter', volKey: o.volKey, label: o.collectionLabel || null });
  _state.queue = queue;
  _state.qi = 0;
  _countPlay();
  _start();
  _seekOnMetadata(_resumeAt(_state.queue[_state.qi]));
}

/**
 * Play a whole collection. `items` is caller-ordered (preface first where one
 * exists); items without a manifest entry are skipped, multi-part letters are
 * expanded in order. `startId` picks the starting track when present — and
 * (owner directive 2026-08-09) sets a FORWARD-ONLY horizon: the queue holds
 * the chosen letter and what follows it, never the letters behind it. A
 * reader stepping backward past where they began is disorienting; prev()
 * simply clamps at the chosen start. `startReader` swaps the START letter (and
 * only that letter) for another reader's complete rendition of it — the rest
 * of the collection keeps the manifest's primary reading.
 *
 * `startPartIndex` advances the horizon INTO the start item's parts (a
 * per-chapter Bible edition choosing chapter N) — same forward-only rule,
 * chapter-grained.
 *
 * @param {{ volKey: string, items: Array<{ id?: string, title?: string }>, collectionLabel?: string, startId?: string, startReader?: string, startPartIndex?: number, noResume?: boolean }} opts
 * @returns {void}
 */
function playCollection(opts) {
  const o = opts || /** @type {any} */ ({});
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  const items = Array.isArray(o.items) ? o.items : [];
  /** @type {Track[]} */
  let queue = [];
  for (const item of items) {
    const tracks = _tracksFor(o.volKey, item, o.collectionLabel);
    for (const t of tracks) queue.push(t);
  }
  if (!queue.length) return;
  let startKey = null;
  if (o.startId) {
    const wanted = o.volKey + ':' + o.startId;
    const at = queue.findIndex((t) => t.key === wanted);
    if (at >= 0) { startKey = wanted; queue = queue.slice(at); }
  }
  let startReader = null;
  if (startKey) {
    const startItem = items.find((item) => item && item.id === o.startId);
    // No explicit voice = the listener's default one, where this letter has a
    // reading by it (settings.letterReader; 'auto' resolves to null here).
    const wanted = o.startReader || _preferredReaderFor(o.volKey, startItem, o.collectionLabel);
    const rendition = wanted ? _renditionByReader(o.volKey, startItem, o.collectionLabel, wanted) : null;
    if (rendition) {
      let end = 0;
      while (end < queue.length && queue[end].key === startKey) end++;
      queue = rendition.tracks.concat(queue.slice(end));
      startReader = wanted;
    }
    // Part/chapter-grained horizon, applied AFTER the voice swap (2026-08-10)
    // so a chosen READING and a chosen PART compose — a library row that names
    // "Part 2, read by Timothy" rebuilds to exactly that, where the older
    // order let the rendition swap re-grow the parts the index had trimmed.
    const spi = Math.floor(Number(o.startPartIndex) || 0);
    if (spi > 0) {
      let run = 0;
      while (run < queue.length && queue[run].key === startKey) run++;
      queue = queue.slice(Math.min(spi, run - 1));
    }
  }
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'collection', volKey: o.volKey, label: o.collectionLabel || null, startKey, startReader });
  _state.queue = queue;
  _state.qi = 0;
  _countPlay();
  _start();
  // Durable resume consults the STARTING track only: everything queued behind
  // it is being reached in order, from its beginning. `noResume` exists for
  // the desk's voice switch — its promise is "starts this again", and a
  // remembered position in the OTHER voice would drop the listener
  // mid-sentence in a recording with different pacing.
  if (!o.noResume) _seekOnMetadata(_resumeAt(_state.queue[_state.qi]));
}

/**
 * Play a range-compilation section. The chosen section and the ones that
 * FOLLOW it are queued (the same forward-only horizon as playCollection);
 * next()/prev() walk between the remaining parts.
 *
 * @param {string} volKey
 * @param {number} index
 * @param {string} [collectionLabel]
 * @returns {void}
 */
function playSection(volKey, index, collectionLabel) {
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  const sections = sectionsFor(volKey);
  if (!sections || !sections.length) return;
  const startIndex = Math.max(0, Math.min(index || 0, sections.length - 1));
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'section', volKey, label: collectionLabel || null, startIndex });
  _state.queue = sections.slice(startIndex).map((s) => ({
    key: null,
    title: s[0] || '',
    sub: collectionLabel || null,
    url: trackUrl(s[1]),
    readerCode: s[2] || '',
    partLabel: null,
  }));
  _state.qi = 0;
  _countPlay();
  _start();
  // Section compilations (the 2-hour WTLB parts) are the best resume case of
  // all — same consult as every other entry point.
  _seekOnMetadata(_resumeAt(_state.queue[0]));
}

/**
 * Play one previously-saved or recently-played recording. Only normalized VOT
 * release assets can become a queue, including after a backup import, so this
 * is not an arbitrary remote-audio loader.
 *
 * CONTINUATION (owner directive 2026-08-10). A library row is a PLACE in the
 * corpus, not an island: it rebuilds the queue AROUND the recording, so
 * listening carries on past its last second exactly as it would had the same
 * recording been started from its own screen —
 *   - a Bible chapter rebuilds its BOOK, positioned at that chapter;
 *   - a letter rebuilds its collection from that letter forward (the s4
 *     forward-only album queue), on the RENDITION the row actually names;
 *   - anything the manifests no longer carry — a legacy whole-book Bible
 *     asset, a range compilation, a letter whose registry has not landed —
 *     still plays alone, which is the only case where a queue of one is the
 *     truth rather than a dead end four minutes long.
 * Every branch consults the per-recording resume map (playBibleBook and
 * playCollection each do their own `_resumeAt`), so the position the row
 * promises is honored in all three. There is no explicit chapter TAP on this
 * path, so nothing outranks that resume.
 *
 * @param {unknown} track
 * @returns {void}
 */
function playTrack(track) {
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  const normalized = normalizeAudioTrack(track);
  if (!normalized) return;
  const at = _locateTrack(normalized);
  if (at && at.bible) {
    // partIndex + 1 IS the chapter for a per-chapter edition, and 1 for a
    // whole-book one (whose chapter-start offset is 0, leaving resume to win).
    playBibleBook({ volKey: at.volKey, bookId: at.id, label: normalized.sub, chapterNum: at.partIndex + 1 });
    return;
  }
  if (at) {
    const items = _collectionItems(at.volKey);
    if (items && items.some((item) => item && item.id === at.id)) {
      playCollection({
        volKey: at.volKey, items, collectionLabel: normalized.sub, startId: at.id,
        // The row named a voice and a part; the rebuilt queue must open on
        // exactly those, not on the manifest's primary or the reader default.
        startReader: at.reader || undefined, startPartIndex: at.partIndex,
      });
      return;
    }
  }
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'custom', volKey: '', label: normalized.sub });
  _state.queue = [normalized];
  _state.qi = 0;
  _countPlay();
  _start();
  // What makes every unresolvable Listening Library row still pick up where the
  // reader left off instead of restarting from zero.
  _seekOnMetadata(_resumeAt(normalized));
}

/* ── transport ────────────────────────────────────────────────────────── */

/**
 * Pause when playing, resume when paused, no-op when idle.
 *
 * @returns {void}
 */
function toggle() {
  if (_state.status === 'idle') return;
  // A restored bar has no live element yet — the first tap rebuilds the real
  // queue from the persisted descriptor and starts at the saved position.
  if (_pendingRestore) { void _rebuildRestoredQueue(); return; }
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
  if (_el.error) {
    // A failed element stays failed until src is re-assigned. Re-load it and
    // seek back to where playback died once metadata is available (currentTime
    // can't be set before then).
    const resumeAt = _errorTime;
    _el.src = track.url;
    _el.addEventListener('loadedmetadata', () => {
      try { /** @type {HTMLAudioElement} */ (_el).currentTime = resumeAt; } catch (_e) { /* unseekable — restart from 0 */ }
    }, { once: true });
  }
  const p = _el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

/**
 * Advance one track; stop() at the end of the queue. Also the 'ended' handler.
 *
 * @returns {void}
 */
function next() {
  if (!_state.queue.length) return;
  if (_pendingRestore) { void _rebuildRestoredQueue(); return; }
  _rememberOutgoingPosition();   // R8 — attribute the clock before qi moves
  if (_state.qi + 1 >= _state.queue.length) { stop(); return; }
  _state.qi++;
  _start();
  _lastPersistSec = -1;
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
function prev() {
  if (!_state.queue.length) return;
  if (_pendingRestore) { void _rebuildRestoredQueue(); return; }
  if (_el && (_el.currentTime || 0) > PREV_RESTART_SEC) { seek(0); return; }
  const target = Math.max(0, _state.qi - 1);
  // Landing on the track already playing: a seek, not a reload — the stream
  // stays open and the position is the only thing that moves.
  if (target === _state.qi && _el) { seek(0); return; }
  _rememberOutgoingPosition();   // R8 — same rule stepping backwards
  _state.qi = target;
  _start();
  _lastPersistSec = -1;
  _persist();
}

/**
 * Seek within the current track. Clamped to [0, duration].
 *
 * @param {number} seconds
 * @returns {void}
 */
function seek(seconds) {
  if (!_el) return;
  const max = _state.duration || _el.duration || 0;
  const t = Math.max(0, Math.min(seconds || 0, max || 0));
  try { _el.currentTime = t; } catch (_e) { /* not seekable yet — state still reflects intent */ }
  _state.time = t;
  _lastTick = Math.floor(t);
  _syncMediaSessionPosition();
  _syncNative();   // a position JUMP breaks the card's interpolation — resync
  _notify();
  // A paused seek is a deliberate reposition — snapshot it now, or closing
  // the app right after would resume at the pre-seek position.
  _lastPersistSec = _lastTick;
  _persist();
}

/**
 * Seek relative to the current clock. Used by the manager's deliberate
 * short-jump controls instead of duplicating clamp logic in the UI.
 *
 * @param {number} seconds
 * @returns {void}
 */
function skip(seconds) {
  seek((_state.time || 0) + (Number(seconds) || 0));
}

/**
 * Set the selected playback-rate preset and persist it in the Listening
 * Library. Playback itself never depends on the metadata store succeeding.
 *
 * @param {unknown} rate
 * @returns {number}
 */
function setPlaybackRate(rate) {
  const next = normalizeAudioRate(rate);
  const changed = _state.rate !== next;
  _state.rate = next;
  if (_el) {
    // Default too: the next load algorithm resets playbackRate to default.
    try { _el.defaultPlaybackRate = next; _el.playbackRate = next; } catch (_e) { /* unsupported engines retain normal speed */ }
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
 * @returns {number} seconds remaining, rounded down; 0 means unarmed/expired.
 */
function getSleepRemainingSeconds() {
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
function setSleepTimer(minutes) {
  const mins = Math.max(1, Math.min(120, Math.floor(Number(minutes) || 0)));
  if (_state.status === 'idle' || !_state.queue.length) return false;
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  _state.sleepAtTrackEnd = false;   // one sleep arming at a time
  _state.sleepEndsAt = Date.now() + mins * 60000;
  // The PRESET, kept beside the deadline: the desk shows which chip is armed,
  // and the remaining seconds cannot answer that (a 30-minute timer with 15
  // minutes left is not the 15-minute chip).
  _state.sleepMinutes = mins;
  _sleepTimer = setTimeout(() => {
    _sleepTimer = null;
    _state.sleepEndsAt = 0;
    _state.sleepMinutes = 0;
    const wasLive = _state.status === 'playing' || _state.status === 'loading';
    if (wasLive && _el) _el.pause();
    _markPaused();
    if (!wasLive) _notify();
    if (wasLive) _toast('Sleep timer ended. Playback paused.');
  }, mins * 60000);
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
function setSleepAtTrackEnd() {
  if (_state.status === 'idle' || !_state.queue.length) return false;
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  _state.sleepEndsAt = 0;
  _state.sleepMinutes = 0;
  _state.sleepAtTrackEnd = true;
  _notify();
  return true;
}

/** Disarms both sleep modes. @returns {void} */
function clearSleepTimer() { _clearSleepTimer(); }

/**
 * Jump directly to a queued track. Queue order remains intact, so a normal
 * collection source can still be rebuilt on the next app launch.
 *
 * @param {number} index
 * @returns {void}
 */
function playAt(index) {
  if (_pendingRestore || !_state.queue.length) return;
  const nextIndex = Math.floor(Number(index));
  if (!Number.isFinite(nextIndex) || nextIndex < 0 || nextIndex >= _state.queue.length) return;
  _rememberOutgoingPosition();   // R8 — the jumped-away-from track keeps its clock
  _state.qi = nextIndex;
  _start();
  _lastPersistSec = -1;
  _persist();
}

/** @param {Track[]} queue */
function _commitQueueEdit(queue) {
  _state.queue = queue;
  const current = queue[_state.qi];
  _setSource({ mode: 'custom', volKey: '', label: current ? current.sub : null });
  // A queue edit is the one queue-SHAPE change with no track start behind it,
  // so the host media card's skip handlers have to be re-decided here.
  _syncMediaSessionActions();
  _persist();
  _notify();
}

/**
 * Remove one future item. The playing item is intentionally protected so a
 * mistaken tap cannot tear down an active stream.
 *
 * @param {number} index
 * @returns {boolean}
 */
function removeUpcoming(index) {
  if (_pendingRestore) return false;
  const at = Math.floor(Number(index));
  if (!Number.isFinite(at) || at <= _state.qi || at >= _state.queue.length) return false;
  const queue = _state.queue.slice();
  queue.splice(at, 1);
  _commitQueueEdit(queue);
  return true;
}

/**
 * Reorder only future items. Keeping the current track fixed makes the
 * operation stable while a recording is streaming.
 *
 * @param {number} from
 * @param {number} to
 * @returns {boolean}
 */
function moveUpcoming(from, to) {
  if (_pendingRestore) return false;
  const fromIndex = Math.floor(Number(from));
  const toIndex = Math.floor(Number(to));
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) ||
      fromIndex <= _state.qi || fromIndex >= _state.queue.length ||
      toIndex <= _state.qi || toIndex >= _state.queue.length || fromIndex === toIndex) return false;
  const queue = _state.queue.slice();
  const [track] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, track);
  _commitQueueEdit(queue);
  return true;
}

/** @returns {boolean} */
function clearUpcoming() {
  if (_pendingRestore || _state.qi + 1 >= _state.queue.length) return false;
  _commitQueueEdit(_state.queue.slice(0, _state.qi + 1));
  return true;
}

/**
 * Stop playback and clear the queue. Dropping `src` + load() tears down the
 * live release-asset connection — a merely-paused element keeps holding it.
 *
 * @returns {void}
 */
function stop() {
  const wasActive = _state.status !== 'idle';
  // The ✕ means "I'm done with THIS SESSION", not "forget where I was": the
  // per-recording map survives, so closing the bar no longer erases the place
  // in a 90-minute reading. Written before the live state is cleared.
  _rememberCurrentPosition(true);
  // The boot snapshot is the part that must not resurrect the bar.
  _setPendingRestore(null);
  _setSource(null);
  _clearPersist();
  _clearStallWatchdog();
  _clearSleepTimer(false);
  _stopWarming();
  if (_el) {
    try { _el.pause(); } catch (_e) { /* already detached */ }
    _el.src = '';
    try { _el.load(); } catch (_e) { /* jsdom / older WebViews */ }
  }
  _state.queue = [];
  _state.qi = 0;
  _state.time = 0;
  _state.duration = 0;
  _state.status = 'idle';
  _lastTick = -1;
  _errorTime = 0;
  _prewarmKey = null;
  _clearMediaSession();
  if (wasActive) _setAudioActive(false);
  _notify();
}

/**
 * Pause only if currently playing. Called by the journal voice recorder before
 * it takes the mic.
 *
 * @returns {void}
 */
function pauseIfPlaying() {
  if ((_state.status === 'playing' || _state.status === 'loading') && _el) {
    _el.pause();
    _markPaused();
  }
}

/* ── store contract ───────────────────────────────────────────────────── */

/**
 * @param {() => void} callback
 * @returns {() => void} unsubscribe
 */
function subscribe(callback) {
  _listeners.add(callback);
  return () => { _listeners.delete(callback); };
}

/**
 * Monotonic version counter — the useSyncExternalStore snapshot.
 *
 * @returns {number}
 */
function getVersion() { return _version; }

/**
 * The LIVE state object (not a copy — a per-call clone would allocate on every
 * timeupdate). Callers MUST treat it, and the Track objects inside `queue`, as
 * READ-ONLY; mutating them corrupts the store without bumping the version.
 *
 * @returns {AudioPlayerState}
 */
function getState() { return _state; }

/**
 * The element's LIVE position, not the store's. `_state.time` is only notified
 * when the whole SECOND changes (the timeupdate re-render guard above), which
 * is the right cadence for a displayed clock and far too coarse for anything
 * that has to land on a syllable — read-along's rAF driver reads this instead.
 * Deliberately notifies nothing and allocates nothing: it is a pull, called up
 * to once per animation frame. Falls back to the store's value before the
 * element exists (boot-restore placeholder) so the caller never sees NaN.
 *
 * @returns {number}
 */
function getPreciseTime() { return _el ? (_el.currentTime || 0) : _state.time; }

// Boot-time durable-resume: if a prior session left a position snapshot, put
// the bar up PAUSED at that spot (display-only state; no network, no corpus).
// Runs at module eval — deliberately touches only localStorage + _state.
_restoreFromSaved();

/** The singleton audio player store. */
export const AudioPlayer = {
  subscribe,
  getVersion,
  getState,
  getPreciseTime,
  hasAudio,
  prewarm,
  firstReaderCode,
  collectionHasAudio,
  sectionsFor,
  readerLabel,
  renditionsFor,
  setPreferredReader,
  playLetter,
  playCollection,
  playSection,
  playBibleBook,
  bibleChapterStart,
  bibleChapterOfTrack,
  playTrack,
  toggle,
  next,
  prev,
  seek,
  skip,
  setPlaybackRate,
  getSleepRemainingSeconds,
  setSleepTimer,
  setSleepAtTrackEnd,
  clearSleepTimer,
  playAt,
  removeUpcoming,
  moveUpcoming,
  clearUpcoming,
  stop,
  pauseIfPlaying,
};
