// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   download-gate — "Download only on Wi-Fi" (ra6, Corbin 2026-10-14, brief design-10)
   ═══════════════════════════════════════════════════════════════════════
   Settings > Listening > Download only on Wi-Fi, off by default. On, a recording or a kept song waits while the phone
   is on mobile data and goes on by itself once it is on Wi-Fi again; one already on its way stops and waits (its
   partial bytes are thrown away, so it starts again from the top on Wi-Fi).

   App pushes the setting here as it renders (screen-routes, as it does the Letter Voice): the stores are plain
   modules and never read React state. The phone app gates its own downloads (OfflineAudioStore: Android's metered
   network); this module hands it the switch over the bridge. In a browser only one that reports the connection's
   type can tell mobile data from Wi-Fi (Chrome on Android: navigator.connection.type 'cellular'); elsewhere
   (desktop, an iPhone) downloads go ahead, and the Settings row says so.
   ═══════════════════════════════════════════════════════════════════════ */

let _wifiOnly = false;
/** @type {Set<() => void>} */
const _listeners = new Set();
let _hooked = false;

/** @returns {any} the browser's NetworkInformation, or null */
function _connection() {
  if (typeof navigator === 'undefined') return null;
  const n = /** @type {any} */ (navigator);
  return n.connection || n.mozConnection || n.webkitConnection || null;
}

/** @returns {any} the phone app's bridge when it takes the switch, else null */
function _native() {
  const b = typeof window !== 'undefined' ? /** @type {any} */ (window).AndroidBridge : null;
  return b && typeof b.offlineAudioWifiOnly === 'function' ? b : null;
}

/** @returns {string} the connection's type as this browser reports it ('cellular', 'wifi', ...), or '' when it cannot tell */
export function networkType() {
  const c = _connection();
  return c && typeof c.type === 'string' ? c.type : '';
}

/* BULK DOWNLOADS NOBODY ASKED FOR (platform-2 + web-platform-n2, audit 2026-11-23). A first web visit pulled the
   meaning search's ~45 MB at launch and the next one ~14 MB of song covers, on Data Saver and on mobile data too.
   Such a download goes ahead only on a link that is not metered as far as the browser can tell: the phone app (its
   files are on board), Wi-Fi or Ethernet, or a desktop browser that reports no type. Data Saver, mobile data, and a
   phone that cannot tell (an iPhone) wait: the meaning files come with the first Search, the covers as they are seen. */
const MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod/i;
/** @returns {boolean} a large background download may start now */
export function bulkDownloadsOk() {
  if (typeof window !== 'undefined' && /** @type {any} */ (window).AndroidBridge) return true;
  const c = _connection();
  if (c && c.saveData) return false;
  const t = networkType();
  if (t) return t === 'wifi' || t === 'ethernet';
  if (typeof navigator === 'undefined') return true;
  const hint = /** @type {any} */ (navigator).userAgentData;
  if (hint && typeof hint.mobile === 'boolean') return !hint.mobile;
  return !MOBILE_UA.test(String(navigator.userAgent || ''));
}

/** @returns {boolean} the phone app (it tells for itself), or a browser that reports the connection's type */
export function canTell() {
  return !!_native() || networkType() !== '';
}

/** @returns {boolean} the switch is on */
export function wifiOnly() {
  return _wifiOnly;
}

/** @returns {boolean} a browser download waits now: the switch is on and the browser says it is on mobile data */
export function downloadsWait() {
  return _wifiOnly && networkType() === 'cellular';
}

function _fire() {
  for (const cb of [..._listeners]) {
    try { cb(); } catch (e) { console.warn('[download-gate] listener threw', e); }
  }
}

/** The phone app has been told the switch since this page loaded (its store outlives a reload of the page). */
let _synced = false;

/**
 * The setting, idempotently (screen-routes calls this on every render). Anything but `true` is off.
 * @param {unknown} on
 */
export function setWifiOnly(on) {
  const next = on === true;
  const b = _native();
  if (next === _wifiOnly && (_synced || !b)) return;
  _wifiOnly = next;
  if (b) {
    _synced = true;
    try { b.offlineAudioWifiOnly(next); } catch (_e) { /* an older shell: its downloads never wait */ }
  }
  _fire();
}

/**
 * Called when the gate may have opened or closed: the switch changed, or the browser's connection changed.
 * @param {() => void} cb @returns {() => void} unsubscribe
 */
export function onGateChange(cb) {
  _listeners.add(cb);
  if (!_hooked) {
    const c = _connection();
    if (c && typeof c.addEventListener === 'function') {
      _hooked = true;
      c.addEventListener('change', _fire);
    }
  }
  return () => { _listeners.delete(cb); };
}

/** Tests only: back to the boot state. */
export function _resetDownloadGate() {
  const c = _connection();
  if (_hooked && c && typeof c.removeEventListener === 'function') c.removeEventListener('change', _fire);
  _hooked = false;
  _wifiOnly = false;
  _synced = false;
  _listeners.clear();
}
