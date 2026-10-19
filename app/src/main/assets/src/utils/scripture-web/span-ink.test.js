// @ts-nocheck
/* The span-ink law (w4 INK, item 2; geometry.js "THE SPAN-INK LAW").
   ─────────────────────────────────────────────────────────────────────
   A thread's ink weight is fixed by its own span, the same at every zoom
   (C14: nothing brightens or dims as the reader zooms). Short spans read
   first (Q3 ii; the r2-01a picture's violet feet, the r3-03 picture's vivid
   local domes at depth); a long thread's legs are thin coloured lines. The
   law is stated here twice over: an independent oracle from the picture's
   intent, and the GLSL twin transliterated and run against the JS. */
import { describe, it, expect } from 'vitest';
import * as geo from './geometry.js';
import { SHADER_SOURCE } from '../../ui/scripture-web/web-renderer.js';

const TOTAL = 31102;
/** GLSL's smoothstep and mix, written here from the GLSL ES 3.00 spec (not imported). */
const smoothstep = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
const mix = (x, y, a) => x * (1 - a) + y * a;
/** The span, verses, at which the ramp's t reaches t. */
const spanAt = (t) => TOTAL * Math.pow(t, 1 / geo.SPAN_T_EXP);

describe('the span-ink law: short spans read first, long legs are hairlines, fixed per arc', () => {
  it('reads the span by the distance ramp\'s own t, the one the shader colours by', () => {
    expect(geo.SPAN_T_EXP).toBe(0.4);
    for (const span of [0, 1, 7, 120, 5371, 31000]) {
      expect(geo.spanT(span, TOTAL)).toBeCloseTo(Math.pow(span / TOTAL, 0.4), 12);
      expect(geo.spanT(-span, TOTAL)).toBe(geo.spanT(span, TOTAL));
    }
  });

  it('a span of up to ten verses is short, one of a book\'s length or more is long, and the ease between has no step', () => {
    // the bounds, as spans: the ramp's magenta-violet first stretch (palette DISTANCE_RAMP)
    expect(spanAt(geo.SHORT_T0)).toBeGreaterThan(9);
    expect(spanAt(geo.SHORT_T0)).toBeLessThan(11);
    expect(spanAt(geo.SHORT_T1)).toBeGreaterThan(300);
    expect(spanAt(geo.SHORT_T1)).toBeLessThan(340);
    let prev = 1;
    for (let span = 1; span <= 2000; span++) {
      const s = geo.spanShortness(geo.spanT(span, TOTAL));
      if (span <= 9) expect(s, `span ${span}`).toBe(1);
      if (span >= 340) expect(s, `span ${span}`).toBe(0);
      expect(s, `span ${span}: never shorter for a wider span`).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - s, `span ${span}: eased, never a step (C20)`).toBeLessThan(0.02);
      prev = s;
    }
  });

  it('the shortest spans get 1 + SHORT_GAIN times their ink; a long one keeps its own', () => {
    expect(geo.SHORT_GAIN).toBe(4);
    expect(geo.spanGain(1)).toBe(5);
    expect(geo.spanGain(0)).toBe(1);
    expect(geo.spanGain(0.5)).toBe(3);
  });

  it('the hairline is the overview\'s own stroke: STROKE_FIT_CSS is ribbonStyle\'s at fit', () => {
    expect(geo.STROKE_FIT_CSS).toBe(0.9);
    expect(geo.ribbonStyle(1, 0, 0).strokeWidthCss).toBe(geo.STROKE_FIT_CSS);
  });

  it('at the overview the cap is neutral on every screen: every thread keeps the stroke law\'s width', () => {
    for (const dpr of [1, 2, 2.6, 3]) {
      const halfW = geo.ribbonStyle(1, 0, 0).strokeWidthCss * dpr * 0.5;   // wScale 1 at voteMix 0
      const fit = geo.spanFitHalf(geo.STROKE_FIT_CSS * dpr, 1, 0);
      for (const s of [0, 0.3, 1]) expect(geo.spanHalfWidth(halfW, fit, s)).toBeCloseTo(halfW, 12);
    }
  });

  it('deep in, a long leg keeps the overview hairline, which its votes widen up to STROKE_DEEP / STROKE_MIN; a short span its full width', () => {
    const dpr = 2.6;
    const k = geo.STROKE_MIN_CSS / geo.STROKE_DEEP_CSS;
    // the main pass's own width law at full depth (web-renderer.js): wScale from the votes' strength
    const wScaleOf = (strength, voteMix) => mix(1, mix(k, 1, (strength - 0.3) / 0.7), voteMix);
    const deep = geo.ribbonStyle(855, 1, 0.17);
    expect(deep.strokeWidthCss).toBe(geo.STROKE_DEEP_CSS);
    for (const strength of [0.3, 0.5, 1]) {
      const wScale = wScaleOf(strength, 1);
      const halfW = deep.strokeWidthCss * dpr * 0.5 * wScale;
      const fit = geo.spanFitHalf(geo.STROKE_FIT_CSS * dpr, wScale, 1);
      const long = geo.spanHalfWidth(halfW, fit, 0), short = geo.spanHalfWidth(halfW, fit, 1);
      expect(short, `strength ${strength}: a short span keeps its full width`).toBeCloseTo(halfW, 12);
      // the lowest-vote leg (wScale k) is exactly the overview hairline; the best-voted (wScale 1) 1/k of it (1.71x)
      expect(long, `strength ${strength}`).toBeCloseTo(geo.STROKE_FIT_CSS * dpr * 0.5 * (wScale / k), 12);
      expect(long).toBeLessThan(short);
    }
    // on a DPR 1 screen the lowest-vote leg's .45 is under one device px, so it is held to that (D1)
    expect(geo.spanHalfWidth(1, geo.spanFitHalf(geo.STROKE_FIT_CSS, wScaleOf(0.3, 1), 1), 0)).toBeCloseTo(geo.HAIRLINE_MIN_HALF, 12);
    expect(geo.spanHalfWidth(9, geo.spanFitHalf(geo.STROKE_FIT_CSS, wScaleOf(1, 1), 1), 0)).toBeCloseTo(0.45 / k, 12);
  });

  it('fixed per arc: a long, lowest-vote leg is the same hairline at every zoom, and nothing is drawn wider than the stroke law', () => {
    // DPR 1: the overview's own .45 at fit, held to one whole device px (.5) as soon as the stroke
    // law reaches it, the same from there to the ceiling (D1: the hygiene never pays alpha at depth)
    const dpr = 1;
    const k = geo.STROKE_MIN_CSS / geo.STROKE_DEEP_CSS;
    for (const zoom of [1, 1.5, 3, 6, 12, 24, 40, 207, 855]) {
      const loc = geo.localizeFactor(zoom);
      const st = geo.ribbonStyle(zoom, loc, 0.17);
      const wScale = mix(1, k, st.voteMix);   // strength .30
      const halfW = st.strokeWidthCss * dpr * 0.5 * wScale;
      const fit = geo.spanFitHalf(geo.STROKE_FIT_CSS * dpr, wScale, st.voteMix);
      expect(geo.spanHalfWidth(halfW, fit, 0), `zoom ${zoom}`).toBeCloseTo(Math.min(halfW, geo.HAIRLINE_MIN_HALF), 12);
      if (zoom >= 3) expect(geo.spanHalfWidth(halfW, fit, 0), `zoom ${zoom}`).toBe(geo.HAIRLINE_MIN_HALF);
      for (const s of [0, 0.4, 1]) expect(geo.spanHalfWidth(halfW, fit, s)).toBeLessThanOrEqual(halfW + 1e-12);
    }
  });
});

/* ── D1 through the shader's own chain (depth.test.js D1 checks ribbonStyle alone) ── */
describe('D1 as drawn: a lone, lowest-vote, longest anchored ribbon at the ceiling still clears 3:1', () => {
  // the worst Distance stop needs an effective alpha of 0.83 on black (design-perf, depth.test.js D1)
  const AT_CEILING = 141 / 800;   // anchored arcs per CSS px of width, phoneLand
  const k = geo.STROKE_MIN_CSS / geo.STROKE_DEEP_CSS;
  /** The vertex shader's alpha chain for one anchored thread at rest (uPx 1), transliterated. */
  function drawnAlpha(dpr, wCss, strength, span) {
    const st = geo.ribbonStyle(geo.maxZoomFor(TOTAL, wCss), 1, AT_CEILING);
    const uPx = 1;
    const wScale = mix(1, mix(k, 1, (strength - 0.3) / 0.7), st.voteMix);
    const short = geo.spanShortness(geo.spanT(span, TOTAL));
    let halfW = st.strokeWidthCss * dpr * 0.5 * wScale;
    halfW = geo.spanHalfWidth(halfW, geo.spanFitHalf(geo.STROKE_FIT_CSS * dpr, wScale, st.voteMix), short);
    const thin = Math.min(Math.max(halfW / (0.5 * uPx), 0), 1);
    const aStrength = mix(strength, 1, st.voteMix);
    return Math.min(st.alpha * aStrength * geo.spanGain(short), 1) * thin;
  }

  it('is the chain the shader runs', () => {
    const v = SHADER_SOURCE.vertex;
    expect(v).toContain('halfW = spanHalfWidth(halfW, spanFitHalf(uWidthFit, wScale, uVoteMix), shortness);');
    expect(v).toContain('float thin = clamp(halfW/(.5*uPx), 0., 1.);');
    expect(v).toContain('min(uAlpha*aStrength*spanGain(shortness), 1.)');
  });

  it('reaches .83 at DPR 1 and 2.6 for every vote and span, the lowest-vote canon-wide leg included', () => {
    for (const [dpr, wCss] of [[1, 1600], [1, 800], [2, 800], [2.6, 891]]) {
      for (const strength of [0.3, 0.5, 1]) {
        for (const span of [3, 120, 1500, TOTAL - 1]) {
          expect(drawnAlpha(dpr, wCss, strength, span), `dpr ${dpr} frame ${wCss} strength ${strength} span ${span}`)
            .toBeGreaterThanOrEqual(0.83);
        }
      }
    }
  });
});

/* ── the GLSL twin: transliterated and run against the JS ── */
describe('the GLSL span-ink law IS the JS: the twin transliterated and run', () => {
  function twinOf(glsl) {
    const js = glsl
      .replace(/float (\w+)\(([^)]*)\)\{/g, (_, name, a) => `function ${name}(${a.replace(/float /g, '')}){`)
      .replace(/\b(pow|abs|min|max)\(/g, 'Math.$1(');
    const allowed = new Set(['function', 'return', 'Math', 'pow', 'abs', 'min', 'max', 'mix', 'smoothstep',
      'spanT', 'span', 'total', 'spanShortness', 't', 'spanGain', 'shortness', 'spanFitHalf', 'widthFit', 'wScale',
      'voteMix', 'spanHalfWidth', 'halfW', 'fitHalf']);
    const idents = js.replace(/\b\d+(\.\d*)?(e[-+]?\d+)?/g, ' ').match(/[A-Za-z_]\w*/g) || [];
    for (const id of idents) {
      if (!allowed.has(id)) {
        const at = js.indexOf(id);
        throw new Error(`the GLSL twin uses \`${id}\` (…${js.slice(Math.max(0, at - 40), at + 40)}…): extend the transliteration before trusting this pin`);
      }
    }
    return new Function('mix', 'smoothstep',
      js + '; return {spanT, spanShortness, spanGain, spanFitHalf, spanHalfWidth};')(mix, smoothstep);
  }
  const near = (got, want, what) => expect(Math.abs(got - want), what).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(want)));

  it('agrees with the JS over 4,000 threads of every span, width and vote mix', () => {
    const twin = twinOf(geo.spanInkGLSL);
    let s = 23;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 4000; i++) {
      const span = Math.floor(Math.pow(r(), 3) * TOTAL) * (r() < 0.5 ? -1 : 1);
      const t = geo.spanT(span, TOTAL);
      near(twin.spanT(span, TOTAL), t, `spanT ${span}`);
      const short = geo.spanShortness(t);
      near(twin.spanShortness(t), short, `shortness ${span}`);
      near(twin.spanGain(short), geo.spanGain(short), `gain ${span}`);
      const widthFit = 0.9 * (1 + r() * 2), wScale = 0.5 + r() * 0.5, voteMix = r();
      const fit = geo.spanFitHalf(widthFit, wScale, voteMix);
      near(twin.spanFitHalf(widthFit, wScale, voteMix), fit, 'fitHalf');
      const halfW = r() * 4;
      near(twin.spanHalfWidth(halfW, fit, short), geo.spanHalfWidth(halfW, fit, short), 'halfW');
    }
  });

  it('BITES: a GLSL gain the JS does not have makes the twin disagree', () => {
    const needle = '1. + ' + geo.glslFloat(geo.SHORT_GAIN) + '*shortness';
    expect(geo.spanInkGLSL).toContain(needle);
    const bitten = twinOf(geo.spanInkGLSL.replace(needle, '1. + 6.0*shortness'));
    expect(Math.abs(bitten.spanGain(1) - geo.spanGain(1))).toBeGreaterThan(1);
  });

  it('BITES: a GLSL built-in the transliteration does not know is refused, not miscompared', () => {
    expect(() => twinOf(geo.spanInkGLSL.replace('smoothstep(', 'step('))).toThrow(/step/);
  });
});
