/**
 * THE OVERVIEW (sw2, 2026-10-05): at fit the web no longer sums into a wall. Each thread's ink falls
 * with its length, the brightest thread wins a pixel (a MAX pass), and the whole law is gone by 4x,
 * so nothing past 4x changes. Measured on the built app (lanes/myweb/out/_sw2-lit.mjs): lit share of
 * the dome's box at fit 78.5 -> 47.7 % (phone) and 77.0 -> 39.9 % (desktop), and the 6.6x..12x
 * frames byte-identical to before.
 */
import { describe, it, expect } from 'vitest';
import {
  overviewShare, lengthShare, lengthShareGLSL, OVERVIEW_END, OVERVIEW_HOLD, OVERVIEW_LEN_FLOOR,
  OVERVIEW_GAIN, OVERVIEW_STROKE,
} from './geometry.js';
import { SHADER_SOURCE, createRenderer } from '../../ui/scripture-web/web-renderer.js';

const TOTAL = 31102;

describe('overviewShare: whole at the overview, gone by 4x', () => {
  it('is 1 from fit to OVERVIEW_HOLD and 0 from OVERVIEW_END on', () => {
    for (const z of [0.5, 1, 1.5, OVERVIEW_HOLD]) expect(overviewShare(z), `zoom ${z}`).toBe(1);
    for (const z of [OVERVIEW_END, 4.1, 6.55, 12, 1711]) expect(overviewShare(z), `zoom ${z}`).toBe(0);
  });

  it('eases out without a step: monotone, and no 1 % of zoom (a pinch frame) moves it by more than 3 %', () => {
    let prev = 1;
    for (let z = 1; z <= 5; z *= 1.01) {
      const v = overviewShare(z);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - v).toBeLessThan(0.03);
      prev = v;
    }
  });
});

describe('lengthShare: ink by length, never zero, and the identity once the overview is gone', () => {
  it('keeps a short thread whole and dims a canon-long one to no less than the floor', () => {
    expect(lengthShare(10, TOTAL, 1)).toBe(1);
    expect(lengthShare(TOTAL, TOTAL, 1)).toBeGreaterThanOrEqual(OVERVIEW_LEN_FLOOR);
    expect(lengthShare(TOTAL, TOTAL, 1)).toBeLessThan(0.5);
    let prev = 1;
    for (let s = 1; s <= TOTAL; s *= 2) {
      const k = lengthShare(s, TOTAL, 1);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThanOrEqual(prev);
      prev = k;
    }
  });

  it('is exactly 1 for every span when the overview share is 0', () => {
    for (const s of [0, 1, 50, 3000, TOTAL]) expect(lengthShare(s, TOTAL, 0)).toBe(1);
  });

  it('the GLSL twin IS the JS: transliterated and run', () => {
    const js = lengthShareGLSL
      .replace(/float lengthShare\(([^)]*)\)\{/, (_, a) => `function lengthShare(${a.replace(/float /g, '')}){`)
      .replace(/\bfloat (\w+) =/g, 'let $1 =');
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const mix = (a, b, t) => a + (b - a) * t;
    const twin = new Function('pow', 'max', 'clamp', 'mix', js + '; return lengthShare;')(Math.pow, Math.max, clamp, mix);
    for (const ov of [0, 0.3, 1]) {
      for (const s of [0, 1, 7, 400, 2000, 15000, TOTAL]) {
        expect(twin(s, TOTAL, ov), `span ${s} ov ${ov}`).toBeCloseTo(lengthShare(s, TOTAL, ov), 6);
      }
    }
  });

  it('is inlined in the vertex stage, and a thread the reader lit keeps all of its own ink', () => {
    expect(SHADER_SOURCE.vertex).toContain(lengthShareGLSL);
    expect(SHADER_SOURCE.vertex).toMatch(/float lenK = mix\(lengthShare\(abs\(b - a\), uTotal, uOverview\), 1\., lit\*focusing\);/);
    expect(SHADER_SOURCE.vertex).toMatch(/uAlpha\*uPassGain\*lenK\*dim/);
  });
});

/* The renderer's passes, read off a recording GL (jsdom has no WebGL2). */
function recordingGl() {
  const log = [];
  const gl = new Proxy({}, { get(_, key) {
    if (typeof key !== 'string') return undefined;
    if (/^[A-Z_0-9]+$/.test(key)) return key;           // enums read back as their names
    if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
    if (key === 'getUniformLocation') return (_p, name) => name;
    if (key === 'getAttribLocation') return () => 0;
    if (key.startsWith('create')) return () => ({ kind: key });
    return (...args) => { log.push([key, ...args]); };
  } });
  return { gl, log };
}
function tinyGraph() {
  const total = 200;
  return {
    total, count: 2, from: new Uint16Array([10, 0]), to: new Uint16Array([12, 199]), votes: new Int16Array([30, 30]),
    buckets: [{ off: 0, len: 2, off20: 2, off10: 2, segments: 8, chunks: [] }],
    chunkSize: 256, books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 }],
    chapters: [[0, 1, 0, 200]], chapterOfVerse: new Uint16Array(total), densityTiers: [20, 7], attribution: '',
    votEdges: [], prophecy: [], votLinks: [],
  };
}
function drawWith(overview) {
  const { gl, log } = recordingGl();
  const canvas = { getContext: () => gl, addEventListener() {}, removeEventListener() {} };
  const r = /** @type {any} */ (createRenderer(/** @type {any} */ (canvas), /** @type {any} */ (tinyGraph())));
  log.length = 0;
  const stats = r.draw({ width: 800, height: 400, base: 380, ceil: 360, squash: 0.9, localize: 0, camX: 100, camY: 0,
    ppv: 4, strokeWidth: 1.8, alpha: 0.075, dpr: 2, colorMode: 'distance', density: 'famous', light: false, bg: '#000000',
    focusRange: null, focusArc: -1, overview });
  const calls = (name) => log.filter((c) => c[0] === name);
  const uniform = (name) => calls('uniform1f').filter((c) => c[1] === name).map((c) => c[2]);
  return { log, stats, calls, uniform };
}

describe('the renderer: one summing pass from 4x, exactly as before', () => {
  it('overview 0 (or absent): FUNC_ADD over-blend, gain 1, no composite, no framebuffer, the stroke untouched', () => {
    for (const ov of [0, undefined]) {
      const d = drawWith(ov);
      expect(d.calls('blendEquation').map((c) => c[1])).toEqual(['FUNC_ADD']);
      expect(d.calls('blendFunc').map((c) => c.slice(1))).toEqual([['ONE', 'ONE_MINUS_SRC_ALPHA']]);
      expect(d.uniform('uPassGain')).toEqual([1]);
      expect(d.uniform('uComposite')).toEqual([0]);
      expect(d.uniform('uOverview')).toEqual([0]);
      expect(d.uniform('uWidth')).toEqual([1.8]);
      expect(d.calls('bindFramebuffer')).toEqual([]);
      expect(d.calls('drawArraysInstanced').length).toBe(1);
    }
  });

  it('overview 1: one brightest-wins pass (MAX on the dark ground), the gain, the thinner thread', () => {
    const d = drawWith(1);
    expect(d.calls('blendEquation').map((c) => c[1])).toEqual(['MAX']);
    expect(d.uniform('uPassGain')).toEqual([OVERVIEW_GAIN]);
    expect(d.uniform('uComposite')).toEqual([1]);
    expect(d.uniform('uWidth')[0]).toBeCloseTo(1.8 * OVERVIEW_STROKE, 9);
    expect(d.calls('bindFramebuffer')).toEqual([]);
    expect(d.calls('drawArraysInstanced').length).toBe(1);
  });

  it('a thinned thread never goes below one device px', () => {
    const { gl, log } = recordingGl();
    const r = /** @type {any} */ (createRenderer(/** @type {any} */ ({ getContext: () => gl, addEventListener() {}, removeEventListener() {} }), /** @type {any} */ (tinyGraph())));
    log.length = 0;
    r.draw({ width: 800, height: 400, base: 380, ceil: 360, squash: 0.9, localize: 0, camX: 100, ppv: 4, strokeWidth: 0.9,
      alpha: 0.075, dpr: 1, colorMode: 'distance', density: 'famous', light: false, bg: '#000', focusRange: null, focusArc: -1, overview: 1 });
    expect(log.filter((c) => c[0] === 'uniform1f' && c[1] === 'uWidth').map((c) => c[2])).toEqual([0.9]);
  });

  it('between, both passes cross-fade: brightest-wins into a texture, the summing pass on screen, laid over at the share', () => {
    const d = drawWith(0.5);
    // in draw order: the texture is bound, the brightest pass draws into it, the screen is bound back
    const order = d.log.filter((c) => c[0] === 'bindFramebuffer' || c[0] === 'drawArraysInstanced' || c[0] === 'drawArrays')
      .map((c) => (c[0] === 'bindFramebuffer' ? (c[2] ? 'fbo' : 'screen') : c[0]));
    expect(order.slice(-5)).toEqual(['fbo', 'drawArraysInstanced', 'screen', 'drawArraysInstanced', 'drawArrays']);
    expect(d.calls('blendEquation').map((c) => c[1])).toEqual(['MAX', 'FUNC_ADD', 'FUNC_ADD']);
    expect(d.calls('drawArraysInstanced').length).toBe(2);
    expect(d.calls('drawArrays').length).toBe(1);
    expect(d.calls('blendColor')).toEqual([['blendColor', 0, 0, 0, 0.5]]);
    expect(d.calls('blendFunc').pop().slice(1)).toEqual(['CONSTANT_ALPHA', 'ONE_MINUS_CONSTANT_ALPHA']);
    // the stats count the picture's instances once, not once per pass
    expect(d.stats.instances).toBe(2);
  });

  it('the parchment ground takes the darkest thread (MIN): the same law, inverted', () => {
    const { gl, log } = recordingGl();
    const r = /** @type {any} */ (createRenderer(/** @type {any} */ ({ getContext: () => gl, addEventListener() {}, removeEventListener() {} }), /** @type {any} */ (tinyGraph())));
    log.length = 0;
    r.draw({ width: 800, height: 400, base: 380, ceil: 360, squash: 0.9, localize: 0, camX: 100, ppv: 4, strokeWidth: 1.8,
      alpha: 0.075, dpr: 2, colorMode: 'distance', density: 'famous', light: true, bg: '#f4ecd8', focusRange: null, focusArc: -1, overview: 1 });
    expect(log.filter((c) => c[0] === 'blendEquation').map((c) => c[1])).toEqual(['MIN']);
  });

  it('the composite fragment lays each thread on the ground; the summing one stays premultiplied', () => {
    expect(SHADER_SOURCE.fragment).toContain('vec4(mix(uBg, vCol.rgb, a), 1.)');
    expect(SHADER_SOURCE.fragment).toContain('vec4(vCol.rgb*a, a)');
  });
});
