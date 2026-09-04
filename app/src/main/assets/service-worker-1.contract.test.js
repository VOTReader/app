// @ts-nocheck
/* RED — service-worker-1 (Verifier reproduction, 2026-09-03)
   ─────────────────────────────────────────────────────────────────────────
   A VISIBLE reader, past the 12 s boot grace, is deliberately NOT reloaded
   when a new service worker activates (sw-register.js: toast, then reload on
   the next backgrounding). The new worker has already claim()ed the page and
   deleted vot-core-OLD. The page keeps running the OLD eager bundles it parsed
   at boot — and its lazy loaders (index.html's __makeLazyLoader) will inject
   whatever the NEW worker serves: bundle-e / bundle-f / a corpus bundle from
   the NEW build, into a page whose bundle-a..d are the OLD build. Nothing in
   the loader checks the build identity before appending the script tag.

   Codex's unit (codex-repros 5f175b9e) asserted an immediate reload on
   controllerchange while visible. That is the behaviour the 2026-08-11
   UPDATE-READY change removed on purpose, and the finding's fix keeps the
   toast; the test would stay RED after the recommended fix, so it is NOT
   adopted. This one pins the contract the fix has to meet, mechanism-free:

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

  it('RED: after controllerchange (toast path, page kept), a lazy load must reload or refuse — never inject the NEW build into the OLD page', async () => {
    installIndexLoaders();
    registerServiceWorker();
    await vi.advanceTimersByTimeAsync(13000);         // past BOOT_GRACE_MS, page visible

    // The new worker installed, skipWaiting()ed, claim()ed this page and
    // deleted vot-core-OLD. sw-register shows the toast and keeps the page.
    sw.controller = fakeController('v1.02-NEW');
    for (const cb of listeners.controllerchange || []) cb();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('vot-toast-update'), 'the update toast is the designed visible-path behaviour').not.toBeNull();
    expect(reload).not.toHaveBeenCalled();

    // The reader taps Settings / Search / the Garden: bundle-e is lazy.
    window.__loadScreensE().catch(() => {});
    await vi.advanceTimersByTimeAsync(4000);          // longer than the GET_VERSION ask timeout

    const injected = injectedLazyScripts();
    const mixed = injected.includes('dist/bundle-e.js') && reload.mock.calls.length === 0;
    expect(mixed, 'bundle-e from the NEW build was injected into a page still running the OLD bundle-a..d, with no reload').toBe(false);
  });
});
