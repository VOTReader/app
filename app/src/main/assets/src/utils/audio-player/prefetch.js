// @ts-check
/* audio-player/prefetch — the gentle warm of the next queued recordings (web engine only). */

import { AUDIO_BIBLE_RELEASE_PREFIX } from '../audio-track.js';
import { _offline, _state } from './core.js';
import { _el, _native } from './engine.js';
import { _songKept } from './offline.js';
import { _pendingRestore } from './persist.js';

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
    if (_songKept(_state.queue[i])) continue;   // on the phone already: nothing to warm
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

export function _stopWarming() {
  if (_warmTimer) { clearTimeout(_warmTimer); _warmTimer = null; }
  _warmingUrl = null;
  if (_warmEl) {
    _warmEl.removeAttribute('src');
    try { _warmEl.load(); } catch (_e) { /* already idle */ }
  }
}

export function _maybePrefetchNext() {
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
