// @ts-nocheck
/**
 * The lens (lanes/myweb/out/structure-law.md, landing 10). Corbin, 2026-09-21:
 * every line drawn, and "someway somehow navigate them and understand them".
 * Past the overview, with nothing tapped, the chapter under the frame's
 * centre is at full ink and every other thread keeps LENS_CONTEXT of its
 * alpha: still drawn, still tappable, still counted, never summed into a
 * wall. Panning slides the lens; a tap takes over; Reset clears.
 *
 * Every case reads the exports off the module objects, so this file LOADS on
 * the tree before the lens and is RED there for the lens's reason.
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

const DPR = 2, W = 800 * DPR;
const psalm107 = (() => {
  for (let ci = 0; ci < graph.chapters.length; ci++) {
    const ch = graph.chapters[ci];
    if (graph.books[ch[0]].id.startsWith('psalms') && ch[1] === 107) return { ci, ch };
  }
  throw new Error('Psalm 107 missing from the asset');
})();
const CENTRE = psalm107.ch[2] + psalm107.ch[3] / 2;
function camAt(zoom, x = CENTRE) {
  const cam = geo.createCamera(graph.total);
  cam.ppv = geo.fitPPV(cam, W) * zoom;
  cam.x = x;
  return cam;
}

describe('the lens exists: one taste number, one range, one shader uniform', () => {
  it('exports LENS_CONTEXT (0.35, between 0 and 1) and pick.lensRange', () => {
    expect(geo.LENS_CONTEXT).toBe(0.35);
    expect(typeof pick.lensRange).toBe('function');
  });

  it('the vertex shader reads uLens / uLensDim and dims by them only while nothing is tapped', () => {
    expect(SHADER_SOURCE.vertex).toMatch(/uniform vec2\s+uLens;/);
    expect(SHADER_SOURCE.vertex).toMatch(/uniform float uLensDim;/);
    expect(SHADER_SOURCE.vertex).toMatch(/dim \*= mix\(1\., mix\(uLensDim, 1\., max\(la, lb\)\), lensOn\*\(1\. - focusing\)\);/);
  });
});

describe('the count at each foot is information, lens-dimmed like everything else (landing 11)', () => {
  it('geometry.lensDimFor: 1 with no lens, 1 for a cell touching the lens, LENS_CONTEXT for a cell outside it', () => {
    expect(typeof geo.lensDimFor).toBe('function');
    const lens = pick.chapterRange(graph, psalm107.ci);
    expect(geo.lensDimFor(lens[0] - 10, lens[0] - 1, null)).toBe(1);
    expect(geo.lensDimFor(lens[0], lens[1], lens)).toBe(1);
    expect(geo.lensDimFor(lens[1], lens[1] + 40, lens)).toBe(1);
    expect(geo.lensDimFor(lens[0] - 40, lens[0], lens)).toBe(1);
    expect(geo.lensDimFor(lens[0] - 40, lens[0] - 1, lens)).toBe(geo.LENS_CONTEXT);
    expect(geo.lensDimFor(lens[1] + 1, lens[1] + 3, lens)).toBe(geo.LENS_CONTEXT);
  });

  it('the pills count every thread at a cell and hide none: at 12x the cells carry thousands of feet, hidden 0', () => {
    const cam = camAt(12);
    const view = { width: W, density: 'famous' };
    const cells = pick.footBundles(graph, cam, view, DPR);
    expect(cells.length).toBeGreaterThan(3);
    for (const c of cells) expect(c.hidden).toBe(0);
    const total = cells.reduce((s, c) => s + c.drawn, 0);
    expect(total).toBeGreaterThan(1000);
  });
});

describe('the lens is the chapter under the frame\'s centre, past the overview only', () => {
  it('is null at fit and below 6x; at 6x and past it is Psalm 107\'s own range when the frame is centred there', () => {
    expect(pick.lensRange(graph, camAt(1), W)).toBeNull();
    expect(pick.lensRange(graph, camAt(5.9), W)).toBeNull();
    const [lo, hi] = pick.chapterRange(graph, psalm107.ci);
    for (const zoom of [6, 12, 30, 400, geo.maxZoomFor(graph.total, W / DPR)]) {
      expect(pick.lensRange(graph, camAt(zoom), W), `zoom ${zoom}`).toEqual([lo, hi]);
    }
  });

  it('slides with the pan: centred on the next chapter it is that chapter; centred on a verse of the previous one, that one', () => {
    const next = graph.chapters[psalm107.ci + 1], prev = graph.chapters[psalm107.ci - 1];
    expect(pick.lensRange(graph, camAt(30, next[2] + 2), W)).toEqual(pick.chapterRange(graph, psalm107.ci + 1));
    expect(pick.lensRange(graph, camAt(30, prev[2] + prev[3] - 1 + 0.5), W)).toEqual(pick.chapterRange(graph, psalm107.ci - 1));
  });

  it('holds whatever the camera\'s height: the lens is a range of verses, not of pixels', () => {
    const cam = camAt(12);
    cam.y = 900;
    expect(pick.lensRange(graph, cam, W)).toEqual(pick.chapterRange(graph, psalm107.ci));
  });

  it('is null for an empty graph or a frame with no width', () => {
    expect(pick.lensRange({ count: 0 }, camAt(12), W)).toBeNull();
    expect(pick.lensRange(graph, camAt(12), 0)).toBeNull();
  });

  it('hides nothing: the picker\'s drawn set at 12x is the same with the lens as without', () => {
    const cam = camAt(12);
    const view = { width: W, localize: geo.localizeFactor(12), density: 'famous' };
    const without = pick.visibleArcs(graph, cam, view, 1e9);
    const lens = pick.lensRange(graph, cam, W);
    const withLens = pick.visibleArcs(graph, cam, Object.assign({}, view, { lens }), 1e9);
    expect(withLens.length).toBe(without.length);
    expect(without.length).toBeGreaterThan(10000);
  });
});
