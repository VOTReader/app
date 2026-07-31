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
 *   2. 'controllerchange' fires here → we reload the page onto the new build,
 *      but ONLY for a page that already had a controller (see below).
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

  // SW-CLAIM: does this page ALREADY have a controller? Only a controlled page
  // can be looking at an older build, so only it needs the reload below. An
  // UNCONTROLLED page (first visit, or a hard reload that bypassed the SW)
  // fetched every asset straight from the network, so it is ALREADY newest —
  // and it gains a controller the moment the fresh SW's activate calls
  // clients.claim(), which fires 'controllerchange' just like a real update.
  // Reloading there is a pointless first-launch flash for users, and it
  // destroyed the smoke harness's execution context mid-walk (smoke:ci failed
  // all 3 attempts with "Execution context was destroyed"). Captured BEFORE
  // register() so claim() can't flip it first.
  const hadController = !!navigator.serviceWorker.controller;

  // When the new SW takes over, reload onto the new build.
  // Defer if the tab is hidden so we don't yank a backgrounded reader.
  let refreshing = false;
  const doReload = () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;   // first controller — nothing stale to reload onto
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
