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
import { DiagnosticLog } from './diagnostic-log.js';

const TOAST_ID = 'vot-toast-sw-update';
// P6pwa: track the SPECIFIC waiting worker we've prompted for, not a permanent
// boolean latch. A permanent latch meant a 2nd in-session update (the user
// ignored the first toast, then a NEWER SW installed) was never surfaced, and
// the stale toast still pointed at the now-superseded worker. Per-worker
// tracking re-prompts for a newer worker (replacing the toast) while deduping
// the same worker (so the hourly update poke doesn't re-toast).
let promptedWorker = null;

export function registerServiceWorker() {
  if (PlatformBridge.isAndroid) return;
  if (!('serviceWorker' in navigator)) return;

  // When the waiting SW activates (after the user opts in), it takes
  // control and 'controllerchange' fires — reload once onto the new build.
  // P7pwa: 'controllerchange' fires in ALL controlled clients, so updating in
  // one foreground tab would also yank every BACKGROUND tab. If THIS tab is
  // hidden when control changes, defer its reload to the next time it becomes
  // visible (rather than reloading it out from under a backgrounded reader).
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

    // (U18) An idle tab otherwise NEVER re-checks for a new SW — it only looks
    // once, here at startup — so a long-lived tab would never surface the
    // "update available" toast. Poll hourly + whenever the tab regains focus.
    // reg.update() is a no-op when nothing changed; on a real change it kicks
    // the install→waiting→updatefound flow above, which then prompts. Failures
    // (offline / transient) are swallowed — best-effort.
    const pokeUpdate = () => { try { reg.update(); } catch (_e) { /* non-fatal */ } };
    setInterval(pokeUpdate, 60 * 60 * 1000); // hourly
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

// Show the persistent "update available" toast. Tapping it tells the
// waiting SW to activate; the controllerchange listener handles the reload.
function promptUpdate(worker) {
  if (promptedWorker === worker) return;
  promptedWorker = worker;
  const prior = document.getElementById(TOAST_ID);
  if (prior) prior.remove(); // it pointed at a now-superseded worker
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
