/**
 * Service worker registration — web only.
 *
 * Called once at app startup from _entry-b.js. Gated behind
 * PlatformBridge.isAndroid so the SW never registers inside the Android
 * WebView (assets are bundled in the APK; a SW would double-cache).
 *
 * Update lifecycle (fully automatic — no user prompt):
 *   1. The SW calls self.skipWaiting() on install, so a new SW takes over
 *      immediately rather than waiting for all tabs to close.
 *   2. 'controllerchange' fires here → we reload the page onto the new build.
 *      Background tabs defer their reload until they become visible.
 *   3. Belt-and-suspenders: if a SW is already waiting when we register
 *      (installed during a prior visit before this code ran), we post
 *      SKIP_WAITING immediately so it activates rather than sitting idle.
 */

import { PlatformBridge } from './platform-bridge.js';
import { DiagnosticLog } from './diagnostic-log.js';

export function registerServiceWorker() {
  if (PlatformBridge.isAndroid) return;
  if (!('serviceWorker' in navigator)) return;

  // When the new SW takes over, reload onto the new build.
  // Defer if the tab is hidden so we don't yank a backgrounded reader.
  let refreshing = false;
  const doReload = () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      doReload();
      return;
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVis);
        doReload();
      }
    };
    document.addEventListener('visibilitychange', onVis);
  });

  navigator.serviceWorker.register('./service-worker.js').then((reg) => {
    // Belt-and-suspenders: a SW may already be waiting from a prior visit
    // (installed before skipWaiting was adopted). Kick it immediately.
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });

    // If a new SW installs during this session and somehow ends up waiting
    // (should not happen with skipWaiting on install, but handle it anyway).
    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        if (incoming.state === 'installed') {
          incoming.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    // Poll hourly + on tab-focus so long-lived tabs still catch updates.
    const pokeUpdate = () => { try { reg.update(); } catch (_e) { /* non-fatal */ } };
    setInterval(pokeUpdate, 60 * 60 * 1000);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') pokeUpdate();
      });
    }
  }).catch((err) => {
    console.warn('SW registration failed', err);
    DiagnosticLog.warn('sw', 'registration failed: ' + ((err && err.message) || err));
  });
}
