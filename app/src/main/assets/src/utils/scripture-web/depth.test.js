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
  arcShape, arcHeight, maxZoomFor, PPV_MAX_CSS,
  ribbonStyle, segmentsFor, visibleWindow, localizeFactor, squashFactor,
  ALPHA_DEEP, arcTauOf, arcPointAt, footX,
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

/** The tanh ceiling's softness: the law S1 replaced, kept only for the control below. */
const CEIL_SOFTNESS = 1.9;
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

  /* D2's OWN target is +-25 % on ink contrast and +-10 % on ink share, in
     PIXELS, at 40x — dp-sw-depth.mjs paired before/after in one session. It is
     deliberately not restated here as a bound on alpha: alpha is one input to
     a premultiplied-over frame with thousands of crossings, and a bound on it
     would be my proxy for their measurement rather than their measurement.
     I wrote it that way first and it failed on phone375 at ratio 0.62 while
     phoneLand read 0.92 — the divisor is the same law, the frames just differ
     2.2x in density, which is the law working, not a defect.

     What IS checkable here is that the law is the one design-perf specified,
     with the constant they derived. These are their arithmetic, from the
     spec's section 4 as corrected at 18:30. */
  it('divides the deep alpha by design-perf own crowding factors at 40x', () => {
    // The 0.57 exponent, not the first cut's square root: 0.5 left this band
    // missed in the UP direction on every frame, measured on the real GPU.
    // These are design-perf's numbers for 0.57, predicted before the change
    // and reproduced by it.
    const cases = [
      { frame: 'phoneLand', per: 4256 / 800, divisor: 6.49 },
      { frame: 'phone375', per: 4316 / 375, divisor: 10.07 },
      { frame: 'desktop1920', per: 4220 / 1920, divisor: 3.92 },
    ];
    for (const c of cases) {
      const s = ribbonStyle(40, localizeFactor(40), false, c.per);
      expect(ALPHA_DEEP / s.alpha, c.frame + ' 40x crowding divisor').toBeCloseTo(c.divisor, 1);
    }
  });

  it('clamps that divisor to 1 at every ceiling, so D1 keeps the full value', () => {
    // The measured anchored density at each frame's own 44 px ceiling.
    for (const per of [141 / 800, 59 / 375, 336 / 1920]) {
      expect(ribbonStyle(1711, 1, false, per).alpha).toBeCloseTo(ALPHA_DEEP, 12);
    }
  });

  it('never brightens at 40x beyond the deep value itself', () => {
    // The wash direction is UP. Whatever the crowd reads, the deep alpha is a
    // ceiling, not a floor: an empty frame cannot be brighter than one ribbon.
    for (const per of [0, 1e-9, 0.001, 5, 500]) {
      expect(ribbonStyle(40, 1, false, per).alpha).toBeLessThanOrEqual(ALPHA_DEEP);
      expect(ribbonStyle(40, 1, true, per).alpha).toBeLessThanOrEqual(ALPHA_DEEP);
    }
  });
});

describe('S1 — arcs, not chords, at the ceiling', () => {
  // BEFORE on phoneLand at zoom 1,711: flat10 0.833, rise100 22 CSS px.
  const longSpan = 10000;
  const rx = rxOf(longSpan, 44);
  const shape = () => arcShape(rx, SQUASH);

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

  it('leaves the overview dome exactly where it was: the law at depth IS the overview law (the structure law)', () => {
    for (const span of [3, 40, 900, 10000]) {
      const r = rxOf(span, 800 / TOTAL);
      const { R, A } = arcShape(r, SQUASH);
      expect(R).toBe(r);
      expect(A).toBeCloseTo(r * SQUASH, 9);
    }
  });
});

describe('S2 — no apex smear', () => {
  it('puts a long arc apex ABOVE the frame, so nothing level is ever on screen', () => {
    const rx = rxOf(10000, 44);
    const { A } = arcShape(rx, SQUASH);
    expect(A).toBeGreaterThan(CEIL);
  });

  it('does NOT tower a short arc, which would be a smear of its own', () => {
    // A 3-verse arc at the ceiling is 132 CSS px wide. Its apex must stay
    // near the old law's, or every short arc leaves the frame as a needle.
    const rx = rxOf(3, 44);
    const { A } = arcShape(rx, SQUASH);
    const old = oldDeep(rx, CEIL).A;
    expect(A).toBeGreaterThan(old);
    expect(A).toBeLessThan(old * 1.35);
  });
});

describe('S4 — the departure fan: a verse\'s threads leave from their own slots in its cell, and spans separate by angle', () => {
  /** Slope of the drawn curve where it crosses half the frame height. */
  const slopeAtHalf = (span) => {
    const { R, A } = arcShape(rxOf(span, 44), SQUASH);
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
    // ceiling every long arc departed at 2-8 degrees. tan(30 deg) = 0.577.
    for (const span of [100, 3000, 30000]) {
      expect(slopeAtHalf(span), 'span ' + span + ' slope at half height').toBeGreaterThan(0.577);
    }
  });

  it('the longer the span the steeper the leg at half height, so spans separate by angle', () => {
    expect(slopeAtHalf(100)).toBeLessThan(slopeAtHalf(3000));
    expect(slopeAtHalf(3000)).toBeLessThan(slopeAtHalf(30000));
  });

  it('the feet: a verse\'s n threads take n slots across the verse\'s own width (footX), a lone thread its centre', () => {
    const cam = { x: 500, ppv: 44 * DPR, total: TOTAL };
    const lo = footX(cam, W, 500, -0.5), mid = footX(cam, W, 500, 0), hi = footX(cam, W, 500, 0.5);
    expect(mid - lo).toBeCloseTo(cam.ppv / 2, 6);
    expect(hi - lo).toBeCloseTo(cam.ppv, 6);
    expect(footX(cam, W, 500, undefined)).toBe(mid);
  });
});

describe('S3 — tessellation follows the screen, not the arc', () => {
  it('is the bucket own count at overview, so 1x cannot move', () => {
    expect(segmentsFor(48, 0, 1e9, CEIL, W, DPR, SQUASH)).toBe(48);
    expect(segmentsFor(8, 0, 1e9, CEIL, W, DPR, SQUASH)).toBe(8);
    const [xa, xb] = visibleWindow(-9e5, 9e5, W, 0);
    expect(xa).toBe(-9e5);
    expect(xb).toBe(9e5);
  });

  it('does not spend the whole cap on an arc 24 px wide', () => {
    expect(segmentsFor(8, 1, rxOf(3, 44), CEIL, W, DPR, SQUASH)).toBeLessThan(24);
  });

  /* The sweep. The rules above are bounds on ONE arc on ONE frame; this walks
     the drawn curve itself across twelve spans, three frames and three zooms
     and measures what a reader would actually see: the PERPENDICULAR distance
     from a curve point to its chord (what a polyline gets wrong), never over
     CHORD_TOL_CSS on any on-screen segment; and on an arc the frame holds
     whole, no segment over 24 CSS px. A leg steeper than the frame is straight
     to within a pixel, so its segments may be long: only the chord bounds it. */
  it('walks the drawn curve: no chord over 0.5 CSS px on screen at any zoom; no segment over 24 CSS px on an arc the frame holds whole', () => {
    const frames = [
      { name: 'phoneLand', wCss: 800, dpr: 2, ceilCss: 256 },
      { name: 'phone375', wCss: 375, dpr: 3, ceilCss: 413 },
      { name: 'desktop1920', wCss: 1920, dpr: 1, ceilCss: 950 },
    ];
    const spans = [1, 2, 3, 5, 10, 30, 100, 300, 1000, 3000, 10000, 31101];
    let whole = 0, legs = 0;
    for (const f of frames) {
      const wPx = f.wCss * f.dpr;
      const ceilPx = f.ceilCss * f.dpr;
      const squash = squashFactor(ceilPx, wPx);
      for (const zoom of [40, 400, maxZoomFor(TOTAL, f.wCss)]) {
        const localize = localizeFactor(zoom);
        const ppv = (wPx / TOTAL) * zoom;
        for (const span of spans) {
          const rx = (span * ppv) / 2;
          const { A } = arcShape(rx, squash);
          if (!(rx > 0) || !(A > 0)) continue;
          const left = wPx / 2;             // a foot mid-screen: the reader's case
          const right = left + 2 * rx;
          const [lo, hi] = visibleWindow(left, right, wPx, localize);
          const tA = arcTauOf(lo, left, right);
          const tB = arcTauOf(hi, left, right);
          const n = segmentsFor(48, localize, rx, ceilPx, wPx, f.dpr, squash);
          const held = A <= ceilPx && 2 * rx <= wPx;
          if (held) whole++; else legs++;
          const where = `${f.name} z${Math.round(zoom)} span${span} n${n}`;
          for (let i = 0; i < n; i++) {
            const p0 = arcPointAt(tA + ((tB - tA) * i) / n, left, right, A);
            const p1 = arcPointAt(tA + ((tB - tA) * (i + 1)) / n, left, right, A);
            if ((p0.h > ceilPx && p1.h > ceilPx) || (p0.x > wPx && p1.x > wPx)) continue;
            const dx = p1.x - p0.x, dh = p1.h - p0.h, len = Math.hypot(dx, dh);
            if (held) expect(len / f.dpr, where + ' segment').toBeLessThanOrEqual(24);
            for (let k = 1; k < 16; k++) {
              const u = k / 16;
              const m = arcPointAt(tA + ((tB - tA) * (i + u)) / n, left, right, A);
              const perp = len > 0 ? Math.abs((m.x - p0.x) * dh - (m.h - p0.h) * dx) / len : Math.hypot(m.x - p0.x, m.h - p0.h);
              expect(perp / f.dpr, where + ' chord (perpendicular)').toBeLessThanOrEqual(0.5);
            }
          }
        }
      }
    }
    expect(whole).toBeGreaterThan(20);
    expect(legs).toBeGreaterThan(20);
  });
});
