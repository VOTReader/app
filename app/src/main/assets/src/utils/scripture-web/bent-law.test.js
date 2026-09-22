/**
 * The bent law re-cut (w-sw-bent, the spine paper §2, 2026-09-20).
 *
 * Corbin, twice: "still cannot pan up" and "a huge portion of lines don't
 * move when I pan horizontally". He kept the bent look. Both symptoms are the
 * LAW, not the renderer: past 24x an arc's middle is a LEVEL run at height A,
 * and a level run translated along x is itself; and every thread leaving a
 * verse in the same span band gets the same quarter, so they leave in one
 * bundle. The re-cut: (a) the run gets a DOME, (b) the departure rank sets
 * the quarter, (c) the camera gains y.
 *
 * Every case reads the new exports off the module object, so this file
 * LOADS on the base tree (a291bd01) and is RED there for the law's reason,
 * not for an import's: the pre-fix count is quotable.
 */
import { describe, it, expect, vi } from 'vitest';
import * as geo from './geometry.js';
import * as dec from './decode.js';
import { pickArc } from './pick.js';
import { attachWebGestures } from '../../ui/scripture-web/gestures.js';

const {
  arcShape, arcHeight, spanLogOf, squashFactor, localizeFactor, maxZoomFor,
  createCamera, clampCamera, fitPPV, zoomAbout, xToVerse, arcShapeGLSL,
} = geo;

// design-perf's phoneLand frame, device px (the shader's frame).
const DPR = 2;
const W = 800 * DPR;
const CEIL = 256 * DPR;
const BASE = CEIL / 0.985;
const TOTAL = 31102;
const SQUASH = squashFactor(CEIL, W);
const rxOf = (span, ppvCss) => (span * ppvCss * DPR) / 2;

/** The bent tree's constants, or the paper's numbers where the tree has none. */
const DOME = typeof geo.DOME === 'number' ? geo.DOME : 0.25;
const SPREAD = typeof geo.SPREAD === 'number' ? geo.SPREAD : 0.5;
const hasBent = typeof geo.arcHeightAt === 'function';

/**
 * Height of the drawn curve at x, on whichever tree this runs: the bent
 * tree's arcHeightAt, or the base tree's quarter profile with its level run.
 */
function heightAt(x, left, right, RL, RR, A, bow) {
  if (hasBent) return geo.arcHeightAt(x, left, right, RL, RR, A, bow);
  return arcHeight(Math.min(x - left, right - x), RL, A);
}

/** A medium arc whose run is ON the phoneLand frame at the ceiling (A < CEIL). */
const RUN_SPAN = 20;
function runArc(localize) {
  const rx = rxOf(RUN_SPAN, 44);
  const { R, A } = arcShape(rx, CEIL, SQUASH, localize, spanLogOf(RUN_SPAN, TOTAL));
  const left = 100, right = left + 2 * rx;
  return { rx, R, A, left, right, runLo: left + R, runHi: right - R };
}

describe('(a) the dome: under horizontal pan no on-screen body is level', () => {
  it('the run of a medium arc at the ceiling bows: its height varies along x by DOME x A, C0 at both joins, highest in the middle', () => {
    const a = runArc(1);
    expect(a.A, 'precondition: the run is on the frame').toBeLessThan(CEIL);
    expect(a.runHi - a.runLo, 'precondition: there is a run').toBeGreaterThan(100);
    const bow = DOME * 1;
    let lo = Infinity, hi = -Infinity, hiX = 0;
    for (let i = 0; i <= 400; i++) {
      const x = a.runLo + ((a.runHi - a.runLo) * i) / 400;
      const h = heightAt(x, a.left, a.right, a.R, a.R, a.A, bow);
      if (h < lo) lo = h;
      if (h > hi) { hi = h; hiX = x; }
    }
    // RED on the base tree: the run is level, hi - lo reads 0.
    expect(hi - lo, 'the run must bow, or a horizontal pan leaves it where it was')
      .toBeGreaterThan(0.15 * a.A);
    expect(hi - lo).toBeCloseTo(DOME * a.A, 6);
    expect(heightAt(a.runLo, a.left, a.right, a.R, a.R, a.A, bow)).toBeCloseTo(a.A, 6);
    expect(heightAt(a.runHi, a.left, a.right, a.R, a.R, a.A, bow)).toBeCloseTo(a.A, 6);
    expect(hiX).toBeCloseTo((a.runLo + a.runHi) / 2, 0);
  });

  it('a horizontal translation of the frame is a DIFFERENT picture for that body: no 200 px stretch of the run repeats itself', () => {
    const a = runArc(1);
    const bow = DOME * 1;
    const shift = 200;
    let maxDelta = 0;
    for (let i = 0; i <= 200; i++) {
      const x = a.runLo + ((a.runHi - a.runLo - shift) * i) / 200;
      const d = Math.abs(heightAt(x + shift, a.left, a.right, a.R, a.R, a.A, bow)
        - heightAt(x, a.left, a.right, a.R, a.R, a.A, bow));
      if (d > maxDelta) maxDelta = d;
    }
    // RED on the base tree: every sample pair reads 0.
    expect(maxDelta).toBeGreaterThan(20);
  });

  it('CONTROL: below 6x the dome is OFF — the overview curve is the semi-ellipse it was, at every x (green on both trees)', () => {
    const rx = rxOf(RUN_SPAN, 800 / TOTAL);
    const { R, A } = arcShape(rx, CEIL, SQUASH, 0, spanLogOf(RUN_SPAN, TOTAL));
    expect(R).toBe(rx);
    const left = 300, right = left + 2 * rx, cx = left + rx;
    for (let i = 0; i <= 50; i++) {
      const x = left + ((right - left) * i) / 50;
      const want = A * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
      expect(heightAt(x, left, right, R, R, A, DOME * localizeFactor(1))).toBeCloseTo(want, 6);
    }
  });

  it('the dome scales with localize, and tapers on a run shorter than its two quarters (no needle at the crown)', () => {
    // half-way through the crossover the bow is DOME/2, times the run's share
    // of two quarters: here the run is 642 px under quarters of 559.
    const a = runArc(0.5);
    expect(a.runHi - a.runLo, 'precondition: there is a run').toBeGreaterThan(0);
    const run = a.runHi - a.runLo;
    const mid = (a.runLo + a.runHi) / 2;
    const h = heightAt(mid, a.left, a.right, a.R, a.R, a.A, DOME * 0.5);
    expect(h).toBeCloseTo(a.A * (1 + DOME * 0.5 * Math.min(1, run / (2 * a.R)) ** 2), 6);
    // and at full depth a run one tenth of its two quarters carries one hundredth of the bow (the
    // square, so the slope goes to zero with the run and a run-less arc's join has none)
    const rx = a.R * 1.1, left = 0, right = 2 * rx;
    expect(heightAt(rx, left, right, a.R, a.R, a.A, DOME)).toBeCloseTo(a.A * (1 + DOME * 0.01), 6);
  });
});

describe('(b) the departure rank sets the quarter: a verse\'s n threads leave in n quarters', () => {
  const span = 3000;
  const rx = rxOf(span, 44);
  const quarter = (fan) => arcShape(rx, CEIL, SQUASH, 1, spanLogOf(span, TOTAL), fan).R;

  it('fans -0.5 / 0 / +0.5 give quarters 0.75 / 1 / 1.25 of the lone thread\'s', () => {
    const one = quarter(0);
    // RED on the base tree: the sixth argument is ignored and all three are one.
    expect(quarter(-0.5)).toBeCloseTo(one * (1 - SPREAD * 0.5), 6);
    expect(quarter(0.5)).toBeCloseTo(one * (1 + SPREAD * 0.5), 6);
    expect(quarter(-0.5)).toBeLessThan(quarter(0));
    expect(quarter(0)).toBeLessThan(quarter(0.5));
  });

  it('a lone thread (fan 0, or no fan at all) is today\'s quarter exactly', () => {
    const today = arcShape(rx, CEIL, SQUASH, 1, spanLogOf(span, TOTAL)).R;
    expect(quarter(0)).toBe(today);
  });

  it('the fan never widens a quarter past the half-span, so a short arc stays a half-ellipse', () => {
    const short = rxOf(2, 44);
    for (const fan of [-0.5, 0, 0.5]) {
      expect(arcShape(short, CEIL, SQUASH, 1, spanLogOf(2, TOTAL), fan).R).toBeLessThanOrEqual(short);
    }
  });

  it('assignSlots (phase 1\'s, ported): three threads from one verse to 12 < 40 < 900 rank 1/4, 1/2, 3/4 in that order', () => {
    expect(dec.assignSlots, 'decode.assignSlots is not exported on this tree').toBeTypeOf('function');
    const from = Uint16Array.from([5, 5, 5]);
    const to = Uint16Array.from([900, 12, 40]);
    const { slotA } = dec.assignSlots(from, to, 3, 1000);
    expect(Array.from(slotA)).toEqual([0.75, 0.25, 0.5]);
  });

  it('ranks correctly past 32,768 verses and past 65,536 threads (a Uint32 key would wrap silently)', () => {
    expect(dec.assignSlots, 'decode.assignSlots is not exported on this tree').toBeTypeOf('function');
    // 70,000 threads from verse 39,990 (past 2^15) to 39,991..39,999 in rotation: at verse 39,990 they rank
    // by their other end, so the first thread (to 39,991) is first of 70,000 and the last (to 39,999) is last
    const n = 70000, total = 40000;
    const from = new Uint16Array(n).fill(39990), to = new Uint16Array(n);
    for (let i = 0; i < n; i++) to[i] = 39991 + (i % 9);
    const { slotA, slotB } = dec.assignSlots(from, to, n, total);
    // the reference order, by (other end, position), from a plain sort
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => (to[p] - to[q]) || (p - q));
    expect(slotA[order[0]]).toBeCloseTo(1 / (n + 1), 6);   // Float32 slots: 1e-7 is the store, not the law
    expect(slotA[order[n - 1]]).toBeCloseTo(n / (n + 1), 6);
    expect(order[n - 1], 'the last is the last thread to the farthest verse').toBe(69992);
    for (const k of [1, 777, 35000, 69998]) expect(slotA[order[k]]).toBeCloseTo((k + 1) / (n + 1), 6);
    // at verse 39,991 the 7,778 arrivals all come from 39,990: ranked by position, the first is first
    const arrivals = [];
    for (let i = 0; i < n; i++) if (to[i] === 39991) arrivals.push(i);
    expect(slotB[arrivals[0]]).toBeCloseTo(1 / (arrivals.length + 1), 6);
    expect(slotB[arrivals[arrivals.length - 1]]).toBeCloseTo(arrivals.length / (arrivals.length + 1), 6);
  });

  it('the fan of a foot is its slot centred: (k+1)/(n+1) - 1/2, so the middle thread of three is today\'s', () => {
    expect(dec.fansOf, 'decode.fansOf is not exported on this tree').toBeTypeOf('function');
    const g = { from: Uint16Array.from([5, 5, 5]), to: Uint16Array.from([900, 12, 40]), count: 3, total: 1000 };
    const { fanA } = dec.fansOf(g);
    expect(fanA[2]).toBe(0);
    expect(fanA[1]).toBe(-0.25);
    expect(fanA[0]).toBe(0.25);
    expect(dec.fansOf(g)).toBe(dec.fansOf(g));
  });
});

describe('(c) the camera gains y', () => {
  const yf = { base: BASE, ceil: CEIL, squash: SQUASH, maxSpan: TOTAL - 1 };
  const zMax = maxZoomFor(TOTAL, W / DPR);

  it('a fresh camera is at the baseline', () => {
    // RED on the base tree: y is undefined.
    expect(createCamera(TOTAL).y).toBe(0);
  });

  it('with a y frame the clamp holds y inside [0, the tallest apex - the frame]: 0 at fit, open at the ceiling, never negative', () => {
    const cam = createCamera(TOTAL);
    clampCamera(cam, W, zMax, yf);
    cam.y = 1e9;
    clampCamera(cam, W, zMax, yf);
    expect(cam.y, 'at fit the dome fills the frame: nothing to pan up to').toBe(0);
    cam.ppv = fitPPV(cam, W) * zMax;
    cam.y = 1e9;
    clampCamera(cam, W, zMax, yf);
    // RED on the base tree: the fourth argument is ignored and y stays 1e9.
    expect(cam.y).toBeGreaterThan(0);
    // the sky: the domes' crowns (1.15 x 1.25 ceil) plus the top stratum
    // (3.8 x 0.35 ceil, the density law part 3), less the frame
    expect(cam.y).toBeLessThan(3 * CEIL);
    const top = geo.maxCamY(cam, W, yf);
    expect(cam.y).toBe(top);
    expect(top).toBeCloseTo(geo.apexMaxPx(cam, W, yf) - BASE, 6);
    cam.y = -50;
    clampCamera(cam, W, zMax, yf);
    expect(cam.y).toBe(0);
  });

  it('the sky is honest: at the ceiling the tallest apex is APEX_LIFT x (1 + DOME) x ceil plus the top stratum', () => {
    const cam = createCamera(TOTAL);
    clampCamera(cam, W, zMax);
    cam.ppv = fitPPV(cam, W) * zMax;
    // + STRATA_LIFT_MAX x BAND x ceil: the density law, part 3 (strata-law.test.js)
    expect(geo.apexMaxPx(cam, W, yf)).toBeCloseTo(geo.APEX_LIFT * (1 + DOME) * CEIL + geo.STRATA_LIFT_MAX * geo.BAND * CEIL, 0);
  });

  it('without a y frame the camera is 1-D: y is held at 0 whatever was written (a My Web rail cannot drift)', () => {
    const cam = createCamera(TOTAL);
    cam.ppv = fitPPV(cam, W) * zMax;
    cam.y = 300;
    clampCamera(cam, W, zMax);
    expect(cam.y).toBe(0);
  });

  it('a zoom keeps the camera\'s height and re-clamps it: zooming out to fit closes the sky', () => {
    const cam = createCamera(TOTAL);
    clampCamera(cam, W, zMax, yf);
    cam.ppv = fitPPV(cam, W) * zMax;
    cam.y = 100;
    clampCamera(cam, W, zMax, yf);
    expect(cam.y).toBe(100);
    zoomAbout(cam, W, W / 2, 1 / zMax, zMax, yf);
    expect(cam.y).toBe(0);
  });
});

describe('the picker agrees with the bent curve', () => {
  function makeGraph(pairs) {
    const chapters = [[0, 1, 0, 20], [0, 2, 20, 20]];
    const total = 40;
    const chapterOfVerse = new Uint16Array(total);
    for (let ci = 0; ci < chapters.length; ci++) {
      for (let v = 0; v < chapters[ci][3]; v++) chapterOfVerse[chapters[ci][2] + v] = ci;
    }
    const n = pairs.length;
    const from = new Uint16Array(n), to = new Uint16Array(n), votes = new Int16Array(n);
    pairs.forEach((p, i) => { from[i] = p[0]; to[i] = p[1]; votes[i] = 30; });
    return {
      total, count: n, from, to, votes,
      buckets: [{ off: 0, len: n, off20: n, off10: n, segments: 32, chunks: [] }],
      books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 }],
      chapters, chapterOfVerse, densityTiers: [20, 7],
      attribution: '', votEdges: [], prophecy: [], votLinks: [],
    };
  }
  const width = 1000, base = 520, ceil = 240;
  const view = /** @type {any} */ ({ width, height: 600, base, ceil, squash: squashFactor(ceil, width), localize: 1, density: 'famous', rulerDepth: 40 });

  it('finds a medium arc at the crown of its domed run (RED on the base tree: the point is above a level run)', () => {
    const g = makeGraph([[5, 35]]);
    const cam = createCamera(g.total);
    cam.ppv = 40; cam.x = 12;     // rx = 600 device px, quarters 226: a 748 px run, longer than both quarters (the full dome)
    clampCamera(cam, width, 5000);
    const x0 = (5 - cam.x) * cam.ppv + width / 2, x1 = (35 - cam.x) * cam.ppv + width / 2;
    const { R, A } = arcShape((x1 - x0) / 2, ceil, view.squash, 1, spanLogOf(30, g.total));
    expect(x1 - x0 - 2 * R, 'precondition: the run is at least the two quarters').toBeGreaterThanOrEqual(2 * R);
    const crownY = base - A * (1 + DOME);
    const hit = pickArc(g, cam, view, (x0 + x1) / 2, crownY, 6);
    expect(hit).not.toBeNull();
    expect(hit.index).toBe(0);
    // and the level height A is NOT on the curve there any more
    const miss = pickArc(g, cam, view, (x0 + x1) / 2, base - A, Math.min(6, DOME * A * 0.5));
    expect(miss).toBeNull();
  });

  it('follows the camera\'s y: the same crown, drawn cam.y px lower, is picked there and not at the baseline\'s', () => {
    const g = makeGraph([[5, 35]]);
    const cam = createCamera(g.total);
    cam.ppv = 40; cam.x = 12;
    clampCamera(cam, width, 5000);
    const x0 = (5 - cam.x) * cam.ppv + width / 2, x1 = (35 - cam.x) * cam.ppv + width / 2;
    const { A } = arcShape((x1 - x0) / 2, ceil, view.squash, 1, spanLogOf(30, g.total));
    cam.y = 120;
    const crownY = base + cam.y - A * (1 + DOME);
    expect(pickArc(g, cam, view, (x0 + x1) / 2, crownY, 6)).not.toBeNull();
    expect(pickArc(g, cam, view, (x0 + x1) / 2, crownY - 120, 6)).toBeNull();
  });

  it('a verse\'s two threads leave in two quarters, and each is picked in its own (RED on the base tree: one quarter)', () => {
    // both threads leave verse 10 rightward, spans 20 and 25: rank 0 (to 30) and rank 1 (to 35)
    const g = makeGraph([[10, 30], [10, 35]]);
    const cam = createCamera(g.total);
    cam.ppv = 40; cam.x = 20;
    clampCamera(cam, width, 5000);
    expect(dec.fansOf, 'decode.fansOf is not exported on this tree').toBeTypeOf('function');
    const { fanA } = dec.fansOf(g);
    expect(fanA[0]).toBeLessThan(fanA[1]);
    const x0 = (10 - cam.x) * cam.ppv + width / 2;
    const shapeOf = (i) => arcShape((g.to[i] - g.from[i]) * cam.ppv / 2, ceil, view.squash, 1,
      spanLogOf(g.to[i] - g.from[i], g.total), fanA[i]);
    const s0 = shapeOf(0), s1 = shapeOf(1);
    expect(s0.R).toBeLessThan(s1.R);
    // half-way up each quarter, on its own curve, the picker names that thread
    for (const [i, s] of /** @type {Array<[number, {R:number, A:number}]>} */ ([[0, s0], [1, s1]])) {
      const d = s.R * 0.5;
      const hit = pickArc(g, cam, view, x0 + d, base - arcHeight(d, s.R, s.A), 2);
      expect(hit, `thread ${i}`).not.toBeNull();
      expect(hit.index).toBe(i);
    }
  });
});

describe('gestures: a drag moves y when the surface has a y frame', () => {
  function pointerEvent(type, opts) {
    return new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0, ...opts,
    });
  }
  function attach(withFrame) {
    const root = document.createElement('div');
    root.className = 'sw-root';
    document.body.appendChild(root);
    const cam = createCamera(TOTAL);
    clampCamera(cam, W, 5000);
    cam.ppv = fitPPV(cam, W) * maxZoomFor(TOTAL, W / DPR);
    clampCamera(cam, W, 5000);
    const yf = { base: BASE, ceil: CEIL, squash: SQUASH, maxSpan: TOTAL - 1 };
    const view = { W, H: 2 * BASE, DPR };
    attachWebGestures(root, {
      loc: (e) => ({ x: e.clientX, y: e.clientY }),
      dpr: () => DPR, cam: () => cam, view: () => view,
      handlers: () => ({ hover: vi.fn(), tap: vi.fn(), doubleTap: vi.fn() }),
      schedule: vi.fn(), maxZoom: () => 5000, clampCamera, zoomAbout, xToVerse,
      yFrame: withFrame ? () => yf : undefined,
    });
    return { root, cam };
  }

  it('a finger moving DOWN 60 CSS px raises the camera 120 device px, and back up returns it (RED on the base tree: y never moves)', () => {
    const { root, cam } = attach(true);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 400, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 160 }));
    expect(cam.y).toBe(120);
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 100 }));
    expect(cam.y).toBe(0);
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 400, clientY: 100 }));
  });

  it('a wheel zoom keeps the camera\'s height (re-clamped), so a scroll-zoom does not drop the reader back to the baseline', () => {
    const { root, cam } = attach(true);
    cam.y = 100;
    clampCamera(cam, W, 5000, { base: BASE, ceil: CEIL, squash: SQUASH, maxSpan: TOTAL - 1 });
    expect(cam.y, 'precondition: the sky is open at the ceiling').toBe(100);
    root.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60, clientX: 400, clientY: 100 }));
    // RED if the wheel forgets its y frame: a frameless clamp reads y back to 0
    expect(cam.y).toBeGreaterThan(0);
  });

  it('a pinch keeps the camera\'s height too', () => {
    const { root, cam } = attach(true);
    cam.y = 100;
    clampCamera(cam, W, 5000, { base: BASE, ceil: CEIL, squash: SQUASH, maxSpan: TOTAL - 1 });
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 300, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 500, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 480, clientY: 100 }));
    expect(cam.y).toBeGreaterThan(0);
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 480, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 300, clientY: 100 }));
  });

  it('the same drag on a surface with no y frame leaves y at 0 (a My Web rail)', () => {
    const { root, cam } = attach(false);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 400, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 160 }));
    expect(cam.y || 0).toBe(0);
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 400, clientY: 160 }));
  });
});

/* ── the GLSL twin: transliterated and run against the JS (pinned only on the bent tree) ── */
describe.skipIf(!hasBent)('the GLSL arcShape / arcTau / arcAt ARE the JS: the twin transliterated and run', () => {
  /**
   * Turn the three GLSL functions into JS. Every identifier the result uses
   * must be on the allow-list, so a GLSL built-in the twin gains later fails
   * this pin loudly instead of being silently miscompared.
   */
  function twinOf(glsl) {
    let js = glsl
      .replace(/const float (\w+) = ([0-9.]+);/g, 'const $1 = $2;')
      .replace(/vec2 arcShape\(([^)]*)\)/, (_, a) => `function arcShape(${a.replace(/float /g, '')})`)
      .replace(/float arcTau\(([^)]*)\)/, (_, a) => `function arcTau(${a.replace(/float /g, '')})`)
      .replace(/void arcAt\(([^)]*)\)/s, (_, a) => `function arcAt(${a.replace(/\s+/g, ' ').replace(/out (float|vec2) \w+,?/g, '').replace(/float /g, '').replace(/,\s*$/, '')})`)
      .replace(/\b(float|vec2) (\w+) =/g, 'let $2 =')
      .replace(/\b(sin|cos|acos|tanh|max|min)\(/g, 'Math.$1(');
    // arcAt's out params become a returned record
    js = js.replace('function arcAt(', 'function arcAt(').replace(/(function arcAt\([^)]*\)\{)/, '$1 let x, h, tg;');
    js = js.replace(/(\n\}\s*)$/, '\n  return {x, h, tg};$1');
    // pow-free; vec2 literals become arrays; .x/.y reads become [0]/[1]
    js = js.replace(/vec2\(/g, 'vec2(').replace(/\.x\b/g, '[0]').replace(/\.y\b/g, '[1]');
    const allowed = new Set(['const', 'ARC_HALF', 'function', 'arcShape', 'arcTau', 'arcAt', 'rx', 'ceil', 'squash',
      'localize', 'spanLog', 'fan', 'r', 'c', 'k', 'deepR', 'deepA', 'let', 'return', 'vec2', 'mix', 'clamp',
      'Math', 'max', 'min', 'tanh', 'sin', 'cos', 'acos', 'x', 'left', 'right', 'RL', 'RR', 'P', 'if', 'else',
      'tau', 'A', 'bow', 'h', 'tg', 's', 'run', 'Rm', 'v', 't', 'dome', 'ARC_PI', 'true', 'false']);
    // numeric literals first (1e-6 has an `e` in it), then every identifier
    const idents = js.replace(/\b\d+(\.\d*)?(e[-+]?\d+)?/g, ' ').match(/[A-Za-z_]\w*/g) || [];
    for (const id of idents) {
      if (!allowed.has(id)) {
        const at = js.indexOf(id);
        throw new Error(`the GLSL twin uses \`${id}\` (…${js.slice(Math.max(0, at - 40), at + 40)}…): extend the transliteration before trusting this pin`);
      }
    }
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const mix = (a, b, f) => a + (b - a) * f;
    const vec2 = (a, b) => [a, b];
    return new Function('clamp', 'mix', 'vec2', js + '; return {arcShape, arcTau, arcAt};')(clamp, mix, vec2);
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /** Relative to the magnitude: the GLSL's ARC_HALF is 1.5707963, the JS's Math.PI / 2 - 3e-8 apart, which a
   * 12,000 px run turns into 2e-5 of x and a 10 px run's slope into 5e-6 of a unit tangent. A wrong branch or a
   * dropped term is orders past 1e-5 (the dome bite below reads > 1 px); a literal's rounding is not. */
  const near = (got, want, what) => expect(Math.abs(got - want), what).toBeLessThanOrEqual(1e-5 * Math.max(1, Math.abs(want)));

  it('agrees with the JS to 1e-5 (relative) over 1,500 arcs x 33 parameters, and every branch is reached', () => {
    const twin = twinOf(arcShapeGLSL);
    const r = rng(7);
    let runs = 0, noRun = 0, fanned = 0;
    for (let i = 0; i < 1500; i++) {
      const rx = 1 + r() * 6000;
      const ceil = 200 + r() * 1000;
      const squash = 0.3 + r() * 1.9;
      const localize = r() < 0.2 ? 0 : (r() < 0.3 ? 1 : r());
      const spanLog = r();
      const fanA = r() - 0.5, fanB = r() - 0.5;
      const jl = arcShape(rx, ceil, squash, localize, spanLog, fanA);
      const jr = arcShape(rx, ceil, squash, localize, spanLog, fanB);
      const gl = twin.arcShape(rx, ceil, squash, localize, spanLog, fanA);
      const gr = twin.arcShape(rx, ceil, squash, localize, spanLog, fanB);
      expect(gl[0]).toBeCloseTo(jl.R, 6); expect(gl[1]).toBeCloseTo(jl.A, 6);
      expect(gr[0]).toBeCloseTo(jr.R, 6);
      if (Math.abs(jl.R - jr.R) > 1e-6) fanned++;
      const left = r() * 500, right = left + 2 * rx;
      const RL = jl.R, RR = jr.R, A = jl.A, bow = DOME * localize;
      const P = geo.arcParamLength(rx, RL, RR);
      expect(twin.arcTau(left + 1, left, right, RL, RR, P)).toBeCloseTo(geo.arcTauOf(left + 1, left, right, RL, RR, P), 6);
      if (P > Math.PI + 1e-9) runs++; else noRun++;
      for (let k = 0; k <= 32; k++) {
        const tau = (P * k) / 32;
        const want = geo.arcPointAt(tau, left, right, RL, RR, A, P, bow);
        const got = twin.arcAt(tau, left, right, RL, RR, A, P, bow);
        near(got.x, want.x, `x tau=${tau}`);
        near(got.h, want.h, `h tau=${tau}`);
        // the tangent as the shader uses it: its DIRECTION (normalize(tg + (1e-6, 0)))
        const nw = Math.hypot(want.tx + 1e-6, want.ty), ng = Math.hypot(got.tg[0] + 1e-6, got.tg[1]);
        near((got.tg[0] + 1e-6) / ng, (want.tx + 1e-6) / nw, `tx tau=${tau} rx=${rx} RL=${RL} RR=${RR} A=${A} P=${P} bow=${bow} want=${JSON.stringify(want)} got=${JSON.stringify(got)}`);
        near(got.tg[1] / ng, want.ty / nw, `ty tau=${tau}`);
        // and the x at this tau inverts back to it
        const x = want.x;
        expect(geo.arcTauOf(x, left, right, RL, RR, P), `tau round-trip at ${tau}`).toBeCloseTo(tau, 5);
      }
    }
    expect(runs).toBeGreaterThan(300);
    expect(noRun).toBeGreaterThan(100);
    expect(fanned).toBeGreaterThan(1000);
  });

  it('BITES: forcing the twin\'s dome to zero makes it disagree with the JS on the run', () => {
    const needle = 'float dome = bow*t*t;';
    expect(arcShapeGLSL).toContain(needle);
    const bitten = twinOf(arcShapeGLSL.replace(needle, 'float dome = 0.;'));
    const rx = 3000, ceil = 512, squash = SQUASH;
    const { R, A } = arcShape(rx, ceil, squash, 1, 0.5);
    const P = geo.arcParamLength(rx, R, R);
    const tau = P / 2;
    const want = geo.arcPointAt(tau, 0, 2 * rx, R, R, A, P, DOME);
    const got = bitten.arcAt(tau, 0, 2 * rx, R, R, A, P, DOME);
    expect(Math.abs(got.h - want.h)).toBeGreaterThan(1);
  });

  it('BITES: a GLSL built-in the transliteration does not know is refused, not miscompared', () => {
    expect(() => twinOf(arcShapeGLSL.replace('tanh(', 'smoothstep(0., 1., '))).toThrow(/smoothstep/);
  });

  it('the parametric curve the shader draws and the analytic height the picker tests are ONE curve', () => {
    const r = rng(11);
    for (let i = 0; i < 400; i++) {
      const rx = 1 + r() * 6000, ceil = 200 + r() * 1000, squash = 0.3 + r() * 1.9;
      const localize = r() < 0.3 ? 1 : r();
      const RL = arcShape(rx, ceil, squash, localize, r(), r() - 0.5).R;
      const sh = arcShape(rx, ceil, squash, localize, r(), r() - 0.5);
      const RR = sh.R, A = sh.A, bow = DOME * localize;
      const left = 100, right = left + 2 * rx;
      const P = geo.arcParamLength(rx, RL, RR);
      for (let k = 1; k < 32; k++) {
        const p = geo.arcPointAt((P * k) / 32, left, right, RL, RR, A, P, bow);
        expect(geo.arcHeightAt(p.x, left, right, RL, RR, A, bow), `k=${k}`).toBeCloseTo(p.h, 5);
      }
    }
  });
});
