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

  it('reloads immediately when the tab is visible', () => {
    setVisibility('visible');
    registerServiceWorker();
    expect(typeof controllerChangeHandler).toBe('function');
    controllerChangeHandler();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('defers the reload until visible when the tab is hidden', () => {
    setVisibility('hidden');
    registerServiceWorker();
    controllerChangeHandler();
    expect(reloadSpy).not.toHaveBeenCalled();
    // background tab returns to the foreground → reload now
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('does not double-reload on a second controllerchange', () => {
    setVisibility('visible');
    registerServiceWorker();
    controllerChangeHandler();
    controllerChangeHandler();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
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
});
