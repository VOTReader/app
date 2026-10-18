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
import { SHADER_SOURCE, COLOR_MODES, DENSITY_STEPS, createRenderer } from './web-renderer.js';
import {
  arcShapeGLSL, flyOverDim, FLYOVER_FLOOR, flyOverGLSL, glslFloat,
} from '../../utils/scripture-web/geometry.js';
import {
  DISTANCE_RAMP, GENRE_COLORS, rampGLSL, readChromeTokens, cssColorToRGB,
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
    // the feet: geometry.footX in GLSL
    expect(SHADER_SOURCE.vertex).toMatch(/float x0 = \(a \+ \.5 \+ aFanA - uCamX\)\*uPPV/);
    expect(SHADER_SOURCE.vertex).toMatch(/float x1 = \(b \+ \.5 \+ aFanB - uCamX\)\*uPPV/);
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

  it('inlines the generated colour ramps rather than hardcoding hexes', () => {
    expect(SHADER_SOURCE.vertex).toContain(rampGLSL());
    expect(SHADER_SOURCE.vertex).toMatch(/RAMP\[8\]/);
    expect(SHADER_SOURCE.vertex).toMatch(/GENRE\[10\]/);
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

describe('deep-zoom declutter', () => {
  it('inlines the SHARED fly-over law rather than restating it', () => {
    // Hand-written here, the fade could reach zero a hair before or after the
    // picker's copy did, and taps would land on arcs painted at alpha 0 — the
    // very thing the shared law exists to prevent. Nothing on screen would
    // look wrong.
    expect(SHADER_SOURCE.vertex).toContain(flyOverGLSL);
  });

  it('calls that law for the fly-over fade, in the viewport frame', () => {
    // uRes.x is device px, the same frame pick.js measures its feet in.
    expect(SHADER_SOURCE.vertex).toMatch(
      /dim \*= flyOverDim\(arcAnchored\(x0,\s*x1,\s*uRes\.x\),\s*uFlyLocalize\);/);
  });

  it('the fly-over law never fades a thread to nothing, at any depth', () => {
    // By owner rule (2026-09-10, "what you're trying to zoom into and tap
    // disappears as you get closer") a fly-over settles at FLYOVER_FLOOR and
    // stops, so the shader has nothing to cull and the picker nothing to refuse.
    for (const loc of [0, 0.55, 0.8, 0.99, 1]) expect(flyOverDim(0, loc)).toBeGreaterThan(0);
    expect(flyOverDim(0, 1)).toBe(FLYOVER_FLOOR);
  });

  it('settles fly-over arcs at a VISIBLE floor at full depth — dimmer than an anchored arc, never nothing', () => {
    /* This case used to demand the floor reach zero, because the tanh ceiling
       flattens every large apex to one height and at depth hundreds of
       fly-overs stacked into horizontal smears (the on-device report). The
       owner then met the other face of that law: the line he was zooming
       toward vanished as he arrived. Both reports are real. The trade is
       stated here as a property: the smear is DIMMED (below an anchored arc)
       and the chased line is NEVER GONE (above zero). The number itself is
       design-perf's to tune. */
    expect(flyOverDim(0, 1)).toBeGreaterThan(0);
    expect(flyOverDim(0, 1)).toBeLessThan(flyOverDim(1, 1));
    // The FORMATTED literal, never the raw value: at FLYOVER_FLOOR = 1 the raw
    // form is `float flyFloor = 1;`, which the compiler rejects (glsl-float.test.js).
    expect(flyOverGLSL).toContain('float flyFloor = ' + glslFloat(FLYOVER_FLOOR) + ';');
    expect(flyOverGLSL).not.toContain('smoothstep(.55, 1., localize)');
  });
});

describe('modes', () => {
  it('maps its three colour laws to uColorMode 0/1/2 — the screen offers only distance (sw-chrome-trim.test.jsx)', () => {
    expect(COLOR_MODES).toEqual(['distance', 'testament', 'genre']);
  });
  it('exposes the three densities from sparsest to fullest', () => {
    expect(DENSITY_STEPS).toEqual(['essential', 'famous']);
  });
  it('keeps a colour for every genre bucket', () => {
    expect(GENRE_COLORS).toHaveLength(10);
    expect(DISTANCE_RAMP.length).toBeGreaterThan(1);
    for (const c of GENRE_COLORS.concat(DISTANCE_RAMP)) {
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

describe('graceful degradation', () => {
  it('returns null when WebGL2 is unavailable instead of throwing', () => {
    // jsdom canvases have no WebGL2 — this is the real code path on an old
    // device, and the screen shows its fallback panel rather than a blank void.
    const canvas = /** @type {any} */ (
      { getContext: () => null, addEventListener() {}, removeEventListener() {} });
    expect(createRenderer(canvas, /** @type {any} */ ({ count: 0 }))).toBeNull();
  });
});
