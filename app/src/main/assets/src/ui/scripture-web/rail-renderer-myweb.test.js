/**
 * My Web ink law — the REDs (design-perf, 2026-09-10; note: myweb-visual-design.md).
 *
 * R1  context has structure: the underlay is stroked ONE EDGE AT A TIME so
 *     corridors accumulate. On main every edge goes into one path and one
 *     stroke(), so a pixel under forty citations reads the same 10/255 as a
 *     pixel under one. The fake context counts stroke() calls: main = 1.
 *     And zoom rewards: the law's context alpha at 5.8x is at least twice its
 *     alpha at 1x (main has no law; the underlay is 0.045 at every zoom).
 * R2  a user link is unmistakable from context at every zoom: the link's core
 *     alpha·width over the context thread's >= 8 up to 5.8x (three zoom taps),
 *     and core+halo over the thread >= 6 at every z to 40x (at depth the
 *     context thread is deliberately strong enough to read alone, 0.45 · 1.3,
 *     so the link thickens with depth like a canon ribbon and carries its
 *     halo), AND the two are different hues (main: both --gold).
 *
 * The probe (tools/e2e-myweb.mjs) reads the same export; nothing re-types it.
 */
import { describe, it, expect } from 'vitest';
import { buildVotRail } from '../../utils/scripture-web/personal-graph.js';
import { MY_WEB_SOURCES, myWebLinkColor } from '../../utils/scripture-web/palette.js';
import * as RR from './rail-renderer.js';

// Read off the namespace, not a named import: on the tree this RED was written
// against the export does not exist, and a named import of a missing export is
// a type error the pre-commit hook refuses before the test can be red.
const { drawPersonalWeb } = RR;
const personalInk = /** @type {any} */ (RR).personalInk;

const rail = buildVotRail([
  { volKey: 'one', label: 'Volume One', items: [{ id: 'letter-1', title: 'Letter One' }] },
]);
const opts = {
  width: 1000, height: 600, H: 600, DPR: 1, base: 500, votRail: rail,
  verseTotal: 100, verseX: (verse) => verse * 10,
  chrome: { isLight: false, fsLabel: 11 },
  showUnderlay: true, hoverIndex: -1, focusIndex: -1,
};

/* The context is batched into Path2D objects (CONTEXT_PATHS round-robin);
   node has no Path2D, so a counting one stands in. */
if (typeof globalThis.Path2D === 'undefined') {
  /** @type {any} */ (globalThis).Path2D = class Path2D { moveTo() {} lineTo() {} arc() {} };
}

/** A 2D context that only counts. Every method the renderer calls is here.
 * @returns {any} */
function fakeCtx() {
  const calls = { stroke: 0, fill: 0, beginPath: 0 };
  const noop = () => {};
  return {
    calls,
    lineWidth: 0, strokeStyle: '', fillStyle: '', font: '', textAlign: '', textBaseline: '',
    lineCap: '', lineJoin: '',
    beginPath() { calls.beginPath++; }, moveTo: noop, lineTo: noop, arc: noop,
    stroke() { calls.stroke++; }, fill() { calls.fill++; },
    fillText: noop, measureText: () => ({ width: 40 }), clearRect: noop,
  };
}

describe('My Web ink law', () => {
  it('R1 strokes the corpus context one edge at a time, so corridors can accumulate', () => {
    const underlay = { count: 3, versePos: new Float32Array([5, 50, 95]), votPos: new Float32Array([0, 0, 0]) };
    const ctx = fakeCtx();
    drawPersonalWeb(ctx, null, underlay, opts);
    const ctx0 = fakeCtx();
    drawPersonalWeb(ctx0, null, { count: 0, versePos: new Float32Array(0), votPos: new Float32Array(0) }, opts);
    // three edges land in three round-robin paths: three strokes, where main
    // makes ONE (CONTEXT_PATHS >= 3 is what keeps this reading true)
    expect(ctx.calls.stroke - ctx0.calls.stroke).toBe(3);
  });

  it('R1 the ink law after call 07 (Corbin, 2026-09-12: "the normal is probably too faint" and zooming "makes the colors get brighter and brighter ... odd"): floor 0.06 at 1x, today\'s curve x1.5 up to a 0.30 plateau, FLAT from there to the ceiling on both frames', () => {
    const a = (z) => personalInk(z).context.alpha;
    expect(a(1)).toBeCloseTo(0.06, 3);                        // the overview floor, lifted from 0.04 ("a touch")
    expect(a(6)).toBeCloseTo(0.06 * Math.pow(6, 0.75), 3);    // 0.230 - below the plateau the ramp is today's shape at 1.5x
    expect(a(16)).toBeCloseTo(0.30, 3);                       // the plateau (reached at 8.6x)
    expect(a(43.8)).toBe(a(16));                              // the phone's top-rail ceiling: not one bit brighter than 16x
    expect(a(18.2)).toBe(a(16));                              // the desktop's top-rail ceiling: the same
    expect(a(4000)).toBe(a(16));
    expect(a(5.8)).toBeGreaterThanOrEqual(2 * a(1));          // the 5.8x reward survives (design-perf 09-10)
    expect(a(0)).toBe(a(1));                                  // a bad z is overview, not NaN
    // the approved 0.70 ceiling is the law's hard BOUND: the walk's knob can raise the plateau to it and no further
    expect(RR.CONTEXT_PLATEAU).toBe(0.30);
    expect(RR.CONTEXT_CEILING).toBe(0.70);
    expect(personalInk(1e6, 0.70).context.alpha).toBeCloseTo(0.70, 3);
    expect(personalInk(1e6, 0.95).context.alpha).toBe(RR.CONTEXT_CEILING);
    // "a little clearer lines as you zoom in is fine": the width, not the alpha, carries depth (0.8 -> 1.6 at 40x)
    expect(personalInk(1).context.width).toBeCloseTo(0.8, 3);
    expect(personalInk(40).context.width).toBeCloseTo(1.6, 3);
  });

  it('R2 a reader link outweighs a context thread (8x core to 5.8x, 6x with halo to 25x, 3.5x past it), in a different family', () => {
    for (const z of [1, 1.8, 3.24, 5.83, 10.5, 18.9, 40]) {
      const { context, link } = personalInk(z);
      const thread = context.alpha * context.width;
      const core = link.alpha * link.width;
      if (z <= 5.83) expect(core / thread).toBeGreaterThanOrEqual(8);
      // past 25x the context sits on its 0.30 plateau at 1.6 px and the link's
      // lead rests on hue (warm on cool, dE >= 32 under every deficiency) and
      // its pins as well as ink; the ink ratio alone stays >= 3.5 (it is ~7.5)
      expect((core + link.halo * link.haloAlpha) / thread).toBeGreaterThanOrEqual(z <= 25 ? 6 : 3.5);
      // no reader hue is a Timothy hue
      for (let k = 0; k < 3; k++) for (const src of MY_WEB_SOURCES) expect(myWebLinkColor(k)).not.toBe(src.rgb);
    }
  });

  it('R2 the drawn link is a halo pass, a core, and a pin at each end BY SHAPE: ring / dot / ring-and-dot', () => {
    // a two-node Volumes rail so a within-the-Volumes link has two places on screen
    const rail2 = buildVotRail([{ volKey: 'one', label: 'Volume One', items: [{ id: 'letter-1', title: 'One' }, { id: 'letter-2', title: 'Two' }] }]);
    const o2 = Object.assign({}, opts, { showUnderlay: false, votRail: rail2 });
    const ctx0 = fakeCtx();
    drawPersonalWeb(ctx0, null, null, o2);
    // 1b: the pin is the reader family's second channel (gold and amber meet
    // under deuteranopia); kind 0 within scripture = ring, 1 within the
    // Volumes = dot, 2 across = ring and dot. Rails are 0/1 so kind 2 is a
    // cross-rail link and kinds 0/1 sit on one rail each.
    const cases = [
      { kind: 0, a: 0, b: 0, strokes: 4, fills: 0 },   // halo + core + 2 rings
      { kind: 1, a: 1, b: 1, strokes: 2, fills: 2 },   // halo + core; 2 solo dots
      { kind: 2, a: 0, b: 1, strokes: 4, fills: 2 },   // halo + core + 2 rings; 2 dots
    ];
    for (const c of cases) {
      // both ends on screen: Bible verses 5 and 60 (verseX = 10 px a verse), Volumes nodes 0 and 1
      const personal = {
        count: 1, aRail: new Uint8Array([c.a]), bRail: new Uint8Array([c.b]),
        aPos: new Float32Array([c.a ? 0 : 5]), bPos: new Float32Array([c.b ? 1 : 60]), kind: new Uint8Array([c.kind]),
      };
      const ctx = fakeCtx();
      drawPersonalWeb(ctx, personal, null, o2);
      expect(ctx.calls.stroke - ctx0.calls.stroke, 'kind ' + c.kind + ' strokes').toBe(c.strokes);
      expect(ctx.calls.fill - ctx0.calls.fill, 'kind ' + c.kind + ' fills').toBe(c.fills);
    }
  });
});
