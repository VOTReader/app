/* onIdle — the guard `requestIdleCallback` needs on every WebKit device.
   ═══════════════════════════════════════════════════════════════════════
   The case that matters most here is the THIRD one. Both `requestIdleCallback`
   and `setTimeout` return a number in a browser, so a `typeof tok === 'number'`
   test cannot tell them apart — and the cleanup this helper replaces did
   exactly that before calling `cancelIdleCallback`. It was correct only
   because the two idle APIs have always shipped together, which is a
   coincidence, not a rule. The helper closes over which branch it took, and
   the third case is the one that would notice if it stopped. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { onIdle } from './on-idle.js';

const g = /** @type {any} */ (globalThis);

/** Install/remove the two idle globals independently, so a host with one and
 *  not the other can be expressed — which is the whole point of case three. */
function withIdle({ request, cancel }) {
  const hadR = 'requestIdleCallback' in g;
  const hadC = 'cancelIdleCallback' in g;
  const prevR = g.requestIdleCallback;
  const prevC = g.cancelIdleCallback;
  if (request === undefined) delete g.requestIdleCallback; else g.requestIdleCallback = request;
  if (cancel === undefined) delete g.cancelIdleCallback; else g.cancelIdleCallback = cancel;
  return () => {
    if (hadR) g.requestIdleCallback = prevR; else delete g.requestIdleCallback;
    if (hadC) g.cancelIdleCallback = prevC; else delete g.cancelIdleCallback;
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('onIdle', () => {
  it('uses requestIdleCallback where it exists, and passes the timeout through', () => {
    // Declared parameters, not `() => 42`: vi.fn infers a ZERO-ARG mock from a
    // zero-arg implementation, so `mock.calls[0]` types as an empty tuple and
    // `calls[0][0]` is a tsc error rather than a runtime one. The arity here is
    // what makes the two assertions below type-check AND stay meaningful.
    const request = vi.fn((/** @type {any} */ _fn, /** @type {any} */ _opts) => 42);
    const cancel = vi.fn();
    const restore = withIdle({ request, cancel });
    try {
      const fn = () => {};
      const stop = onIdle(fn, { timeout: 1500, fallbackDelay: 999 });
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][0]).toBe(fn);
      expect(request.mock.calls[0][1]).toEqual({ timeout: 1500 });
      stop();
      expect(cancel).toHaveBeenCalledWith(42);
    } finally { restore(); }
  });

  it('falls back to a timer where it does not — the WebKit path', () => {
    vi.useFakeTimers();
    const restore = withIdle({ request: undefined, cancel: undefined });
    try {
      const fn = vi.fn();
      onIdle(fn, { timeout: 1500, fallbackDelay: 50 });
      vi.advanceTimersByTime(49);
      expect(fn).not.toHaveBeenCalled();   // the delay is honoured, not ignored
      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    } finally { restore(); }
  });

  /* THE ONE THAT PAYS FOR THIS HELPER. A host with cancelIdleCallback but no
     requestIdleCallback would make the old `typeof tok === 'number'` cleanup
     hand a setTimeout id to cancelIdleCallback: the timer is never cleared,
     the callback fires after unmount, and the cancel silently did nothing.
     Contrived as a browser, exact as a statement of what the code assumed. */
  it('cancels the timer, not the wrong API, when only cancelIdleCallback exists', () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const restore = withIdle({ request: undefined, cancel });
    try {
      const fn = vi.fn();
      const stop = onIdle(fn, { fallbackDelay: 10 });
      stop();
      vi.advanceTimersByTime(1000);
      expect(fn).not.toHaveBeenCalled();     // the timer really was cleared
      expect(cancel).not.toHaveBeenCalled(); // and the wrong API was not called
    } finally { restore(); }
  });

  it('cancelling is safe where cancelIdleCallback is missing but request is not', () => {
    const request = vi.fn(() => 7);
    const restore = withIdle({ request, cancel: undefined });
    try {
      const stop = onIdle(() => {});
      expect(() => stop()).not.toThrow();
    } finally { restore(); }
  });

  it('omits the options object when no timeout is asked for', () => {
    const request = vi.fn((/** @type {any} */ _fn, /** @type {any} */ _opts) => 1);
    const restore = withIdle({ request, cancel: vi.fn() });
    try {
      onIdle(() => {});
      expect(request.mock.calls[0].length).toBe(1);
    } finally { restore(); }
  });
});
