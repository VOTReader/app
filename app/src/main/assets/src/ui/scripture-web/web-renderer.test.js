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
import {
  SHADER_SOURCE, TOP_SHADER_SOURCE, DENSITY_STEPS, createRenderer, topLook,
  ARC_TEX_W, GESTURE_DPR, backingScale, backingSize,
} from './web-renderer.js';
import {
  arcShapeGLSL, arcFrameGLSL, flyOverWidth, flyOverGLSL, glslFloat, squashFactor, TOP_SEGMENT_MIN,
} from '../../utils/scripture-web/geometry.js';
import { frameSetAt } from '../../utils/scripture-web/frame-set.js';
import { FLYOVER_LEG_WIDTH, TAP_CONTEXT, rgba01, inkWidth } from '../../utils/scripture-web/sw-ink.js';
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
    // E1 (GL step 2): the piece in the frame comes from the SHARED frame law,
    // heights and x window both, and each sample is pushed by it. Restated:
    // this pinned arcTau(lo/hi), the x-only window retired with
    // geometry.visibleWindow.
    expect(SHADER_SOURCE.vertex).toContain(arcFrameGLSL);
    expect(SHADER_SOURCE.vertex).toMatch(/vec2 win = arcFrameTau\(left, right, uRes\.x, A, uFrameH\.x, uFrameH\.y\);/);
    expect(SHADER_SOURCE.vertex).toMatch(/float dTau = \(win\.y - win\.x\)\/uSegments;/);
    expect(SHADER_SOURCE.vertex).toMatch(/\*arcPush\(dTau\);/);
    expect(SHADER_SOURCE.vertex).not.toMatch(/arcTau\((lo|hi),/);
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

  /* Restated for E1 (GL step 2): the per-thread attributes (in uint aFrom,
     aTo) became one integer id per instance from the frame's visible set,
     the threads' data two float textures read by integer texel fetch. The
     intent kept: a thread's identity is an integer end to end (verse ids and
     votes are exact in float32; a float id would round past 2^24). */
  it('reads each thread by an integer id from the visible set, its data by integer texel fetch', () => {
    const V = SHADER_SOURCE.vertex;
    expect(V).toMatch(/in uint aId;/);
    expect(V).toContain('uniform highp sampler2D uArcs;');
    expect(V).toContain('uniform highp sampler2D uVotes;');
    expect(V).toContain('ivec2 at = ivec2(i & ' + (ARC_TEX_W - 1) + ', i >> ' + Math.log2(ARC_TEX_W) + ');');
    expect(V).toMatch(/texelFetch\(uArcs, at, 0\)/);
    expect(V).toMatch(/texelFetch\(uVotes, at, 0\)\.r/);
    expect(V).not.toMatch(/in (uint|float) a(From|To|FanA|FanB|Votes);/);
  });

  /* Restated for E1: gl_InstanceID restarts at 0 for every draw, which
     uInstanceBase used to add back for the one draw per bucket run. A
     class's draw carries the ids themselves, so there is nothing to add. */
  it('the spotlight test reads the thread\'s own id from the stream, not gl_InstanceID', () => {
    expect(SHADER_SOURCE.vertex).toContain('float id = float(aId);');
    expect(SHADER_SOURCE.vertex).not.toMatch(/gl_InstanceID|uInstanceBase/);
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

  /* E2: the hold and the skirt are half a BACKING px. uPx (vertex) and
     uFeather (fragment) are one backing px in full-resolution px: 1 at rest,
     1 / scale while a gesture draws a smaller backing. */
  it('the half width holds at half a backing px, the lost width paid in alpha, with half a backing px of skirt in both stages', () => {
    expect(SHADER_SOURCE.vertex).toContain('float thin = clamp(halfW/(.5*uPx), 0., 1.);');
    expect(SHADER_SOURCE.vertex).toContain('halfW = max(halfW, .5*uPx);');
    expect(SHADER_SOURCE.vertex).toContain('float hw = halfW + .5*uPx;');
    expect(SHADER_SOURCE.vertex).toMatch(/float aOut = [^;]*\*thin;/);
    expect(SHADER_SOURCE.fragment).toContain('float hw = vHalfW + .5*uFeather;');
    expect(SHADER_SOURCE.fragment).toContain('smoothstep(vHalfW - .5*uFeather, vHalfW + .5*uFeather, d)');
    expect(TOP_SHADER_SOURCE.fragment).toContain('smoothstep(uCoreHalf - .5*uFeather, uCoreHalf + .5*uFeather, d)');
    expect(SHADER_SOURCE.vertex).not.toContain('halfW + 1.0');
    expect(SHADER_SOURCE.fragment).not.toContain('vHalfW + 1.0');
  });

  it('TWIN: a thin line keeps its ink (width x alpha) and never draws under one backing px, at rest or in a gesture', () => {
    // the three shader lines, in JS
    const shade = (halfW, alpha, px) => {
      const thin = Math.min(Math.max(halfW / (0.5 * px), 0), 1);
      const hw = Math.max(halfW, 0.5 * px);
      return { width: 2 * hw, alpha: alpha * thin };
    };
    for (const px of [1, 1.3, 2.6 / GESTURE_DPR]) {
      for (const halfW of [0.05, 0.2, 0.37, 0.5, 0.8, 1.6, 4]) {
        const o = shade(halfW, 0.6, px);
        expect(o.width).toBeGreaterThanOrEqual(px - 1e-12);
        expect(o.width * o.alpha).toBeCloseTo(2 * halfW * 0.6, 12);
      }
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

/**
 * One frame of a recordingGL renderer, replayed from the first call: each
 * draw with the uniforms its program held at that moment. The renderer sends
 * a uniform only when it changes (E3), so a frame's own calls no longer carry
 * them all. main and top are the two passes' draws in order; the main
 * program is the one the renderer first uses.
 */
function frameOf(r, calls, view) {
  const start = calls.length;
  const stats = { ...r.draw(view) };
  const held = new Map();
  let mainProgram = null, current = null;
  const main = [], top = [];
  calls.forEach((c, i) => {
    if (c[0] === 'useProgram') {
      current = c[1][0];
      if (mainProgram === null) mainProgram = current;
      if (!held.has(current)) held.set(current, {});
    } else if (/^uniform/.test(c[0]) && current) {
      held.get(current)[c[1][0]] = c[1].slice(1);
    } else if (c[0] === 'drawArraysInstanced' && i >= start) {
      (current === mainProgram ? main : top).push({ args: c[1], u: { ...held.get(current) } });
    }
  });
  const u = (pass, name) => pass.map((d) => d.u[name]);
  return { stats, main, top, u, calls: calls.slice(start) };
}

const tinyGraph = () => /** @type {any} */ ({
  total: 200, count: 1, from: new Uint16Array([100]), to: new Uint16Array([150]), votes: new Int16Array([30]),
  buckets: [{ off: 0, len: 1, off20: 1, off10: 1, segments: 8, chunks: [] }],
  chunkSize: 256, books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 }],
  chapters: [[0, 1, 0, 200]], chapterOfVerse: new Uint16Array(200), prophecy: [], votEdges: [], votLinks: [],
});
const threeArcs = () => Object.assign(tinyGraph(), {
  count: 3, from: new Uint16Array([100, 20, 120]), to: new Uint16Array([150, 60, 190]), votes: new Int16Array([30, 10, 5]),
  buckets: [{ off: 0, len: 3, off20: 3, off10: 3, segments: 8, chunks: [] }],
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
    expect(r.stats).toEqual({ instances: 0, vertices: 0, draws: 0 });
  });
});

/* GL item 6 (digest item 9): the ruler band is the overlay's. The ruler stands at view.base
   whatever the camera's height (overlay drawRuler, pick.pickChapter), its gold line from
   base + 1 device px down; the threads stand on base + camY, so a camera looking up would sink
   them through the ruler. Every thread pass is scissored to the rows above the gold line. */
describe('the ruler band is never painted by the web (scissor at the ruler\'s top)', () => {
  const view = (over) => Object.assign({
    width: 800, height: 720, base: 260.4, ceil: 240, squash: squashFactor(240, 800), localize: 1, density: 'famous',
    camX: 125, camY: 0, ppv: 4, strokeWidth: 2, alpha: 0.5, dpr: 2, bg: '#000', focusRange: null, focusArc: 0,
  }, over);

  it('the main and the top pass draw inside a scissor that ends where the ruler\'s gold line begins; the clear is whole', () => {
    const { calls, canvas } = recordingGL();
    const r = /** @type {any} */ (createRenderer(canvas, tinyGraph()));
    // camY 180 lifts the camera past the one thread's apex (60 px): the height
    // cull (E1) leaves only the chosen line's top pass, still scissored
    for (const [camY, want] of [[0, 2], [40, 2], [180, 1]]) {
      calls.length = 0;
      r.draw(view({ camY }));
      const names = calls.map((c) => c[0]);
      const clear = names.indexOf('clear');
      const on = calls.findIndex((c) => c[0] === 'enable' && c[1][0] === 'SCISSOR_TEST');
      const off = calls.findIndex((c, i) => i > on && c[0] === 'disable' && c[1][0] === 'SCISSOR_TEST');
      expect(on, 'the scissor is on after the clear').toBeGreaterThan(clear);
      const rows = Math.ceil(260.4 + 2);
      expect(calls.find((c) => c[0] === 'scissor')[1]).toEqual([0, 720 - rows, 800, rows]);
      const drawsAt = calls.map((c, i) => (c[0] === 'drawArraysInstanced' ? i : -1)).filter((i) => i >= 0);
      expect(drawsAt.length, `camY ${camY}: the main pass (if in the frame) and the chosen line`).toBe(want);
      for (const i of drawsAt) expect(i > on && i < off, `draw at ${i} inside the scissor`).toBe(true);
      expect(off, 'and off again at the frame\'s end').toBeGreaterThan(drawsAt[drawsAt.length - 1]);
    }
    // My Web's ground: one clear over the whole canvas, no scissor
    calls.length = 0;
    r.clear('#000000');
    expect(calls.some((c) => c[0] === 'enable' && c[1][0] === 'SCISSOR_TEST')).toBe(false);
  });

  it('a base past the canvas clips nothing away (the scissor is never taller than the frame)', () => {
    const { calls, canvas } = recordingGL();
    const r = /** @type {any} */ (createRenderer(canvas, tinyGraph()));
    calls.length = 0;
    r.draw(view({ base: 900 }));
    expect(calls.find((c) => c[0] === 'scissor')[1]).toEqual([0, 0, 800, 720]);
  });
});

/* GL items 3 and 5 (digest C1, C3, item 10). The chosen, hovered and lit
   lines are redrawn over the web by a top pass in the ink table's gold, a
   core under a soft halo; while a line is chosen the rest recedes to
   TAP_CONTEXT (never to black), eased; a hover dims nothing. */
describe('the top pass: the chosen line in gold over everything, the rest receding only for a tap', () => {
  const args = (over) => Object.assign({
    width: 800, height: 720, base: 260, ceil: 240, squash: squashFactor(240, 800), localize: 1, density: 'famous',
    camX: 125, camY: 0, ppv: 4, strokeWidth: 2, alpha: 0.5, dpr: 1, bg: '#000', focusRange: null, focusArc: -1,
  }, over);
  /** one frame, replayed: the main pass's draws and the top pass's, each with its uniforms */
  const frame = (r, calls, over) => frameOf(r, calls, args(over));
  const build = (g) => {
    const { calls, canvas } = recordingGL();
    return { calls, r: /** @type {any} */ (createRenderer(canvas, g || tinyGraph())) };
  };

  it('the chosen line is drawn last, its core and halo the ink table\'s chosen rows, and stats count the web alone', () => {
    const { calls, r } = build();
    const f = frame(r, calls, { focusArc: 0 });
    expect(f.stats).toEqual({ instances: 1, vertices: f.main[0].args[2] * f.main[0].args[3], draws: 1 });
    expect(f.u(f.top, 'uCore')).toEqual([rgba01('chosen')]);
    expect(f.u(f.top, 'uHalo')).toEqual([rgba01('chosenHalo')]);
    expect(f.u(f.top, 'uCoreHalf')).toEqual([[inkWidth('chosen') / 2]]);
    expect(f.u(f.top, 'uHaloHalf')).toEqual([[inkWidth('chosenHalo') / 2]]);
    const draws = f.calls.filter((c) => c[0] === 'drawArraysInstanced');
    const last = draws[draws.length - 1];
    expect(f.top[f.top.length - 1].args, 'the chosen line is the last draw of the frame').toBe(last[1]);
    const segments = f.u(f.top, 'uSegments')[0][0];
    expect(last[1].slice(2)).toEqual([2 * (segments + 1), 1]);
    expect(segments).toBeGreaterThanOrEqual(TOP_SEGMENT_MIN);
    expect(r.topStats).toEqual({ instances: 1, vertices: 2 * (segments + 1), draws: 1 });
  });

  it('a frame 500 CSS px tall or less is compact: the chosen core takes the ink table\'s compact width', () => {
    const { calls, r } = build();
    const f = frame(r, calls, { focusArc: 0, height: 900, dpr: 2 });
    expect(f.u(f.top, 'uCoreHalf')).toEqual([[(inkWidth('chosen', true) * 2) / 2]]);
    const g = frame(r, calls, { focusArc: 0, height: 1200, dpr: 2 });
    expect(g.u(g.top, 'uCoreHalf')).toEqual([[(inkWidth('chosen') * 2) / 2]]);
  });

  it('a hover is drawn in the hover ink, and the rest of the web does not recede (uTapFade 0)', () => {
    const { calls, r } = build();
    const f = frame(r, calls, { hoverArc: 0 });
    expect(f.u(f.main, 'uTapFade')).toEqual([[0]]);
    expect(f.u(f.top, 'uCore')).toEqual([rgba01('hover')]);
    expect(f.u(f.top, 'uHalo')).toEqual([rgba01('hoverHalo')]);
    expect(f.u(f.top, 'uCoreHalf')).toEqual([[inkWidth('hover') / 2]]);
  });

  it('a tap makes the rest recede by the fade it is handed; with none handed, at once; for a range or a prophecy pair too', () => {
    const { calls, r } = build();
    expect(frame(r, calls, {}).u(frame(r, calls, {}).main, 'uTapFade')).toEqual([[0]]);
    const at = (over) => { const f = frame(r, calls, over); return f.u(f.main, 'uTapFade')[0][0]; };
    expect(at({ focusArc: 0 })).toBe(1);
    expect(at({ focusArc: 0, tapFade: 0.25 })).toBe(0.25);
    expect(at({ focusRange: [100, 120] })).toBe(1);
    expect(at({ focusProphecy: 0 })).toBe(1);
    expect(at({ focusArc: 0, tapFade: 7 })).toBe(1);
  });

  it('draws the lit, the hovered and the chosen in that order, each in its own ink', () => {
    const { calls, r } = build(threeArcs());
    const f = frame(r, calls, { lit: Int32Array.from([1]), litKey: 'one', hoverArc: 2, focusArc: 0 });
    expect(f.u(f.top, 'uCore')).toEqual([rgba01('lit'), rgba01('hover'), rgba01('chosen')]);
    // the lit line has no halo row: its halo is nothing
    expect(f.u(f.top, 'uHaloHalf')[0]).toEqual([0]);
    expect(f.stats.instances).toBe(3);
  });

  it('uploads the set only when what is asked about changes', () => {
    const { calls, r } = build();
    const first = frame(r, calls, { focusArc: 0 });
    // the top pass's four attributes (from, to and the two fans)
    expect(first.calls.filter((c) => c[0] === 'bufferData').length).toBe(4);
    const again = frame(r, calls, { focusArc: 0, camX: 126 });
    expect(again.calls.filter((c) => c[0] === 'bufferData')).toEqual([]);
    expect(again.u(again.top, 'uCore')).toEqual([rgba01('chosen')]);
  });

  it('nothing asked about: no top pass at all', () => {
    const { calls, r } = build();
    const f = frame(r, calls, {});
    expect(f.top).toEqual([]);
    expect(f.calls.filter((c) => c[0] === 'drawArraysInstanced').length).toBe(1);
    expect(r.topStats).toEqual({ instances: 0, vertices: 0, draws: 0 });
  });

  it('topLook: the lit ink has no halo; a core under 1 device px holds 0.5 px of half width and pays in alpha', () => {
    const lit = topLook('lit', 1, false);
    expect(lit.haloHalf).toBe(0);
    expect(lit.halo[3]).toBe(0);
    expect(lit.core).toEqual(rgba01('lit'));
    const thin = topLook('lit', 0.5, false);   // 1.5 CSS px at half a device px each: 0.375 px of half width
    expect(thin.coreHalf).toBe(0.5);
    expect(thin.core[3]).toBeCloseTo(rgba01('lit')[3] * 0.75, 12);
    expect(topLook('chosen', 1, false).ribbon).toBe(inkWidth('chosenHalo') / 2 + 0.5);
  });

  /* GL item 4: the prophecy class. Every g.prophecy pair, always, at every
     density, drawn first in the top pass (under the lit, hovered and chosen). */
  const prophetic = () => Object.assign(threeArcs(), {
    prophecy: [{ a: 100, b: 150, studyId: 's', chapterId: 'c' }, { a: 5, b: 180, studyId: 's', chapterId: 'c' }],
  });

  it('the prophecy class is drawn with nothing asked about, every pair in one draw, in the prophecy ink, before the chosen', () => {
    const { calls, r } = build(prophetic());
    const idle = frame(r, calls, {});
    expect(idle.u(idle.top, 'uCore')).toEqual([rgba01('prophecy')]);
    expect(idle.u(idle.top, 'uHalo')).toEqual([rgba01('prophecyGlow')]);
    expect(idle.u(idle.top, 'uCoreHalf')).toEqual([[inkWidth('prophecy') / 2]]);
    expect(idle.u(idle.top, 'uHaloHalf')).toEqual([[inkWidth('prophecyGlow') / 2]]);
    expect(idle.top.length).toBe(1);
    expect(idle.top[0].args[3]).toBe(2);
    expect(idle.stats.instances).toBe(3);   // stats count the web alone
    expect(idle.stats.draws).toBe(idle.main.length);
    const chosen = frame(r, calls, { focusArc: 0 });
    const [pc, cc] = chosen.u(chosen.top, 'uCore');
    expect(cc).toEqual(rgba01('chosen'));
    expect(pc.slice(0, 3)).toEqual(rgba01('prophecy').slice(0, 3));
    expect(pc[3]).toBeCloseTo(rgba01('prophecy')[3] * TAP_CONTEXT, 12);
  });

  it('every density draws the whole class (essential too)', () => {
    const { calls, r } = build(prophetic());
    for (const density of ['essential', 'famous', 'all']) {
      const f = frame(r, calls, { density });
      expect(f.top[0].args[3], density).toBe(2);
    }
  });

  it('the core never draws under 1 device px; the glow and the core recede with a tap, as far as TAP_CONTEXT and no further', () => {
    const half = topLook('prophecy', 0.5, false);   // 1.25 CSS px at half a device px: 0.625 device px, held at 1
    expect(half.coreHalf).toBe(0.5);
    expect(half.core).toEqual(rgba01('prophecy'));
    const at = topLook('prophecy', 2, false, 0.5);
    expect(at.coreHalf).toBe(inkWidth('prophecy'));
    expect(at.core[3]).toBeCloseTo(rgba01('prophecy')[3] * (1 + (TAP_CONTEXT - 1) * 0.5), 12);
    const full = topLook('prophecy', 1, false, 1);
    expect(full.core[3]).toBeCloseTo(rgba01('prophecy')[3] * TAP_CONTEXT, 12);
    expect(full.halo[3]).toBeCloseTo(rgba01('prophecyGlow')[3] * TAP_CONTEXT, 12);
    expect(topLook('prophecy', 1, false, 9).core[3]).toBeCloseTo(rgba01('prophecy')[3] * TAP_CONTEXT, 12);
    // the chosen, lit and hovered never recede
    expect(topLook('chosen', 1, false, 1).core).toEqual(rgba01('chosen'));
    expect(topLook('hover', 1, false, 1).core).toEqual(rgba01('hover'));
  });

  it('a chosen prophecy pair that is no arc takes the chosen ink on its own feet', () => {
    const { calls, r } = build(prophetic());
    const f = frame(r, calls, { focusProphecy: 1 });
    const [pc, cc] = f.u(f.top, 'uCore');
    expect(cc).toEqual(rgba01('chosen'));
    expect(pc[3]).toBeCloseTo(rgba01('prophecy')[3] * TAP_CONTEXT, 12);
    expect(f.top[f.top.length - 1].args[3]).toBe(1);
    expect(f.u(f.main, 'uTapFade').every((v) => v[0] === 1)).toBe(true);
  });

  it('the shaders: the main pass recedes by TAP_CONTEXT at most and has no hover input or gold of its own; the top pass shares the curve law and the split feet', () => {
    expect(SHADER_SOURCE.vertex).toContain('float dim = mix(1., ' + glslFloat(TAP_CONTEXT) + ', uTapFade*(1. - lit));');
    expect(SHADER_SOURCE.vertex).not.toMatch(/uHoverArc|float hovered|\.784|mix\(\.05/);
    // never to black: the dim's floor over the whole fade
    for (let fade = 0; fade <= 1; fade += 0.125) {
      const dim = 1 + (TAP_CONTEXT - 1) * fade;
      expect(dim).toBeGreaterThanOrEqual(TAP_CONTEXT - 1e-12);
    }
    expect(TOP_SHADER_SOURCE.vertex).toContain(arcShapeGLSL);
    expect(TOP_SHADER_SOURCE.vertex).toMatch(/float x0 = \(\(a - uCamXHi\) \+ \(\.5 \+ aFanA - uCamXLo\)\)\*uPPV/);
    expect(TOP_SHADER_SOURCE.vertex).toMatch(/float x1 = \(\(b - uCamXHi\) \+ \(\.5 \+ aFanB - uCamXLo\)\)\*uPPV/);
    expect(TOP_SHADER_SOURCE.vertex).toMatch(/float A = arcShape\(rx,\s*uSquash\)\.y;/);
    expect(TOP_SHADER_SOURCE.vertex).toMatch(/uBase \+ uCamY - hgt/);
    expect(TOP_SHADER_SOURCE.fragment.split('\n')[1]).toBe('precision mediump float;');
    expect(TOP_SHADER_SOURCE.fragment).toContain('o = vec4(uCore.rgb*core + uHalo.rgb*halo*(1. - core), a);');
  });
});

/* GL step 2 (performance): E1 the frame draws its visible set, one draw per
   segment count, and counts what it sent; E2 a gesture draws a smaller
   backing under the same geometry; E3 an unchanged frame sends nothing. */
describe('E1-E3: the visible set, the gesture backing, and a frame that sends only what changed', () => {
  const view = (over) => Object.assign({
    width: 800, height: 720, base: 260.4, ceil: 240, squash: squashFactor(240, 800), localize: 1, density: 'famous',
    camX: 125, camY: 0, ppv: 4, strokeWidth: 2, alpha: 0.5, dpr: 2, bg: '#000', focusRange: null, focusArc: 0,
  }, over);
  const build = (g) => {
    const { calls, canvas } = recordingGL();
    return { calls, r: /** @type {any} */ (createRenderer(canvas, g || threeArcs())) };
  };

  it('E1: one draw per segment count, each over its class of the id stream; stats are the instances and vertex invocations sent', () => {
    const g = threeArcs();
    const { calls, r } = build(g);
    const v = view({});
    const f = frameOf(r, calls, v);
    // the set the renderer drew is THE visible set (frame-set.js), the one the picker and labels read
    const set = frameSetAt(g, v.density, v.width, v.base, v.squash, v.camX, v.camY, v.ppv, v.dpr);
    expect(set.count).toBe(3);
    expect(f.main.length).toBe(set.classes);
    const ptrs = f.calls.filter((c) => c[0] === 'vertexAttribIPointer');
    let vertices = 0, instances = 0;
    f.main.forEach((d, k) => {
      const n = d.u.uSegments[0];
      expect(n).toBe(set.classN[k]);
      expect(d.args).toEqual(['TRIANGLE_STRIP', 0, 2 * (n + 1), set.classCount[k]]);
      // Uint16 ids: the class's first id, two bytes each
      expect(ptrs[k][1]).toEqual(['aId', 1, 'UNSIGNED_SHORT', 0, set.classFirst[k] * 2]);
      vertices += d.args[2] * d.args[3];
      instances += d.args[3];
    });
    expect(f.stats).toEqual({ instances, vertices, draws: f.main.length });
    expect(r.stats).toEqual(f.stats);
    // three threads of three sizes: three classes, the widest the most segments
    expect(new Set(f.main.map((d) => d.u.uSegments[0])).size).toBe(3);
  });

  it('E1: a thread whose body is out of the frame is not drawn (the height cull), and is again when the camera comes back', () => {
    const { calls, r } = build(tinyGraph());
    expect(frameOf(r, calls, view({ camY: 180 })).stats).toEqual({ instances: 0, vertices: 0, draws: 0 });
    const back = frameOf(r, calls, view({ camY: 0 }));
    expect(back.stats.instances).toBe(1);
    expect(back.main.length).toBe(1);
  });

  it('E2: the backing is GESTURE_DPR at most in a gesture on a denser screen, and whole at rest', () => {
    expect(GESTURE_DPR).toBe(2);
    expect(backingScale(2.6, true)).toBeCloseTo(2 / 2.6, 12);
    expect(backingScale(2.6, false)).toBe(1);
    expect(backingScale(2, true)).toBe(1);
    expect(backingScale(1, true)).toBe(1);
    expect(backingSize(2317, backingScale(2.6, true))).toBe(Math.round(2317 * (2 / 2.6)));
    expect(backingSize(2317, 1)).toBe(2317);
    expect(backingSize(0.2, 1)).toBe(1);
  });

  it('E2: in a gesture the viewport and scissor are the backing\'s; the geometry stays full resolution, and one backing px feathers', () => {
    const { calls, r } = build();
    const f = frameOf(r, calls, view({ scale: 0.5 }));
    expect(f.calls.find((c) => c[0] === 'viewport')[1]).toEqual([0, 0, 400, 360]);
    const rows = Math.ceil((260.4 + 2) * 0.5);
    expect(f.calls.find((c) => c[0] === 'scissor')[1]).toEqual([0, 360 - rows, 400, rows]);
    for (const d of f.main) {
      expect(d.u.uRes).toEqual([800, 720]);
      expect(d.u.uPx).toEqual([2]);
      expect(d.u.uFeather).toEqual([2]);
    }
    expect(f.u(f.top, 'uFeather')).toEqual([[2]]);
    // the chosen line's hold and skirt follow the backing px too
    expect(f.u(f.top, 'uRibbonHalf')).toEqual([[topLook('chosen', 2, false, 0, 2).ribbon]]);
    // the settle frame: the whole backing again, at the same geometry
    const g = frameOf(r, calls, view({}));
    expect(g.calls.find((c) => c[0] === 'viewport')[1]).toEqual([0, 0, 800, 720]);
    expect(g.u(g.main, 'uPx').every((p) => p[0] === 1)).toBe(true);
    expect(g.stats).toEqual(f.stats);
  });

  it('E3: an unchanged frame sends no uniform but the segment count of each class, and uploads nothing; the threads go up once, at creation', () => {
    const { calls, r } = build();
    expect(calls.filter((c) => c[0] === 'texImage2D').length).toBe(2);
    const first = frameOf(r, calls, view({}));
    expect(first.calls.filter((c) => c[0] === 'bufferSubData').length).toBe(1);
    const again = frameOf(r, calls, view({}));
    // a draw's segment count is that draw's own: with three classes it changes three times a frame
    expect(again.calls.filter((c) => /^uniform/.test(c[0]))).toEqual(
      again.main.map((d) => ['uniform1f', ['uSegments', d.u.uSegments[0]]]));
    expect(again.main.length).toBe(3);
    expect(again.calls.filter((c) => /^(bufferData|bufferSubData|texImage2D|texSubImage2D)$/.test(c[0]))).toEqual([]);
    expect(again.main.map((d) => d.args)).toEqual(first.main.map((d) => d.args));
    expect(again.top.map((d) => d.args)).toEqual(first.top.map((d) => d.args));
    // a pan sends what moved, and the stream once; the stroke and the ink stay put
    const moved = frameOf(r, calls, view({ camX: 125.5 }));
    const sent = moved.calls.filter((c) => /^uniform/.test(c[0])).map((c) => c[1][0]);
    expect(sent).toContain('uCamXLo');
    expect(sent).not.toContain('uWidth');
    expect(sent).not.toContain('uCore');
    expect(moved.calls.filter((c) => c[0] === 'bufferSubData').length).toBe(1);
    expect(moved.calls.filter((c) => c[0] === 'texImage2D')).toEqual([]);
  });

  it('topLook in a gesture: the hold and the skirt are a backing px, the lost width paid in alpha', () => {
    const lit = topLook('lit', 1, false, 0, 2);   // 0.75 device px of half width under a 1 px hold
    expect(lit.coreHalf).toBe(1);
    expect(lit.core[3]).toBeCloseTo(rgba01('lit')[3] * 0.75, 12);
    expect(lit.ribbon).toBe(1 + 1);
    const rest = topLook('lit', 1, false, 0, 1);
    expect(rest.coreHalf).toBe(inkWidth('lit') / 2);
    expect(topLook('lit', 1, false, 0)).toEqual(rest);
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
