// @ts-nocheck
/**
 * The structure law (lanes/myweb/out/structure-law.md, 2026-09-21). Corbin,
 * 21:21, on the live fit view: "I want to be able to see all the lines ...
 * the smear was because lines stacked up and became fully horizontal and
 * formed a 'sky' ... you need to be able to zoom way, way in, and someway
 * somehow navigate them and understand them".
 *
 * The finding: any BOUNDED arc height (1.15 x ceil under tanh; four lifted
 * bands) puts a LEVEL run on every thread whose span outruns a few frames,
 * and ten thousand level runs stack into the sky. So the law is the fit
 * dome's own, at every zoom: each thread is the half-ellipse of its own
 * span (R = rx, A = rx x squash), zoom is a magnifying glass on the dome,
 * a thread arches inside the frame iff its span fits the frame's width,
 * and the sky's altitude IS span. A verse's threads leave from points
 * spread across the verse's own cell, in the order of their far ends.
 *
 * Every case reads the exports off the module objects, so this file LOADS
 * on the tree before the law (72eb11d7) and is RED there for the law's
 * reason, not for an import's.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as geo from './geometry.js';
import * as dec from './decode.js';
import * as pick from './pick.js';
import { SHADER_SOURCE } from '../../ui/scripture-web/web-renderer.js';
import { attachWebGestures } from '../../ui/scripture-web/gestures.js';

const here = dirname(fileURLToPath(import.meta.url));
const ASSET = resolve(here, '../../data/scripture-web-data.js');
const graph = dec.decodeGraph(runInNewContext(readFileSync(ASSET, 'utf8') + ';SCRIPTURE_WEB_DATA', {}));

// the phone-landscape frame (CSS 800x360, base 260), device px
const DPR = 2, W_CSS = 800, W = W_CSS * DPR, CEIL = 256 * DPR, BASE = CEIL / 0.985;
const TOTAL = graph.total;
const SQUASH = geo.squashFactor(CEIL, W);
const zMax = geo.maxZoomFor(TOTAL, W_CSS);
const yf = { base: BASE, ceil: CEIL, squash: SQUASH, maxSpan: dec.maxSpanOf(graph) };

const psalm107 = (() => {
  for (let ci = 0; ci < graph.chapters.length; ci++) {
    const ch = graph.chapters[ci];
    if (graph.books[ch[0]].id.startsWith('psalms') && ch[1] === 107) return ch;
  }
  throw new Error('Psalm 107 missing from the asset');
})();
const CENTRE = psalm107[2] + psalm107[3] / 2;

function camAt(zoom, x = CENTRE) {
  const cam = geo.createCamera(TOTAL);
  cam.ppv = geo.fitPPV(cam, W) * zoom;
  cam.x = x;
  geo.clampCamera(cam, W, zMax, yf);
  return cam;
}
const viewAt = (cam, over) => Object.assign({
  width: W, height: 2 * BASE, base: BASE, ceil: CEIL, squash: SQUASH,
  localize: geo.localizeFactor(cam.ppv / geo.fitPPV(cam, W)), density: 'famous', rulerDepth: 40,
}, over);

describe('the law exists in one form for both sides', () => {
  it('exports: arcShape(rx, squash), the ellipse twins, footX, and the GLSL the shader inlines', () => {
    expect(geo.arcShape.length).toBe(2);
    expect(typeof geo.footX).toBe('function');
    expect(typeof geo.arcTauOf).toBe('function');
    expect(typeof geo.arcPointAt).toBe('function');
    expect(typeof geo.arcHeightAt).toBe('function');
    expect(SHADER_SOURCE.vertex).toContain(geo.arcShapeGLSL);
    // the old law's numbers are gone with it: nothing left to tune into a sky
    for (const dead of ['APEX_LIFT', 'CEIL_SOFTNESS', 'FAN_FLOOR', 'SPREAD', 'DOME', 'BAND', 'STRATA_BOUNDS', 'strataLift', 'strataGLSL', 'domeOf', 'arcParamLength']) {
      expect(geo[dead], dead).toBeUndefined();
    }
    expect(SHADER_SOURCE.vertex).not.toMatch(/tanh\(|strataLift\(|domeOf\(|uCeil/);
  });
});

describe('the half-ellipse of its own span, at every zoom', () => {
  it('R = rx and A = rx x squash whatever the zoom: the fit law is the depth law', () => {
    for (const rx of [1, 40, 400, 4000, 400000, 4e6]) {
      for (const squash of [0.3, 0.64, 1, 2.2]) {
        const s = geo.arcShape(rx, squash);
        expect(s.R).toBe(rx);
        expect(s.A).toBeCloseTo(rx * squash, 9);
      }
    }
  });

  it('a thread arches inside the frame iff its span fits the frame width in verses; a longer one leaves through the TOP', () => {
    for (const zoom of [1, 12, 30, zMax]) {
      const cam = camAt(zoom);
      const frameVerses = W / cam.ppv;
      for (const span of [3, 30, 300, 3000, 30000]) {
        const rx = (span * cam.ppv) / 2;
        const { A } = geo.arcShape(rx, SQUASH);
        if (span <= frameVerses) expect(A, `zoom ${zoom} span ${span}`).toBeLessThanOrEqual(CEIL + 1e-6);
        else expect(A, `zoom ${zoom} span ${span}`).toBeGreaterThan(CEIL);
      }
    }
  });

  it('NO LEVEL RUN: every on-screen body has a slope away from its own crown, and the crown is the only flat stretch', () => {
    // the height's derivative along x, off the curve itself, for spans from a
    // verse to the canon at three zooms. On the ellipse |dh/dx| = A u / (rx
    // sqrt(1 - u^2)) >= squash x |u| with u the distance from the crown as a
    // share of the half-span, so outside a tenth of the half-span around the
    // crown (where any arch is level) the slope is above 0.05: no stretch of
    // any body is level, whatever the span.
    let bodies = 0;
    for (const zoom of [12, 100, zMax]) {
      const cam = camAt(zoom);
      for (const span of [2, 20, 200, 2000, 20000]) {
        const x0 = 300, x1 = x0 + span * cam.ppv;
        if (x1 - x0 < 24) continue;                   // a few strokes wide: no body to read
        const { A } = geo.arcShape((x1 - x0) / 2, SQUASH);
        const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2;
        bodies++;
        for (let k = 1; k < 400; k++) {
          const x = x0 + ((x1 - x0) * k) / 400;
          const h = geo.arcHeightAt(x, x0, x1, A);
          if (h > CEIL) continue;                       // off the top of the frame at rest
          if (Math.abs(x - cx) < 0.1 * rx) continue;    // the crown
          const dh = (geo.arcHeightAt(x + 0.5, x0, x1, A) - geo.arcHeightAt(x - 0.5, x0, x1, A));
          expect(Math.abs(dh), `zoom ${zoom} span ${span} x ${x}`).toBeGreaterThan(0.05);
        }
      }
    }
    expect(bodies).toBeGreaterThan(8);
  });

  it('the sky\'s altitude is span: k ceilings up, only threads spanning more than k frame-widths reach', () => {
    const cam = camAt(12);
    const frameVerses = W / cam.ppv;
    for (const k of [0.5, 1, 2, 4]) {
      const h = k * CEIL;
      // the least span whose apex reaches h, by the law: A = rx*squash = span*ppv/2*squash
      const spanAt = (2 * h) / (SQUASH * cam.ppv);
      expect(spanAt / frameVerses).toBeCloseTo(k * (CEIL / (W / 2)) / SQUASH, 6);   // = k on this frame's own squash
      expect(geo.arcShape((spanAt * cam.ppv) / 2, SQUASH).A).toBeCloseTo(h, 6);
      expect(geo.arcShape((spanAt * 0.99 * cam.ppv) / 2, SQUASH).A).toBeLessThan(h);
    }
  });

  it('the parametric curve the shader draws and the analytic height the picker tests are ONE curve', () => {
    let s = 7;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 400; i++) {
      const rx = 1 + r() * 60000, squash = 0.3 + r() * 1.9;
      const left = r() * 500, right = left + 2 * rx;
      const { A } = geo.arcShape(rx, squash);
      for (let k = 0; k <= 32; k++) {
        const tau = (Math.PI * k) / 32;
        const p = geo.arcPointAt(tau, left, right, A);
        expect(geo.arcHeightAt(p.x, left, right, A), `k=${k}`).toBeCloseTo(p.h, 5);
        expect(geo.arcTauOf(p.x, left, right), `tau round-trip ${k}`).toBeCloseTo(tau, 5);
      }
    }
  });
});

describe('the feet: a verse\'s threads leave from its own cell, in the order of their far ends', () => {
  it('footX puts a lone thread (fan 0) at the verse\'s centre and every fan inside the cell', () => {
    const cam = camAt(zMax);
    const v = Math.floor(CENTRE);
    const lo = geo.verseToX(cam, W, v), hi = geo.verseToX(cam, W, v + 1);
    expect(geo.footX(cam, W, v, 0)).toBeCloseTo((lo + hi) / 2, 6);
    for (const fan of [-0.5, -0.25, 0.25, 0.5]) {
      const x = geo.footX(cam, W, v, fan);
      expect(x).toBeGreaterThanOrEqual(lo);
      expect(x).toBeLessThanOrEqual(hi);
    }
    expect(geo.footX(cam, W, v, -0.5)).toBeLessThan(geo.footX(cam, W, v, 0.5));
  });

  it('on the asset\'s busiest verse the feet are distinct and ordered like the far ends; at fit they are the verse to the pixel', () => {
    // the busiest verse
    const count = new Uint16Array(TOTAL);
    for (let i = 0; i < graph.count; i++) { count[graph.from[i]]++; count[graph.to[i]]++; }
    let busiest = 0;
    for (let v = 1; v < TOTAL; v++) if (count[v] > count[busiest]) busiest = v;
    expect(count[busiest]).toBeGreaterThan(50);
    const { fanA, fanB } = dec.fansOf(graph);
    const cam = camAt(zMax, busiest + 0.5);
    const feet = [];
    for (let i = 0; i < graph.count; i++) {
      if (graph.from[i] === busiest) feet.push({ x: geo.footX(cam, W, busiest, fanA[i]), other: graph.to[i] });
      else if (graph.to[i] === busiest) feet.push({ x: geo.footX(cam, W, busiest, fanB[i]), other: graph.from[i] });
    }
    feet.sort((p, q) => p.x - q.x);
    for (let k = 1; k < feet.length; k++) {
      expect(feet[k].x).toBeGreaterThan(feet[k - 1].x);
      expect(feet[k].other).toBeGreaterThanOrEqual(feet[k - 1].other);
    }
    const spread = feet[feet.length - 1].x - feet[0].x;
    expect(spread).toBeGreaterThan(cam.ppv * 0.9);
    expect(spread).toBeLessThan(cam.ppv * 1.0001);
    const fit = camAt(1);
    expect(geo.footX(fit, W, busiest, 0.5) - geo.footX(fit, W, busiest, -0.5)).toBeLessThan(0.1);
  });
});

describe('the picker agrees with the drawn curve, on the asset, at rest and in the sky', () => {
  const { fanA, fanB } = dec.fansOf(graph);
  const inFrame = (view, p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= view.base;

  it('at 12x, 30x and the ceiling every sampled on-screen point of a crossing thread is picked: the nearest line passes within half a pixel, and the thread itself is named', () => {
    for (const zoom of [12, 30, zMax]) {
      const cam = camAt(zoom);
      const view = viewAt(cam);
      const list = pick.visibleArcs(graph, cam, view, 200000);
      expect(list.length).toBeGreaterThan(20);
      let tried = 0, named = 0;
      // most crossing threads at depth are fly-overs whose bodies are up in the
      // sky, so walk the list densely and stop after enough in-frame samples
      for (let n = 0; n < list.length && tried < 400; n += Math.max(1, Math.floor(list.length / 2000))) {
        const i = list[n];
        const x0 = geo.footX(cam, W, graph.from[i], fanA[i]), x1 = geo.footX(cam, W, graph.to[i], fanB[i]);
        const rx = (x1 - x0) / 2, cx = x0 + rx;
        if (!(rx > 1)) continue;
        const { A } = geo.arcShape(rx, view.squash);
        // points of the body at four heights of the frame, on either leg,
        // whichever the frame holds (the ellipse inverted: u = sqrt(1 - (h/A)^2))
        for (const share of [0.15, 0.4, 0.65, 0.9]) {
          const h = share * view.base;
          if (h >= A) continue;
          const u = Math.sqrt(1 - (h / A) * (h / A));
          for (const side of [-1, 1]) {
            const p = { x: cx + side * u * rx, y: view.base + (cam.y > 0 ? cam.y : 0) - h };
            if (!inFrame(view, p)) continue;
            tried++;
            const got = pick.pickArcs(graph, cam, view, p.x, p.y, 3, 8);
            expect(got.length, `zoom ${zoom} thread ${i} h ${share}`).toBeGreaterThan(0);
            expect(got[0].distance, `zoom ${zoom} thread ${i} h ${share}: the nearest line`).toBeLessThan(0.5);
            if (got.some((r) => r.index === i)) named++;
          }
        }
      }
      expect(tried, `zoom ${zoom}: on-screen samples`).toBeGreaterThan(30);
      // at the feet of a crowded passage several threads run within a pixel of
      // each other, so at 12x a sample may be nearer to a neighbour; at the
      // ceiling every thread is its own
      expect(named / tried, `zoom ${zoom}: samples that name their own thread (${named}/${tried})`).toBeGreaterThan(zoom === zMax ? 0.9 : 0.6);
    }
  });

  it('in the sky at 12x: three ceilings up, a testament-scale thread\'s body is drawn as a curve (not level) and picked there', () => {
    const cam = camAt(12);
    cam.y = 3 * CEIL;
    geo.clampCamera(cam, W, zMax, yf);
    expect(cam.y, 'the sky at 12x is at least three ceilings tall').toBe(3 * CEIL);
    const view = viewAt(cam);
    const list = pick.visibleArcs(graph, cam, view, 100000);
    let seen = 0, curved = 0;
    for (const i of list) {
      const span = Math.abs(graph.to[i] - graph.from[i]);
      if (span < 3000) continue;
      const x0 = geo.footX(cam, W, graph.from[i], fanA[i]), x1 = geo.footX(cam, W, graph.to[i], fanB[i]);
      const { A } = geo.arcShape((x1 - x0) / 2, SQUASH);
      // the body's points inside the frame
      for (let k = 1; k < 64; k++) {
        const x = (W * k) / 64;
        const y = view.base + cam.y - geo.arcHeightAt(x, x0, x1, A);
        if (y < 0 || y > view.base) continue;
        seen++;
        const got = pick.pickArcs(graph, cam, view, x, y, 3, 8);
        expect(got.length, `thread ${i} at x ${x}`).toBeGreaterThan(0);
        const slope = (geo.arcHeightAt(x + 4, x0, x1, A) - geo.arcHeightAt(x - 4, x0, x1, A)) / 8;
        if (Math.abs(slope) > 0.05) curved++;
        if (seen > 400) break;
      }
      if (seen > 400) break;
    }
    expect(seen).toBeGreaterThan(50);
    expect(curved / seen, 'the sky is curves with a direction, not a stack of level runs').toBeGreaterThan(0.8);
  });
});

describe('the camera: the sky is exactly as tall as the tallest apex, and a zoom holds the world under the pointer', () => {
  it('maxCamY is the canon thread\'s apex less the frame: 0 at fit, ~12 ceilings at 12x, huge at the ceiling', () => {
    const fit = camAt(1);
    expect(geo.maxCamY(fit, yf)).toBe(0);
    const c12 = camAt(12);
    const apex12 = (yf.maxSpan * c12.ppv * SQUASH) / 2;
    expect(geo.apexMaxPx(c12, yf)).toBeCloseTo(apex12, 6);
    expect(geo.maxCamY(c12, yf)).toBeCloseTo(apex12 - BASE, 6);
    expect(geo.maxCamY(c12, yf) / CEIL).toBeGreaterThan(8);
    expect(geo.maxCamY(camAt(zMax), yf) / CEIL).toBeGreaterThan(1000);
  });

  it('clampCamera holds y in [0, maxCamY]; without a y frame the camera is 1-D', () => {
    const cam = camAt(30);
    cam.y = 1e12; geo.clampCamera(cam, W, zMax, yf);
    expect(cam.y).toBeCloseTo(geo.maxCamY(cam, yf), 6);
    cam.y = -5; geo.clampCamera(cam, W, zMax, yf);
    expect(cam.y).toBe(0);
    cam.y = 300; geo.clampCamera(cam, W, zMax);
    expect(cam.y).toBe(0);
  });

  it('zoomAbout with an anchor y, from the sky, keeps the world height under the pointer; zooming out to fit closes the sky', () => {
    const cam = camAt(30);
    cam.y = 2 * CEIL; geo.clampCamera(cam, W, zMax, yf);
    const ay = BASE / 2;                       // the pointer, device px from the frame's top
    const worldH = BASE + cam.y - ay;          // height above the baseline under it
    geo.zoomAbout(cam, W, W / 2, 2, zMax, yf, ay);
    expect(BASE + cam.y - ay).toBeCloseTo(2 * worldH, 6);
    geo.zoomAbout(cam, W, W / 2, 0.5, zMax, yf, ay);
    expect(BASE + cam.y - ay).toBeCloseTo(worldH, 6);
    // at rest the baseline is sticky: a zoom in from y = 0 stays on the baseline
    cam.y = 0;
    geo.zoomAbout(cam, W, W / 2, 2, zMax, yf, ay);
    expect(cam.y).toBe(0);
    // and without an anchor y the height is kept and re-clamped: out to fit closes the sky
    cam.y = 100; geo.clampCamera(cam, W, zMax, yf);
    geo.zoomAbout(cam, W, W / 2, 1e-9, zMax, yf);
    expect(cam.y).toBe(0);
  });
});

describe('gestures: a drag moves y with a y frame; a wheel zoom in the sky holds the world under the cursor', () => {
  function pointerEvent(type, opts) {
    return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0, ...opts });
  }
  function attach(withFrame) {
    const root = document.createElement('div');
    root.className = 'sw-root';
    document.body.appendChild(root);
    const cam = camAt(zMax);
    const view = { W, H: 2 * BASE, DPR };
    attachWebGestures(root, {
      loc: (e) => ({ x: e.clientX, y: e.clientY }),
      dpr: () => DPR, cam: () => cam, view: () => view,
      handlers: () => ({ hover: vi.fn(), tap: vi.fn(), doubleTap: vi.fn() }),
      schedule: vi.fn(), maxZoom: () => zMax, clampCamera: geo.clampCamera, zoomAbout: geo.zoomAbout, xToVerse: geo.xToVerse,
      yFrame: withFrame ? () => yf : undefined,
    });
    return { root, cam };
  }

  it('a finger moving DOWN 60 CSS px raises the camera 120 device px, and back up returns it', () => {
    const { root, cam } = attach(true);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 400, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 160 }));
    expect(cam.y).toBe(120);
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 100 }));
    expect(cam.y).toBe(0);
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 400, clientY: 100 }));
  });

  it('a wheel zoom-out in the sky lowers the camera (the world point under the cursor stays put)', () => {
    const { root, cam } = attach(true);
    cam.y = 4 * CEIL; geo.clampCamera(cam, W, zMax, yf);
    const before = cam.y;
    root.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60, clientX: 400, clientY: 100 }));
    expect(cam.ppv).toBeLessThan(geo.fitPPV(cam, W) * zMax);
    expect(cam.y).toBeGreaterThan(0);
    expect(cam.y).toBeLessThan(before);
  });

  it('a pinch in the sky keeps the camera in the sky', () => {
    const { root, cam } = attach(true);
    cam.y = 4 * CEIL; geo.clampCamera(cam, W, zMax, yf);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 300, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 500, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 480, clientY: 100 }));
    expect(cam.y).toBeGreaterThan(0);
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 480, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 300, clientY: 100 }));
  });

  it('the same drag on a surface with no y frame leaves y at 0 (a My Web rail)', () => {
    const { root, cam } = attach(false);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 400, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 160 }));
    expect(cam.y || 0).toBe(0);
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 400, clientY: 160 }));
  });
});

/* ── the GLSL twin: transliterated and run against the JS ── */
describe('the GLSL arcShape / arcTau / arcAt ARE the JS: the twin transliterated and run', () => {
  function twinOf(glsl) {
    let js = glsl
      .replace(/const float (\w+) = ([0-9.]+);/g, 'const $1 = $2;')
      .replace(/vec2 arcShape\(([^)]*)\)/, (_, a) => `function arcShape(${a.replace(/float /g, '')})`)
      .replace(/float arcTau\(([^)]*)\)/, (_, a) => `function arcTau(${a.replace(/float /g, '')})`)
      .replace(/void arcAt\(([^)]*)\)/s, (_, a) => `function arcAt(${a.replace(/\s+/g, ' ').replace(/out (float|vec2) \w+,?/g, '').replace(/float /g, '').replace(/,\s*$/, '')})`)
      .replace(/\b(float|vec2) (\w+) =/g, 'let $2 =')
      .replace(/\b(sin|cos|acos|max|min|sqrt)\(/g, 'Math.$1(');
    js = js.replace(/(function arcAt\([^)]*\)\{)/, '$1 let x, h, tg;');
    js = js.replace(/(\n\}\s*)$/, '\n  return {x, h, tg};$1');
    js = js.replace(/\.x\b/g, '[0]').replace(/\.y\b/g, '[1]');
    const allowed = new Set(['const', 'function', 'arcShape', 'arcTau', 'arcAt', 'rx', 'squash', 'r', 's', 'let', 'return',
      'vec2', 'clamp', 'Math', 'max', 'min', 'sin', 'cos', 'acos', 'sqrt', 'x', 'left', 'right', 'if', 'tau', 'A', 'h', 'tg', 'ARC_PI', 'true', 'false']);
    const idents = js.replace(/\b\d+(\.\d*)?(e[-+]?\d+)?/g, ' ').match(/[A-Za-z_]\w*/g) || [];
    for (const id of idents) {
      if (!allowed.has(id)) {
        const at = js.indexOf(id);
        throw new Error(`the GLSL twin uses \`${id}\` (…${js.slice(Math.max(0, at - 40), at + 40)}…): extend the transliteration before trusting this pin`);
      }
    }
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const vec2 = (a, b) => [a, b];
    return new Function('clamp', 'vec2', js + '; return {arcShape, arcTau, arcAt};')(clamp, vec2);
  }
  const near = (got, want, what) => expect(Math.abs(got - want), what).toBeLessThanOrEqual(1e-5 * Math.max(1, Math.abs(want)));

  it('agrees with the JS to 1e-5 (relative) over 1,500 arcs x 33 parameters', () => {
    const twin = twinOf(geo.arcShapeGLSL);
    let s = 11;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 1500; i++) {
      const rx = 1 + r() * 600000, squash = 0.3 + r() * 1.9;
      const j = geo.arcShape(rx, squash), g = twin.arcShape(rx, squash);
      expect(g[0]).toBeCloseTo(j.R, 6); expect(g[1]).toBeCloseTo(j.A, 6);
      const left = r() * 500, right = left + 2 * rx, A = j.A;
      near(twin.arcTau(left + 1, left, right), geo.arcTauOf(left + 1, left, right), 'tau near the foot');
      for (let k = 0; k <= 32; k++) {
        const tau = (Math.PI * k) / 32;
        const want = geo.arcPointAt(tau, left, right, A);
        const got = twin.arcAt(tau, left, right, A);
        near(got.x, want.x, `x tau=${tau}`);
        near(got.h, want.h, `h tau=${tau}`);
        const nw = Math.hypot(want.tx + 1e-6, want.ty), ng = Math.hypot(got.tg[0] + 1e-6, got.tg[1]);
        near((got.tg[0] + 1e-6) / ng, (want.tx + 1e-6) / nw, `tx tau=${tau}`);
        near(got.tg[1] / ng, want.ty / nw, `ty tau=${tau}`);
      }
    }
  });

  it('BITES: forcing the twin\'s apex to the ceiling makes it disagree with the JS on a tall arc', () => {
    const needle = 'return vec2(r, r*s);';
    expect(geo.arcShapeGLSL).toContain(needle);
    const bitten = twinOf(geo.arcShapeGLSL.replace(needle, 'return vec2(r, min(r*s, 512.));'));
    const got = bitten.arcShape(4000, SQUASH), want = geo.arcShape(4000, SQUASH);
    expect(Math.abs(got[1] - want.A)).toBeGreaterThan(1);
  });

  it('BITES: a GLSL built-in the transliteration does not know is refused, not miscompared', () => {
    expect(() => twinOf(geo.arcShapeGLSL.replace('acos(', 'smoothstep(0., 1., '))).toThrow(/smoothstep/);
  });
});
