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
  arcShape, arcHeightAt, maxZoomFor, PPV_MAX_CSS,
  ribbonStyle, localizeFactor, squashFactor,
  ALPHA_DEEP, arcPointAt, footX,
  arcFrameTau, frameSegments, arcPush, frameHeights, TESS_TOL_CSS, TESS_CAP,
} from './geometry.js';

// Rise of an arc of half-span R, `d` px in from its left foot, flat at the apex height A past R: the
// drawn ellipse (arcHeightAt) read from the foot. geometry.js's arcHeight did this until the sweep
// found it dead outside these tests (mw11).
const arcHeight = (d, R, A) => arcHeightAt(Math.min(Math.max(d, 0), R), 0, 2 * R, A);

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

  // The screen has one (dark) palette since 2026-09-10, so the law has no
  // theme argument: the light arm these checks once also walked is gone.
  it('reaches 0.85 at the ceiling', () => {
    const s = ribbonStyle(zMax, 1, AT_CEILING);
    expect(s.alpha).toBeGreaterThanOrEqual(0.85);
  });

  it('stops letting votes scale alpha at depth, or the weakest arc never gets there', () => {
    // strength floors at 0.30. If alpha still scaled by it, 0.9 x 0.3 = 0.27.
    expect(ribbonStyle(zMax, 1, AT_CEILING).voteMix).toBe(1);
    expect(ribbonStyle(1, 0, AT_CEILING).voteMix).toBe(0);
  });
});

describe('D2 — nothing below the ceiling washes out', () => {
  it('is the old law exactly at overview, whatever the density reads', () => {
    const a = ribbonStyle(1, 0, 0.0001);
    const b = ribbonStyle(1, 0, 900);
    expect(a.alpha).toBe(0.075);
    expect(a.strokeWidthCss).toBe(0.9);
    // Density must not be able to reach the overview frame at all.
    expect(b).toEqual(a);
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
      const s = ribbonStyle(40, localizeFactor(40), c.per);
      expect(ALPHA_DEEP / s.alpha, c.frame + ' 40x crowding divisor').toBeCloseTo(c.divisor, 1);
    }
  });

  it('clamps that divisor to 1 at every ceiling, so D1 keeps the full value', () => {
    // The measured anchored density at each frame's own 44 px ceiling.
    for (const per of [141 / 800, 59 / 375, 336 / 1920]) {
      expect(ribbonStyle(1711, 1, per).alpha).toBeCloseTo(ALPHA_DEEP, 12);
    }
  });

  it('never brightens at 40x beyond the deep value itself', () => {
    // The wash direction is UP. Whatever the crowd reads, the deep alpha is a
    // ceiling, not a floor: an empty frame cannot be brighter than one ribbon.
    for (const per of [0, 1e-9, 0.001, 5, 500]) {
      expect(ribbonStyle(40, 1, per).alpha).toBeLessThanOrEqual(ALPHA_DEEP);
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

/* The oracle the S3 sweep measures against: a point's distance to the TRUE
   ellipse (x - cx)^2 / r^2 + h^2 / A^2 = 1, by Eberly's robust bisection
   ("Distance from a Point to an Ellipse, an Ellipsoid, or a Hyperellipsoid",
   Geometric Tools). Nothing in it comes from the parameter the drawn curve is
   sampled by, so the sweep cannot agree with itself by construction. */
function ellipseDistance(px, ph, cx, r, A) {
  let y0 = Math.abs(px - cx), y1 = Math.abs(ph), e0 = r, e1 = A;
  if (e1 > e0) { [e0, e1] = [e1, e0]; [y0, y1] = [y1, y0]; }
  if (y1 > 0) {
    if (y0 === 0) return Math.abs(y1 - e1);
    const z0 = y0 / e0, z1 = y1 / e1, g = z0 * z0 + z1 * z1 - 1;
    if (g === 0) return 0;
    const r0 = (e0 / e1) * (e0 / e1), n0 = r0 * z0, k0 = r0 - 1;
    // bisect u = s + 1 (Eberly's s, shifted), so a point near the centre keeps its precision
    let u0 = z1, u1 = g < 0 ? 1 : Math.hypot(n0, z1), u = u0;
    for (let i = 0; i < 2000; i++) {
      u = (u0 + u1) / 2;
      if (u === u0 || u === u1) break;
      const a = n0 / (u + k0), b = z1 / u, gg = a * a + b * b - 1;
      if (gg > 0) u0 = u; else if (gg < 0) u1 = u; else break;
    }
    return Math.hypot((r0 * y0) / (u + k0) - y0, y1 / u - y1);
  }
  const numer = e0 * y0, denom = e0 * e0 - e1 * e1;
  if (numer < denom) {
    const xd = numer / denom;
    return Math.hypot(e0 * xd - y0, e1 * Math.sqrt(1 - xd * xd));
  }
  return Math.abs(y0 - e0);
}

/* The drawn ribbon's centre as the shader builds it (web-renderer.js VERT):
   n + 1 samples evenly over the frame's piece, each pushed out from the
   ellipse's centre by arcPush of its offset from it. Calls visit(qx, qh) at
   17 points along every chord. */
function walkDrawn(left, right, A, win, n, visit) {
  const r = (right - left) / 2;
  const dTau = (Math.max(win[1], win[0]) - win[0]) / n;
  const e = arcPush(dTau);
  let px = 0, ph = 0;
  for (let i = 0; i <= n; i++) {
    const tau = win[0] + i * dTau;
    const p = arcPointAt(tau, left, right, A);
    const qx = p.x - r * Math.cos(tau) * e, qh = p.h + A * Math.sin(tau) * e;
    if (i > 0) for (let k = 0; k <= 16; k++) visit(px + ((qx - px) * k) / 16, ph + ((qh - ph) * k) / 16);
    px = qx; ph = qh;
  }
}

const S3_FRAMES = [
  { name: 'phoneLand', wCss: 800, dpr: 2, ceilCss: 256 },
  { name: 'phone891', wCss: 891, dpr: 2.6, ceilCss: 300 },
  { name: 'phone375', wCss: 375, dpr: 3, ceilCss: 413 },
  { name: 'desktop1920', wCss: 1920, dpr: 1, ceilCss: 950 },
];
const S3_SPANS = [1, 2, 3, 5, 10, 30, 100, 300, 1000, 3000, 10000, 31101];

/* S3 restated for E1 (GL step 2, 2026-10-18). Its old law was "the bucket's
   own segment count at overview, a fixed window, and the curve walked to
   0.5 CSS px with no segment over 24 CSS px"; the retired segmentsFor and
   visibleWindow carried it. The brief's law is the screen's: every thread
   takes the segments its own on-screen size needs at every zoom, overview
   included, and no drawn point strays over 0.25 CSS px from the true curve.
   The segment-length cap is retired with it: it was the smoothness proxy,
   and the chord error IS the smoothness. */
describe('S3 — tessellation follows the screen: chord error <= 0.25 CSS px at every zoom', () => {
  it('at overview the frame holds every arch whole and each takes its own size, not a bucket count', () => {
    const win = [0, 0];
    const [hLo, hHi] = frameHeights(CEIL, 0, DPR);
    const ppv = W / TOTAL;
    let last = 0;
    for (const span of S3_SPANS) {
      const rx = (span * ppv) / 2;
      const { A } = arcShape(rx, SQUASH);
      const left = Math.max(0, W / 2 - rx);
      expect(arcFrameTau(left, left + 2 * rx, W, A, hLo, hHi, win), `span ${span}`).toBe(true);
      expect(win[0]).toBe(0);
      expect(win[1]).toBe(Math.PI);
      const n = frameSegments(win[0], win[1], rx, A, DPR);
      expect(n, `span ${span}`).toBeGreaterThanOrEqual(last);
      last = n;
    }
    // a one-verse thread is one segment; the widest is the frame's own few dozen
    expect(frameSegments(0, Math.PI, (1 * ppv) / 2, (1 * ppv * SQUASH) / 2, DPR)).toBe(1);
    expect(last).toBeLessThanOrEqual(48);
    expect(last).toBeLessThan(TESS_CAP);
  });

  it('does not spend the whole cap on an arc 24 px wide', () => {
    const rx = rxOf(3, 44);
    expect(frameSegments(0, Math.PI, rx, arcShape(rx, SQUASH).A, DPR)).toBeLessThan(24);
  });

  /* The sweep: four frames, six zooms from the overview to the ceiling,
     twelve spans, three feet and three camera heights, each thread's drawn
     ribbon centre walked chord by chord and measured against the oracle
     wherever it is on screen. */
  it('walks the drawn curve: no on-screen point strays over 0.25 CSS px from the true ellipse, overview to ceiling', () => {
    const win = [0, 0];
    let pieces = 0, overview = 0, sky = 0;
    for (const f of S3_FRAMES) {
      const wPx = f.wCss * f.dpr;
      const base = f.ceilCss * f.dpr;
      const squash = squashFactor(base, wPx);
      const zMaxF = maxZoomFor(TOTAL, f.wCss);
      for (const zoom of [1, 6, 40, 400, zMaxF / 3, zMaxF]) {
        const ppv = (wPx / TOTAL) * zoom;
        for (const camY of [0, 2 * base, 40 * base]) {
          const [hLo, hHi] = frameHeights(base, camY, f.dpr);
          for (const span of S3_SPANS) {
            const rx = (span * ppv) / 2;
            const { A } = arcShape(rx, squash);
            if (!(rx > 0) || !(A > 0)) continue;
            for (const left of [wPx / 2, wPx / 2 - rx, -rx]) {
              const right = left + 2 * rx;
              if (!arcFrameTau(left, right, wPx, A, hLo, hHi, win)) continue;
              const n = frameSegments(win[0], win[1], rx, A, f.dpr);
              let worst = 0;
              walkDrawn(left, right, A, win, n, (qx, qh) => {
                if (qx < 0 || qx > wPx || qh < camY || qh > camY + base) return;
                const d = ellipseDistance(qx, qh, left + rx, rx, A);
                if (d > worst) worst = d;
              });
              pieces++;
              if (zoom === 1) overview++;
              if (camY > 0) sky++;
              const where = `${f.name} z${Math.round(zoom)} y${camY} span${span} left${Math.round(left)} n${n}`;
              expect(worst / f.dpr, where).toBeLessThanOrEqual(TESS_TOL_CSS + 1e-9);
            }
          }
        }
      }
    }
    expect(pieces).toBeGreaterThan(400);
    expect(overview).toBeGreaterThan(40);
    expect(sky).toBeGreaterThan(40);
  });

  /* Never hide a line (the structure law): the height-aware cull drops a
     thread only when nothing of its true curve is on screen. The oracle
     samples the curve by x and by height straight off the ellipse's own
     equation and asks that every on-screen point lie inside the piece. */
  it('culls only what the frame cannot show: every on-screen point of the true curve lies inside its piece', () => {
    const win = [0, 0];
    let seen = 0, culled = 0;
    for (const f of S3_FRAMES) {
      const wPx = f.wCss * f.dpr;
      const base = f.ceilCss * f.dpr;
      const squash = squashFactor(base, wPx);
      const zMaxF = maxZoomFor(TOTAL, f.wCss);
      for (const zoom of [1, 6, 40, 400, zMaxF]) {
        const ppv = (wPx / TOTAL) * zoom;
        for (const camY of [0, 0.5 * base, 2 * base, 40 * base]) {
          const [hLo, hHi] = frameHeights(base, camY, f.dpr);
          for (const span of S3_SPANS) {
            const rx = (span * ppv) / 2;
            const { A } = arcShape(rx, squash);
            if (!(rx > 0) || !(A > 0)) continue;
            for (const left of [wPx / 2, wPx / 2 - rx, -rx, -1.5 * rx]) {
              const right = left + 2 * rx, cx = left + rx;
              const ok = arcFrameTau(left, right, wPx, A, hLo, hHi, win);
              const taus = [];
              for (let k = 0; k <= 400; k++) {
                const x = (wPx * k) / 400, u = (x - cx) / rx;
                if (Math.abs(u) <= 1) taus.push([x, A * Math.sqrt(1 - u * u)]);
                const h = camY + (base * k) / 400, v = h / A;
                if (v <= 1) {
                  const dx = rx * Math.sqrt(1 - v * v);
                  taus.push([cx - dx, h], [cx + dx, h]);
                }
              }
              let any = false;
              for (const [x, h] of taus) {
                if (x < 0 || x > wPx || h < camY || h > camY + base) continue;
                any = true;
                const tau = Math.atan2(h / A, (cx - x) / rx);
                const where = `${f.name} z${Math.round(zoom)} y${camY} span${span} left${Math.round(left)}`;
                expect(ok, where + ' culled with a point on screen').toBe(true);
                expect(tau, where).toBeGreaterThanOrEqual(win[0] - 1e-9);
                expect(tau, where).toBeLessThanOrEqual(win[1] + 1e-9);
              }
              if (any) seen++;
              if (!ok) culled++;
            }
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(400);
    expect(culled).toBeGreaterThan(40);
  });
});
