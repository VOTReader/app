// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   audio-player — streaming playback for letters and Bible (singleton store)
   ═══════════════════════════════════════════════════════════════════════
   Two corpora stream from immutable GitHub Release assets: letters across the
   14 VOT collections (src/data/audio-manifest.js, auto-generated, rides
   bundle-a-vot) and the recorded Bible editions, which are PER-CHAPTER —
   1,189 tracks each (src/data/bible-audio-manifest.js, rides bundle-a). Both
   map ids to asset ids; this module turns either into a queue and drives ONE
   <audio> element. A third source, the flock's Songs of the Letters, comes
   from a catalog (utils/song-catalog.js) and rides the same element as
   `song:<id>` tracks — see playSongs. Deep reference: ARCHITECTURE.md § Audio
   subsystem; docs/AUDIO-MANAGER.md.

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
import { OfflineAudio } from './offline-audio.js';
import { loadAudioSyncSections } from './sync-loaders.js';
import { NativeAudio, nativeAudioAvailable } from './native-audio.js';
import {
  AUDIO_BIBLE_RELEASE_PREFIX,
  AUDIO_RESUME_END_FRACTION,
  AUDIO_RESUME_MIN_SEC,
  AUDIO_RESUME_REWIND_SEC,
  BIBLE_AUDIO_EDITIONS,
  audioAssetUrl,
  audioReaderLabel,
  bibleAudioAssetUrl,
  bibleReleaseTagFor,
  isSongId,
  isSongKey,
  isSongUrl,
  isVotAudioUrl,
  normalizeAudioRate,
  normalizeAudioTrack,
  songIdOfKey,
} from './audio-track.js';
import {
  cleanSongSwaps,
  loadSongCatalog,
  normalizeSongFilter,
  seededShuffle,
  songById,
  songQueue,
  songThumbUrl,
  songTrack,
} from './song-catalog.js';

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
 * @property {'letter'|'collection'|'section'|'custom'|'songs'|''} sourceMode - how this
 *   queue was built; 'custom' means a user-edited queue or a lone recording
 * @property {boolean} shuffle - a songs queue plays in a seeded shuffle (songs only)
 * @property {'off'|'one'|'all'} repeat - a songs queue replays its song or wraps
 *   at its end; reset to 'off' by any queue that is not songs, so a letter never loops
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
/** True once _ensureEl chose the native stand-in (native-audio.js, m3). */
let _native = false;
/** Songs passed over in a row because they would not play (n3-03); a song that plays resets it. */
let _songSkips = 0;
const SONG_SKIP_CAP = 3;
const SONG_SKIP_MSG = "Couldn't play this song. Skipping to the next.";
/* Bumped by every start. A `loadedmetadata` seek captures it when armed and
   refuses to fire once it has moved — see _seekOnMetadata. */
let _seekGen = 0;
/** @type {Set<() => void>} */
const _listeners = new Set();
let _version = 0;
/** @type {AudioPlayerState} */
const _state = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false, restoring: false, sourceMode: /** @type {'letter'|'collection'|'section'|'custom'|'songs'|''} */ (''), shuffle: false, repeat: /** @type {'off'|'one'|'all'} */ ('off') };
/** The READING speed — the listener's chosen rate for letters and chapters.
 *  `_state.rate` is the EFFECTIVE rate of what is playing, which is 1 for a
 *  song: the reader's 1.5× must not warp music (W3-05), and it must come back
 *  unchanged on the next reading. */
let _readingRate = 1;
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
/** A Songs of the Letters track (`song:<id>`, or anything streaming a song
 *  URL). Songs are not readings: they earn no read credit, no lifetime counts,
 *  no resume point, and play at 1×. */
const _isSong = (track) => !!track && (isSongKey(track.key) || isSongUrl(track.url));
/** The manifest a volKey's entries live in. */
const _mapFor = (volKey) => (_isBibleVol(volKey) ? _bibleManifest() : _manifest());
/** Release-aware asset → stream URL for a volKey's tracks. */
// The edition's declared release tag travels with every Bible asset URL this
// module builds. ONE place resolves it, so a URL built here and a URL
// compared against a saved track cannot route differently.
const _assetUrlFor = (volKey, id) => (_isBibleVol(volKey)
  ? bibleAudioAssetUrl(id, bibleReleaseTagFor(volKey))
  : trackUrl(id));

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
function _syncSleepVolume() {
  if (!_el) return;
  const want = _sleepFadeVolume();
  try {
    const now = typeof _el.volume === 'number' ? _el.volume : 1;
    if (Math.abs(now - want) > 0.001) _el.volume = want;
  } catch (_e) { /* a host without a settable volume keeps the old hard stop */ }
}

function _notify() {
  _version++;
  _syncNativeUpcoming();
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

/**
 * Raise the held keep-alive edge if playback is running once the tour is over: the tour stops
 * what it started, but a track the reader began during the tour by some other control would
 * otherwise run on without the media card until the next 'playing' edge. TourController calls
 * this from end(); idempotent (Kotlin's ask is one-shot per process, keep-alive is a no-op when on).
 */
function syncKeepAlive() {
  if (_state.status === 'playing') _raiseKeepAlive();
}

/** @returns {boolean} true while the page is hidden: the screen off, or another app in front */
function _hidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Raise the keep-alive for playback starting or running (held back while the tour shows, see _setStatus). When
 * Android refuses the service with the page hidden, the recording would play MUTED on Android 17 (a background app
 * with no media foreground service is silenced, and the player is never told) while its clock ran: chapters marked
 * heard, places lost. It pauses instead, once this start settles, and the return says why (sf1, 2026-09-24).
 * @returns {void}
 */
function _raiseKeepAlive() {
  if (_tourShowing()) return;
  if (!_setAudioActive(true) && _hidden()) {
    _usage('audio_hidden'); // us1: how often readers meet the silent-skip condition in the field
    setTimeout(_pauseUnheard, 0);
  }
}

/* us1: anonymous usage counts (utils/usage-stats.js on window). The key is the
   recording's kind - its volume key, 'song' or 'compilation' - never a title. */
let _usageStartedUrl = /** @type {string | null} */ (null);
function _usageKind(track) {
  if (!track) return 'none';
  if (_isSong(track)) return 'song';
  const i = track.key ? track.key.indexOf(':') : -1;
  return i > 0 ? track.key.slice(0, i) : 'compilation';
}
function _usage(name, n) {
  try {
    const u = typeof window !== 'undefined' ? /** @type {any} */ (window).UsageStats : null;
    if (!u) return;
    const kind = _usageKind(_state.queue[_state.qi]);
    if (name === 'listen_s') u.addSeconds(name, kind, n);
    else u.count(name, n ? kind + ':' + n : kind);
  } catch (_e) { /* stats never break playback */ }
}

/** Set by an honest pause while hidden; the next return to the screen says why playback stopped. */
let _pausedUnheard = false;
const PAUSED_UNHEARD_MSG = 'Paused while the screen was off: the phone would have played it silently. Press play to go on.';

/** The honest pause (sf1): only while hidden, and only what is playing or starting. */
function _pauseUnheard() {
  if (!_hidden() || (_state.status !== 'playing' && _state.status !== 'loading')) return;
  _pausedUnheard = true;
  pauseIfPlaying();
}

/** Back on screen: raise the keep-alive again if playback runs (a no-op in native when it holds), and say why an
 *  honest pause happened (sf1). */
function _onVisible() {
  syncKeepAlive();
  if (_pausedUnheard) { _pausedUnheard = false; _toast(PAUSED_UNHEARD_MSG); }
}

/** @returns {boolean} true while "Show me around" is on screen. */
function _tourShowing() {
  try {
    const tc = typeof TourController !== 'undefined' ? /** @type {any} */ (TourController) : null;
    return !!(tc && tc.getState && tc.getState().active);
  } catch (_e) { return false; }
}

/** @returns {boolean} */
function _offline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Offline, and this recording is not downloaded to the phone, so it cannot load (listening item 8: the Android app
 * answers a downloaded one from disk; on the web nothing is ever downloaded).
 * @param {Track | null | undefined} track
 * @returns {boolean}
 */
function _unreachable(track) {
  return _offline() && !(track && typeof track.url === 'string' && OfflineAudio.isSaved(track.url));
}

/**
 * Offline, and nothing in `queue` is on the phone: the whole request is refused BEFORE any state changes, which is
 * what the old blanket offline guards did (a queue with something downloaded plays that, from where it starts).
 * @param {Array<{ url?: string }>} queue
 * @returns {boolean}
 */
function _offlineRefuses(queue) {
  return _offline() && !queue.some((t) => !_unreachable(/** @type {any} */ (t)) || !!_downloadedReading(/** @type {any} */ (t)));
}

/**
 * Offline, the reading of `track`'s letter that IS on the phone when the queue holds another one (a listener with a
 * chosen reader downloads that reading; a Play all queues the primary for every letter after the first), or null.
 * @param {Track | null | undefined} track
 * @returns {Rendition | null}
 */
function _downloadedReading(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const volKey = _volKeyOf(key);
  if (!volKey) return null;
  // The letter's title rides along: every reading of a letter carries its title (the swapped-in one read
  // 'Untitled recording' on the bar and in the snapshot, the refutation of 2026-09-24, N7).
  const item = { id: key.slice(volKey.length + 1), title: (track && track.title) || '' };
  const all = renditionsFor(volKey, item, track ? track.sub : null);
  return all.find((r) => r.tracks.length > 0 && r.tracks.every((t) => !_unreachable(t))) || null;
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
 * @returns {boolean} false only when the APK says Android refused the service (sf1)
 */
function _setAudioActive(active) {
  // The native player (m3) is its own media service: the WebView keep-alive stays out of it. Its media card still
  // needs POST_NOTIFICATIONS on Android 13+, asked here, where _raiseKeepAlive keeps it off the tour card (the
  // bridge's audioPlay no longer asks; sweep n1-02).
  if (_native) {
    if (active) {
      try {
        const b = typeof window !== 'undefined' && /** @type {any} */ (window).AndroidBridge;
        if (b && typeof b.audioAskNotifications === 'function') b.audioAskNotifications();
      } catch (_e) { /* the ask is best-effort */ }
    }
    return true;
  }
  try {
    const b = typeof window !== 'undefined' && /** @type {any} */ (window).AndroidBridge;
    // The APK answers whether the service holds (sf1); false is the one refusal. An older shell answers nothing,
    // the PWA has no bridge: both read as held, as before.
    if (b && typeof b.setAudioActive === 'function') return b.setAudioActive(active) !== false;
  } catch (_e) { /* PWA has no bridge / native threw — keep-alive is best-effort */ }
  return true;
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
    _setCardMetadata(ms, track);
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
  // A song's line names the shelf and the VERSION (the version label rides
  // partLabel), because eleven takes of one song share its title.
  if (_isSong(track)) return 'Songs of the Letters' + (track.partLabel ? ' · ' + track.partLabel : '');
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

/**
 * The title line of a media card: inside a compilation, the letter being read
 * (the follower's _secKey — re-sent at each letter boundary by
 * _refreshCardMetadata); otherwise the track's own title and part.
 * @param {Track} track @returns {string}
 */
function _cardTitle(track) {
  if (_isSong(track)) return track.title;   // the version is the artist line's
  const live = track.key == null && _secKey && _state.queue[_state.qi] === track ? _letterTitleOf(_secKey) : null;
  return live || track.title + (track.partLabel ? ' — ' + track.partLabel : '');
}

/**
 * The album line: the collection, plus — once a compilation's letter holds the
 * title line — the section label it moved out of it.
 * @param {Track} track @returns {string}
 */
function _cardAlbum(track) {
  const live = track.key == null && _secKey && _state.queue[_state.qi] === track ? _letterTitleOf(_secKey) : null;
  return live ? [track.sub, track.title].filter(Boolean).join(' · ') : (track.sub || '');
}

/** @param {any} ms @param {Track} track @returns {void} */
function _setCardMetadata(ms, track) {
  const MM = _g().MediaMetadata;
  if (typeof MM !== 'function') return;
  /** @type {any} */
  const meta = { title: _cardTitle(track), artist: _cardArtist(track), album: _cardAlbum(track) };
  // A song the catalog knows has a cover: the publisher cuts a 512 px thumb for
  // every song. Desktop Chrome, iPhone and the lock screen read it from here.
  const song = _isSong(track) ? songById(songIdOfKey(track.key)) : null;
  const art = song ? songThumbUrl(song, 512) : '';
  if (art) meta.artwork = [{ src: art, sizes: '512x512', type: 'image/webp' }];
  ms.metadata = new MM(meta);
}

/**
 * Re-send both media cards for the SAME track under a new name — a
 * compilation crossing into its next letter. An edge, never a tick.
 * @param {Track} track @returns {void}
 */
function _refreshCardMetadata(track) {
  _syncNative();
  // Under the native player the lock screen, notification, Bluetooth and car read native's metadata: tell it the
  // compilation's letter too (sweep n1-03).
  if (_native && _el && track && _state.queue[_state.qi] === track) /** @type {any} */ (_el).setMeta(_nativeMeta(track.url));
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    _setCardMetadata(/** @type {any} */ (navigator).mediaSession, track);
  } catch (_e) { /* the card is cosmetic; playback must never notice */ }
}

/** Push the current track + state snapshot to the native media card. */
function _syncNative() {
  if (_native) return;   // m3: the native player's session draws the card itself
  try {
    const b = typeof window !== 'undefined' && /** @type {any} */ (window).AndroidBridge;
    if (!b || typeof b.setAudioNowPlaying !== 'function') return;
    const track = _state.queue[_state.qi];
    if (!track) return;
    b.setAudioNowPlaying(
      _cardTitle(track),
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
      // Play and Pause are idempotent (v02-audio-02, improvement sweep
      // 2026-09-22): the platform MediaSession sends onPause for
      // KEYCODE_MEDIA_PAUSE, the Assistant, Wear or a car head unit WHATEVER
      // the state, and the session advertises both actions, so a Pause while
      // paused must not start playback. Only the notification's own button
      // is a toggle.
      else if (cmd === 'pause') pauseIfPlaying();
      else if (cmd === 'play') { if (_state.status === 'paused') toggle(); }
      // Native lost the playback service while the page is hidden (a refused foreground start): the honest pause.
      // On screen nothing is muted, so it is never a toggle (sf1).
      else if (cmd === 'refused') _pauseUnheard();
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
    const t = _state.queue[_state.qi];
    if (t && t.url !== _usageStartedUrl) { _usageStartedUrl = t.url; _usage('listen_start'); }
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
    _syncSleepVolume();       // the sleep fade (a no-op unless a sleep mode is in its last stretch)
    _followSectionLetter();   // a compilation: name the letter, credit the one heard (cheap: ~30 keys)
    // timeupdate fires ~4x/second. Only re-render subscribers when the
    // displayed (whole-second) clock actually changes.
    const sec = Math.floor(_state.time);
    if (sec !== _lastTick) {
      // us1: media seconds heard; a seek (a jump over 4 s: past a 1 Hz tick at the fastest
      // rate, the native player's hidden cadence) is not listening.
      if (sec - _lastTick > 0 && sec - _lastTick <= 4 && !el.paused) _usage('listen_s', sec - _lastTick);
      _lastTick = sec;
      _syncMediaSessionPosition();
      _notify();
      // Durable resume: snapshot every ~5s of playback (and on the pause
      // below, and on pagehide / hidden — _flushOnHide). Cheap — ~300 bytes
      // to localStorage.
      if (sec - _lastPersistSec >= 5 || sec < _lastPersistSec) { _lastPersistSec = sec; _persist(); }
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
    _usage('listen_end');
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
      else if (_repeatMode() === 'one') _replayCurrent();
      else next();
    } finally { _finishedUrl = null; }
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
function _nativeMeta(url) {
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
function _syncNativeUpcoming() {
  if (_native && _el) /** @type {any} */ (_el).syncUpcoming();
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
  _syncSleepVolume();   // paused at the bottom of the fade; the next Play is at full voice
  if (!wasLive) _notify();
  if (wasLive) _toast('Sleep timer ended. Playback paused.');
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
  // A song that will not play is passed over, so hands-off listening goes on (songs README 3.5: "Couldn't play
  // this song", then it skips; sweep n3-03). Not offline (nothing ahead would play either), and at most
  // SONG_SKIP_CAP in a row: a run of failures is the network, and the player pauses on it as before.
  if (_isSong(_state.queue[_state.qi]) && !_offline() && _songSkips < SONG_SKIP_CAP) {
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
  const unreachable = _unreachable(_state.queue[_state.qi]);
  _usage('audio_err', unreachable ? 'network' : 'load');
  _toast(unreachable ? OFFLINE_MSG : LOAD_FAIL_MSG);
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
  if (_native) return;   // m3: native already holds the next recording (upcoming) and buffers it itself
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

/* ── WTLB compilations: one file, many letters (2026-09-20) ─────────────────
   A range-compilation section (AUDIO_SECTIONS: WTLB Part 1-7, Section 1-7) is
   ONE recording of many entries. The queue item keeps `key: null` — one file,
   one resume position, one track — and the entry being read is a function of
   (asset, clock), answered HERE for every consumer: the read-along's rows, the
   follower's page turn, the desk's "Open the reading", the shelf's text icon.
   Shape (agreed with the align lane, D:/Swarm/lanes/align/wtlb-shape.md):
     AUDIO_SYNC_SECTIONS[assetId][volKey:letterId] = [[t, pi, cs, ce, 0], …]
   rows in the AUDIO_SYNC shape on the FILE's clock, inner keys in playback
   order; letter i is current while rows_i[0][0] <= t < rows_{i+1}[0][0]; the
   last runs to the end of the file; before the first row nothing is current
   (an intro silence paints and navigates nothing); a letter the belt could not
   prove is ABSENT, never a wrong highlight, so the page follows to the next
   PRESENT one. The table is its own lazy file (src/data/audio-sync-sections.js):
   asking for a section's letter before it lands kicks the fetch (idempotent)
   and answers null until it does. */

/** The section-table entry for a track, or null (keyed track, not a section asset, table not landed). */
function _sectionTableFor(track) {
  if (!track || track.key != null || typeof track.url !== 'string') return null;
  const tail = track.url.slice(track.url.lastIndexOf('/') + 1);
  const id = tail.slice(-4).toLowerCase() === '.mp3' ? tail.slice(0, -4) : '';
  const sections = _sections();
  if (!id || !sections || !Object.keys(sections).some((vk) => (sections[vk] || []).some((sec) => sec && sec[1] === id))) return null;
  const all = _g().AUDIO_SYNC_SECTIONS;
  if (!all) { void loadAudioSyncSections(); return null; }   // idempotent kick; null until it lands
  return all[id] || null;
}

/**
 * The letter a range-compilation section is reading at `time` (seconds on the
 * file's clock), as a "volKey:letterId" key — or null before its first row, for
 * a keyed track, or until the section table lands.
 * @param {any} track
 * @param {number} time
 * @returns {string | null}
 */
function sectionLetterKeyAt(track, time) {
  const table = _sectionTableFor(track);
  if (!table) return null;
  let cur = null;
  for (const k of Object.keys(table)) {
    const rows = table[k];
    if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0]) || rows[0][0] > time) break;
    cur = k;
  }
  return cur;
}

/**
 * The FIRST letter of a range-compilation section — where "Open the reading"
 * lands during the intro silence, and what a shelf row of a section that is not
 * playing opens. Null on the same conditions as sectionLetterKeyAt.
 * @param {any} track
 * @returns {string | null}
 */
function sectionOpeningKey(track) {
  const table = _sectionTableFor(track);
  const first = table ? Object.keys(table)[0] : null;
  return first || null;
}

/* ── THE LETTER A COMPILATION IS READING (2026-09-22) ─────────────────────
   A section track keeps key null (one file, one resume position), so every
   surface that names a recording by its track — the mini-player, the desk,
   the web Media Session, the Android card — said "Part 1 · Intro–19" for the
   whole 10-24 minute file, and _notifyListened returned on the null key: none
   of the 347 letters heard through a compilation was ever credited (owner rule
   2026-08-09: a full listen counts like a full read). The clock already knows
   the letter (sectionLetterKeyAt). _followSectionLetter walks with it on every
   timeupdate: it NAMES the letter (liveLetter, the card) and CREDITS one heard
   through — SECTION_HEARD_FRACTION of its span actually played, seeks excluded
   — when the clock walks on into the next letter, or at 'ended' for the last. */

/** Share of a letter's span that must actually play for it to count as heard. */
const SECTION_HEARD_FRACTION = 0.8;
/** The letter under the clock of the loaded compilation, as the follower last saw it. */
let _secKey = /** @type {string | null} */ (null);
/** Seconds of that letter actually heard (forward playback steps only). */
let _secHeard = 0;
/** The clock at the previous step; -1 after a start or a seek, so a jump never counts as heard. */
let _secLastT = -1;
/** "volKey:id" → title. Titles are immutable once the lazy registry has landed. */
const _letterTitles = new Map();

/** @returns {void} */
function _resetSectionFollow() {
  _secKey = null;
  _secHeard = 0;
  _secLastT = -1;
}

/**
 * A letter's title from the lazy VOT registry, or null until it lands.
 * @param {string | null} key - "volKey:id"
 * @returns {string | null}
 */
function _letterTitleOf(key) {
  if (!key) return null;
  if (_letterTitles.has(key)) return /** @type {string} */ (_letterTitles.get(key));
  const divider = key.indexOf(':');
  if (divider <= 0) return null;
  const items = _collectionItems(key.slice(0, divider));
  const id = key.slice(divider + 1);
  const item = items ? items.find((it) => it && it.id === id) : null;
  const title = item && typeof item.title === 'string' && item.title ? item.title : null;
  if (title) _letterTitles.set(key, title);
  return title;
}

/**
 * The letter the loaded compilation is reading right now, or null — for a
 * keyed recording, before the file's first letter, or until the timings land.
 * `title` is null until the registry lands (callers fall back to the track).
 * @returns {{ key: string, title: string | null } | null}
 */
function liveLetter() {
  const track = _state.queue[_state.qi];
  if (!track || track.key != null || _state.status === 'idle') return null;
  const key = sectionLetterKeyAt(track, Number(_state.time) || 0);
  return key ? { key, title: _letterTitleOf(key) } : null;
}

/**
 * A letter's span on the file clock: its first row to the next letter's first
 * row, or to the end of the file for the last one. 0 when unknown.
 * @param {any} track @param {string} key @returns {number}
 */
function _sectionSpan(track, key) {
  const table = _sectionTableFor(track);
  if (!table || !Array.isArray(table[key]) || !table[key].length) return 0;
  const keys = Object.keys(table);
  const at = keys.indexOf(key);
  const start = Number(table[key][0][0]) || 0;
  const nextRows = at >= 0 && at + 1 < keys.length ? table[keys[at + 1]] : null;
  const end = nextRows && nextRows.length ? Number(nextRows[0][0]) || 0 : Number(_state.duration) || 0;
  return Math.max(0, end - start);
}

/**
 * Credit one letter heard through a compilation — the same bridge a keyed
 * recording's end reaches (__votAudioListened), and never the recordings-heard
 * counter: a letter inside a file is not a recording.
 * @param {any} track @param {string} key @param {number} heard @returns {void}
 */
function _creditSectionLetter(track, key, heard) {
  try {
    const span = _sectionSpan(track, key);
    if (!(span > 0) || heard < span * SECTION_HEARD_FRACTION) return;
    const divider = key.indexOf(':');
    if (divider <= 0) return;
    const g = _g();
    if (typeof g.__votAudioListened === 'function') g.__votAudioListened(key.slice(0, divider), key.slice(divider + 1), 0);
  } catch (_e) { /* listen counting must never interfere with playback */ }
}

/**
 * Walk with the clock of a playing compilation (called on every timeupdate):
 * add the forward step to the current letter's heard time, and at a letter
 * boundary credit the letter just left when the clock walked straight on from
 * it into the next, then re-send the media card under the new letter's name.
 * @returns {void}
 */
function _followSectionLetter() {
  const track = _state.queue[_state.qi];
  if (!track || track.key != null) { if (_secKey) _resetSectionFollow(); return; }
  const t = Number(_state.time) || 0;
  const live = _state.status === 'playing' || _state.status === 'loading';
  if (_secKey && _secLastT >= 0 && live && t > _secLastT) _secHeard += t - _secLastT;
  _secLastT = t;
  const key = sectionLetterKeyAt(track, t);
  if (key === _secKey) return;
  const left = _secKey;
  const heard = _secHeard;
  _secKey = key;
  _secHeard = 0;
  if (left && key) {
    const table = _sectionTableFor(track);
    const keys = table ? Object.keys(table) : [];
    const at = keys.indexOf(left);
    if (at >= 0 && keys[at + 1] === key) _creditSectionLetter(track, left, heard);
  }
  _refreshCardMetadata(track);
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
    // A SONG IS NOT A READING (README §1.1): a finished song marks no letter
    // read, feeds no streak or milestone, and is no "recording heard" in My
    // Progress. Its `song:` key would credit nothing at the bridge anyway;
    // returning here keeps the lifetime counter out of it too.
    if (_isSong(track)) return;
    if (track && track.key == null && _sectionTableFor(track)) {
      // A COMPILATION'S END (2026-09-22): its last letter is credited like any
      // other heard through (the follower's rule, spanning to the file's end),
      // and the file itself is one recording heard to the end.
      if (_secKey) _creditSectionLetter(track, _secKey, _secHeard);
      _countCompletion();
      return;
    }
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
  // Before anything else: whatever this start does, a seek armed for the
  // PREVIOUS track is no longer this element's business.
  _seekGen++;
  _resetSectionFollow();   // a new file: no letter under its clock yet, nothing heard
  const track = _state.queue[_state.qi];
  if (!track) { stop(); return; }
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
      _toast(OFFLINE_MSG);
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
  _state.duration = el.src === track.url ? (el.duration || 0) : 0;
  _lastTick = -1;
  _errorTime = 0;
  // A prewarm(…) already pointed the element at THIS url and buffered its
  // head — reassigning src would throw that away and restart the fetch. A warm
  // whose load FAILED (el.error set, NO_SOURCE) is re-pointed instead: nothing
  // is buffered to lose, and the fresh load's error fires at status 'loading'
  // where _onError can say so, not 20 s later from the stall watchdog (row 5).
  if (el.src !== track.url || el.error) el.src = track.url;
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
  if (p && typeof p.then === 'function') p.then(() => { _resumeAfterUpdateArmed = false; }, (err) => { _playRefused(err); });
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
  const books = Array.isArray(_g().BIBLE_AUDIO_BOOKS) ? _g().BIBLE_AUDIO_BOOKS : [];
  // Queue scope is THE BOOK (owner directive 2026-08-10): a chapter tap
  // queues that book's remaining chapters, never the rest of the Bible up
  // front. Since w-audio-continue (2026-09-11) the queue EXTENDS into the next
  // book of the same edition as the last chapter ends (_extendQueue, _booksAfter)
  // — the horizon is a book at a time, the walk is the whole edition.
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
  const started = playCollection({
    volKey: o.volKey, items, collectionLabel: o.label || null, startId: o.bookId,
    startPartIndex: perChapter && Number.isInteger(n) && n >= 2 ? Math.min(n - 1, parts.length - 1) : 0,
    noResume: !!o.noResume,
  });
  if (perChapter || !started) return;
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
 * A volume's range compilations as the tracks they play: what playSection queues (from its start index) and what a
 * compilation's Download saves (item 8 follow-up), so the two can never name different files. One keyless track a
 * file (a section keeps key null: one file, one resume position).
 *
 * @param {string} volKey
 * @param {string | null} [collectionLabel]
 * @returns {Track[]}
 */
function sectionTracks(volKey, collectionLabel) {
  return (sectionsFor(volKey) || []).map((s) => ({
    key: null,
    title: s[0] || '',
    sub: collectionLabel || null,
    url: trackUrl(s[1]),
    readerCode: s[2] || '',
    partLabel: null,
  }));
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
/**
 * The tracks a row's own Play starts with for `item`: the listener's chosen reader where that reader read it, else
 * the manifest's primary reading (the unit a download saves, item 8). [] when the item has no recording.
 *
 * @param {string} volKey
 * @param {{ id?: string, title?: string } | null | undefined} item
 * @param {string | null | undefined} collectionLabel
 * @returns {Track[]}
 */
function playbackTracks(volKey, item, collectionLabel) {
  const reader = _preferredReaderFor(volKey, item, collectionLabel);
  const chosen = reader ? _renditionByReader(volKey, item, collectionLabel, reader) : null;
  return chosen ? chosen.tracks : _tracksFor(volKey, item, collectionLabel);
}

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
 *
 * `startPartIndex` is the same promise ONE LEVEL DOWN, and it used to stop at
 * the boundary of this object: a multi-part letter shares one key across its
 * parts, so `startKey` alone rebuilds at part 1 however far in the listener
 * actually began. Recorded here, written by _persist and replayed by the boot
 * rebuild through the same slice playCollection uses.
 *
 * A SONGS queue (`mode: 'songs'`) is described, never listed: a `filter` plus a
 * `seed` (shuffle) or an explicit `ids` list, and `startKey`. A 900-song shuffle
 * is a few dozen bytes here, where a `custom` queue would re-serialize 900
 * tracks into IDB every second. song-catalog.js's songQueue() turns it back
 * into the same queue.
 * @type {{ mode: 'letter'|'collection'|'section'|'custom'|'songs', volKey: string, label: string|null, startKey?: string|null, startIndex?: number|null, startReader?: string|null, startPartIndex?: number|null, filter?: any, one?: boolean, seed?: number, shuffle?: boolean, ids?: string[] | null, wrap?: boolean, swaps?: Record<string, string> | null } | null} */
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
  // Shuffle is a fact about the songs descriptor; repeat is a songs-session
  // setting that no other queue may inherit (a letter must never loop).
  _state.shuffle = !!(next && next.mode === 'songs' && next.shuffle);
  if (!next || next.mode !== 'songs') _state.repeat = 'off';
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
    // Songs start from the top, always: a three-minute song is not a place to
    // return to, and 1,000 of them would evict every real place from the
    // 200-slot map a reading needs.
    if (!track || !track.url || _isSong(track) || !(t >= AUDIO_RESUME_MIN_SEC)) return;
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
    if (!track || !track.url || _isSong(track) || !store || typeof store.getPosition !== 'function') return 0;
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
 * Advance a queue INTO the start item's parts — the part-grained half of the
 * forward-only horizon.
 *
 * ONE definition, called by playCollection (which chooses the part) and by the
 * boot rebuild (which has to reproduce it). Two copies of this slice is exactly
 * how the two levels drifted apart: playCollection had the part logic, the
 * rebuild had only the key logic, and nothing made them agree.
 *
 * `spi` is clamped to the start item's own run of parts, so a snapshot claiming
 * a part the letter no longer has lands on its last one rather than slicing
 * past the letter into the next. A run of 0 means the key is not at the front
 * of this queue at all, and then there is no part horizon to apply — returning
 * the queue unchanged rather than `slice(-1)`, which would keep ONE track.
 *
 * @param {Track[]} queue
 * @param {string|null|undefined} startKey
 * @param {number|null|undefined} startPartIndex
 * @returns {Track[]}
 */
function _slicePartHorizon(queue, startKey, startPartIndex) {
  const spi = Math.floor(Number(startPartIndex) || 0);
  if (!(spi > 0) || !startKey) return queue;
  let run = 0;
  while (run < queue.length && queue[run].key === startKey) run++;
  // A run of 0 means the startKey is not at the front of this queue at all —
  // in practice, absent from it. Return the queue UNCHANGED rather than
  // falling through to `slice(-1)`, which keeps exactly ONE track: a wrong
  // answer that looks like a horizon. Pinned by 'the run === 0 guard: a start
  // letter that is GONE' in audio-player.test.js. That case was impossible until
  // audio-player-5: the same condition used to leave _rebuildRestoredQueue's `qi`
  // at -1 (its fallback sat behind an `else` and could not run while `r.key` was
  // set), so the bar came back EMPTY whatever this line did. Both halves measured.
  if (run === 0) return queue;
  return queue.slice(Math.min(spi, run - 1));
}

function _persist() {
  // Durable per-recording memory rides the same call sites as the boot
  // snapshot, and ahead of its storage guards: the two are independent.
  _rememberCurrentPosition(false);
  let s;
  try { s = _snapshot(); } catch (_e) { return; }
  if (!s) return;
  if (s === 'clear') { _clearPersist(); return; }
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(PERSIST_KEY, JSON.stringify(s)); } catch (_e) { /* storage full/blocked — resume is best-effort */ }
  _persistDurable(s);
}

/** The one record both channels write. Null when there is nothing to remember;
 *  'clear' when the recording the listener heard to its end was the last one
 *  (see below). */
function _snapshot() {
  const src = _pendingRestore || _source;
  let qi = _pendingRestore ? _pendingRestore.qi : _state.qi;
  let track = _pendingRestore ? _state.queue[0] : _state.queue[_state.qi];
  // Exact to the millisecond (2026-09-11): it was floored, and a floor lost up
  // to a second at the one moment the reader cannot tap through — the close.
  let time = Math.round((_state.time || 0) * 1000) / 1000;
  /* THE SNAPSHOT MUST NOT NAME A RECORDING THE LISTENER HEARD TO ITS END, and
     until now only the OTHER writer refused to. `_rememberPosition` has this
     exact guard (`if (_finishedUrl && track.url === _finishedUrl) return;`) and
     the per-recording record is also dropped outright by `_forgetPosition`;
     the boot snapshot had neither.

     On the normal path the omission is invisible: next() moves qi and starts
     the new track BEFORE it persists, so the url no longer matches. The
     sleep-at-track-end path does not advance at all, so `_markPaused()` wrote
     the finished recording at its ending clock — and the next session resumed
     AT the end of something already heard. Pressing play fired `ended` again at
     once, which ran `_notifyListened` a SECOND time and counted the completion
     twice, then skipped a track the listener was not expecting to lose.

     ADVANCING rather than rewinding, because the recording is over: rewinding to
     0 would offer it again, which is the opposite of what finishing it means.
     And when it was the LAST one, the snapshot is cleared — the same answer
     next() reaches through stop(), whose own comment is "the boot snapshot is
     the part that must not resurrect the bar".

     THE LIVE BAR IS DELIBERATELY NOT TOUCHED. A reader who set a sleep timer
     wakes to the recording they finished, paused at its end: that is "this is
     where you got to", and it is the snapshot, not the bar, that the next
     session reads. */
  /* `!_pendingRestore` is a guard whose bad input cannot currently occur, and it
     is kept rather than deleted for what it would cost if it did. `_finishedUrl`
     is set only inside the `ended` handler, which needs a live media element,
     and `_pendingRestore` means there is not one yet — so a bite on this clause
     reddens nothing, correctly. But the restore placeholder is a ONE-track
     queue, so were it ever to fire, `qi + 1 >= length` would hold and the arm
     below would `_clearPersist()` — wiping the reader's resume point rather
     than advancing it. A destructive misfire is worth one clause. */
  if (!_pendingRestore && _finishedUrl && track && track.url === _finishedUrl) {
    if (qi + 1 >= _state.queue.length) return 'clear';
    qi += 1;
    track = _state.queue[qi];
    time = 0;
  }
  const savedTrack = normalizeAudioTrack(track);
  if (!src || !savedTrack) return null;
  const queueForCustomSource = _pendingRestore && Array.isArray(_pendingRestore.queue)
    ? _pendingRestore.queue
    : _state.queue;
  const customQueue = src.mode === 'custom'
    ? queueForCustomSource.map(normalizeAudioTrack).filter(Boolean)
    : undefined;
  const songs = src.mode === 'songs' ? _songsSnapshotFields(src, savedTrack, qi) : null;
  return {
    v: 2,
    mode: src.mode, volKey: src.volKey, label: src.label,
    qi: songs ? songs.qi : qi,
    key: savedTrack.key,
    time,
    track: savedTrack,
    customQueue,
    startKey: (songs ? songs.startKey : src.startKey) || undefined,
    startIndex: typeof src.startIndex === 'number' ? src.startIndex : undefined,
    startPartIndex: src.startPartIndex ? src.startPartIndex : undefined,
    startReader: src.startReader || undefined,
    filter: songs ? songs.filter : undefined,
    one: songs && songs.one ? true : undefined,
    seed: songs && songs.seed ? songs.seed : undefined,
    shuffle: songs && songs.shuffle ? true : undefined,
    ids: songs ? songs.ids : undefined,
    wrap: songs && songs.wrap ? true : undefined,
    swaps: songs && songs.swaps ? songs.swaps : undefined,
    repeat: songs && _state.repeat !== 'off' ? _state.repeat : undefined,
    at: Date.now(),   // which copy is newer, when the two channels disagree at boot
  };
}

/** How many ids an explicit songs list may persist. Longer lists persist the
 *  window FROM the playing song forward — the forward-only horizon every other
 *  rebuild keeps — so the snapshot stays small whatever the list. */
const SONG_IDS_PERSIST = 50;

/**
 * The songs half of a snapshot: the compact descriptor, never the queue. An
 * explicit ids list longer than SONG_IDS_PERSIST is cut to the window that
 * starts at the playing song, and the snapshot's startKey and qi move with it.
 * @param {any} src @param {Track} track @param {number} qi
 * @returns {{ filter: any, one: boolean, seed: number, shuffle: boolean, ids: string[] | undefined, startKey: string | null, qi: number, wrap: boolean, swaps: Record<string, string> | null }}
 */
function _songsSnapshotFields(src, track, qi) {
  let ids = Array.isArray(src.ids) ? src.ids.filter(isSongId) : undefined;
  let startKey = src.startKey || null;
  if (ids && ids.length > SONG_IDS_PERSIST) {
    const at = Math.max(0, ids.indexOf(songIdOfKey(track.key)));
    ids = ids.slice(at, at + SONG_IDS_PERSIST);
    startKey = null;
    qi = 0;
  }
  return { filter: ids ? undefined : normalizeSongFilter(src.filter), one: !ids && !!src.one, seed: Number(src.seed) >>> 0, shuffle: !!src.shuffle, ids, startKey, qi,
    wrap: !ids && !!src.wrap, swaps: ids ? null : cleanSongSwaps(src.swaps) };
}

function _clearPersist() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(PERSIST_KEY); } catch (_e) { /* ditto */ }
  const idb = _idb();
  if (idb) { try { Promise.resolve(idb.delete(SNAPSHOT_STORE, SNAPSHOT_KEY)).catch(() => {}); } catch (_e) { /* ditto */ } }
}

/* ── THE DURABLE SNAPSHOT — the kill (2026-09-11, w-audio-kill-cadence) ──
   A kill fires no event, and localStorage does not survive one. Measured on
   this machine (probe-kill-durability.mjs): after an abrupt kill of the whole
   browser process tree — the phone's shape — LS came back at its FIRST commit
   and nothing after (5.0 s on a 12 s run, 5.0 s on a 33 s run: Chromium
   commits LS 5 s after the first write and then rate-limits commits to about
   60 an hour, so a value written every second reaches disk about once a
   minute), while IndexedDB came back with the LAST write, every time. The
   walk's kill arm then lost the snapshot ENTIRELY — the bar came back idle —
   so the durable record is the whole snapshot, not a clock beside it: the
   same object, put to IDB at every snapshot write and every whole second
   while playing (nothing when paused: timeupdate stops). LS keeps the
   synchronous first paint of the bar and older data; at boot the IDB copy
   wins unless the LS copy is stamped newer, which only an older build's data
   can be. IDBAdapter is bundle-b, reached through the globalThis bridge like
   the positions store; absent, all of this is a no-op. */
const SNAPSHOT_STORE = 'meta';
const SNAPSHOT_KEY = 'audio-snapshot';
const _idb = () => _g().IDBAdapter || null;
/** Epoch ms stamped on the copy the bar was restored from (0: none, or unstamped). */
let _restoredAt = 0;
function _persistDurable(s) {
  const idb = _idb();
  if (!idb) return;
  try { Promise.resolve(idb.put(SNAPSHOT_STORE, SNAPSHOT_KEY, s)).catch(() => {}); }
  catch (_e) { /* best-effort: the LS copy still has the last 5 s */ }
}
function _persistDurableOnly() {
  let s;
  try { s = _snapshot(); } catch (_e) { return; }
  if (s && s !== 'clear') _persistDurable(s);
}
/** Boot: the durable copy outranks the LS one unless LS is stamped newer. A
 *  bar already rebuilt (the reader tapped Play in the milliseconds this read
 *  takes) keeps what it started from. The update reload's own record needs no
 *  guard here: its rebuild clears the pending restore before this resolves, and
 *  offline — where it stays pending — the IDB copy IS the reload's flush (same
 *  _persist() call, same clock, same stamp); a guard on it was bitten and no
 *  case could tell. */
async function _adoptDurableSnapshot() {
  const idb = _idb();
  if (!idb) return;
  let rec = null;
  try { rec = await idb.get(SNAPSHOT_STORE, SNAPSHOT_KEY); } catch (_e) { return; }
  if (!rec || typeof rec !== 'object' || typeof rec.at !== 'number') return;
  if (_state.status !== 'idle' && !_pendingRestore) return;   // live already: the reader pressed Play
  if (_pendingRestore && rec.at < _restoredAt) return;         // the LS copy is newer
  if (_applySnapshot(rec)) _notify();
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
    _applySnapshot(JSON.parse(raw));
  } catch (_e) { _setPendingRestore(null); }
}

/**
 * Hand a snapshot record (either channel) to the bar as a pending restore.
 * @param {any} s
 * @returns {boolean} whether the record was usable
 */
function _applySnapshot(s) {
  try {
    if (!s || (s.v !== 1 && s.v !== 2)) return false;
    const track = normalizeAudioTrack(s.track);
    const mode = s.mode === 'letter' || s.mode === 'collection' || s.mode === 'section' || s.mode === 'custom' || s.mode === 'songs'
      ? s.mode
      : null;
    if (!track || !mode) return false;
    // A songs snapshot must name a song, and its descriptor is re-validated key
    // by key: it is stored data, and it decides what the rebuild will queue.
    if (mode === 'songs' && !_isSong(track)) return false;
    const songIds = mode === 'songs' && Array.isArray(s.ids) ? s.ids.filter(isSongId).slice(0, SONG_IDS_PERSIST) : null;
    const customQueue = mode === 'custom' && Array.isArray(s.customQueue)
      ? s.customQueue.map(normalizeAudioTrack).filter(Boolean)
      : [];
    if (mode === 'custom' && !customQueue.length) return false;
    _setPendingRestore({
      mode,
      volKey: typeof s.volKey === 'string' ? s.volKey : '',
      label: typeof s.label === 'string' ? s.label : null,
      qi: Math.max(0, Math.floor(Number(s.qi) || 0)),
      key: typeof s.key === 'string' ? s.key : track.key,
      url: track.url,
      time: Math.max(0, Number(s.time) || 0),
      queue: customQueue,
      startKey: typeof s.startKey === 'string' ? s.startKey : null,
      startIndex: Number.isInteger(s.startIndex) && s.startIndex >= 0 ? s.startIndex : null,
      // A legacy snapshot has no part index, and ABSENCE means "no part
      // horizon" rather than part 0 — the slice is a no-op either way, and
      // null keeps the two readings from being confused later.
      startPartIndex: Number.isInteger(s.startPartIndex) && s.startPartIndex > 0 ? s.startPartIndex : null,
      startReader: typeof s.startReader === 'string' ? s.startReader : null,
      filter: mode === 'songs' && !songIds ? normalizeSongFilter(s.filter) : null,
      one: mode === 'songs' && !songIds && s.one === true,
      seed: mode === 'songs' ? (Number(s.seed) >>> 0) : 0,
      shuffle: mode === 'songs' && s.shuffle === true,
      ids: songIds,
      wrap: mode === 'songs' && !songIds && s.wrap === true,
      swaps: mode === 'songs' && !songIds ? cleanSongSwaps(s.swaps) : null,
    });
    _restoredAt = typeof s.at === 'number' ? s.at : 0;
    _state.queue = [track];
    _state.qi = 0;
    _state.time = _pendingRestore.time;
    _state.duration = 0;
    _state.status = 'paused';
    // The desk shows the songs session's shuffle and repeat before the rebuild.
    _state.shuffle = !!_pendingRestore.shuffle;
    _state.repeat = mode === 'songs' && (s.repeat === 'one' || s.repeat === 'all') ? s.repeat : 'off';
    // The restored bar is a song: start the catalog on its way now (cover,
    // version, the queue the first tap rebuilds). Idempotent and fail-quiet.
    if (mode === 'songs') void loadSongCatalog();
    _followLibraryRate();
    _notify();
    return true;
  } catch (_e) { _setPendingRestore(null); return false; }
}

/* A paused restore puts the desk up before any track loads, and _load is where
   the rate is pulled from the library — so the readout said 1× over a store
   holding 1.37 (item 5 look, 2026-09-21; ra3). While the restore is pending the
   player follows the store instead: bundle-b hydrates IDB after this module
   evaluates, so the pull repeats on each store notify. Once a track is live
   the store is written BY the player and never drives it from behind. */
let _libraryWatched = false;
function _followLibraryRate() {
  const pull = () => {
    if (!_pendingRestore) return;
    const library = _library();
    if (!library || typeof library.getPlaybackRate !== 'function') return;
    _readingRate = normalizeAudioRate(library.getPlaybackRate());
    const next = isSongKey(_pendingRestore.key) ? 1 : _readingRate;   // a restored song still plays at 1×
    if (next !== _state.rate) { _state.rate = next; _notify(); }
  };
  pull();
  if (_libraryWatched) return;
  const library = _library();
  if (library && typeof library.subscribe === 'function') { _libraryWatched = true; library.subscribe(pull); }
}

/**
 * Reader-alternate restore fidelity: the saved letter's run in the rebuilt
 * queue becomes the rendition whose tracks include the saved URL, whichever
 * reader that is. Every lookup that doesn't line up returns the queue
 * untouched, so a missing corpus or a retired alternate simply resumes on the
 * primary rendition rather than losing the position.
 *
 * @param {any} restore - the pending-restore descriptor
 * @param {Track[]} queue
 * @returns {Track[]}
 */
function _withRestoredAlternate(restore, queue) {
  try {
    if (!restore.key || !restore.url) return queue;
    const at = queue.findIndex((t) => t.key === restore.key);
    if (at < 0) return queue;
    const divider = restore.key.indexOf(':');
    if (divider <= 0) return queue;
    const item = { id: restore.key.slice(divider + 1), title: queue[at].title };
    // The rendition that HOLDS the saved recording, whoever reads it. The saved URL is the one fact about what was
    // playing; the descriptor's startReader can name another voice (offline, a downloaded reading plays in place of
    // the chosen one), and trusting it resumed that voice at the other one's clock (the refutation of 2026-09-24, M2).
    const rendition = renditionsFor(restore.volKey, item, restore.label)
      .find((rd) => rd.tracks.some((t) => t.url === restore.url));
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
  // Offline, the saved recording itself must be on the phone (item 8).
  if (_offline() && !(typeof r.url === 'string' && OfflineAudio.isSaved(r.url))) { _toast(OFFLINE_MSG); return; }
  _setPendingRestore(null);
  const g = _g();
  if (r.mode === 'songs') {
    try { await loadSongCatalog(); } catch (_e) { /* no catalog — fall through to the placeholder track */ }
  } else if (r.mode !== 'custom') {
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
  } else if (r.mode === 'songs') {
    // The same pure order a fresh playSongs used, replayed from the descriptor.
    queue = _songTracks(songQueue(r));
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
  if (r.startKey && r.mode !== 'custom' && r.mode !== 'section' && r.mode !== 'songs') {
    const horizon = queue.findIndex((item) => item.key === r.startKey);
    if (horizon > 0) queue = queue.slice(horizon);
    // …and INTO its parts, which is the level this rebuild used to lose. The
    // slice above lands on part 1 because a multi-part letter shares one key,
    // so a listener who started at part 2 was handed part 1 again every boot.
    queue = _slicePartHorizon(queue, r.startKey, r.startPartIndex);
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
    queue = _withRestoredAlternate(r, queue);
    qi = r.url ? queue.findIndex((item) => item.url === r.url) : -1;
  }
  if (qi < 0 && r.key) {
    const hits = queue.map((t, i) => ({ t, i })).filter((x) => x.t.key === r.key);
    if (hits.length) {
      // Multi-part letters share a key; land on the saved part when possible.
      const withinKey = Math.max(0, Math.min(hits.length - 1, (r.qi || 0) - hits[0].i));
      qi = hits[withinKey].i;
    }
  }
  if (qi < 0) {
    // Nothing in this queue IS the saved track — the corpus dropped or renamed
    // the letter between sessions. This clamp has always existed for exactly that
    // case, and behind an `else` it could never run for a snapshot carrying a key,
    // which is every snapshot the app writes. qi stayed at -1, _start() read
    // queue[-1] and stop() threw away a queue that had just rebuilt correctly.
    // The floor is a shape guard, not a correctness guard, and a bite says so:
    // _restoreFromSaved already clamps r.qi at 0, and an empty queue ends in
    // stop() through queue[0] exactly as it would through queue[-1]. Only the
    // Math.min is load-bearing here (1 RED, on the shrunken-collection case).
    qi = Math.max(0, Math.min(r.qi || 0, queue.length - 1));
    // The saved clock is an offset into a recording that is NOT in this queue.
    // Carrying it across seeks an arbitrary distance into whatever the clamp
    // lands on — past the end, for a long position, which ends the track at once
    // and skips it. No position is the honest answer here; another recording's
    // position is not.
    resumeAt = 0;
  }
  // startPartIndex rides along, or the first persist after a restore drops the
  // horizon it just replayed and the SECOND boot regrows part 1.
  // A songs source keeps the session's repeat (_applySnapshot restored it).
  _setSource(r.mode === 'songs'
    ? { mode: 'songs', volKey: 'song', label: r.label, startKey: r.startKey || null, filter: r.filter, one: !!r.one, seed: r.seed, shuffle: !!r.shuffle, ids: r.ids, wrap: !!r.wrap, swaps: r.swaps || null }
    : { mode: r.mode, volKey: r.volKey, label: r.label, startKey: r.startKey || null, startIndex: r.startIndex, startReader: r.startReader || null, startPartIndex: r.startPartIndex || null });
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
    // A song goes on the SONGS shelf, by id, and counts no lifetime play: the
    // 30-row recent shelf is where a reader finds the letter they were hearing,
    // and one evening of shuffle must not flush it or inflate My Progress.
    if (_isSong(track)) {
      if (typeof library.recordSongPlayed === 'function') library.recordSongPlayed(songIdOfKey(track.key));
      return;
    }
    try {
      if (track && typeof library.recordPlayed === 'function') library.recordPlayed(track);
    } catch (_e) { /* recent-history failures must not interfere with listening */ }
    try {
      if (typeof library.countPlay === 'function') library.countPlay();
    } catch (_e) { /* the milestones counter must never stand between a tap and audio */ }
  } catch (_e) { /* no library bridge at all — nothing to record */ }
}

/**
 * The study that owns a chapter id, from the lazy studies corpus
 * (bible-studies.js: BIBLE_STUDIES). Null until it lands or for an unknown id.
 *
 * @param {string | null | undefined} chapterId
 * @returns {any}
 */
function _studyOfChapter(chapterId) {
  const studies = _g().BIBLE_STUDIES;
  if (!chapterId || !Array.isArray(studies)) return null;
  return studies.find((st) => st && Array.isArray(st.chapters) && st.chapters.some((c) => c && c.id === chapterId)) || null;
}

/**
 * A collection's caller-ordered items (preface first where one exists), read
 * from the lazy VOT registry globals. Null when that registry has not landed —
 * every caller then falls back to the smaller queue it can build alone.
 *
 * A STUDY'S CHAPTERS ARE ITS COLLECTION (2026-09-20). 'study' is no entry in
 * COL_BY_KEY — its recordings ride AUDIO_MANIFEST under "study:<chapterId>" —
 * so a study chapter's Listen built a queue of one and stop() dropped the bar
 * at the chapter's end, where a Bible chapter runs on into the next. The study
 * that owns the chapter is the collection; its chapters are the items
 * (recordings only, playCollection skips the rest). Needs the chapter id to
 * know WHICH study: without one there is nothing to answer.
 *
 * @param {string} volKey
 * @param {string} [itemId] the letter / chapter the caller holds (studies only)
 * @returns {Array<any> | null}
 */
function _collectionItems(volKey, itemId) {
  const g = _g();
  if (volKey === 'study') {
    const study = _studyOfChapter(itemId);
    return study ? study.chapters : null;
  }
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
  if (isSongKey(key)) return null;   // songs live in the catalog, not in any manifest (playTrack's song arm)
  if (_isBibleVol(volKey)) {
    const manifest = _bibleManifest();
    const parts = manifest && manifest[key];
    if (!Array.isArray(parts)) return null;
    const at = parts.findIndex((p) => p && _assetUrlFor(volKey, p[0]) === track.url);
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
  let queue = _tracksFor(o.volKey, o.letter, o.collectionLabel);
  if (!queue.length) return;
  const reader = o.reader || _preferredReaderFor(o.volKey, o.letter, o.collectionLabel);
  // Album behavior (owner directive 2026-08-08): a hero Listen queues the
  // WHOLE collection positioned at this letter, so the bar's prev/next walk
  // neighboring letters and playback continues past the letter's end. The
  // registry globals live in index.html; when absent (tests, stripped
  // harnesses) the letter still plays alone.
  const items = o.letter && o.letter.id ? _collectionItems(o.volKey, o.letter.id) : null;
  if (items && items.some((item) => item && item.id === o.letter.id)) {
    playCollection({ volKey: o.volKey, items, collectionLabel: o.collectionLabel, startId: o.letter.id, startReader: reader });
    return;
  }
  const rendition = _renditionByReader(o.volKey, o.letter, o.collectionLabel, reader);
  if (rendition) queue = rendition.tracks;
  if (_offlineRefuses(queue)) { _toast(OFFLINE_MSG); return; }
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
 * @returns {boolean} false when nothing started (no recordings, or offline with none of them downloaded)
 */
function playCollection(opts) {
  const o = opts || /** @type {any} */ ({});
  const items = Array.isArray(o.items) ? o.items : [];
  /** @type {Track[]} */
  let queue = [];
  for (const item of items) {
    const tracks = _tracksFor(o.volKey, item, o.collectionLabel);
    for (const t of tracks) queue.push(t);
  }
  if (!queue.length) return false;
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
    queue = _slicePartHorizon(queue, startKey, o.startPartIndex);
  }
  // A letter the listener CHOSE (startId) must itself be on the phone (or a reading of it): offline, it is never
  // silently swapped for a later downloaded one. Play all (no start) plays what is on the phone from the top.
  if (_offlineRefuses(startKey ? queue.filter((t) => t.key === startKey) : queue)) { _toast(OFFLINE_MSG); return false; }
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'collection', volKey: o.volKey, label: o.collectionLabel || null, startKey, startReader,
    startPartIndex: startKey ? Math.floor(Number(o.startPartIndex) || 0) : 0 });
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
  return true;
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
  const all = sectionTracks(volKey, collectionLabel);
  if (!all.length) return;
  const startIndex = Math.max(0, Math.min(index || 0, all.length - 1));
  const queue = all.slice(startIndex);
  if (_offlineRefuses(queue)) { _toast(OFFLINE_MSG); return; }
  // R8b — a NEW queue replacing this one is a boundary like any other:
  // without this the outgoing recording loses up to five seconds (the
  // throttle window) every time the listener starts something else.
  _rememberOutgoingPosition();
  _setPendingRestore(null);
  _setSource({ mode: 'section', volKey, label: collectionLabel || null, startIndex });
  _state.queue = queue;
  _state.qi = 0;
  _countPlay();
  _start();
  // Section compilations (the 2-hour WTLB parts) are the best resume case of
  // all — same consult as every other entry point.
  _seekOnMetadata(_resumeAt(_state.queue[0]));
}

/* ── Songs of the Letters (2026-09-24) ──────────────────────────────────────
   The flock's songs ride this one player (README §1.2) under `song:<id>` keys.
   A songs queue is DESCRIBED by `_source` (filter + seed, or explicit ids, and
   a start), so the boot snapshot of a 900-song shuffle stays tiny, and
   song-catalog.js's songQueue() is the one order both a fresh start and the
   boot rebuild use. What songs are kept OUT of lives beside each gate:
   _notifyListened (read credit, streaks, completions), _countPlay (recent
   shelf, lifetime plays), _rememberPosition/_resumeAt (the resume map), _start
   (the reading speed) and _extendQueue (no auto-continue into letters). */

/** Most ids a caller may hand playSongs — "every saved song" is the longest (500). */
const SONG_IDS_MAX = 1000;

/** @param {any[]} songs @returns {Track[]} */
function _songTracks(songs) {
  /** @type {Track[]} */
  const out = [];
  for (const song of songs) { const t = songTrack(song); if (t) out.push(t); }
  return out;
}

/** A fresh shuffle seed (uint32, never 0 so a seeded source reads as one). @returns {number} */
function _newSeed() {
  return ((Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0) || 1;
}

/**
 * Play songs from the catalog. Either `ids` (an explicit list: a family's
 * versions, the saved songs) or a `filter` ({ col, style, letter, family, q,
 * lang, dl }; `{}` is every song). `shuffle` plays them in a seeded order
 * (`seed` makes it reproducible; one is drawn when absent). `onePerFamily`
 * queues ONE version of each song — the "Shuffle all songs" rule, so 912
 * different songs play before any repeats — and defaults to `shuffle`: a
 * shuffle started from a filter is one version per family unless the caller
 * says otherwise. `startId` is the song to begin with. False when nothing
 * started (no catalog, nothing matched, or offline).
 *
 * @param {{ ids?: string[], filter?: any, startId?: string, shuffle?: boolean, onePerFamily?: boolean, seed?: number, label?: string }} opts
 * @returns {boolean}
 */
function playSongs(opts) {
  const o = opts || /** @type {any} */ ({});
  const shuffle = !!o.shuffle;
  const seed = shuffle ? ((Number.isInteger(o.seed) ? /** @type {number} */ (o.seed) >>> 0 : 0) || _newSeed()) : 0;
  const startKey = isSongId(o.startId) ? 'song:' + o.startId : null;
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 120) : 'Songs of the Letters';
  /** @type {any} */
  let desc;
  if (Array.isArray(o.ids)) {
    // An explicit list is ordered ONCE, here, and stored as played: shuffling
    // ids at every rebuild would reorder a queue the listener already hears.
    // A shuffled list opens on the chosen song, the rest in the seeded order; a
    // plain one is forward-only from it, like every other queue.
    const ids = o.ids.filter(isSongId).slice(0, SONG_IDS_MAX);
    const startId = startKey ? /** @type {string} */ (o.startId) : '';
    const order = shuffle ? (startId ? [startId] : []).concat(seededShuffle(ids.filter((id) => id !== startId), seed)) : ids;
    const list = songQueue({ ids: order, startKey: shuffle ? null : startKey });
    desc = { mode: 'songs', volKey: 'song', label, ids: list.map((s) => s.id), filter: null, one: false, seed, shuffle, startKey: null };
  } else {
    const one = typeof o.onePerFamily === 'boolean' ? o.onePerFamily : shuffle;
    desc = { mode: 'songs', volKey: 'song', label, ids: null, filter: normalizeSongFilter(o.filter), one, seed, shuffle, startKey };
  }
  const queue = _songTracks(songQueue(desc));
  if (!queue.length) return false;
  if (_offlineRefuses(queue)) { _toast(OFFLINE_MSG); return false; }
  _rememberOutgoingPosition();   // R8b — the reading being left keeps its place
  _setPendingRestore(null);
  _setSource(desc);
  _state.queue = queue;
  _state.qi = 0;
  _countPlay();
  _start();
  return true;
}

/** The repeat mode in force — songs queues only; every other queue plays through. @returns {'off'|'one'|'all'} */
function _repeatMode() {
  return _source && _source.mode === 'songs' ? _state.repeat : 'off';
}

/** Repeat 'one': the song that just ended starts again from its top. @returns {void} */
function _replayCurrent() {
  if (_el) { try { _el.currentTime = 0; } catch (_e) { /* the load below restarts it anyway */ } }
  _start();
}

/**
 * Set the repeat mode: 'off', 'one' (replay the song at its end) or 'all'
 * (wrap to the top of the queue at its end). It governs songs queues only, and
 * any queue that is not songs resets it, so a letter never loops.
 * @param {unknown} mode
 * @returns {'off'|'one'|'all'}
 */
function setRepeat(mode) {
  const next = mode === 'one' || mode === 'all' ? mode : 'off';
  if (_state.repeat !== next) {
    _state.repeat = next;
    _persist();
    _notify();
  }
  return next;
}

/**
 * Play another version of the song playing, from its start, IN ITS PLACE: the queue, its place in it (and so the
 * songs already heard), its label, shuffle and repeat all stay (README 3.6; sweep n3-02 - the desk rebuilt the queue
 * as a fresh list, which dropped shuffle, label and history and cut a restored queue to 50). A described queue keeps
 * the choice as a swap its rebuild replays; an explicit list swaps the id. False when nothing songs is playing or
 * `id` is not another version of the same song.
 * @param {unknown} id
 * @returns {boolean}
 */
function switchSongVersion(id) {
  if (!isSongId(id)) return false;
  if (_pendingRestore) {
    // The restored bar stands in for a queue not built yet: build it, then switch in it.
    void _rebuildRestoredQueue().then(() => { switchSongVersion(id); });
    return true;
  }
  const src = _source;
  const cur = _state.queue[_state.qi];
  if (!src || src.mode !== 'songs' || !_isSong(cur)) return false;
  const curId = songIdOfKey(cur.key);
  const from = songById(curId);
  const to = songById(id);
  if (!from || !to || curId === id || to.f !== from.f) return false;
  const track = _songTracks([to])[0];
  if (!track) return false;
  /** @type {any} */
  let desc;
  if (Array.isArray(src.ids)) {
    desc = { ...src, ids: src.ids.map((x) => (x === curId ? /** @type {string} */ (id) : x)) };
  } else {
    // Keyed by the catalog's own version at this place, however many switches ago it was replaced.
    const swaps = { ...(cleanSongSwaps(src.swaps) || {}) };
    const orig = Object.keys(swaps).find((k) => swaps[k] === curId) || curId;
    if (orig === id) delete swaps[orig]; else swaps[orig] = /** @type {string} */ (id);
    desc = { ...src, swaps: Object.keys(swaps).length ? swaps : null };
    if (songIdOfKey(src.startKey) === curId) desc.startKey = track.key;   // the queue begins at this song
  }
  _setSource(desc);
  _state.queue = _state.queue.slice();
  _state.queue[_state.qi] = track;
  _forgetPosition(track.url);   // from the start
  _start();
  _lastPersistSec = -1;
  _persist();
  return true;
}

/**
 * Turn shuffle on or off for the songs queue that is playing. It REORDERS; it
 * never changes which songs are in the queue (one version per family stays
 * exactly as it was). The song playing keeps playing and becomes the head of a
 * queue rebuilt from the descriptor: on, the rest in a fresh seeded order; off,
 * the catalog order onward from it. An explicit list reshuffles its rest on,
 * and keeps its order off (the order before the shuffle is not kept). False
 * when the queue is not songs.
 * @param {unknown} on
 * @returns {boolean}
 */
function setShuffle(on) {
  const src = _source;
  const cur = _state.queue[_state.qi];
  if (_pendingRestore || !src || src.mode !== 'songs' || !_isSong(cur)) return false;
  const want = !!on;
  const seed = want ? _newSeed() : 0;
  /** @type {any} */
  let desc;
  if (Array.isArray(src.ids)) {
    const curId = songIdOfKey(cur.key);
    const rest = src.ids.filter((id) => id !== curId);
    desc = { ...src, ids: [curId].concat(want ? seededShuffle(rest, seed) : rest), seed, shuffle: want, startKey: null };
  } else {
    // Off, the whole list turns to begin at the song playing: nothing is dropped (sweep n3-01).
    desc = { ...src, seed, shuffle: want, startKey: cur.key, wrap: true };
  }
  const queue = _songTracks(songQueue(desc));
  if (!queue.length || queue[0].url !== cur.url) return false;
  _setSource(desc);
  _state.queue = queue;
  _state.qi = 0;
  _syncMediaSessionActions();
  _persist();
  _notify();
  return true;
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
  // No blanket offline refusal (item 8): playBibleBook and playCollection check for themselves, and the lone
  // track below is checked before any state changes - "On this phone", the shelves and Resume last play through here.
  const normalized = normalizeAudioTrack(track);
  if (!normalized) return;
  if (_isSong(normalized)) {
    // A song row is a PLACE in its family: the versions from this one on. A
    // taken-down song (hid) never plays; a hidden duplicate plays its kept
    // twin. Without a catalog the row still plays alone, below.
    const own = songById(songIdOfKey(normalized.key));
    const song = own && own.hid && own.dup ? songById(own.dup) : own;
    if (song && song.hid) { _toast(LOAD_FAIL_MSG); return; }
    if (song && playSongs({ filter: { family: song.f }, startId: song.id, label: normalized.sub || undefined })) return;
  }
  const at = _locateTrack(normalized);
  if (at && at.bible) {
    // partIndex + 1 IS the chapter for a per-chapter edition, and 1 for a
    // whole-book one (whose chapter-start offset is 0, leaving resume to win).
    playBibleBook({ volKey: at.volKey, bookId: at.id, label: normalized.sub, chapterNum: at.partIndex + 1 });
    return;
  }
  if (at) {
    const items = _collectionItems(at.volKey, at.id);
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
  if (_offlineRefuses([normalized])) { _toast(OFFLINE_MSG); return; }
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
  // A failed element stays failed until src is re-assigned; an element still
  // holding ANOTHER recording (a seam that paused offline, item 8) must load
  // the one the bar names.
  if (_el.error || _el.src !== track.url) {
    // Re-load it and seek back to where playback died once metadata is
    // available (currentTime can't be set before then).
    const resumeAt = _errorTime;
    _el.src = track.url;
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

/* ── the site order (w-audio-continue, 2026-09-11) ──────────────────────────
   A reader who pressed Listen once never touches the phone again: a spent collection continues
   into the next one in catalogue order (COLLECTIONS, the Home cards' order — only entries WITH a
   card; Hidden Manna has none and is never entered uninvited), a spent Bible book into the next
   book of the same edition (BIBLE_AUDIO_BOOKS order); a carded collection with no recordings is
   passed over; the order ENDS at its last unit — no wrap. There is no switch on this: Pause is
   the off switch, and a setting nobody asked for is a setting to explain, test and maintain (the
   Orchestrator, 2026-09-11). Everything here is synchronous — the registries are in memory
   whenever anything from them is playing — so the seam stays inside the 'ended' task on the one
   element, which is what carries the Listen tap's activation across every boundary. Screen
   following is NOT this module's business: hooks/use-audio-follow.js watches the unit boundary.
   ─────────────────────────────────────────────────────────────────────────── */

/** volKey of a "volKey:id" track key, or '' (range-compilation sections carry no key). */
function _volKeyOf(key) {
  if (typeof key !== 'string') return '';
  const at = key.indexOf(':');
  return at > 0 ? key.slice(0, at) : '';
}

/**
 * A track from another collection is starting: the descriptor follows it, with the horizon
 * cleared (the start key belonged to the collection being left). Bible books share one volKey
 * per edition, so a book boundary changes nothing here — the snapshot's `key` names the book.
 *
 * @param {Track} track
 * @returns {void}
 */
function _crossInto(track) {
  if (!_source || _source.mode !== 'collection') return;
  const volKey = _volKeyOf(track.key);
  if (!volKey || volKey === _source.volKey) return;
  _setSource({ mode: 'collection', volKey, label: track.sub || null, startKey: null, startReader: null, startPartIndex: 0 });
}

/**
 * The carded collections after `volKey` in site order, each with its items — the same items a
 * hero Listen would queue (_collectionItems: preface first, then the letters).
 *
 * @param {string} volKey
 * @returns {{ volKey: string, label: string | null, items: any[] }[]}
 */
function _collectionsAfter(volKey) {
  const cols = Array.isArray(_g().COLLECTIONS) ? _g().COLLECTIONS : [];
  const at = cols.findIndex((c) => c && c.volKey === volKey);
  if (at < 0) return [];
  return cols.slice(at + 1)
    .filter((c) => c && c.cardId)
    .map((c) => ({ volKey: c.volKey, label: c.label || null, items: _collectionItems(c.volKey) || [] }));
}

/**
 * The studies after the one owning `chapterId`, in BIBLE_STUDIES order, each a unit of its own
 * chapters (ra1, 2026-09-21: Lamb of God 14 -> Purity 1, the way a book runs into the next book).
 * A study with no recording is passed over by _extendQueue's empty-tracks rule.
 *
 * @param {string} chapterId
 * @returns {{ volKey: string, label: string | null, items: any[] }[]}
 */
function _studiesAfter(chapterId) {
  const studies = Array.isArray(_g().BIBLE_STUDIES) ? _g().BIBLE_STUDIES : [];
  const at = studies.indexOf(_studyOfChapter(chapterId));
  if (at < 0) return [];
  return studies.slice(at + 1)
    .filter((st) => st && Array.isArray(st.chapters))
    .map((st) => ({ volKey: 'study', label: st.title || null, items: st.chapters }));
}

/**
 * The books after `bookId` that this edition recorded, in canonical order, as one-item units.
 *
 * @param {string} volKey
 * @param {string} bookId
 * @returns {{ volKey: string, label: string | null, items: any[] }[]}
 */
function _booksAfter(volKey, bookId) {
  const books = Array.isArray(_g().BIBLE_AUDIO_BOOKS) ? _g().BIBLE_AUDIO_BOOKS : [];
  const at = books.findIndex((b) => Array.isArray(b) && b[0] === bookId);
  if (at < 0) return [];
  const m = _mapFor(volKey);
  const label = _source ? _source.label : null;
  return books.slice(at + 1)
    .filter((b) => ((m && m[volKey + ':' + b[0]]) || []).length > 0)
    .map((b) => ({ volKey, label, items: [{ id: b[0], title: b[1] }] }));
}

/**
 * Append the next unit of the site order to the queue. False when there is none — a queue that
 * is neither a collection nor a section run (a saved track, a lone letter with no registry), a
 * key-less last track outside a section run, or the end of the order. Idempotent: refusing twice
 * is the designed path at the end.
 *
 * @returns {boolean}
 */
function _extendQueue() {
  // A songs queue is refused here like a custom one: songs never continue into
  // letters (README §1.1) — a songs queue ends, or wraps under repeat 'all'.
  if (!_source || (_source.mode !== 'collection' && _source.mode !== 'section')) return false;
  const last = _state.queue[_state.queue.length - 1];
  // A section run's tracks carry key null (one file, many letters); the run
  // belongs to its collection, so the site order continues from THAT (2026-09-20).
  const volKey = _source.mode === 'section' ? (_source.volKey || '') : (last ? _volKeyOf(last.key) : '');
  if (!volKey) return false;
  const units = _isBibleVol(volKey)
    ? _booksAfter(volKey, /** @type {string} */ (last.key).slice(volKey.length + 1))
    : volKey === 'study'
      ? _studiesAfter(/** @type {string} */ (last.key).slice(volKey.length + 1))
      : _collectionsAfter(volKey);
  for (const unit of units) {
    /** @type {Track[]} */
    const tracks = [];
    for (const item of unit.items) for (const t of _tracksFor(unit.volKey, item, unit.label)) tracks.push(t);
    if (!tracks.length) continue;   // carded, but nothing recorded yet — pass over it
    _state.queue = _state.queue.concat(tracks);
    return true;
  }
  return false;
}

/**
 * Advance one track; extend into the next unit of the site order at the end of the queue, and
 * stop() only at the end of the order. Also the 'ended' handler.
 *
 * @returns {void}
 */
function next() {
  if (!_state.queue.length) return;
  if (_pendingRestore) { void _rebuildRestoredQueue(); return; }
  _rememberOutgoingPosition();   // R8 — attribute the clock before qi moves
  // The end of the queue is the end of the ORDER, not merely of a unit: the site order was
  // already appended when this unit's last track STARTED (_start → _extendQueue, so the boundary
  // track is warmed during this one), and nothing between that start and this end can turn a
  // refused extension into a granted one — a queue edit switches the source to 'custom', which
  // _extendQueue refuses. So a queue that still ends here has nowhere to go: stop().
  // (A second _extendQueue() call lived here until 2026-09-12; verifier-2 measured that nothing
  // exercised it and its comment's reason was false.)
  // …unless a songs queue repeats: 'all' wraps to its top instead of ending.
  if (_state.qi + 1 >= _state.queue.length) {
    if (_repeatMode() !== 'all') { stop(); return; }
    _state.qi = 0;
  } else {
    _state.qi++;
  }
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
  _secLastT = -1;   // a jump is never "heard": the compilation follower re-bases on the next tick
  if (!_el) {
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
       target out of that recording's own timings file. */
    if (!_pendingRestore) return;          // idle: no element and nothing to restore
    const at = Math.max(0, Math.floor(seconds || 0));
    _pendingRestore.time = at;
    _state.time = at;
    _lastTick = at;
    _lastPersistSec = at;
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
    _lastPersistSec = _lastTick;
    _persist();
    return;
  }
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
 * Set the playback rate (any 1 % step in the product range) and persist it in
 * the Listening Library. Playback itself never depends on the metadata store succeeding.
 *
 * @param {unknown} rate
 * @returns {number}
 */
function setPlaybackRate(rate) {
  const next = normalizeAudioRate(rate);
  _readingRate = next;
  // The READING speed moves; a song playing now stays at 1× and the new speed
  // takes effect at the next reading.
  const effective = _isSong(_state.queue[_state.qi]) ? 1 : next;
  const changed = _state.rate !== effective;
  _state.rate = effective;
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
/**
 * The countdown's end: pause (never stop, so the queue and the resume point survive) at the bottom of the fade.
 * The timeout calls it, and so does the clock when the timeout is overdue: a hidden page's timers may run late, and
 * under the native player (m3) the page is silent, so a late timeout would leave the listener in faded silence while
 * the recording, and the resume point, ran on (native's 1 Hz ticks keep the clock running with the screen off).
 * @returns {void}
 */
function _sleepTimerFire() {
  if (_sleepTimer) { clearTimeout(_sleepTimer); }
  _sleepTimer = null;
  _state.sleepEndsAt = 0;
  _state.sleepMinutes = 0;
  const wasLive = _state.status === 'playing' || _state.status === 'loading';
  if (wasLive && _el) _el.pause();
  _markPaused();
  _syncSleepVolume();   // paused at the bottom of the fade; the next Play is at full voice
  if (!wasLive) _notify();
  if (wasLive) _toast('Sleep timer ended. Playback paused.');
}

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
function setSleepAtTrackEnd() {
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
  // An edited SONGS queue stays a songs descriptor — its explicit ids, in the
  // edited order — never a `custom` queue: a custom queue persists every track
  // on every tick, which is the hazard a 900-song shuffle cannot afford.
  if (_source && _source.mode === 'songs' && queue.every(_isSong)) {
    _setSource({ ..._source, ids: queue.map((t) => songIdOfKey(t.key)), filter: null, startKey: null });
  } else {
    _setSource({ mode: 'custom', volKey: '', label: current ? current.sub : null });
  }
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
  _resetSectionFollow();
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
  if (_pendingRestore && !_libraryWatched) _followLibraryRate();   // ra3: the store may not exist at module eval
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
function getPreciseTime() { return _el && _el.readyState >= 1 ? (_el.currentTime || 0) : _state.time; }

// Boot-time durable-resume: if a prior session left a position snapshot, put
// the bar up PAUSED at that spot (display-only state; no network, no corpus).
// Runs at module eval — deliberately touches only localStorage + _state.
_restoreFromSaved();

/* ── resume across the update's self-reload (Corbin, 2026-09-10) ──────────
   "reload should be seamless, instant, with a toast indicating what happened,
   and should otherwise land reader back exactly where they were before the
   update." For a listener that is the same recording at the EXACT clock,
   playing again.

   The periodic snapshot above is whole-second and up to ~5 s late, and the
   boot restore it feeds is a PAUSED bar. So: sw-register fires
   `vot:before-update-reload` right before reload(); while playing we refresh
   the snapshot and write a small sessionStorage record with the element's own
   currentTime (sessionStorage: this tab, this reload, gone with the tab — a
   flag that outlived its reload would resume a recording nobody asked for).
   The boot after the reload consumes the record, seeks the restored bar to
   that clock and tries play() without a gesture. Android's WebView allows it
   (mediaPlaybackRequiresUserGesture=false); a browser that refuses answers
   NotAllowedError — tried ONCE more 300 ms later when the reader's sticky
   activation says the tap already happened (the activation race, below) —
   and the update toast then carries the tap
   (utils/update-toast.js, reached through window.__votUpdateToastResume —
   bundle-d cannot import bundle-b). Paused or idle at the reload: no record. */
const RESUME_AFTER_UPDATE_KEY = 'vot-audio-resume-after-update';
const RESUME_AFTER_UPDATE_MAX_AGE_MS = 2 * 60 * 1000;
let _resumeAfterUpdateArmed = false;

function _onBeforeUpdateReload() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const track = _state.queue[_state.qi];
    if (_state.status !== 'playing' || !_el || !track) { sessionStorage.removeItem(RESUME_AFTER_UPDATE_KEY); return; }
    const time = _el.currentTime || 0;
    _state.time = time;
    _lastPersistSec = Math.floor(time);
    _persist();
    sessionStorage.setItem(RESUME_AFTER_UPDATE_KEY, JSON.stringify({ url: track.url, time, at: Date.now() }));
  } catch (_e) { /* storage blocked — the periodic snapshot is what remains */ }
}

/* ── the CLOSE with no reload event (2026-09-11, audio-clock-close-gap-1) ──
   A closed tab is not an update: nothing fires vot:before-update-reload, and
   what the next boot found was the periodic snapshot — up to ~5 s late (the
   Verifier read the restored bar ~14 s behind after a browser close). pagehide
   is the last event a document gets — tab close, navigation away, the Android
   WebView's destroy — and the element is still live in it: write the snapshot
   then, with the clock getPreciseTime() defines (the element from
   HAVE_METADATA on, else the intent — never an unloaded element's 0).
   visibilitychange → hidden is the phone's
   background, where the audio keeps playing and the periodic writer keeps
   running: one more point, so a kill soon after backgrounding loses less.
   Only while PLAYING: a paused bar's clock is the pause's, already written;
   re-reading a stopped element would let a stray value overwrite it. */
function _flushOnHide() {
  if (_state.status !== 'playing' || !_el) return;
  _state.time = getPreciseTime();   // the one definition of the clock right now
  _lastPersistSec = Math.floor(_state.time);
  _persist();
}
/* One live player per window. A re-import (the test harness's vi.resetModules)
   retires the previous instance's window listeners first, so a stale instance
   cannot answer a later document's events — the same reason the play arbiter
   is reachable as __votAudioArbiter. */
if (typeof window !== 'undefined') {
  const g = _g();
  if (typeof g.__votAudioPlayerRetire === 'function') g.__votAudioPlayerRetire();
  const onVisibility = () => { if (document.visibilityState === 'hidden') _flushOnHide(); else _onVisible(); };
  window.addEventListener('vot:before-update-reload', _onBeforeUpdateReload);
  window.addEventListener('pagehide', _flushOnHide);
  document.addEventListener('visibilitychange', onVisibility);
  g.__votAudioPlayerRetire = () => {
    window.removeEventListener('vot:before-update-reload', _onBeforeUpdateReload);
    window.removeEventListener('pagehide', _flushOnHide);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/* ── the activation race (update-resume-activation-race-1, 2026-09-11) ────
   The document reloaded for an update has the reader's STICKY activation from
   its first instant (navigator.userActivation.hasBeenActive — the tap that
   started the recording, kept across the reload) but its TRANSIENT activation
   arrives ~90–175 ms after document start, and a boot play() that lands before
   it is refused on the same boot that allows it 300 ms later (the Verifier's
   probe on 95's tree: play() held to +166 ms REFUSED, to +443 ms ALLOWED; 11 of
   11 local arms refused, 3 of 4 live arms resumed by themselves). So a refused
   resume with the sticky bit set is retried ONCE, RESUME_RETRY_MS later; a
   second refusal takes the toast path. An absent API is not "true" (older
   WebViews, jsdom): no retry. The retry is the same element at the same
   intended seek — no clock moves — and it stands down if anything else asked
   the element to play meanwhile, so audio is never asked to start twice. */
const RESUME_RETRY_MS = 300;
let _resumeRetried = false;

function _stickyActivation() {
  try { const u = navigator.userActivation; return !!u && u.hasBeenActive === true; } catch (_e) { return false; }
}

function _retryResumePlay() {
  if (!_resumeAfterUpdateArmed || !_el) return;                 // the toast path already ran, or the bar is gone
  if (!_el.paused) { _resumeAfterUpdateArmed = false; return; } // the reader's own tap asked for sound: nothing to add
  const p = _el.play();
  if (p && typeof p.then === 'function') p.then(() => { _resumeAfterUpdateArmed = false; }, (err) => { _playRefused(err); });
}

/** A play() the browser refused. NotAllowedError is the autoplay policy: the
 *  bar shows Play instead of a spinner, and if this was the update resume the
 *  update toast offers the tap — after the one retry above, when the reader's
 *  sticky activation says the tap already happened. Anything else is the
 *  element's 'error' path. */
function _playRefused(err) {
  if (!err || err.name !== 'NotAllowedError') return;
  _markPaused();
  if (!_resumeAfterUpdateArmed) return;
  if (!_resumeRetried && _stickyActivation()) {
    _resumeRetried = true;
    setTimeout(_retryResumePlay, RESUME_RETRY_MS);
    return;
  }
  _resumeAfterUpdateArmed = false;
  const offer = _g().__votUpdateToastResume;
  if (typeof offer === 'function') offer(() => { toggle(); });
}

function _resumeAfterUpdate() {
  let rec = null;
  try {
    if (typeof sessionStorage === 'undefined') return;
    const raw = sessionStorage.getItem(RESUME_AFTER_UPDATE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(RESUME_AFTER_UPDATE_KEY);         // consumed: never replayed
    rec = JSON.parse(raw);
  } catch (_e) { return; }
  if (!rec || !_pendingRestore || rec.url !== _pendingRestore.url) return;
  if (!(typeof rec.at === 'number' && Date.now() - rec.at < RESUME_AFTER_UPDATE_MAX_AGE_MS)) return;
  const time = Number(rec.time);
  if (Number.isFinite(time) && time >= 0) { _pendingRestore.time = time; _state.time = time; }
  _resumeAfterUpdateArmed = true;
  void _rebuildRestoredQueue();
}
_resumeAfterUpdate();
_adoptDurableSnapshot();

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
  sectionTracks,
  readerLabel,
  renditionsFor,
  setPreferredReader,
  playbackTracks,
  playLetter,
  playCollection,
  playSection,
  playBibleBook,
  playSongs,
  setShuffle,
  switchSongVersion,
  setRepeat,
  bibleChapterStart,
  bibleChapterOfTrack,
  sectionLetterKeyAt,
  sectionOpeningKey,
  liveLetter,
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
  syncKeepAlive,
};
