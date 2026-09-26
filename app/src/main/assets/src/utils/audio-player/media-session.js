// @ts-check
/* audio-player/media-session — everything outside the page that shows or steers playback: the Android
   keep-alive (and the honest pause when Android refuses it, sf1), the web Media Session, the native
   media card and its transport commands, and the one-audible-recording arbiter. */

import { BIBLE_AUDIO_EDITIONS, songIdOfKey } from '../audio-track.js';
import { songById, songThumbUrl } from '../song-catalog.js';
import { readerLabel } from './catalog.js';
import {
  _el,
  _g,
  _isBibleVol,
  _isSong,
  late,
  _native,
  _state,
  _toast,
} from './core.js';
import { _letterTitleOf, _secKey } from './sections.js';

/** @typedef {import('../audio-player.js').Track} Track */

/** Default short-jump, seconds — the same step the listening desk's ∓15 buttons
 *  take, so a host media card that omits `seekOffset` agrees with the app. */
const SEEK_STEP_SEC = 15;

/**
 * Raise the held keep-alive edge if playback is running once the tour is over: the tour stops
 * what it started, but a track the reader began during the tour by some other control would
 * otherwise run on without the media card until the next 'playing' edge. TourController calls
 * this from end(); idempotent (Kotlin's ask is one-shot per process, keep-alive is a no-op when on).
 */
export function syncKeepAlive() {
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
export function _raiseKeepAlive() {
  if (_tourShowing()) return;
  if (!_setAudioActive(true) && _hidden()) setTimeout(_pauseUnheard, 0);
}

/** Set by an honest pause while hidden; the next return to the screen says why playback stopped. */
let _pausedUnheard = false;
const PAUSED_UNHEARD_MSG = 'Paused while the screen was off: the phone would have played it silently. Press play to go on.';

/** The honest pause (sf1): only while hidden, and only what is playing or starting. */
function _pauseUnheard() {
  if (!_hidden() || (_state.status !== 'playing' && _state.status !== 'loading')) return;
  _pausedUnheard = true;
  late.pauseIfPlaying();
}

/** Back on screen: raise the keep-alive again if playback runs (a no-op in native when it holds), and say why an
 *  honest pause happened (sf1). */
export function _onVisible() {
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

/**
 * Android keep-alive. NOTE: PlatformBridge is normally the ONLY place that
 * touches window.AndroidBridge — setAudioActive is not on PlatformBridgeShape
 * yet because the Kotlin side lands in a separate commit. Fold this into
 * PlatformBridge when it does.
 *
 * @param {boolean} active
 * @returns {boolean} false only when the APK says Android refused the service (sf1)
 */
export function _setAudioActive(active) {
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
export function _pauseOtherDomAudio(except) {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  for (const media of document.querySelectorAll('audio')) {
    if (media === except || media.paused) continue;
    try { media.pause(); } catch (_e) { /* another app-owned player may already be detaching */ }
  }
}

export function _installMediaArbiter() {
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
    late.pauseIfPlaying();
  };
  g.__votAudioArbiter = handler;
  _mediaArbiterInstalled = true;
  document.addEventListener('play', handler, true);
}

export function _mediaSession(track) {
  // Native twin FIRST — the early-returns below bail on hosts without the web
  // MediaSession API (jsdom, old WebViews), and the Android media card must
  // not depend on the web API existing.
  _installNativeTransport();
  _syncNative();
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = /** @type {any} */ (navigator).mediaSession;
    _setCardMetadata(ms, track);
    _setAction(ms, 'play', () => late.toggle());
    _setAction(ms, 'pause', () => late.toggle());
    _setAction(ms, 'seekto', (/** @type {any} */ d) => late.seek((d && d.seekTime) || 0));
    // Desktop-PWA reach: Chrome's own media hub and hardware media keys
    // offer these three; the phone reads the NATIVE card instead (the web
    // MediaSession is inert inside the WebView), so this is desktop-only value
    // for three lines. `offset` is optional in the spec — default to the same
    // 15s the listening desk's ∓15 buttons use.
    _setAction(ms, 'seekbackward', (/** @type {any} */ d) => late.skip(-((d && d.seekOffset) || SEEK_STEP_SEC)));
    _setAction(ms, 'seekforward', (/** @type {any} */ d) => late.skip((d && d.seekOffset) || SEEK_STEP_SEC));
    _setAction(ms, 'stop', () => late.stop());
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
export function _syncMediaSessionActions() {
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = /** @type {any} */ (navigator).mediaSession;
    const multi = _state.queue.length > 1;
    _setAction(ms, 'previoustrack', multi ? () => late.prev() : null);
    _setAction(ms, 'nexttrack', multi ? () => late.next() : null);
  } catch (_e) { /* no Media Session on this host — cosmetic only */ }
}

/** Keep lock-screen scrubbers and Bluetooth displays in step with the player. */
export function _syncMediaSessionPosition() {
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
export function _syncMediaSessionState(status) {
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

export function _clearMediaSession() {
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
export function _cardArtist(track) {
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
export function _cardTitle(track) {
  if (_isSong(track)) return track.title;   // the version is the artist line's
  const live = track.key == null && _secKey && _state.queue[_state.qi] === track ? _letterTitleOf(_secKey) : null;
  return live || track.title + (track.partLabel ? ' — ' + track.partLabel : '');
}

/**
 * The album line: the collection, plus — once a compilation's letter holds the
 * title line — the section label it moved out of it.
 * @param {Track} track @returns {string}
 */
export function _cardAlbum(track) {
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
export function _syncNative() {
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
      if (cmd === 'next') late.next();
      else if (cmd === 'prev') late.prev();
      else if (cmd === 'seekTo') late.seek((Number(posMs) || 0) / 1000);
      // Play and Pause are idempotent (v02-audio-02, improvement sweep
      // 2026-09-22): the platform MediaSession sends onPause for
      // KEYCODE_MEDIA_PAUSE, the Assistant, Wear or a car head unit WHATEVER
      // the state, and the session advertises both actions, so a Pause while
      // paused must not start playback. Only the notification's own button
      // is a toggle.
      else if (cmd === 'pause') late.pauseIfPlaying();
      else if (cmd === 'play') { if (_state.status === 'paused') late.toggle(); }
      // Native lost the playback service while the page is hidden (a refused foreground start): the honest pause.
      // On screen nothing is muted, so it is never a toggle (sf1).
      else if (cmd === 'refused') _pauseUnheard();
      else late.toggle();
    } catch (_e) { /* a bad system command must never crash the player */ }
  };
}

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

// This module's verbs that the modules below it call (core.js `late`).
Object.assign(late, { _refreshCardMetadata });
