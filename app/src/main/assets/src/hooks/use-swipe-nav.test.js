import { describe, it, expect } from 'vitest';
import { swipeDir } from './use-swipe-nav.js';

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
