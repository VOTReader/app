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
 *   3. 'controllerchange' fires here → we reload the page onto the new build,
 *      but ONLY for a page that already had a controller (see below), and
 *      only at a moment the user cannot see it (see INVISIBLE-RELOAD).
 *   4. Belt-and-suspenders: if a SW is already waiting when we register
 *      (installed during a prior visit before this code ran), we post
 *      SKIP_WAITING immediately so it activates rather than sitting idle.
 */

import { PlatformBridge } from './platform-bridge.js';
import { DiagnosticLog } from './diagnostic-log.js';
import { showToast } from './toast.js';

/**
 * "A new version is ready — Reload" — offered to a reader who is mid-session and
 * VISIBLE when a new build activates.
 *
 * Reuses the tab-close undo toast's shape: .vot-toast-undo carries
 * pointer-events:auto (the base .vot-toast is pointer-events:none, so its button
 * would be untappable) and .vot-undo-btn styles the inline control. durationMs:0
 * means it stays until acted on — an update notice that fades after 3s is worse
 * than none, because it trains the reader to distrust it.
 *
 * The markup is TRUSTED STATIC only (SEC-2 in utils/toast.js): no dynamic string
 * is interpolated here, so opts.html is the correct channel.
 *
 * @param {() => void} onReload
 * @returns {void}
 */
function showUpdateReadyToast(onReload) {
  if (typeof document === 'undefined') return;
  showToast({
    id: 'vot-toast-update',
    className: 'vot-toast vot-toast-undo',
    html: 'A new version is ready. <button type="button" class="vot-undo-btn">Reload</button>',
    durationMs: 0,
    ariaLive: 'polite',
  });
  const el = document.getElementById('vot-toast-update');
  const btn = el && el.querySelector('.vot-undo-btn');
  if (btn) btn.addEventListener('click', onReload, { once: true });
}

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

  // INVISIBLE-RELOAD: a controllerchange reload is only invisible at two
  // moments — while the app is still booting (the user is looking at the
  // splash / first paint, so a reload reads as a slightly slower launch), or
  // while it is backgrounded. Reloading a VISIBLE mid-session reader yanks
  // them out of the letter they're reading, so that case waits for the next
  // background instead. If they never background it, nothing is lost: the SW
  // has already activated, so the next cold launch is a fresh navigation
  // through it and serves the new build with no reload at all.
  const BOOT_GRACE_MS = 12000;
  const startedAt = Date.now();   // registerServiceWorker runs once, at boot

  let refreshing = false;
  const doReload = () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;   // first controller — nothing stale to reload onto
    if (typeof document === 'undefined'
        || document.visibilityState === 'hidden'
        || Date.now() - startedAt < BOOT_GRACE_MS) {
      doReload();
      return;
    }
    // UPDATE-READY (2026-08-11): the deferred-until-backgrounded reload is kept as
    // the fallback, but it is no longer the ONLY path. A reader who keeps the app
    // open and visible used to sit on the old build with no way to know a new one
    // had already activated, and no way to ask for it — which is indistinguishable
    // from "the update never arrived", the exact ambiguity that made the stale-cache
    // problem so hard to diagnose. Offer the reload instead of only waiting for it.
    showUpdateReadyToast(doReload);
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        document.removeEventListener('visibilitychange', onHidden);
        doReload();
      }
    };
    document.addEventListener('visibilitychange', onHidden);
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
