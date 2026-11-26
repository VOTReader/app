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
 *   2. A new build downloads in the background and TAKES OVER THE MOMENT IT
 *      HAS INSTALLED: the worker skips waiting by itself (service-worker.js)
 *      and claims every open page. Nothing makes it wait: not a reader in the
 *      middle of a read, not a recording playing. Corbin 2026-11-20: "Make
 *      sure updates are actually pushing ... there's no reason users should be
 *      outdated", and of those two reasons to wait: "neither of those should
 *      make the update wait. Clearly we're having issues pushing updates."
 *      History: from 2026-10-23 (up1) a new build waited for the next open or
 *      for 10+ minutes away, so every open ran the build the PREVIOUS open had
 *      downloaded, and a reader back after weeks read weeks-old code for that
 *      whole visit. What bounds the reloads now is the publish schedule (two
 *      windows a day), not the client.
 *   3. 'controllerchange' fires here → we reload the page onto the new build,
 *      wherever the reader is, except at the first claim of a page its own
 *      build loaded (SW-CLAIM below). The app's own state restore (screen,
 *      scroll, playback position) carries them across, and update-toast.js
 *      says what changed. One thing holds the RELOAD, never the takeover: a
 *      note being typed, a voice memo or a backup import (update-hold.js). It
 *      would be lost, so the page reloads the moment it is saved or closed.
 *   4. A worker found WAITING (one installed by a build from the up1 weeks, or
 *      one whose own skipWaiting failed) is asked to take over wherever this
 *      page sees it: at registration, when a build finishes installing, when
 *      the app comes back on screen, and on ANOTHER_BUILD.
 */

import { PlatformBridge } from './platform-bridge.js';
import { DiagnosticLog } from './diagnostic-log.js';
import { showToast } from './toast.js';
import { markUpdateReload } from './update-toast.js';
import { onIdle } from './on-idle.js';
import { bulkDownloadsOk } from './metered-link.js';
import { updateHolds, whenUpdateUnheld } from './update-hold.js';
import { registeredStores } from '../stores/cached-store.js';

/** After the last hold lets go: long enough for the closing save's effects to issue their writes. */
const HOLD_SETTLE_MS = 400;
/** The most a held reload waits for those writes to land. */
const HOLD_WRITES_CAP_MS = 3000;

/** Every store's newest write has landed or failed, or the cap passed. Never rejects. */
function _writesLanded() {
  /** @type {Promise<any>[]} */ let waits = [];
  try { waits = registeredStores().map((s) => s.whenSaved()); } catch (_e) { /* no stores: nothing to wait for */ }
  return Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, HOLD_WRITES_CAP_MS))]).catch(() => {});
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
  //
  // ONLY THAT FIRST CLAIM (sweep W26, 2026-10-13). This was a const read once,
  // so every later change was skipped too: a first-visit tab left open across a
  // deploy kept the old build while its lazy loads came from the new one. The
  // controller is followed instead, and only a change FROM none is skipped,
  // and only when it is the page's own build claiming it: a HARD RELOAD loads
  // uncontrolled while a worker is already active (activeAtLoad), so the first
  // claim it sees is the next build's, and that one reloads like any other.
  const controllerAtRegistration = navigator.serviceWorker.controller;
  let controllerNow = controllerAtRegistration;
  /** @type {ServiceWorker | null} */ let activeAtLoad = null;

  // RELOAD WHEREVER THE READER IS (Corbin, 2026-09-10). This used to defer a
  // visible mid-session reload until the app was backgrounded, or offer a
  // "Reload" toast. Both are gone: the reload is immediate and the app's own
  // state restore is the safety. The takeover flag STAYS: reload() does not
  // unload the page in the same tick, and a lazy load in that gap would fetch
  // NEW bytes into the OLD page (service-worker-1); index.html's loader reads
  // the flag and refuses to append. Set before the reload, never after.
  //
  // THE RELOAD IS OURS, so the restore record is written before it rather than
  // left to the debounces that serve crashes and tab kills. One window event,
  // dispatched synchronously: useScrollMemory answers with the live scroller's
  // position through the persist flush, the audio player with the element's
  // exact clock. Corbin: "land reader back exactly where they were" — exactly,
  // not as of the last 120 ms + 250 ms debounce or the last 5 s snapshot.
  //
  // THE HOLD (ds2, 2026-10-13): a note being typed, a voice memo or a backup
  // import cannot ride the reload (utils/update-hold.js). While one is open the
  // reload waits; the flag is still set at once, so a lazy load in the wait
  // reloads rather than mixing builds. When the last hold lets go, the save
  // that closed it is often still in flight (Save closes the note sheet in the
  // same commit), so the reload waits a beat and for the stores' writes to land.
  let refreshing = false;
  const reloadNow = () => {
    // The document that follows toasts on this, not on the profile's last-seen key
    // (update-toast.js): the reload is the evidence, and it is this tab's own.
    markUpdateReload();
    try { window.dispatchEvent(new Event('vot:before-update-reload')); } catch (_e) { /* a listener's throw must not stop the reload */ }
    window.location.reload();
  };
  const reloadWhenUnheld = () => whenUpdateUnheld(() => {
    setTimeout(() => {
      if (updateHolds().length) { reloadWhenUnheld(); return; }
      void _writesLanded().then(() => {
        if (updateHolds().length) { reloadWhenUnheld(); return; }
        reloadNow();
      });
    }, HOLD_SETTLE_MS);
  });
  const doReload = () => {
    if (refreshing) return;
    refreshing = true;
    window.__votSwTookOver = true;
    const held = updateHolds();
    if (!held.length) { reloadNow(); return; }
    DiagnosticLog.warn('sw', 'update reload waits for: ' + held.join(', '));
    reloadWhenUnheld();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const from = controllerNow;
    controllerNow = navigator.serviceWorker.controller;
    // first controller, and the build the page loaded: nothing stale to reload onto
    if (!from && (!activeAtLoad || controllerNow === activeAtLoad)) return;
    doReload();
  });
  // THE EARLY CLAIM (w-toast-reload-flag, 2026-09-11). index.html captures the
  // controller at document start, before any bundle runs. If it is not the one
  // controlling the page now, a new worker claimed this document while its own
  // scripts were still parsing: the controllerchange that announced it fired with
  // nobody listening, and this page is running the OLD build under the NEW worker.
  // Reload onto it now, through the same door, so the flag and the restore go along.
  // Only a worker-to-worker change counts: none-to-worker is the first visit's claim
  // (SW-CLAIM above), and a document without the capture is left alone. The compare
  // is by identity — the container hands out one ServiceWorker object per worker per
  // document — and every plain boot reads EQUAL here, or every boot would reload
  // (the sibling bench's anti-loop control, tools/e2e-update-siblings.mjs).
  const controllerAtStart = /** @type {any} */ (window).__votController0;
  if (controllerAtStart && controllerAtRegistration && controllerAtStart !== controllerAtRegistration) doReload();

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
  // BUSY: a worker installed by a build from the up1 weeks (10-23 to 11-20) asks this of the other windows before
  // it takes over, and waits on a yes. Nothing makes an update wait now, so the answer is always no.
  // ANOTHER_BUILD: this page asked for something its build cannot give it (W27: another build's code or timings
  // on the network); the waiting build is what it needs (onAnotherBuild, set once the registration is known).
  /** @type {() => void} */ let onAnotherBuild = () => { anotherBuildSeen = true; };
  let anotherBuildSeen = false;
  navigator.serviceWorker.addEventListener('message', (event) => {
    const d = event && event.data;
    if (d && d.type === 'BUSY') {
      const port = event.ports && event.ports[0];
      if (port) { try { port.postMessage({ busy: false }); } catch (_e) { /* the worker gave up */ } }
      return;
    }
    if (d && d.type === 'ANOTHER_BUILD') { onAnotherBuild(); return; }
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
    // The worker already active while this page is uncontrolled (a hard reload): see SW-CLAIM above.
    if (!controllerNow) activeAtLoad = reg.active || null;
    // NOTHING MAKES AN UPDATE WAIT (Corbin 2026-11-20; the header, step 2). A new worker skips waiting by itself
    // the moment it has installed. One can still be found waiting (step 4): wherever this page sees it, it asks.
    const takeWaiting = () => { const w = reg.waiting; if (w) w.postMessage({ type: 'SKIP_WAITING' }); };
    takeWaiting();
    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        if (incoming.state === 'installed') incoming.postMessage({ type: 'SKIP_WAITING' });
      });
    });
    // W27: something the reader asked for did not load (another build's code or timings: the worker's 503). A
    // build already waiting is what it needs; one still installing takes over by itself when it is done.
    onAnotherBuild = takeWaiting;
    if (anotherBuildSeen) takeWaiting();

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
        if (document.visibilityState === 'visible') { takeWaiting(); pokeUpdate(); }
      });
    }
    warmMeaningSearch();
  }).catch((err) => {
    console.warn('SW registration failed', err);
    DiagnosticLog.warn('sw', 'registration failed: ' + ((err && err.message) || err));
  });
}

/* MEANING SEARCH, ONE BACKGROUND DOWNLOAD (path to 500, 2026-10-05). The on-device meaning
   search (src/search/semantic.js) runs a model of ~70 MB with its runtime and passage vectors.
   On the web they come once, a minute after the app is up and the page is idle, through the
   service worker's vot-semantic-v1 cache, where they stay: Search has them offline from its
   first use, with no setting and no account. On Data Saver, mobile data or a phone that cannot
   tell (download-gate bulkDownloadsOk, platform-2 2026-11-26) neither this warm-up nor the launch
   build's start (engine.js startMeaningWhenIdle) runs: the first Search fetches them. A file already stored is not asked for, so a later boot costs one manifest.
   ONLY THROUGH THE WORKER (sweep W35, 2026-10-13): a page it does not control (the first visit
   before its claim, a hard reload) read ~55 MB the worker never saw, and the worker fetched them
   all again later. Such a page warms when the worker takes it over, or not at all. */
const WARM_AFTER_MS = 60 * 1000;
const SEMANTIC_STORE = 'vot-semantic-v1';
export function warmMeaningSearch() {
  if (!bulkDownloadsOk()) return;
  const warm = () => onIdle(() => { void warmMeaningFiles(); }, { timeout: 30000, fallbackDelay: 1000 });
  setTimeout(() => {
    const sw = navigator.serviceWorker;
    if (!sw || !bulkDownloadsOk()) return; // the link can change in the minute
    if (sw.controller) warm();
    else sw.addEventListener('controllerchange', warm, { once: true });
  }, WARM_AFTER_MS);
}

export async function warmMeaningFiles() {
  try {
    if (navigator.onLine === false) return;
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    // Search is loading them now (bundle-d's engine): a second download of the same files would run beside it (web-platform-n1)
    const search = /** @type {any} */ (window).VotSearchMini;
    const meaning = search && typeof search.meaningStatus === 'function' ? search.meaningStatus() : null;
    if (meaning && meaning.status === 'loading') return;
    const base = new URL('./semantic/', document.baseURI);
    const r = await fetch(new URL('manifest.json', base));
    if (!r.ok) return;
    const man = await r.json();
    /** @type {Cache|null} */ let store = null;
    try { store = typeof caches !== 'undefined' ? await caches.open(SEMANTIC_STORE) : null; } catch (_e) { /* no store to ask */ }
    for (const f of (man && man.files) || []) {
      const url = new URL(f, base);
      // stored already: the worker answers it from there, and reading it through re-read ~55 MB every boot
      if (store && await store.match(String(url)).catch(() => undefined)) continue;
      const res = await fetch(url);
      if (res.ok) await res.blob(); // read through: the worker stores what passes
    }
  } catch (_e) { /* offline or refused: Search fetches them when it first needs them */ }
}
