// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   offline-audio-web — recordings saved for offline in a browser (cf1)
   ═══════════════════════════════════════════════════════════════════════
   Corbin 2026-09-26 21:1x: the PWA and an iPhone on its Home Screen save a
   letter, study or Bible book for offline, the same per-recording and
   per-collection rule as the phone app (no whole-edition button).

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
   ═══════════════════════════════════════════════════════════════════════ */

export const RELAY = 'https://audio.votreader.workers.dev/';
export const OFFLINE_AUDIO_CACHE = 'vot-offline-audio-v1';
const RELEASE = /^https:\/\/github\.com\/VOTReader\/votreader-assets\/releases\/download\/(audio-[a-z0-9-]{1,40})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,159}\.mp3)$/;
/** Size lookups in flight at once (a Bible book asks for up to 150). */
const SIZE_LOOKUPS = 4;
const PROGRESS_MS = 250;

/** @typedef {{ url: string, key: string, title: string, bytes: number, savedAt: number }} SavedItem */

/** @type {Map<string, SavedItem>} */
let _items = new Map();
/** @type {Array<{ url: string, key: string, title: string }>} */
let _queue = [];
/** @type {{ url: string, bytes: number, total: number, ctl: AbortController } | null} */
let _active = null;
let _free = -1;
let _loaded = false;
/** @type {Promise<void> | null} */
let _loading = null;
let _persistAsked = false;

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
}

/** @param {string | null} v */
const _dec = (v) => { try { return v ? decodeURIComponent(v) : ''; } catch (_e) { return ''; } };

/** Read what the cache holds (once), then tell the page its state is ready. */
function _load() {
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const cache = await caches.open(OFFLINE_AUDIO_CACHE);
      /** @type {Map<string, SavedItem>} */
      const items = new Map();
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        if (!res) continue;
        const h = res.headers;
        items.set(req.url, {
          url: req.url,
          key: _dec(h.get('X-Vot-Key')),
          title: _dec(h.get('X-Vot-Title')),
          bytes: Number(h.get('X-Vot-Bytes')) || 0,
          savedAt: Number(h.get('X-Vot-Saved-At')) || 0,
        });
      }
      _items = items;
      await _estimate();
    } catch (_e) { /* no cache here (a private window): nothing is saved */ }
    _loaded = true;
    _emit({ type: 'done' });
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
    queued: _queue.map((t) => t.url),
    active: _active ? { url: _active.url, bytes: _active.bytes, total: _active.total } : null,
  };
}

/** @param {string} json @returns {any[]} */
function _list(json) {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch (_e) { return []; }
}

async function _next() {
  if (_active || !_queue.length) return;
  const it = /** @type {{ url: string, key: string, title: string }} */ (_queue.shift());
  const ctl = new AbortController();
  const job = { url: it.url, bytes: 0, total: -1, ctl };
  _active = job;
  _emit({ type: 'progress', url: it.url, bytes: 0, total: -1 });
  let reason = 'network';
  let stored = false;
  try {
    if (_items.has(it.url)) throw new Error('already saved');
    if (!_persistAsked) {
      _persistAsked = true;
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_e) { /* best effort */ }
    }
    const from = relayUrl(it.url);
    if (!from) throw new Error('not a release recording');
    const res = await fetch(from, { signal: ctl.signal, credentials: 'omit' });
    if (res.status !== 200 || !res.body) throw new Error('relay ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || 0;
    if (!(total > 0)) { reason = 'size'; throw new Error('no size'); }
    job.total = total;
    await _estimate();
    if (_free >= 0 && total > _free) { reason = 'space'; throw new Error('no room'); }
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
    if (job.bytes !== total) { reason = 'short'; throw new Error('short'); }
    _items.set(it.url, { url: it.url, key: it.key, title: it.title, bytes: total, savedAt });
    await _estimate();
    _active = null;
    _emit({ type: 'done', url: it.url });
  } catch (e) {
    _active = null;
    // A cut-off copy never stays behind to play half a letter. (A put that failed stored nothing: a copy saved
    // before it is untouched.)
    if (stored) { try { await (await caches.open(OFFLINE_AUDIO_CACHE)).delete(it.url); } catch (_e) { /* gone already */ } }
    if (_items.has(it.url)) _emit({ type: 'done', url: it.url });
    else if (ctl.signal.aborted) _emit({ type: 'cancelled', url: it.url });
    else {
      if (e && /** @type {any} */ (e).name === 'QuotaExceededError') reason = 'space';
      _emit({ type: 'failed', url: it.url, reason });
    }
  }
  _next();
}

/** The phone app's bridge, as a browser keeps it. */
export const WebOfflineAudio = {
  supported,
  /** @returns {string | null} the whole state as JSON, null until the cache has been read */
  offlineAudioState() {
    if (!_loaded) { _load(); return null; }
    return JSON.stringify(_state());
  },
  /** @param {string} json [{ url, key, title }] */
  offlineAudioSave(json) {
    // Before the cache has been read nothing looks saved: a save then would fetch again what is already kept.
    if (!_loaded) { _load().then(() => WebOfflineAudio.offlineAudioSave(json)); return; }
    const busy = new Set(_queue.map((t) => t.url).concat(_active ? [_active.url] : []));
    /** @type {string[]} */
    const queued = [];
    for (const t of _list(json)) {
      if (!t || typeof t.url !== 'string' || _items.has(t.url) || busy.has(t.url)) continue;
      if (!relayUrl(t.url)) { _emit({ type: 'failed', url: t.url, reason: 'network' }); continue; }
      _queue.push({ url: t.url, key: String(t.key || ''), title: String(t.title || '') });
      busy.add(t.url);
      queued.push(t.url);
    }
    // One event for the batch, as the phone app sends it (n2-03).
    if (queued.length) _emit({ type: 'queued', urls: queued });
    _next();
  },
  /** @param {string} json urls, or ['*'] for every one */
  offlineAudioRemove(json) {
    const urls = _list(json);
    const gone = urls.includes('*') ? [..._items.keys()] : urls.filter((u) => _items.has(u));
    if (!gone.length) return;
    for (const u of gone) _items.delete(u);
    (async () => {
      try {
        const cache = await caches.open(OFFLINE_AUDIO_CACHE);
        for (const u of gone) await cache.delete(u);
      } catch (_e) { /* the next load reads what is really there */ }
      await _estimate();
      _emit({ type: 'removed', url: gone.length === 1 ? gone[0] : null });
    })();
  },
  /** @param {string} json urls, or ['*'] for every one */
  offlineAudioCancel(json) {
    const urls = _list(json);
    const all = urls.includes('*');
    const dropped = _queue.filter((t) => all || urls.includes(t.url));
    _queue = _queue.filter((t) => !dropped.includes(t));
    for (const t of dropped) _emit({ type: 'cancelled', url: t.url });
    if (_active && (all || urls.includes(_active.url))) _active.ctl.abort();
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
   * Where the player loads a recording: with no signal, its saved copy (served by the service worker) when this
   * browser keeps it and a worker controls the page; else its own URL (streamed from GitHub, as always).
   * `held`, the src the element holds now (unfailed): the saved copy it already plays keeps playing when the
   * signal comes back, rather than reloading from GitHub.
   * @param {string} url @param {string} [held] @returns {string}
   */
  srcFor(url, held) {
    const local = _localFor(url);
    if (local && held === local) return local;
    if (!local || typeof navigator === 'undefined' || navigator.onLine !== false) return url;
    return local;
  },
  /** The service worker's address for a saved recording, whatever the signal, or null. @param {string} url */
  localFor: (url) => _localFor(url),
  /** Tests only. */
  _reset() {
    if (_active) _active.ctl.abort();
    _items = new Map(); _queue = []; _active = null; _free = -1; _loaded = false; _loading = null; _persistAsked = false;
  },
};

// Read what is saved as the app starts: the player's offline check is synchronous, and a cold start with no signal
// must already know a saved recording on the first tap.
if (supported()) _load();
