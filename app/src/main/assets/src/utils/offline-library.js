/* ═══════════════════════════════════════════════════════════════════════
   offline-library — is the PWA's offline library complete? One-tap repair.
   ═══════════════════════════════════════════════════════════════════════
   A tiny external store (useSyncExternalStore shape) behind
   OfflineLibraryBanner. Web only, bundle-d. B5, 2026-09-22.

   The service worker's install downloads the whole text library for
   offline use, best-effort: a dropped connection leaves files out and the
   install still succeeds (one missing file is no reason to refuse a good
   build). Until B5 the only trace was a console warning and a DiagnosticLog
   line: the app looked healthy until a book would not open on a plane.

   start() runs once per page load: when the worker is active it waits
   START_DELAY_MS (past the boot's own toasts) and asks CHECK_OFFLINE. The
   worker answers from its caches, not from a record of what an install
   believed it did. retry() asks REPAIR_OFFLINE, which fetches ONLY the
   missing files and answers with a fresh read of the caches, so the banner
   says "complete" only when every file really is there. No answer (an
   older worker without these messages, a timeout) is "unknown" at start
   and "still incomplete" after a retry: never a false "complete".

   phase: unknown | complete | incomplete | retrying | fixed | still
   ═══════════════════════════════════════════════════════════════════════ */

export const START_DELAY_MS = 9000;
export const FIXED_SHOW_MS = 4000;
const CHECK_TIMEOUT_MS = 10000;
const REPAIR_TIMEOUT_MS = 180000;

/** @typedef {{ phase: string, missing: number }} OfflineState */

/** @type {OfflineState} */
let _state = { phase: 'unknown', missing: 0 };
let _dismissed = false;
let _started = false;
let _version = 0;
/** @type {Set<() => void>} */
const _listeners = new Set();
/** @type {() => any} */
let _getWorker = () => null;

/** @param {OfflineState} next */
function _set(next) {
  _state = next;
  _version += 1;
  _listeners.forEach((cb) => { try { cb(); } catch (_e) { /* a subscriber must not break the others */ } });
}

/**
 * Ask a worker one question over a MessageChannel.
 * @param {any} worker
 * @param {string} type
 * @param {number} timeoutMs
 * @returns {Promise<{ missing: string[], complete: boolean } | null>} null = no usable answer
 */
export function askWorker(worker, type, timeoutMs) {
  return new Promise((resolve) => {
    if (!worker || typeof worker.postMessage !== 'function' || typeof MessageChannel === 'undefined') {
      resolve(null);
      return;
    }
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      const d = e && e.data;
      // Trust only a well-formed, self-consistent reply. A worker that could not
      // read its caches answers with `error` set: that is "unknown", not a status.
      const ok = d && d.type === 'OFFLINE_STATUS' && !d.error && Array.isArray(d.missing)
        && typeof d.complete === 'boolean' && d.complete === (d.missing.length === 0);
      resolve(ok ? d : null);
    };
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch (_e) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export const OfflineLibrary = {
  /** @param {() => void} cb */
  subscribe(cb) { _listeners.add(cb); return () => { _listeners.delete(cb); }; },
  getVersion() { return _version; },
  /** @returns {OfflineState} what the banner should show ('dismissed' hides it) */
  getState() {
    if (_dismissed && (_state.phase === 'incomplete' || _state.phase === 'still')) {
      return { phase: 'dismissed', missing: _state.missing };
    }
    return _state;
  },
  dismiss() { _dismissed = true; _set({ ..._state }); },

  /**
   * Ask the worker once. Resolves the phase it landed in.
   * @param {() => any} getWorker
   * @param {number} [timeoutMs]
   */
  check(getWorker, timeoutMs) {
    _getWorker = getWorker;
    return askWorker(getWorker(), 'CHECK_OFFLINE', timeoutMs || CHECK_TIMEOUT_MS).then((status) => {
      if (!status) _set({ phase: 'unknown', missing: 0 });
      else if (status.complete) _set({ phase: 'complete', missing: 0 });
      else _set({ phase: 'incomplete', missing: status.missing.length });
      return _state.phase;
    });
  },

  /** Fetch only the missing files; "fixed" only on a worker's fresh read of a complete library. */
  retry(timeoutMs) {
    const before = _state.missing;
    _dismissed = false;
    _set({ phase: 'retrying', missing: before });
    return askWorker(_getWorker(), 'REPAIR_OFFLINE', timeoutMs || REPAIR_TIMEOUT_MS).then((status) => {
      if (status && status.complete) {
        _set({ phase: 'fixed', missing: 0 });
        setTimeout(() => { if (_state.phase === 'fixed') _set({ phase: 'complete', missing: 0 }); }, FIXED_SHOW_MS);
      } else {
        _set({ phase: 'still', missing: status ? status.missing.length : before });
      }
      return _state.phase;
    });
  },

  /**
   * Once per page load: wait for an active worker, let the boot's toasts
   * pass, then check. A page without service workers (the Android
   * WebView, which bundles every file in the APK) never asks.
   */
  start() {
    if (_started) return;
    _started = true;
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    if (typeof PlatformBridge !== 'undefined' && PlatformBridge && PlatformBridge.isAndroid) return;
    const ready = navigator.serviceWorker.ready;
    if (!ready || typeof ready.then !== 'function') return;
    ready.then((reg) => {
      setTimeout(() => { OfflineLibrary.check(() => reg && reg.active); }, START_DELAY_MS);
    }, () => { /* no worker: nothing to report */ });
  },

  /** TEST-ONLY. */
  _reset() {
    _state = { phase: 'unknown', missing: 0 };
    _dismissed = false;
    _started = false;
    _getWorker = () => null;
    _version += 1;
    _listeners.clear();
  },
};
