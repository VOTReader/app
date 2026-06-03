/* GardenView swipe-decision tests — UX4.
   ──────────────────────────────────────
   The full GardenView render needs ~10 free globals (PlatformBridge,
   gardenPreload, gardenCrawled, GARDEN_TOTAL, …), so we pin the swipe
   DECISION directly — that's the unit that carries the risk (threshold +
   direction). The handler that consumes it is a thin wrapper: read touch
   coords, clamp to [1, GARDEN_TOTAL], call onPageChange.
*/

import { describe, it, expect } from 'vitest';
import { gardenSwipeDir } from './GardenView.jsx';

describe('gardenSwipeDir — UX4 horizontal swipe', () => {
  it('flips forward (+1) on a clear leftward drag', () => {
    expect(gardenSwipeDir(-80, 5)).toBe(1);
  });
  it('flips back (-1) on a clear rightward drag', () => {
    expect(gardenSwipeDir(80, -5)).toBe(-1);
  });
  it('ignores a tap (no movement)', () => {
    expect(gardenSwipeDir(0, 0)).toBe(0);
  });
  it('ignores a short horizontal nudge below the threshold', () => {
    expect(gardenSwipeDir(40, 0)).toBe(0);
  });
  it('ignores a mostly-vertical drag (scroll, not a page flip)', () => {
    expect(gardenSwipeDir(-80, 70)).toBe(0);
  });
  it('honors the boundary: 60px exactly is not enough (strict >)', () => {
    expect(gardenSwipeDir(-60, 0)).toBe(0);
    expect(gardenSwipeDir(-61, 0)).toBe(1);
  });
  it('honors the dy ceiling: 45px exactly is too much (strict <)', () => {
    expect(gardenSwipeDir(80, 45)).toBe(0);
    expect(gardenSwipeDir(80, 44)).toBe(-1);
  });
});
