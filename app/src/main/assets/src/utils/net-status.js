// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   NetStatus — is the network there? (Corbin 2026-10-05: "Disable certain
   features when offline, listen, ai songs, etc")
   ═══════════════════════════════════════════════════════════════════════
   ONE store for the whole app, in bundle-d beside the player that consults
   it; the lazy bundles read it as the NetStatus global (a second bundled copy
   would be a second answer). Two signals:

     navigator.onLine === false   certainly offline (airplane mode, no signal)
     a request that just failed   navigator.onLine stays true on a dead Wi-Fi
                                  or a captive portal, so the app's OWN
                                  requests are the probe: a recording that
                                  failed at the network, a song catalog or
                                  lyrics fetch that threw. reportFailure().

   A failure counts until the browser fires 'online', a request succeeds
   (reportOk()), or RETRY_MS passes: then the features come back and the next
   real request asks again. No ping of our own (U21 removed the connectivity
   ping: zero egress), and an HTTP error is an answer from the network, never
   a failure here. */

/** How long one failed request keeps the network-only features off before they are offered again. */
export const RETRY_MS = 30000;

let _failed = false;
let _version = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let _timer = null;
let _wired = false;
/** @type {Set<() => void>} */
const _subs = new Set();

function _emit() {
  _version++;
  for (const cb of _subs) {
    try { cb(); } catch (e) { console.warn('[net] subscriber threw', e); }
  }
}

function _clearTimer() {
  if (_timer != null) { clearTimeout(_timer); _timer = null; }
}

function _wire() {
  if (_wired || typeof window === 'undefined') return;
  _wired = true;
  window.addEventListener('online', () => { _failed = false; _clearTimer(); _emit(); });
  window.addEventListener('offline', _emit);
}

/** @returns {boolean} the browser itself says there is no network */
function _browserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export const NetStatus = {
  /** @returns {boolean} true while network-only features should be off */
  isOffline() {
    return _browserOffline() || _failed;
  },
  /** A request failed at the network (not an HTTP status): off for RETRY_MS, or until 'online' or a success. */
  reportFailure() {
    _wire();
    const was = NetStatus.isOffline();
    _failed = true;
    _clearTimer();
    _timer = setTimeout(() => { _timer = null; _failed = false; _emit(); }, RETRY_MS);
    if (!was) _emit();
  },
  /** A network request succeeded: whatever an earlier failure said, the network is there. */
  reportOk() {
    if (!_failed) return;
    _failed = false;
    _clearTimer();
    _emit();
  },
  /** @param {() => void} cb @returns {() => void} */
  subscribe(cb) {
    _wire();
    _subs.add(cb);
    return () => { _subs.delete(cb); };
  },
  /** @returns {number} */
  getVersion() {
    return _version;
  },
  /** Tests only: forget every failure and timer. */
  _reset() {
    _failed = false;
    _clearTimer();
    _emit();
  },
};

/**
 * A fetch() that rejected (TypeError: the network, not an HTTP status) is a failure; an abort is not.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isNetworkError(err) {
  const name = err && typeof err === 'object' ? /** @type {any} */ (err).name : '';
  return name !== 'AbortError' && err instanceof TypeError;
}
