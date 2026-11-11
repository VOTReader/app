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
   waits, and what is on its way stops, goes back to the head of the queue and
   starts again from the top once the phone is on Wi-Fi.

   The queue (dl-rework, 2026-11-10; the phone app's OfflineAudioStore keeps the same rules):
   - DOWNLOADS_AT_ONCE run at a time. The next is the first waiting one by priority: one the listener tapped by itself
     ('tap'), then a set ('bulk'), then automatic ones (plan week, the next 3: 'auto'); in the order asked within each.
   - One that does not fit in the free space is stepped over; the queue holds as 'space' only when nothing left fits.
   - A failed fetch is tried again at 5, 20 and 60 s, then moves to the "will try again" list (`later`): never dropped.
     That list is tried again by itself with growing gaps (LATER_MS, capped at 30 min), whenever the signal comes back,
     and at every open. A relay answer (404, 5xx) is a server answer ('server' with its status), not "no network".
   - A transfer with no bytes for STALL_MS is aborted and tried again ('stalled').
   - The queue is saved beside the index (QUEUE_KEY) and goes on by itself at the next open, unless the listener
     paused it. A browser runs nothing with the page closed. A screen wake lock is held while a download runs in view.
   ═══════════════════════════════════════════════════════════════════════ */

import { downloadsWait, networkType, onGateChange } from './download-gate.js';

export const RELAY = 'https://audio.votreader.workers.dev/';
export const OFFLINE_AUDIO_CACHE = 'vot-offline-audio-v1';
/** How many recordings download at once (the phone app's OfflineAudioStore.PARALLEL is the same). */
export const DOWNLOADS_AT_ONCE = 3;
/** Priorities, first served first: one tapped by itself, a set, automatic ones. */
export const PRIORITY = Object.freeze({ tap: 0, bulk: 1, auto: 2 });
const RELEASE = /^https:\/\/github\.com\/VOTReader\/votreader-assets\/releases\/download\/(audio-[a-z0-9-]{1,40})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,159}\.mp3)$/;
/** Size lookups in flight at once (a Bible book asks for up to 150). */
const SIZE_LOOKUPS = 4;
const PROGRESS_MS = 250;
/** What is saved, kept beside the cache and read synchronously at boot (section 7 item 18). Not in backups. */
const INDEX_KEY = 'vot.offlineAudioIndex';
/** The queue, paused and the batch's counts, so a reload or a closed tab finds them again (brief section 7 item 11). */
const QUEUE_KEY = 'vot.offlineAudioQueue';
/** Quick retries of a failed fetch (the phone app's RETRY_DELAYS); then it moves to the "will try again" list. */
const RETRY_MS = [5000, 20000, 60000];
/** The "will try again" list's gaps: growing, capped at 30 min. */
const LATER_MS = [2 * 60000, 5 * 60000, 10 * 60000, 20 * 60000, 30 * 60000];
const SPACE_RECHECK_MS = 30000;
const OFFLINE_RECHECK_MS = 30000;
/** A transfer with no bytes this long is aborted and tried again. */
const STALL_MS = 30000;
let _timing = { retry: RETRY_MS, later: LATER_MS, space: SPACE_RECHECK_MS, offline: OFFLINE_RECHECK_MS, stall: STALL_MS };

/** @typedef {{ url: string, key: string, title: string, bytes: number, savedAt: number }} SavedItem */
/**
 * @typedef {{ url: string, key: string, title: string, bytes: number, pri: number, wifi?: boolean, tries?: number,
 *   at?: number, reason?: string, status?: number, later?: boolean, b?: number, counted?: boolean, failedIn?: number,
 *   noRoom?: boolean, seq?: number }} QueueItem
 *   bytes 0 = not known; wifi: an automatic download (dl-d5), started only on Wi-Fi; tries: failed tries so far; at: not
 *   before this time (a retry's wait); reason/status: why the last try failed; later: on the "will try again" list;
 *   b: the batch it was asked in, counted: its bytes are in that batch's total, failedIn: the batch whose failed count
 *   holds it; noRoom: its wait is for space, not a retry; seq: its place in the order asked
 */
/**
 * @typedef {{ it: QueueItem, url: string, bytes: number, total: number, ctl: AbortController, held: boolean,
 *   stalled: boolean, last: number, body?: TransformStreamDefaultController | null }} Job
 */

/** @type {Map<string, SavedItem>} */
let _items = new Map();
/** Everything waiting (the "will try again" list too), in the order asked. @type {QueueItem[]} */
let _queue = [];
/** The downloads on their way, by URL. held: stopped for mobile data or Pause, so it goes back in line. @type {Map<string, Job>} */
let _actives = new Map();
let _paused = false;
/** Why nothing started at the last look: offline | space | retrying | wifi | later, or null. @type {string | null} */
let _hold = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let _wakeTimer = null;
let _onlineHooked = false;
/** Recordings asked since the queue was last empty: "Downloading 3 of 31", "1.2 of 4.4 GB". */
let _batch = { done: 0, total: 0, failed: 0, bytes: 0, doneBytes: 0 };
let _batchId = 1;
/** The order asked: each new one in the queue takes the next. */
let _seq = 0;
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
    _pump();
    // 'checked', not 'done': the mirror re-reads either way, but a 'done' with nothing downloading told a screen
    // reader "Download finished" at every boot whose first screen had a download control.
    _emit({ type: 'checked' });
  })();
  return _loading;
}

/** The waiting ones in the order they start: by priority, then as asked (one put back keeps its place). */
function _ordered() {
  return [..._queue].sort((a, b) => (a.pri - b.pri) || ((a.seq || 0) - (b.seq || 0)));
}

/** Stop a stalled job: its fetch, and its body stream (a body that stopped is not always ended by the abort). @param {Job} j */
function _abortStalled(j) {
  j.ctl.abort();
  try { if (j.body) j.body.error(new Error('stalled')); } catch (_e) { /* already closed */ }
}

/** @param {QueueItem} t */
const _brief = (t) => ({ url: t.url, key: t.key, title: t.title, pri: t.pri });

function _state() {
  let total = 0;
  for (const it of _items.values()) total += it.bytes;
  const actives = [..._actives.values()];
  const waiting = _ordered().filter((t) => !t.later);
  const reason = _reasonNow();
  return {
    items: [..._items.values()],
    totalBytes: total,
    freeBytes: _free,
    persisted: _persisted,
    queued: waiting.map((t) => t.url),
    active: actives.length ? { url: actives[0].url, bytes: actives[0].bytes, total: actives[0].total } : null,
    actives: actives.map((j) => ({ url: j.url, bytes: j.bytes, total: j.total })),
    // Download only on Wi-Fi: what is queued waits for it (the rows say so).
    waiting: !!(waiting.length || actives.length) && downloadsWait(),
    paused: _paused,
    reason,
    need: reason === 'space' ? _need() : 0,
    left: _left(),
    batch: { ..._batch },
    // A browser runs nothing with the page closed.
    closedRuns: false,
    // What each one on its way was asked as, so the In line rows have titles after a reload.
    queue: actives.map((j) => _brief(j.it)).concat(waiting.map(_brief)),
    later: _queue.filter((t) => t.later).map((t) => ({ ..._brief(t), reason: t.reason || 'network', status: t.status || 0, tries: t.tries || 0, at: t.at || 0 })),
  };
}

/** Why the queue is not moving (paused, wifi, offline, space, retrying, later), or null when it is, or is empty. */
function _reasonNow() {
  const waiting = _queue.some((t) => !t.later);
  if (!waiting && !_actives.size) return _queue.length ? 'later' : null;
  if (_paused) return 'paused';
  if (downloadsWait()) return 'wifi';
  if (_actives.size) return null;
  return _hold;
}

/** The bytes the downloads on their way still need (all of them, planned sizes too: for choosing what fits). */
function _reserved() {
  let n = 0;
  for (const j of _actives.values()) n += Math.max(0, (j.total > 0 ? j.total : j.it.bytes) - j.bytes);
  return n;
}

/** The bytes the others already receiving still need (for a job's own check of room). @param {string} url */
function _receiving(url) {
  let n = 0;
  for (const j of _actives.values()) if (j.url !== url && j.total > 0) n += Math.max(0, j.total - j.bytes);
  return n;
}

/** How much more room the smallest waiting one needs (0 when unknown). */
function _need() {
  if (!(_free >= 0)) return 0;
  const room = _free - _reserved();
  let best = 0;
  for (const t of _queue) {
    if (t.later || !(t.bytes > 0)) continue;
    const short = t.bytes - room;
    if (short > 0 && (!best || short < best)) best = short;
  }
  return best;
}

/** What is still to download (the "will try again" list left out): how many, their known bytes, how many have no size. */
function _left() {
  let bytes = 0;
  let unknown = 0;
  let count = 0;
  for (const a of _actives.values()) {
    count++;
    if (a.total > 0) bytes += Math.max(0, a.total - a.bytes);
    else if (a.it.bytes > 0) bytes += a.it.bytes;
    else unknown++;
  }
  for (const t of _queue) {
    if (t.later) continue;
    count++;
    if (t.bytes > 0) bytes += t.bytes; else unknown++;
  }
  return { count, bytes, unknown };
}

/** Save the queue (what is on its way first), paused and the batch; nothing when there is nothing to come back to. */
function _persistQueue() {
  try {
    const q = [..._actives.values()].map((j) => j.it).concat(_queue);
    if (!q.length) { localStorage.removeItem(QUEUE_KEY); return; }
    localStorage.setItem(QUEUE_KEY, JSON.stringify({
      v: 2,
      items: q.map((t) => ({
        url: t.url, key: t.key, title: t.title, bytes: t.bytes, pri: t.pri,
        ...(t.wifi ? { wifi: true } : {}), ...(t.later ? { later: true, tries: t.tries || 0 } : {}),
        ...(t.reason ? { reason: t.reason } : {}), ...(t.status ? { status: t.status } : {}),
      })),
      paused: _paused,
      batch: _batch,
    }));
  } catch (_e) { /* storage off or full: the queue lives as long as the page */ }
}

/** @param {any} t @returns {number} */
function _priOf(t) {
  if (t && typeof t.pri === 'number' && t.pri >= 0 && t.pri <= 2) return t.pri;
  if (t && typeof t.pri === 'string' && t.pri in PRIORITY) return PRIORITY[/** @type {keyof typeof PRIORITY} */ (t.pri)];
  return t && t.wifi === true ? PRIORITY.auto : PRIORITY.bulk;
}

/**
 * The queue a closed page left: what is not saved yet goes back in line and goes on by itself (only a Pause all the
 * listener chose holds it). The "will try again" list is tried again now: an open is one of its times. Once, with the
 * cache read.
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
    back.push({
      url: t.url, key: String(t.key || ''), title: String(t.title || ''), bytes: Number(t.bytes) > 0 ? Number(t.bytes) : 0,
      pri: _priOf(t), ...(t.wifi === true ? { wifi: true } : {}),
      ...(t.later === true ? { later: true, tries: Math.max(0, Number(t.tries) || 0), reason: String(t.reason || 'network'), status: Number(t.status) || 0, failedIn: _batchId } : {}),
      at: 0, b: _batchId, counted: true, seq: ++_seq,
    });
  }
  if (!back.length) { _persistQueue(); return; }
  for (const t of _queue) t.seq = ++_seq;   // asked before the cache was read: after what the close left
  _queue = back.concat(_queue);
  if (saved.paused === true) _paused = true;
  const b = saved.batch && typeof saved.batch === 'object' ? saved.batch : {};
  const done = Math.max(0, Number(b.done) || 0);
  const failed = back.filter((t) => t.later).length;
  _batch = {
    done, failed, total: Math.max(Number(b.total) || 0, done + back.length),
    bytes: Math.max(0, Number(b.bytes) || 0), doneBytes: Math.max(0, Number(b.doneBytes) || 0),
  };
  _hookGate();
}

/** No signal, as far as the browser knows (a failed fetch with onLine true is a retry, not a wait). */
const _offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;
/** dl-d5: the browser says Wi-Fi (or a wire); one that cannot tell is not. */
const _unmetered = () => { const t = networkType(); return t === 'wifi' || t === 'ethernet'; };

/** The signal came back: the head goes on, and the "will try again" list is tried now. */
function _onOnline() {
  for (const t of _queue) if (t.at) t.at = 0;
  _pump();
}

/** Look again in `ms` (one timer; the earliest asked wins). @param {number} ms */
function _wakeIn(ms) {
  if (_wakeTimer) clearTimeout(_wakeTimer);
  _wakeTimer = setTimeout(() => { _wakeTimer = null; _pump(); }, Math.max(0, ms));
}

/**
 * Start what may start, up to DOWNLOADS_AT_ONCE: the first waiting by priority that is due, allowed on this network and
 * fits in the free space. When nothing more can start, say why (_hold) and look again when that may have changed.
 */
function _pump() {
  if (!_loaded) return;
  if (_paused || downloadsWait()) { _emit({ type: 'checked' }); return; }
  const now = Date.now();
  let soonest = Infinity;
  let blockedWifi = false;
  let blockedSpace = false;
  let blockedRetry = false;
  let started = false;
  const offline = _offlineNow();
  while (_actives.size < DOWNLOADS_AT_ONCE) {
    /** @type {QueueItem | null} */
    let pick = null;
    const room = _free >= 0 ? _free - _reserved() : Infinity;
    blockedWifi = false; blockedSpace = false; blockedRetry = false;
    for (const t of _ordered()) {
      if (t.at && t.at > now) {
        soonest = Math.min(soonest, t.at);
        if (t.noRoom) blockedSpace = true; else if (!t.later) blockedRetry = true;
        continue;
      }
      if (t.wifi && !_unmetered()) { blockedWifi = true; continue; }
      // Known not to fit: stepped over; the next one may.
      if (t.bytes > 0 && t.bytes > room) { blockedSpace = true; continue; }
      pick = t;
      break;
    }
    if (!pick) break;
    if (offline) { _hold = 'offline'; _hookOnline(); _wakeIn(_timing.offline); _emit({ type: 'waiting', url: pick.url, reason: 'offline' }); return; }
    _queue.splice(_queue.indexOf(pick), 1);
    pick.noRoom = false;
    started = true;
    void _run(pick);
  }
  if (started || _actives.size) { _hold = null; if (soonest < Infinity) _wakeIn(soonest - now); return; }
  const before = _hold;
  _hold = blockedSpace ? 'space' : blockedRetry ? 'retrying' : blockedWifi ? 'wifi' : _queue.length ? 'later' : null;
  if (blockedSpace) _wakeIn(_timing.space);
  else if (soonest < Infinity) _wakeIn(soonest - now);
  if (_hold === 'space' && before !== 'space') _emit({ type: 'waiting', url: '', reason: 'space' });
  else if (_hold !== before) _emit({ type: 'checked' });
  if (!_queue.length) _batchEnds(false);
}

/** Nothing waits: the next download starts a new batch, unpaused. @param {boolean} cancelled what is on its way was all cancelled */
function _batchEnds(cancelled) {
  if ((!cancelled && _actives.size) || _queue.length) return;
  _paused = false;
  _hold = null;
  if (_wakeTimer) clearTimeout(_wakeTimer);
  _wakeTimer = null;
}

function _hookOnline() {
  if (_onlineHooked || typeof window === 'undefined') return;
  _onlineHooked = true;
  window.addEventListener('online', _onOnline);
}

/** Keep the screen on while a download runs in view (brief 3f); let it go when none does. */
function _wakeCheck() {
  const wl = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator).wakeLock : null;
  const want = _actives.size > 0 && typeof document !== 'undefined' && document.visibilityState === 'visible';
  if (want && !_lock && !_lockAsking && wl && typeof wl.request === 'function') {
    _lockAsking = true;
    Promise.resolve().then(() => wl.request('screen')).then((/** @type {any} */ l) => {
      _lockAsking = false;
      if (!_actives.size) { l.release().catch(() => {}); return; }
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

/** Stop every download on its way and put it back in line (Pause, mobile data). */
function _holdActives() {
  for (const j of _actives.values()) if (!j.held) { j.held = true; j.ctl.abort(); }
}

/**
 * The gate opened or closed (the switch, or the phone moved between Wi-Fi and mobile data). Closed, what is on its way
 * stops and goes back in line; open, the queue goes on. The rows re-read.
 */
function _onGate() {
  if (downloadsWait()) _holdActives();
  else _pump();
  _emit({ type: 'checked' });
}

function _hookGate() {
  if (!_unhookGate) _unhookGate = onGateChange(_onGate);
  _hookOnline();
  // The wake lock goes when the page is hidden; back in view with a download running, ask again.
  if (!_visHooked && typeof document !== 'undefined') { _visHooked = true; document.addEventListener('visibilitychange', _wakeCheck); }
}

/** Cancel a response's unread body, which ends its fetch. Never throws. @param {Response} res */
function _drop(res) {
  try { if (res.body && !res.bodyUsed) res.body.cancel().catch(() => {}); } catch (_e) { /* already closed */ }
}

/** A thrown reason for a failed try. */
class Failed extends Error {
  /** @param {string} reason @param {number} [status] */
  constructor(reason, status) { super(reason); this.reason = reason; this.status = status || 0; }
}

/**
 * Put a failed one back: a quick retry, or onto the "will try again" list with growing gaps. Never dropped.
 * @param {QueueItem} it @param {string} reason @param {number} status
 */
function _failed(it, reason, status) {
  const tries = (it.tries || 0) + 1;
  it.tries = tries;
  it.reason = reason;
  it.status = status;
  const quick = _timing.retry;
  const now = Date.now();
  if (tries <= quick.length) {
    it.at = now + quick[tries - 1];
    _queue.unshift(it);
    _hold = 'retrying';
    _emit({ type: 'waiting', url: it.url, reason: 'retrying' });
    return;
  }
  const first = !it.later;
  it.later = true;
  const gaps = _timing.later;
  it.at = now + gaps[Math.min(tries - quick.length - 1, gaps.length - 1)];
  _queue.push(it);
  if (first) { _batch.failed++; it.failedIn = _batchId; }
  _emit({ type: 'failed', url: it.url, reason, ...(status ? { status } : {}) });
}

/** One download, start to end. @param {QueueItem} it */
async function _run(it) {
  const ctl = new AbortController();
  /** @type {Job} */
  const job = { it, url: it.url, bytes: 0, total: -1, ctl, held: false, stalled: false, last: Date.now() };
  const gen = _gen;
  _actives.set(it.url, job);
  _wakeCheck();
  _emit({ type: 'progress', url: it.url, bytes: 0, total: -1 });
  // No bytes for STALL_MS: aborted and tried again (a connection that stops without an error held the queue for good).
  const watch = setInterval(() => {
    if (Date.now() - job.last >= _timing.stall && !job.held && !ctl.signal.aborted) { job.stalled = true; _abortStalled(job); }
  }, Math.max(10, Math.min(5000, Math.floor(_timing.stall / 3))));
  let stored = false;
  try {
    if (_items.has(it.url)) throw new Failed('saved');
    if (!_persistAsked) {
      _persistAsked = true;
      // The answer was ignored, so downloads the browser may clear carried no word of it (brief section 7 item 3).
      // Not awaited: the others starting beside this one keep their order.
      try {
        if (navigator.storage && navigator.storage.persist) {
          Promise.resolve(navigator.storage.persist()).then((ok) => { _persisted = ok === true; }, () => {});
        }
      } catch (_e) { /* best effort */ }
    }
    const from = relayUrl(it.url);
    if (!from) throw new Failed('network');
    // Its size known (the page's baked bytes): no room is known before a byte is fetched.
    if (it.bytes > 0) {
      await _estimate();
      if (_free >= 0 && it.bytes > _free - _receiving(it.url)) throw new Failed('space');
    }
    if (ctl.signal.aborted || gen !== _gen) throw new Failed('stopped');
    job.last = Date.now();
    const res = await fetch(from, { signal: ctl.signal, credentials: 'omit' });
    job.last = Date.now();
    // A response this job will not read is cancelled before it is left: its body stream (and the fetch under it,
    // which a cancel ends) otherwise stayed open until GC (#60, item 5). Not ctl.abort(): the catch reads that as
    // the reader's cancel.
    if (res.status !== 200 || !res.body) { _drop(res); throw new Failed('server', res.status); }
    const total = Number(res.headers.get('Content-Length')) || 0;
    if (!(total > 0)) { _drop(res); throw new Failed('size'); }
    job.total = total;
    if (!(it.bytes > 0)) it.bytes = total;
    if (!it.counted && it.b === _batchId) { _batch.bytes += total; it.counted = true; }
    await _estimate();
    // The room the others already receiving still need is spoken for.
    if (_free >= 0 && total > _free - _receiving(it.url)) { _drop(res); throw new Failed('space'); }
    let lastEmit = 0;
    const count = new TransformStream({
      start(c) { job.body = c; },
      transform(chunk, out) {
        job.bytes += chunk.byteLength;
        const now = Date.now();
        job.last = now;
        if (now - lastEmit >= PROGRESS_MS) { lastEmit = now; _emit({ type: 'progress', url: it.url, bytes: job.bytes, total }); }
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
    if (ctl.signal.aborted) throw new Failed(job.stalled ? 'stalled' : 'stopped');
    if (job.bytes !== total) throw new Failed('short');
    if (gen !== _gen) return;
    _items.set(it.url, { url: it.url, key: it.key, title: it.title, bytes: total, savedAt });
    _writeIndex();
    _actives.delete(it.url);
    _landed(it, total);
    await _estimate();
    _persistQueue();
    _emit({ type: 'done', url: it.url });
  } catch (e) {
    if (gen !== _gen) return;
    _actives.delete(it.url);
    // A cut-off copy never stays behind to play half a letter. (A put that failed stored nothing: a copy saved
    // before it is untouched.)
    if (stored) { try { await (await caches.open(OFFLINE_AUDIO_CACHE)).delete(it.url); } catch (_e) { /* gone already */ } }
    let reason = e instanceof Failed ? e.reason : 'network';
    const status = e instanceof Failed ? e.status : 0;
    if (e && /** @type {any} */ (e).name === 'QuotaExceededError') reason = 'space';
    if (job.stalled) reason = 'stalled';
    if (_items.has(it.url)) { _landed(it, _items.get(it.url)?.bytes || 0); _persistQueue(); _emit({ type: 'done', url: it.url }); }
    // Stopped for mobile data or Pause all: back at the head of its line, from the top (its bytes are gone).
    else if (job.held) { _queue.unshift(it); _persistQueue(); _emit({ type: 'checked' }); }
    else if (ctl.signal.aborted && !job.stalled) { _persistQueue(); _emit({ type: 'cancelled', url: it.url }); }
    // No room is never a failure (brief 3i): it waits a while, and the queue steps over it to what fits.
    else if (reason === 'space') {
      it.at = Date.now() + _timing.space;
      it.noRoom = true;
      _queue.unshift(it);
      _persistQueue();
      _emit({ type: 'waiting', url: it.url, reason: 'space' });
    } else if ((reason === 'network' || reason === 'stalled') && _offlineNow()) {
      // No signal: it waits for one and spends no retry.
      _queue.unshift(it);
      _persistQueue();
    } else {
      _failed(it, reason, status);
      _persistQueue();
    }
  } finally {
    clearInterval(watch);
  }
  if (gen !== _gen) return;
  _pump();
  _wakeCheck();
}

/** A download landed: it counts in its batch (one asked before this batch began joins it). @param {QueueItem} it @param {number} bytes */
function _landed(it, bytes) {
  if (it.b !== _batchId) { it.b = _batchId; it.counted = false; _batch.total++; }
  if (!it.counted) { _batch.bytes += bytes; it.counted = true; }
  _unfail(it);
  _batch.done++;
  _batch.doneBytes += bytes;
}

/** It leaves the "will try again" list: this batch's failed count drops when it was counted there. @param {QueueItem} it */
function _unfail(it) {
  if (it.failedIn === _batchId) _batch.failed = Math.max(0, _batch.failed - 1);
  it.failedIn = 0;
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
  /**
   * @param {string} json [{ url, key, title, bytes?, wifi?, pri? }]: one already waiting is asked again (its wait ends,
   *   a "will try again" one is tried now) and moves up when asked at a higher priority.
   */
  offlineAudioSave(json) {
    // Before the cache has been read nothing looks saved: a save then would fetch again what is already kept.
    if (!_loaded) { _load().then(() => WebOfflineAudio.offlineAudioSave(json)); return; }
    _hookGate();
    // A new batch once nothing is waiting or on its way (the "will try again" list stays its own).
    if (!_actives.size && !_queue.some((t) => !t.later)) { _batchId++; _batch = { done: 0, total: 0, failed: 0, bytes: 0, doneBytes: 0 }; }
    /** @type {string[]} */
    const queued = [];
    let moved = false;
    for (const t of _list(json)) {
      if (!t || typeof t.url !== 'string' || _items.has(t.url) || _actives.has(t.url)) continue;
      const pri = _priOf(t);
      const had = _queue.find((q) => q.url === t.url);
      if (had) {
        // Asked again: now, at the higher of the two priorities; the listener's own lifts an automatic one off Wi-Fi.
        if (t.wifi !== true) delete had.wifi;
        had.pri = Math.min(had.pri, pri);
        had.at = 0;
        had.noRoom = false;
        if (had.later) { had.later = false; had.tries = 0; _unfail(had); }
        moved = true;
        continue;
      }
      if (!relayUrl(t.url)) { _emit({ type: 'failed', url: t.url, reason: 'network' }); continue; }
      const bytes = Number(t.bytes) > 0 ? Number(t.bytes) : 0;
      _queue.push({ url: t.url, key: String(t.key || ''), title: String(t.title || ''), bytes, pri, b: _batchId, counted: bytes > 0, seq: ++_seq,
        ...(t.wifi === true ? { wifi: true } : {}) });
      _batch.bytes += bytes;
      queued.push(t.url);
    }
    if (!queued.length && !moved) return;
    _batch.total += queued.length;
    _persistQueue();
    // One event for the batch, as the phone app sends it (n2-03).
    if (queued.length) _emit({ type: 'queued', urls: queued });
    else _emit({ type: 'checked' });
    _pump();
  },
  /** Pause all: what is on its way stops and goes back in line. Holds across a reload. */
  offlineAudioPause() {
    if (_paused) return;
    _paused = true;
    _holdActives();
    _persistQueue();
    _emit({ type: 'checked' });
  },
  /** Resume all: it goes on from the head. */
  offlineAudioResume() {
    if (!_paused) return;
    _paused = false;
    _persistQueue();
    _hookGate();
    _pump();
    _emit({ type: 'checked' });
  },
  /** Retry now: every one on the "will try again" list (and every wait) is tried at once. */
  offlineAudioRetry() {
    for (const t of _queue) { t.at = 0; t.noRoom = false; if (t.later) { t.later = false; t.tries = 0; _unfail(t); } }
    _persistQueue();
    _pump();
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
      // Room was made: what waited for space tries again now.
      let freed = false;
      for (const t of _queue) if (t.noRoom) { t.at = 0; t.noRoom = false; freed = true; }
      if (freed || _hold === 'space') _pump();
    })();
  },
  /** @param {string} json urls, or ['*'] for every one */
  offlineAudioCancel(json) {
    const urls = _list(json);
    const all = urls.includes('*');
    const dropped = _queue.filter((t) => all || urls.includes(t.url));
    _queue = _queue.filter((t) => !dropped.includes(t));
    let off = 0;
    for (const t of dropped) { if (!t.later) off++; _unfail(t); _emit({ type: 'cancelled', url: t.url }); }
    // A cancel outranks a stop for mobile data that has not landed yet: it is cancelled, not queued again.
    for (const j of _actives.values()) if (all || urls.includes(j.url)) { j.held = false; j.ctl.abort(); off++; }
    // Cancelled ones leave the batch's count ("3 of 31" never waits on them).
    if (off) _batch.total = Math.max(0, _batch.total - off);
    if (!_queue.length && [..._actives.values()].every((j) => j.ctl.signal.aborted)) _batchEnds(true);
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
  /** Tests only: the waits, shortened. @param {{ retry?: number[], later?: number[], space?: number, offline?: number, stall?: number }} t */
  _setTiming(t) { _timing = { ..._timing, ...t }; },
  /** Tests only (a reload: what localStorage and the cache hold stays). */
  _reset() {
    for (const j of _actives.values()) j.ctl.abort();
    if (_unhookGate) _unhookGate();
    _unhookGate = null;
    if (_wakeTimer) clearTimeout(_wakeTimer);
    if (_onlineHooked && typeof window !== 'undefined') window.removeEventListener('online', _onOnline);
    if (_visHooked && typeof document !== 'undefined') document.removeEventListener('visibilitychange', _wakeCheck);
    _wakeTimer = null; _onlineHooked = false; _hold = null; _visHooked = false; _lock = null; _lockAsking = false;
    _gen++;
    _paused = false; _batch = { done: 0, total: 0, failed: 0, bytes: 0, doneBytes: 0 }; _batchId++;
    _timing = { retry: RETRY_MS, later: LATER_MS, space: SPACE_RECHECK_MS, offline: OFFLINE_RECHECK_MS, stall: STALL_MS };
    _items = new Map(); _queue = []; _actives = new Map(); _free = -1; _loaded = false; _seeded = false; _loading = null; _persistAsked = false; _persisted = null;
  },
};

// Read what is saved as the app starts: the player's offline check is synchronous, and a cold start with no signal
// must already know a saved recording on the first tap.
if (supported()) { _seed(); _load(); }
