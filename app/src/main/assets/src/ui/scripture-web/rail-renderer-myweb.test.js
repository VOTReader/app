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
 *     alpha·width over the context thread's >= 5 up to 5.8x (three zoom taps),
 *     and core+halo over the thread >= 6 at every z to 40x (the link
 *     thickens with depth like a canon ribbon and carries its halo), AND the
 *     two are different families (main: both --gold). w3 rewrote the ratios
 *     to this intent (digest §5): the spec's reader link is 1.5 px at the
 *     overview (sw-ink myWebReader), not r2's 2.0, so the core-alone floor
 *     moved from 8x to 5x; the halo floor of 6x now holds to 40x, not 25x.
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

/** A stroke in one of Timothy's source colours (a link's halo is gold, never this). */
const isTimothy = (style) => MY_WEB_SOURCES.some((src) => String(style).startsWith('rgba(' + src.rgb + ','));
/** A context stroke at least this wide (device px) is the soft glow under
 * Timothy's threads (w4, r2-05): CONTEXT_GLOW_WIDTH past a core that stops at 1.6. */
const GLOW_MIN = RR.CONTEXT_GLOW_WIDTH * opts.DPR;
/** A 2D context that only counts (stroke: the cores; glow: the glow strokes).
 * Every method the renderer calls is here.
 * @returns {any} */
function fakeCtx() {
  const calls = { stroke: 0, glow: 0, fill: 0, beginPath: 0 };
  const noop = () => {};
  return {
    calls,
    lineWidth: 0, strokeStyle: '', fillStyle: '', font: '', textAlign: '', textBaseline: '',
    lineCap: '', lineJoin: '',
    beginPath() { calls.beginPath++; }, moveTo: noop, lineTo: noop, arc: noop,
    stroke() { if (this.lineWidth >= GLOW_MIN && isTimothy(this.strokeStyle)) calls.glow++; else calls.stroke++; }, fill() { calls.fill++; },
    fillText: noop, strokeText: noop, measureText: () => ({ width: 40 }), clearRect: noop,
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
    // the soft glow under them (w4) is ONE stroke for their one source, so it
    // never piles up where the cores do
    expect(ctx.calls.glow - ctx0.calls.glow).toBe(1);
  });

  it('R1 the ink law after call 07 (Corbin, 2026-09-12: "the normal is probably too faint" and zooming "makes the colors get brighter and brighter ... odd") and w4 (r2-05): floor CONTEXT_FLOOR at 1x, the z^0.75 ramp up to a 0.30 plateau, FLAT from there to the ceiling on both frames', () => {
    const a = (z) => personalInk(z).context.alpha;
    // w4: the floor is 0.14 (through w3 0.06, lifted from 0.04): at 0.06 the
    // overview read as a haze where r2-05 shows Timothy's teal plainly. The
    // ramp keeps its shape and its 0.30 plateau, which it now reaches at 2.8x.
    expect(RR.CONTEXT_FLOOR).toBe(0.14);
    expect(a(1)).toBeCloseTo(RR.CONTEXT_FLOOR, 3);                       // the overview floor
    expect(a(2)).toBeCloseTo(RR.CONTEXT_FLOOR * Math.pow(2, 0.75), 3);   // 0.235 - below the plateau the ramp keeps its shape
    expect(a(2.8)).toBeCloseTo(0.30, 3);                                 // the plateau (reached at 2.76x)
    expect(a(16)).toBe(a(2.8));
    expect(a(43.8)).toBe(a(16));                              // the phone's top-rail ceiling: not one bit brighter than 16x
    expect(a(18.2)).toBe(a(16));                              // the desktop's top-rail ceiling: the same
    expect(a(4000)).toBe(a(16));
    expect(a(5.8)).toBeGreaterThanOrEqual(2 * a(1));          // the 5.8x reward survives (design-perf 09-10): 0.30 against 0.14
    expect(a(0)).toBe(a(1));                                  // a bad z is overview, not NaN
    // the approved 0.70 ceiling is the law's hard BOUND: the walk's knob can raise the plateau to it and no further
    expect(RR.CONTEXT_PLATEAU).toBe(0.30);
    expect(RR.CONTEXT_CEILING).toBe(0.70);
    expect(personalInk(1e6, 0.70).context.alpha).toBeCloseTo(0.70, 3);
    expect(personalInk(1e6, 0.95).context.alpha).toBe(RR.CONTEXT_CEILING);
    // "a little clearer lines as you zoom in is fine": the width, not the alpha, carries depth (0.8 -> 1.6 at 40x)
    expect(personalInk(1).context.width).toBeCloseTo(0.8, 3);
    expect(personalInk(40).context.width).toBeCloseTo(1.6, 3);
    // the soft glow (w4, r2-05) follows its core's alpha, so it never brightens past the plateau either
    for (const z of [1, 2, 2.8, 16, 43.8]) {
      expect(personalInk(z).context.glow.alpha).toBeCloseTo(a(z) * RR.CONTEXT_GLOW_SHARE, 9);
      expect(personalInk(z).context.glow.width).toBe(RR.CONTEXT_GLOW_WIDTH);
    }
  });

  it('R2 a reader link outweighs a context thread (5x core to 5.8x, 6x with halo to 40x), in the other family', () => {
    for (const z of [1, 1.8, 3.24, 5.83, 10.5, 18.9, 40]) {
      const { context, link } = personalInk(z);
      const thread = context.alpha * context.width;
      const core = link.alpha * link.width;
      if (z <= 5.83) expect(core / thread).toBeGreaterThanOrEqual(5);
      // on the 0.30 plateau the context widens to 1.6 px at 40x; the link
      // thickens to 2.3 px and its halo keeps the lead at 6x, with the family
      // split (gold on teal-silver) and the pins on top of the ink. w4: the
      // context reaches its plateau at 2.8x now (CONTEXT_FLOOR 0.14), so the
      // link thickens 0.8 px over the zoom (through w3 0.6) to keep 5x to 5.8x
      expect((core + link.halo * link.haloAlpha) / thread).toBeGreaterThanOrEqual(6);
      expect(link.width).toBeCloseTo(1.5 + 0.8 * Math.min(1, Math.log(z) / Math.log(40)), 6);
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
    // the pin says the link's shape (w3: the reader's links are one gold, so
    // the pin is the only channel for it); kind 0 within scripture = ring, 1 within the
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
