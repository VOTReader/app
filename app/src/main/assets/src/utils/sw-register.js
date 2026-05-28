/**
 * Service worker registration — web only.
 *
 * Called once at app startup from _entry-b.js. Gated behind
 * PlatformBridge.isAndroid so the SW never registers inside the
 * Android WebView (which bundles all assets locally — a SW would
 * double-cache and create stale-content conflicts).
 *
 * Update lifecycle: when a new SW installs and activates, the
 * 'controllerchange' event fires. We surface an in-app toast so
 * the user can reload at their own pace. No skipWaiting — the user
 * controls timing.
 */

import { PlatformBridge } from './platform-bridge.js';
import { showToast } from './toast.js';

const TOAST_ID = 'vot-toast-sw-update';

export function registerServiceWorker() {
  if (PlatformBridge.isAndroid) return;
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./service-worker.js').catch((err) => {
    console.warn('SW registration failed', err);
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    showToast({
      id: TOAST_ID,
      html: 'New version available — <b>tap to update</b>',
      className: 'vot-toast-sw-update',
      durationMs: 0,
    });
    var el = document.getElementById(TOAST_ID);
    if (el) el.addEventListener('click', () => window.location.reload(), { once: true });
  });
}
