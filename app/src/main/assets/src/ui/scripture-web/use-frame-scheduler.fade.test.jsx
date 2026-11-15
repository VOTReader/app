// @ts-nocheck — test-only (vitest)
/* My Web's fade at the cap's release (myweb-pop, vot-ui 11-15). On desktop about half the releases hit one
   94-124 ms frame; on the pure clock the next frame landed at ~0.47 and the reader saw the rails jump halfway.
   The fraction now advances from the last drawn one by at most a third of the 250 ms fade a frame. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFrameScheduler } from './use-frame-scheduler.js';

let now = 1000;
afterEach(() => { vi.restoreAllMocks(); });

function released() {
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const { result } = renderHook(() => useFrameScheduler());
  const s = result.current;
  act(() => { s.live(); });
  now += 200;                         // past the 150 ms hold
  expect(s.capFractionNow()).toBe(0); // the release frame starts the fade at 0
  return s;
}
const at = (s, dt) => { now += dt; return s.capFractionNow(); };

describe('useFrameScheduler: the fade at the cap release', () => {
  it('a 16 ms cadence is the 250 ms clock exactly', () => {
    const s = released();
    expect(at(s, 16)).toBeCloseTo(16 / 250, 6);
    expect(at(s, 16)).toBeCloseTo(32 / 250, 6);
    expect(at(s, 40)).toBeCloseTo(72 / 250, 6);
  });

  it('a 120 ms stall moves the fade a third, not halfway, and the rest still shows in frames', () => {
    const s = released();
    const f1 = at(s, 120);
    expect(f1).toBeCloseTo(1 / 3, 6);
    const seen = [f1];
    let f = f1;
    while (f < 1) { f = at(s, 16); seen.push(f); }
    expect(seen.filter((x) => x > 0 && x < 1).length).toBeGreaterThanOrEqual(3);
  });

  it('a second call in the same frame does not move it', () => {
    const s = released();
    const f = at(s, 30);
    expect(at(s, 0)).toBe(f);
  });

  it('ends at 1 and a new release starts from 0 again', () => {
    const s = released();
    let f = 0;
    for (let i = 0; i < 40 && f < 1; i++) f = at(s, 16);
    expect(f).toBe(1);
    expect(s.capFractionNow()).toBe(1);
    act(() => { s.live(); });
    now += 200;
    expect(s.capFractionNow()).toBe(0);
    expect(at(s, 16)).toBeCloseTo(16 / 250, 6);
  });
});
