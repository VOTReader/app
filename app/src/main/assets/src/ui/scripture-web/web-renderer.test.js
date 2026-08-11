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
import { arcRadiusGLSL, CEIL_SOFTNESS } from '../../utils/scripture-web/geometry.js';
import { DISTANCE_RAMP, GENRE_COLORS, rampGLSL } from '../../utils/scripture-web/palette.js';

describe('shader / CPU agreement', () => {
  it('inlines the SHARED height law rather than restating it', () => {
    expect(SHADER_SOURCE.vertex).toContain(arcRadiusGLSL);
  });

  it('calls that law for the arc radius', () => {
    expect(SHADER_SOURCE.vertex).toMatch(/arcRadiusY\(rx,\s*uCeil,\s*uSquash,\s*uLocalize\)/);
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

describe('modes', () => {
  it('exposes the three colour modes in cycle order', () => {
    expect(COLOR_MODES).toEqual(['distance', 'testament', 'genre']);
  });
  it('exposes the three densities from sparsest to fullest', () => {
    expect(DENSITY_STEPS).toEqual(['essential', 'classic', 'complete']);
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

describe('graceful degradation', () => {
  it('returns null when WebGL2 is unavailable instead of throwing', () => {
    // jsdom canvases have no WebGL2 — this is the real code path on an old
    // device, and the screen shows its fallback panel rather than a blank void.
    const canvas = { getContext: () => null, addEventListener() {}, removeEventListener() {} };
    expect(createRenderer(canvas, { count: 0 })).toBeNull();
  });
});
