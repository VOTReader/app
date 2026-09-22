// @ts-nocheck
/**
 * The density law, part 3: strata (lanes/myweb/out/density-law.md section
 * 3, 2026-09-21). Corbin: "various 'atmospheres' and 'layers' when you're
 * panned up so everything stays navigable". Panned up at the ceiling the
 * fly-over representatives stood in ONE level band under the chrome (the
 * l2c look, 2026-09-21 20:0x). Now a thread whose feet have both left the
 * frame rises into its stratum - the asset's span buckets: nearby, book-,
 * testament-, canon-scale - by a LIFT the shader and the hit test share; a
 * thread with a foot in the frame keeps today's arch to the pixel.
 *
 * Reads the new exports off the module objects: loads on the landing-2 tree
 * and is RED there for the law's reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as geo from './geometry.js';
import * as dec from './decode.js';
import * as pick from './pick.js';
import { SHADER_SOURCE } from '../../ui/scripture-web/web-renderer.js';

const here = dirname(fileURLToPath(import.meta.url));
const ASSET = resolve(here, '../../data/scripture-web-data.js');
const graph = dec.decodeGraph(runInNewContext(readFileSync(ASSET, 'utf8') + ';SCRIPTURE_WEB_DATA', {}));
const W_CSS = 800, DPR = 2, W = W_CSS * DPR, BASE = 520, CEIL = BASE * 0.985;
const TOTAL = graph.total;
const psalm107 = graph.chapters.find((ch) => graph.books[ch[0]].id.startsWith('psalms') && ch[1] === 107);
const CENTRE = psalm107[2] + psalm107[3] / 2;
function camAt(zoom) {
  const cam = geo.createCamera(TOTAL);
  cam.ppv = geo.fitPPV(cam, W) * zoom;
  cam.x = CENTRE;
  return cam;
}
const viewAt = (cam, extra) => Object.assign({
  width: W, base: BASE, ceil: CEIL, squash: geo.squashFactor(CEIL, W),
  localize: geo.localizeFactor(cam.ppv / geo.fitPPV(cam, W)), density: 'famous',
  level: geo.levelOf(cam.ppv / DPR, TOTAL), inset: 240,
}, extra);

describe('the lift law exists, in both languages', () => {
  it('exports', () => {
    expect(typeof geo.strataLift).toBe('function');
    expect(typeof geo.stratumOf).toBe('function');
    expect(typeof geo.strataGLSL).toBe('string');
    expect(geo.STRATA_BOUNDS).toEqual([50, 500, 5000]);      // the asset's span buckets
    expect(geo.BAND).toBe(0.35);
    expect(geo.STRATA_NAMES.length).toBe(4);
  });
  it('the vertex shader inlines the twin and lifts the drawn height by it', () => {
    expect(SHADER_SOURCE.vertex).toContain(geo.strataGLSL);
    expect(SHADER_SOURCE.vertex).toMatch(/float lift = strataLift\(/);
    expect(SHADER_SOURCE.vertex).toMatch(/uBase \+ uCamY - hgt - lift/);
  });
});

describe('the lift: only as the feet leave, by stratum, never at the overview', () => {
  it('is 0 while a foot is within the frame (or its margin), at every localize', () => {
    for (const loc of [0, 0.5, 1]) {
      expect(geo.strataLift(10000, TOTAL, -5000, 100, W, CEIL, loc)).toBe(0);
      expect(geo.strataLift(10000, TOTAL, W - 1, 20000, W, CEIL, loc)).toBe(0);
      expect(geo.strataLift(10000, TOTAL, -geo.FLYOVER_MARGIN, 20000, W, CEIL, loc)).toBe(0);
    }
  });
  it('is 0 at the overview whatever the feet', () => {
    expect(geo.strataLift(20000, TOTAL, -9 * W, 9 * W, W, CEIL, 0)).toBe(0);
  });
  it('rises with the stratum: nearby < book < testament < canon, and tops out at (3 + 0.8) BAND ceil', () => {
    const far = (span) => geo.strataLift(span, TOTAL, -2 * W, 3 * W, W, CEIL, 1);
    const lifts = [far(10), far(100), far(1000), far(10000)];
    for (let i = 1; i < lifts.length; i++) expect(lifts[i]).toBeGreaterThan(lifts[i - 1]);
    expect(far(1)).toBe(0);                                              // stratum 0, fraction 0
    expect(far(TOTAL)).toBeCloseTo(geo.STRATA_LIFT_MAX * geo.BAND * CEIL, 6);
    expect(geo.stratumOf(49)).toBe(0); expect(geo.stratumOf(50)).toBe(1);
    expect(geo.stratumOf(4999)).toBe(2); expect(geo.stratumOf(5000)).toBe(3);
  });
  it('is smooth in how far the nearer foot is outside: 0+ at the margin, full a frame away', () => {
    const at = (d) => geo.strataLift(1000, TOTAL, -geo.FLYOVER_MARGIN - d, 5 * W, W, CEIL, 1);
    expect(at(1)).toBeGreaterThan(0);
    expect(at(1)).toBeLessThan(at(W / 4));
    expect(at(W / 4)).toBeLessThan(at(W / 2));
    expect(at(W)).toBeCloseTo(at(2 * W), 6);
  });
  it('scales with localize, so 6x and under is untouched', () => {
    expect(geo.strataLift(1000, TOTAL, -2 * W, 3 * W, W, CEIL, 0.5))
      .toBeCloseTo(geo.strataLift(1000, TOTAL, -2 * W, 3 * W, W, CEIL, 1) / 2, 6);
  });
});

describe('the sky grows by the top stratum, and the picker follows the lifted body', () => {
  it('maxCamY at the ceiling is the old top plus STRATA_LIFT_MAX x BAND x ceil', () => {
    const cam = camAt(geo.maxZoomFor(TOTAL, W_CSS));
    const yf = { base: BASE, ceil: CEIL, squash: geo.squashFactor(CEIL, W), maxSpan: dec.maxSpanOf(graph) };
    const localize = geo.localizeFactor(cam.ppv / geo.fitPPV(cam, W));
    const { A } = geo.arcShape((yf.maxSpan * cam.ppv) / 2, CEIL, yf.squash, localize, geo.spanLogOf(yf.maxSpan, TOTAL));
    const before = A * (1 + geo.DOME * localize) - BASE;
    expect(geo.maxCamY(cam, W, yf)).toBeCloseTo(before + geo.STRATA_LIFT_MAX * geo.BAND * CEIL * localize, 4);
    // and at the overview still 0: nothing to pan
    expect(geo.maxCamY(camAt(1), W, yf)).toBe(0);
  });

  it('panned up at the ceiling, a representative is picked on its LIFTED body and not where it used to be', () => {
    const cam = camAt(geo.maxZoomFor(TOTAL, W_CSS));
    const yf = { base: BASE, ceil: CEIL, squash: geo.squashFactor(CEIL, W), maxSpan: dec.maxSpanOf(graph) };
    cam.y = geo.maxCamY(cam, W, yf);
    const view = viewAt(cam);
    const bundles = pick.flyBundles(graph, cam, view);
    let tried = 0, hit = 0;
    for (const b of bundles.values()) {
      if (b.rep < 0) continue;
      const x0 = geo.verseToX(cam, W, graph.from[b.rep]), x1 = geo.verseToX(cam, W, graph.to[b.rep]);
      const lift = geo.strataLift(Math.abs(graph.to[b.rep] - graph.from[b.rep]), TOTAL, x0, x1, W, CEIL, view.localize);
      if (!(lift > 20)) continue;
      const at = pick.bodyMidpoint(graph, cam, view, b.rep, 0);
      if (!at) continue;
      tried++;
      const found = pick.pickArcs(graph, cam, view, at.x, at.y, 3, 8).map((r) => r.index);
      if (found.includes(b.rep)) hit++;
      // where the body stood before the lift: not this thread any more
      const stale = pick.pickArcs(graph, cam, view, at.x, at.y + lift, 3, 8).map((r) => r.index);
      expect(stale).not.toContain(b.rep);
    }
    expect(tried).toBeGreaterThan(3);
    expect(hit).toBe(tried);
  });

  it('the fly-over counts per stratum, for the legend', () => {
    const cam = camAt(30);
    const view = viewAt(cam);
    const rows = pick.strataCounts(graph, cam, view);
    expect(rows.length).toBe(4);
    const cross = rows.reduce((n, r) => n + r.cross, 0);
    const bundles = pick.flyBundles(graph, cam, view);
    expect(cross).toBe([...bundles.values()].reduce((n, b) => n + b.count, 0));
    expect(rows.reduce((n, r) => n + r.shown, 0)).toBe([...bundles.values()].filter((b) => b.rep >= 0).length);
    expect(rows[3].name).toBe(geo.STRATA_NAMES[3]);
  });
});
