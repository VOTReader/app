// @ts-nocheck
/* The distance ramp's stops sit at their own t (w4 INK review 2, finding 1): the overview's
   feet (r2-01a) and the deep zoom (r3-03, r3-04) pull the same spans different ways, and evenly
   spaced stops could only trade one picture for the other. These pin the positions, the JS twin
   (distanceRampRGB, the altitude ruler's) and the GLSL twin (rampGLSL, the main pass's) against
   an oracle written here from the table alone, and the hue each picture asks of a span band. */
import { describe, it, expect } from 'vitest';
import { DISTANCE_RAMP, DISTANCE_RAMP_AT, distanceRampRGB, rampGLSL } from './palette.js';
import { SPAN_T_EXP } from './geometry.js';

const TOTAL = 31102;   // verses in the Protestant canon (the Famous asset's total)
const tOf = (span) => Math.pow(span / TOTAL, SPAN_T_EXP);

/** The oracle: piecewise linear over the table's own positions, 0..1 floats. */
function oracle(t) {
  const s = Math.min(1, Math.max(0, t));
  for (let i = 1; i < DISTANCE_RAMP_AT.length; i++) {
    if (s <= DISTANCE_RAMP_AT[i]) {
      const f = (s - DISTANCE_RAMP_AT[i - 1]) / (DISTANCE_RAMP_AT[i] - DISTANCE_RAMP_AT[i - 1]);
      return [0, 1, 2].map((k) => DISTANCE_RAMP[i - 1][k] + (DISTANCE_RAMP[i][k] - DISTANCE_RAMP[i - 1][k]) * f);
    }
  }
  return DISTANCE_RAMP[DISTANCE_RAMP.length - 1].slice();
}

/** The GLSL twin, read back from its own source and run as the shader runs it (the mix loop). */
function glslRamp(src) {
  const vecs = /const vec3 RAMP\[(\d+)\] = vec3\[\1\]\(([\s\S]*?)\);/.exec(src);
  const ats = /const float RAMP_AT\[(\d+)\] = float\[\1\]\(([\s\S]*?)\);/.exec(src);
  if (!vecs || !ats) throw new Error('rampGLSL: no RAMP / RAMP_AT table');
  const ramp = [...vecs[2].matchAll(/vec3\(([^)]*)\)/g)].map((m) => m[1].split(',').map(Number));
  const at = ats[2].split(',').map(Number);
  expect(src).toContain('for (int i = 1; i < ' + ramp.length + '; i++)');
  expect(src).toContain('c = mix(c, RAMP[i], clamp((s - RAMP_AT[i - 1])/(RAMP_AT[i] - RAMP_AT[i - 1]), 0., 1.));');
  return (t) => {
    const s = Math.min(1, Math.max(0, t));
    let c = ramp[0].slice();
    for (let i = 1; i < ramp.length; i++) {
      const f = Math.min(1, Math.max(0, (s - at[i - 1]) / (at[i] - at[i - 1])));
      c = c.map((v, k) => v + (ramp[i][k] - v) * f);
    }
    return c;
  };
}

/** Hue in degrees of a 0..1 rgb. */
function hue([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('the distance ramp\'s stops at their own t', () => {
  it('one position per colour, from 0 to 1, strictly rising', () => {
    expect(DISTANCE_RAMP_AT).toHaveLength(DISTANCE_RAMP.length);
    expect(DISTANCE_RAMP_AT[0]).toBe(0);
    expect(DISTANCE_RAMP_AT[DISTANCE_RAMP_AT.length - 1]).toBe(1);
    for (let i = 1; i < DISTANCE_RAMP_AT.length; i++) {
      expect(DISTANCE_RAMP_AT[i], `stop ${i}`).toBeGreaterThan(DISTANCE_RAMP_AT[i - 1]);
    }
  });

  it('pins the table: magenta, magenta-violet, violet, blue, steel, red, tan, olive, green', () => {
    expect(DISTANCE_RAMP).toEqual([
      [0.76, 0.32, 0.72], [0.69, 0.33, 0.78], [0.56, 0.36, 0.85], [0.31, 0.44, 0.83], [0.36, 0.62, 0.79],
      [0.71, 0.28, 0.31], [0.79, 0.63, 0.42], [0.60, 0.66, 0.31], [0.33, 0.76, 0.37],
    ]);
    expect(DISTANCE_RAMP_AT).toEqual([0, 0.14, 0.30, 0.37, 0.47, 0.585, 0.72, 0.86, 1]);
  });

  it('the JS twin is the oracle, 0..255, at and between the stops', () => {
    for (let i = 0; i <= 400; i++) {
      const t = i / 400;
      expect(distanceRampRGB(t), `t ${t}`).toEqual(oracle(t).map((v) => Math.round(v * 255)));
    }
    DISTANCE_RAMP_AT.forEach((t, i) => {
      expect(distanceRampRGB(t)).toEqual(DISTANCE_RAMP[i].map((v) => Math.round(v * 255)));
    });
    expect(distanceRampRGB(-1)).toEqual(distanceRampRGB(0));
    expect(distanceRampRGB(7)).toEqual(distanceRampRGB(1));
  });

  it('the GLSL twin is the oracle: its tables are the palette\'s, its loop the piecewise mix', () => {
    const run = glslRamp(rampGLSL());
    for (let i = 0; i <= 400; i++) {
      const t = i / 400;
      const want = oracle(t), got = run(t);
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k] - want[k]), `t ${t} channel ${k}`).toBeLessThan(1e-4);
    }
  });

  it('every float literal in the GLSL carries a fraction (the shader-hygiene law)', () => {
    const src = rampGLSL();
    const at = /float\[\d+\]\(([^)]*)\)/.exec(src)[1].split(',').map((x) => x.trim());
    for (const x of at) expect(x, x).toMatch(/^[0-9]+\.[0-9]+$/);
  });

  it('a span\'s hue is what the pictures ask of its band', () => {
    // the overview's feet (r2-01a: magenta-violet, 71% of the Psalms-Revelation feet band) are the
    // legs of the 300 to 1,000-verse arcs: magenta-violet, hue 260-330
    for (const span of [300, 500, 1000]) {
      const h = hue(oracle(tOf(span)));
      expect(h, `span ${span}`).toBeGreaterThanOrEqual(260);
      expect(h, `span ${span}`).toBeLessThanOrEqual(330);
    }
    // the low domes over them (r2-01a's 3-15% band) are blue: 2,000 to 4,000 verses
    for (const span of [2000, 3000, 4000]) {
      const h = hue(oracle(tOf(span)));
      expect(h, `span ${span}`).toBeGreaterThanOrEqual(190);
      expect(h, `span ${span}`).toBeLessThan(260);
    }
    // the deep zoom's long legs (r3-03, r3-04: red, tan, green over the local domes): 7,000 verses on
    const warm = (h) => h < 60 || h > 330;
    expect(warm(hue(oracle(tOf(8000))))).toBe(true);
    expect(warm(hue(oracle(tOf(13000))))).toBe(true);
    const g = hue(oracle(tOf(31000)));
    expect(g).toBeGreaterThan(90);
    expect(g).toBeLessThan(150);
  });
});
