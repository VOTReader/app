// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   audio-player — streaming audio-letter playback (singleton store)
   ═══════════════════════════════════════════════════════════════════════
   Letters across the 14 VOT collections stream from immutable GitHub Release
   assets. src/data/audio-manifest.js (auto-generated, rides bundle-a-vot)
   maps corpus ids to asset ids; this module turns that into a queue and
   drives ONE <audio> element.

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
  audioAssetUrl,
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
 * @typedef {Object} AudioPlayerState
 * @property {'idle'|'loading'|'playing'|'paused'} status
 * @property {Track[]} queue
 * @property {number} qi        - index of the playing track within queue
 * @property {number} time      - current position, seconds
 * @property {number} duration  - current track length, seconds (0 until known)
 * @property {number} rate      - selected playback-rate preset
 * @property {number} sleepEndsAt - epoch ms, 0 when no sleep timer is armed
 */

/** Shared DOM id so every audio message replaces the previous one. */
export const AUDIO_TOAST_ID = 'vot-toast-audio';

const OFFLINE_MSG = 'Playing audio requires an internet connection.';
const LOAD_FAIL_MSG = 'Couldn’t load this track.';

/** Restart-vs-step-back threshold for prev(), seconds (the usual media convention). */
const PREV_RESTART_SEC = 3;

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
const _state = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, sleepEndsAt: 0 };
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
/** @returns {Record<string, Array<any[]>> | null} */
const _manifest = () => _g().AUDIO_MANIFEST || null;
/** @returns {Record<string, Array<any[]>> | null} */
const _sections = () => _g().AUDIO_SECTIONS || null;
/** Bible-edition manifest — rides bundle-a (critical path), so it exists from boot. */
const _bibleManifest = () => _g().BIBLE_AUDIO_MANIFEST || null;
/** 'bible-*' volKeys stream whole-book audiobooks from the audio-bible release. */
const _isBibleVol = (volKey) => typeof volKey === 'string' && volKey.lastIndexOf('bible-', 0) === 0;
/** The manifest a volKey's entries live in. */
const _mapFor = (volKey) => (_isBibleVol(volKey) ? _bibleManifest() : _manifest());
/** Release-aware asset → stream URL for a volKey's tracks. */
const _assetUrlFor = (volKey, id) => (_isBibleVol(volKey) ? bibleAudioAssetUrl(id) : trackUrl(id));

/** The watchdog is valid only while playback is actively loading. */
function _clearStallWatchdog() {
  if (_stallTimer) { clearTimeout(_stallTimer); _stallTimer = null; }
}

/** @returns {void} */
function _clearSleepTimer(notify = true) {
  if (_sleepTimer) { clearTimeout(_sleepTimer); _sleepTimer = null; }
  if (_state.sleepEndsAt) {
    _state.sleepEndsAt = 0;
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
  // Keep-alive tracks PLAYBACK, not buffering: 'loading' is a mid-stream stall
  // ('waiting'), and releasing the wake-lock there would let the OS kill the
  // very playback we're waiting on.
  if (next === 'playing') _setAudioActive(true);
  else if (next === 'paused' || next === 'idle') _setAudioActive(false);
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
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = /** @type {any} */ (navigator).mediaSession;
    const MM = _g().MediaMetadata;
    const reader = readerLabel(track.readerCode);
    if (typeof MM === 'function') {
      ms.metadata = new MM({
        title: track.title + (track.partLabel ? ' — ' + track.partLabel : ''),
        artist: 'The Volumes of Truth' + (reader ? ' · ' + reader : ''),
        album: track.sub || '',
      });
    }
    ms.setActionHandler('play', () => toggle());
    ms.setActionHandler('pause', () => toggle());
    ms.setActionHandler('previoustrack', () => prev());
    ms.setActionHandler('nexttrack', () => next());
    ms.setActionHandler('seekto', (/** @type {any} */ d) => seek((d && d.seekTime) || 0));
    _syncMediaSessionState(_state.status);
    _syncMediaSessionPosition();
  } catch (_e) { /* unsupported action / no Media Session — cosmetic only */ }
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
}

/** @param {'idle'|'loading'|'playing'|'paused'} status */
function _syncMediaSessionState(status) {
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
    for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']) {
      ms.setActionHandler(a, null);
    }
    ms.metadata = null;
    ms.playbackState = 'none';
  } catch (_e) { /* same guards as _mediaSession */ }
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
  el.addEventListener('ended', () => { _notifyListened(); next(); });
  el.addEventListener('error', _onError);

  _el = el;
  return el;
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
    // audiobook download, not a head-of-file cache fill. Letters only.
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
 * A letter finished playing to its end (owner directive 2026-08-09: a full
 * listen counts like a full read — the item's read count increments). Fired
 * from 'ended' BEFORE next() advances. Multi-part letters notify only when
 * their LAST part ends; range-compilation sections carry key null and never
 * notify. The App-side bridge (useReadProgress) owns the actual counting.
 */
function _notifyListened() {
  try {
    const track = _state.queue[_state.qi];
    if (!track || !track.key) return;
    const following = _state.queue[_state.qi + 1];
    if (following && following.key === track.key) return;   // more parts remain
    const g = _g();
    if (typeof g.__votAudioListened !== 'function') return;
    const divider = track.key.indexOf(':');
    if (divider <= 0) return;
    g.__votAudioListened(track.key.slice(0, divider), track.key.slice(divider + 1));
  } catch (_e) { /* listen counting must never interfere with queue advance */ }
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
  try {
    const library = _library();
    if (library && typeof library.recordPlayed === 'function') library.recordPlayed(track);
  } catch (_e) { /* recent-history failures must not interfere with listening */ }
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
 * Play a whole-book Bible audiobook, queueing the ENTIRE edition positioned
 * at this book (the letters' album behavior, book-sized). Book order + titles
 * come from BIBLE_AUDIO_BOOKS, which ships in the same lazy bundle as the
 * Bible corpus — any screen showing a Listen pill has it by construction.
 *
 * @param {{ volKey: string, bookId: string, label?: string | null }} opts
 * @returns {void}
 */
function playBibleBook(opts) {
  const o = opts || /** @type {any} */ ({});
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  const books = Array.isArray(_g().BIBLE_AUDIO_BOOKS) ? _g().BIBLE_AUDIO_BOOKS : [];
  const items = books.map((b) => ({ id: b[0], title: b[1] }));
  if (!items.length) return;
  playCollection({ volKey: o.volKey, items, collectionLabel: o.label || null, startId: o.bookId });
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
 * Human label for a reader code, or null when unknown.
 *
 * @param {string} code - 'B' | 'T' | 'V' | 'M'
 * @returns {string | null}
 */
function readerLabel(code) {
  if (code === 'B') return 'Read by Benjamin';
  if (code === 'T') return 'Read by Timothy';
  if (code === 'V') return 'Text-to-speech';
  if (code === 'M') return 'AI reading with music';
  return null;
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
  return parts.map((p) => ({
    key,
    title: item.title || '',
    sub: collectionLabel || null,
    url: _assetUrlFor(volKey, p[0]),
    readerCode: p[1] || '',
    partLabel: p[2] || null,
  }));
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
 * @type {{ mode: 'letter'|'collection'|'section', volKey: string, label: string|null } | null} */
/** `custom` persists a user-edited queue rather than rebuilding corpus order. */
/** @type {{ mode: 'letter'|'collection'|'section'|'custom', volKey: string, label: string|null } | null} */
let _source = null;
/** Descriptor waiting for its queue rebuild (set only by _restoreFromSaved). */
let _pendingRestore = /** @type {any} */ (null);
/** Last persisted whole-second, so the 1 Hz tick writes every ~5s, not 1 Hz. */
let _lastPersistSec = -1;

function _persist() {
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
    _pendingRestore = {
      mode,
      volKey: typeof s.volKey === 'string' ? s.volKey : '',
      label: typeof s.label === 'string' ? s.label : null,
      qi: Math.max(0, Math.floor(Number(s.qi) || 0)),
      key: typeof s.key === 'string' ? s.key : track.key,
      url: track.url,
      time: Math.max(0, Math.floor(Number(s.time) || 0)),
      queue: customQueue,
    };
    _state.queue = [track];
    _state.qi = 0;
    _state.time = _pendingRestore.time;
    _state.duration = 0;
    _state.status = 'paused';
    _notify();
  } catch (_e) { _pendingRestore = null; }
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
  _pendingRestore = null;
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
    const sections = sectionsFor(r.volKey) || [];
    queue = sections.map((s) => ({ key: null, title: s[0] || '', sub: r.label, url: trackUrl(s[1]), readerCode: s[2] || '', partLabel: null }));
  } else if (_isBibleVol(r.volKey)) {
    // Bible editions have no COL_BY_KEY registry — canonical book order ships
    // in the manifest bundle as BIBLE_AUDIO_BOOKS [[id, title], …].
    const books = Array.isArray(g.BIBLE_AUDIO_BOOKS) ? g.BIBLE_AUDIO_BOOKS : [];
    const all = books.map((b) => ({ id: b[0], title: b[1] }));
    const items = r.mode === 'letter'
      ? all.filter((i) => r.key === r.volKey + ':' + i.id)
      : all;
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
  const resumeAt = r.time || 0;
  if (!queue.length) {
    // Corpus/manifest unavailable (or the letter vanished) — play the
    // placeholder track the bar is already showing; it has a real URL.
    queue = _state.queue.slice();
  }
  let qi = r.url ? queue.findIndex((item) => item.url === r.url) : -1;
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
  _source = { mode: r.mode, volKey: r.volKey, label: r.label };
  _state.queue = queue;
  _state.qi = qi;
  _start();
  // Seek once the element can honor it; loadedmetadata is the earliest safe
  // moment (currentTime assignment before that is ignored or throws).
  if (resumeAt > 0 && _el) {
    _el.addEventListener('loadedmetadata', () => {
      try { /** @type {HTMLAudioElement} */ (_el).currentTime = resumeAt; } catch (_e) { /* unseekable — start over */ }
    }, { once: true });
  }
}

/* ── playback entry points ────────────────────────────────────────────── */

/**
 * Play one letter (all of its parts, in order). No-op when the letter has no
 * audio; leaves state untouched and toasts when offline.
 *
 * @param {{ volKey: string, letter: { id?: string, title?: string }, collectionLabel?: string }} opts
 * @returns {void}
 */
function playLetter(opts) {
  const o = opts || /** @type {any} */ ({});
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  const queue = _tracksFor(o.volKey, o.letter, o.collectionLabel);
  if (!queue.length) return;
  // Album behavior (owner directive 2026-08-08): a hero Listen queues the
  // WHOLE collection positioned at this letter, so the bar's prev/next walk
  // neighboring letters and playback continues past the letter's end. The
  // registry globals live in index.html; when absent (tests, stripped
  // harnesses) the letter still plays alone.
  const g = _g();
  const col = typeof g.COL_BY_KEY !== 'undefined' && g.COL_BY_KEY ? g.COL_BY_KEY.get(o.volKey) : null;
  if (col && typeof g.colLetterArr === 'function' && o.letter && o.letter.id) {
    const pref = typeof g.colPreface === 'function' ? g.colPreface(col) : null;
    const arr = g.colLetterArr(col) || [];
    const items = pref ? [pref, ...arr] : arr;
    if (items.some((item) => item && item.id === o.letter.id)) {
      playCollection({ volKey: o.volKey, items, collectionLabel: o.collectionLabel, startId: o.letter.id });
      return;
    }
  }
  _pendingRestore = null;
  _source = { mode: 'letter', volKey: o.volKey, label: o.collectionLabel || null };
  _state.queue = queue;
  _state.qi = 0;
  _start();
}

/**
 * Play a whole collection. `items` is caller-ordered (preface first where one
 * exists); items without a manifest entry are skipped, multi-part letters are
 * expanded in order. `startId` picks the starting track when present.
 *
 * @param {{ volKey: string, items: Array<{ id?: string, title?: string }>, collectionLabel?: string, startId?: string }} opts
 * @returns {void}
 */
function playCollection(opts) {
  const o = opts || /** @type {any} */ ({});
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  const items = Array.isArray(o.items) ? o.items : [];
  /** @type {Track[]} */
  const queue = [];
  for (const item of items) {
    const tracks = _tracksFor(o.volKey, item, o.collectionLabel);
    for (const t of tracks) queue.push(t);
  }
  if (!queue.length) return;
  let qi = 0;
  if (o.startId) {
    const wanted = o.volKey + ':' + o.startId;
    const at = queue.findIndex((t) => t.key === wanted);
    if (at >= 0) qi = at;
  }
  _pendingRestore = null;
  _source = { mode: 'collection', volKey: o.volKey, label: o.collectionLabel || null };
  _state.queue = queue;
  _state.qi = qi;
  _start();
}

/**
 * Play a range-compilation section. The whole section list is queued so
 * next()/prev() walk between parts; `index` selects the starting one.
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
  _pendingRestore = null;
  _source = { mode: 'section', volKey, label: collectionLabel || null };
  _state.queue = sections.map((s) => ({
    key: null,
    title: s[0] || '',
    sub: collectionLabel || null,
    url: trackUrl(s[1]),
    readerCode: s[2] || '',
    partLabel: null,
  }));
  _state.qi = Math.max(0, Math.min(index || 0, _state.queue.length - 1));
  _start();
}

/**
 * Play one previously-saved or recently-played recording. Only normalized VOT
 * release assets can become a standalone queue, including after a backup
 * import, so this is not an arbitrary remote-audio loader.
 *
 * @param {unknown} track
 * @returns {void}
 */
function playTrack(track) {
  if (_offline()) { _toast(OFFLINE_MSG); return; }
  const normalized = normalizeAudioTrack(track);
  if (!normalized) return;
  _pendingRestore = null;
  _source = { mode: 'custom', volKey: '', label: normalized.sub };
  _state.queue = [normalized];
  _state.qi = 0;
  _start();
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
  if (_state.qi + 1 >= _state.queue.length) { stop(); return; }
  _state.qi++;
  _start();
  _lastPersistSec = -1;
  _persist();   // track boundary — remember the new position immediately
}

/**
 * Restart the current track when it's more than PREV_RESTART_SEC in;
 * otherwise step back one (clamped at the head of the queue).
 *
 * @returns {void}
 */
function prev() {
  if (!_state.queue.length) return;
  if (_pendingRestore) { void _rebuildRestoredQueue(); return; }
  if (_el && (_el.currentTime || 0) > PREV_RESTART_SEC) { seek(0); return; }
  _state.qi = Math.max(0, _state.qi - 1);
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
  _state.sleepEndsAt = Date.now() + mins * 60000;
  _sleepTimer = setTimeout(() => {
    _sleepTimer = null;
    _state.sleepEndsAt = 0;
    const wasLive = _state.status === 'playing' || _state.status === 'loading';
    if (wasLive && _el) _el.pause();
    _markPaused();
    if (!wasLive) _notify();
    if (wasLive) _toast('Sleep timer ended. Playback paused.');
  }, mins * 60000);
  _notify();
  return true;
}

/** @returns {void} */
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
  _state.qi = nextIndex;
  _start();
  _lastPersistSec = -1;
  _persist();
}

/** @param {Track[]} queue */
function _commitQueueEdit(queue) {
  _state.queue = queue;
  const current = queue[_state.qi];
  _source = { mode: 'custom', volKey: '', label: current ? current.sub : null };
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
  // The ✕ means "I'm done with this" — a later boot must not resurrect it.
  _pendingRestore = null;
  _source = null;
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

// Boot-time durable-resume: if a prior session left a position snapshot, put
// the bar up PAUSED at that spot (display-only state; no network, no corpus).
// Runs at module eval — deliberately touches only localStorage + _state.
_restoreFromSaved();

/** The singleton audio player store. */
export const AudioPlayer = {
  subscribe,
  getVersion,
  getState,
  hasAudio,
  prewarm,
  firstReaderCode,
  collectionHasAudio,
  sectionsFor,
  readerLabel,
  playLetter,
  playCollection,
  playSection,
  playBibleBook,
  playTrack,
  toggle,
  next,
  prev,
  seek,
  skip,
  setPlaybackRate,
  getSleepRemainingSeconds,
  setSleepTimer,
  clearSleepTimer,
  playAt,
  removeUpcoming,
  moveUpcoming,
  clearUpcoming,
  stop,
  pauseIfPlaying,
};
