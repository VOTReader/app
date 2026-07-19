/* useReadingDwell — the dwell → reading-streak bridge.
   ─────────────────────────────────────────────────────────────────────
   Pins that a dwell COMMIT (timer elapse or the __onDwellCommit bridge)
   records today as a reading day on ReadingStreakStore, and that a
   cancelled dwell records nothing. ReadingStreakStore is a free-var
   global inside the hook (typeof-guarded, cluster-B idiom) so the tests
   stub window.ReadingStreakStore — matches use-tab-title-memo.test.js. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadingDwell } from './use-reading-dwell.js';

let _orig;
beforeEach(() => {
  _orig = window.ReadingStreakStore;
  vi.useFakeTimers();
});
afterEach(() => {
  window.ReadingStreakStore = _orig;
  vi.useRealTimers();
});

const mount = () => renderHook(() => useReadingDwell({ dwellMs: 1000, initialActiveReadKey: null }));

describe('useReadingDwell → ReadingStreakStore', () => {
  it('records a reading day when the dwell timer elapses', () => {
    const recordReadingDay = vi.fn();
    window.ReadingStreakStore = { recordReadingDay };
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('bible:psalms:23'); });
    act(() => { vi.advanceTimersByTime(1100); });
    expect(recordReadingDay).toHaveBeenCalledTimes(1);
    expect(result.current.activeReadKey).toBe('bible:psalms:23');
  });

  it('records a reading day when the __onDwellCommit bridge fires (scroll/fit path)', () => {
    const recordReadingDay = vi.fn();
    window.ReadingStreakStore = { recordReadingDay };
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('letter:wide-path'); });
    act(() => { window.__onDwellCommit(); });
    expect(recordReadingDay).toHaveBeenCalledTimes(1);
  });

  it('records NOTHING when the dwell is cancelled before committing', () => {
    const recordReadingDay = vi.fn();
    window.ReadingStreakStore = { recordReadingDay };
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('bible:psalms:23'); });
    act(() => { result.current.cancelDwell(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(recordReadingDay).not.toHaveBeenCalled();
  });

  it('survives a missing ReadingStreakStore (bare test hosts / load order)', () => {
    delete window.ReadingStreakStore;
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('bible:psalms:23'); });
    expect(() => act(() => { vi.advanceTimersByTime(1100); })).not.toThrow();
    expect(result.current.activeReadKey).toBe('bible:psalms:23');
  });

  it('a store throw does not break the dwell commit', () => {
    window.ReadingStreakStore = { recordReadingDay: () => { throw new Error('degraded'); } };
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('bible:psalms:23'); });
    expect(() => act(() => { vi.advanceTimersByTime(1100); })).not.toThrow();
    expect(result.current.activeReadKey).toBe('bible:psalms:23');
  });
});
