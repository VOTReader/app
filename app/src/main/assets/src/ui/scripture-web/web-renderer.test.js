/**
 * web-renderer tests.
 *
 * jsdom has no WebGL2, so these do not draw. What they DO guard is the one
 * invariant that cannot be caught by looking at the picture: the shader must
 * draw the same curve the CPU hit-tests. If someone hand-writes the height
 * law into the shader instead of inlining the shared one, arcs stop being
 * tappable where they look tappable — and nothing on screen looks wrong.
 */
import { describe, it, expect } from 'vitest';
import { SHADER_SOURCE, DENSITY_STEPS, createRenderer } from './web-renderer.js';
import {
  arcShapeGLSL, flyOverWidth, flyOverGLSL, glslFloat, squashFactor,
} from '../../utils/scripture-web/geometry.js';
import { FLYOVER_LEG_WIDTH } from '../../utils/scripture-web/sw-ink.js';
import {
  DISTANCE_RAMP, rampGLSL, readChromeTokens, cssColorToRGB,
} from '../../utils/scripture-web/palette.js';

describe('shader / CPU agreement', () => {
  it('inlines the SHARED curve law rather than restating it', () => {
    expect(SHADER_SOURCE.vertex).toContain(arcShapeGLSL);
  });

  it("calls that law for the arc radii from the frame's squash alone, stands each foot in its verse's cell by rank, and draws the curve it returns", () => {
    // the structure law: the half-ellipse of the span, nothing from the
    // frame's height, the zoom or the span's log
    expect(SHADER_SOURCE.vertex).toMatch(/float A = arcShape\(rx,\s*uSquash\)\.y;/);
    expect(SHADER_SOURCE.vertex).not.toMatch(/uCeil/);
    // the feet: geometry.footX in GLSL, (verse + .5 + fan - camX)*ppv, with
    // the camera's x split into whole and fraction for float32 (digest 39)
    expect(SHADER_SOURCE.vertex).toMatch(/float x0 = \(\(a - uCamXHi\) \+ \(\.5 \+ aFanA - uCamXLo\)\)\*uPPV/);
    expect(SHADER_SOURCE.vertex).toMatch(/float x1 = \(\(b - uCamXHi\) \+ \(\.5 \+ aFanB - uCamXLo\)\)\*uPPV/);
    // The point and its tangent come from the shared arcAt, not from a
    // hand-written cos/sin pair beside it
    expect(SHADER_SOURCE.vertex).toMatch(/arcAt\(tau,\s*left,\s*right,\s*A,/);
    // and the camera's y shifts the baseline the ribbon stands on
    expect(SHADER_SOURCE.vertex).toMatch(/uBase \+ uCamY - hgt/);
    expect(SHADER_SOURCE.vertex).toMatch(/arcTau\(lo,/);
    expect(SHADER_SOURCE.vertex).toMatch(/arcTau\(hi,/);
  });

  it('gives the fragment stage the PER-INSTANCE half width, not the uniform', () => {
    // Votes drive stroke width at depth, so an antialias edge computed from
    // uWidth would feather every ribbon at the widest arc's edge.
    expect(SHADER_SOURCE.fragment).toContain('in float vHalfW;');
    expect(SHADER_SOURCE.fragment).not.toContain('uWidth');
  });

  it('has exactly ONE definition of the law in the vertex stage, and no ceiling, run, dome or lift beside it', () => {
    // Two occurrences would mean a second, hand-written copy of the law.
    expect(SHADER_SOURCE.vertex.split('vec2 arcShape(').length - 1).toBe(1);
    expect(SHADER_SOURCE.vertex).not.toMatch(/tanh\(|strataLift\(|float bow|float lift/);
  });

  it('inlines the generated colour ramp rather than hardcoding hexes', () => {
    expect(SHADER_SOURCE.vertex).toContain(rampGLSL());
    expect(SHADER_SOURCE.vertex).toMatch(/RAMP\[8\]/);
  });
});

describe('shader shape', () => {
  it('declares GLSL ES 3.00 in both stages (WebGL2 requires the directive first)', () => {
    expect(SHADER_SOURCE.vertex.startsWith('#version 300 es')).toBe(true);
    expect(SHADER_SOURCE.fragment.startsWith('#version 300 es')).toBe(true);
  });

  it('reads instance data as integers, not floats', () => {
    // Verse ids arrive as Uint16; float attributes would quietly lose the
    // top of the range once the canon exceeds 2^24 — and read wrong now.
    expect(SHADER_SOURCE.vertex).toMatch(/in uint aFrom;/);
    expect(SHADER_SOURCE.vertex).toMatch(/in uint aTo;/);
  });

  it('offsets the spotlight test by uInstanceBase', () => {
    // gl_InstanceID restarts at 0 for every sub-range draw, so the shader can
    // only identify a specific arc by adding the range's base back on.
    expect(SHADER_SOURCE.vertex).toContain('float id = float(gl_InstanceID) + uInstanceBase;');
  });

  it('emits premultiplied alpha, matching both blend modes the renderer sets', () => {
    expect(SHADER_SOURCE.fragment).toContain('vec4(vCol.rgb*a, a)');
  });
});

/* Thin-line hygiene (GL item 7). A ribbon under one device px aliases into
   dashes where it crosses the pixel grid; a 1 px feather skirt on a 0.4 px
   line is mostly skirt; and the vertex stage's float32 turns a verse id near
   31,102 into ~0.002 verses of error, which the ceiling's ~132 device px per
   verse makes into a visible shimmer on every foot as the camera pans. */
describe('thin lines hold a device px, and the feet do not shimmer at the ceiling', () => {
  const f = Math.fround;
  /** The shader's foot, emulated in float32 op by op. The old form subtracted
   *  the whole camera from a five-digit verse id; the new one subtracts the
   *  whole verses (exact in float32) and adds the fractions. */
  const footOld = (a, fan, camX, ppv, W) => f(f(f(f(f(f(a) + 0.5) + f(fan)) - f(camX)) * f(ppv)) + f(W * 0.5));
  const footNew = (a, fan, camX, ppv, W) => {
    const hi = f(Math.floor(camX)), lo = f(camX - Math.floor(camX));
    const whole = f(f(a) - hi);
    const frac = f(f(0.5 + f(fan)) - lo);
    return f(f(f(whole + frac) * f(ppv)) + f(W * 0.5));
  };
  const truth = (a, fan, camX, ppv, W) => (a + 0.5 + f(fan) - camX) * ppv + W * 0.5;

  it('ORACLE: at the ceiling (132 device px per verse, the far end of the canon) the old foot is off by more than 0.1 px; the split foot by under 0.01', () => {
    const ppv = 132, W = 2400;
    let worstOld = 0, worstNew = 0;
    for (let k = 0; k < 400; k++) {
      const camX = 31090.0 + k * 0.01373;
      for (const a of [31088, 31090, 31095, 31100]) {
        for (const fan of [0, 0.1234, -0.37]) {
          const t = truth(a, fan, camX, ppv, W);
          worstOld = Math.max(worstOld, Math.abs(footOld(a, fan, camX, ppv, W) - t));
          worstNew = Math.max(worstNew, Math.abs(footNew(a, fan, camX, ppv, W) - t));
        }
      }
    }
    expect(worstOld, 'CONTROL: the float32 emulation sees the old shimmer').toBeGreaterThan(0.1);
    expect(worstNew).toBeLessThan(0.01);
  });

  it('the renderer hands the shader the camera split: hi the whole verses, lo the fraction, and no unsplit uCamX', () => {
    const { calls, canvas } = recordingGL();
    const r = /** @type {any} */ (createRenderer(canvas, tinyGraph()));
    calls.length = 0;
    const width = 800, ceil = 240;
    r.draw({ width, height: 360, base: 260, ceil, squash: squashFactor(ceil, width), localize: 1, density: 'famous',
      camX: 150.375, camY: 0, ppv: 44, strokeWidth: 2, alpha: 0.5, dpr: 1, bg: '#000', focusRange: null, focusArc: -1 });
    const set = (name) => calls.filter((c) => c[0] === 'uniform1f' && c[1][0] === name).map((c) => c[1][1]);
    expect(set('uCamXHi')).toEqual([150]);
    expect(set('uCamXLo')).toEqual([0.375]);
    expect(set('uCamX')).toEqual([]);
  });

  it('colour and half width are flat (one per instance); the edge coordinate interpolates across the ribbon', () => {
    expect(SHADER_SOURCE.vertex).toContain('flat out vec4 vCol;');
    expect(SHADER_SOURCE.vertex).toContain('flat out float vHalfW;');
    expect(SHADER_SOURCE.fragment).toContain('flat in vec4 vCol;');
    expect(SHADER_SOURCE.fragment).toContain('flat in float vHalfW;');
    expect(SHADER_SOURCE.vertex).not.toMatch(/flat out float vEdge/);
    expect(SHADER_SOURCE.fragment).not.toMatch(/flat in float vEdge/);
  });

  it('the fragment stage runs at mediump (it only feathers an edge); the vertex stage keeps highp for positions', () => {
    expect(SHADER_SOURCE.fragment.split('\n')[1]).toBe('precision mediump float;');
    expect(SHADER_SOURCE.vertex.split('\n')[1]).toBe('precision highp float;');
  });

  it('the half width holds at 0.5 device px, the lost width paid in alpha, with a 0.5 px skirt in both stages', () => {
    expect(SHADER_SOURCE.vertex).toContain('float thin = clamp(halfW/.5, 0., 1.);');
    expect(SHADER_SOURCE.vertex).toContain('halfW = max(halfW, .5);');
    expect(SHADER_SOURCE.vertex).toContain('float hw = halfW + .5;');
    expect(SHADER_SOURCE.vertex).toMatch(/float aOut = [^;]*\*thin;/);
    expect(SHADER_SOURCE.fragment).toContain('float hw = vHalfW + .5;');
    expect(SHADER_SOURCE.vertex).not.toContain('halfW + 1.0');
    expect(SHADER_SOURCE.fragment).not.toContain('vHalfW + 1.0');
  });

  it('TWIN: a thin line keeps its ink (width x alpha) and never draws under one device px', () => {
    // the three shader lines, in JS
    const shade = (halfW, alpha) => {
      const thin = Math.min(Math.max(halfW / 0.5, 0), 1);
      const hw = Math.max(halfW, 0.5);
      return { width: 2 * hw, alpha: alpha * thin };
    };
    for (const halfW of [0.05, 0.2, 0.37, 0.5, 0.8, 1.6, 4]) {
      const o = shade(halfW, 0.6);
      expect(o.width).toBeGreaterThanOrEqual(1);
      expect(o.width * o.alpha).toBeCloseTo(2 * halfW * 0.6, 12);
    }
  });
});

/* Q3 (ii), digest section 5: the fly-over law was an ALPHA floor (0.35); it is
   a WIDTH law now. A line zoomed into the middle of (both feet carried off
   screen) is the line the reader is chasing, so it keeps its ink and only its
   legs thin. The cases that pinned the floor are rewritten to that intent. */
describe('deep-zoom declutter: fly-overs thin, never fade', () => {
  it('inlines the SHARED fly-over law rather than restating it', () => {
    expect(SHADER_SOURCE.vertex).toContain(flyOverGLSL);
  });

  it('calls that law on the WIDTH, in the viewport frame, with the ink table\'s leg share', () => {
    // uRes.x is device px, the same frame pick.js measures its feet in.
    expect(SHADER_SOURCE.vertex).toContain(
      'halfW *= flyOverWidth(arcAnchored(x0, x1, uRes.x), uFlyLocalize, ' + glslFloat(FLYOVER_LEG_WIDTH) + ');');
    // and nothing in the vertex stage dims a fly-over any more
    expect(SHADER_SOURCE.vertex).not.toMatch(/flyOverDim|flyFloor|dim \*= fly/);
  });

  it('a fly-over keeps FLYOVER_LEG_WIDTH of its width at full depth; an anchored arc keeps all of it', () => {
    expect(FLYOVER_LEG_WIDTH).toBe(0.7);
    expect(flyOverWidth(0, 1, FLYOVER_LEG_WIDTH)).toBeCloseTo(0.7, 12);
    expect(flyOverWidth(1, 1, FLYOVER_LEG_WIDTH)).toBe(1);
    expect(flyOverWidth(0, 0, FLYOVER_LEG_WIDTH)).toBe(1);
    // eased with the localize, never a step (C20)
    let prev = 1;
    for (let loc = 0; loc <= 1.0001; loc += 0.05) {
      const w = flyOverWidth(0, loc, FLYOVER_LEG_WIDTH);
      expect(w).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - w).toBeLessThan(0.02);
      prev = w;
    }
  });
});

describe('modes', () => {
  it('exposes the three densities from sparsest to fullest', () => {
    expect(DENSITY_STEPS).toEqual(['essential', 'famous']);
  });
  it('keeps a valid colour at every stop of the distance ramp', () => {
    expect(DISTANCE_RAMP.length).toBeGreaterThan(1);
    for (const c of DISTANCE_RAMP) {
      expect(c).toHaveLength(3);
      for (const ch of c) expect(ch).toBeGreaterThanOrEqual(0), expect(ch).toBeLessThanOrEqual(1);
    }
  });
});

describe('chrome tokens are one palette, but the text size is still the reader\'s', () => {
  it('ignores a live --bg, and still resolves --fsc-10 against <body>', () => {
    /* This case used to assert the opposite -- that `--bg` was read live off
       <body> so the canvas followed the app's theme. That mechanism is gone by
       owner call, and the case is INVERTED rather than deleted, because the
       second half below is the thing now worth guarding: the font sizes are
       still read live, since they follow the reader's text-size setting and
       were never a theme. Drop this case and a later "simplify" pass could make
       them constants too without a single test going red. */
    document.body.style.setProperty('--bg', '#f7f2e8');
    document.body.style.setProperty('--fsc-10', '13px');
    const chrome = readChromeTokens();
    expect(chrome.bg).toBe('#000000');
    expect(chrome.fsRuler).toBe(13);
    document.body.style.removeProperty('--bg');
    document.body.style.removeProperty('--fsc-10');
  });

  it('IGNORES the body class the app sets — this screen has one palette', () => {
    /* The inverse of what this case used to assert, and deliberately kept
       rather than deleted: the old case pinned a feature the owner asked to be
       removed, so the honest replacement is the property that is now true.
       Deleting it would have left nothing watching the same line. */
    document.body.classList.remove('light');
    const dark = readChromeTokens();
    document.body.classList.add('light');
    const underLight = readChromeTokens();
    document.body.classList.remove('light');
    expect(underLight.isLight).toBe(false);
    expect(underLight).toEqual(dark);
  });

  it('parses both hex and rgb() into clearColor components', () => {
    expect(cssColorToRGB('#000000')).toEqual([0, 0, 0]);
    expect(cssColorToRGB('#fff')).toEqual([1, 1, 1]);
    const [r, g, b] = cssColorToRGB('rgb(247, 242, 232)');
    expect(r).toBeCloseTo(247 / 255, 5);
    expect(g).toBeCloseTo(242 / 255, 5);
    expect(b).toBeCloseTo(232 / 255, 5);
  });
});

/** A WebGL2 stand-in that answers every call and records each one by name. */
function recordingGL() {
  const calls = [];
  const gl = new Proxy({}, { get(_, key) {
    if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
    if (key === 'getUniformLocation' || key === 'getAttribLocation') return (_p, name) => name;
    if (key === 'getExtension') return () => null;
    if (typeof key === 'string' && key.startsWith('create')) return () => ({});
    if (typeof key === 'string' && /^[A-Z_0-9]+$/.test(key)) return key;
    return (...args) => { calls.push([key, args]); };
  } });
  const canvas = /** @type {any} */ ({ width: 800, height: 360, getContext: () => gl, addEventListener() {}, removeEventListener() {} });
  return { gl, calls, canvas };
}

const tinyGraph = () => /** @type {any} */ ({
  total: 200, count: 1, from: new Uint16Array([100]), to: new Uint16Array([150]), votes: new Int16Array([30]),
  buckets: [{ off: 0, len: 1, off20: 1, off10: 1, segments: 8, chunks: [] }],
  chunkSize: 256, books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 }],
  chapters: [[0, 1, 0, 200]], chapterOfVerse: new Uint16Array(200), prophecy: [], votEdges: [], votLinks: [],
});

describe("My Web's ground is one clear (refactor.md #10)", () => {
  it('clear() paints the ground colour over the whole canvas and draws no instances', () => {
    const { calls, canvas } = recordingGL();
    const r = /** @type {any} */ (createRenderer(canvas, tinyGraph()));
    calls.length = 0;
    r.clear('#000000');
    const names = calls.map((c) => c[0]);
    expect(names).toContain('clear');
    expect(calls.find((c) => c[0] === 'clearColor')[1]).toEqual([0, 0, 0, 1]);
    expect(calls.find((c) => c[0] === 'viewport')[1]).toEqual([0, 0, 800, 360]);
    expect(names).not.toContain('drawArraysInstanced');
    expect(r.stats).toEqual({ instances: 0, draws: 0 });
  });
});

describe('graceful degradation', () => {
  it('returns null when WebGL2 is unavailable instead of throwing', () => {
    // jsdom canvases have no WebGL2 — this is the real code path on an old
    // device, and the screen shows its fallback panel rather than a blank void.
    const canvas = /** @type {any} */ (
      { getContext: () => null, addEventListener() {}, removeEventListener() {} });
    expect(createRenderer(canvas, /** @type {any} */ ({ count: 0 }))).toBeNull();
  });
});
