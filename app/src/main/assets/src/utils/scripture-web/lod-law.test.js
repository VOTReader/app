// @ts-nocheck
/**
 * The density law, part 1: level of detail (lanes/myweb/out/density-law.md
 * section 1, 2026-09-21). Corbin, on a Psalm 107 screenshot at mid zoom: "I
 * don't want any smear ... fully granular, zoom all the way in".
 *
 * Measured on the shipped asset before the law: at 12x on Psalm 107 (phone
 * landscape) 13,295 anchored threads and 8,635 fly-overs cross the frame and
 * the shader draws every one. The law gives each thread a REVEAL level from
 * an ink budget per foot cell (vote order) and each fly-over group one
 * REPRESENTATIVE, and the shader and the hit test apply the same table.
 *
 * Every case reads the new exports off the module objects, so this file
 * LOADS on the base tree (0e5749c0) and is RED there for the law's reason.
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

// The phone-landscape frame the memo's numbers were taken on (CSS px).
const W_CSS = 800, DPR = 2, W = W_CSS * DPR;
const psalm107 = (() => {
  for (let ci = 0; ci < graph.chapters.length; ci++) {
    const ch = graph.chapters[ci];
    if (graph.books[ch[0]].id.startsWith('psalms') && ch[1] === 107) return ch;
  }
  throw new Error('Psalm 107 missing from the asset');
})();
const CENTRE = psalm107[2] + psalm107[3] / 2;

/** A camera on Psalm 107 at `zoom` x fit on the phone frame. */
function camAt(zoom) {
  const cam = geo.createCamera(graph.total);
  cam.ppv = geo.fitPPV(cam, W) * zoom;
  cam.x = CENTRE;
  return cam;
}
const levelAt = (cam) => geo.levelOf(cam.ppv / DPR, graph.total);

/** Threads the shader's OWN anchoring test calls anchored / fly-over for this camera, split. */
function crossing(cam, density) {
  const half = W / 2;
  const anchored = [], fly = [];
  for (const b of graph.buckets) {
    const end = b.off + dec.bucketDrawCount(b, density);
    for (let i = b.off; i < end; i++) {
      const x0 = (graph.from[i] - cam.x) * cam.ppv + half;
      const x1 = (graph.to[i] - cam.x) * cam.ppv + half;
      if (x1 < 0 || x0 > W) continue;
      (geo.arcAnchored(x0, x1, W) ? anchored : fly).push(i);
    }
  }
  return { anchored, fly };
}

/** What the law shows of a crossing set at this camera, by the JS twin of the shader's test. */
function shown(cam, density, list, anchoredFlag) {
  const lod = dec.lodOf(graph).lod;
  const level = levelAt(cam);
  const ess = density === 'essential';
  return list.filter((i) => geo.lodShown(lod[i], ess, anchoredFlag, level));
}

describe('the LOD law exists and is one table for both sides', () => {
  it('exports the level, the table and the twin', () => {
    expect(typeof geo.levelOf).toBe('function');
    expect(typeof geo.lodShown).toBe('function');
    expect(typeof dec.lodOf).toBe('function');
    expect(typeof geo.lodGLSL).toBe('string');
  });

  it('the level is width-independent at the zoom ceiling', () => {
    // maxZoomFor puts one verse at PPV_MAX_CSS on every frame, so the ceiling
    // level is one number: log2(44 * total / 800).
    for (const wCss of [360, 800, 1920]) {
      const z = geo.maxZoomFor(graph.total, wCss);
      const ppvCss = (z * wCss) / graph.total;
      expect(geo.levelOf(ppvCss, graph.total)).toBeCloseTo(Math.log2((geo.PPV_MAX_CSS * graph.total) / geo.LOD_REF_CSS), 6);
    }
  });

  it('the vertex shader inlines the GLSL twin and reads the table', () => {
    expect(SHADER_SOURCE.vertex).toContain(geo.lodGLSL);
    expect(SHADER_SOURCE.vertex).toMatch(/in uint aLod;/);
    expect(SHADER_SOURCE.vertex).toMatch(/uniform float uLevel/);
    expect(SHADER_SOURCE.vertex).toMatch(/uniform float uEssential/);
  });

  it('the table is memoized per graph and packs both densities', () => {
    const a = dec.lodOf(graph), b = dec.lodOf(graph);
    expect(a).toBe(b);
    expect(a.lod).toBeInstanceOf(Uint32Array);
    expect(a.lod.length).toBe(graph.count);
  });
});

describe('no smear: the anchored budget at every zoom', () => {
  it('Psalm 107 at 12x draws a few dozen anchored threads, not thirteen thousand', () => {
    const cam = camAt(12);
    const { anchored } = crossing(cam, 'famous');
    expect(anchored.length).toBeGreaterThan(10000);          // the wall, before
    const drawn = shown(cam, 'famous', anchored, 1);
    expect(drawn.length).toBeGreaterThan(20);                // still a web
    expect(drawn.length).toBeLessThan(600);                  // not a wall
  });

  it('at fit the overview is a legible dome of the strongest threads', () => {
    const cam = camAt(1);
    const { anchored } = crossing(cam, 'famous');
    const drawn = shown(cam, 'famous', anchored, 1);
    expect(drawn.length).toBeGreaterThan(150);
    expect(drawn.length).toBeLessThan(4000);
  });

  it('at the ceiling EVERY anchored thread draws - fully granular', () => {
    const z = geo.maxZoomFor(graph.total, W_CSS);
    const cam = camAt(z);
    for (const density of ['famous', 'essential']) {
      const { anchored } = crossing(cam, density);
      expect(anchored.length).toBeGreaterThan(10);
      expect(shown(cam, density, anchored, 1).length).toBe(anchored.length);
    }
  });

  it('visibility never decreases with zoom: drawn(L) is a subset of drawn(L + step)', () => {
    const lod = dec.lodOf(graph).lod;
    const { anchored } = crossing(camAt(6), 'famous');
    for (let L = -2; L < 11; L += 0.5) {
      const lo = new Set(anchored.filter((i) => geo.lodShown(lod[i], false, 1, L)));
      const hi = anchored.filter((i) => geo.lodShown(lod[i], false, 1, L + 0.5));
      for (const i of lo) expect(hi.includes(i)).toBe(true);
    }
  });

  it('Essential still means something: its table admits only >= 20-vote threads', () => {
    const lod = dec.lodOf(graph).lod;
    const ceiling = geo.levelOf(geo.PPV_MAX_CSS, graph.total);
    let weak = 0, strongShown = 0;
    for (let i = 0; i < graph.count; i++) {
      if (graph.votes[i] < 20) {
        // a weak thread is revealed in the Essential table only AT the ceiling cap
        if (geo.lodShown(lod[i], true, 1, ceiling - 0.2)) weak++;
      } else if (geo.lodShown(lod[i], true, 1, 2)) strongShown++;
    }
    expect(weak).toBe(0);
    expect(strongShown).toBeGreaterThan(100);
  });

  it('a vote-ordered fill: the first threads revealed at a foot cell are its strongest', () => {
    // At level 0 the fit frame is two cells; every thread revealed at level 0
    // must outrank (votes) any hidden thread of the same cell of a longer or
    // equal length... approximated: the mean votes of the revealed set beats
    // the mean of the hidden set by a wide margin.
    const cam = camAt(1);
    const { anchored } = crossing(cam, 'famous');
    const drawn = new Set(shown(cam, 'famous', anchored, 1));
    let sumIn = 0, nIn = 0, sumOut = 0, nOut = 0;
    for (const i of anchored) {
      if (drawn.has(i)) { sumIn += graph.votes[i]; nIn++; } else { sumOut += graph.votes[i]; nOut++; }
    }
    expect(sumIn / nIn).toBeGreaterThan(3 * (sumOut / nOut));
  });
});

describe('fly-overs: one representative per (span cell, centre cell) group', () => {
  it('Psalm 107 at 12x shows a few dozen fly-over representatives of 8,000', () => {
    const cam = camAt(12);
    const { fly } = crossing(cam, 'famous');
    expect(fly.length).toBeGreaterThan(5000);
    const reps = shown(cam, 'famous', fly, 0);
    expect(reps.length).toBeGreaterThan(5);
    expect(reps.length).toBeLessThan(120);
  });

  it('a representative is the strongest of its group, and the Essential rep has >= 20 votes', () => {
    const { lod, groupOf } = dec.lodOf(graph);
    expect(groupOf).toBeInstanceOf(Uint32Array);
    const bestF = new Map(), bestE = new Map();
    for (let i = 0; i < graph.count; i++) {
      const k = groupOf[i], v = graph.votes[i];
      if (!bestF.has(k) || v > graph.votes[bestF.get(k)]) bestF.set(k, i);
      if (v >= 20 && (!bestE.has(k) || v > graph.votes[bestE.get(k)])) bestE.set(k, i);
    }
    for (let i = 0; i < graph.count; i++) {
      const repF = geo.lodShown(lod[i], false, 0, 0), repE = geo.lodShown(lod[i], true, 0, 0);
      if (repF) expect(graph.votes[i]).toBe(graph.votes[bestF.get(groupOf[i])]);
      if (repE) { expect(graph.votes[i]).toBeGreaterThanOrEqual(20); expect(graph.votes[i]).toBe(graph.votes[bestE.get(groupOf[i])]); }
    }
    expect(bestF.size).toBeGreaterThan(1000);
  });
});

describe('visible equals pickable', () => {
  const view = (cam, density, extra) => Object.assign({
    width: W, base: 500, ceil: 480, squash: geo.squashFactor(480, W),
    localize: geo.localizeFactor(cam.ppv / geo.fitPPV(cam, W)), density,
    level: levelAt(cam),
  }, extra);

  it('visibleArcs with a level returns exactly the shader-drawn set', () => {
    const cam = camAt(12);
    const { anchored, fly } = crossing(cam, 'famous');
    const want = new Set([...shown(cam, 'famous', anchored, 1), ...shown(cam, 'famous', fly, 0)]);
    const got = pick.visibleArcs(graph, cam, view(cam, 'famous'), 1e9);
    expect(new Set(got)).toEqual(want);
  });

  it('a hidden thread is not picked at its own apex, but the tapped one always is', () => {
    const cam = camAt(12);
    const v = view(cam, 'famous');
    const { anchored } = crossing(cam, 'famous');
    const drawn = new Set(shown(cam, 'famous', anchored, 1));
    const hidden = anchored.find((i) => !drawn.has(i) && Math.abs(graph.to[i] - graph.from[i]) > 4);
    expect(hidden).toBeDefined();
    const ends = pick.threadEnds(graph, cam, Object.assign({}, v, { level: undefined }), hidden);
    // apex of the hidden thread, from the law itself (no LOD in this view)
    const x0 = geo.verseToX(cam, W, graph.from[hidden]), x1 = geo.verseToX(cam, W, graph.to[hidden]);
    const mid = (x0 + x1) / 2;
    const { fanA, fanB } = dec.fansOf(graph);
    const rx = (x1 - x0) / 2;
    const sl = geo.spanLogOf(Math.abs(graph.to[hidden] - graph.from[hidden]), graph.total);
    const sL = geo.arcShape(rx, v.ceil, v.squash, v.localize, sl, fanA[hidden]);
    const sR = geo.arcShape(rx, v.ceil, v.squash, v.localize, sl, fanB[hidden]);
    const h = geo.arcHeightAt(mid, Math.min(x0, x1), Math.max(x0, x1), sL.R, sR.R, sL.A, geo.DOME * v.localize);
    const py = v.base - h;
    expect(ends).toBeTruthy();
    const without = pick.pickArcs(graph, cam, v, mid, py, 6, 8).map((r) => r.index);
    expect(without).not.toContain(hidden);
    const withFocus = pick.pickArcs(graph, cam, Object.assign({}, v, { focusArc: hidden }), mid, py, 6, 8).map((r) => r.index);
    expect(withFocus).toContain(hidden);
  });

  it('countAnchored with a level counts the drawn anchored set, so the crowding law sees what the eye sees', () => {
    const cam = camAt(12);
    const all = pick.countAnchored(graph, cam, W, 'famous');
    const drawn = pick.countAnchored(graph, cam, W, 'famous', levelAt(cam));
    expect(all).toBeGreaterThan(10000);
    // the same population countAnchored walks: anchored by the margin law,
    // crossing the frame or not (a foot 24 px outside still anchors)
    const lod = dec.lodOf(graph).lod;
    let want = 0;
    for (let i = 0; i < graph.count; i++) {
      const x0 = geo.verseToX(cam, W, graph.from[i]), x1 = geo.verseToX(cam, W, graph.to[i]);
      if (geo.arcAnchored(x0, x1, W) && geo.lodShown(lod[i], false, 1, levelAt(cam))) want++;
    }
    expect(drawn).toBe(want);
    expect(drawn).toBeLessThan(600);
  });
});
