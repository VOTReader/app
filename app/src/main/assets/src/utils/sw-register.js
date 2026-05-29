/**
 * Service worker registration + one-tap update prompt — web only.
 *
 * Called once at app startup from _entry-b.js. Gated behind
 * PlatformBridge.isAndroid so the SW never registers inside the Android
 * WebView (assets are bundled in the APK; a SW would double-cache).
 *
 * Update lifecycle (no skipWaiting on install — the user controls timing):
 *   1. A new SW installs in the background and goes to "waiting".
 *   2. We detect the waiting worker (updatefound→statechange, plus
 *      registration.waiting for one that's already waiting from a prior
 *      visit) and ONLY prompt when there's already a controller — i.e. a
 *      genuine UPDATE, not the first install.
 *   3. The toast's tap posts { type: 'SKIP_WAITING' } to the waiting SW,
 *      which calls skipWaiting() → it activates → 'controllerchange' fires
 *      → we reload once onto the new version.
 *
 * This replaces the earlier controllerchange-only toast, which fired AFTER
 * the new SW had already taken over (so the update had effectively already
 * happened) and required a full close/reopen to activate at all.
 */

import { PlatformBridge } from './platform-bridge.js';
import { showToast } from './toast.js';

const TOAST_ID = 'vot-toast-sw-update';
let prompted = false;

export function registerServiceWorker() {
  if (PlatformBridge.isAndroid) return;
  if (!('serviceWorker' in navigator)) return;

  // When the waiting SW activates (after the user opts in), it takes
  // control and 'controllerchange' fires — reload once onto the new build.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./service-worker.js').then((reg) => {
    // A new SW may already be installed + waiting from a prior visit.
    if (reg.waiting && navigator.serviceWorker.controller) {
      promptUpdate(reg.waiting);
    }
    // A new SW started installing during this session — prompt once it
    // finishes installing, and only if a controller already exists (so we
    // don't prompt on the very first install).
    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
          promptUpdate(incoming);
        }
      });
    });
  }).catch((err) => {
    console.warn('SW registration failed', err);
  });
}

// Show the persistent "update available" toast. Tapping it tells the
// waiting SW to activate; the controllerchange listener handles the reload.
function promptUpdate(worker) {
  if (prompted) return;
  prompted = true;
  showToast({
    id: TOAST_ID,
    html: 'New version available — <b>tap to update</b>',
    className: 'vot-toast-sw-update',
    durationMs: 0,
  });
  const el = document.getElementById(TOAST_ID);
  if (el) {
    el.addEventListener('click', () => {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }, { once: true });
  }
}
