/* useReadingDwell — immediate position commit + the streak-only dwell.
   ─────────────────────────────────────────────────────────────────────
   SEMANTICS (2026-07-19, owner-reported): the resume cursor
   (activeReadKey + the caller's commitFn) commits IMMEDIATELY at
   setActiveReadKey — the reading dot must point at wherever the user
   actually last was, not at wherever the last COMPLETED 20s dwell
   happened (the "dot takes me somewhere unexpected" bug). The dwell
   timer now gates ONLY the ReadingStreakStore day record.
   ReadingStreakStore is a free-var global inside the hook (typeof-
   guarded, cluster-B idiom) so the tests stub window.ReadingStreakStore. */

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

describe('useReadingDwell — position commits immediately', () => {
  it('sets activeReadKey + runs the commitFn AT ARM TIME — no dwell gate', () => {
    window.ReadingStreakStore = { recordReadingDay: vi.fn() };
    const commitFn = vi.fn();
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('proverbs', commitFn); });
    // No timers advanced: the position is already committed.
    expect(result.current.activeReadKey).toBe('proverbs');
    expect(commitFn).toHaveBeenCalledTimes(1);
  });

  it('a quick chapter hop re-commits each position (the "read a couple chapters" repro)', () => {
    window.ReadingStreakStore = { recordReadingDay: vi.fn() };
    const writes = [];
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('proverbs', () => writes.push('proverbs:1')); });
    act(() => { vi.advanceTimersByTime(300); }); // well under the dwell
    act(() => { result.current.setActiveReadKey('proverbs', () => writes.push('proverbs:2')); });
    act(() => { result.current.setActiveReadKey('2corinthians', () => writes.push('2cor:2')); });
    // Every hop became the resume point the moment it happened.
    expect(writes).toEqual(['proverbs:1', 'proverbs:2', '2cor:2']);
    expect(result.current.activeReadKey).toBe('2corinthians');
  });

  it('a null key cancels the pending streak dwell but NEVER clears the position', () => {
    const recordReadingDay = vi.fn();
    window.ReadingStreakStore = { recordReadingDay };
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('proverbs'); });
    act(() => { result.current.setActiveReadKey(null); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.activeReadKey).toBe('proverbs'); // position survives
    expect(recordReadingDay).not.toHaveBeenCalled();       // streak dwell cancelled
  });

  it('a throwing commitFn cannot break the arm — position still lands', () => {
    window.ReadingStreakStore = { recordReadingDay: vi.fn() };
    const { result } = mount();
    expect(() => act(() => {
      result.current.setActiveReadKey('psalms', () => { throw new Error('cursor write failed'); });
    })).not.toThrow();
    expect(result.current.activeReadKey).toBe('psalms');
  });
});

describe('useReadingDwell → ReadingStreakStore (the dwell-gated half)', () => {
  it('records a reading day only when the dwell timer elapses', () => {
    const recordReadingDay = vi.fn();
    window.ReadingStreakStore = { recordReadingDay };
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('bible:psalms:23'); });
    expect(recordReadingDay).not.toHaveBeenCalled(); // position ≠ streak
    act(() => { vi.advanceTimersByTime(1100); });
    expect(recordReadingDay).toHaveBeenCalledTimes(1);
  });

  it('TOMBSTONE: the __onDwellCommit bridge is gone (deleted 2026-08-03 — no callers)', () => {
    // The bridge let ScreenLayout force a dwell commit; nothing had called
    // it since position-is-immediate (2026-07-19), and the read tracker
    // (use-read-tracker.js) now owns all screen-side reading signals. If
    // this hook ever binds it again, that is a design regression — the
    // streak day-record's ONLY trigger is the completed dwell timer.
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('letter:wide-path'); });
    expect(window.__onDwellCommit).toBeUndefined();
  });

  it('records NOTHING when the dwell is cancelled before committing', () => {
    const recordReadingDay = vi.fn();
    window.ReadingStreakStore = { recordReadingDay };
    const { result } = mount();
    act(() => { result.current.setActiveReadKey('bible:psalms:23'); });
    act(() => { result.current.cancelDwell(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(recordReadingDay).not.toHaveBeenCalled();
    expect(result.current.activeReadKey).toBe('bible:psalms:23'); // cancel is streak-only
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
