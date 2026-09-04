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
import { registerServiceWorker } from './sw-register.js';

describe('registerServiceWorker — P7pwa visibility-gated reload', () => {
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
  it('defers a mid-session VISIBLE reload until the app is backgrounded', () => {
    vi.useFakeTimers();
    try {
      setVisibility('visible');
      registerServiceWorker();
      vi.advanceTimersByTime(60_000);         // well past BOOT_GRACE_MS
      controllerChangeHandler();
      expect(reloadSpy).not.toHaveBeenCalled();
      // still visible → still no reload
      document.dispatchEvent(new Event('visibilitychange'));
      expect(reloadSpy).not.toHaveBeenCalled();
      // user leaves the app → reload now, unseen
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
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
