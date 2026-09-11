// @ts-nocheck
/* RED — service-worker-1 (Verifier reproduction, 2026-09-03)
   ─────────────────────────────────────────────────────────────────────────
   As found (2026-09-03): a VISIBLE reader past the 12 s boot grace was
   deliberately NOT reloaded when a new service worker activated (sw-register:
   toast, then reload on the next backgrounding). The new worker had already
   claim()ed the page and deleted vot-core-OLD, so the page kept running the OLD
   eager bundles it parsed at boot while its lazy loaders (index.html's
   __makeLazyLoader) would inject whatever the NEW worker served: bundle-e /
   bundle-f / a corpus bundle from the NEW build into a page whose bundle-a..d
   were the OLD build. The fix set window.__votSwTookOver at takeover and taught
   the loader to reload rather than append.

   Since 2026-09-10 (Corbin: "toast and update should happen no matter what
   screen user happens to be on") a controlled page reloads AT ONCE on
   controllerchange; the update-ready toast and the visible-page wait are gone,
   and "VOTReader was just updated." is shown by the boot after the reload
   (utils/update-toast.js). The mixed-build window shrank from "until the reader
   backgrounds the app" to "between reload() and the unload", and it did not
   close: a lazy load in that gap still fetches NEW bytes into the OLD page, so
   the takeover flag is still set before the reload and the loader still refuses.
   The case below pins that contract on the path that exists now:

   CONTRACT: once a new worker controls a page that was not reloaded onto it,
   a lazy load must not inject a script from the new build into the old page.
   It either reloads the page or refuses to append — never both a stale eager
   build and a fresh lazy one. (index.html's loader script is evaluated here
   verbatim, the way the page runs it; the worker is faked at the
   navigator.serviceWorker seam and answers GET_VERSION like the real one.)

   The end-to-end reproduction on the Pages simulator (real SW, real caches,
   old/new builds) is the before/after proof for this id; this is the
   committed RED that fails today and will fail again if the guard regresses. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerServiceWorker } from './src/utils/sw-register.js';

const INDEX = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './index.html'), 'utf8');

/** index.html's inline lazy-loader factory + the IIFE that builds the app's
    loaders (bible / matthew / vot / screens-e / screens-f), evaluated as the
    page evaluates it. */
function installIndexLoaders() {
  const m = INDEX.match(/<script>\s*(window\.__makeLazyLoader = function[\s\S]*?)<\/script>/);
  if (!m) throw new Error('could not find the __makeLazyLoader script in index.html');
  new Function(m[1])();
}

/** A controller that answers GET_VERSION with a fixed cacheVersion, over the
    MessageChannel port the page supplies (the real worker's reply path). */
function fakeController(cacheVersion) {
  return {
    cacheVersion,
    postMessage(msg, transfer) {
      if (msg && msg.type === 'GET_VERSION' && transfer && transfer[0]) {
        transfer[0].postMessage({ type: 'VERSION', cacheVersion, corpusVersion: 'c42' });
      }
    },
  };
}

let sw;
let listeners;
let reload;
let saved;

beforeEach(() => {
  vi.useFakeTimers();
  listeners = {};
  reload = vi.fn();
  saved = {
    sw: Object.getOwnPropertyDescriptor(navigator, 'serviceWorker'),
    location: Object.getOwnPropertyDescriptor(window, 'location'),
    vis: Object.getOwnPropertyDescriptor(document, 'visibilityState'),
  };
  sw = {
    controller: fakeController('v1.0.2-OLD'),
    addEventListener(type, cb) { (listeners[type] = listeners[type] || []).push(cb); },
    removeEventListener() {},
    register: () => Promise.resolve({ waiting: null, installing: null, addEventListener() {}, update() {} }),
  };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
  Object.defineProperty(window, 'location', { configurable: true, value: { reload, href: 'http://localhost/index.html' } });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of ['__makeLazyLoader', '__bibleCorpus', '__loadBibleCorpus', '__matthewCorpus', '__loadMatthewCorpus', '__votCorpus', '__loadVotCorpus', '__screensE', '__loadScreensE', '__screensF', '__loadScreensF']) delete window[k];
  if (saved.sw) Object.defineProperty(navigator, 'serviceWorker', saved.sw); else delete navigator.serviceWorker;
  if (saved.location) Object.defineProperty(window, 'location', saved.location);
  if (saved.vis) Object.defineProperty(document, 'visibilityState', saved.vis); else delete document.visibilityState;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

const injectedLazyScripts = () => [...document.head.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));

describe('service-worker-1 — a visible reader on old eager bundles after a new worker claims the page', () => {
  it('CONTROL: with the boot-time controller still in charge, a lazy load injects the script (no reload)', async () => {
    installIndexLoaders();
    registerServiceWorker();
    await vi.advanceTimersByTimeAsync(13000);
    window.__loadScreensE().catch(() => {});          // jsdom never fires onload; fine
    await vi.advanceTimersByTimeAsync(0);
    expect(injectedLazyScripts()).toEqual(['dist/bundle-e.js']);
    expect(reload).not.toHaveBeenCalled();
  });

  it('RED: after controllerchange (a prior controller) the page reloads at once, and a lazy load racing that reload REFUSES — never inject the NEW build into the OLD page', async () => {
    installIndexLoaders();
    registerServiceWorker();
    await vi.advanceTimersByTimeAsync(13000);         // long past boot, page visible: no longer a reason to wait

    // The new worker installed, skipWaiting()ed, claim()ed this page and
    // deleted vot-core-OLD. sw-register reloads wherever the reader is.
    sw.controller = fakeController('v1.02-NEW');
    for (const cb of listeners.controllerchange || []) cb();
    await vi.advanceTimersByTimeAsync(0);
    expect(reload, 'a controlled page reloads at once when a new worker takes over, visible or not').toHaveBeenCalledTimes(1);

    // The reader taps Settings / Search / the Garden in the gap between
    // reload() and the unload: bundle-e is lazy, and every byte of it would
    // now come from the NEW build. The loader must refuse to append it.
    window.__loadScreensE().catch(() => {});
    await vi.advanceTimersByTimeAsync(4000);          // longer than the GET_VERSION ask timeout
    expect(injectedLazyScripts(), 'bundle-e from the NEW build was injected into a page still running the OLD bundle-a..d: '
      + 'the takeover flag (window.__votSwTookOver) is what makes the loader refuse in that gap').not.toContain('dist/bundle-e.js');
  });
});
