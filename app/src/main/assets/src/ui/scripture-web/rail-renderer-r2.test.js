/**
 * My Web r2 — the REDs (design-perf, 2026-09-11; Corbin's three findings on
 * the live My Web: low-resolution grey lines, a horizontal streak field at
 * zoom, one unified zoom that helps nobody).
 *
 * G1  FULL RESOLUTION: the corpus context is stroked on the canvas it is
 *     given, one stroke per edge, never through a half-resolution layer
 *     blitted up (main: CONTEXT_SCALE 0.5 + drawImage, the "low resolution"
 *     Corbin saw).
 * G2  A THREAD IS A LINE WITH ENDPOINTS ON ITS BOOKS: threadPath() returns
 *     null when neither endpoint is on screen (nothing to attach to), and
 *     when one is, the visible polyline never runs near-horizontal across
 *     the screen (main's cubic puts every off-screen thread on one
 *     mid-gap streak); both endpoints stay exactly where endpointPoint
 *     puts them; a thread whose far end has JUST left the screen is
 *     continuous with the one whose far end is still on it.
 * G3  TWO TRANSFORMS: the Volumes rail has its own camera. endpointPoint
 *     maps a VOT position through opts.votX and a verse through opts.verseX,
 *     and a cross-rail thread takes one endpoint from each.
 */
import { describe, it, expect } from 'vitest';
import { buildVotRail } from '../../utils/scripture-web/personal-graph.js';
import { createCamera, fitPPV, verseToX, zoomAbout } from '../../utils/scripture-web/geometry.js';
import * as RR from './rail-renderer.js';

const { drawPersonalWeb, endpointPoint, railFrame } = RR;
const threadPath = /** @type {any} */ (RR).threadPath;

const rail = buildVotRail([
  { volKey: 'one', label: 'Volume One', items: Array.from({ length: 30 }, (_, i) => ({ id: 'l' + i, title: 'Letter ' + i })) },
  { volKey: 'rebuke', label: "The Lord's Rebuke", short: 'Rebuke', items: Array.from({ length: 31 }, (_, i) => ({ id: 'r' + i, title: 'Rebuke ' + i })) },
]);
const W = 1000, H = 600, DPR = 1, BASE = 500;
const opts = {
  width: W, height: H, DPR, base: BASE, votRail: rail,
  verseTotal: 100, verseX: (verse) => verse * 10,
  chrome: { isLight: false, fsLabel: 11 },
  showUnderlay: true, hoverIndex: -1, focusIndex: -1,
};
const rails = railFrame({ H, DPR }, BASE);

/** A 2D context that only counts; drawImage is deliberately ABSENT so a
 * layer blit throws instead of passing quietly.
 * @returns {any} */
function fakeCtx() {
  const calls = { stroke: 0, fill: 0, beginPath: 0 };
  const noop = () => {};
  return {
    calls, canvas: { classList: { contains: () => true } },
    lineWidth: 0, strokeStyle: '', fillStyle: '', font: '', textAlign: '', textBaseline: '',
    lineCap: '', lineJoin: '', globalAlpha: 1,
    beginPath() { calls.beginPath++; }, moveTo: noop, lineTo: noop, arc: noop, bezierCurveTo: noop,
    stroke() { calls.stroke++; }, fill() { calls.fill++; },
    fillText: noop, measureText: () => ({ width: 40 }), clearRect: noop, save: noop, restore: noop,
    setTransform: noop,
  };
}

describe('My Web r2 — G1 full resolution', () => {
  it('strokes every context edge on the canvas it is given, never through a half-resolution layer', () => {
    // jsdom has a document, so main takes its offscreen-layer branch here and
    // calls ctx.drawImage, which this context does not have: main throws.
    const underlay = { count: 5, versePos: new Float32Array([5, 20, 50, 70, 95]), votPos: new Float32Array([0, 10, 20, 40, 60]) };
    const ctx = fakeCtx(), ctx0 = fakeCtx();
    drawPersonalWeb(ctx, null, underlay, opts);
    drawPersonalWeb(ctx0, null, { count: 0, versePos: new Float32Array(0), votPos: new Float32Array(0) }, opts);
    expect(ctx.calls.stroke - ctx0.calls.stroke).toBe(5);
    expect(/** @type {any} */ (RR).CONTEXT_SCALE).toBeUndefined();
  });
  it('batches threads by colour bin and layer: near-coincident threads keep a stroke each, a fan shares one', () => {
    // The 5080 read 8.3 ms a frame with a stroke per thread and 4.2 with one
    // path. Ink must still accumulate where threads run along each other
    // (both ends within a few stroke widths on screen: adjacent verses to
    // the same passage, or to passages that sit together at this zoom), so
    // those get their own layers; a fan from those verses shares a path.
    const base = { count: 0, versePos: new Float32Array(0), votPos: new Float32Array(0) };
    const ctx0 = fakeCtx(); drawPersonalWeb(ctx0, null, base, opts);
    // verseX is 10 px a verse here, the stroke 0.8 px: verses 0.1 apart are one line
    const corridor = { count: 3, versePos: new Float32Array([50, 50.1, 50.2]), votPos: new Float32Array([20, 20, 20]) };
    const c1 = fakeCtx(); drawPersonalWeb(c1, null, corridor, opts);
    expect(c1.calls.stroke - ctx0.calls.stroke).toBe(3);
    const neighbours = { count: 3, versePos: new Float32Array([50, 50.1, 50.2]), votPos: new Float32Array([20, 20.02, 20.04]) };
    const c3 = fakeCtx(); drawPersonalWeb(c3, null, neighbours, opts);
    expect(c3.calls.stroke - ctx0.calls.stroke).toBe(3);
    // a fan from the same verses shares a root, so it layers too; threads of one
    // bin apart at BOTH ends (4 px here, the stroke 0.8) share a path
    const fan = { count: 3, versePos: new Float32Array([50, 50.4, 50.8]), votPos: new Float32Array([10, 20, 40]) };
    const c2 = fakeCtx(); drawPersonalWeb(c2, null, fan, opts);
    expect(c2.calls.stroke - ctx0.calls.stroke).toBe(1);
  });
  it('while a gesture is live a corridor keeps LIVE_CAP layers; at rest every visible one; the cap eases in coverage', () => {
    const base = { count: 0, versePos: new Float32Array(0), votPos: new Float32Array(0) };
    const ctx0 = fakeCtx(); drawPersonalWeb(ctx0, null, base, opts);
    const n = 40;
    const corridor = { count: n, versePos: new Float32Array(n).map((_, i) => 50 + i * 0.01), votPos: new Float32Array(n).fill(20) };
    const rest = fakeCtx(); drawPersonalWeb(rest, null, corridor, opts);
    expect(rest.calls.stroke - ctx0.calls.stroke).toBe(n);   // 40 < the full cap at this alpha
    const liveCtx = fakeCtx(); drawPersonalWeb(liveCtx, null, corridor, Object.assign({}, opts, { capFraction: 0 }));
    expect(liveCtx.calls.stroke - ctx0.calls.stroke).toBe(RR.LIVE_CAP + 1);   // LIVE_CAP layers + the shared overflow
    // coverage, not the layer count, is what eases: at f = 0.5 the cap sits where
    // coverage is halfway between the live and the full coverage
    const a = 0.04;
    const cov = (k) => 1 - Math.pow(1 - a, k);
    const full = RR.layerCap(a, 1), liveCap = RR.layerCap(a, 0), mid = RR.layerCap(a, 0.5);
    expect(liveCap).toBe(RR.LIVE_CAP);
    expect(full).toBeGreaterThan(100);
    expect(Math.abs(cov(mid) - (cov(liveCap) + cov(full)) / 2)).toBeLessThan(0.02);
    // monotone in f
    let prev = 0;
    for (let f = 0; f <= 1.0001; f += 0.05) { const c = RR.layerCap(a, f); expect(c).toBeGreaterThanOrEqual(prev); prev = c; }
  });
});

/** Longest run of consecutive samples that stays within `flat` px of one y
 * while spanning at least `span` px of x, measured over the on-screen part.
 * A streak is a run wider than a third of the screen. */
function widestFlatRun(pts, flat, width) {
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    let j = i;
    while (j + 1 < pts.length && Math.abs(pts[j + 1][1] - pts[i][1]) <= flat) j++;
    const on = pts.slice(i, j + 1).filter((p) => p[0] >= 0 && p[0] <= width);
    if (on.length > 1) best = Math.max(best, Math.abs(on[on.length - 1][0] - on[0][0]));
  }
  return best;
}

describe('My Web r2 — G2 a thread is a line with endpoints on its books', () => {
  const gap = rails.bottomY - rails.topY;
  it('is null when neither endpoint is on screen', () => {
    expect(threadPath([-4000, rails.bottomY], [6000, rails.topY], true, { width: W, gap })).toBeNull();
    expect(threadPath([-4000, rails.bottomY], [-200, rails.bottomY], false, { width: W, gap })).toBeNull();
  });
  it('leaves a visible endpoint toward its far book without a horizontal run across the screen', () => {
    // Corbin's screenshot: at 10x every context thread had its Volumes end
    // thousands of px off screen; main's cubic runs each one flat across the
    // gap at mid height. The visible part must be a LINE that exits.
    for (const far of [-3000, -20000, 4000, 60000]) {
      const pts = threadPath([500, rails.bottomY], [far, rails.topY], true, { width: W, gap });
      expect(pts).not.toBeNull();
      expect(pts[0]).toEqual([500, rails.bottomY]);
      expect(pts[pts.length - 1]).toEqual([far, rails.topY]);
      // no flat run wider than a third of the screen inside the screen
      expect(widestFlatRun(pts, gap * 0.02, W), 'far ' + far).toBeLessThan(W / 3);
    }
  });
  it('keeps both endpoints exactly on their rails when both are visible', () => {
    const pts = threadPath([200, rails.bottomY], [700, rails.topY], true, { width: W, gap });
    expect(pts[0]).toEqual([200, rails.bottomY]);
    expect(pts[pts.length - 1]).toEqual([700, rails.topY]);
    expect(Math.min(...pts.map((p) => p[1]))).toBeGreaterThanOrEqual(rails.topY - 0.01);
    expect(Math.max(...pts.map((p) => p[1]))).toBeLessThanOrEqual(rails.bottomY + 0.01);
  });
  it('is continuous as the far endpoint crosses the screen edge', () => {
    // the point where the thread meets x = 900 must move smoothly as the far
    // end walks from on-screen (980) to just off (1020): no jump > 3 px
    const yAt = (far) => {
      const pts = threadPath([300, rails.bottomY], [far, rails.topY], true, { width: W, gap });
      let best = null;
      for (let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
        if ((x1 - 900) * (x2 - 900) <= 0 && x2 !== x1) { best = y1 + (y2 - y1) * (900 - x1) / (x2 - x1); break; }
      }
      return best;
    };
    // 2 px steps from on screen (960) past the edge (1024) and past the point
    // where the reach caps (~1170 for this thread): every step moves the
    // crossing by less than 3 px (the plain cubic's own slope is 0.62 px/px)
    let prev = yAt(960);
    for (let far = 962; far <= 1400; far += 2) {
      const y = yAt(far);
      expect(y).not.toBeNull();
      expect(Math.abs(y - prev), 'far ' + far).toBeLessThan(3);
      prev = y;
    }
  });
  it('on a wide, shallow frame a thread to a far-off book dives within two gaps of its visible end', () => {
    // 800x360: the gap is 144 px under an 800 px width. Spread over the width
    // the rise is a 0.18 slope, and 2,095 of them were the field again on the
    // phone-landscape capture (streak 0.443). The far end being more than
    // three screens away, the rise completes within REACH_GAPS of the top end.
    const w = 800, g = 144;
    const top = 96, bottom = 240;
    const pts = threadPath([400, top], [-8000, bottom], true, { width: w, gap: g });
    const reached = pts.findIndex((p) => Math.abs(p[1] - bottom) < 0.5);
    expect(reached).toBeGreaterThan(0);
    expect(Math.abs(pts[reached][0] - 400)).toBeLessThanOrEqual(2 * g + 1);
    // and the level run along the far rail is marked, so the renderer can draw it faint
    expect(/** @type {any} */ (pts).rise).toBeGreaterThan(0);
    // a far end just off screen keeps the edge reach (continuity with the on-screen ribbon)
    const near = threadPath([400, top], [-40, bottom], true, { width: w, gap: g });
    expect(/** @type {any} */ (near).rise).toBe(-1);
  });
  it('an intra-rail arc with one end off screen rises and exits, it does not run flat along the apex', () => {
    const pts = threadPath([500, rails.bottomY], [-9000, rails.bottomY], false, { width: W, gap, up: true, maxRy: gap * 0.78 });
    expect(pts).not.toBeNull();
    expect(pts[0]).toEqual([500, rails.bottomY]);
    expect(widestFlatRun(pts, gap * 0.02, W)).toBeLessThan(W / 3);
  });
});

describe('My Web r2 — G3 two transforms, one for each rail', () => {
  it('a VOT endpoint follows the Volumes camera and a verse follows the Bible camera', () => {
    const camB = createCamera(100); camB.ppv = fitPPV(camB, W); camB.x = 50;
    const camV = createCamera(rail.total); camV.ppv = fitPPV(camV, W); camV.x = rail.total / 2;
    // zoom the Volumes rail 10x about the Rebuke band's centre; leave the Bible at fit
    const rebuke = rail.segments.find((s) => s.volKey === 'rebuke');
    const anchor = verseToX(camV, W, rebuke.start + rebuke.count / 2);
    zoomAbout(camV, W, anchor, 10, 1000);
    const two = Object.assign({}, opts, {
      verseX: (verse) => verseToX(camB, W, verse),
      votX: (pos) => verseToX(camV, W, pos),
    });
    const top = endpointPoint({ rail: 1, pos: rebuke.start }, two, rails);
    const bottom = endpointPoint({ rail: 0, pos: 50 }, two, rails);
    // the Bible end sits where fit puts verse 50; the Volumes end where the
    // 10x camera puts the first Rebuke letter: NOT (start/total)*100 verses
    expect(bottom[0]).toBeCloseTo(W / 2, 6);
    expect(top[0]).toBeCloseTo(verseToX(camV, W, rebuke.start + 0.5), 6);
    expect(Math.abs(top[0] - verseToX(camB, W, ((rebuke.start + 0.5) / rail.total) * 100))).toBeGreaterThan(50);
    expect(top[1]).toBe(rails.topY);
    expect(bottom[1]).toBe(rails.bottomY);
  });
  it('without votX the top rail still rides the Bible camera (the pre-r2 contract holds for callers that give one camera)', () => {
    const p = endpointPoint({ rail: 1, pos: 10 }, opts, rails);
    expect(p[0]).toBeCloseTo(opts.verseX(((10 + 0.5) / rail.total) * 100), 6);
  });
});
