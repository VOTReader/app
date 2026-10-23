// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   offline-audio-web — recordings saved for offline in a browser (cf1)
   ═══════════════════════════════════════════════════════════════════════
   Corbin 2026-09-26 21:1x: the PWA and an iPhone on its Home Screen save a
   letter, study or Bible book for offline, as the phone app does (a whole
   edition and all of TVOT too, Corbin 2026-10-23; the picker that offers
   them is the downloads brief's D3).

   GitHub's release downloads answer without CORS, so the page cannot keep
   their bytes itself. A save goes through the relay Worker
   (relay/, audio.votreader.workers.dev: votreader-assets audio only, CORS
   for this origin, nothing logged) into Cache Storage, OFFLINE_AUDIO_CACHE,
   keyed by the recording's own GitHub URL; its key, title and time ride as
   headers on the stored response. With no signal a saved recording plays
   from <scope>/offline-audio/<tag>/<file>.mp3, which the service worker
   answers from that cache in byte ranges (Safari needs 206s). With a signal
   every recording, saved or not, streams straight from GitHub as before, so
   a browser whose media loads skip the service worker loses nothing it had
   (Playwright's WebKit on Windows does skip it: its media stack fetches on
   its own; Apple's Safari routes media through the worker).

   This is shaped like the phone app's bridge (offlineAudioState / Save /
   Remove / Cancel / Sizes, events through window.__votOfflineAudio), so
   offline-audio.js and every screen run unchanged over either store.

   Not on an iPhone or iPad in a Safari TAB: Safari clears a site's storage
   after about a week unused, so a save there would silently vanish; added
   to the Home Screen it is kept (song-keep.js follows the same rule).

   Download only on Wi-Fi (ra6, download-gate.js): on mobile data the queue
   waits, and one on its way stops, goes back to the head of the queue and
   starts again from the top once the phone is on Wi-Fi.

   The queue (dl-d2's contract, D:/Swarm/lanes/datasafe/out/dl-d2/BRIDGE.md, as a browser keeps it): Pause all /
   Resume all (the one on its way starts again from the top: Cache Storage keeps no part of a file); no signal, no
   room or a failed fetch make the head WAIT (offline until a signal, space until a Remove or 30 s, retrying at 5, 20
   and 60 s) before a network failure is final. The queue is saved beside the index (QUEUE_KEY): a browser runs
   nothing with the page closed, so a queue found at the next open waits as 'closed' ("Downloads stopped when
   VOTReader closed · Resume", downloads brief 3f) until Resume or a new download. A screen wake lock is held while
   a download runs with the page in view.
   ═══════════════════════════════════════════════════════════════════════ */

import { downloadsWait, networkType, onGateChange } from './download-gate.js';

export const RELAY = 'https://audio.votreader.workers.dev/';
export const OFFLINE_AUDIO_CACHE = 'vot-offline-audio-v1';
const RELEASE = /^https:\/\/github\.com\/VOTReader\/votreader-assets\/releases\/download\/(audio-[a-z0-9-]{1,40})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,159}\.mp3)$/;
/** Size lookups in flight at once (a Bible book asks for up to 150). */
const SIZE_LOOKUPS = 4;
const PROGRESS_MS = 250;
/** What is saved, kept beside the cache and read synchronously at boot (section 7 item 18). Not in backups. */
const INDEX_KEY = 'vot.offlineAudioIndex';
/** The queue, paused and the batch's counts, so a reload or a closed tab finds them again (brief section 7 item 11). */
const QUEUE_KEY = 'vot.offlineAudioQueue';
/** Waits before a failed fetch is tried again (the phone app's RETRY_DELAYS); then it is a failure. */
const RETRY_MS = [5000, 20000, 60000];
const SPACE_RECHECK_MS = 30000;
const OFFLINE_RECHECK_MS = 30000;
let _timing = { retry: RETRY_MS, space: SPACE_RECHECK_MS, offline: OFFLINE_RECHECK_MS };

/** @typedef {{ url: string, key: string, title: string, bytes: number, savedAt: number }} SavedItem */
/** @typedef {{ url: string, key: string, title: string, bytes: number, tries?: number, wifi?: boolean }} QueueItem bytes 0 = not known;
 *  wifi: an automatic download (dl-d5), started only on Wi-Fi */

/** @type {Map<string, SavedItem>} */
let _items = new Map();
/** @type {QueueItem[]} */
let _queue = [];
/** held: stopped for mobile data or Pause, so it goes back to the head of the queue. @type {{ it: QueueItem, url: string, bytes: number, total: number, ctl: AbortController, held: boolean } | null} */
let _active = null;
let _paused = false;
/** Paused because the queue was found at open (the page closed with it), not by Pause all. */
let _closed = false;
/** Why the head of the queue waits: offline | space | retrying, or null. @type {string | null} */
let _hold = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let _holdTimer = null;
/** @type {(() => void) | null} */
let _onlineHook = null;
/** Recordings asked since the queue was last empty: "Downloading 3 of 31" = done + 1 of total. */
let _batch = { done: 0, total: 0, failed: 0 };
/** @type {any} the screen wake lock while a download runs in view */
let _lock = null;
let _lockAsking = false;
let _visHooked = false;
/** Bumped by a reload (tests' _reset): a job of the page before it changes nothing. */
let _gen = 0;
/** @type {(() => void) | null} */
let _unhookGate = null;
let _free = -1;
let _loaded = false;
/** The index has been read into _items (the cache may not have been yet). */
let _seeded = false;
/** @type {Promise<void> | null} */
let _loading = null;
let _persistAsked = false;
/** Storage the browser keeps (true), may clear under pressure (false), or not known yet (null). */
let _persisted = /** @type {boolean | null} */ (null);

/** @param {string} url @returns {RegExpExecArray | null} */
const _release = (url) => (typeof url === 'string' ? RELEASE.exec(url) : null);

/** The relay URL for a release recording, or null for anything else. @param {string} url */
export function relayUrl(url) {
  const m = _release(url);
  return m ? RELAY + m[1] + '/' + m[2] : null;
}

/** The service worker's address for a saved recording, or null (not saved, or no worker controls the page). @param {string} url */
function _localFor(url) {
  if (!_items.has(url)) return null;
  const m = _release(url);
  const sw = typeof navigator !== 'undefined' && navigator.serviceWorker ? navigator.serviceWorker.controller : null;
  if (!m || !sw) return null;
  try { return new URL('offline-audio/' + m[1] + '/' + m[2], sw.scriptURL).href; } catch (_e) { return null; }
}

/** @param {any} e */
function _emit(e) {
  const f = typeof window !== 'undefined' ? /** @type {any} */ (window).__votOfflineAudio : null;
  if (typeof f === 'function') { try { f(e); } catch (_e) { /* a listener's throw is its own */ } }
}

/** @returns {boolean} this display is an installed app (Home Screen / standalone) */
function _standalone() {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) return true;
  } catch (_e) { /* no matchMedia */ }
  return /** @type {any} */ (navigator).standalone === true;
}

/** @returns {boolean} a browser that can keep recordings: Cache Storage, a service worker, not the phone app */
export function supported() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const w = /** @type {any} */ (window);
  if (w.AndroidBridge) return false;
  if (!w.isSecureContext || typeof w.caches === 'undefined' || !('serviceWorker' in navigator)) return false;
  // navigator.standalone exists only on iOS Safari; in a tab there, storage is cleared after about a week unused.
  if (typeof (/** @type {any} */ (navigator)).standalone === 'boolean' && !_standalone()) return false;
  return true;
}

async function _estimate() {
  try {
    const est = await navigator.storage.estimate();
    if (est && typeof est.quota === 'number' && typeof est.usage === 'number') _free = Math.max(0, est.quota - est.usage);
  } catch (_e) { _free = -1; }
  // Whether this browser has promised to keep the downloads (persisted() asks nothing of the listener; the first
  // download asks with persist()). False: it may clear them when space runs low, and the Downloads screen says so.
  try { if (navigator.storage.persisted) _persisted = (await navigator.storage.persisted()) === true; } catch (_e) { /* unknown */ }
}

/** @param {string | null} v */
const _dec = (v) => { try { return v ? decodeURIComponent(v) : ''; } catch (_e) { return ''; } };

/** Write what is saved to the index (after every change, and once the cache has been read). */
function _writeIndex() {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify([..._items.values()])); } catch (_e) { /* storage off or full */ }
}

/**
 * What the index says is saved, synchronously: reading the cache takes a moment at a cold start (one match per
 * recording), and until it had, nothing looked saved and a saved row's Play offline said it needed a connection
 * (downloads brief 2026-10-23, section 7 item 18). The cache stays the truth: _load replaces this with what it holds.
 */
function _seed() {
  if (_seeded || _loaded) return;
  _seeded = true;
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    for (const it of list) {
      if (it && typeof it.url === 'string' && _release(it.url) && !_items.has(it.url)) {
        _items.set(it.url, { url: it.url, key: String(it.key || ''), title: String(it.title || ''), bytes: Number(it.bytes) || 0, savedAt: Number(it.savedAt) || 0 });
      }
    }
  } catch (_e) { /* no index, or a broken one: the cache read fills in */ }
}

/** Read what the cache holds (once), then tell the page its state is ready. */
function _load() {
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const cache = await caches.open(OFFLINE_AUDIO_CACHE);
      /** @type {Map<string, SavedItem>} */
      const items = new Map();
      // All at once, and the storage estimate beside them: one after another this was a moment per recording.
      const [entries] = await Promise.all([
        cache.keys().then((reqs) => Promise.all(reqs.map((req) => cache.match(req).then((res) => /** @type {[string, Response | undefined]} */ ([req.url, res]))))),
        _estimate(),
      ]);
      for (const [url, res] of entries) {
        if (!res) continue;
        const h = res.headers;
        items.set(url, {
          url,
          key: _dec(h.get('X-Vot-Key')),
          title: _dec(h.get('X-Vot-Title')),
          bytes: Number(h.get('X-Vot-Bytes')) || 0,
          savedAt: Number(h.get('X-Vot-Saved-At')) || 0,
        });
      }
      _items = items;
      _writeIndex();
    } catch (_e) { /* no cache here (a private window): nothing is saved */ _items = new Map(); }
    _restoreQueue();
    _loaded = true;
    // 'checked', not 'done': the mirror re-reads either way, but a 'done' with nothing downloading told a screen
    // reader "Download finished" at every boot whose first screen had a download control.
    _emit({ type: 'checked' });
  })();
  return _loading;
}

function _state() {
  let total = 0;
  for (const it of _items.values()) total += it.bytes;
  return {
    items: [..._items.values()],
    totalBytes: total,
    freeBytes: _free,
    persisted: _persisted,
    queued: _queue.map((t) => t.url),
    active: _active ? { url: _active.url, bytes: _active.bytes, total: _active.total } : null,
    // Download only on Wi-Fi: what is queued waits for it (the rows say so).
    waiting: !!_queue.length && downloadsWait(),
    paused: _paused,
    reason: _reasonNow(),
    left: _left(),
    batch: { ..._batch },
    // Web only: what each one on its way was asked as, so the In line rows have titles after a reload.
    queue: (_active ? [_active.it] : []).concat(_queue).map((t) => ({ url: t.url, key: t.key, title: t.title })),
  };
}

/** Why the queue is not moving (paused, closed, wifi, offline, space, retrying), or null when it is, or is empty. */
function _reasonNow() {
  if (!_queue.length && !_active) return null;
  if (_paused) return _closed ? 'closed' : 'paused';
  if (downloadsWait()) return 'wifi';
  // dl-d5: nothing on its way and only automatic downloads left, on mobile data.
  if (!_active && _queue.every((t) => t.wifi) && !_unmetered()) return 'wifi';
  return _hold;
}

/** What is still to download: how many, their known bytes, how many have no size. */
function _left() {
  let bytes = 0;
  let unknown = 0;
  const a = _active;
  if (a) {
    if (a.total > 0) bytes += Math.max(0, a.total - a.bytes);
    else if (a.it.bytes > 0) bytes += a.it.bytes;
    else unknown++;
  }
  for (const t of _queue) { if (t.bytes > 0) bytes += t.bytes; else unknown++; }
  return { count: _queue.length + (a ? 1 : 0), bytes, unknown };
}

/** Save the queue (the one on its way first), paused and the batch; nothing when there is nothing to come back to. */
function _persistQueue() {
  try {
    const q = (_active ? [_active.it] : []).concat(_queue);
    if (!q.length) { localStorage.removeItem(QUEUE_KEY); return; }
    localStorage.setItem(QUEUE_KEY, JSON.stringify({
      items: q.map((t) => ({ url: t.url, key: t.key, title: t.title, bytes: t.bytes, ...(t.wifi ? { wifi: true } : {}) })),
      paused: _paused && !_closed,
      batch: _batch,
    }));
  } catch (_e) { /* storage off or full: the queue lives as long as the page */ }
}

/**
 * The queue a closed page left: what is not saved yet goes back in line, waiting as 'closed' (or 'paused', when Pause
 * all held it), so nothing starts using data before the listener says so. Once, with the cache read.
 */
function _restoreQueue() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null'); } catch (_e) { saved = null; }
  if (!saved || !Array.isArray(saved.items)) return;
  const have = new Set(_queue.map((t) => t.url));
  /** @type {QueueItem[]} */
  const back = [];
  for (const t of saved.items) {
    if (!t || typeof t.url !== 'string' || !relayUrl(t.url) || _items.has(t.url) || have.has(t.url)) continue;
    have.add(t.url);
    back.push({ url: t.url, key: String(t.key || ''), title: String(t.title || ''), bytes: Number(t.bytes) > 0 ? Number(t.bytes) : 0,
      ...(t.wifi === true ? { wifi: true } : {}) });
  }
  if (!back.length) { _persistQueue(); return; }
  _queue = back.concat(_queue);
  _paused = true;
  _closed = saved.paused !== true;
  const b = saved.batch && typeof saved.batch === 'object' ? saved.batch : {};
  const done = Math.max(0, Number(b.done) || 0);
  const failed = Math.max(0, Number(b.failed) || 0);
  _batch = { done, failed, total: Math.max(Number(b.total) || 0, done + failed + back.length) };
  _hookGate();
}

/** The head waits for `reason` (offline, space, retrying) until `ms` pass, a signal comes back or something frees it. */
function _holdFor(/** @type {string} */ reason, /** @type {number} */ ms, /** @type {string} */ url) {
  _hold = reason;
  if (_holdTimer) clearTimeout(_holdTimer);
  _holdTimer = setTimeout(_releaseHold, ms);
  if (reason === 'offline' && !_onlineHook && typeof window !== 'undefined') {
    _onlineHook = _releaseHold;
    window.addEventListener('online', _onlineHook);
  }
  _emit({ type: 'waiting', url, reason });
}

/** Whatever the head waited for, it tries again now. */
function _releaseHold() {
  if (_holdTimer) clearTimeout(_holdTimer);
  _holdTimer = null;
  if (_onlineHook && typeof window !== 'undefined') window.removeEventListener('online', _onlineHook);
  _onlineHook = null;
  if (!_hold) return;
  _hold = null;
  _next();
}

/** The queue emptied by a cancel (or Remove all): nothing waits, and the next download starts unpaused. */
function _settleEmpty() {
  _paused = false; _closed = false;
  _hold = null;
  if (_holdTimer) clearTimeout(_holdTimer);
  _holdTimer = null;
}

/** No signal, as far as the browser knows (a failed fetch with onLine true is a retry, not a wait). */
const _offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;
/** dl-d5: the browser says Wi-Fi (or a wire); one that cannot tell is not. */
const _unmetered = () => { const t = networkType(); return t === 'wifi' || t === 'ethernet'; };

/** Keep the screen on while a download runs in view (brief 3f); let it go when none does. */
function _wakeCheck() {
  const wl = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator).wakeLock : null;
  const want = !!_active && typeof document !== 'undefined' && document.visibilityState === 'visible';
  if (want && !_lock && !_lockAsking && wl && typeof wl.request === 'function') {
    _lockAsking = true;
    Promise.resolve().then(() => wl.request('screen')).then((/** @type {any} */ l) => {
      _lockAsking = false;
      if (!_active) { l.release().catch(() => {}); return; }
      _lock = l;
      l.addEventListener('release', () => { if (_lock === l) _lock = null; });
    }, () => { _lockAsking = false; /* refused (battery saver, no permission): downloads go on regardless */ });
  } else if (!want && _lock) {
    const l = _lock;
    _lock = null;
    l.release().catch(() => {});
  }
}

/** @param {string} json @returns {any[]} */
function _list(json) {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch (_e) { return []; }
}

/**
 * The gate opened or closed (the switch, or the phone moved between Wi-Fi and mobile data). Closed, the download on
 * its way stops and goes back to the head of the queue (_next's catch); open, the queue goes on. The rows re-read.
 */
function _onGate() {
  if (downloadsWait()) {
    if (_active && !_active.held) { _active.held = true; _active.ctl.abort(); }
  } else _next();
  _emit({ type: 'checked' });
}

function _hookGate() {
  if (!_unhookGate) _unhookGate = onGateChange(_onGate);
  // The wake lock goes when the page is hidden; back in view with a download running, ask again.
  if (!_visHooked && typeof document !== 'undefined') { _visHooked = true; document.addEventListener('visibilitychange', _wakeCheck); }
}

async function _next() {
  if (_active || !_queue.length) return;
  // Paused (Pause all, or found at open): the queue holds where it is; Resume goes on.
  if (_paused) { _emit({ type: 'checked' }); return; }
  // Download only on Wi-Fi: on mobile data the queue waits (the rows re-read, and say so); _onGate starts it on Wi-Fi.
  if (downloadsWait()) { _emit({ type: 'checked' }); return; }
  if (_hold) return;
  // dl-d5: an automatic download starts only on Wi-Fi; on mobile data the listener's own go first, and the rest wait
  // (a connection change runs _onGate, which comes back here).
  const at = _queue.findIndex((t) => !t.wifi || _unmetered());
  if (at < 0) { _emit({ type: 'checked' }); return; }
  // No signal: wait for one (the 'online' event, or a look every 30 s); that spends no retry.
  if (_offlineNow()) { _holdFor('offline', _timing.offline, _queue[at].url); return; }
  const it = /** @type {QueueItem} */ (_queue.splice(at, 1)[0]);
  const ctl = new AbortController();
  const job = { it, url: it.url, bytes: 0, total: -1, ctl, held: false };
  const gen = _gen;
  _active = job;
  _wakeCheck();
  _emit({ type: 'progress', url: it.url, bytes: 0, total: -1 });
  let reason = 'network';
  let stored = false;
  try {
    if (_items.has(it.url)) throw new Error('already saved');
    // Its size known (the page's baked bytes): no room is known before a byte is fetched.
    if (it.bytes > 0) {
      await _estimate();
      if (_free >= 0 && it.bytes > _free) { reason = 'space'; throw new Error('no room'); }
    }
    if (!_persistAsked) {
      _persistAsked = true;
      // The answer was ignored, so downloads the browser may clear carried no word of it (brief section 7 item 3).
      try { if (navigator.storage && navigator.storage.persist) _persisted = (await navigator.storage.persist()) === true; } catch (_e) { /* best effort */ }
    }
    const from = relayUrl(it.url);
    if (!from) throw new Error('not a release recording');
    // Paused, cancelled or reloaded while it looked for room: it never fetches.
    if (ctl.signal.aborted || gen !== _gen) throw new Error('stopped');
    const res = await fetch(from, { signal: ctl.signal, credentials: 'omit' });
    if (res.status !== 200 || !res.body) throw new Error('relay ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || 0;
    if (!(total > 0)) { reason = 'size'; throw new Error('no size'); }
    job.total = total;
    await _estimate();
    if (_free >= 0 && total > _free) {
      reason = 'space';
      try { res.body.cancel(); } catch (_e) { /* already closed */ }
      throw new Error('no room');
    }
    let last = 0;
    const count = new TransformStream({
      transform(chunk, out) {
        job.bytes += chunk.byteLength;
        const now = Date.now();
        if (now - last >= PROGRESS_MS) { last = now; _emit({ type: 'progress', url: it.url, bytes: job.bytes, total }); }
        out.enqueue(chunk);
      },
    });
    const savedAt = Date.now();
    const cache = await caches.open(OFFLINE_AUDIO_CACHE);
    await cache.put(it.url, new Response(res.body.pipeThrough(count), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-Vot-Key': encodeURIComponent(it.key),
        'X-Vot-Title': encodeURIComponent(it.title),
        'X-Vot-Bytes': String(total),
        'X-Vot-Saved-At': String(savedAt),
      },
    }));
    stored = true;
    // Cancelled (or swept by Remove all) while its last bytes were being stored: it does not stay (sweep W63).
    if (ctl.signal.aborted) throw new Error('cancelled');
    if (job.bytes !== total) { reason = 'short'; throw new Error('short'); }
    if (gen !== _gen) return;
    _items.set(it.url, { url: it.url, key: it.key, title: it.title, bytes: total, savedAt });
    _writeIndex();
    await _estimate();
    _active = null;
    _batch.done++;
    _persistQueue();
    _emit({ type: 'done', url: it.url });
  } catch (e) {
    if (gen !== _gen) return;
    _active = null;
    // A cut-off copy never stays behind to play half a letter. (A put that failed stored nothing: a copy saved
    // before it is untouched.)
    if (stored) { try { await (await caches.open(OFFLINE_AUDIO_CACHE)).delete(it.url); } catch (_e) { /* gone already */ } }
    if (e && /** @type {any} */ (e).name === 'QuotaExceededError') reason = 'space';
    if (_items.has(it.url)) { _batch.done++; _persistQueue(); _emit({ type: 'done', url: it.url }); }
    // Stopped for mobile data or Pause all: back at the head of the queue, from the top (its bytes are gone).
    else if (job.held) { _queue.unshift(it); _persistQueue(); _emit({ type: 'checked' }); }
    else if (ctl.signal.aborted) { _persistQueue(); _emit({ type: 'cancelled', url: it.url }); }
    // No room is a wait, never a failure (brief 3i): a Remove or a look every 30 s tries again.
    else if (reason === 'space') { _queue.unshift(it); _holdFor('space', _timing.space, it.url); }
    else if (reason === 'network' && _offlineNow()) { _queue.unshift(it); _holdFor('offline', _timing.offline, it.url); }
    else if (reason === 'network' && (it.tries || 0) < _timing.retry.length) {
      const wait = _timing.retry[it.tries || 0];
      it.tries = (it.tries || 0) + 1;
      _queue.unshift(it);
      _holdFor('retrying', wait, it.url);
    } else {
      _batch.failed++;
      _persistQueue();
      _emit({ type: 'failed', url: it.url, reason });
    }
  }
  _next();
  _wakeCheck();
}

/** The phone app's bridge, as a browser keeps it. */
export const WebOfflineAudio = {
  supported,
  /** @returns {string | null} the whole state as JSON (from the index until the cache has been read), null with neither */
  offlineAudioState() {
    if (!_loaded) {
      _seed();
      _load();
      if (!_items.size) return null;
    }
    return JSON.stringify(_state());
  },
  /** @param {string} json [{ url, key, title, bytes? }] */
  offlineAudioSave(json) {
    // Before the cache has been read nothing looks saved: a save then would fetch again what is already kept.
    if (!_loaded) { _load().then(() => WebOfflineAudio.offlineAudioSave(json)); return; }
    _hookGate();
    const busy = new Set(_queue.map((t) => t.url).concat(_active ? [_active.url] : []));
    // A new batch once the queue has been empty (the phone app's count).
    if (!busy.size) _batch = { done: 0, total: 0, failed: 0 };
    /** @type {string[]} */
    const queued = [];
    let own = false;
    for (const t of _list(json)) {
      if (t && typeof t.url === 'string' && t.wifi !== true) {
        own = true;
        // The listener's own Download of one queued automatically: it no longer waits for Wi-Fi (dl-d5).
        const had = _queue.find((q) => q.url === t.url && q.wifi);
        if (had) { delete had.wifi; _persistQueue(); _next(); }
      }
      if (!t || typeof t.url !== 'string' || _items.has(t.url) || busy.has(t.url)) continue;
      if (!relayUrl(t.url)) { _emit({ type: 'failed', url: t.url, reason: 'network' }); continue; }
      _queue.push({ url: t.url, key: String(t.key || ''), title: String(t.title || ''), bytes: Number(t.bytes) > 0 ? Number(t.bytes) : 0,
        ...(t.wifi === true ? { wifi: true } : {}) });
      busy.add(t.url);
      queued.push(t.url);
    }
    if (!queued.length) return;
    _batch.total += queued.length;
    // Asking for more is a yes to what stopped when the page closed; a Pause all the listener chose holds. An
    // automatic download (dl-d5) is not the listener asking.
    if (_closed && own) { _closed = false; _paused = false; }
    _persistQueue();
    // One event for the batch, as the phone app sends it (n2-03).
    _emit({ type: 'queued', urls: queued });
    _next();
  },
  /** Pause all: the one on its way stops and goes back to the head of the queue. Holds across a reload. */
  offlineAudioPause() {
    if (_paused && !_closed) return;
    _paused = true;
    _closed = false;
    if (_active && !_active.held) { _active.held = true; _active.ctl.abort(); }
    _persistQueue();
    _emit({ type: 'checked' });
  },
  /** Resume all (and the queue found at open): it goes on from the head. */
  offlineAudioResume() {
    if (!_paused) return;
    _paused = false;
    _closed = false;
    _persistQueue();
    _hookGate();
    if (_hold) _releaseHold();
    else _next();
    _emit({ type: 'checked' });
  },
  /** @param {string} json urls, or ['*'] for every one */
  offlineAudioRemove(json) {
    const urls = _list(json);
    // Every one: what is queued or on its way stops too, as the phone app's removeAll does, or it downloaded on and
    // came back (sweep W63).
    if (urls.includes('*')) WebOfflineAudio.offlineAudioCancel(JSON.stringify(['*']));
    const gone = urls.includes('*') ? [..._items.keys()] : urls.filter((u) => _items.has(u));
    if (!gone.length) return;
    for (const u of gone) _items.delete(u);
    _writeIndex();
    (async () => {
      try {
        const cache = await caches.open(OFFLINE_AUDIO_CACHE);
        for (const u of gone) await cache.delete(u);
      } catch (_e) { /* the next load reads what is really there */ }
      await _estimate();
      _emit({ type: 'removed', url: gone.length === 1 ? gone[0] : null });
      // Room was made: a queue waiting for space tries again now.
      if (_hold === 'space') _releaseHold();
    })();
  },
  /** @param {string} json urls, or ['*'] for every one */
  offlineAudioCancel(json) {
    const urls = _list(json);
    const all = urls.includes('*');
    const dropped = _queue.filter((t) => all || urls.includes(t.url));
    _queue = _queue.filter((t) => !dropped.includes(t));
    let off = dropped.length;
    for (const t of dropped) _emit({ type: 'cancelled', url: t.url });
    // A cancel outranks a stop for mobile data that has not landed yet: it is cancelled, not queued again.
    if (_active && (all || urls.includes(_active.url))) { _active.held = false; _active.ctl.abort(); off++; }
    // Cancelled ones leave the batch's count ("3 of 31" never waits on them).
    if (off) _batch.total = Math.max(0, _batch.total - off);
    if (!_queue.length && (!_active || _active.ctl.signal.aborted)) _settleEmpty();
    _persistQueue();
  },
  /** @param {string} json urls whose sizes the page wants (answered by one 'sizes' event) */
  offlineAudioSizes(json) {
    const urls = _list(json).filter((u) => typeof u === 'string' && relayUrl(u));
    if (!urls.length) return;
    (async () => {
      /** @type {Record<string, number>} */
      const sizes = {};
      let i = 0;
      const lane = async () => {
        while (i < urls.length) {
          const u = urls[i++];
          try {
            const r = await fetch(/** @type {string} */ (relayUrl(u)), { method: 'HEAD', credentials: 'omit' });
            const n = Number(r.headers.get('Content-Length'));
            if (r.ok && n > 0) sizes[u] = n;
          } catch (_e) { /* no signal: asked again by the next screen */ }
        }
      };
      await Promise.all(Array.from({ length: Math.min(SIZE_LOOKUPS, urls.length) }, lane));
      _emit({ type: 'sizes', sizes, asked: urls });
    })();
  },
  /**
   * Where the player loads a recording: its saved copy (served by the service worker, byte ranges included) whenever
   * this browser keeps it and a worker controls the page, signal or none; else its own URL (streamed from GitHub).
   * Saved first (downloads brief 2026-10-23, section 7 item 2): it was used only when navigator.onLine said false,
   * so on a weak signal a saved recording streamed, failed and said "No signal" with the file on the phone.
   * @param {string} url @param {string} [_held] the src the element holds now (kept for the player's call)
   * @returns {string}
   */
  srcFor(url, _held) {
    return _localFor(url) || url;
  },
  /** The service worker's address for a saved recording, whatever the signal, or null. @param {string} url */
  localFor: (url) => _localFor(url),
  /**
   * `src` is `url`'s saved-copy address, saved now or not: a Remove does not change what the element holds, and a
   * paused element holding the copy must still resume where it was (the refuter of dl-d0 batch A).
   * @param {string} url @param {string} src @returns {boolean}
   */
  isCopyOf(url, src) {
    const m = _release(url);
    return !!m && typeof src === 'string' && src.endsWith('/offline-audio/' + m[1] + '/' + m[2]);
  },
  /** Tests only: the waits, shortened. @param {{ retry?: number[], space?: number, offline?: number }} t */
  _setTiming(t) { _timing = { ..._timing, ...t }; },
  /** Tests only (a reload: what localStorage and the cache hold stays). */
  _reset() {
    if (_active) _active.ctl.abort();
    if (_unhookGate) _unhookGate();
    _unhookGate = null;
    if (_holdTimer) clearTimeout(_holdTimer);
    if (_onlineHook && typeof window !== 'undefined') window.removeEventListener('online', _onlineHook);
    if (_visHooked && typeof document !== 'undefined') document.removeEventListener('visibilitychange', _wakeCheck);
    _holdTimer = null; _onlineHook = null; _hold = null; _visHooked = false; _lock = null; _lockAsking = false;
    _gen++;
    _paused = false; _closed = false; _batch = { done: 0, total: 0, failed: 0 };
    _timing = { retry: RETRY_MS, space: SPACE_RECHECK_MS, offline: OFFLINE_RECHECK_MS };
    _items = new Map(); _queue = []; _active = null; _free = -1; _loaded = false; _seeded = false; _loading = null; _persistAsked = false; _persisted = null;
  },
};

// Read what is saved as the app starts: the player's offline check is synchronous, and a cold start with no signal
// must already know a saved recording on the first tap.
if (supported()) { _seed(); _load(); }
