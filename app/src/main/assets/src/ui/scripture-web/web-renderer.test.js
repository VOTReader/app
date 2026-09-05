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
  arcShapeGLSL, CEIL_SOFTNESS, flyOverDim, flyOverGLSL,
} from '../../utils/scripture-web/geometry.js';
import {
  DISTANCE_RAMP, GENRE_COLORS, rampGLSL, readChromeTokens, cssColorToRGB,
} from '../../utils/scripture-web/palette.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PICK_SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'utils', 'scripture-web', 'pick.js'),
  'utf-8',
);

describe('shader / CPU agreement', () => {
  it('inlines the SHARED curve law rather than restating it', () => {
    expect(SHADER_SOURCE.vertex).toContain(arcShapeGLSL);
  });

  it('calls that law for the arc radii, and draws the curve it returns', () => {
    expect(SHADER_SOURCE.vertex)
      .toMatch(/arcShape\(rx,\s*uCeil,\s*uSquash,\s*uLocalize,\s*spanLog\)/);
    // The point and its tangent come from the shared arcAt, not from a
    // hand-written cos/sin pair beside it.
    expect(SHADER_SOURCE.vertex).toMatch(/arcAt\(tau,\s*left,\s*right,\s*R,\s*A,\s*P,/);
    expect(SHADER_SOURCE.vertex).toMatch(/arcTau\(lo,/);
    expect(SHADER_SOURCE.vertex).toMatch(/arcTau\(hi,/);
  });

  it('gives the fragment stage the PER-INSTANCE half width, not the uniform', () => {
    // Votes drive stroke width at depth, so an antialias edge computed from
    // uWidth would feather every ribbon at the widest arc's edge.
    expect(SHADER_SOURCE.fragment).toContain('in float vHalfW;');
    expect(SHADER_SOURCE.fragment).not.toContain('uWidth');
  });

  it('has exactly ONE definition of the softness constant in the vertex stage', () => {
    // Two occurrences would mean a second, hand-written copy of the law.
    const hits = SHADER_SOURCE.vertex.split(String(CEIL_SOFTNESS)).length - 1;
    expect(hits).toBe(1);
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
      /dim \*= flyOverDim\(arcAnchored\(x0,\s*x1,\s*uRes\.x\),\s*uLocalize\);/);
  });

  /* A RIBBON FADED TO ZERO IS STILL RASTERISED, AND THAT IS THE COST.
     ─────────────────────────────────────────────────────────────────
     `dim` reaching 0 makes the arc invisible; it does not make it free. The
     fragment shader still runs for every pixel of every collapsed ribbon and
     blends a zero-alpha colour over the frame.

     MEASURED by Design & Performance with EXT_disjoint_timer_query_webgl2
     around the real draw, medians of 10 frames after 2 warm-ups
     (scripture-web-3-fill-measure.md). At phone 375@3, zoom 400x the chunk
     cull already drops 63,418 instances to 18,944 — and of those only a few
     dozen are visible:

       hw (Radeon 890M)     3.05 ms -> 1.09 ms   (-64 %)
       sw (SwiftShader)   319.7  ms -> 134.5 ms  (-58 %)

     So roughly two of the three milliseconds in a deep-zoom frame were spent
     blending ribbons the law defines as invisible. On a phone GPU with a
     fraction of that fill rate, those two milliseconds are the part of the
     gesture frame that does not fit in 16 ms.

     Collapsing the vertex outside the clip volume costs one branch and skips
     the rasteriser entirely. */
  it('collapses a fly-over that faded to nothing instead of blending it', () => {
    // Anchored to the multiply, not free-floating: a guard placed BEFORE the
    // fly-over fade would test the focus dim (floor .05, never 0) and cull
    // nothing at all, while looking exactly like this one.
    expect(SHADER_SOURCE.vertex).toMatch(
      /dim \*= flyOverDim\(arcAnchored\(x0,\s*x1,\s*uRes\.x\),\s*uLocalize\);\s*(?:\/\/[^\n]*\n\s*)*if \(dim <= 0\.\)/);
  });

  it('sends the collapsed vertex outside the clip volume and still writes its varyings', () => {
    const guard = SHADER_SOURCE.vertex.match(/if \(dim <= 0\.\)\s*\{[^}]*\}/);
    expect(guard).toBeTruthy();
    const body = guard[0];
    // Outside NDC on x and y, so the primitive is clipped whole rather than
    // drawn degenerate somewhere on screen.
    expect(body).toMatch(/gl_Position\s*=\s*vec4\(2\.,\s*2\.,\s*0\.,\s*1\.\)/);
    // Varyings still written: an unwritten `out` is undefined behaviour, and
    // an early return is exactly where that gets forgotten.
    expect(body).toContain('vCol');
    expect(body).toContain('vEdge');
    expect(body).toContain('return');
  });

  /* ONE PREDICATE, TWO LANGUAGES. pick.js already refuses a tap on anything
     the law fades to zero (pick.js:87). This makes the shader stop DRAWING
     exactly that set — no wider, no narrower.

     Wider would be worse than the waste it replaces: culling at, say,
     `dim <= 0.02` would blank arcs inside the partial-fade band that the
     picker still hands taps to, and the reader would be tapping a line that
     is not there. That band (localize 0.55..1, floor .10 -> 0) exists so the
     fade is gradual; the hard cull may only take the arcs that have arrived
     at exactly zero. */
  it('culls exactly the arcs pick.js already refuses — the same zero', () => {
    expect(PICK_SRC).toContain(
      'if (flyOverDim(arcAnchored(x0, x1, width), localize) === 0) continue;');
    // The threshold is a literal zero, not an epsilon standing in for one.
    const thresholds = [...SHADER_SOURCE.vertex.matchAll(/if \(dim <= ([^)]*)\)/g)].map((m) => m[1].trim());
    expect(thresholds).toEqual(['0.']);
  });

  it('fades fly-over arcs to NOTHING at full depth, not to a residual band', () => {
    // The tanh ceiling flattens every large arc apex to the same height, so
    // at depth hundreds of fly-overs stacked into horizontal smears across
    // the screen (the on-device report). The floor must reach zero.
    expect(flyOverDim(0, 1)).toBe(0);
    expect(flyOverGLSL).toContain('mix(.10, 0., smoothstep(.55, 1., localize))');
  });
});

describe('modes', () => {
  it('exposes the three colour modes in cycle order', () => {
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

describe('chrome tokens follow the theme', () => {
  it('resolves against <body>, where the light palette is declared', () => {
    // The dark palette sits on :root; light is a full token swap on
    // `body.light`. Resolving at <html> returns the DARK values in light mode,
    // and because the GL surface paints that colour over the CSS background,
    // the entire view would stay black on parchment.
    document.documentElement.style.setProperty('--bg', '#000000');
    document.body.style.setProperty('--bg', '#f7f2e8');
    expect(readChromeTokens().bg.trim()).toBe('#f7f2e8');
    document.documentElement.style.removeProperty('--bg');
    document.body.style.removeProperty('--bg');
  });

  it('reports the light flag from the body class the app actually sets', () => {
    document.body.classList.remove('light');
    expect(readChromeTokens().isLight).toBe(false);
    document.body.classList.add('light');
    expect(readChromeTokens().isLight).toBe(true);
    document.body.classList.remove('light');
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
