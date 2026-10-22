/* fly-path: the camera's way from one place to another (A3). The path ends where it says, rises
   to show both ends of a long hop, stays nearly level for a short one, and a fly's length is the
   spec's 600-900 ms. */
import { describe, it, expect } from 'vitest';
import { flyPath, flyMs, easeInOutCubic } from './fly-path.js';

const widest = (p) => {
  let w = 0;
  for (let i = 0; i <= 100; i++) w = Math.max(w, p.at(i / 100)[1]);
  return w;
};

describe('flyPath', () => {
  it('starts where the camera is and ends where it is going', () => {
    const p = flyPath(100, 50, 20000, 80);
    expect(p.at(0)[0]).toBeCloseTo(100, 6);
    expect(p.at(0)[1]).toBeCloseTo(50, 6);
    expect(p.at(1)).toEqual([20000, 80]);
    expect(p.at(0.999)[0]).toBeCloseTo(20000, -1);
  });
  it('a long hop zooms out on the way, far past either end, and then back in', () => {
    const p = flyPath(100, 50, 20000, 50);
    expect(widest(p), 'Genesis to the Gospels: the camera rises to see both').toBeGreaterThan(50 * 50);
    expect(p.at(0.5)[1]).toBeCloseTo(widest(p), -2);
  });
  it('a short hop stays nearly level', () => {
    const p = flyPath(1000, 50, 1030, 50);
    expect(widest(p) / 50).toBeLessThan(1.25);
  });
  it('the centre moves one way only, start to end', () => {
    const p = flyPath(100, 50, 20000, 80);
    let last = -Infinity;
    for (let i = 0; i <= 50; i++) {
      const c = p.at(i / 50)[0];
      expect(c).toBeGreaterThanOrEqual(last - 1e-6);
      last = c;
    }
  });
  it('a zoom alone (no pan) is an even exponential in the width', () => {
    const p = flyPath(500, 400, 500, 25);
    expect(p.at(0.5)[1]).toBeCloseTo(100, 6);
    expect(p.at(0.5)[0]).toBe(500);
    expect(p.S).toBeGreaterThan(0);
  });
  it('nowhere to go has no length', () => {
    expect(flyPath(500, 40, 500, 40).S).toBe(0);
  });
  it('a hair of a pan with a big zoom (b large) is the zoom, not a NaN: no cancellation in r0, r1', () => {
    // dx 1e-5 is past the zoom-alone branch (dx^2 > 1e-12), so b0 and b1 are about 2.5e10 and
    // 2.5e8; log(sqrt(b^2 + 1) - b) took the log of 0 there (review of 2026-10-18), -asinh(b) does not
    const RHO = Math.SQRT2;
    for (const [w0, w1] of [[100, 10000], [10000, 100]]) {
      const p = flyPath(500, w0, 500 + 1e-5, w1);
      expect(Number.isFinite(p.S), w0 + ' to ' + w1).toBe(true);
      expect(p.S / (Math.abs(Math.log(w1 / w0)) / RHO), 'the zoom-alone length').toBeCloseTo(1, 6);
      expect(p.at(0.5)[1] / Math.sqrt(w0 * w1), 'halfway in the even exponential').toBeCloseTo(1, 4);
      let last = w0;
      for (let i = 1; i <= 20; i++) {
        const [c, w] = p.at(i / 20);
        expect(Math.abs(c - 500)).toBeLessThan(1e-3);
        expect(w1 > w0 ? w >= last : w <= last).toBe(true);
        last = w;
      }
    }
  });
});

describe('flyMs and the ease', () => {
  it('a go-to takes 600-900 ms: a near hop the least, the longest the most', () => {
    expect(flyMs(flyPath(1000, 50, 1030, 50).S)).toBe(600);
    expect(flyMs(flyPath(0, 50, 31000, 50).S)).toBeGreaterThan(800);
    expect(flyMs(1e6)).toBe(900);
  });
  it('the ease leaves slowly and arrives slowly', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });
});
