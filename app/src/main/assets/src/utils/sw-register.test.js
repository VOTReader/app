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

describe('registerServiceWorker — update prompt (TEST-3)', () => {
  const TOAST_ID = 'vot-toast-sw-update';
  let origSW, origLocation;

  function removeToast() { const t = document.getElementById(TOAST_ID); if (t) t.remove(); }
  beforeEach(() => {
    origSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    origLocation = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', { configurable: true, value: { reload: vi.fn() } });
    removeToast();
  });
  afterEach(() => {
    if (origSW) Object.defineProperty(navigator, 'serviceWorker', origSW);
    if (origLocation) Object.defineProperty(window, 'location', origLocation);
    removeToast();
    vi.restoreAllMocks();
  });

  // A fake SW worker that records postMessage + lets the test drive its statechange.
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
  // Install a navigator.serviceWorker mock whose register() resolves with `reg`.
  function mockSW({ waiting = null, installing = null, controller = {} }) {
    const regListeners = {};
    const reg = {
      waiting, installing,
      addEventListener: (type, cb) => { regListeners[type] = cb; },
      update: () => {},
      _fire: (type) => { if (regListeners[type]) regListeners[type](); },
    };
    const sw = {
      controller,
      addEventListener: () => {},
      register: () => Promise.resolve(reg),
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
    return reg;
  }
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

  it('prompts (toast + tap posts SKIP_WAITING) when a worker is ALREADY waiting', async () => {
    const waiting = fakeWorker();
    mockSW({ waiting });
    registerServiceWorker();
    await flush();                                       // register().then runs
    const toast = document.getElementById(TOAST_ID);
    expect(toast).toBeTruthy();                          // "update available" surfaced
    toast.click();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('prompts when a NEW worker finishes installing this session (updatefound→installed)', async () => {
    const incoming = fakeWorker();
    const reg = mockSW({ installing: incoming });
    registerServiceWorker();
    await flush();
    expect(document.getElementById(TOAST_ID)).toBeFalsy();   // still installing → no toast yet
    reg._fire('updatefound');                                // SW attaches statechange to reg.installing
    incoming.fireState('installed');                         // installed + controller exists → prompt
    const toast = document.getElementById(TOAST_ID);
    expect(toast).toBeTruthy();
    toast.click();
    expect(incoming.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('does NOT prompt on the FIRST install (no existing controller)', async () => {
    const incoming = fakeWorker();
    const reg = mockSW({ installing: incoming, controller: null });
    registerServiceWorker();
    await flush();
    reg._fire('updatefound');
    incoming.fireState('installed');
    expect(document.getElementById(TOAST_ID)).toBeFalsy();   // first install ⇒ no update toast
  });
});
