/**
 * scripture-web/geometry + pick tests.
 *
 * The load-bearing property: the analytic hit test must agree with the curve
 * the GPU actually draws, at every zoom. These sample the parametric arc
 * directly and assert the picker finds it — if the height law ever drifts
 * between the shader and the CPU, "tap anywhere on any arc" breaks silently
 * and these fail loudly instead.
 */
import { describe, it, expect } from 'vitest';
import {
  DEPTH_START, DEPTH_END, MAX_STRETCH,
  depthMix, squashFactor, arcDistance,
  threadShape, threadShapeGLSL, arcHeight, sampleTau, SPLIT_MARGIN, glslFloat,
  createCamera, fitPPV, clampCamera, verseToX, xToVerse, zoomAbout,
  rotatePointer,
} from './geometry.js';
import {
  pickArc, pickArcs, arcsTouching, countTouching, pickChapter, pickVerse,
  refOfVerse, chapterRange, findWebReference,
} from './pick.js';
import { deltaRuns, bucketDrawCount, minVotesFor, base64ToBytes, decodeGraph } from './decode.js';
import * as decodeLaw from './decode.js';

/**
 * Where a thread's feet stand, verse units: at its departure slots once the
 * tree has them (M3), at the verse's left edge before. Read off the module
 * object so this file loads on both trees; the slot cases below are the RED.
 */
function feetOf(g, i) {
  const slots = /** @type {any} */ (decodeLaw).slotsOf ? /** @type {any} */ (decodeLaw).slotsOf(g) : null;
  if (!slots) return [g.from[i], g.to[i]];
  return [g.from[i] + slots.slotA[i] / 255, g.to[i] + slots.slotB[i] / 255];
}

// ── a small synthetic graph: 2 books, 4 chapters, 40 verses ─────────────────
function makeGraph(pairs) {
  const chapters = [[0, 1, 0, 10], [0, 2, 10, 10], [1, 1, 20, 10], [1, 2, 30, 10]];
  const total = 40;
  const chapterOfVerse = new Uint16Array(total);
  for (let ci = 0; ci < chapters.length; ci++) {
    for (let v = 0; v < chapters[ci][3]; v++) chapterOfVerse[chapters[ci][2] + v] = ci;
  }
  const n = pairs.length;
  const from = new Uint16Array(n), to = new Uint16Array(n), votes = new Int16Array(n);
  pairs.forEach((p, i) => { from[i] = p[0]; to[i] = p[1]; votes[i] = p[2] == null ? 30 : p[2]; });
  // one bucket holding everything; tier offsets follow the votes given
  const off20 = pairs.filter((p) => (p[2] == null ? 30 : p[2]) >= 20).length;
  const off10 = pairs.filter((p) => (p[2] == null ? 30 : p[2]) >= 7).length;
  return {
    total, count: n, from, to, votes,
    buckets: [{ off: 0, len: n, off20, off10, segments: 32, chunks: [] }],
    books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 },
            { id: 'beta', title: 'Beta', abbr: 'Bet', start: 20 }],
  chapters, chapterOfVerse, densityTiers: [20, 7],
    attribution: 'OpenBible.info (CC-BY)', votEdges: [], prophecy: [], votLinks: [],
  };
}

const VIEW = (over) => Object.assign({
  width: 1000, height: 600, base: 520, ceil: 480, camY: 0,
  squash: squashFactor(480, 1000), density: 'famous', rulerDepth: 40,
}, over);

/**
 * A point exactly ON an arc, at fraction t across the piece of it that is on
 * screen (0 = left edge of that piece, 1 = right edge). Reads the SAME two
 * exports the shader and the picker do — a third copy of the curve here would
 * let pick and draw drift apart while every test stayed green, which is the
 * one thing this file exists to stop.
 *
 * t runs across the VISIBLE piece, not the whole span, because zoomed deep a
 * long arc is hundreds of screens wide and every fraction of its full span but
 * the first fraction of a percent is off screen — sampling the span would test
 * points nobody can tap.
 */
function pointOnArc(g, cam, view, index, t) {
  const [fa, fb] = feetOf(g, index);
  const x0 = verseToX(cam, view.width, fa);
  const x1 = verseToX(cam, view.width, fb);
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const { R, A } = threadShape((x1 - x0) / 2, view.squash);
  const lo = Math.max(left, 0), hi = Math.min(right, view.width);
  const x = lo + (hi - lo) * t;
  const worldBase = view.base + (view.camY || 0) * cam.ppv * view.squash;
  return [x, worldBase - arcHeight(Math.min(x - left, right - x), R, A)];
}

describe('the curve law — the true world', () => {
  // threadShape returns the two radii of the curve that is DRAWN: R, the
  // horizontal radius, and A, its apex. They are (rx, rx * squash) at every
  // zoom: the semi-ellipse this shipped with at the overview is the world,
  // and the camera moves over it (spine section 1). The morph that once
  // bounded R by the ceiling and lifted A to 1.15 x ceil at depth is gone.
  const A = (rx, squash) => threadShape(rx, squash).A;

  it('is a true semicircle at squash 1', () => {
    expect(A(100, 1)).toBeCloseTo(100, 6);
    expect(A(37.5, 1)).toBeCloseTo(37.5, 6);
    expect(threadShape(100, 1).R).toBe(100);
  });

  it('applies the squash so the widest arc fits a landscape frame', () => {
    const squash = squashFactor(300, 1000);   // 300 / 500
    expect(squash).toBeCloseTo(0.6, 6);
    expect(A(500, squash)).toBeCloseTo(300, 6);
  });

  it('stretches \u2014 within limits \u2014 so a portrait phone is not left half empty', () => {
    // 1080x2400 phone: half the WIDTH is 540, but there is ~2000px of height.
    // An unstretched semicircle would sit in the bottom quarter.
    const tall = squashFactor(2000, 1080);
    expect(tall).toBe(MAX_STRETCH);
    expect(A(540, tall)).toBeCloseTo(540 * MAX_STRETCH, 6);
    // and it never becomes a noodle
    expect(squashFactor(999999, 1080)).toBe(MAX_STRETCH);
    expect(squashFactor(300, 0)).toBe(1);
  });

  it('never bounds R by any ceiling and never lifts A: a 1e6 px half-span is a 1e6 px radius', () => {
    // The old law's R <= ceil and A -> 1.15 x ceil were the squatty-lines fix
    // AND the reason no camera could follow a long arc; both are gone.
    expect(threadShape(1e6, 1).R).toBe(1e6);
    expect(threadShape(1e6, 0.64).A).toBe(640000);
    expect(threadShape(30, 1).R).toBe(30);
  });

  it('is monotonic in rx, in both radii, and refuses a negative half-span', () => {
    let prevA = -1, prevR = -1;
    for (let rx = 0; rx < 3000; rx += 37) {
      const sh = threadShape(rx, 0.9);
      expect(sh.A).toBeGreaterThanOrEqual(prevA);
      expect(sh.R).toBeGreaterThanOrEqual(prevR);
      prevA = sh.A; prevR = sh.R;
    }
    expect(threadShape(-5, 1)).toEqual({ R: 0, A: 0 });
  });

  it('publishes the same law to the GLSL the shader inlines', () => {
    expect(threadShapeGLSL).toContain('return vec2(r, r*squash);');
    expect(threadShapeGLSL).not.toContain('tanh');
    expect(threadShapeGLSL).not.toContain('localize');
    // glslFloat, not String: String(2) is '2', an int literal GLSL rejects.
    expect(threadShapeGLSL).toContain(glslFloat(SPLIT_MARGIN) + '*hw');
  });
});

describe('sampleTau — the strip spends its segments on the piece inside the band', () => {
  // The JS twin of the shader's sampler. A = apex, device px; the band is
  // [hLo, hHi] above the world baseline; hw the ribbon's half width + skirt;
  // [txLo, txHi] the x window as parameters (arcTauOf). P = pi.
  const P = Math.PI;
  it('a dome inside the band runs the whole curve: tau 0 .. pi', () => {
    expect(sampleTau(0, 100, P, 0, 500, 2, 0, P)).toBe(0);
    expect(sampleTau(0.5, 100, P, 0, 500, 2, 0, P)).toBeCloseTo(P / 2, 12);
    expect(sampleTau(1, 100, P, 0, 500, 2, 0, P)).toBeCloseTo(P, 12);
  });
  it('a raised band cuts the feet off a dome: the piece starts where the curve crosses the band bottom', () => {
    const sLo = Math.asin(50 / 100);
    expect(sampleTau(0, 100, P, 50, 500, 2, 0, P)).toBeCloseTo(sLo, 12);
    expect(sampleTau(1, 100, P, 50, 500, 2, 0, P)).toBeCloseTo(P - sLo, 12);
  });
  it('an apex above the band splits the strip: the first half is the left leg, the second the right, each clipped a little above the frame', () => {
    const A = 10000, hHi = 500, hw = 2;
    const top = hHi + SPLIT_MARGIN * hw;
    const sHi = Math.asin(top / A);
    expect(sampleTau(0, A, P, 0, hHi, hw, 0, P)).toBe(0);
    expect(sampleTau(0.4999, A, P, 0, hHi, hw, 0, P)).toBeLessThanOrEqual(sHi);
    expect(sampleTau(0.5, A, P, 0, hHi, hw, 0, P)).toBeCloseTo(P - sHi, 12);
    expect(sampleTau(1, A, P, 0, hHi, hw, 0, P)).toBeCloseTo(P, 12);
    // and nothing between the legs is ever sampled: no tau lands in (sHi, pi - sHi)
    for (let t = 0; t <= 1; t += 1 / 64) {
      const tau = sampleTau(t, A, P, 0, hHi, hw, 0, P);
      expect(tau <= sHi + 1e-12 || tau >= P - sHi - 1e-12, `t ${t} tau ${tau}`).toBe(true);
    }
  });
  it('a thread entirely below a raised band collapses to nothing (a degenerate strip)', () => {
    expect(sampleTau(0, 100, P, 200, 500, 2, 0, P)).toBeCloseTo(P / 2, 12);
    expect(sampleTau(1, 100, P, 200, 500, 2, 0, P)).toBeCloseTo(P / 2, 12);
  });
  it('the x window cuts both regimes', () => {
    expect(sampleTau(0, 100, P, 0, 500, 2, 1, 2)).toBe(1);
    expect(sampleTau(1, 100, P, 0, 500, 2, 1, 2)).toBe(2);
    // a leg entirely outside the x window is degenerate (both ends at its own
    // start, so it draws nothing); the other leg draws
    const A = 10000, sHi = Math.asin(504 / A);
    expect(sampleTau(0.25, A, P, 0, 500, 2, 0, sHi)).toBeCloseTo(sHi / 2, 12);
    expect(sampleTau(0.75, A, P, 0, 500, 2, 0, sHi)).toBeCloseTo(P - sHi, 12);
    expect(sampleTau(1, A, P, 0, 500, 2, 0, sHi)).toBeCloseTo(P - sHi, 12);
  });
  it('is inlined verbatim in the GLSL', () => {
    expect(threadShapeGLSL).toContain('float sampleTau(float t, float A, float P, float hLo, float hHi, float hw, float txLo, float txHi)');
    expect(threadShapeGLSL).toContain('bool left = t < .5;');
  });
});

describe('rotatePointer — the CSS-landscape pointer map', () => {
  it('maps the four corners of a portrait screen onto the rotated frame', () => {
    // 1080x2400 portrait, rotated 90° cw: the rotated screen is 2400 wide.
    const W = 1080;
    expect(rotatePointer(W, 0, W)).toEqual({ x: 0, y: 0 });        // phys top-right = rotated origin
    expect(rotatePointer(W, 2400, W)).toEqual({ x: 2400, y: 0 });  // phys bottom-right
    expect(rotatePointer(0, 0, W)).toEqual({ x: 0, y: W });        // phys top-left = rotated bottom-left
    expect(rotatePointer(0, 2400, W)).toEqual({ x: 2400, y: W });
  });

  it('a vertical finger-drag becomes a horizontal pan in the rotated frame', () => {
    const a = rotatePointer(540, 300, 1080);
    const b = rotatePointer(540, 900, 1080);
    expect(b.x - a.x).toBe(600);   // moved along the rotated x axis
    expect(b.y - a.y).toBe(0);     // no cross-axis drift
  });
});

describe('depthMix — the ink law\'s key, the log ramp the geometry used to share', () => {
  it('is 0 at and below the overview threshold', () => {
    expect(depthMix(1)).toBe(0);
    expect(depthMix(DEPTH_START)).toBe(0);
  });
  it('reaches 1 at the end of the ramp and stays there', () => {
    expect(depthMix(DEPTH_END)).toBeCloseTo(1, 6);
    expect(depthMix(5000)).toBe(1);
  });
  it('rises monotonically across the ramp', () => {
    let prev = -1;
    for (let z = 1; z < 64; z *= 1.2) {
      const v = depthMix(z);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('camera', () => {
  it('fits the whole canon at minimum zoom and centres it', () => {
    const cam = createCamera(31102);
    clampCamera(cam, 1000, 5000);
    expect(cam.ppv).toBeCloseTo(fitPPV(cam, 1000), 9);
    expect(cam.x).toBeCloseTo(31102 / 2, 6);
    expect(verseToX(cam, 1000, 0)).toBeCloseTo(0, 6);
    expect(verseToX(cam, 1000, 31102)).toBeCloseTo(1000, 6);
  });

  it('round-trips verse <-> x at any zoom', () => {
    const cam = createCamera(31102);
    clampCamera(cam, 1000, 5000);
    zoomAbout(cam, 1000, 500, 200, 5000);
    for (const v of [0, 1234, 20000, 31101]) {
      expect(xToVerse(cam, 1000, verseToX(cam, 1000, v))).toBeCloseTo(v, 6);
    }
  });

  it('holds the anchor point still while zooming', () => {
    const cam = createCamera(31102);
    clampCamera(cam, 1000, 5000);
    const anchor = 720;
    const before = xToVerse(cam, 1000, anchor);
    zoomAbout(cam, 1000, anchor, 12, 5000);
    expect(xToVerse(cam, 1000, anchor)).toBeCloseTo(before, 3);
  });

  it('never pans the canon off the edge of the viewport', () => {
    const cam = createCamera(31102);
    clampCamera(cam, 1000, 5000);
    zoomAbout(cam, 1000, 500, 50, 5000);
    cam.x = -99999; clampCamera(cam, 1000, 5000);
    expect(verseToX(cam, 1000, 0)).toBeLessThanOrEqual(0.001);
    cam.x = 99999; clampCamera(cam, 1000, 5000);
    expect(verseToX(cam, 1000, cam.total)).toBeGreaterThanOrEqual(999.999);
  });

  it('clamps zoom to the fit floor and the configured ceiling', () => {
    const cam = createCamera(31102);
    clampCamera(cam, 1000, 100);
    const fit = fitPPV(cam, 1000);
    cam.ppv = fit / 1000; clampCamera(cam, 1000, 100);
    expect(cam.ppv).toBeCloseTo(fit, 9);
    cam.ppv = fit * 1e6; clampCamera(cam, 1000, 100);
    expect(cam.ppv).toBeCloseTo(fit * 100, 6);
  });
});

describe('arcDistance', () => {
  it('is ~0 on the curve and grows away from it', () => {
    const base = 500, ry = 200;
    // apex of an arc spanning 200..600
    expect(arcDistance(400, base - ry, 200, 600, base, 200, ry, 10)).toBeLessThan(0.01);
    expect(arcDistance(400, base - ry + 5, 200, 600, base, 200, ry, 10)).toBeGreaterThan(3);
  });

  it('rejects points outside the bounding box', () => {
    expect(arcDistance(50, 400, 200, 600, 500, 200, 200, 6)).toBe(Infinity);   // left of span
    expect(arcDistance(400, 900, 200, 600, 500, 200, 200, 6)).toBe(Infinity);  // below baseline
    expect(arcDistance(400, 100, 200, 600, 500, 200, 200, 6)).toBe(Infinity);  // above apex
  });

  it('ignores degenerate zero-width arcs', () => {
    expect(arcDistance(300, 500, 300, 300, 500, 0, 0, 6)).toBe(Infinity);
  });
});

describe('pickArc agrees with the drawn curve', () => {
  const g = makeGraph([[2, 8], [5, 35], [12, 18], [0, 39], [21, 29]]);

  it('finds every arc at every point along it, at overview', () => {
    const cam = createCamera(g.total);
    clampCamera(cam, 1000, 5000);
    const view = VIEW();
    for (let i = 0; i < g.count; i++) {
      for (const t of [0.02, 0.15, 0.35, 0.5, 0.65, 0.85, 0.98]) {
        const [px, py] = pointOnArc(g, cam, view, i, t);
        const hit = pickArc(g, cam, view, px, py, 6);
        expect(hit, `arc ${i} at t=${t}`).not.toBeNull();
        expect(hit.distance).toBeLessThan(6);
      }
    }
  });

  it('finds the APEX specifically — the point the user aims for', () => {
    const cam = createCamera(g.total);
    clampCamera(cam, 1000, 5000);
    const view = VIEW();
    for (let i = 0; i < g.count; i++) {
      const [px, py] = pointOnArc(g, cam, view, i, 0.5);
      const hit = pickArc(g, cam, view, px, py, 4);
      expect(hit).not.toBeNull();
      expect(hit.index).toBe(i);
    }
  });

  it('still finds arcs when zoomed deep', () => {
    // Every arc here has a foot on verse 20, which the camera holds at screen
    // centre — so all four keep a stem on screen however deep the zoom goes,
    // and what this pins is the true law's stems being where the hit test
    // looks for them.
    const anchoredGraph = makeGraph([[20, 21], [19, 20], [12, 20], [20, 28]]);
    const cam = createCamera(anchoredGraph.total);
    clampCamera(cam, 1000, 5000);
    for (const zoom of [8, 40, 300, 3000]) {
      cam.ppv = fitPPV(cam, 1000) * zoom;
      cam.x = 20;
      clampCamera(cam, 1000, 5000);
      const view = VIEW();
      let found = 0;
      for (let i = 0; i < anchoredGraph.count; i++) {
        // Deep in, a stem is the only part of a long arc still on screen — at
        // 3000x a verse is 75,000 px wide and the piece inside the frame is
        // the 4 px of leg nearest the foot — so sample the near leg by HEIGHT
        // (the inverse of arcHeight), not by fractions of the x window.
        const x0 = verseToX(cam, view.width, anchoredGraph.from[i]);
        const x1 = verseToX(cam, view.width, anchoredGraph.to[i]);
        const { R, A } = threadShape((x1 - x0) / 2, view.squash);
        const footOnScreen = (x0 >= 0 && x0 <= view.width) ? x0 : x1;
        const sign = footOnScreen === x0 ? 1 : -1;      // the leg rises away from its foot
        const top = Math.min(A, view.base);
        for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          const h = top * f;
          const d = R * (1 - Math.sqrt(Math.max(0, 1 - (h / A) * (h / A))));
          const px = footOnScreen + sign * d;
          const py = view.base - h;
          if (px < -50 || px > 1050 || py < -50 || py > 650) continue;
          const hit = pickArc(anchoredGraph, cam, view, px, py, 6);
          expect(hit, `zoom ${zoom} arc ${i} h=${h.toFixed(1)}`).not.toBeNull();
          found++;
        }
      }
      expect(found, `zoom ${zoom} had no on-screen sample points`).toBeGreaterThan(0);
    }
  });

  it('keeps the Famous cutoff itself tappable', () => {
    const famous = makeGraph([[6, 33, 7]]);
    const cam = createCamera(famous.total);
    clampCamera(cam, 1000, 5000);
    for (const zoom of [1, 40, 1711]) {
      cam.ppv = fitPPV(cam, 1000) * zoom;
      cam.x = 6;
      clampCamera(cam, 1000, 5000);
      const view = VIEW({ density: 'famous' });
      for (const t of [0.08, 0.5, 0.92]) {
        const [px, py] = pointOnArc(famous, cam, view, 0, t);
        if (py < -50) continue;                  // that piece is above the frame at this zoom
        const hit = pickArc(famous, cam, view, px, py, 6);
        expect(hit, `Famous arc at zoom=${zoom}, t=${t}`).toMatchObject({ index: 0 });
      }
    }
  });

  it('returns overlapping candidates instead of hiding the second line', () => {
    const overlap = makeGraph([[2, 38], [2, 38]]);
    const cam = createCamera(overlap.total);
    clampCamera(cam, 1000, 5000);
    const view = VIEW();
    const [px, py] = pointOnArc(overlap, cam, view, 0, 0.5);
    expect(pickArcs(overlap, cam, view, px, py, 8, 4).map((hit) => hit.index))
      .toEqual([0, 1]);
  });

  it('reads the index, not the chunk table (inverted at M2): a chunk table that lies about every extent hides nothing from the finger', () => {
    // The renderer's overview regime still culls by chunk extent; the hit
    // test used to as well, so a wrong table made an arc undrawn AND
    // untappable together. Now the index decides what is tappable, from the
    // threads' own feet — and the gathered regime draws from the same walk.
    const chunked = makeGraph([[2, 8], [5, 35], [12, 18], [0, 39], [21, 29]]);
    chunked.chunkSize = 2;
    chunked.buckets[0].chunks = [[100, 100], [100, 100], [100, 100]];
    const cam = createCamera(chunked.total);
    clampCamera(cam, 1000, 5000);
    const view = VIEW();
    const [px, py] = pointOnArc(chunked, cam, view, 3, 0.5);
    expect(pickArc(chunked, cam, view, px, py, 6)).toMatchObject({ index: 3 });
  });

  it('returns null on empty sky', () => {
    const cam = createCamera(g.total);
    clampCamera(cam, 1000, 5000);
    expect(pickArc(g, cam, VIEW(), 500, 20, 6)).toBeNull();
  });

  it('M3: a tap 3 px left of the MIDDLE departure slot picks the middle thread, not its neighbour (today every foot coincides and there is no middle)', () => {
    // three threads leave verse 5 for 12 < 20 < 30: slots 1/4, 1/2, 3/4 of
    // the cell, 44/4 = 11 px apart at 44 px per verse. The middle foot stands
    // at verse 5.5; 3 px to its left is 8 px from the left neighbour's foot.
    const slotted = makeGraph([[5, 12], [5, 20], [5, 30]]);
    const cam = createCamera(slotted.total);
    cam.ppv = 44; cam.x = 8;
    clampCamera(cam, 1000, 5000);
    const view = VIEW();
    const xMid = verseToX(cam, view.width, 5 + 128 / 255);
    const hit = pickArc(slotted, cam, view, xMid - 3, view.base - 1, 6);
    expect(hit, 'a thread under the finger at the middle slot').not.toBeNull();
    expect(hit.index, 'the middle thread (to verse 20)').toBe(1);
  });

  it('will not pick an arc the density filter has hidden', () => {
    // The shipped web stops at Famous (votes >= 7); weaker rows must stay
    // untappable, or the user hits something they cannot see.
    const weak = makeGraph([[0, 39, 50], [2, 8, 1]]);
    const cam = createCamera(weak.total);
    clampCamera(cam, 1000, 5000);
    const at = (density) => {
      const view = VIEW({ density });
      const [px, py] = pointOnArc(weak, cam, view, 1, 0.5);
      return pickArc(weak, cam, view, px, py, 5);
    };
    expect(at('famous')).toBeNull();
    expect(at('essential')).toBeNull();
  });
});

describe('there is no fly-over law: a thread with a piece on screen is drawn at every depth, so it is picked', () => {
  // The fly-over dimming law (arcAnchored + flyOverDim, floor 0.35) existed
  // to hide the level runs the morph put above the frame; under the true
  // law a thread's body is at its own height and the field at depth is
  // clean by geometry, so the law and its shader branch are gone (spine
  // section 1). What replaces it is stronger than "never fades to nothing":
  // nothing is dimmed at all, and the picker has no visibility test to
  // agree with.
  const FLY = (over) => Object.assign({
    width: 400, height: 600, base: 520, ceil: 200, camY: 0,
    squash: squashFactor(200, 400), density: 'famous', rulerDepth: 40,
  }, over);
  /** [18,22] has both feet off the frame (at -30 and 430); [20,22] has one on it. */
  const g = makeGraph([[18, 22], [20, 22]]);
  const cam = createCamera(g.total);
  cam.ppv = 115;
  clampCamera(cam, 400, 5000);

  it("PICKS the thread at its own midpoint with both feet off the frame — Corbin's chase, in one arc", () => {
    const view = FLY();
    const [px, py] = pointOnArc(g, cam, view, 0, 0.5);
    expect(px).toBeGreaterThan(0);
    expect(px).toBeLessThan(view.width);
    expect(pickArc(g, cam, view, px, py, 6)).toMatchObject({ index: 0 });
  });

  it('picks the thread with one foot on the frame at the same depth', () => {
    const view = FLY();
    const [px, py] = pointOnArc(g, cam, view, 1, 0.5);
    expect(pickArc(g, cam, view, px, py, 6)).toMatchObject({ index: 1 });
  });

  it('picks a stem the y camera has raised into view, against the WORLD baseline', () => {
    // Pan the camera 2 verses up: the feet are now below the frame and the
    // stems cross it higher. A tap on the stem must measure against the
    // world baseline (base + camY x ppv x squash), not the frame's row.
    const view = FLY({ camY: 2 });
    const [px, py] = pointOnArc(g, cam, view, 1, 0.25);
    expect(pickArc(g, cam, view, px, py, 6)).toMatchObject({ index: 1 });
    const wrong = FLY({ camY: 0 });
    expect(pickArc(g, cam, wrong, px, py, 6), 'the same point read against the frame row').toBeNull();
  });

  it('carries no fly-over symbol into the shader law', () => {
    expect(threadShapeGLSL).not.toMatch(/flyOver|arcAnchored|flyFloor/);
  });
});

describe('focus + ruler picking', () => {
  const g = makeGraph([[2, 8], [5, 35], [12, 18], [0, 39], [21, 29]]);

  it('collects every arc touching a verse range', () => {
    const [lo, hi] = chapterRange(g, 0);            // verses 0..9
    const idx = arcsTouching(g, lo, hi, 'famous');
    expect(idx).toEqual([0, 1, 3]);
    expect(countTouching(g, lo, hi, 'famous')).toBe(3);
  });

  it('honours the limit', () => {
    expect(arcsTouching(g, 0, 39, 'famous', 2)).toHaveLength(2);
  });

  it('reads a chapter off the ruler strip and rejects the sky', () => {
    const cam = createCamera(g.total);
    clampCamera(cam, 1000, 5000);
    const view = VIEW();
    const x = verseToX(cam, view.width, 25);
    expect(pickChapter(g, cam, view, x, view.base + 10)).toBe(2);
    expect(pickChapter(g, cam, view, x, 100)).toBe(-1);
  });

  it('reads a verse off the ruler when zoomed in', () => {
    const cam = createCamera(g.total);
    clampCamera(cam, 1000, 5000);
    const view = VIEW();
    const x = verseToX(cam, view.width, 17.5);
    expect(pickVerse(g, cam, view, x, view.base + 10)).toBe(17);
  });

  it('labels a verse with its book, chapter and verse number', () => {
    expect(refOfVerse(g, 0).label).toBe('Alpha 1:1');
    expect(refOfVerse(g, 19).label).toBe('Alpha 2:10');
    expect(refOfVerse(g, 20).label).toBe('Beta 1:1');
    expect(refOfVerse(g, 39)).toMatchObject({ bookId: 'beta', chapter: 2, verse: 10 });
  });

  it('resolves title and abbreviation references for Go to', () => {
    expect(findWebReference(g, 'Alp 1:3')).toMatchObject({
      chapterIndex: 0, verse: 2, hasVerse: true, label: 'Alpha 1:3',
    });
    expect(findWebReference(g, 'Beta 2')).toMatchObject({
      chapterIndex: 3, verse: 30, hasVerse: false, label: 'Beta 2',
    });
    expect(findWebReference(g, 'Beta 2:99')).toBeNull();
    expect(findWebReference(g, 'Nope 1')).toBeNull();
  });

  it('reports chapter ranges inclusively', () => {
    expect(chapterRange(g, 0)).toEqual([0, 9]);
    expect(chapterRange(g, 3)).toEqual([30, 39]);
  });
});

describe('decode', () => {
  it('mirrors the generator delta runs, skipping empty tiers', () => {
    const bucket = (off, len, off20, off10) =>
      ({ off, len, off20, off10, segments: 8, chunks: [] });
    expect(deltaRuns(bucket(0, 10, 3, 7))).toEqual([[0, 3], [3, 4], [7, 3]]);
    expect(deltaRuns(bucket(5, 4, 0, 0))).toEqual([[5, 4]]);
    expect(deltaRuns(bucket(0, 3, 3, 3))).toEqual([[0, 3]]);
  });

  it('maps density names to prefix counts and vote floors', () => {
    const b = { off: 0, len: 100, off20: 10, off10: 40, segments: 16, chunks: [] };
    expect(bucketDrawCount(b, 'essential')).toBe(10);
    expect(bucketDrawCount(b, 'famous')).toBe(40);
    expect(minVotesFor('essential', [20, 7])).toBe(20);
    expect(minVotesFor('famous', [20, 7])).toBe(7);
  });

  it('decodes base64 to bytes', () => {
    expect(Array.from(base64ToBytes(btoa('AB')))).toEqual([65, 66]);
  });

  it('reconstructs pairs across a tier boundary and builds the verse index', () => {
    // from restarts at the tier boundary — the wrap bug the schema gate caught
    const enc = (nums, Ctor) => {
      const t = new Ctor(nums.length);
      nums.forEach((n, i) => { t[i] = n; });
      const bytes = new Uint8Array(t.buffer);
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    };
    const data = {
      total: 40, count: 4,
      // tier0: from 30, 35 | tier1: from 2, 6  (accumulator resets)
      dfrom64: enc([30, 5, 2, 4], Uint16Array),
      span64: enc([5, 4, 3, 2], Uint16Array),
      votes64: enc([50, 25, 12, 11], Int16Array),
      buckets: [{ off: 0, len: 4, off20: 2, off10: 4, segments: 8, chunks: [] }],
      books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 }],
      chapters: [[0, 1, 0, 40]],
      densityTiers: [20, 7],
      attribution: 'OpenBible.info (CC-BY)',
    };
    const g = decodeGraph(data);
    expect(Array.from(g.from)).toEqual([30, 35, 2, 6]);
    expect(Array.from(g.to)).toEqual([35, 39, 5, 8]);
    expect(g.chapterOfVerse[39]).toBe(0);
    expect(g.attribution).toContain('OpenBible');
  });

  it('throws on missing data rather than rendering nothing silently', () => {
    expect(() => decodeGraph(null)).toThrow(/missing/);
    expect(() => decodeGraph({ count: 0 })).toThrow(/missing/);
  });
});

/* ── the true law (w-sw-phase1, M1) ──────────────────────────────────────────
   Corbin, 2026-09-11: pan up and down the same as left and right; every line
   clean and followable end to end. The morph (localizeFactor 6 -> 24, the
   tanh ceiling, the level run at APEX_LIFT above the frame) is what made a
   vertical camera useless: every long thread's body sat at the same height
   above the frame. The true world (spine section 1): a thread from a to b is
   the half-ellipse with feet at (a, 0) and (b, 0) and apex (b - a)/2 in verse
   units, at EVERY zoom -- today's fit-time law, and nothing else.

   The cases read the law through an adapter so they REPLAY over the base:
   threadShape(rx, squash) on the tip; arcShape(...) + localizeFactor on a1d52a23. */
import * as geoLaw from './geometry.js';
describe('departure slots — the threads leaving one verse fan out across its cell in destination order (M3)', () => {
  const { assignSlots, slotsOf } = /** @type {any} */ (decodeLaw);

  it('three threads from one verse to destinations 12 < 40 < 900 take slots 1/4, 1/2, 3/4 in that order', () => {
    const from = Uint16Array.from([5, 5, 5]), to = Uint16Array.from([900, 12, 40]);
    const { slotA } = assignSlots(from, to, 3, 1000);
    expect(slotA[1] / 255, 'to 12').toBeCloseTo(0.25, 2);
    expect(slotA[2] / 255, 'to 40').toBeCloseTo(0.50, 2);
    expect(slotA[0] / 255, 'to 900').toBeCloseTo(0.75, 2);
  });

  it('a lone thread takes the middle of its cell at both feet', () => {
    const { slotA, slotB } = assignSlots(Uint16Array.from([7]), Uint16Array.from([30]), 1, 40);
    expect(slotA[0] / 255).toBeCloseTo(0.5, 2);
    expect(slotB[0] / 255).toBeCloseTo(0.5, 2);
  });

  it('a leftward thread ranks before every rightward one at the verse they share, so nothing crosses inside the cell', () => {
    // at verse 50: [10, 50] arrives from the left; [50, 60] and [50, 70] leave to the right
    const from = Uint16Array.from([50, 10, 50]), to = Uint16Array.from([70, 50, 60]);
    const { slotA, slotB } = assignSlots(from, to, 3, 100);
    expect(slotB[1], 'the leftward thread\'s foot at 50').toBeLessThan(slotA[2]);
    expect(slotA[2], 'to 60 before to 70').toBeLessThan(slotA[0]);
    expect([slotB[1], slotA[2], slotA[0]].map((s) => Math.round(s / 255 * 4) / 4)).toEqual([0.25, 0.5, 0.75]);
  });

  it('slotsOf builds once per graph object and returns Uint8Arrays the size of the graph', () => {
    const g = makeGraph([[2, 8], [5, 35], [12, 18]]);
    const s = slotsOf(g);
    expect(slotsOf(g)).toBe(s);
    expect(s.slotA).toBeInstanceOf(Uint8Array);
    expect(s.slotA.length).toBe(3);
    expect(s.slotB.length).toBe(3);
  });

  it('at 44 px per verse five threads from one verse leave 7.33 CSS px apart in destination order; at the phone\'s fit the whole fan is under 0.06 px', () => {
    const g = makeGraph([[5, 39], [5, 10], [5, 30], [5, 20], [5, 35]]);
    const { slotA } = slotsOf(g);
    const cam = createCamera(g.total);
    cam.ppv = 44; cam.x = 8;
    clampCamera(cam, 1000, 5000);
    const byDest = [1, 3, 2, 4, 0];                       // to 10, 20, 30, 35, 39
    const xs = byDest.map((i) => verseToX(cam, 1000, g.from[i] + slotA[i] / 255));
    for (let k = 1; k < xs.length; k++) {
      expect(xs[k] - xs[k - 1], `gap ${k}`).toBeGreaterThan(7.33 - 0.15);
      expect(xs[k] - xs[k - 1], `gap ${k}`).toBeLessThan(7.33 + 0.15);
    }
    // the same fan at the shipped asset's fit on the phone frame (1600 / 31102 px per verse)
    const fitPpv = 1600 / 31102;
    expect((Math.max(...slotA) - Math.min(...slotA)) / 255 * fitPpv).toBeLessThan(0.06);
  });
});

describe('the true law: a thread is a half-ellipse whose height is its span, at every zoom (w-sw-phase1, M1)', () => {
  const CEIL = 512, SQUASH = 0.64, TOTAL = 31102;      // the phone landscape frame, device px
  const law = /** @type {any} */ (geoLaw);        // the base tree's names are not on the tip's type
  const shapeAt = (rx, zoom, span) => (typeof law.threadShape === 'function'
    ? law.threadShape(rx, SQUASH)
    : law.arcShape(rx, CEIL, SQUASH, law.localizeFactor(zoom), law.spanLogOf(span, TOTAL)));

  it("at the ceiling a 1,000-verse thread's apex is its own height: 28,160 device px (500 x 88 x 0.64), not 1.15 x ceil", () => {
    const rx = 500 * 88;                                // half of 1,000 verses at 44 CSS px/verse, DPR 2
    const { R, A } = shapeAt(rx, 1711, 1000);
    expect(A, 'apex height').toBeCloseTo(28160, 6);
    expect(R, 'quarter radius stays the half-span').toBe(rx);
  });

  it('is the fit-time law at every zoom: R = rx, A = rx x squash, for spans 3 to 10,000 at 1x, 40x and the ceiling', () => {
    for (const zoom of [1, 40, 1711]) {
      const ppv = (1600 / TOTAL) * zoom;
      for (const span of [3, 40, 900, 10000]) {
        const rx = (span * ppv) / 2;
        const { R, A } = shapeAt(rx, zoom, span);
        expect(R, `zoom ${zoom} span ${span} R`).toBe(rx);
        expect(A, `zoom ${zoom} span ${span} A`).toBeCloseTo(rx * SQUASH, 9);
      }
    }
  });

  it('CONTROL — the adapter reaches a law that CAN differ: the fit row is the same under both (localize 0 is today\'s overview)', () => {
    const rx = (900 * (1600 / TOTAL)) / 2;
    const { R, A } = shapeAt(rx, 1, 900);
    expect(R).toBe(rx);
    expect(A).toBeCloseTo(rx * SQUASH, 9);
  });
});

/* ── M2: the visibility predicate every consumer shares ─────────────────── */
// Read off the module object so the file loads on the base tree too: there
// the two are undefined and each case fails on its own line ("footReach is
// not a function"), not the whole file at import.
const { footReach, threadVisible } = /** @type {any} */ (geoLaw);

/** mulberry32, so a failing pair can be re-run by seed. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('threadVisible — the true world\'s half-ellipse against a rectangle, exact', () => {
  it('footReach: nothing at the baseline, the whole half-span at the apex, r - sqrt(r^2 - y^2) between', () => {
    expect(footReach(10, 0)).toBe(0);
    expect(footReach(10, 10)).toBe(10);
    expect(footReach(10, 12), 'above the apex it saturates').toBe(10);
    expect(footReach(5, 3)).toBeCloseTo(1, 12);          // 5 - 4
    expect(footReach(0, 3), 'a degenerate thread reaches nowhere').toBe(0);
  });

  it('agrees with a 2,048-sample rasterisation of the curve over 600 random (thread, rectangle) pairs, both verdicts reached', () => {
    // The curve in verse units: x = a + r(1 - cos tau), h = r sin tau — the
    // apex IS the half-span (the true law). Sampled-inside implies the
    // predicate (it has no false negatives); the predicate implies a sample
    // inside the rectangle grown by two sample gaps (it has no false
    // positives beyond the sampling resolution).
    const r = rng(23);
    const N = 2048;
    let yes = 0, no = 0, legs = 0;
    for (let i = 0; i < 600; i++) {
      const half = Math.exp(r() * Math.log(4000));
      const a = r() * 8000, b = a + 2 * half;
      const w = Math.exp(r() * Math.log(8000)) * (r() < 0.2 ? 0.001 : 1);
      // six in ten rectangles overlap the thread's feet in x, so both verdicts are common
      const xa = r() < 0.6 ? a - w + (w + 2 * half) * r() : r() * 9000 - 500;
      const xb = xa + w;
      const y0 = r() < 0.5 ? 0 : r() * half * 1.3;
      const y1 = y0 + Math.exp(r() * Math.log(4000)) * (r() < 0.2 ? 0.001 : 1);
      const gap = Math.PI * half / N;                     // the longest step between samples
      let inside = false, near = false;
      for (let k = 0; k <= N; k++) {
        const tau = Math.PI * k / N;
        const x = a + half * (1 - Math.cos(tau)), h = half * Math.sin(tau);
        if (x >= xa && x <= xb && h >= y0 && h <= y1) inside = true;
        if (x >= xa - 2 * gap && x <= xb + 2 * gap && h >= y0 - 2 * gap && h <= y1 + 2 * gap) near = true;
      }
      const v = threadVisible(a, b, xa, xb, y0, y1);
      if (inside) expect(v, `sampled inside but refused: ${JSON.stringify({ a, b, xa, xb, y0, y1 })}`).toBe(true);
      if (v) expect(near, `admitted but no sample near: ${JSON.stringify({ a, b, xa, xb, y0, y1 })}`).toBe(true);
      if (v) yes++; else no++;
      if (v && half > y1) legs++;
    }
    expect(yes).toBeGreaterThan(100);
    expect(no).toBeGreaterThan(100);
    expect(legs, 'admitted through a leg alone (apex above the band)').toBeGreaterThan(20);
  });

  it('the three regimes by hand: apex in the band, legs only, apex below the band', () => {
    // thread [100, 120]: r = 10, apex at 10
    expect(threadVisible(100, 120, 105, 115, 0, 20), 'apex inside').toBe(true);
    expect(threadVisible(100, 120, 105, 115, 0, 5), 'only the legs reach the band, and neither leg is in the x window').toBe(false);
    expect(threadVisible(100, 120, 100, 101.5, 0, 5), 'the left leg crosses the band inside the window (reach(5) = 1.34)').toBe(true);
    expect(threadVisible(100, 120, 100, 101.5, 6, 8), 'the same leg higher up: reach(6) = 2 > 1.5, so it has left the window').toBe(false);
    expect(threadVisible(100, 120, 0, 1000, 11, 20), 'apex below the band').toBe(false);
    expect(threadVisible(100, 120, 0, 1000, 10, 20), 'apex exactly at the band bottom').toBe(true);
    expect(threadVisible(100, 100, 0, 1000, 0, 20), 'a zero-span thread has no curve').toBe(false);
  });
});

describe('the GLSL sampleTau IS the JS sampleTau — the twin transliterated and run (verifier-2, M1)', () => {
  /**
   * Turn the GLSL body of sampleTau into a JS function. Every identifier the
   * result uses must be on the allow-list, so a GLSL built-in the twin gains
   * later fails this pin loudly instead of being silently miscompared.
   */
  function twinOf(glsl) {
    const start = glsl.indexOf('float sampleTau(');
    if (start < 0) throw new Error('threadShapeGLSL has no sampleTau');
    let body = glsl.slice(start);
    body = body.slice(0, body.indexOf('\n}') + 2);
    const js = body
      .replace(/^float sampleTau\(([^)]*)\)/, (_, args) => `function sampleTau(${args.replace(/float /g, '')})`)
      .replace(/\b(float|bool) /g, 'let ')
      .replace(/\basin\(/g, 'Math.asin(')
      .replace(/\bmax\(/g, 'Math.max(')
      .replace(/\bmin\(/g, 'Math.min(');
    const allowed = new Set(['function', 'sampleTau', 't', 'A', 'P', 'hLo', 'hHi', 'hw', 'txLo', 'txHi',
      'let', 'sLo', 'sHi', 'a0', 'a1', 'u', 'left', 'if', 'else', 'return', 'Math', 'asin', 'max', 'min',
      'clamp', 'mix', 'true', 'false']);
    const idents = js.match(/[A-Za-z_]\w*/g) || [];   // an identifier starts with a letter, so 2.0 and .5 never match
    for (const id of idents) {
      if (!allowed.has(id)) throw new Error(`the GLSL twin uses \`${id}\`: extend the transliteration before trusting this pin`);
    }
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const mix = (x, y, f) => x + (y - x) * f;
    return new Function('clamp', 'mix', js + '; return sampleTau;')(clamp, mix);
  }

  /** 1,500 tuples across both regimes, both legs, and x windows that cut. */
  function sweep(seed) {
    const r = rng(seed);
    const out = [];
    for (let i = 0; i < 1500; i++) {
      const A = 20 + r() * 5000;
      const hLo = r() < 0.4 ? 0 : r() * A * 1.2;
      const hHi = hLo + r() * A * 1.5;
      const hw = 0.5 + r() * 12;
      const lo = r() * Math.PI, hi = r() * Math.PI;
      const txLo = r() < 0.15 ? 0 : Math.min(lo, hi), txHi = r() < 0.15 ? Math.PI : Math.max(lo, hi);
      out.push([A, Math.PI, hLo, hHi, hw, r() < 0.05 ? txHi : txLo, txHi]);
    }
    return out;
  }
  const T = Array.from({ length: 33 }, (_, k) => k / 32);
  const at = (fn, t, a) => fn(t, a[0], a[1], a[2], a[3], a[4], a[5], a[6]);

  it('agrees with the JS to 1e-9 on 1,500 tuples x 33 strip parameters, and both regimes are reached', () => {
    const twin = twinOf(threadShapeGLSL);
    let split = 0, whole = 0;
    for (const args of sweep(5)) {
      const [A, , , hHi, hw] = args;
      if (A <= hHi + SPLIT_MARGIN * hw) whole++; else split++;
      for (const t of T) {
        const want = at(sampleTau, t, args);
        expect(at(twin, t, args), `t=${t} args=${JSON.stringify(args)}`).toBeCloseTo(want, 9);
      }
    }
    expect(split).toBeGreaterThan(300);
    expect(whole).toBeGreaterThan(300);
  });

  it('BITES: forcing the twin\'s split test true (verifier-2\'s bite f) makes it disagree with the JS', () => {
    const needle = `if (A <= hHi + ${glslFloat(SPLIT_MARGIN)}*hw)`;
    expect(threadShapeGLSL).toContain(needle);
    const bitten = twinOf(threadShapeGLSL.replace(needle, 'if (true)'));
    let disagree = 0;
    for (const args of sweep(5)) {
      for (const t of T) if (Math.abs(at(bitten, t, args) - at(sampleTau, t, args)) > 1e-9) disagree++;
    }
    expect(disagree).toBeGreaterThan(1000);
  });

  it('BITES: a GLSL built-in the transliteration does not know is refused, not miscompared', () => {
    expect(() => twinOf(threadShapeGLSL.replace('asin(clamp(hLo/A, 0., 1.))', 'smoothstep(0., 1., hLo/A)')))
      .toThrow(/smoothstep/);
  });
});
