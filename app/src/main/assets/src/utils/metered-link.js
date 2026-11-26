// @ts-check
/* metered-link — is this link one a large download may use? Stateless on purpose.
   Bundle b (sw-register's launch-time meaning download) and bundle d (download-gate, Search, Settings) both import
   this, and each gets its own copy: a module two bundles share must hold no state (tools/check-bundle-state.js).
   The Wi-Fi-only switch and its listeners stay in download-gate.js, which only bundle d imports. */

/** @returns {any} the browser's NetworkInformation, or null */
export function _connection() {
  if (typeof navigator === 'undefined') return null;
  const n = /** @type {any} */ (navigator);
  return n.connection || n.mozConnection || n.webkitConnection || null;
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

