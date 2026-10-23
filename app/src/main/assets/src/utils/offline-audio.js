// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   offline-audio — recordings downloaded to the phone (listening item 8)
   ═══════════════════════════════════════════════════════════════════════
   The Android app keeps downloads in its own OfflineAudioStore and answers
   the <audio> element's requests for them from disk, so a downloaded letter,
   study chapter or Bible chapter plays, seeks and reads along with no signal.
   This is the page's mirror of that store, for the rows, the shelf and the
   player's offline gate: what is on the phone, what is downloading and how
   far, what failed and why.

   The native store is the truth. A 'done' or 'removed' event re-reads its
   whole state (one JSON call); 'queued', 'progress', 'failed' and
   'cancelled' are applied as they arrive (window.__votOfflineAudio, from
   JsEvent.OfflineAudio). In a browser the same calls go to
   offline-audio-web.js (cf1, 2026-09-26): saves come through the relay
   Worker into Cache Storage and the service worker plays them back, so the
   PWA and an iPhone on its Home Screen keep recordings too. Where neither
   store exists (an iPhone in a Safari tab, a private window) nothing is
   available and every call is a no-op.

   Bridge: window.AndroidBridge.offlineAudioState / offlineAudioSave /
   offlineAudioRemove / offlineAudioCancel, called directly (the
   setAudioActive pattern; BridgeContractTest pins the four).
   ═══════════════════════════════════════════════════════════════════════ */

import { isSongUrl, resolveBibleAudio } from './audio-track.js';
import { WebOfflineAudio } from './offline-audio-web.js';
import { loadAudioSync, loadBibleSync, loadAudioSyncSections } from './sync-loaders.js';
import { bytesOf, lengthsReady, lengthsSettled } from './audio-lengths.js';

/** @typedef {{ url: string, key: string, title: string, bytes: number, savedAt: number, stale: boolean }} SavedItem */
/** @typedef {'saved' | 'downloading' | 'queued' | 'failed' | 'none'} OfflineStatus */

/** @type {Set<() => void>} */
const _listeners = new Set();
let _version = 0;
/** @type {Map<string, SavedItem>} */
let _saved = new Map();
let _totalBytes = 0;
let _freeBytes = -1;
/** The browser said it may clear downloads under storage pressure (web only; native files are the app's own). */
let _evictable = false;
/** Download only on Wi-Fi (ra6): what is queued waits for Wi-Fi now (the store's state says so). */
let _waiting = false;
/** @type {Set<string>} */
let _queued = new Set();
/** @type {{ url: string, bytes: number, total: number } | null} */
let _active = null;
/** @type {Map<string, string>} */
let _failed = new Map();
/** @type {Map<string, number>} sizes (bytes) looked up before a download */
let _sizes = new Map();
/** @type {Set<string>} */
let _sizesAsked = new Set();
/** What each download was asked as ({key, title}), so a failure can be retried from anywhere (n2-05). */
/** @type {Map<string, { url: string, key: string, title: string }>} */
let _asked = new Map();
/** Asked by rows this turn, sent together once it ends: one bridge call per screen, not one per row (n2-02). */
/** @type {Set<string>} */
let _sizesToSend = new Set();
let _sizesFlushQueued = false;
/** Lookups that came back unanswered are asked again on their own, at these delays (brief section 7 item 9: the
 *  Download all total hid until the screen was opened again). */
const SIZE_RETRY_MS = [8000, 30000, 90000];
let _sizeRetry = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let _sizeRetryTimer = null;
/** What a screen reader hears next (n2-06): a batch started, the queue finished, a download failed. Not per percent. */
let _news = { seq: 0, text: '' };
/** @param {string} text */
function _say(text) { _news = { seq: _news.seq + 1, text }; }
/** The most urls one size call carries (OfflineAudioStore.MAX_SIZE_BATCH). */
const SIZE_BATCH = 400;
/**
 * The most urls one save, remove or cancel call carries (dl-d2): an older phone app took 400 and dropped the rest
 * silently, while the rows said every one was queued (a whole edition is 1,189).
 */
const SAVE_BATCH = 400;
/** dl-d2: the native queue's own words (BRIDGE.md): paused, why it waits, what is left, the batch's counts. */
let _paused = false;
/** @type {string | null} paused | wifi | offline | space | retrying */
let _reason = null;
let _left = { count: 0, bytes: 0, unknown: 0 };
let _batch = { done: 0, total: 0, failed: 0 };
let _loaded = false;

/** @returns {any} the phone app's bridge, or null */
function _nativeBridge() {
  const b = typeof window !== 'undefined' ? /** @type {any} */ (window).AndroidBridge : null;
  return b && typeof b.offlineAudioState === 'function' ? b : null;
}

/**
 * In the browser, a download also fetches its read-along timings (audit-listen item 26). The timings files are
 * cache-on-use in the service worker (corpusFirst serves every src/data/*.js from the corpus cache once fetched),
 * so a recording downloaded with "Download all" and never played online used to play offline with no wash. The
 * phone app ships them as assets: nothing to warm there. Letters fetch audio-sync.js, a Bible chapter its PLAYING
 * edition's file (resolved from the recording, as the wash does), a compilation (no key) audio-sync-sections.js.
 * @param {Array<{ url: string, key: string }>} items
 */
function _warmTimings(items) {
  if (_nativeBridge()) return;
  let letters = false, sections = false;
  const editions = new Set();
  for (const t of items) {
    if (isSongUrl(t.url)) continue;
    if (!t.key) { sections = true; continue; }
    if (t.key.lastIndexOf('bible-', 0) === 0) {
      const ed = resolveBibleAudio({ track: t }).paint;
      if (ed && ed.volKey) editions.add(ed.volKey);
      continue;
    }
    letters = true;
  }
  if (letters) loadAudioSync();
  if (sections) loadAudioSyncSections();
  for (const v of editions) loadBibleSync(v);
}

/** @returns {any} the store downloads go to: the phone app's, else this browser's (cf1), else null */
function _bridge() {
  return _nativeBridge() || (WebOfflineAudio.supported() ? WebOfflineAudio : null);
}

function _notify() {
  _version++;
  for (const cb of _listeners) {
    try { cb(); } catch (e) { console.warn('[offline-audio] subscriber threw', e); }
  }
}

/** Re-read the whole native state. */
function refresh() {
  const b = _bridge();
  if (!b) return;
  let s;
  try {
    const raw = b.offlineAudioState();
    s = raw ? JSON.parse(raw) : null;
  } catch (_e) { return; /* a native throw or bad JSON leaves the mirror as it was */ }
  if (!s || typeof s !== 'object') return;
  _loaded = true;
  const items = Array.isArray(s.items) ? s.items : [];
  _saved = new Map();
  for (const it of items) {
    if (it && typeof it.url === 'string') {
      _saved.set(it.url, { url: it.url, key: String(it.key || ''), title: String(it.title || ''), bytes: Number(it.bytes) || 0, savedAt: Number(it.savedAt) || 0, stale: it.stale === true });
    }
  }
  _totalBytes = Number(s.totalBytes) || 0;
  _freeBytes = typeof s.freeBytes === 'number' ? s.freeBytes : -1;
  _evictable = s.persisted === false;
  _waiting = s.waiting === true;
  _queued = new Set((Array.isArray(s.queued) ? s.queued : []).filter((u) => typeof u === 'string'));
  const a = s.active;
  _active = a && typeof a.url === 'string' ? { url: a.url, bytes: Number(a.bytes) || 0, total: Number(a.total) || -1 } : null;
  _paused = s.paused === true;
  _reason = typeof s.reason === 'string' ? s.reason : null;
  const l = s.left && typeof s.left === 'object' ? s.left : {};
  _left = { count: Number(l.count) || 0, bytes: Number(l.bytes) || 0, unknown: Number(l.unknown) || 0 };
  const bt = s.batch && typeof s.batch === 'object' ? s.batch : {};
  _batch = { done: Number(bt.done) || 0, total: Number(bt.total) || 0, failed: Number(bt.failed) || 0 };
  for (const url of _saved.keys()) _failed.delete(url);
  // The web store names what each one on its way was asked as (the native state does not): titles after a reload.
  if (Array.isArray(s.queue)) {
    for (const q of s.queue) {
      if (q && typeof q.url === 'string' && !_asked.has(q.url)) _asked.set(q.url, { url: q.url, key: String(q.key || ''), title: String(q.title || '') });
    }
  }
  _notify();
}

/** @param {unknown} json */
function _onEvent(json) {
  let e;
  try { e = typeof json === 'string' ? JSON.parse(json) : json; } catch (_e) { return; }
  if (!e || typeof e !== 'object') return;
  // The first read of the native state comes BEFORE an event is applied: a lazy
  // read afterwards would replace what the event just set.
  if (!_loaded) refresh();
  const url = typeof e.url === 'string' ? e.url : null;
  switch (e.type) {
    case 'checked':   // the listings of what is on the phone were read again: items now say which are stale (n2-01)
      refresh();
      return;
    case 'waiting':   // dl-d2: the head of the queue holds (space, retrying, offline); the state says why
      if (e.reason === 'space' && _reason !== 'space') _say('Not enough room on this phone. Downloads wait until there is.');
      refresh();
      return;
    case 'done':
    case 'removed':
      if (url && _active && _active.url === url) _active = null;
      if (e.type === 'done' && !_active && !_queued.size) _say('Download finished');
      refresh();
      return;
    case 'queued': {
      // One event for the whole batch a Download all queued (n2-03), or one per url from an older shell.
      const urls = Array.isArray(e.urls) ? e.urls.filter((u) => typeof u === 'string') : url ? [url] : [];
      if (!urls.length) return;
      for (const u of urls) { _queued.add(u); _failed.delete(u); }
      _say(urls.length === 1 ? 'Download started' : 'Downloading ' + urls.length + ' recordings');
      break;
    }
    case 'progress':
      if (!url) return;
      _queued.delete(url);
      _active = { url, bytes: Number(e.bytes) || 0, total: Number(e.total) || -1 };
      break;
    case 'failed':
      if (!url) return;
      _queued.delete(url);
      if (_active && _active.url === url) _active = null;
      _failed.set(url, typeof e.reason === 'string' ? e.reason : 'network');
      _say(e.reason === 'space' ? 'Download failed: not enough room on this phone' : 'Download failed');
      break;
    case 'cancelled':
      if (!url) return;
      _queued.delete(url);
      if (_active && _active.url === url) _active = null;
      break;
    case 'sizes': {
      const sizes = e.sizes && typeof e.sizes === 'object' ? e.sizes : {};
      for (const k of Object.keys(sizes)) {
        const n = Number(sizes[k]);
        if (n > 0) _sizes.set(k, n);
      }
      // What went unanswered (no signal, a failed lookup) may be asked again by the next screen that shows it: only
      // what this answer was for (it names them), not what another call still has on its way (n2-02).
      const asked = Array.isArray(e.asked) ? e.asked : [..._sizesAsked];
      for (const u of asked) if (typeof u === 'string' && !_sizes.has(u)) _sizesAsked.delete(u);
      const missed = asked.filter((u) => typeof u === 'string' && !_sizes.has(u) && !_saved.has(u));
      if (!missed.length) _sizeRetry = 0;
      else if (_sizeRetry < SIZE_RETRY_MS.length && !_sizeRetryTimer) {
        _sizeRetryTimer = setTimeout(() => { _sizeRetryTimer = null; OfflineAudio.requestSizes(missed); }, SIZE_RETRY_MS[_sizeRetry++]);
      }
      break;
    }
    default:
      return;
  }
  // The queue's own words (left, batch, reason) change with these too; progress is too frequent to re-read for.
  if (e.type !== 'progress' && e.type !== 'sizes') _refreshSoon();
  _notify();
}

let _refreshQueued = false;
/** One re-read for a burst of events (a cancel of a whole edition sends one per recording). */
function _refreshSoon() {
  if (_refreshQueued) return;
  _refreshQueued = true;
  queueMicrotask(() => { _refreshQueued = false; refresh(); });
}

function _install() {
  if (typeof window !== 'undefined') /** @type {any} */ (window).__votOfflineAudio = _onEvent;
}
_install();

/** @param {() => void} cb @returns {() => void} */
function subscribe(cb) {
  _listeners.add(cb);
  if (!_loaded) refresh();
  return () => { _listeners.delete(cb); };
}

/** @param {string} url @returns {OfflineStatus} */
function statusOf(url) {
  if (!_loaded) refresh();
  if (_saved.has(url)) return 'saved';
  if (_active && _active.url === url) return 'downloading';
  if (_queued.has(url)) return 'queued';
  if (_failed.has(url)) return 'failed';
  return 'none';
}

/**
 * Songs of the Letters kept on this phone (K1) live in the same native store, under their song-site URLs, so
 * ExoPlayer reads them from disk too. The recordings' own shelf (items, totalBytes, Remove all) never counts them;
 * song-keep.js reads them through songItems().
 * @returns {boolean} a song is saved, queued or downloading
 */
function _holdsSongs() {
  if ([..._saved.keys()].some(isSongUrl) || [..._queued].some(isSongUrl)) return true;
  return !!(_active && isSongUrl(_active.url));
}

/** Send what the rows asked for this turn: every row of a screen mounts in one commit, so one call (n2-02). */
function _flushSizes() {
  _sizesFlushQueued = false;
  const all = [..._sizesToSend];
  _sizesToSend = new Set();
  const b = _bridge();
  for (let i = 0; i < all.length; i += SIZE_BATCH) {
    const want = all.slice(i, i + SIZE_BATCH);
    try {
      if (!b || typeof b.offlineAudioSizes !== 'function') throw new Error('no bridge');
      b.offlineAudioSizes(JSON.stringify(want));
    } catch (_e) { for (const u of want) _sizesAsked.delete(u); }
  }
}

/** @param {string[]} urls @param {string} method */
function _send(urls, method) {
  const b = _bridge();
  if (!b || typeof b[method] !== 'function') return false;
  // ['*'] (everything) goes as it is; a list goes SAVE_BATCH at a time.
  for (let i = 0; i < urls.length; i += SAVE_BATCH) {
    try { b[method](JSON.stringify(urls.slice(i, i + SAVE_BATCH))); } catch (_e) { return false; }
  }
  return true;
}

/**
 * Hand `items` to the store SAVE_BATCH at a time. @returns {number} how many were handed over before a call threw
 * @param {any} b @param {any[]} items
 */
function _save(b, items) {
  let sent = 0;
  for (let i = 0; i < items.length; i += SAVE_BATCH) {
    const chunk = items.slice(i, i + SAVE_BATCH);
    try { b.offlineAudioSave(JSON.stringify(chunk)); } catch (_e) { break; }
    sent += chunk.length;
  }
  return sent;
}

/** A no-argument store call (pause, resume); the state is read again after it. @param {string} method */
function _call(method) {
  const b = _bridge();
  if (!b || typeof b[method] !== 'function') return false;
  try { b[method](); } catch (_e) { return false; }
  refresh();
  return true;
}

export const OfflineAudio = {
  subscribe,
  getVersion: () => _version,
  /** The latest news for a screen reader: { seq, text } (seq 0 = none yet). */
  news: () => _news,
  /** @returns {boolean} true where recordings can be kept: the phone app, or a browser with the web store (cf1) */
  available: () => !!_bridge(),
  /** @returns {boolean} true in the phone app (native keeps the files; song-keep.js keeps songs there too) */
  native: () => !!_nativeBridge(),
  /**
   * What the web player loads for a recording: its saved copy in this browser with no signal, else `url` (cf1).
   * `held` (the element's current, unfailed src) is kept when it is this recording's saved copy already.
   * @param {string} url @param {string} [held] @returns {string}
   */
  webSrc: (url, held) => (_nativeBridge() ? url : WebOfflineAudio.srcFor(url, held)),
  /**
   * Is `src` this recording in its other web form (its GitHub URL or its saved copy)? A resume that swaps one for
   * the other carries on from where it was (cf1).
   * @param {string} url @param {string} src @returns {boolean}
   */
  webSameRecording: (url, src) => !_nativeBridge() && !!src && (src === url || WebOfflineAudio.isCopyOf(url, src)),
  refresh,
  /** @param {string} url */
  isSaved: (url) => statusOf(url) === 'saved',
  statusOf,
  /** @param {string} url @returns {{ bytes: number, total: number } | null} */
  progressOf: (url) => (_active && _active.url === url ? { bytes: _active.bytes, total: _active.total } : null),
  /** @param {string} url @returns {string | null} network | space | short | size | disk */
  failureOf: (url) => _failed.get(url) || null,
  /**
   * Bytes of `url`: a download's own size, else one looked up (requestSizes), else the build's (AUDIO_LENGTHS,
   * downloads brief 3d), else null.
   * @param {string} url @returns {number | null}
   */
  sizeOf: (url) => {
    const saved = _saved.get(url);
    if (saved && saved.bytes > 0) return saved.bytes;
    return _sizes.get(url) || bytesOf(url) || null;
  },
  /**
   * Ask the phone for the sizes of `urls` not yet known (answered by a 'sizes' event).
   * @param {string[]} urls
   */
  requestSizes(urls) {
    const b = _bridge();
    if (!b || typeof b.offlineAudioSizes !== 'function') return;
    // The build's sizes first (a lazy file): asked before it lands, this waits for it, repaints the screens with what
    // it knows, and asks the phone only for what the build did not see (a recording uploaded after it).
    if (!lengthsSettled()) {
      lengthsReady().then(() => { _notify(); OfflineAudio.requestSizes(urls); });
      return;
    }
    const want = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && !_saved.has(u) && !_sizes.has(u) && !_sizesAsked.has(u) && !bytesOf(u));
    if (!want.length) return;
    for (const u of want) { _sizesAsked.add(u); _sizesToSend.add(u); }
    if (_sizesFlushQueued) return;
    _sizesFlushQueued = true;
    queueMicrotask(_flushSizes);
  },
  /** The recordings on the phone (songs kept on it are songItems'). @returns {SavedItem[]} newest first */
  items: () => { if (!_loaded) refresh(); return [..._saved.values()].filter((it) => !isSongUrl(it.url)).sort((a, b) => b.savedAt - a.savedAt); },
  /** The songs of the letters kept on the phone (K1). @returns {SavedItem[]} newest first */
  songItems: () => { if (!_loaded) refresh(); return [..._saved.values()].filter((it) => isSongUrl(it.url)).sort((a, b) => b.savedAt - a.savedAt); },
  /**
   * The songs on their way to the phone (queued or downloading, not on it yet; statusOf's order), so song-keep.js can
   * stop them (sweep v037). @returns {string[]} their URLs
   */
  songsOnTheirWay: () => {
    if (!_loaded) refresh();
    const urls = [..._queued].concat(_active ? [_active.url] : []).filter((u) => isSongUrl(u) && !_saved.has(u));
    return [...new Set(urls)];
  },
  /** Bytes of the recordings on the phone (songs left out). */
  totalBytes: () => {
    if (!_loaded) refresh();
    let songs = 0;
    for (const it of _saved.values()) if (isSongUrl(it.url)) songs += it.bytes;
    return Math.max(0, _totalBytes - songs);
  },
  freeBytes: () => { if (!_loaded) refresh(); return _freeBytes; },
  /** @returns {boolean} this browser may clear the downloads when space runs low (it refused persistent storage) */
  evictable: () => { if (!_loaded) refresh(); return _evictable; },
  /** @returns {boolean} downloads wait for Wi-Fi now (Download only on Wi-Fi is on and the phone is on mobile data) */
  waiting: () => { if (!_loaded) refresh(); return _waiting; },
  /**
   * Download each of `list` to the phone (queued one at a time, natively or in the web store). `bytes`, when known
   * (the manifest's size), lets the phone total the queue before a byte arrives.
   * @param {Array<{ url: string, key: string, title: string, bytes?: number }>} list
   * @returns {boolean} false where downloads are not possible
   */
  download(list) {
    if (!_loaded) refresh();
    const b = _bridge();
    const items = (Array.isArray(list) ? list : []).filter((t) => t && typeof t.url === 'string' && !_saved.has(t.url))
      .map((t) => {
        /** @type {{ url: string, key: string, title: string, bytes?: number }} */
        const it = { url: t.url, key: String(t.key || ''), title: String(t.title || '') };
        // The build's size when the caller gave none (brief section 7 item 17): the phone totals the queue with no lookups.
        const bytes = typeof t.bytes === 'number' && t.bytes > 0 ? t.bytes : bytesOf(t.url);
        if (bytes && bytes > 0) it.bytes = bytes;
        return it;
      });
    if (!b || typeof b.offlineAudioSave !== 'function') return false;
    if (!items.length) return true;
    const sent = _save(b, items);
    if (!sent) return false;
    if (sent < items.length) items.length = sent;
    for (const t of items) { _queued.add(t.url); _failed.delete(t.url); _asked.set(t.url, { url: t.url, key: t.key, title: t.title }); }
    _warmTimings(items);
    _notify();
    return true;
  },
  /**
   * The recordings on their way (queued or downloading; songs being kept left out) and the ones that failed this
   * session and can be asked again (n2-05).
   * @returns {{ busy: number, failed: Array<{ url: string, key: string, title: string }> }}
   */
  pending: () => {
    if (!_loaded) refresh();
    const busy = [..._queued].filter((u) => !isSongUrl(u)).length + (_active && !isSongUrl(_active.url) && !_queued.has(_active.url) ? 1 : 0);
    const failed = [];
    for (const u of _failed.keys()) { const t = _asked.get(u); if (t && !isSongUrl(u) && !_saved.has(u)) failed.push(t); }
    return { busy, failed };
  },
  /** @param {string[]} urls */
  remove: (urls) => { _send(urls, 'offlineAudioRemove'); },
  /**
   * Ask the phone whether any recording on it was uploaded again since it was downloaded (the shelf opening; n2-01).
   * The answer re-reads the state, whose items carry `stale`.
   */
  checkForUpdates: () => {
    const b = _bridge();
    if (b && typeof b.offlineAudioCheck === 'function') { try { b.offlineAudioCheck(); } catch (_e) { /* quiet */ } }
  },
  /**
   * Download the current bytes of recordings already on the phone (stale ones); each keeps playing from the old
   * file until the new one is whole.
   * @param {Array<{ url: string, key: string, title: string }>} list
   * @returns {boolean}
   */
  update(list) {
    const b = _bridge();
    const items = (Array.isArray(list) ? list : []).filter((t) => t && typeof t.url === 'string' && _saved.has(t.url))
      .map((t) => ({ url: t.url, key: String(t.key || ''), title: String(t.title || ''), update: true }));
    if (!b || typeof b.offlineAudioSave !== 'function' || !items.length) return false;
    return _save(b, items) > 0;
  },
  /** An update of a recording on the phone is on its way. @param {string} url */
  isUpdating: (url) => _saved.has(url) && (_queued.has(url) || !!(_active && _active.url === url)),
  /** Every RECORDING off the phone (kept songs stay: they are the Songs screens' to remove). */
  removeAll: () => {
    if (!_holdsSongs()) { _send(['*'], 'offlineAudioRemove'); return; }
    const busy = [..._queued].concat(_active ? [_active.url] : []).filter((u) => !isSongUrl(u));
    if (busy.length) _send(busy, 'offlineAudioCancel');
    const urls = [..._saved.keys()].filter((u) => !isSongUrl(u));
    if (urls.length) _send(urls, 'offlineAudioRemove');
  },
  /** @param {string[]} urls */
  cancel: (urls) => { _send(urls, 'offlineAudioCancel'); },
  /** Stop every recording on its way (songs being kept go on). */
  cancelAll: () => {
    if (!_holdsSongs()) { _send(['*'], 'offlineAudioCancel'); return; }
    const busy = [..._queued].concat(_active ? [_active.url] : []).filter((u) => !isSongUrl(u));
    if (busy.length) _send(busy, 'offlineAudioCancel');
  },
  /** @returns {boolean} the phone's downloads are paused (Pause all; it holds across a restart) */
  paused: () => { if (!_loaded) refresh(); return _paused; },
  /** @returns {string | null} why the queue is not moving: paused | wifi | offline | space | retrying; null when it is */
  reason: () => { if (!_loaded) refresh(); return _reason; },
  /** @returns {{ count: number, bytes: number, unknown: number }} recordings still to download, their known bytes, how many have no size yet */
  left: () => { if (!_loaded) refresh(); return _left; },
  /** @returns {{ done: number, total: number, failed: number }} this batch (since the queue was last empty): "3 of 31" */
  batch: () => { if (!_loaded) refresh(); return _batch; },
  /**
   * The recordings on their way in order, the one downloading first ("Waiting · 2nd in line"); songs being kept left
   * out. key and title are what this session asked them as, '' for ones queued before a restart.
   * @returns {Array<{ url: string, key: string, title: string }>}
   */
  queue: () => {
    if (!_loaded) refresh();
    const urls = (_active ? [_active.url] : []).concat([..._queued].filter((u) => !_active || u !== _active.url));
    return urls.filter((u) => !isSongUrl(u)).map((u) => _asked.get(u) || { url: u, key: '', title: '' });
  },
  /** Pause all downloads (the one on its way keeps its bytes). @returns {boolean} false where the store cannot */
  pause: () => _call('offlineAudioPause'),
  /** Resume all downloads, from their bytes. @returns {boolean} false where the store cannot */
  resume: () => _call('offlineAudioResume'),
  /** Tests only: forget everything and re-install the receiver. */
  _reset() {
    _listeners.clear();
    _saved = new Map(); _queued = new Set(); _failed = new Map(); _sizes = new Map(); _sizesAsked = new Set(); _asked = new Map();
    _sizesToSend = new Set(); _sizesFlushQueued = false;
    if (_sizeRetryTimer) clearTimeout(_sizeRetryTimer);
    _sizeRetryTimer = null; _sizeRetry = 0; _news = { seq: 0, text: '' };
    _active = null; _totalBytes = 0; _freeBytes = -1; _evictable = false; _waiting = false; _loaded = false; _version = 0;
    _paused = false; _reason = null; _left = { count: 0, bytes: 0, unknown: 0 }; _batch = { done: 0, total: 0, failed: 0 };
    _install();
  },
};
