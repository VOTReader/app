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
import * as geo from '../../utils/scripture-web/geometry.js';
import { SHADER_SOURCE, COLOR_MODES, DENSITY_STEPS, createRenderer } from './web-renderer.js';
import { threadShapeGLSL } from '../../utils/scripture-web/geometry.js';
import {
  DISTANCE_RAMP, GENRE_COLORS, rampGLSL, readChromeTokens, cssColorToRGB,
} from '../../utils/scripture-web/palette.js';

describe('shader / CPU agreement', () => {
  it('inlines the SHARED curve law rather than restating it', () => {
    expect(SHADER_SOURCE.vertex).toContain(threadShapeGLSL);
  });

  it('calls that law for the arc radii, and draws the curve it returns', () => {
    expect(SHADER_SOURCE.vertex).toMatch(/threadShape\(rx,\s*uSquash\)/);
    // The point and its tangent come from the shared arcAt, not from a
    // hand-written cos/sin pair beside it; the parameter from the shared
    // sampler over the x window's arcTau pair.
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

  it('has NO tanh ceiling and no softness constant anywhere in the vertex stage — the morph is gone', () => {
    // The old case pinned exactly ONE copy of CEIL_SOFTNESS (1.9) so nobody
    // could hand-write a second law beside the shared one. The true world has
    // no ceiling to soften; a tanh here would be the morph coming back.
    expect(SHADER_SOURCE.vertex).not.toContain('tanh');
    expect(SHADER_SOURCE.vertex.split('1.9').length - 1).toBe(0);
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

  it('M5: the vertex stage inlines voteStrengthGLSL verbatim and reads strength from it — the linear aVotes/70 is gone', () => {
    const { voteStrengthGLSL } = /** @type {any} */ (geo);
    expect(typeof voteStrengthGLSL, 'geometry exports the twin').toBe('string');
    expect(SHADER_SOURCE.vertex).toContain(voteStrengthGLSL);
    expect(SHADER_SOURCE.vertex).toContain('float strength = voteStrength(aVotes);');
    expect(SHADER_SOURCE.vertex).not.toContain('aVotes/70.');
  });

  it('M3: the feet read the departure slots — normalized byte attributes added to the verse', () => {
    expect(SHADER_SOURCE.vertex).toMatch(/in float aSlotA;/);
    expect(SHADER_SOURCE.vertex).toMatch(/in float aSlotB;/);
    expect(SHADER_SOURCE.vertex).toContain('(a + aSlotA - uCamX)*uPPV');
    expect(SHADER_SOURCE.vertex).toContain('(b + aSlotB - uCamX)*uPPV');
  });

  it('reads the instance id from its own attribute (inverted at M2: uInstanceBase is gone)', () => {
    // gl_InstanceID restarts at 0 for every draw, so a gathered list — whose
    // members are not contiguous in the asset — cannot recover an arc's id
    // from its position plus a base offset. The id rides with the instance.
    expect(SHADER_SOURCE.vertex).toMatch(/in float aId;/);
    expect(SHADER_SOURCE.vertex).toContain('float id = aId;');
    expect(SHADER_SOURCE.vertex).not.toContain('uInstanceBase');
    expect(SHADER_SOURCE.vertex).not.toContain('gl_InstanceID');
  });

  it('emits premultiplied alpha, matching both blend modes the renderer sets', () => {
    expect(SHADER_SOURCE.fragment).toContain('vec4(vCol.rgb*a, a)');
  });
});

/* 'deep-zoom declutter' — the fly-over fade, its zero-alpha cull and the
   floor it settled at — is RETIRED with the morph (w-sw-phase1, M1): with
   every thread at its own height there is nothing overhead to fade. Its
   inversion is 'the true law in the vertex stage' at the end of this file
   (no fly-over site, no cull; the y camera positions every vertex). */

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

describe('the true law in the vertex stage (w-sw-phase1, M1)', () => {
  // The morph and the fly-over law go together: with every thread at its own
  // height the field at depth is clean by geometry, and there is nothing left
  // for a dimming law to dim (spine section 1). The y camera positions every
  // vertex, and the segments go to the piece of the thread that is on screen.
  it('carries no fly-over law and no localize: expected 0 sites', () => {
    const hits = (SHADER_SOURCE.vertex.match(/flyOverDim|arcAnchored|uLocalize/g) || []).length;
    expect(hits, 'fly-over / localize sites in the vertex stage').toBe(0);
  });
  it('positions every vertex from the y camera: uCamY, and p.y = uBase - (hgt - hOff)', () => {
    // declared in the camera's uniform line (uCamX, uPPV, uBase, uSquash, uCamY)
    expect(SHADER_SOURCE.vertex).toMatch(/uniform float[^;]*\buCamY\b/);
    expect(SHADER_SOURCE.vertex).toMatch(/uBase - \(hgt - hOff\)/);
  });
  it('spends its segments on the visible piece: the shared sampleTau is inlined and called', () => {
    expect(SHADER_SOURCE.vertex).toContain('float sampleTau(');
    expect(SHADER_SOURCE.vertex).toMatch(/float tau = sampleTau\(/);
  });
});
