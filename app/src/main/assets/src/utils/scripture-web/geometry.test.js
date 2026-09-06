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
  CEIL_SOFTNESS, LOCALIZE_START, LOCALIZE_END, MAX_STRETCH, FLYOVER_MARGIN,
  localizeFactor, squashFactor, arcDistance,
  arcShape, arcShapeGLSL, arcHeight, spanLogOf, APEX_LIFT, FAN_FLOOR,
  arcAnchored, flyOverDim, flyOverGLSL,
  createCamera, fitPPV, clampCamera, verseToX, xToVerse, zoomAbout,
  rotatePointer,
} from './geometry.js';
import {
  pickArc, pickArcs, arcsTouching, countTouching, pickChapter, pickVerse,
  refOfVerse, chapterRange, findWebReference,
} from './pick.js';
import { deltaRuns, bucketDrawCount, minVotesFor, base64ToBytes, decodeGraph } from './decode.js';

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
  width: 1000, height: 600, base: 520, ceil: 480, localize: 0,
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
  const x0 = verseToX(cam, view.width, g.from[index]);
  const x1 = verseToX(cam, view.width, g.to[index]);
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const { R, A } = arcShape((x1 - x0) / 2, view.ceil, view.squash, view.localize,
    spanLogOf(Math.abs(g.to[index] - g.from[index]), g.total));
  const lo = Math.max(left, 0), hi = Math.min(right, view.width);
  const x = lo + (hi - lo) * t;
  return [x, view.base - arcHeight(Math.min(x - left, right - x), R, A)];
}

describe('the curve law', () => {
  // arcShape returns the two radii of the curve that is DRAWN: R, the
  // horizontal radius of the quarter-ellipse rising from each foot, and A,
  // its apex. At overview they are (rx, rx * squash) and the curve is exactly
  // the semi-ellipse this shipped with; localized, R stops following rx and
  // the apex lifts above the frame so nothing level is left on screen.
  const A = (rx, ceil, squash, loc, span) => arcShape(rx, ceil, squash, loc, span).A;

  it('is a true semicircle at overview (localize 0, squash 1)', () => {
    expect(A(100, 480, 1, 0, 0.5)).toBeCloseTo(100, 6);
    expect(A(37.5, 480, 1, 0, 0.5)).toBeCloseTo(37.5, 6);
    expect(arcShape(100, 480, 1, 0, 0.5).R).toBe(100);
  });

  it('applies the squash so the widest arc fits a landscape frame', () => {
    const squash = squashFactor(300, 1000);   // 300 / 500
    expect(squash).toBeCloseTo(0.6, 6);
    expect(A(500, 300, squash, 0, 0.5)).toBeCloseTo(300, 6);
  });

  it('stretches \u2014 within limits \u2014 so a portrait phone is not left half empty', () => {
    // 1080x2400 phone: half the WIDTH is 540, but there is ~2000px of height.
    // An unstretched semicircle would sit in the bottom quarter.
    const tall = squashFactor(2000, 1080);
    expect(tall).toBe(MAX_STRETCH);
    expect(A(540, 2000, tall, 0, 0.5)).toBeCloseTo(540 * MAX_STRETCH, 6);
    // and it never becomes a noodle
    expect(squashFactor(999999, 1080)).toBe(MAX_STRETCH);
    expect(squashFactor(300, 0)).toBe(1);
  });

  it('lifts the apex ABOVE the frame once localized, and never further', () => {
    // The old law saturated AT the ceiling, which put every long arc's flat
    // top on screen at the same height - the apex smear S2 names.
    for (const rx of [10, 500, 5000, 100000]) {
      expect(A(rx, 480, 1, 1, 1)).toBeLessThanOrEqual(480 * APEX_LIFT);
    }
    expect(A(1e9, 480, 1, 1, 1)).toBeCloseTo(480 * APEX_LIFT, 3);
    expect(A(1e9, 480, 1, 1, 1)).toBeGreaterThan(480);
  });

  it('bounds the quarter by the ceiling, so a long arc leaves near its foot', () => {
    // R following rx is the whole of the squatty-lines defect: a 440,000 px
    // radius near its foot is a horizontal line.
    expect(arcShape(1e6, 480, 1, 1, 1).R).toBeLessThanOrEqual(480);
    expect(arcShape(1e6, 480, 1, 1, 0).R).toBeCloseTo(480 * FAN_FLOOR, 6);
    // A short arc keeps its own radius - there is nothing to bound.
    expect(arcShape(30, 480, 1, 1, 1).R).toBe(30);
  });

  it('stays near-circular for small arcs even when localized', () => {
    // tanh(x) ~ x for small x, so a short arc is still a proper arch -
    // this is what makes deep zoom look right instead of flattened.
    const rx = 5;
    expect(A(rx, 480, 1, 1, 0.5)).toBeCloseTo(APEX_LIFT * rx / CEIL_SOFTNESS, 2);
  });

  it('is monotonic in rx at every localize step, in both radii', () => {
    for (const loc of [0, 0.25, 0.5, 0.75, 1]) {
      let prevA = -1, prevR = -1;
      for (let rx = 0; rx < 3000; rx += 37) {
        const s = arcShape(rx, 480, 0.9, loc, 0.6);
        expect(s.A).toBeGreaterThanOrEqual(prevA);
        expect(s.R).toBeGreaterThanOrEqual(prevR);
        prevA = s.A; prevR = s.R;
      }
    }
  });

  it('widens the quarter with the span, monotonically', () => {
    let prev = -1;
    for (let spanLog = 0; spanLog <= 1.0001; spanLog += 0.05) {
      const R = arcShape(1e6, 480, 1, 1, spanLog).R;
      expect(R).toBeGreaterThanOrEqual(prev);
      prev = R;
    }
  });

  it('publishes the same constants to the GLSL the shader inlines', () => {
    expect(arcShapeGLSL).toContain(String(CEIL_SOFTNESS));
    expect(arcShapeGLSL).toContain(String(APEX_LIFT));
    expect(arcShapeGLSL).toContain(String(FAN_FLOOR));
    expect(arcShapeGLSL).toContain('tanh');
    expect(arcShapeGLSL).toContain('mix(r, deepR, localize)');
    expect(arcShapeGLSL).toContain('mix(r*squash, deepA, localize)');
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

describe('localizeFactor', () => {
  it('is 0 at and below the overview threshold', () => {
    expect(localizeFactor(1)).toBe(0);
    expect(localizeFactor(LOCALIZE_START)).toBe(0);
  });
  it('reaches 1 at the end of the ramp and stays there', () => {
    expect(localizeFactor(LOCALIZE_END)).toBeCloseTo(1, 6);
    expect(localizeFactor(5000)).toBe(1);
  });
  it('rises monotonically across the ramp', () => {
    let prev = -1;
    for (let z = 1; z < 64; z *= 1.2) {
      const v = localizeFactor(z);
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
    const view = VIEW({ localize: localizeFactor(1) });
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

  it('still finds arcs when zoomed deep, with localize engaged', () => {
    // Every arc here has a foot on verse 20, which the camera holds at screen
    // centre — so all four stay ANCHORED however deep the zoom goes, and what
    // this pins is the tanh ceiling alone. Fly-overs are a separate law: past
    // localize .55 the shader fades them out, and the picker follows (see
    // "the fly-over cull is a hit-test law" below), so sampling one here
    // would only re-test that.
    const anchoredGraph = makeGraph([[20, 21], [19, 20], [12, 20], [20, 28]]);
    const cam = createCamera(anchoredGraph.total);
    clampCamera(cam, 1000, 5000);
    for (const zoom of [8, 40, 300, 3000]) {
      cam.ppv = fitPPV(cam, 1000) * zoom;
      cam.x = 20;
      clampCamera(cam, 1000, 5000);
      const view = VIEW({ localize: localizeFactor(zoom) });
      let found = 0;
      for (let i = 0; i < anchoredGraph.count; i++) {
        // Deep in, a foot is the only part of a long arc still on screen, so
        // sample the near-foot parameters as well as the apex.
        for (const t of [0.02, 0.25, 0.5, 0.75, 0.98]) {
          const [px, py] = pointOnArc(anchoredGraph, cam, view, i, t);
          if (px < -50 || px > 1050 || py < -50 || py > 650) continue;
          const hit = pickArc(anchoredGraph, cam, view, px, py, 6);
          expect(hit, `zoom ${zoom} arc ${i} t=${t}`).not.toBeNull();
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
    for (const localize of [0, localizeFactor(40), 1]) {
      const view = VIEW({ density: 'famous', localize });
      for (const t of [0.08, 0.5, 0.92]) {
        const [px, py] = pointOnArc(famous, cam, view, 0, t);
        const hit = pickArc(famous, cam, view, px, py, 6);
        expect(hit, `Famous arc at localize=${localize}, t=${t}`).toMatchObject({ index: 0 });
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

  it('keeps chunk-culling consistent with the renderer', () => {
    const chunked = makeGraph([[2, 8], [5, 35], [12, 18], [0, 39], [21, 29]]);
    chunked.chunkSize = 2;
    chunked.buckets[0].chunks = [[2, 35], [0, 39], [21, 29]];
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

describe('visibility law', () => {
  // The JS twins of the shader's fly-over lines. GLSL's step(e, x) is
  // `x >= e ? 1 : 0`, so both margins are inclusive — an arc whose foot sits
  // EXACTLY on the margin is still drawn, and must therefore still be picked.
  it('anchors an arc when either foot is inside the frame', () => {
    expect(arcAnchored(200, 800, 1000)).toBe(1);
    expect(arcAnchored(-4000, 300, 1000)).toBe(1);
    expect(arcAnchored(700, 9000, 1000)).toBe(1);
  });

  it('treats the margin as inclusive, on both edges', () => {
    expect(FLYOVER_MARGIN).toBe(24);
    expect(arcAnchored(-24, 9000, 1000)).toBe(1);
    expect(arcAnchored(-24.001, 9000, 1000)).toBe(0);
    expect(arcAnchored(-9000, 1024, 1000)).toBe(1);
    expect(arcAnchored(-9000, 1024.001, 1000)).toBe(0);
    expect(arcAnchored(-9000, 9000, 1000, 9000)).toBe(1);
  });

  it('leaves everything painted at overview, however far the feet are', () => {
    expect(flyOverDim(0, 0)).toBe(1);
    expect(flyOverDim(1, 0)).toBe(1);
  });

  it('never dims an anchored arc, at any depth', () => {
    for (const loc of [0, 0.55, 0.8, 1]) expect(flyOverDim(1, loc)).toBe(1);
  });

  it('fades a fly-over through the floor and reaches EXACTLY zero at depth', () => {
    // Only the full zero makes an arc unpickable, so it has to be exact
    // rather than a rounding-close approximation.
    expect(flyOverDim(0, 0.55)).toBeCloseTo(0.505, 10);
    expect(flyOverDim(0, 0.8)).toBeCloseTo(0.23336, 5);
    expect(flyOverDim(0, 1)).toBe(0);
  });

  it('publishes the margin and the floor to the GLSL the shader inlines', () => {
    expect(flyOverGLSL).toContain('float m = ' + FLYOVER_MARGIN + '.;');
    expect(flyOverGLSL).toContain('mix(.10, 0., smoothstep(.55, 1., localize))');
    expect(flyOverGLSL).toContain('mix(1., mix(flyFloor, 1., anchored), localize)');
  });
});

describe('the fly-over cull is a hit-test law, not only a draw law', () => {
  // At full localize the shader fades an arc with NEITHER foot within 24 device
  // px of the viewport to alpha 0 — it is not on the screen at all. The picker
  // used to ignore that, so on the real 63k-arc asset a tap deep in a passage
  // silently focused a fly-over the reader could not see and spotlit nothing.
  // A narrow frame with a low ceiling keeps one fly-over's apex on screen at
  // BOTH localize steps, so the only thing changing between the legs is the cull.
  const FLY = (over) => Object.assign({
    width: 400, height: 600, base: 520, ceil: 200, localize: 0,
    squash: squashFactor(200, 400), density: 'famous', rulerDepth: 40,
  }, over);
  /** [18,22] flies over the frame (feet at -30 and 430); [20,22] is anchored. */
  const g = makeGraph([[18, 22], [20, 22]]);
  const cam = createCamera(g.total);
  cam.ppv = 115;
  clampCamera(cam, 400, 5000);

  it('will not pick a fly-over the shader has faded to nothing', () => {
    const view = FLY({ localize: 1 });
    const [px, py] = pointOnArc(g, cam, view, 0, 0.5);
    expect(px).toBeGreaterThan(0);
    expect(px).toBeLessThan(view.width);
    expect(pickArc(g, cam, view, px, py, 6)).toBeNull();
  });

  it('still picks that same arc at overview, where it is painted', () => {
    const view = FLY({ localize: 0 });
    const [px, py] = pointOnArc(g, cam, view, 0, 0.5);
    expect(pickArc(g, cam, view, px, py, 6)).toMatchObject({ index: 0 });
  });

  it('keeps an anchored arc pickable at full localize', () => {
    // One foot inside the frame is enough — the shader draws it, so we pick it.
    const view = FLY({ localize: 1 });
    const [px, py] = pointOnArc(g, cam, view, 1, 0.5);
    expect(pickArc(g, cam, view, px, py, 6)).toMatchObject({ index: 1 });
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
