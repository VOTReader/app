/* sw-register tests — controllerchange reload.
   ──────────────────────────────────────────────────────────────────
   Mocks navigator.serviceWorker (capturing the controllerchange handler),
   window.location, and document.visibilityState, then drives the handler.
   Reload is unconditional on any controllerchange once the page already had
   a controller (service-worker-1, 2026-09-04) — visibility and boot timing
   used to gate a deferred reload, which left a visible mid-session reader
   running OLD eager bundles under a NEW controller for as long as they kept
   reading (see sw-register.js's module header). The existing
   service-worker.test.js covers the SW's own install/fetch logic and is
   untouched.

   jsdom's location.reload is non-configurable, so we replace window.location
   wholesale (the `location` property on window IS configurable) with a stub
   exposing only reload — all registerServiceWorker touches.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerServiceWorker } from './sw-register.js';

describe('registerServiceWorker — controllerchange reload', () => {
  let controllerChangeHandler;
  let reloadSpy;
  let origSW, origLocation, origVisibility;

  beforeEach(() => {
    controllerChangeHandler = null;
    reloadSpy = vi.fn();
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

  it('reloads immediately when the page is visible', () => {
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

  /* service-worker-1 (2026-09-04): this used to be "defers a mid-session
     VISIBLE reload until the app is backgrounded" — waiting for the tab to
     background before reloading a visible reader. That wait had no upper
     bound: the reader's already-parsed OLD eager bundles (bundle-a/b/c/d)
     kept running under the NEW controller for as long as they stayed put, and
     a lazy corpus/screen load in that window would be NEW code against OLD
     globals. Build correctness now wins — reload fires the moment the
     controller changes, visible or not. */
  it('reloads immediately even well after boot, still visible', () => {
    vi.useFakeTimers();
    try {
      setVisibility('visible');
      registerServiceWorker();
      vi.advanceTimersByTime(60_000);
      controllerChangeHandler();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
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

  it('posts SKIP_WAITING when a new worker reaches installed via updatefound', async () => {
    const incoming = fakeWorker();
    const reg = mockSW({ installing: incoming });
    registerServiceWorker();
    await flush();
    expect(incoming.postMessage).not.toHaveBeenCalled(); // not yet — still installing
    reg._fire('updatefound');
    incoming.fireState('installed');
    expect(incoming.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
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
