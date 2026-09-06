/* Scripture Web at depth — the v1 spec's targets, as assertions.
   ─────────────────────────────────────────────────────────────────────────
   Corbin, 2026-09-05, on the live Scripture Web: "fully zoomed in still looks
   terrible: the lines get squatty, almost horizontal, brightness dims
   excessively, individual lines are nearly impossible to see."

   design-perf measured that sentence on the frame a phone reader actually
   gets — ScriptureWebScreen locks landscape on a coarse pointer, so the canon
   is drawn 800x360 CSS at DPR 2 (`phoneLand`), dome ceiling 256 CSS px — and
   turned it into the numbered targets Z1, D1, D2, S1, S2, S3, S4 below. Every
   BEFORE quoted here is theirs, taken on origin/main 789e53c5.

   These are the LAW's half of each target. The pixel half is dp-sw-depth.mjs
   paired before/after in one session, and the frames read by eye are
   design-perf's; a number here passing is not the target met.
*/
import { describe, it, expect } from 'vitest';
import {
  arcShape, arcHeight, spanLogOf, maxZoomFor, PPV_MAX_CSS,
  ribbonStyle, segmentsFor, visibleWindow, localizeFactor, squashFactor, CEIL_SOFTNESS,
} from './geometry.js';

// design-perf's phoneLand frame, in DEVICE px (the shader's frame).
const DPR = 2;
const W = 800 * DPR;          // 1600
const CEIL = 256 * DPR;       // 512, their measured dome ceiling
const TOTAL = 31102;          // verses in the canon
const SQUASH = squashFactor(CEIL, W);
const zMax = maxZoomFor(TOTAL, W / DPR);   // 1710.61 on this frame

/** Half-span in device px of an arc of `span` verses at `ppvCss` CSS px/verse. */
const rxOf = (span, ppvCss) => (span * ppvCss * DPR) / 2;

/**
 * Share of an arc's ON-SCREEN length that lies within 10 degrees of
 * horizontal, sampled off the drawn curve. This is S1's flat10 for one arc;
 * design-perf's is the same quantity summed over the frame's whole ribbon.
 */
function flat10(R, A, ceilPx, widthPx) {
  const FLAT = Math.tan((10 * Math.PI) / 180);
  const end = Math.min(R, widthPx);
  const N = 4000;
  let total = 0;
  let flat = 0;
  for (let i = 0; i < N; i++) {
    const d0 = (end * i) / N;
    const d1 = (end * (i + 1)) / N;
    const h0 = arcHeight(d0, R, A);
    const h1 = arcHeight(d1, R, A);
    if (h0 > ceilPx) break;                    // off the top of the frame
    const dx = d1 - d0;
    const dy = h1 - h0;
    const len = Math.hypot(dx, dy);
    total += len;
    if (Math.abs(dy / dx) < FLAT) flat += len;
  }
  return total > 0 ? flat / total : 0;
}

/** The law this replaces, restated so the sampler above has a positive control. */
const oldDeep = (rx, ceilPx) => ({
  R: rx, A: ceilPx * Math.tanh(rx / (ceilPx * CEIL_SOFTNESS)),
});

describe('Z1 — the zoom ceiling is a RELATION, not a constant', () => {
  it('is 44 CSS px per verse, so phoneLand tops out at 1,711 and not at 4000', () => {
    expect(PPV_MAX_CSS).toBe(44);
    expect(maxZoomFor(TOTAL, 800)).toBeCloseTo(1710.61, 2);
    // The point of the relation: ppv at the ceiling is 44 on EVERY frame.
    for (const widthCss of [360, 375, 800, 1920]) {
      expect((maxZoomFor(TOTAL, widthCss) * widthCss) / TOTAL).toBeCloseTo(44, 9);
    }
  });

  it('scales with the canon and inversely with the frame', () => {
    expect(maxZoomFor(2 * TOTAL, 800)).toBeCloseTo(2 * maxZoomFor(TOTAL, 800), 6);
    expect(maxZoomFor(TOTAL, 1600)).toBeCloseTo(maxZoomFor(TOTAL, 800) / 2, 6);
    // design-perf's three frames, from the spec's section 3.
    expect(maxZoomFor(TOTAL, 375)).toBeCloseTo(3649.3, 1);
    expect(maxZoomFor(TOTAL, 1920)).toBeCloseTo(712.8, 1);
  });

  it('refuses a frame it cannot divide by instead of returning Infinity', () => {
    for (const bad of [0, -10, NaN, undefined, null]) {
      const z = maxZoomFor(TOTAL, /** @type {any} */ (bad));
      expect(Number.isFinite(z)).toBe(true);
      expect(z).toBeGreaterThan(1);
    }
  });
});

describe('D1 — a lone ribbon at the ceiling clears 3:1', () => {
  // The worst Distance stop needs an effective alpha of 0.83 on black and
  // 0.85 on parchment to reach 3:1 alone (design-perf, from the ramp and WCAG
  // luminance). BEFORE: 0.19 dark / 0.376 light, times strength 0.3 at worst.
  const AT_CEILING = 141 / 800;   // anchored arcs per CSS px of width, phoneLand

  it('reaches 0.85 in both themes at the ceiling', () => {
    for (const light of [false, true]) {
      const s = ribbonStyle(zMax, 1, light, AT_CEILING);
      expect(s.alpha).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('stops letting votes scale alpha at depth, or the weakest arc never gets there', () => {
    // strength floors at 0.30. If alpha still scaled by it, 0.9 x 0.3 = 0.27.
    expect(ribbonStyle(zMax, 1, false, AT_CEILING).voteMix).toBe(1);
    expect(ribbonStyle(1, 0, false, AT_CEILING).voteMix).toBe(0);
  });
});

describe('D2 — nothing below the ceiling washes out', () => {
  it('is the old law exactly at overview, whatever the density reads', () => {
    for (const light of [false, true]) {
      const a = ribbonStyle(1, 0, light, 0.0001);
      const b = ribbonStyle(1, 0, light, 900);
      expect(a.alpha).toBe(0.075);
      expect(a.strokeWidthCss).toBe(0.9);
      // Density must not be able to reach the overview frame at all.
      expect(b).toEqual(a);
    }
  });

  it('holds 40x within 25 % of before, on all three of design-perf frames', () => {
    const before = { dark: 0.19, light: 0.224 };     // spec section 1, at 40x
    const perCssPx = { phoneLand: 4256 / 800, phone375: 4316 / 375, desktop: 4220 / 1920 };
    for (const theme of ['dark', 'light']) {
      for (const frame of Object.keys(perCssPx)) {
        const after = ribbonStyle(40, localizeFactor(40), theme === 'light', perCssPx[frame]).alpha;
        const ratio = after / before[theme];
        const label = frame + ' ' + theme + ' 40x alpha ratio';
        expect(ratio, label).toBeGreaterThan(0.75);
        expect(ratio, label).toBeLessThan(1.25);
      }
    }
  });
});

describe('S1 — arcs, not chords, at the ceiling', () => {
  // BEFORE on phoneLand at zoom 1,711: flat10 0.833, rise100 22 CSS px.
  const longSpan = 10000;
  const rx = rxOf(longSpan, 44);
  const shape = () => arcShape(rx, CEIL, SQUASH, 1, spanLogOf(longSpan, TOTAL));

  it('rises 100 CSS px within 100 CSS px of its foot (before: 22)', () => {
    const { R, A } = shape();
    const rise100 = arcHeight(100 * DPR, R, A) / DPR;
    expect(rise100).toBeGreaterThanOrEqual(100);
  });

  it('leaves at most a tenth of its on-screen length within 10 deg of flat (before: 0.833)', () => {
    const { R, A } = shape();
    expect(flat10(R, A, CEIL, W)).toBeLessThanOrEqual(0.10);
  });

  it('CONTROL, and this file precondition: the sampler CAN see flatness', () => {
    // The same sampler on the law being replaced. If this ever goes green the
    // measurement above is vacuous and nothing else in this describe means
    // anything, whatever colour it shows.
    const old = oldDeep(rx, CEIL);
    expect(flat10(old.R, old.A, CEIL, W)).toBeGreaterThan(0.40);
    expect(arcHeight(100 * DPR, old.R, old.A) / DPR).toBeLessThan(40);
  });

  it('leaves the overview dome exactly where it was', () => {
    // localize 0 is the whole of D2's identity claim, stated on the law.
    for (const span of [3, 40, 900, 10000]) {
      const r = rxOf(span, 800 / TOTAL);
      const { R, A } = arcShape(r, CEIL, SQUASH, 0, spanLogOf(span, TOTAL));
      expect(R).toBe(r);
      expect(A).toBeCloseTo(r * SQUASH, 9);
    }
  });
});

describe('S2 — no apex smear', () => {
  it('puts a long arc apex ABOVE the frame, so nothing level is ever on screen', () => {
    const rx = rxOf(10000, 44);
    const { A } = arcShape(rx, CEIL, SQUASH, 1, spanLogOf(10000, TOTAL));
    expect(A).toBeGreaterThan(CEIL);
  });

  it('does NOT tower a short arc, which would be a smear of its own', () => {
    // A 3-verse arc at the ceiling is 132 CSS px wide. Its apex must stay
    // near the old law's, or every short arc leaves the frame as a needle.
    const rx = rxOf(3, 44);
    const { A } = arcShape(rx, CEIL, SQUASH, 1, spanLogOf(3, TOTAL));
    const old = oldDeep(rx, CEIL).A;
    expect(A).toBeGreaterThan(old);
    expect(A).toBeLessThan(old * 1.35);
  });
});

describe('S4 — the departure fan: arcs from one foot leave at different angles', () => {
  /** Slope of the drawn curve where it crosses half the frame height. */
  const slopeAtHalf = (span) => {
    const { R, A } = arcShape(rxOf(span, 44), CEIL, SQUASH, 1, spanLogOf(span, TOTAL));
    const target = CEIL / 2;
    let lo = 0;
    let hi = Math.max(R, 1);
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (arcHeight(mid, R, A) < target) lo = mid; else hi = mid;
    }
    const d = (lo + hi) / 2;
    return arcHeight(d + 0.5, R, A) - arcHeight(d - 0.5, R, A);
  };

  it('leaves STEEPLY whatever the span, which is the half the old law lost', () => {
    // Corbin: "7 arcs per verse fan across a few pixels". Under the tanh
    // ceiling every long arc departs at 2-8 degrees, so the fan is not that
    // the angles are equal - it is that they are all flat. tan(30 deg) = 0.577.
    for (const span of [100, 3000, 30000]) {
      expect(slopeAtHalf(span), 'span ' + span + ' slope at half height')
        .toBeGreaterThan(0.577);
    }
  });

  // GUARDS THE FIX, CANNOT BE RED TODAY: the old law's R is rx, which already
  // grows with span, so this passes on main for a reason that has nothing to
  // do with a fan. It exists to stop a later version collapsing every long
  // arc onto ONE quarter radius, which is the bite the spec names for S4.
  it('and they are still DISTINGUISHABLE from each other, or there is no fan', () => {
    const quarterFor = (span) =>
      arcShape(rxOf(span, 44), CEIL, SQUASH, 1, spanLogOf(span, TOTAL)).R;
    expect(quarterFor(100)).toBeLessThan(quarterFor(3000));
    expect(quarterFor(3000)).toBeLessThan(quarterFor(30000));
    expect(quarterFor(30000) / quarterFor(100)).toBeGreaterThan(1.5);
    expect(slopeAtHalf(100)).toBeGreaterThan(slopeAtHalf(30000) * 1.4);
  });
});

describe('S3 — tessellation follows the screen, not the arc', () => {
  it('is the bucket own count at overview, so 1x cannot move', () => {
    expect(segmentsFor(48, 0, 1e9, CEIL, W)).toBe(48);
    expect(segmentsFor(8, 0, 1e9, CEIL, W)).toBe(8);
    const [xa, xb] = visibleWindow(-9e5, 9e5, W, 0);
    expect(xa).toBe(-9e5);
    expect(xb).toBe(9e5);
  });

  it('keeps every on-screen segment under 24 CSS px at the ceiling', () => {
    // BEFORE: the parameter runs over the WHOLE arc, so a 10,000-verse arc at
    // 44 px/verse spreads 48 segments over 440,000 CSS px and the piece that
    // crosses the screen is one straight chord.
    // Segments are spread evenly over the WINDOW, so the longest one on screen
    // is bounded by the window's own run divided by the count - clipping the
    // window IS what puts the samples where the reader is looking.
    const rx = rxOf(10000, 44);
    const [xa, xb] = visibleWindow(-rx, rx, W, 1);
    const windowRunCss = (xb - xa + CEIL) / DPR;
    const n = segmentsFor(48, 1, rx, CEIL, W);
    expect(windowRunCss / n).toBeLessThanOrEqual(24);
  });

  it('does not spend 96 segments on an arc 24 px wide', () => {
    expect(segmentsFor(8, 1, rxOf(3, 44), CEIL, W)).toBeLessThan(24);
  });
});
