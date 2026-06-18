/* use-pager-gesture — the finger-follow page-swipe mechanics.
   Tests the pure decision primitives + the controller driven by synthetic
   touch objects (no real TouchEvent/DOM). */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import {
  decideAxis, isCommit, rubberBand, velocityFromSamples, createPagerGesture, usePagerGesture,
} from './use-pager-gesture.js';

afterEach(cleanup);

describe('decideAxis', () => {
  it('returns null below the slop', () => {
    expect(decideAxis(5, 5)).toBe(null);
    expect(decideAxis(-7, 7)).toBe(null);
  });
  it('locks horizontal only when it clearly dominates (×1.3)', () => {
    expect(decideAxis(-90, 8)).toBe('x');
    expect(decideAxis(50, 0)).toBe('x');
  });
  it('hands ties + vertical to native scroll', () => {
    expect(decideAxis(-90, 80)).toBe('y'); // 90 !> 80*1.3 = 104
    expect(decideAxis(0, 50)).toBe('y');
    expect(decideAxis(30, 30)).toBe('y');  // equal → reading-scroll wins
  });
});

describe('isCommit', () => {
  it('commits past 35% of width', () => {
    expect(isCommit(-140, 0, 400)).toBe(false); // exactly 35% → not past
    expect(isCommit(-141, 0, 400)).toBe(true);
  });
  it('commits on a fast flick past a small minimum', () => {
    expect(isCommit(-50, -1, 400)).toBe(true);   // 12.5% width, vx 1 px/ms
    expect(isCommit(-50, 0.2, 400)).toBe(false);  // too slow
    expect(isCommit(-20, -2, 400)).toBe(false);   // below the 8% minimum
  });
  it('never commits with non-positive width', () => {
    expect(isCommit(999, 9, 0)).toBe(false);
  });
});

describe('rubberBand', () => {
  it('resists (output magnitude below the raw drag) and preserves sign', () => {
    expect(rubberBand(0, 400)).toBe(0);
    const r = rubberBand(100, 400);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(100);
    expect(rubberBand(-100, 400)).toBeLessThan(0);
  });
  it('is monotonic (more drag → more offset) but bounded', () => {
    expect(rubberBand(200, 400)).toBeGreaterThan(rubberBand(100, 400));
    expect(rubberBand(100000, 400)).toBeLessThan(400 * 0.18);
  });
  it('returns 0 for non-positive width', () => {
    expect(rubberBand(50, 0)).toBe(0);
  });
});

describe('velocityFromSamples', () => {
  it('needs two samples', () => {
    expect(velocityFromSamples([])).toBe(0);
    expect(velocityFromSamples([{ x: 0, t: 0 }])).toBe(0);
  });
  it('computes px/ms over the recent window', () => {
    expect(velocityFromSamples([{ x: 0, t: 0 }, { x: -50, t: 50 }])).toBe(-1);
  });
  it('guards against zero/negative dt', () => {
    expect(velocityFromSamples([{ x: 0, t: 10 }, { x: -5, t: 10 }])).toBe(0);
  });
  it('returns 0 when the window is too short to trust (degenerate timestamps)', () => {
    // dt = 2ms < MIN_VELOCITY_DT (8) → no spurious huge velocity → no false flick
    expect(velocityFromSamples([{ x: -28, t: 0 }, { x: -33, t: 2 }])).toBe(0);
  });
});

// ── Controller ──────────────────────────────────────────────────────────────
function makeIO(overrides = {}) {
  const track = { style: {} };
  const peek = { style: {} };
  const calls = { peekChange: [], commits: [], scheduled: [] };
  const io = {
    getWidth: () => 400,
    getTrack: () => track,
    getPeek: () => peek,
    peekFor: () => ({ kind: 'verses', verses: [] }), // default: a target exists
    commit: (side) => calls.commits.push(side),
    onPeekChange: (side, desc) => calls.peekChange.push({ side, desc }),
    reducedMotion: () => false,
    schedule: (fn) => { fn(); return 0; },           // synchronous for determinism
    hasSelection: () => false,
    ...overrides,
  };
  return { io, track, peek, calls };
}
const startEv = (x, y, target) => ({ touches: [{ clientX: x, clientY: y }], target: target || { closest: () => null } });
const moveEv = (x, y, t, pd) => ({ touches: [{ clientX: x, clientY: y }], timeStamp: t || 0, cancelable: true, preventDefault: pd || (() => {}) });

describe('createPagerGesture controller', () => {
  it('commits NEXT on a clear leftward drag past threshold', () => {
    const { io, calls } = makeIO();
    const g = createPagerGesture(io);
    g.start(startEv(300, 100));
    g.move(moveEv(250, 100, 0));   // dx -50 → locks axis x, dir 'next', mounts peek
    g.move(moveEv(120, 100, 40));  // dx -180 (>140)
    g.end();
    expect(calls.peekChange[0]).toEqual({ side: 'next', desc: { kind: 'verses', verses: [] } });
    expect(calls.commits).toEqual(['next']);
    expect(calls.peekChange[calls.peekChange.length - 1]).toEqual({ side: null, desc: null }); // peek cleared
  });

  it('commits PREV on a clear rightward drag', () => {
    const { io, calls } = makeIO();
    const g = createPagerGesture(io);
    g.start(startEv(100, 100));
    g.move(moveEv(160, 100, 0));
    g.move(moveEv(300, 100, 40)); // dx +200
    g.end();
    expect(calls.peekChange[0].side).toBe('prev');
    expect(calls.commits).toEqual(['prev']);
  });

  it('springs back below threshold (no commit)', () => {
    const { io, calls } = makeIO();
    const g = createPagerGesture(io);
    g.start(startEv(300, 100));
    g.move(moveEv(270, 100, 0));  // dx -30, slow
    g.move(moveEv(265, 100, 200));
    g.end();
    expect(calls.commits).toEqual([]);
    expect(calls.peekChange[calls.peekChange.length - 1]).toEqual({ side: null, desc: null });
  });

  it('ignores a vertical drag — no peek, no commit, no preventDefault', () => {
    const { io, calls } = makeIO();
    const g = createPagerGesture(io);
    const pd = vi.fn();
    g.start(startEv(300, 100));
    g.move(moveEv(305, 220, 0, pd)); // dx 5, dy 120 → axis 'y'
    g.move(moveEv(305, 320, 40, pd));
    g.end();
    expect(calls.peekChange).toEqual([]);
    expect(calls.commits).toEqual([]);
    expect(pd).not.toHaveBeenCalled();
  });

  it('preventDefault fires once horizontal intent locks', () => {
    const { io } = makeIO();
    const g = createPagerGesture(io);
    const pd = vi.fn();
    g.start(startEv(300, 100));
    g.move(moveEv(250, 100, 0, pd));
    expect(pd).toHaveBeenCalled();
  });

  it('engages + commits even when the drag begins on a tappable element (swipe from anywhere)', () => {
    const { io, calls } = makeIO();
    const g = createPagerGesture(io);
    g.start(startEv(300, 100, { closest: () => ({}) })); // a would-be tappable target is NOT guarded anymore
    g.move(moveEv(250, 100, 0));
    g.move(moveEv(120, 100, 40));
    g.end();
    expect(calls.peekChange[0].side).toBe('next');
    expect(calls.commits).toEqual(['next']);
  });

  it('dead end (no target): rubber-bands, never commits even past threshold', () => {
    const { io, calls, track } = makeIO({ peekFor: () => null });
    const g = createPagerGesture(io);
    g.start(startEv(300, 100));
    g.move(moveEv(250, 100, 0));
    g.move(moveEv(80, 100, 40)); // far past threshold
    expect(track.style.transform).toMatch(/translateX/); // dragged (resisted)
    g.end();
    expect(calls.commits).toEqual([]);
    expect(calls.peekChange[0]).toEqual({ side: 'next', desc: null });
  });

  it('selection guard blocks commit', () => {
    const { io, calls } = makeIO({ hasSelection: () => true });
    const g = createPagerGesture(io);
    g.start(startEv(300, 100));
    g.move(moveEv(250, 100, 0));
    g.move(moveEv(80, 100, 40));
    g.end();
    expect(calls.commits).toEqual([]);
  });

  it('reduced motion still commits, without a transition', () => {
    const { io, calls, track } = makeIO({ reducedMotion: () => true });
    const g = createPagerGesture(io);
    g.start(startEv(300, 100));
    g.move(moveEv(250, 100, 0));
    g.move(moveEv(120, 100, 40));
    g.end();
    expect(calls.commits).toEqual(['next']);
    expect(track.style.transition).toBe('none'); // no settle animation
  });

  it('ignores new touches while a settle is in flight', () => {
    let pending = () => {};
    const { io, calls } = makeIO({ schedule: (fn, ms) => { if (ms) { pending = fn; } else { fn(); } return 0; } });
    const g = createPagerGesture(io);
    g.start(startEv(300, 100));
    g.move(moveEv(250, 100, 0));
    g.move(moveEv(120, 100, 40));
    g.end();                       // settle scheduled (pending), settling = true
    expect(g.isSettling()).toBe(true);
    g.start(startEv(300, 100));    // must be ignored
    g.move(moveEv(120, 100, 40));
    g.end();
    expect(calls.commits).toEqual([]); // nothing committed yet
    pending();                     // finish the settle
    expect(calls.commits).toEqual(['next']);
    expect(g.isSettling()).toBe(false);
  });

  it('dispose() cancels a pending settle (no commit after unmount)', () => {
    const cancelled = [];
    const { io, calls } = makeIO({
      schedule: (fn, ms) => (ms ? 7 : (fn(), 0)), // defer the ms settle; keep the token
      cancelScheduled: (tok) => cancelled.push(tok),
    });
    const g = createPagerGesture(io);
    g.start(startEv(300, 100));
    g.move(moveEv(250, 100, 0));
    g.move(moveEv(120, 100, 40));
    g.end();
    expect(g.isSettling()).toBe(true);
    g.dispose();                   // simulate ScreenLayout unmount mid-settle
    expect(cancelled).toContain(7);
    expect(g.isSettling()).toBe(false);
    expect(calls.commits).toEqual([]); // settle never fired → no navigation
  });
});

// ── React wiring (covers the hook: addEventListener glue + IO callbacks) ─────
describe('usePagerGesture (React wiring)', () => {
  const fire = (el, type, x, y) => {
    const e = new Event(type, { cancelable: true, bubbles: true });
    Object.assign(e, { touches: [{ clientX: x, clientY: y }] });
    el.dispatchEvent(e);
    return e;
  };

  it('wires touch listeners on the scroll element and commits via pager.onNext', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const origRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (fn) => { fn(0); return 0; }; // run the peek-clear sync
    vi.useFakeTimers();
    try {
      const onNext = vi.fn(), onPrev = vi.fn();
      const pager = { peek: () => ({ kind: 'verses', verses: [] }), onNext, onPrev };
      const { result } = renderHook(() => usePagerGesture({ current: el }, pager));
      // The consumer (ScreenLayout) assigns these to the track + peek elements.
      result.current.trackRef.current = { style: {} };
      result.current.peekRef.current = { style: {} };
      // jsdom clientWidth is 0 → getWidth falls back to window.innerWidth (1024);
      // 35% ≈ 358px, so a -700px drag commits on distance alone.
      fire(el, 'touchstart', 800, 100);
      fire(el, 'touchmove', 700, 100);
      fire(el, 'touchmove', 100, 100);
      fire(el, 'touchend', 100, 100);
      vi.advanceTimersByTime(350); // settle timeout → finishSettle → onNext
      expect(onNext).toHaveBeenCalledTimes(1);
      expect(onPrev).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      globalThis.requestAnimationFrame = origRaf;
      document.body.removeChild(el);
    }
  });

  it('no-ops without a pager and detaches listeners on unmount', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const remove = vi.spyOn(el, 'removeEventListener');
    const { result, unmount } = renderHook(() => usePagerGesture({ current: el }, null));
    expect(result.current.peek).toEqual({ side: null, desc: null });
    unmount();
    // pager was null → effect returned early, so no listeners to remove.
    expect(remove).not.toHaveBeenCalled();
    document.body.removeChild(el);
  });
});
