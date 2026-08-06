// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   audio-player — streaming audio-letter playback (singleton store)
   ═══════════════════════════════════════════════════════════════════════
   Letters across the 14 VOT collections have mp3 recordings hosted on
   public Google Drive. src/data/audio-manifest.js (auto-generated, rides
   bundle-a-vot) maps corpus ids → Drive file ids; this module turns that
   into a queue and drives ONE <audio> element.

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

/**
 * @typedef {Object} Track
 * @property {string | null} key       - "volKey:letterId"; null for range-compilation sections
 * @property {string} title            - letter title, or the section's own label
 * @property {string | null} sub       - collection label (Media Session "album")
 * @property {string} url              - Drive stream URL
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
  return 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
}

/* ── module state (singleton) ─────────────────────────────────────────── */

/** @type {HTMLAudioElement | null} */
let _el = null;
/** @type {Set<() => void>} */
const _listeners = new Set();
let _version = 0;
/** @type {AudioPlayerState} */
const _state = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0 };
/** Last whole second notified — the timeupdate re-render storm guard. */
let _lastTick = -1;
/** Position to resume from after a load error (see toggle()). */
let _errorTime = 0;
/** One-shot cold-start watchdog (see _start) — timer id + per-track flag. */
let _stallTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
let _stallRetried = false;
/** volKey → has-any-audio. The manifest is immutable once loaded. */
const _volHasAudio = new Map();

const _g = () => /** @type {any} */ (globalThis);
/** @returns {Record<string, Array<any[]>> | null} */
const _manifest = () => _g().AUDIO_MANIFEST || null;
/** @returns {Record<string, Array<any[]>> | null} */
const _sections = () => _g().AUDIO_SECTIONS || null;

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
  // Keep-alive tracks PLAYBACK, not buffering: 'loading' is a mid-stream stall
  // ('waiting'), and releasing the wake-lock there would let the OS kill the
  // very playback we're waiting on.
  if (next === 'playing') _setAudioActive(true);
  else if (next === 'paused' || next === 'idle') _setAudioActive(false);
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

/** @param {Track} track */
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
  } catch (_e) { /* unsupported action / no Media Session — cosmetic only */ }
}

function _clearMediaSession() {
  try {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = /** @type {any} */ (navigator).mediaSession;
    for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']) {
      ms.setActionHandler(a, null);
    }
    ms.metadata = null;
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
    if (_state.status === 'playing') {
      _setStatus('paused');
      _persist();   // durable resume — a pause is the likeliest walk-away point
    }
  });
  el.addEventListener('durationchange', () => {
    _state.duration = el.duration || 0;
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
      _notify();
      // Durable resume: snapshot every ~5s of playback (and on the pause
      // below). Cheap — ~300 bytes to localStorage.
      if (sec - _lastPersistSec >= 5 || sec < _lastPersistSec) { _lastPersistSec = sec; _persist(); }
    }
  });
  el.addEventListener('ended', () => next());
  el.addEventListener('error', _onError);

  _el = el;
  return el;
}

function _onError() {
  // stop() sets src='' + load(), which itself fires 'error' in real browsers.
  // Without this guard, every stop() would flash a failure toast.
  if (_state.status === 'idle' || !_state.queue.length) return;
  // Keep queue + qi + position: toggle() retries from here.
  _errorTime = _state.time;
  _setStatus('paused');
  _toast(_offline() ? OFFLINE_MSG : LOAD_FAIL_MSG);
}

/** Load + play queue[qi]. Assumes queue/qi are already set. */
function _start() {
  const track = _state.queue[_state.qi];
  if (!track) { stop(); return; }
  const el = _ensureEl();
  _state.time = 0;
  _state.duration = 0;
  _lastTick = -1;
  _errorTime = 0;
  el.src = track.url;
  // Assign directly rather than via _setStatus: queue/qi changed too, so this
  // must notify even when the previous track was already 'loading'.
  _state.status = 'loading';
  _notify();
  _mediaSession(track);
  const p = el.play();
  // play() rejects on autoplay policy / load failure; the 'error' listener owns
  // the user-visible message, so this just stops an unhandled rejection.
  if (p && typeof p.catch === 'function') p.catch(() => {});
  // Cold-start stall watchdog (observed on-device 2026-08-06): the very first
  // request of a session can hang inside the WebView network stack — no
  // 'error', no progress, 'loading' forever — while an immediate retry
  // streams instantly. If NOTHING has arrived after 20s, re-arm the src ONCE;
  // a genuinely dead network then surfaces through the normal error path.
  if (_stallTimer) clearTimeout(_stallTimer);
  _stallRetried = false;
  _stallTimer = setTimeout(() => {
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
 * Does this letter have a recording?
 *
 * @param {string} volKey
 * @param {string} letterId
 * @returns {boolean}
 */
function hasAudio(volKey, letterId) {
  const m = _manifest();
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
  const m = _manifest();
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
  const m = _manifest();
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
  const m = _manifest();
  if (!m || !item || !item.id) return [];
  const key = volKey + ':' + item.id;
  const parts = m[key];
  if (!parts || !parts.length) return [];
  return parts.map((p) => ({
    key,
    title: item.title || '',
    sub: collectionLabel || null,
    url: trackUrl(p[0]),
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
    if (!src || !track) return;
    localStorage.setItem(PERSIST_KEY, JSON.stringify({
      v: 1,
      mode: src.mode, volKey: src.volKey, label: src.label,
      qi: _pendingRestore ? _pendingRestore.qi : _state.qi,
      key: track.key,
      time: Math.floor(_state.time || 0),
      track: { title: track.title, sub: track.sub, readerCode: track.readerCode, partLabel: track.partLabel, url: track.url, key: track.key },
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
    if (!s || s.v !== 1 || !s.track || !s.track.url) return;
    _pendingRestore = { mode: s.mode, volKey: s.volKey, label: s.label, qi: s.qi || 0, key: s.key || null, time: s.time || 0 };
    _state.queue = [{ key: s.track.key || null, title: s.track.title || '', sub: s.track.sub || null, url: s.track.url, readerCode: s.track.readerCode || '', partLabel: s.track.partLabel || null }];
    _state.qi = 0;
    _state.time = s.time || 0;
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
  try {
    if (!_manifest() && typeof g.__loadVotCorpus === 'function') await g.__loadVotCorpus();
  } catch (_e) { /* corpus load failed — fall through to the placeholder track */ }
  /** @type {Track[]} */
  let queue = [];
  if (r.mode === 'section') {
    const sections = sectionsFor(r.volKey) || [];
    queue = sections.map((s) => ({ key: null, title: s[0] || '', sub: r.label, url: trackUrl(s[1]), readerCode: s[2] || '', partLabel: null }));
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
  let qi = 0;
  if (r.key) {
    const hits = queue.map((t, i) => ({ t, i })).filter((x) => x.t.key === r.key);
    if (hits.length) {
      // Multi-part letters share a key; land on the saved part when possible.
      const withinKey = Math.max(0, Math.min(hits.length - 1, (r.qi || 0) - hits[0].i));
      qi = hits[withinKey].i;
    }
  } else {
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
  if (_state.status !== 'paused') { _el.pause(); return; }

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
  _notify();
  // A paused seek is a deliberate reposition — snapshot it now, or closing
  // the app right after would resume at the pre-seek position.
  _lastPersistSec = _lastTick;
  _persist();
}

/**
 * Stop playback and clear the queue. Dropping `src` + load() tears down the
 * live Drive connection — a merely-paused element keeps streaming/holding it.
 *
 * @returns {void}
 */
function stop() {
  const wasActive = _state.status !== 'idle';
  // The ✕ means "I'm done with this" — a later boot must not resurrect it.
  _pendingRestore = null;
  _source = null;
  _clearPersist();
  if (_stallTimer) { clearTimeout(_stallTimer); _stallTimer = null; }
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
  if (_state.status === 'playing' && _el) _el.pause();
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
  firstReaderCode,
  collectionHasAudio,
  sectionsFor,
  readerLabel,
  playLetter,
  playCollection,
  playSection,
  toggle,
  next,
  prev,
  seek,
  stop,
  pauseIfPlaying,
};
