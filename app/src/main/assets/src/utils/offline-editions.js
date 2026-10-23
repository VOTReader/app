/* ═══════════════════════════════════════════════════════════════════════
   offline-editions — the Bible editions kept on this device (web only)
   ═══════════════════════════════════════════════════════════════════════
   mw-oe1 (2026-10-23). NKJV is built into the app. Every other edition is
   one src/data/bible-<code>.js (~4.5 MB) that the service worker keeps in
   its corpus cache the first time it is fetched (corpusFirst, cache on use).
   The edition a reader picks downloads at once (useTranslationLoader loads
   it on the pick, and again when a pick made offline comes back online);
   this store adds the rest: which editions are on the device now, and one
   "Download all" that fetches only the missing ones, one file at a time.

   The status is read from the caches every time, never from a record of
   what a download believed it did: caches.match searches every bucket, the
   same lookup the worker's offline fallback makes, so "on this device"
   means "opens offline". A page no worker controls cannot cache what it
   fetches, so there the store says 'unsupported' and the row stays hidden.
   The APK packages every edition; it never asks.

   phase: unknown | unsupported | partial | complete | downloading | stopped
   ═══════════════════════════════════════════════════════════════════════ */

/** Bytes of each edition's file (src/data/bible-<code>.js); offline-editions.test.js checks them against the files. */
export const EDITION_BYTES = {
  rnkjv: 181184,
  web: 4593893,
  bsb: 4441427,
  hnv: 4599086,
  kjv: 4704646,
  rkjv: 182532,
  asv: 4705334,
  lsv: 4717716,
  ylt: 4725155,
  rvr: 4482323,
};

/** @param {string} code */
export function editionUrl(code) { return './src/data/bible-' + code + '.js'; }

/** The editions that live in a file of their own: every shipped option but NKJV, in the picker's order. */
export function editionCodes() {
  const opts = typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS) ? TRANSLATION_OPTIONS : [];
  return opts.map((o) => o && o.id).filter((id) => typeof id === 'string' && id !== 'nkjv' && /^[a-z]{2,8}$/.test(id));
}

/** @param {string[]} codes */
export function editionBytes(codes) {
  return codes.reduce((sum, c) => sum + (EDITION_BYTES[/** @type {keyof typeof EDITION_BYTES} */ (c)] || 0), 0);
}

/** @param {number} b */
export function formatEditionBytes(b) {
  return Math.max(1, Math.round(b / 1e6)) + ' MB';
}

/**
 * @typedef {{ phase: string, have: string[], missing: string[], done: number, total: number }} EditionsState
 * done / total count the files of the download running (or stopped).
 */

/** @type {EditionsState} */
let _state = { phase: 'unknown', have: [], missing: [], done: 0, total: 0 };
let _version = 0;
/** @type {Promise<string> | null} */
let _running = null;
/** @type {Set<() => void>} */
const _listeners = new Set();

/** @param {Partial<EditionsState>} patch */
function _set(patch) {
  _state = { ..._state, ...patch };
  _version += 1;
  _listeners.forEach((cb) => { try { cb(); } catch (_e) { /* a subscriber must not break the others */ } });
}

function _supported() {
  if (typeof PlatformBridge !== 'undefined' && PlatformBridge && PlatformBridge.isAndroid) return false;
  return typeof caches !== 'undefined' && typeof caches.match === 'function'
    && typeof navigator !== 'undefined' && !!navigator.serviceWorker && !!navigator.serviceWorker.controller;
}

/** @param {string} code */
async function _cached(code) {
  try { return !!(await caches.match(editionUrl(code))); } catch (_e) { return false; }
}

/** @returns {Promise<{ have: string[], missing: string[] }>} */
async function _read() {
  const have = [];
  const missing = [];
  for (const code of editionCodes()) (await _cached(code) ? have : missing).push(code);
  return { have, missing };
}

export const OfflineEditions = {
  /** @param {() => void} cb */
  subscribe(cb) { _listeners.add(cb); return () => { _listeners.delete(cb); }; },
  getVersion() { return _version; },
  /** @returns {EditionsState} */
  getState() { return _state; },

  /** Read the caches. A download in progress keeps its own phase; the lists still refresh. */
  async check() {
    if (!_supported()) { _set({ phase: 'unsupported', have: [], missing: [] }); return _state.phase; }
    const { have, missing } = await _read();
    if (_running) _set({ have, missing });
    else if (_state.phase === 'stopped' && missing.length) _set({ have, missing });
    else _set({ phase: missing.length ? 'partial' : 'complete', have, missing, done: 0, total: 0 });
    return _state.phase;
  },

  /**
   * Fetch every missing edition through the worker (which keeps each in its corpus cache), one at a
   * time, re-reading the cache after each. A failed fetch stops the run: 'stopped', and the next
   * download fetches only what is still missing. Two callers share one run.
   */
  downloadAll() {
    if (_running) return _running;
    _running = (async () => {
      if (!_supported()) { _set({ phase: 'unsupported' }); return _state.phase; }
      const { have, missing } = await _read();
      const todo = missing.slice();
      _set({ phase: todo.length ? 'downloading' : 'complete', have, missing, done: 0, total: todo.length });
      for (const code of todo) {
        let ok = false;
        try {
          const res = await fetch(editionUrl(code));
          // The worker has put the file in its cache before it answers (corpusFirst awaits the put).
          if (res.body && typeof res.body.cancel === 'function') { try { await res.body.cancel(); } catch (_e) { /* done with it */ } }
          ok = res.ok && await _cached(code);
        } catch (_e) { ok = false; }
        if (!ok) {
          const now = await _read();
          _set({ phase: 'stopped', have: now.have, missing: now.missing });
          return _state.phase;
        }
        _set({
          have: _state.have.concat(code),
          missing: _state.missing.filter((c) => c !== code),
          done: _state.done + 1,
        });
      }
      const now = await _read();
      _set({ phase: now.missing.length ? 'stopped' : 'complete', have: now.have, missing: now.missing });
      return _state.phase;
    })().finally(() => { _running = null; });
    return _running;
  },

  /** Tests only. */
  _reset() { _state = { phase: 'unknown', have: [], missing: [], done: 0, total: 0 }; _running = null; _version += 1; },
};
