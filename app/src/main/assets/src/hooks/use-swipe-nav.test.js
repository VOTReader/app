import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { swipeDir, useSwipeNav } from './use-swipe-nav.js';

describe('swipeDir — horizontal swipe detection', () => {
  it('advances (+1) on a clear leftward drag', () => {
    expect(swipeDir(-90, 8)).toBe(1);
  });
  it('goes back (-1) on a clear rightward drag', () => {
    expect(swipeDir(90, -8)).toBe(-1);
  });
  it('ignores a tap', () => {
    expect(swipeDir(0, 0)).toBe(0);
  });
  it('ignores a mostly-vertical drag so reading-scroll never flips', () => {
    expect(swipeDir(-90, 80)).toBe(0);
  });
  it('ignores a sub-threshold horizontal nudge', () => {
    expect(swipeDir(50, 0)).toBe(0);
  });
  it('honors the thresholds at the boundary', () => {
    expect(swipeDir(-60, 0)).toBe(0);
    expect(swipeDir(-61, 0)).toBe(1);
    expect(swipeDir(80, 45)).toBe(0);
    expect(swipeDir(80, 44)).toBe(-1);
  });
});

describe('useSwipeNav — NAV4 (ignore a swipe begun on a tappable element)', () => {
  const origSel = window.getSelection;
  // jsdom: an empty selection so onTouchEnd's selection-guard passes through.
  window.getSelection = () => /** @type {any} */ ('');

  const swipe = (handlers, target) => {
    handlers.onTouchStart({ target, touches: [{ clientX: 200, clientY: 100 }] });
    handlers.onTouchEnd({ changedTouches: [{ clientX: 90, clientY: 105 }] }); // 110px leftward = a swipe
  };

  it('a swipe starting on a link/icon does NOT navigate', () => {
    const onNext = vi.fn(), onPrev = vi.fn();
    const { result } = renderHook(() => useSwipeNav(onNext, onPrev));
    swipe(result.current, { closest: () => ({}) }); // closest() finds a tappable ancestor
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('a swipe starting on plain text DOES navigate', () => {
    const onNext = vi.fn(), onPrev = vi.fn();
    const { result } = renderHook(() => useSwipeNav(onNext, onPrev));
    swipe(result.current, { closest: () => null }); // no tappable ancestor
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  // restore
  window.getSelection = origSel;
});
