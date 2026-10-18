/**
 * My Web r2 — the REDs (design-perf, 2026-09-11; Corbin's three findings on
 * the live My Web: low-resolution grey lines, a horizontal streak field at
 * zoom, one unified zoom that helps nobody).
 *
 * G1  FULL RESOLUTION: the corpus context is stroked on the canvas it is
 *     given, one stroke per edge, never through a half-resolution layer
 *     blitted up (main: CONTEXT_SCALE 0.5 + drawImage, the "low resolution"
 *     Corbin saw).
 * G2  (w3, rewritten to its intent) A THREAD IS ONE SMOOTH CURVE BETWEEN
 *     ITS TRUE FEET: threadPath() samples the S-curve (or the rail-local
 *     half-ellipse) over the part on screen, null only when no part is; a
 *     visible foot is its exact first or last point, so zooming one rail
 *     never shears a line from its foot; vertical at the rails, no elbow; a
 *     thread whose far end has JUST left the screen is continuous with the
 *     one whose far end is still on it.
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
    // 1b: the batch bin is the SOURCE (four of them), not one of 96 canon
    // bins, so four far-apart edges of four sources are four paths, and two
    // far-apart edges of ONE source share a path (they never overlap, so
    // nothing is lost to the sharing; neighbours get their own layers below)
    const underlay = { count: 4, versePos: new Float32Array([5, 20, 50, 95]), votPos: new Float32Array([0, 10, 20, 60]), source: new Uint8Array([0, 1, 2, 3]) };
    const ctx = fakeCtx(), ctx0 = fakeCtx();
    drawPersonalWeb(ctx, null, underlay, opts);
    drawPersonalWeb(ctx0, null, { count: 0, versePos: new Float32Array(0), votPos: new Float32Array(0) }, opts);
    expect(ctx.calls.stroke - ctx0.calls.stroke).toBe(4);
    const shared = { count: 3, versePos: new Float32Array([5, 50, 95]), votPos: new Float32Array([0, 20, 60]), source: new Uint8Array([0, 0, 1]) };
    const ctx1 = fakeCtx();
    drawPersonalWeb(ctx1, null, shared, opts);
    expect(ctx1.calls.stroke - ctx0.calls.stroke).toBe(2);
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

/** Distance from a point to a polyline. */
function distToLine(line, p) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i - 1], [x2, y2] = line[i];
    const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
    let t = len > 0 ? ((p[0] - x1) * dx + (p[1] - y1) * dy) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(p[0] - (x1 + t * dx), p[1] - (y1 + t * dy)));
  }
  return best;
}
/** The largest turn between consecutive segments of a polyline, in degrees. */
function sharpestTurn(pts) {
  let worst = 0;
  for (let i = 2; i < pts.length; i++) {
    const h1 = Math.atan2(pts[i - 1][1] - pts[i - 2][1], pts[i - 1][0] - pts[i - 2][0]);
    const h2 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    let d = Math.abs(h2 - h1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    worst = Math.max(worst, (d * 180) / Math.PI);
  }
  return worst;
}

/* w3 rewrote G2 to its intent (digest §5, Q8 and item 33). r2 hid a thread
 * with no foot on screen and bent a thread to a far foot into a rise and a
 * level run along the far rail: an elbow by the rail, and a line that sheared
 * away from its foot as one rail zoomed. Q8 asks for ONE S-curve with vertical
 * tangents at both feet and no elbow, and Q3 (ii) for every line drawn; what
 * the r2 pins protected (a line attached exactly to its feet, continuous as a
 * foot leaves the screen) is kept. The oracle for "the true curve" is
 * linkPath, the whole curve between the true feet, sampled densely. */
describe('My Web w3 — G2 a thread is one smooth curve between its true feet', () => {
  const gap = rails.bottomY - rails.topY;
  const whole = (a, b) => RR.linkPath(a[0], a[1], b[0], b[1], true, 6000);
  it('is null only when no part of it crosses the screen; a fly-over is drawn, clipped to the screen', () => {
    const fly = threadPath([-4000, rails.bottomY], [6000, rails.topY], true, { width: W, gap });
    expect(fly).not.toBeNull();
    expect(fly.cls).toBe('fly');
    for (const p of fly) { expect(p[0]).toBeGreaterThanOrEqual(-24 - 1e-6); expect(p[0]).toBeLessThanOrEqual(W + 24 + 1e-6); }
    const line = whole([-4000, rails.bottomY], [6000, rails.topY]);
    for (const p of fly) expect(distToLine(line, p)).toBeLessThan(0.5);
    expect(threadPath([-4000, rails.bottomY], [-3000, rails.topY], true, { width: W, gap })).toBeNull();
    expect(threadPath([-4000, rails.bottomY], [-200, rails.bottomY], false, { width: W, gap })).toBeNull();
  });
  it('zooming one rail never shears a line from its foot: the visible foot is the exact first point and every sample lies on the true curve', () => {
    // the Volumes end runs off screen as its rail zooms; the Bible end stays put
    for (const far of [-3000, -20000, 4000, 60000]) {
      const a = [500, rails.bottomY], b = [far, rails.topY];
      const pts = threadPath(a, b, true, { width: W, gap, n: 28 });
      expect(pts).not.toBeNull();
      expect(pts.cls).toBe('leg');
      expect(pts.rise).toBe(-1);             // no level run along the far rail any more
      expect(pts[0]).toEqual(a);
      // the line leaves the screen where the true curve does, at the edge
      expect(Math.abs(pts[pts.length - 1][0] - (far < 0 ? -24 : W + 24))).toBeLessThan(1e-6);
      const line = whole(a, b);
      for (const p of pts) expect(distToLine(line, p), 'far ' + far).toBeLessThan(0.5);
    }
  });
  it('leaves and meets each rail vertically, with no elbow anywhere along the drawn line', () => {
    const cases = [
      [[200, rails.bottomY], [700, rails.topY]],      // anchored
      [[500, rails.bottomY], [-20000, rails.topY]],   // one foot far off
      [[500, rails.topY], [60000, rails.bottomY]],    // from the top rail, farther still
      [[-4000, rails.bottomY], [6000, rails.topY]],   // a fly-over
    ];
    for (const [a, b] of cases) {
      const pts = threadPath(a, b, true, { width: W, gap, n: 28 });
      expect(sharpestTurn(pts), `${a} -> ${b}`).toBeLessThan(20);
      if (pts.cls !== 'fly') {
        // the tangent at the foot, read off a finely sampled copy
        const [p0, p1] = threadPath(a, b, true, { width: W, gap, n: 400 });
        expect(Math.abs(p1[0] - p0[0]) / Math.abs(p1[1] - p0[1]), `leaves ${a}`).toBeLessThan(0.02);
      }
    }
    // the wide, shallow phone frame that made r2 dive: still one smooth curve
    const shallow = threadPath([400, 96], [-8000, 240], true, { width: 800, gap: 144, n: 28 });
    expect(sharpestTurn(shallow)).toBeLessThan(20);
    expect(shallow[0]).toEqual([400, 96]);
  });
  it('keeps both endpoints exactly on their rails when both are visible, on the overview curve itself', () => {
    const pts = threadPath([200, rails.bottomY], [700, rails.topY], true, { width: W, gap });
    expect(pts[0]).toEqual([200, rails.bottomY]);
    expect(pts[pts.length - 1]).toEqual([700, rails.topY]);
    expect(Math.min(...pts.map((p) => p[1]))).toBeGreaterThanOrEqual(rails.topY - 0.01);
    expect(Math.max(...pts.map((p) => p[1]))).toBeLessThanOrEqual(rails.bottomY + 0.01);
    const ref = RR.linkPath(200, rails.bottomY, 700, rails.topY, true, 24);
    pts.forEach((p, i) => { expect(p[0]).toBeCloseTo(ref[i][0], 6); expect(p[1]).toBeCloseTo(ref[i][1], 6); });
    expect(pts.cls).toBe('anchored');
  });
  it('is continuous as the far endpoint crosses the screen edge', () => {
    // the point where the thread meets x = 900 must move smoothly as the far
    // end walks from on-screen (980) to just off (1020) and on out: no jump > 3 px
    const yAt = (far) => {
      const pts = threadPath([300, rails.bottomY], [far, rails.topY], true, { width: W, gap });
      let best = null;
      for (let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
        if ((x1 - 900) * (x2 - 900) <= 0 && x2 !== x1) { best = y1 + (y2 - y1) * (900 - x1) / (x2 - x1); break; }
      }
      return best;
    };
    let prev = yAt(960);
    for (let far = 962; far <= 1400; far += 2) {
      const y = yAt(far);
      expect(y).not.toBeNull();
      expect(Math.abs(y - prev), 'far ' + far).toBeLessThan(3);
      prev = y;
    }
  });
  it('a rail-local arc is a half-ellipse between its true feet, bulging into the gap and never taller than 12% of it', () => {
    // spec §3, My Web: rail-local arcs within 12% of the gap
    const near = threadPath([300, rails.bottomY], [700, rails.bottomY], false, { width: W, gap, up: true });
    expect(near[0]).toEqual([300, rails.bottomY]);
    expect(near[near.length - 1]).toEqual([700, rails.bottomY]);
    expect(Math.max(...near.map((p) => rails.bottomY - p[1]))).toBeCloseTo(0.12 * gap, 6);
    const hang = threadPath([300, rails.topY], [700, rails.topY], false, { width: W, gap, up: false });
    expect(Math.max(...hang.map((p) => p[1] - rails.topY))).toBeCloseTo(0.12 * gap, 6);
    expect(Math.min(...hang.map((p) => p[1]))).toBeGreaterThanOrEqual(rails.topY - 1e-6);
    // one foot far off: attached to the visible foot, on the same ellipse, no elbow
    const far = threadPath([500, rails.bottomY], [-9000, rails.bottomY], false, { width: W, gap, up: true, n: 28 });
    expect(far[0]).toEqual([500, rails.bottomY]);
    const rx = 4750, cx = -4250, ry = 0.12 * gap;
    for (const p of far) expect(Math.abs(((p[0] - cx) / rx) ** 2 + ((rails.bottomY - p[1]) / ry) ** 2 - 1)).toBeLessThan(1e-6);
    expect(sharpestTurn(far)).toBeLessThan(20);
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
