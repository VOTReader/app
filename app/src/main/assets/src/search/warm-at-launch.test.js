/* The search index is built at launch, in idle time (search200 wave 3, U10.3): after a cold
   start the first open of Search showed "Building search index…" for the whole build. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { warmSearchAtLaunch, WARM_DELAY_MS } from './warm-at-launch.js';

describe('warmSearchAtLaunch', () => {
  /** @type {any} */ let engine;
  /** @type {Array<{ fn: Function, opts: any }>} */ let idle;
  let prevRic;
  beforeEach(() => {
    vi.useFakeTimers();
    const g = /** @type {any} */ (globalThis);
    prevRic = g.requestIdleCallback;
    idle = [];
    g.requestIdleCallback = (fn, opts) => { idle.push({ fn, opts }); return idle.length; };
    engine = { init: vi.fn(() => Promise.resolve(true)), getState: vi.fn(() => ({ ready: false, building: false })), isCurrent: vi.fn(() => false) };
  });
  afterEach(() => {
    vi.useRealTimers();
    /** @type {any} */ (globalThis).requestIdleCallback = prevRic;
  });
  const runIdle = () => { const q = idle; idle = []; for (const c of q) c.fn({ didTimeout: false, timeRemaining: () => 50 }); };

  it('builds for the reader\'s edition, in the background, only after first paint, a pause and an idle turn', async () => {
    warmSearchAtLaunch({ engine: () => engine, translation: () => 'kjv' });
    await vi.advanceTimersByTimeAsync(WARM_DELAY_MS - 50);
    runIdle();
    expect(engine.init).not.toHaveBeenCalled();   // the reader's first chapter has the page to itself
    await vi.advanceTimersByTimeAsync(200);
    expect(idle.length).toBe(1);
    expect(idle[0].opts.timeout).toBeGreaterThan(0);   // a page never idle still gets it, later
    expect(engine.init).not.toHaveBeenCalled();
    runIdle();
    expect(engine.init).toHaveBeenCalledTimes(1);
    expect(engine.init).toHaveBeenCalledWith({ translation: 'kjv', background: true });
  });

  it('reads the edition when it starts, not when it was scheduled', async () => {
    let code = 'nkjv';
    warmSearchAtLaunch({ engine: () => engine, translation: () => code });
    code = 'esv';
    await vi.advanceTimersByTimeAsync(WARM_DELAY_MS + 100);
    runIdle();
    expect(engine.init).toHaveBeenCalledWith({ translation: 'esv', background: true });
  });

  it('does nothing once cancelled', async () => {
    const cancel = warmSearchAtLaunch({ engine: () => engine, translation: () => 'nkjv' });
    await vi.advanceTimersByTimeAsync(WARM_DELAY_MS + 100);
    cancel();
    runIdle();
    expect(engine.init).not.toHaveBeenCalled();
  });

  it('leaves an index already current, or a build under way, alone', async () => {
    engine.getState = () => ({ ready: true, building: false });
    engine.isCurrent = () => true;
    warmSearchAtLaunch({ engine: () => engine, translation: () => 'nkjv' });
    await vi.advanceTimersByTimeAsync(WARM_DELAY_MS + 100);
    runIdle();
    engine.getState = () => ({ ready: false, building: true });
    engine.isCurrent = () => false;
    warmSearchAtLaunch({ engine: () => engine, translation: () => 'nkjv' });
    await vi.advanceTimersByTimeAsync(WARM_DELAY_MS + 100);
    runIdle();
    expect(engine.init).not.toHaveBeenCalled();
  });

  it('a failed build is quiet: Search builds again when it opens', async () => {
    engine.init = vi.fn(() => Promise.reject(new Error('no corpus')));
    warmSearchAtLaunch({ engine: () => engine, translation: () => 'nkjv' });
    await vi.advanceTimersByTimeAsync(WARM_DELAY_MS + 100);
    runIdle();
    await vi.advanceTimersByTimeAsync(10);
    expect(engine.init).toHaveBeenCalledTimes(1);
  });

  it('no engine, no build', async () => {
    warmSearchAtLaunch({ engine: () => undefined, translation: () => 'nkjv' });
    await vi.advanceTimersByTimeAsync(WARM_DELAY_MS + 100);
    expect(() => runIdle()).not.toThrow();
  });
});
