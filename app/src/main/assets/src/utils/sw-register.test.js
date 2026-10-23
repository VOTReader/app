// @ts-nocheck — the capture gate reads index.html through node:fs, which has no types under this tsconfig; the sibling update-toast.test.js is nocheck for the same reason
/* sw-register tests — P7pwa visibility-gated controllerchange reload.
   ──────────────────────────────────────────────────────────────────
   Mocks navigator.serviceWorker (capturing the controllerchange handler),
   window.location, and document.visibilityState, then drives the handler in
   each visibility state. The existing service-worker.test.js covers the SW's
   own install/fetch logic and is untouched.

   jsdom's location.reload is non-configurable, so we replace window.location
   wholesale (the `location` property on window IS configurable) with a stub
   exposing only reload — all registerServiceWorker touches.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { registerServiceWorker } from './sw-register.js';
import { DiagnosticLog } from './diagnostic-log.js';
import { _resetToasts } from './toast.js';
import { UPDATE_RELOAD_FLAG } from './update-toast.js';
import { holdUpdateReload, _resetForTests as _resetHolds } from './update-hold.js';

// ds2: a held reload waits for the stores' writes; the cases below hand it their own.
const mockStores = vi.hoisted(() => ({ list: /** @type {any[]} */ ([]) }));
vi.mock('../stores/cached-store.js', async (importOriginal) => ({
  .../** @type {any} */ (await importOriginal()),
  registeredStores: () => mockStores.list,
}));

describe('registerServiceWorker — P7pwa visibility-gated reload', () => {
  let controllerChangeHandler;
  let reloadSpy;
  let origSW, origLocation, origVisibility;

  beforeEach(() => {
    controllerChangeHandler = null;
    reloadSpy = vi.fn();
    // The takeover flag lives on the shared window: a reload in an earlier case
    // leaves it set, and the ordering pin below would then read a leak as a pass.
    delete window.__votSwTookOver;
    const swMock = {
      controller: {}, // a controller exists → it's an UPDATE, not first install
      addEventListener: (type, cb) => { if (type === 'controllerchange') controllerChangeHandler = cb; },
      register: () => Promise.resolve({
        waiting: null, installing: null,
        addEventListener: () => {}, update: () => {},
      }),
    };
    origSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: swMock });
    origLocation = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', { configurable: true, value: { reload: reloadSpy } });
    origVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  });

  afterEach(() => {
    if (origSW) Object.defineProperty(navigator, 'serviceWorker', origSW);
    if (origLocation) Object.defineProperty(window, 'location', origLocation);
    if (origVisibility) Object.defineProperty(document, 'visibilityState', origVisibility);
    vi.restoreAllMocks();
  });

  function setVisibility(state) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  }

  it('reloads immediately during the boot window (invisible — still first paint)', () => {
    setVisibility('visible');
    registerServiceWorker();
    expect(typeof controllerChangeHandler).toBe('function');
    controllerChangeHandler();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('reloads immediately when the app is backgrounded (invisible)', () => {
    setVisibility('hidden');
    registerServiceWorker();
    controllerChangeHandler();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  /* INVISIBLE-RELOAD: past the boot window with the app in the foreground, the
     user is mid-letter — reloading there yanks them out. Wait for the next
     background instead; they come back to the new build. */
  it('reloads a mid-session VISIBLE page immediately — wherever the reader is (Corbin, 2026-09-10)', () => {
    // "toast and update should happen no matter what screen user happens to be
    // on." The visible-mid-session deferral (wait for backgrounding, or offer a
    // Reload toast) is gone; the app's own state restore across the reload is
    // the safety. No toast is offered. The takeover flag IS set, before the
    // reload: reload() does not unload the page in the same tick, and a lazy
    // load in that gap must refuse (service-worker-1.contract.test.js drives
    // the loader itself; this pins the flag's ordering).
    vi.useFakeTimers();
    try {
      setVisibility('visible');
      registerServiceWorker();
      vi.advanceTimersByTime(60_000);         // well past the old boot window
      let flagAtReload, eventsAtReload = -1, events = 0;
      const onBefore = () => { events += 1; };
      window.addEventListener('vot:before-update-reload', onBefore);
      reloadSpy.mockImplementationOnce(() => { flagAtReload = window.__votSwTookOver; eventsAtReload = events; });
      controllerChangeHandler();
      window.removeEventListener('vot:before-update-reload', onBefore);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(window.__votSwTookOver).toBe(true);
      expect(flagAtReload, 'the flag must be visible to a loader that runs before the reload lands').toBe(true);
      // The reload is ours, so the restore record is written synchronously first:
      // one window event, dispatched before reload(), that the scroll memory and
      // the audio player answer inline (Corbin: "land reader back exactly where
      // they were" — exactly, not "as of the last debounce").
      expect(events, 'vot:before-update-reload fires exactly once').toBe(1);
      expect(eventsAtReload, 'and it fires BEFORE location.reload()').toBe(1);
      expect(document.getElementById('vot-toast-update')).toBeNull();
    } finally {
      vi.useRealTimers();
      delete window.__votSwTookOver;
    }
  });

  it('does not double-reload on a second controllerchange', () => {
    setVisibility('visible');
    registerServiceWorker();
    controllerChangeHandler();
    controllerChangeHandler();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  /* SW-CLAIM (2026-07-30): the SW's activate calls clients.claim(), which gives
     an UNCONTROLLED page a controller — firing controllerchange on a page that
     is already newest. Reloading there is a spurious first-launch reload for
     users, and it broke smoke:ci outright (all 3 attempts died with "Execution
     context was destroyed, most likely because of a navigation"). */
  it('does NOT reload when the page had no controller (first load + clients.claim)', () => {
    Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, value: null });
    setVisibility('visible');
    registerServiceWorker();
    controllerChangeHandler();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  /* W26 (sweep 2026-10-13): the first claim is skipped, and that used to be every change for the life of the
     tab: hadController was a const read once, so a first-visit tab left open across a deploy kept the old
     code while its lazy loads came from the new build. Only the change FROM no controller is skipped now. */
  it('a first-visit tab: no reload when its own worker claims it, a reload when the NEXT build takes over', async () => {
    const sw = navigator.serviceWorker;
    Object.defineProperty(sw, 'controller', { configurable: true, writable: true, value: null });
    setVisibility('visible');
    registerServiceWorker();
    await Promise.resolve(); await Promise.resolve();   // register() resolves with nothing active yet (installing)
    sw.controller = { id: 'A' };                         // A's activate claims the page: it is already A's build
    controllerChangeHandler();
    expect(reloadSpy).not.toHaveBeenCalled();
    sw.controller = { id: 'B' };                         // a deploy: B claims it
    controllerChangeHandler();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  /* A HARD RELOAD bypasses the worker: the page loads uncontrolled although a worker (A) is active, and the
     next worker's claim is the page's first. That page is A's build at best, so B's claim must reload it;
     only a first claim by the worker that was active when the page registered is A's own and skipped. */
  it('a hard-reloaded tab (a worker active, none controlling): the next build\'s first claim reloads it', async () => {
    const sw = navigator.serviceWorker;
    const A = { id: 'A' };
    Object.defineProperty(sw, 'controller', { configurable: true, writable: true, value: null });
    sw.register = () => Promise.resolve({ active: A, waiting: null, installing: null, addEventListener: () => {}, update: () => {} });
    setVisibility('visible');
    registerServiceWorker();
    await Promise.resolve(); await Promise.resolve();
    sw.controller = { id: 'B' };
    controllerChangeHandler();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('a hard-reloaded tab claimed by the worker that was already active: no reload (the same build)', async () => {
    const sw = navigator.serviceWorker;
    const A = { id: 'A' };
    Object.defineProperty(sw, 'controller', { configurable: true, writable: true, value: null });
    sw.register = () => Promise.resolve({ active: A, waiting: null, installing: null, addEventListener: () => {}, update: () => {} });
    setVisibility('visible');
    registerServiceWorker();
    await Promise.resolve(); await Promise.resolve();
    sw.controller = A;
    controllerChangeHandler();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('reloads a long-backgrounded app immediately (past the boot window, still hidden)', () => {
    vi.useFakeTimers();
    try {
      setVisibility('hidden');
      registerServiceWorker();
      vi.advanceTimersByTime(60_000);
      controllerChangeHandler();
      expect(reloadSpy).toHaveBeenCalledTimes(1);   // a real update is never suppressed
    } finally {
      vi.useRealTimers();
    }
  });

  it('registers with updateViaCache:none so the SW script is never HTTP-cached', () => {
    const spy = vi.fn(() => Promise.resolve({
      waiting: null, installing: null, addEventListener: () => {}, update: () => {},
    }));
    Object.defineProperty(navigator.serviceWorker, 'register', { configurable: true, value: spy });
    setVisibility('visible');
    registerServiceWorker();
    expect(spy).toHaveBeenCalledWith('./service-worker.js', { updateViaCache: 'none' });
  });
});

/* THE HOLD (ds2, 2026-10-13). The reload lands wherever the reader is, but a note being typed,
   a voice memo and a backup import cannot ride it: while one is open it waits, then reloads
   once the last lets go, a beat later and after the closing save's write has landed. */
describe('registerServiceWorker — the update reload waits for unsaved work (ds2)', () => {
  let controllerChangeHandler, reloadSpy, origSW, origLocation;

  beforeEach(() => {
    vi.useFakeTimers();
    _resetHolds();
    mockStores.list = [];
    controllerChangeHandler = null;
    reloadSpy = vi.fn();
    delete window.__votSwTookOver;
    origSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      controller: {},
      addEventListener: (type, cb) => { if (type === 'controllerchange') controllerChangeHandler = cb; },
      register: () => Promise.resolve({ waiting: null, installing: null, addEventListener: () => {}, update: () => {} }),
    } });
    origLocation = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', { configurable: true, value: { reload: reloadSpy } });
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetHolds();
    mockStores.list = [];
    delete window.__votSwTookOver;
    if (origSW) Object.defineProperty(navigator, 'serviceWorker', origSW);
    if (origLocation) Object.defineProperty(window, 'location', origLocation);
    vi.restoreAllMocks();
  });

  it('waits while a note and a voice memo are open; the restore record is written at the reload, not before', async () => {
    let events = 0;
    const onBefore = () => { events += 1; };
    window.addEventListener('vot:before-update-reload', onBefore);
    try {
      registerServiceWorker();
      const releaseNote = holdUpdateReload('note');
      const releaseMemo = holdUpdateReload('recording');
      controllerChangeHandler();
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(window.__votSwTookOver, 'a lazy load in the wait still refuses to mix builds').toBe(true);
      expect(events).toBe(0);
      releaseNote();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reloadSpy, 'the memo still holds it').not.toHaveBeenCalled();
      releaseMemo();
      await vi.advanceTimersByTimeAsync(399);
      expect(reloadSpy, 'a beat for the closing save to issue its write').not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(events).toBe(1);
      expect(sessionStorage.getItem(UPDATE_RELOAD_FLAG)).toBeTruthy();
      controllerChangeHandler();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('vot:before-update-reload', onBefore);
      try { sessionStorage.removeItem(UPDATE_RELOAD_FLAG); } catch (_e) { /* jsdom */ }
    }
  });

  it('the note Save closed lands before the reload (it waits for the store write, up to 3 s)', async () => {
    let landed;
    mockStores.list = [{ whenSaved: () => new Promise((r) => { landed = () => r(true); }) }];
    registerServiceWorker();
    const release = holdUpdateReload('note');
    controllerChangeHandler();
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reloadSpy).not.toHaveBeenCalled();
    landed();
    await vi.advanceTimersByTimeAsync(0);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('a write that never settles holds the reload no longer than the cap', async () => {
    mockStores.list = [{ whenSaved: () => new Promise(() => {}) }];
    registerServiceWorker();
    const release = holdUpdateReload('backup');
    controllerChangeHandler();
    release();
    await vi.advanceTimersByTimeAsync(400 + 2999);
    expect(reloadSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('a hold taken in the beat after the last release waits again', async () => {
    registerServiceWorker();
    const release = holdUpdateReload('note');
    controllerChangeHandler();
    release();
    await vi.advanceTimersByTimeAsync(200);
    const again = holdUpdateReload('note');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reloadSpy).not.toHaveBeenCalled();
    again();
    await vi.advanceTimersByTimeAsync(400);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('nothing open: the reload is immediate, as before', () => {
    registerServiceWorker();
    controllerChangeHandler();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

/* THE RELOAD FLAG AND THE EARLY CLAIM (w-toast-reload-flag, 2026-09-11). doReload() writes a
   sessionStorage flag before location.reload() so the document that follows knows it was
   reloaded for an update (update-toast.js toasts on it). And a takeover that happened BEFORE
   this listener existed — the controller at registration is not the one captured inline at
   document start (index.html) — reloads through the same door: that page runs the OLD build
   under the NEW worker, and the controllerchange that announced it had nobody to hear it. */
describe('registerServiceWorker — the update-reload flag and the early claim', () => {
  let controllerChangeHandler, reloadSpy, flagAtReload;
  let origSW, origLocation;
  const A = { scriptURL: 'sw.js#A' }, B = { scriptURL: 'sw.js#B' };
  const stub = (controller) => {
    const swMock = {
      controller,
      addEventListener: (type, cb) => { if (type === 'controllerchange') controllerChangeHandler = cb; },
      register: () => Promise.resolve({ waiting: null, installing: null, addEventListener: () => {}, update: () => {} }),
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: swMock });
  };
  beforeEach(() => {
    controllerChangeHandler = null; flagAtReload = 'unread';
    reloadSpy = vi.fn(() => { flagAtReload = sessionStorage.getItem(UPDATE_RELOAD_FLAG); });
    delete window.__votSwTookOver; delete window.__votController0;
    sessionStorage.clear();
    origSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    origLocation = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', { configurable: true, value: { reload: reloadSpy } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
  afterEach(() => {
    if (origSW) Object.defineProperty(navigator, 'serviceWorker', origSW); else delete /** @type {any} */ (navigator).serviceWorker;
    if (origLocation) Object.defineProperty(window, 'location', origLocation);
    delete window.__votSwTookOver; delete window.__votController0;
    sessionStorage.clear();
  });

  it('doReload() writes the flag BEFORE location.reload(), beside the restore record', () => {
    stub(A); window.__votController0 = A;
    let flagAtRecord = 'unread';
    window.addEventListener('vot:before-update-reload', () => { flagAtRecord = sessionStorage.getItem(UPDATE_RELOAD_FLAG); }, { once: true });
    registerServiceWorker();
    expect(reloadSpy).not.toHaveBeenCalled();
    controllerChangeHandler();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(flagAtReload, 'set when reload() is called').toBe('1');
    expect(flagAtRecord, 'already set when the restore record is written').toBe('1');
  });

  it('EARLY CLAIM: the controller at registration is not the one captured at document start → reload through doReload(), once, with the flag', () => {
    window.__votController0 = A;                       // index.html, before any bundle
    stub(B);                                           // B claimed while the bundles were still parsing
    registerServiceWorker();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(flagAtReload).toBe('1');
    expect(window.__votSwTookOver).toBe(true);
    if (controllerChangeHandler) controllerChangeHandler();   // a later event must not reload twice
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('the same worker since document start: no reload (the anti-loop control — every plain boot reads EQUAL)', () => {
    window.__votController0 = A; stub(A);
    registerServiceWorker();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(UPDATE_RELOAD_FLAG)).toBeNull();
  });

  it('no worker at document start, one at registration (a first visit whose install claimed before registration): no reload', () => {
    window.__votController0 = null; stub(A);
    registerServiceWorker();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('index.html captures the controller in its FIRST inline script, before dist/bundle-a.js — the compare above is silently off without it', () => {
    const html = fs.readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8');
    const capture = html.indexOf('window.__votController0 = (navigator.serviceWorker && navigator.serviceWorker.controller) || null;');
    const firstScript = html.indexOf('<script>');
    const bundleA = html.indexOf('dist/bundle-a.js');
    expect(capture, 'the capture line is present').toBeGreaterThan(-1);
    expect(firstScript, 'precondition: an inline script exists').toBeGreaterThan(-1);
    expect(capture, 'inside the first inline script').toBeGreaterThan(firstScript);
    expect(html.indexOf('</script>', firstScript), 'that script closes after the capture').toBeGreaterThan(capture);
    expect(bundleA, 'before the first bundle').toBeGreaterThan(capture);
  });

  it('no capture at all (a document without the inline script): no reload', () => {
    stub(A);
    registerServiceWorker();
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe('registerServiceWorker — auto-update (no toast)', () => {
  let origSW, origLocation;

  beforeEach(() => {
    origSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    origLocation = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', { configurable: true, value: { reload: vi.fn() } });
  });
  afterEach(() => {
    if (origSW) Object.defineProperty(navigator, 'serviceWorker', origSW);
    if (origLocation) Object.defineProperty(window, 'location', origLocation);
    vi.restoreAllMocks();
  });

  function fakeWorker() {
    const listeners = {};
    const w = {
      state: 'installing',
      postMessage: vi.fn(),
      addEventListener: (type, cb) => { listeners[type] = cb; },
      fireState: (s) => { w.state = s; if (listeners.statechange) listeners.statechange(); },
    };
    return w;
  }
  function mockSW({ waiting = null, installing = null }) {
    const regListeners = {};
    const reg = {
      waiting, installing,
      addEventListener: (type, cb) => { regListeners[type] = cb; },
      update: () => {},
      _fire: (type) => { if (regListeners[type]) regListeners[type](); },
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      controller: {}, addEventListener: () => {}, register: () => Promise.resolve(reg),
    }});
    return reg;
  }
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

  it('immediately posts SKIP_WAITING when a worker is already waiting', async () => {
    const waiting = fakeWorker();
    mockSW({ waiting });
    registerServiceWorker();
    await flush();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('a new build that finishes installing while the reader is here WAITS: no SKIP_WAITING, so no reload mid-session (up1)', async () => {
    const incoming = fakeWorker();
    const reg = mockSW({ installing: incoming });
    registerServiceWorker();
    await flush();
    window.dispatchEvent(new Event('pointerdown'));   // the reader has started
    reg._fire('updatefound');
    incoming.fireState('installed');
    expect(incoming.postMessage).not.toHaveBeenCalled();
  });

  describe('the waiting build takes over after 10+ minutes away (up1, Corbin 10-23)', () => {
    let now = 0;
    const setVisibility = (v) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: v });
      Object.defineProperty(document, 'hidden', { configurable: true, value: v === 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    beforeEach(() => {
      now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    });
    afterEach(() => {
      vi.useRealTimers();
      delete (/** @type {any} */ (document)).visibilityState;
      delete (/** @type {any} */ (document)).hidden;
      try { navigator.mediaSession.playbackState = 'none'; } catch (_e) { /* jsdom without mediaSession */ }
    });
    async function waitingBuild() {
      const incoming = fakeWorker();
      const reg = mockSW({ installing: incoming });
      registerServiceWorker();
      await flush();
      window.dispatchEvent(new Event('keydown'));
      reg._fire('updatefound');
      incoming.fireState('installed');
      reg.waiting = incoming;
      return incoming;
    }

    it('back after 10 minutes in the background: SKIP_WAITING on return', async () => {
      const w = await waitingBuild();
      setVisibility('hidden');
      now += 10 * 60 * 1000;
      setVisibility('visible');
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('back after 9 minutes: nothing, the reader is mid-session', async () => {
      const w = await waitingBuild();
      setVisibility('hidden');
      now += 9 * 60 * 1000;
      setVisibility('visible');
      expect(w.postMessage).not.toHaveBeenCalled();
    });

    it('still away when 10 minutes pass: it takes over in the background, unseen', async () => {
      const w = await waitingBuild();
      setVisibility('hidden');
      now += 10 * 60 * 1000;
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('never while a recording plays, screen off or on', async () => {
      const ms = /** @type {any} */ (navigator).mediaSession;
      if (!ms) Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: { playbackState: 'none' } });
      const w = await waitingBuild();
      navigator.mediaSession.playbackState = 'playing';
      setVisibility('hidden');
      now += 30 * 60 * 1000;
      vi.advanceTimersByTime(30 * 60 * 1000);
      setVisibility('visible');
      expect(w.postMessage).not.toHaveBeenCalled();
      // Paused, then away again: now it may.
      navigator.mediaSession.playbackState = 'paused';
      setVisibility('hidden');
      now += 11 * 60 * 1000;
      setVisibility('visible');
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('never while a note, voice memo or backup holds it', async () => {
      const w = await waitingBuild();
      const release = holdUpdateReload('note');
      setVisibility('hidden');
      now += 15 * 60 * 1000;
      setVisibility('visible');
      expect(w.postMessage).not.toHaveBeenCalled();
      release();
    });
  });

  it('a build installed in the first seconds after open, before any touch, takes over then (the boot window)', async () => {
    const incoming = fakeWorker();
    const reg = mockSW({ installing: incoming });
    registerServiceWorker();
    await flush();
    reg._fire('updatefound');
    incoming.fireState('installed');
    expect(incoming.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('the boot window closes after 15 s even untouched', async () => {
    let now = 5_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const incoming = fakeWorker();
    const reg = mockSW({ installing: incoming });
    registerServiceWorker();
    await flush();
    now += 16_000;
    reg._fire('updatefound');
    incoming.fireState('installed');
    expect(incoming.postMessage).not.toHaveBeenCalled();
  });

  describe('ANOTHER_BUILD: this build could not serve what the reader asked for (W27 + up1)', () => {
    /** @type {(e: any) => void} */ let deliver = () => {};
    function mockWithMessages(waiting) {
      const reg = { waiting, installing: null, addEventListener: () => {}, update: () => {} };
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
        controller: {}, register: () => Promise.resolve(reg),
        addEventListener: (type, cb) => { if (type === 'message') deliver = cb; },
      }});
      return reg;
    }
    afterEach(() => { try { navigator.mediaSession.playbackState = 'none'; } catch (_e) { /* none */ } document.getElementById('vot-toast-update-ready')?.remove(); });

    it('nothing playing or held: the waiting build takes over at once', async () => {
      const w = fakeWorker();
      mockWithMessages(null);
      registerServiceWorker();
      await flush();
      window.dispatchEvent(new Event('pointerdown'));
      const reg = await navigator.serviceWorker.register();
      reg.waiting = w;
      deliver({ data: { type: 'ANOTHER_BUILD' } });
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('while a recording plays: one tap on "A newer version is ready" takes it, nothing reloads by itself', async () => {
      if (!(/** @type {any} */ (navigator).mediaSession)) Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: { playbackState: 'none' } });
      const w = fakeWorker();
      const reg = mockWithMessages(null);
      registerServiceWorker();
      await flush();
      reg.waiting = w;
      navigator.mediaSession.playbackState = 'playing';
      deliver({ data: { type: 'ANOTHER_BUILD' } });
      deliver({ data: { type: 'ANOTHER_BUILD' } });
      expect(w.postMessage).not.toHaveBeenCalled();
      const el = document.getElementById('vot-toast-update-ready');
      expect(el && el.textContent).toBe('A newer version is ready. Tap to update.');
      el.click();
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('answers the worker BUSY question with whether it plays or holds', async () => {
      mockWithMessages(null);
      registerServiceWorker();
      await flush();
      const answers = [];
      const port = { postMessage: (m) => answers.push(m.busy) };
      deliver({ data: { type: 'BUSY' }, ports: [port] });
      const release = holdUpdateReload('recording');
      deliver({ data: { type: 'BUSY' }, ports: [port] });
      release();
      expect(answers).toEqual([false, true]);
    });
  });

  it('does not post SKIP_WAITING when there is no waiting worker', async () => {
    const reg = mockSW({});
    registerServiceWorker();
    await flush();
    reg._fire('updatefound'); // no installing worker either
    // nothing to assert — just no error + no spurious postMessage
    expect(reg.waiting).toBeNull();
  });

  it('swallows a rejected reg.update() so an offline poll never surfaces as an unhandled rejection', async () => {
    const reg = mockSW({});
    const catchSpy = vi.fn();
    reg.update = () => ({ catch: catchSpy });   // a rejecting promise, observably
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    try {
      registerServiceWorker();
      await flush();
      document.dispatchEvent(new Event('visibilitychange'));
      expect(catchSpy).toHaveBeenCalledTimes(1);
    } finally {
      delete (/** @type {any} */ (document)).visibilityState;
    }
  });
});

/* service-worker-4 (2026-09-04): the SW's install-time corpus precache now
   posts PRECACHE_INCOMPLETE when the best-effort loop misses a file — this
   is the page-side half, recording it via DiagnosticLog so Settings' export
   carries a trace instead of the failure vanishing the moment the tab closes. */
describe('registerServiceWorker — PRECACHE_INCOMPLETE diagnostic (service-worker-4)', () => {
  let messageHandler;
  let origSW;

  beforeEach(() => {
    messageHandler = null;
    origSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        addEventListener: (type, cb) => { if (type === 'message') messageHandler = cb; },
        register: () => Promise.resolve({
          waiting: null, installing: null, addEventListener: () => {}, update: () => {},
        }),
      },
    });
    DiagnosticLog.clear();
  });

  afterEach(() => {
    if (origSW) Object.defineProperty(navigator, 'serviceWorker', origSW);
    DiagnosticLog.clear();
  });

  it('records install-time corpus precache failures via DiagnosticLog', () => {
    registerServiceWorker();
    expect(typeof messageHandler).toBe('function');
    messageHandler({ data: { type: 'PRECACHE_INCOMPLETE', count: 2, urls: ['./a.js', './b.js'] } });
    const entry = DiagnosticLog.entries().find((e) => e.tag === 'sw' && e.msg.includes('corpus precache incomplete'));
    expect(entry, JSON.stringify(DiagnosticLog.entries())).toBeTruthy();
    expect(entry.msg).toContain('2 file(s)');
    expect(entry.msg).toContain('./a.js');
    expect(entry.msg).toContain('./b.js');
  });

  it('ignores an unrelated message type', () => {
    registerServiceWorker();
    messageHandler({ data: { type: 'SOMETHING_ELSE' } });
    expect(DiagnosticLog.entries()).toEqual([]);
  });
});

/* service-worker-5 (2026-09-04): the page-side half of a refused install —
   record it via DiagnosticLog (Settings' export) AND show a toast naming the
   asset, since the SW console is unreachable on a phone (the s12 lesson
   again: "new work committed, nothing changing on screen"). */
describe('registerServiceWorker — INSTALL_REFUSED diagnostic + toast (service-worker-5)', () => {
  let messageHandler;
  let origSW;

  beforeEach(() => {
    messageHandler = null;
    origSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        addEventListener: (type, cb) => { if (type === 'message') messageHandler = cb; },
        register: () => Promise.resolve({
          waiting: null, installing: null, addEventListener: () => {}, update: () => {},
        }),
      },
    });
    DiagnosticLog.clear();
    _resetToasts();
  });

  afterEach(() => {
    if (origSW) Object.defineProperty(navigator, 'serviceWorker', origSW);
    DiagnosticLog.clear();
    _resetToasts();
  });

  it('records a refused install via DiagnosticLog and shows a toast naming the asset', () => {
    registerServiceWorker();
    messageHandler({
      data: {
        type: 'INSTALL_REFUSED',
        message: '[sw] integrity check failed for ./dist/bundle-a.js after a refetch — refusing to install this build so the previous one keeps serving.',
        url: './dist/bundle-a.js',
        expected: 'abc123def456',
        actual: '999999999999',
      },
    });
    const entry = DiagnosticLog.entries().find((e) => e.tag === 'sw' && e.lvl === 'E' && e.msg.includes('install refused'));
    expect(entry, JSON.stringify(DiagnosticLog.entries())).toBeTruthy();
    expect(entry.msg).toContain('./dist/bundle-a.js');
    expect(entry.msg).toContain('abc123def456');
    const toastEl = document.getElementById('vot-toast-sw-refused');
    expect(toastEl, 'expected an INSTALL_REFUSED toast element').toBeTruthy();
    expect(toastEl.textContent).toContain('./dist/bundle-a.js');
  });

  it('ignores an unrelated message type (no toast, no DiagnosticLog entry)', () => {
    registerServiceWorker();
    messageHandler({ data: { type: 'SOMETHING_ELSE' } });
    expect(DiagnosticLog.entries()).toEqual([]);
    expect(document.getElementById('vot-toast-sw-refused')).toBeFalsy();
  });
});
