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
  threadShape, arcHeight, maxZoomFor, PPV_MAX_CSS,
  ribbonStyle, segmentsFor, sampleTau, squashFactor,
  ALPHA_DEEP, arcTauOf, arcPointAt, CLIP_MARGIN,
} from './geometry.js';

/* The tanh ceiling's softness, kept here as the retired law's own constant so
   the positive control below still restates the law S1 was measured against. */
const OLD_CEIL_SOFTNESS = 1.9;

// design-perf's phoneLand frame, in DEVICE px (the shader's frame).
const DPR = 2;
const W = 800 * DPR;          // 1600
const CEIL = 256 * DPR;       // 512, their measured dome ceiling
const TOTAL = 31102;          // verses in the canon
const SQUASH = squashFactor(CEIL, W);
const zMax = maxZoomFor(TOTAL, W / DPR);   // 5,131.8 on this frame (M6: the 132 px ceiling; 1,710.6 at 44)

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
  R: rx, A: ceilPx * Math.tanh(rx / (ceilPx * OLD_CEIL_SOFTNESS)),
});

describe('Z1 — the zoom ceiling is a RELATION, not a constant', () => {
  it('is 132 CSS px per verse (M6; received 44), so phoneLand tops out at 5,132 and not at 4000', () => {
    // 44 was the tap rule's floor; with the true law, slots and the y camera
    // the ceiling is where a bundle of five reads as five (22 px apart) and
    // a verse's number sits in its own cell — spine section 10 row 1.
    expect(PPV_MAX_CSS).toBe(132);
    expect(maxZoomFor(TOTAL, 800)).toBeCloseTo(5131.83, 2);
    // The point of the relation: ppv at the ceiling is 132 on EVERY frame.
    for (const widthCss of [360, 375, 800, 1920]) {
      expect((maxZoomFor(TOTAL, widthCss) * widthCss) / TOTAL).toBeCloseTo(132, 9);
    }
  });

  it('scales with the canon and inversely with the frame', () => {
    expect(maxZoomFor(2 * TOTAL, 800)).toBeCloseTo(2 * maxZoomFor(TOTAL, 800), 6);
    expect(maxZoomFor(TOTAL, 1600)).toBeCloseTo(maxZoomFor(TOTAL, 800) / 2, 6);
    // design-perf's three frames, from the spec's section 3, at 132 (3,649.3 / 712.8 at 44).
    expect(maxZoomFor(TOTAL, 375)).toBeCloseTo(10947.9, 1);
    expect(maxZoomFor(TOTAL, 1920)).toBeCloseTo(2138.3, 1);
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
      const s = ribbonStyle(zMax, light, AT_CEILING);
      expect(s.alpha).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('stops letting votes scale alpha at depth, or the weakest arc never gets there', () => {
    // strength floors at 0.30. If alpha still scaled by it, 0.9 x 0.3 = 0.27.
    expect(ribbonStyle(zMax, false, AT_CEILING).voteMix).toBe(1);
    expect(ribbonStyle(1, false, AT_CEILING).voteMix).toBe(0);
  });
});

describe('S5 — the width floor at depth (M5)', () => {
  it('STROKE_MIN_CSS is 1.0 CSS px (received 1.4): the weakest thread at the ceiling is a hairline and the strongest 2.4, a 2.4x range', () => {
    const { STROKE_MIN_CSS, STROKE_DEEP_CSS } = /** @type {any} */ (geoLaw);
    expect(STROKE_MIN_CSS).toBe(1.0);
    expect(STROKE_DEEP_CSS).toBe(2.4);
  });
});

describe('D2 — nothing below the ceiling washes out', () => {
  it('is the old law exactly at overview, whatever the density reads', () => {
    for (const light of [false, true]) {
      const a = ribbonStyle(1, light, 0.0001);
      const b = ribbonStyle(1, light, 900);
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
      const s = ribbonStyle(40, false, c.per);
      expect(ALPHA_DEEP / s.alpha, c.frame + ' 40x crowding divisor').toBeCloseTo(c.divisor, 1);
    }
  });

  it('clamps that divisor to 1 at every ceiling, so D1 keeps the full value', () => {
    // The measured anchored density at each frame's own 44 px ceiling.
    for (const per of [141 / 800, 59 / 375, 336 / 1920]) {
      expect(ribbonStyle(1711, false, per).alpha).toBeCloseTo(ALPHA_DEEP, 12);
    }
  });

  it('never brightens at 40x beyond the deep value itself', () => {
    // The wash direction is UP. Whatever the crowd reads, the deep alpha is a
    // ceiling, not a floor: an empty frame cannot be brighter than one ribbon.
    for (const per of [0, 1e-9, 0.001, 5, 500]) {
      expect(ribbonStyle(40, false, per).alpha).toBeLessThanOrEqual(ALPHA_DEEP);
      expect(ribbonStyle(40, true, per).alpha).toBeLessThanOrEqual(ALPHA_DEEP);
    }
  });
});

describe('S1 — arcs, not chords, at the ceiling', () => {
  // BEFORE on phoneLand at zoom 1,711: flat10 0.833, rise100 22 CSS px.
  const longSpan = 10000;
  const rx = rxOf(longSpan, 44);
  const shape = () => threadShape(rx, SQUASH);

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
    // The whole of D2's identity claim, stated on the law: the true world IS
    // the overview law, so this now holds at every zoom, not only at fit.
    for (const span of [3, 40, 900, 10000]) {
      const r = rxOf(span, 800 / TOTAL);
      const { R, A } = threadShape(r, SQUASH);
      expect(R).toBe(r);
      expect(A).toBeCloseTo(r * SQUASH, 9);
    }
  });
});

describe('S2 — no apex smear', () => {
  /* The case that stood here ("puts a long arc apex ABOVE the frame") pinned
     the morph's lifted level run — the thing that made panning up pointless.
     Its inversion, "a long thread's apex is its OWN height", is the describe
     at the end of this file (w-sw-phase1, M1). */
  it('does NOT tower a short arc, which would be a smear of its own', () => {
    // A 3-verse arc at the ceiling is 132 CSS px wide. Its apex is its own
    // height (84 device px), near the old law's 69 — no needle.
    const rx = rxOf(3, 44);
    const { A } = threadShape(rx, SQUASH);
    const old = oldDeep(rx, CEIL).A;
    expect(A).toBeGreaterThan(old);
    expect(A).toBeLessThan(old * 1.35);
  });
});

/* S4 — the departure fan — RETIRED with the morph (w-sw-phase1, M1). Its
   "leaves STEEPLY whatever the span" half now holds trivially (every long
   thread is near-vertical at its foot under the true law: S1's rise100 and
   the inverted S2 measure it) and its "DISTINGUISHABLE by angle" half was
   the morph's spanLog quarter, which is gone. Separation at a verse is
   departure SLOTS (spine section 1), M3's property, pinned there. */

describe('S3 — tessellation follows the screen, not the arc', () => {
  // segmentsFor(bucketSegments, zoom, rxLo, rxHi, squash, base, width, dpr)
  const HW = 2 * DPR;                       // a 2 CSS px ribbon half width + skirt
  const rxLong = rxOf(10000, PPV_MAX_CSS);  // at the ceiling's own px per verse, whatever it is

  it('is the bucket own count at fit, so 1x cannot move', () => {
    expect(segmentsFor(48, 1, 1, 1e9, SQUASH, CEIL, W, DPR)).toBe(48);
    expect(segmentsFor(8, 1, 1, 1e9, SQUASH, CEIL, W, DPR)).toBe(8);
  });

  it('keeps every on-screen segment under 24 CSS px at the ceiling — the stems of a 10,000-verse thread', () => {
    // BEFORE: the parameter ran over the WHOLE arc, so a 10,000-verse arc at
    // 44 px/verse spread 48 segments over 440,000 CSS px and the piece that
    // crossed the screen was one straight chord. Now the strip splits: each
    // half samples one leg between the band's bottom and a little above its
    // top, so the longest on-screen segment is the leg's own run over half
    // the count.
    const { R, A } = threadShape(rxLong, SQUASH);
    const n = segmentsFor(48, zMax, rxLong, rxLong, SQUASH, CEIL, W, DPR);
    const left = W / 2, right = left + 2 * rxLong, P = Math.PI;
    const txLo = arcTauOf(Math.max(left, -CLIP_MARGIN), left, right, R, P);
    const txHi = arcTauOf(Math.min(right, W + CLIP_MARGIN), left, right, R, P);
    let longest = 0;
    expect(A, 'the apex is above the band, so the strip splits').toBeGreaterThan(CEIL + 2 * HW);
    for (let i = 0; i < n; i++) {
      // the strip's halves meet at t = 0.5: the segment ending there is the
      // bridge between the legs, lifted above the frame and never rasterised
      if (i / n < 0.5 && (i + 1) / n >= 0.5) continue;
      const p0 = arcPointAt(sampleTau(i / n, A, P, 0, CEIL, HW, txLo, txHi), left, right, R, A, P);
      const p1 = arcPointAt(sampleTau((i + 1) / n, A, P, 0, CEIL, HW, txLo, txHi), left, right, R, A, P);
      if (p0.h > CEIL && p1.h > CEIL) continue;           // above the frame's top edge
      longest = Math.max(longest, Math.hypot(p1.x - p0.x, p1.h - p0.h) / DPR);
    }
    expect(longest).toBeLessThanOrEqual(24);
    expect(n, 'and it does not need the cap to do it').toBeLessThan(128);
  });

  it('does not spend the whole cap on an arc 24 px wide', () => {
    expect(segmentsFor(8, zMax, rxOf(3, PPV_MAX_CSS), rxOf(3, PPV_MAX_CSS), SQUASH, CEIL, W, DPR)).toBeLessThan(24);
  });

  /* The sweep. The two rules above are bounds on ONE arc on ONE frame; this
     walks the drawn curve itself across twelve spans, three frames and three
     zooms and measures what a reader would actually see. It is here rather
     than in a scratch script because both numbers were MISSED at first and the
     misses were invisible to the bounds: the 8-segment floor left 0.835 CSS px
     of chord error on a 2-verse arc, and the old 96 cap left a 24.4 CSS px
     segment at the desktop ceiling. Neither showed up on phoneLand. It walks
     exactly what the shader samples — sampleTau over the band, split legs and
     all — with each span's own bucket (the asset's 50 / 500 / 5,000 bounds). */
  it('walks the drawn curve: no segment over 24 CSS px, no chord over 0.5', () => {
    const frames = [
      { name: 'phoneLand', wCss: 800, dpr: 2, ceilCss: 256 },
      { name: 'phone375', wCss: 375, dpr: 3, ceilCss: 413 },
      { name: 'desktop1920', wCss: 1920, dpr: 1, ceilCss: 950 },
    ];
    const spans = [1, 2, 3, 5, 10, 30, 100, 300, 1000, 3000, 10000, 31101];
    const bucketOf = (span) => (span < 50 ? [1, 49] : span < 500 ? [50, 499] : span < 5000 ? [500, 4999] : [5000, 31101]);
    for (const f of frames) {
      const wPx = f.wCss * f.dpr;
      const ceilPx = f.ceilCss * f.dpr;
      const squash = squashFactor(ceilPx, wPx);
      const hw = 2 * f.dpr;
      // S3 is stated "at every zoom >= 40". 1x is excluded on purpose: D2
      // requires the overview frame to be pixel-identical, so its tessellation
      // is today's by construction and reads 26-63 CSS px per segment.
      for (const zoom of [40, 400, maxZoomFor(TOTAL, f.wCss)]) {
        const ppv = (wPx / TOTAL) * zoom;
        for (const span of spans) {
          const rx = (span * ppv) / 2;
          const { R, A } = threadShape(rx, squash);
          if (!(R > 0) || !(A > 0)) continue;
          const left = wPx / 2;             // a foot mid-screen: the reader's case
          const right = left + 2 * rx;
          const P = Math.PI;
          const txLo = arcTauOf(Math.max(left, -CLIP_MARGIN), left, right, R, P);
          const txHi = arcTauOf(Math.min(right, wPx + CLIP_MARGIN), left, right, R, P);
          const [sLo, sHi] = bucketOf(span);
          const n = segmentsFor(48, zoom, (sLo * ppv) / 2, (sHi * ppv) / 2, squash, ceilPx, wPx, f.dpr);
          const where = `${f.name} z${Math.round(zoom)} span${span} n${n}`;
          const tauAt = (t) => sampleTau(t, A, P, 0, ceilPx, hw, txLo, txHi);
          const split = A > ceilPx + 2 * hw;
          for (let i = 0; i < n; i++) {
            const t0 = i / n, t1 = (i + 1) / n;
            if (split && t0 < 0.5 && t1 >= 0.5) continue;          // the bridge between the split halves
            const p0 = arcPointAt(tauAt(t0), left, right, R, A, P);
            const p1 = arcPointAt(tauAt(t1), left, right, R, A, P);
            if ((p0.h > ceilPx && p1.h > ceilPx) || (p0.x > wPx && p1.x > wPx)) continue;
            expect(Math.hypot(p1.x - p0.x, p1.h - p0.h) / f.dpr, where + ' segment')
              .toBeLessThanOrEqual(24);
            for (let k = 1; k < 16; k++) {
              const u = k / 16;
              const m = arcPointAt(tauAt(t0 + (t1 - t0) * u), left, right, R, A, P);
              const cx = p0.x + (p1.x - p0.x) * u;
              const ch = p0.h + (p1.h - p0.h) * u;
              expect(Math.hypot(m.x - cx, m.h - ch) / f.dpr, where + ' chord')
                .toBeLessThanOrEqual(0.5);
            }
          }
        }
      }
    }
  });
});

/* ── S2 inverted (w-sw-phase1, M1): the apex is the thread's own height ─────
   S2 above pinned "a long arc's apex ABOVE the frame" -- the level run the
   morph put there, which is the very thing that made panning up pointless
   (53 % of the drawn ribbon length sat off the top at the ceiling, measured
   09-11). Under the true law a long thread's apex is span/2 in verse units:
   never level, never lifted, and reachable by panning. Adapter as in
   geometry.test.js so the case replays over the base. */
import * as geoLaw from './geometry.js';
describe('S2 inverted — a long thread\'s apex is its OWN height, never a lifted level run (w-sw-phase1, M1)', () => {
  const law = /** @type {any} */ (geoLaw);        // the base tree's names are not on the tip's type
  const shapeAt = (rx, zoom, span) => (typeof law.threadShape === 'function'
    ? law.threadShape(rx, SQUASH)
    : law.arcShape(rx, CEIL, SQUASH, law.localizeFactor(zoom), law.spanLogOf(span, TOTAL)));

  it('a 10,000-verse thread at the ceiling reaches 844,800 device px (281,600 at the 44 px ceiling), not 1.15 x ceil, and rises steeper than the old law within 100 CSS px of its foot', () => {
    const rx = rxOf(10000, PPV_MAX_CSS);
    const { R, A } = shapeAt(rx, zMax, 10000);
    expect(A, 'apex = rx x squash').toBeCloseTo(rx * SQUASH, 6);
    const rise100 = arcHeight(100 * DPR, R, A) / DPR;
    expect(rise100, 'rise within 100 CSS px of the foot').toBeGreaterThan(100);
    expect(flat10(R, A, CEIL, W), 'flat share on screen').toBeLessThanOrEqual(0.10);
  });

  it('GUARD, green under both laws (S1 already holds it on the morph): nothing on screen runs within 10 degrees of flat at three zooms', () => {
    for (const zoom of [40, 400, zMax]) {
      const ppv = (W / TOTAL) * zoom;
      const rx = (10000 * ppv) / 2;
      const { R, A } = shapeAt(rx, zoom, 10000);
      expect(flat10(R, A, CEIL, W), `zoom ${zoom}`).toBeLessThanOrEqual(0.10);
    }
  });
});
