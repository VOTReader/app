/**
 * Service worker registration — web only.
 *
 * Called once at app startup from _entry-b.js. Gated behind
 * PlatformBridge.isAndroid so the SW never registers inside the Android
 * WebView (assets are bundled in the APK; a SW would double-cache).
 *
 * Update lifecycle (fully automatic — no user prompt):
 *   1. register() runs on every app open — a PWA launch IS a fresh navigation —
 *      and register() itself performs an update check, so "check on every
 *      open" needs no extra machinery. updateViaCache:'none' makes that
 *      explicit (the 'imports' default already bypasses the HTTP cache for the
 *      top-level script; 'none' also covers any future importScripts and any
 *      browser that reads the default loosely).
 *   2. The SW calls self.skipWaiting() on install, so a new SW takes over
 *      immediately rather than waiting for all tabs to close.
 *   3. 'controllerchange' fires here → we reload the page UNCONDITIONALLY and
 *      IMMEDIATELY, but ONLY for a page that already had a controller (see
 *      SW-CLAIM below). This used to defer a VISIBLE reader's reload until the
 *      tab backgrounded (a toast offered a manual reload meanwhile), so as not
 *      to yank them out of what they were reading. That left an unbounded
 *      window open: clients.claim() had already handed the page to the NEW
 *      worker and deleted the OLD core cache, but the page kept running the
 *      OLD eager bundles (bundle-a/b/c/d) it had already parsed — and any LAZY
 *      bundle loaded in that window (Bible/Settings/Search/Garden/Scripture
 *      Web) would be the NEW build's code running against the OLD build's
 *      already-parsed globals: a silent mixed-build state an owner could sit
 *      on for as long as he kept reading (service-worker-1, 2026-09-04). Build
 *      correctness now wins over reading continuity.
 *   4. Belt-and-suspenders: if a SW is already waiting when we register
 *      (installed during a prior visit before this code ran), we post
 *      SKIP_WAITING immediately so it activates rather than sitting idle.
 */

import { PlatformBridge } from './platform-bridge.js';
import { DiagnosticLog } from './diagnostic-log.js';
import { showToast } from './toast.js';

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

  let refreshing = false;
  const doReload = () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  };
  // service-worker-1 (2026-09-04): reload UNCONDITIONALLY on takeover, visible
  // or backgrounded. A controllerchange event means the controller already
  // changed — waiting for the tab to background first (the old INVISIBLE-RELOAD
  // / UPDATE-READY behavior) only grew the window in which this page's already-
  // parsed OLD eager bundles could run under the NEW worker. See the module
  // header for the full mixed-build hazard this closes.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;   // first controller — nothing stale to reload onto
    doReload();
  });

  // service-worker-4 (2026-09-04): the install's corpus precache is
  // best-effort (a miss must not fail the install), but a miss used to leave
  // no trace anywhere the owner could see — corpusFirst's miss branch would
  // only 503 much later, offline, with nothing pointing back at install time.
  // Record it so Settings' diagnostic export has a trace.
  //
  // service-worker-5 (2026-09-04): a REFUSED install (ASSET_INTEGRITY disagrees
  // with the published bundles — a partially purged edge, a truncated upload)
  // pins every client on the previous build forever, with no signal reaching
  // the page at all — the s12 lesson again ("new work committed, nothing
  // changing on screen"). Record it AND show a toast naming the asset, since
  // the SW console is unreachable on a phone.
  navigator.serviceWorker.addEventListener('message', (event) => {
    const d = event && event.data;
    if (d && d.type === 'PRECACHE_INCOMPLETE') {
      DiagnosticLog.warn('sw', 'corpus precache incomplete at install: '
        + d.count + ' file(s) not cached: ' + (Array.isArray(d.urls) ? d.urls.join(', ') : ''));
    } else if (d && d.type === 'INSTALL_REFUSED') {
      DiagnosticLog.error('sw', 'install refused: ' + (d.message || ('integrity check failed for ' + d.url))
        + (d.expected ? (' (expected ' + d.expected + ', got ' + d.actual + ')') : ''));
      showToast({
        id: 'vot-toast-sw-refused',
        className: 'vot-toast',
        text: 'A new version failed to install (' + (d.url || 'unknown asset')
          + '). Still running the current version.',
        ariaLive: 'assertive',
        durationMs: 6000,
      });
    }
  });

  // updateViaCache:'none' — never serve service-worker.js itself out of the
  // HTTP cache. GitHub Pages sends max-age=600 on everything, so this is the
  // difference between "checked for an update" and "reused a 10-minute-old
  // copy, found it identical, skipped the update".
  navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).then((reg) => {
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
    // reg.update() REJECTS offline; unhandled, that rejection lands in
    // index.html's unhandledrejection handler every hour and every tab-focus
    // on a plane, filling the diagnostic ring with noise.
    const pokeUpdate = () => {
      try {
        const p = reg.update();
        if (p && typeof p.catch === 'function') p.catch(() => { /* offline — non-fatal */ });
      } catch (_e) { /* non-fatal */ }
    };
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
