/* n247 (s16.2): the tour card's placement, as a pure function of numbers. The overlay's own tests drive it
   through jsdom; these pin the arithmetic: below / above / clamped, the docked card's cap and its room,
   the player bar lifting a docked card, and the pressed stop that undocks to clear the ring it points at. */
import { describe, it, expect } from 'vitest';
import { placeTourCard, ringOnScreen } from './TourOverlay.jsx';

const NO_LINES = { rowOff: 0, lines: [] };
const base = { vh: 800, ring: null, top0: 0, docked: false, afterPressed: false, barTop: null, scrollerTop: 60, cardNeed: 0, cardH: 200, geom: NO_LINES };
const ring = (top, height = 50) => ({ left: 20, top, width: 100, height });

describe('placeTourCard', () => {
  it('no ring, not docked: the card sits 16 px off the bottom', () => {
    const p = placeTourCard(base);
    expect(p.docked).toBe(false);
    expect(p.cardStyle).toEqual({ bottom: '16px' });
    expect(p.clear).toBe(false);
  });

  it('a ring near the top: the card goes below it, an arrow\'s gap away, and clears it', () => {
    const p = placeTourCard({ ...base, ring: ring(100) });
    expect(p.below).toBe(true);
    expect(p.cardTop).toBe(100 + 50 + 18);
    expect(p.clear).toBe(true);
    expect(p.cardStyle.top).toBe('168px');
  });

  it('a ring near the bottom: the card goes above it', () => {
    const p = placeTourCard({ ...base, ring: ring(650) });
    expect(p.below).toBe(false);
    expect(p.cardTop).toBe(650 - 18 - 200);
    expect(p.clear).toBe(true);
  });

  it('no room either side: the card is clamped inside the screen, over the ring if it must', () => {
    const p = placeTourCard({ ...base, vh: 400, ring: ring(150, 120), cardH: 300 });
    expect(p.cardTop).toBeGreaterThanOrEqual(12);
    expect(p.cardTop + p.h).toBeLessThanOrEqual(400 - 12);
  });

  it('docked: on the bottom edge, its pad the room it takes, capped to leave the reading column open', () => {
    const p = placeTourCard({ ...base, docked: true, cardH: 900, cardNeed: 900 });
    expect(p.docked).toBe(true);
    // the room: 800 - 12 (edge) - (60 scroller top + 120 open) = 608
    expect(p.cap).toBe(608);
    expect(p.cardTop).toBe(800 - 12 - 608);
    expect(p.dockPad).toBe(800 - p.cardTop);
    expect(p.cardStyle).toEqual({ bottom: '12px', maxHeight: '608px' });
  });

  it('docked prefers 36 % of the screen, and never less than 160 px', () => {
    expect(placeTourCard({ ...base, docked: true, cardH: 100 }).cap).toBe(Math.round(800 * 0.36));
    expect(placeTourCard({ ...base, vh: 300, docked: true, cardH: 100 }).cap).toBe(160);
  });

  it('the player bar lifts a docked card above it', () => {
    const p = placeTourCard({ ...base, docked: true, barTop: 720 });
    expect(p.dockBottom).toBe(12 + 80);
    expect(p.cardStyle.bottom).toBe('92px');
  });

  it('a pressed stop pointing at what the press revealed undocks when the docked card would cover it', () => {
    const covered = placeTourCard({ ...base, vh: 360, docked: true, afterPressed: true, ring: ring(229, 44), scrollerTop: 0 });
    expect(covered.docked).toBe(false);
    const clear = placeTourCard({ ...base, docked: true, afterPressed: true, ring: ring(100, 44) });
    expect(clear.docked).toBe(true);
  });

  it('ringOnScreen: wholly inside the viewport only', () => {
    expect(ringOnScreen(ring(10), 800)).toBe(true);
    expect(ringOnScreen(ring(-5), 800)).toBe(false);
    expect(ringOnScreen(ring(780), 800)).toBe(false);
    expect(ringOnScreen(null, 800)).toBe(false);
  });
});
