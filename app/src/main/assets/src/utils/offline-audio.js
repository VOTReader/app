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
   JsEvent.OfflineAudio). On the web there is no bridge: nothing is
   available and every call is a no-op, which is right — the release assets
   answer without CORS, so a page cannot keep their bytes.

   Bridge: window.AndroidBridge.offlineAudioState / offlineAudioSave /
   offlineAudioRemove / offlineAudioCancel, called directly (the
   setAudioActive pattern; BridgeContractTest pins the four).
   ═══════════════════════════════════════════════════════════════════════ */

import { isSongUrl } from './audio-track.js';

/** @typedef {{ url: string, key: string, title: string, bytes: number, savedAt: number }} SavedItem */
/** @typedef {'saved' | 'downloading' | 'queued' | 'failed' | 'none'} OfflineStatus */

/** @type {Set<() => void>} */
const _listeners = new Set();
let _version = 0;
/** @type {Map<string, SavedItem>} */
let _saved = new Map();
let _totalBytes = 0;
let _freeBytes = -1;
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
let _loaded = false;

/** @returns {any} */
function _bridge() {
  const b = typeof window !== 'undefined' ? /** @type {any} */ (window).AndroidBridge : null;
  return b && typeof b.offlineAudioState === 'function' ? b : null;
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
      _saved.set(it.url, { url: it.url, key: String(it.key || ''), title: String(it.title || ''), bytes: Number(it.bytes) || 0, savedAt: Number(it.savedAt) || 0 });
    }
  }
  _totalBytes = Number(s.totalBytes) || 0;
  _freeBytes = typeof s.freeBytes === 'number' ? s.freeBytes : -1;
  _queued = new Set((Array.isArray(s.queued) ? s.queued : []).filter((u) => typeof u === 'string'));
  const a = s.active;
  _active = a && typeof a.url === 'string' ? { url: a.url, bytes: Number(a.bytes) || 0, total: Number(a.total) || -1 } : null;
  for (const url of _saved.keys()) _failed.delete(url);
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
    case 'done':
    case 'removed':
      if (url && _active && _active.url === url) _active = null;
      refresh();
      return;
    case 'queued':
      if (!url) return;
      _queued.add(url);
      _failed.delete(url);
      break;
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
      // What went unanswered (no signal, a failed lookup) may be asked again by the next screen that shows it.
      for (const u of [..._sizesAsked]) if (!_sizes.has(u)) _sizesAsked.delete(u);
      break;
    }
    default:
      return;
  }
  _notify();
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

/** @param {string[]} urls @param {string} method */
function _send(urls, method) {
  const b = _bridge();
  if (!b || typeof b[method] !== 'function') return false;
  try { b[method](JSON.stringify(urls)); return true; } catch (_e) { return false; }
}

export const OfflineAudio = {
  subscribe,
  getVersion: () => _version,
  /** @returns {boolean} true in the phone app (a bridge that can keep downloads) */
  available: () => !!_bridge(),
  refresh,
  /** @param {string} url */
  isSaved: (url) => statusOf(url) === 'saved',
  statusOf,
  /** @param {string} url @returns {{ bytes: number, total: number } | null} */
  progressOf: (url) => (_active && _active.url === url ? { bytes: _active.bytes, total: _active.total } : null),
  /** @param {string} url @returns {string | null} network | space | short | size | disk */
  failureOf: (url) => _failed.get(url) || null,
  /**
   * Bytes of `url`: a download's own size, else one looked up (requestSizes), else null.
   * @param {string} url @returns {number | null}
   */
  sizeOf: (url) => {
    const saved = _saved.get(url);
    if (saved && saved.bytes > 0) return saved.bytes;
    return _sizes.get(url) || null;
  },
  /**
   * Ask the phone for the sizes of `urls` not yet known (answered by a 'sizes' event).
   * @param {string[]} urls
   */
  requestSizes(urls) {
    const b = _bridge();
    if (!b || typeof b.offlineAudioSizes !== 'function') return;
    const want = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && !_saved.has(u) && !_sizes.has(u) && !_sizesAsked.has(u));
    if (!want.length) return;
    for (const u of want) _sizesAsked.add(u);
    try { b.offlineAudioSizes(JSON.stringify(want)); } catch (_e) { for (const u of want) _sizesAsked.delete(u); }
  },
  /** The recordings on the phone (songs kept on it are songItems'). @returns {SavedItem[]} newest first */
  items: () => { if (!_loaded) refresh(); return [..._saved.values()].filter((it) => !isSongUrl(it.url)).sort((a, b) => b.savedAt - a.savedAt); },
  /** The songs of the letters kept on the phone (K1). @returns {SavedItem[]} newest first */
  songItems: () => { if (!_loaded) refresh(); return [..._saved.values()].filter((it) => isSongUrl(it.url)).sort((a, b) => b.savedAt - a.savedAt); },
  /** Bytes of the recordings on the phone (songs left out). */
  totalBytes: () => {
    if (!_loaded) refresh();
    let songs = 0;
    for (const it of _saved.values()) if (isSongUrl(it.url)) songs += it.bytes;
    return Math.max(0, _totalBytes - songs);
  },
  freeBytes: () => { if (!_loaded) refresh(); return _freeBytes; },
  /**
   * Download each of `list` to the phone (queued one at a time natively).
   * @param {Array<{ url: string, key: string, title: string }>} list
   * @returns {boolean} false where downloads are not possible (the web)
   */
  download(list) {
    if (!_loaded) refresh();
    const b = _bridge();
    const items = (Array.isArray(list) ? list : []).filter((t) => t && typeof t.url === 'string' && !_saved.has(t.url))
      .map((t) => ({ url: t.url, key: String(t.key || ''), title: String(t.title || '') }));
    if (!b || typeof b.offlineAudioSave !== 'function') return false;
    if (!items.length) return true;
    try { b.offlineAudioSave(JSON.stringify(items)); } catch (_e) { return false; }
    for (const t of items) { _queued.add(t.url); _failed.delete(t.url); }
    _notify();
    return true;
  },
  /** @param {string[]} urls */
  remove: (urls) => { _send(urls, 'offlineAudioRemove'); },
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
  /** Tests only: forget everything and re-install the receiver. */
  _reset() {
    _listeners.clear();
    _saved = new Map(); _queued = new Set(); _failed = new Map(); _sizes = new Map(); _sizesAsked = new Set();
    _active = null; _totalBytes = 0; _freeBytes = -1; _loaded = false; _version = 0;
    _install();
  },
};
