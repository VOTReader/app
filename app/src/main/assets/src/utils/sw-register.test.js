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
