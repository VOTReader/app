import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerServiceWorker } from './sw-register.js';

describe('REPRO service-worker-1: visible mixed-build takeover', () => {
  let controllerChange;
  let reload;
  let originalSW;
  let originalLocation;
  let originalVisibility;

  beforeEach(() => {
    vi.useFakeTimers();
    controllerChange = null;
    reload = vi.fn();
    originalSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
    originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        addEventListener(type, cb) { if (type === 'controllerchange') controllerChange = cb; },
        register: () => Promise.resolve({ waiting: null, installing: null, addEventListener() {}, update() {} }),
      },
    });
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalSW) Object.defineProperty(navigator, 'serviceWorker', originalSW);
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
    if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
    vi.restoreAllMocks();
  });

  it('does not leave the visible reader on old eager bundles after a new worker claims it', () => {
    registerServiceWorker();
    vi.advanceTimersByTime(60_000);

    controllerChange();

    // A still-visible page has already parsed its old eager bundles. Once the
    // new controller claims the page, continuing without a build check allows
    // a later lazy script injection to mix old and new releases.
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
