#!/usr/bin/env node
/**
 * sw-ink-readback.mjs: the Scripture Web's ribbon ink read back from a real WebGL2 frame.
 *
 * The renderer's tests (web-renderer.test.js) pin the shader source and a JS twin of its coverage;
 * a twin alone is not proof that the GPU draws it. This draws single threads on a plain ground with
 * the REAL renderer (createRenderer, bundled here from src/ by esbuild) in headless Chrome, reads
 * the pixels back with gl.readPixels, and checks them against the law:
 *
 *   1. a short arc (30 verses) and a long leg (3,000 verses), each alone, at DPR 1 on a 1600x900
 *      frame (the PC) and DPR 2.6 on an 891x411 one (a compact phone frame):
 *      - the centre line's alpha is the ribbon's (min(alpha x span gain, 1)), within 2/255;
 *      - the short arc's coverage, read across its apex, is the glow's share at the ribbon's edge
 *        (NEAR_GLOW_ALPHA on the PC, NEAR_GLOW_COMPACT_ALPHA on the phone) within 0.05, and none
 *        past the glow's reach + 1 device px;
 *      - the long leg's cross-section is the plain antialiased ribbon: no glow and no shoulder.
 *   2. D1 in pixels: at Isaiah 53's ceiling (its crowd, PPV_MAX_CSS CSS px a verse) a lone anchored
 *      ribbon of the weakest votes stands at 3:1 or more on black (WCAG), for spans across the ramp.
 *
 * Alpha is read exactly by drawing each frame twice, on black and on white: premultiplied-over gives
 * B = c a and W = c a + 1 - a, so a = 1 - (W - B) whatever the ramp's colour c.
 *
 * Run it behind the chrome admit (python D:/Swarm/tools/machine-load.py --admit chrome):
 *   node tools/sw-ink-readback.mjs [--json]
 * Exits 0 when every check holds, 1 when one fails, 2 on a harness error (no WebGL2, no GPU).
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import puppeteer from 'puppeteer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'app/src/main/assets/src');
const JSON_OUT = process.argv.includes('--json');

const ENTRY = `
import { createRenderer } from './ui/scripture-web/web-renderer.js';
import * as geo from './utils/scripture-web/geometry.js';
import * as ink from './utils/scripture-web/sw-ink.js';
import { isCompact } from './utils/scripture-web/frame-set.js';
window.__readback = { createRenderer, geo, ink, isCompact };
`;

async function bundle() {
  const out = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: SRC, loader: 'js' },
    bundle: true, format: 'iife', write: false, target: 'chrome108', logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

/* Runs in the page: every scene, drawn and read back. Returns plain data. */
function inPage() {
  const { createRenderer, geo, ink, isCompact } = /** @type {any} */ (window).__readback;
  const TOTAL = 31102;
  const graphOf = (from, to, votes) => ({
    total: TOTAL, count: 1, from: new Uint16Array([from]), to: new Uint16Array([to]), votes: new Int16Array([votes]),
    buckets: [{ off: 0, len: 1, off20: 1, off10: 1, segments: 8, chunks: [] }],
    chunkSize: 256, books: [{ id: 'all', title: 'All', abbr: 'All', start: 0 }],
    chapters: [[0, 1, 0, TOTAL]], chapterOfVerse: new Uint16Array(TOTAL), prophecy: [], votEdges: [], votLinks: [],
  });
  const gpu = (() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  })();
  if (!gpu) return { error: 'no WebGL2' };

  /** Draw one thread alone, on black then white; returns the alpha image and the black image. */
  function frame({ W, H, dpr, from, to, votes, ppv, camX, base, alpha, strokeWidth }) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    document.body.appendChild(canvas);
    const r = createRenderer(canvas, graphOf(from, to, votes));
    const gl = canvas.getContext('webgl2');
    const ceil = base;
    const view = {
      width: W, height: H, base, ceil, squash: geo.squashFactor(ceil, W), localize: 1, density: 'famous',
      camX, camY: 0, ppv, strokeWidth, alpha, voteMix: 1, dpr, bg: '#000000',
      focusRange: null, focusArc: -1, tapFade: 0, centre: null,
    };
    const read = (bg) => {
      view.bg = bg;
      r.draw(view);
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    const black = read('#000000');
    const white = read('#ffffff');
    r.dispose();
    canvas.remove();
    // alpha per pixel, rows top-down (readPixels is bottom-up)
    const a = new Float32Array(W * H), rgb = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = ((H - 1 - y) * W + x) * 4, o = y * W + x;
        let s = 0;
        for (let k = 0; k < 3; k++) { s += 1 - (white[i + k] - black[i + k]) / 255; rgb[o * 3 + k] = black[i + k] / 255; }
        a[o] = s / 3;
      }
    }
    return { a, rgb, W, H, squash: view.squash };
  }

  /** The column through x: alpha by row. */
  const column = (f, x) => { const c = new Float32Array(f.H); for (let y = 0; y < f.H; y++) c[y] = f.a[y * f.W + x]; return c; };
  /** The row through y: alpha by column. */
  const rowOf = (f, y) => f.a.slice(y * f.W, (y + 1) * f.W);
  /** A profile's centre (its alpha-weighted centroid over the run around its peak) and peak. */
  function centre(prof) {
    let peak = 0, at = -1;
    for (let i = 0; i < prof.length; i++) if (prof[i] > peak) { peak = prof[i]; at = i; }
    if (at < 0 || peak <= 0) return null;
    let lo = at, hi = at;
    while (lo > 0 && prof[lo - 1] > 0.5 / 255) lo--;
    while (hi < prof.length - 1 && prof[hi + 1] > 0.5 / 255) hi++;
    let sw = 0, sy = 0;
    for (let i = lo; i <= hi; i++) { sw += prof[i]; sy += prof[i] * (i + 0.5); }
    return { c: sy / sw, peak, lo, hi };
  }
  const smooth = (e0, e1, x) => { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };
  /** The fragment stage's coverage, the JS twin (uFeather 1). */
  const twin = (d, halfW, glowHalf, glowA) => {
    const aa = 1 - smooth(halfW - 0.5, halfW + 0.5, d);
    const g = glowHalf > halfW + 0.01 ? Math.min(Math.max((d - halfW) / (glowHalf - halfW), 0), 1) : 1;
    return Math.max(aa, (1 - g) * (1 - g) * glowA);
  };
  /** Linear read of a profile at a fractional row centre position p (rows at i + 0.5). */
  const at = (prof, p) => {
    const t = p - 0.5, i = Math.floor(t), f = t - i;
    const v0 = prof[Math.max(0, Math.min(prof.length - 1, i))], v1 = prof[Math.max(0, Math.min(prof.length - 1, i + 1))];
    return v0 + (v1 - v0) * f;
  };

  /** The centre that best fits a profile to the twin's shape (least squares over a fine search): the
   *  ribbon's centre line sits wherever the curve's chords put it, and a sampled centroid of a thin
   *  profile is biased by the grid, so the shape is read about the centre that fits it best. */
  function fitCentre(prof, guess, shape, want) {
    let best = guess, err = Infinity;
    for (let c = guess - 1.5; c <= guess + 1.5; c += 0.005) {
      let e = 0;
      for (let i = Math.max(0, Math.floor(c - 14)); i <= Math.min(prof.length - 1, Math.ceil(c + 14)); i++) {
        const r = prof[i] / want - shape(Math.abs(i + 0.5 - c));
        e += r * r;
      }
      if (e < err) { err = e; best = c; }
    }
    return best;
  }
  /** The glow's share at the ribbon's edge, read from the halo alone: the samples between the
   *  antialiased edge and the reach fitted to s (1 - g)^2, least squares. */
  function haloShare(prof, c, want, halfW, glowHalf) {
    let num = 0, den = 0, n = 0;
    for (let i = 0; i < prof.length; i++) {
      const d = Math.abs(i + 0.5 - c);
      if (d < halfW + 0.6 || d > glowHalf - 0.25) continue;
      const g = (d - halfW) / (glowHalf - halfW), b = (1 - g) * (1 - g);
      num += (prof[i] / want) * b; den += b * b; n++;
    }
    return n >= 2 ? num / den : NaN;
  }

  const results = [];
  const frames = [
    { name: 'pc', W: 1600, H: 900, dpr: 1 },
    { name: 'phone', W: Math.round(891 * 2.6), H: Math.round(411 * 2.6), dpr: 2.6 },
  ];
  for (const fr of frames) {
    const compact = isCompact(fr.H / fr.dpr);
    const glowCss = compact ? ink.NEAR_GLOW_COMPACT_CSS : ink.NEAR_GLOW_CSS;
    const glowA = compact ? ink.NEAR_GLOW_COMPACT_ALPHA : ink.NEAR_GLOW_ALPHA;
    const strokeWidth = geo.STROKE_DEEP_CSS * fr.dpr;
    const base = Math.round(fr.H * 0.85);

    // 1a. the short arc: 30 verses at votes 70 (strength 1, so its half width is the stroke's half)
    {
      const from = 10000, to = 10030, span = to - from;
      const ppv = (fr.W * 0.4) / span;
      const alpha = 0.17;   // x the span gain 5: 0.85 on its centre line
      const f = frame({ ...fr, from, to, votes: 70, ppv, camX: from + span / 2, base, alpha, strokeWidth });
      const short = geo.spanShortness(geo.spanT(span, TOTAL));
      const want = Math.min(alpha * geo.spanGain(short), 1);
      const halfW = strokeWidth / 2, glowHalf = halfW + short * glowCss * fr.dpr;
      // the apex column: the arc's middle, where its tangent is level and a column is its cross-section
      const x = Math.round(fr.W / 2);
      const prof = column(f, x);
      const c = centre(prof);
      const rec = { frame: fr.name, scene: 'short arc (30 verses)', dpr: fr.dpr, compact, wantAlpha: want, halfW, glowHalf, glowA };
      if (!c) { results.push({ ...rec, ok: false, why: 'nothing drawn in the apex column' }); continue; }
      const cc = fitCentre(prof, c.c, (d) => twin(d, halfW, glowHalf, glowA), want);
      const centreAlpha = at(prof, cc);
      const edge = haloShare(prof, cc, want, halfW, glowHalf);
      let worst = 0, beyond = 0;
      for (let i = 0; i < prof.length; i++) {
        const d = Math.abs(i + 0.5 - cc);
        const cov = prof[i] / want;
        if (d <= glowHalf + 2) worst = Math.max(worst, Math.abs(cov - twin(d, halfW, glowHalf, glowA)));
        if (d >= glowHalf + 1) beyond = Math.max(beyond, prof[i]);
      }
      const checks = {
        centre: Math.abs(centreAlpha - want) <= 2 / 255,
        edge: Math.abs(edge - glowA) <= 0.05,
        none_past_reach: beyond <= 2 / 255,
        twin: worst <= 0.05,
      };
      results.push({ ...rec, centreAlpha, edgeCoverage: edge, pastReach: beyond, twinWorst: worst, checks, ok: Object.values(checks).every(Boolean) });
    }

    // 1b. the long leg: 3,000 verses, both feet in frame, its apex low enough to read across
    {
      const from = 12000, to = 15000, span = to - from;
      const ppv = (fr.W * 0.5) / span;
      const alpha = 0.85;   // a long thread's gain is 1: 0.85 on its centre line
      const fl = frame({ ...fr, from, to, votes: 70, ppv, camX: from + span / 2, base, alpha, strokeWidth });
      const want = alpha;
      const fitHalf = geo.spanFitHalf(geo.STROKE_FIT_CSS * fr.dpr, 1, 1);
      const halfW = geo.spanHalfWidth(strokeWidth / 2, fitHalf, 0);
      const x = Math.round(fr.W / 2);
      const prof = column(fl, x);
      const c = centre(prof);
      const rec = { frame: fr.name, scene: 'long leg (3,000 verses)', dpr: fr.dpr, compact, wantAlpha: want, halfW };
      if (!c) { results.push({ ...rec, ok: false, why: 'nothing drawn in the apex column' }); continue; }
      const cc = fitCentre(prof, c.c, (d) => twin(d, halfW, halfW, 0), want);
      // a hairline under 2 device px wide lays a whole pixel on its centre line only when that line
      // falls near a pixel's centre: the pixel nearest it reads the twin's coverage there
      const near = Math.floor(cc - 0.5) + (cc - 0.5 - Math.floor(cc - 0.5) > 0.5 ? 1 : 0);
      const centreAlpha = prof[near];
      const centreWant = want * twin(Math.abs(near + 0.5 - cc), halfW, halfW, 0);
      let worst = 0, beyond = 0;
      for (let i = 0; i < prof.length; i++) {
        const d = Math.abs(i + 0.5 - cc);
        if (d <= halfW + 3) worst = Math.max(worst, Math.abs(prof[i] / want - twin(d, halfW, halfW, 0)));
        if (d >= halfW + 1) beyond = Math.max(beyond, prof[i]);
      }
      const checks = {
        centre: Math.abs(centreAlpha - centreWant) <= 2 / 255 + 0.01,
        no_glow: beyond <= 2 / 255,
        plain_ribbon: worst <= 0.05,
      };
      results.push({ ...rec, centreAlpha, centreWant, peak: c.peak, pastEdge: beyond, twinWorst: worst, checks, ok: Object.values(checks).every(Boolean) });
    }

    // 2. D1 in pixels at Isaiah 53's ceiling: a lone anchored ribbon of the weakest votes
    {
      const wCss = fr.W / fr.dpr;
      const per = (fr.name === 'pc' ? 595 / 1600 : 306 / 891);
      const zoom = geo.maxZoomFor(TOTAL, wCss);
      const st = geo.ribbonStyle(zoom, 1, per, geo.PPV_MAX_CSS);
      const ppv = geo.PPV_MAX_CSS * fr.dpr;
      for (const span of [120, 1500, 9000, 20000, 30000]) {
        const from = 1000, to = from + span;
        // the left foot a little left of the middle, on a pixel's centre; the leg rises off the frame
        const footX = Math.round(fr.W * 0.4) + 0.5;
        const camX = from + 0.5 - (footX - fr.W / 2) / ppv;   // the fan is 0 for a lone thread
        const f = frame({ ...fr, from, to, votes: 21, ppv, camX, base, alpha: st.alpha, strokeWidth: st.strokeWidthCss * fr.dpr });
        // the leg's centre line: the brightest pixel over the rows above its foot, where the leg is
        // near vertical and its centre crosses pixel centres (a one-device-px hairline at DPR 1 lays
        // its full alpha only on the pixel its centre line passes through)
        let best = -1, bestA = 0, y = -1;
        for (let yy = base; yy >= Math.max(0, base - Math.round(300 * fr.dpr)); yy--) {
          const row = rowOf(f, yy);
          for (let x = 0; x < fr.W; x++) if (row[x] > bestA) { bestA = row[x]; best = x; y = yy; }
        }
        const rec = { frame: fr.name, scene: `D1 ceiling, span ${span}`, dpr: fr.dpr, lawAlpha: st.alpha };
        if (best < 0) { results.push({ ...rec, ok: false, why: 'nothing drawn on the row' }); continue; }
        const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        const o = (y * fr.W + best) * 3;
        const L = 0.2126 * lin(f.rgb[o]) + 0.7152 * lin(f.rgb[o + 1]) + 0.0722 * lin(f.rgb[o + 2]);
        const ratio = (L + 0.05) / 0.05;
        // information, not a check: how far above its foot the leg's drawn piece starts, device px.
        // GLSL's asin(0.) reads about 6.7e-5 on ANGLE / D3D11 here (an approximation's error), so
        // arcFrameTau's 2 asin(sqrt(0)) starts the piece at tau 1.35e-4, A x 1.35e-4 above the foot.
        let lowest = -1;
        const fx = Math.floor(footX);
        for (let yy = base; yy >= 0 && lowest < 0; yy--) {
          for (let xx = Math.max(0, fx - 3); xx <= Math.min(fr.W - 1, fx + 3); xx++) if (f.a[yy * fr.W + xx] > 0.02) { lowest = yy; break; }
        }
        const footGapPx = lowest < 0 ? NaN : base - lowest;
        const checks = { law: st.alpha >= 0.83, contrast: ratio >= 3 };
        results.push({ ...rec, peakAlpha: bestA, contrast: ratio, footGapPx, checks, ok: Object.values(checks).every(Boolean) });
      }
    }
  }
  return { gpu, results };
}

async function main() {
  const code = await bundle();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=default'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body style="margin:0;background:#000"></body></html>');
    await page.addScriptTag({ content: code });
    const out = await page.evaluate(inPage);
    if (out.error) { console.error(`sw-ink-readback: harness: ${out.error}`); return 2; }
    if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`sw-ink-readback on ${out.gpu}`);
      for (const r of out.results) {
        const nums = Object.entries(r)
          .filter(([k, v]) => typeof v === 'number' && !['dpr'].includes(k))
          .map(([k, v]) => `${k} ${Number(v).toFixed(3)}`).join(', ');
        const bad = r.checks ? Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k) : [r.why];
        console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.frame} ${r.scene}: ${nums}${r.ok ? '' : `  (failed: ${bad.join(', ')})`}`);
      }
    }
    const ok = out.results.length > 0 && out.results.every((r) => r.ok);
    console.log(ok ? 'sw-ink-readback: all checks hold' : 'sw-ink-readback: FAILED');
    return ok ? 0 : 1;
  } finally {
    await browser.close();
  }
}

main().then((code) => process.exit(code), (e) => { console.error('sw-ink-readback: harness:', e); process.exit(2); });
