// @ts-nocheck
/**
 * The density law: the refuter's three findings (out/refuter-density.md,
 * 2026-09-21 20:35, Opus 5 max told to refute w-sw-density-l3), each RED on
 * that tree for the finding's reason and green with its fix.
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
const graph = dec.decodeGraph(runInNewContext(readFileSync(resolve(here, '../../data/scripture-web-data.js'), 'utf8') + ';SCRIPTURE_WEB_DATA', {}));
const W_CSS = 800, DPR = 2, W = W_CSS * DPR;
const psalm107 = graph.chapters.find((ch) => graph.books[ch[0]].id.startsWith('psalms') && ch[1] === 107);
const CENTRE = psalm107[2] + psalm107[3] / 2;
function camAt(zoom) {
  const cam = geo.createCamera(graph.total);
  cam.ppv = geo.fitPPV(cam, W) * zoom;
  cam.x = CENTRE;
  return cam;
}
const viewAt = (cam) => ({
  width: W, base: 520, ceil: 512, squash: geo.squashFactor(512, W),
  localize: geo.localizeFactor(cam.ppv / geo.fitPPV(cam, W)), density: 'famous',
  level: geo.levelOf(cam.ppv / DPR, graph.total),
});

describe('refuter bullet 1: the hover override', () => {
  it('a hovered thread is not drawn into existence: the shader shows lodShown | spot | pair, nothing the picker cannot see', () => {
    // thread #89 at 12x is anchored and law-hidden (p3-repro.mjs); a hover that
    // outlived a wheel zoom-out kept it on screen while pickArcs could not see it
    expect(SHADER_SOURCE.vertex).toMatch(/float shown = max\(lodShown\(.*\), max\(spot, pair\)\);/);
    expect(SHADER_SOURCE.vertex).not.toMatch(/max\(max\(spot, pair\), hovered\)/);
  });
});

describe('refuter bullet 3a: a badge and the sheet it opens agree, at the frame edge too', () => {
  it('every cell: the groups\' counts sum to hidden + drawn and their hidden to hidden', () => {
    for (const zoom of [12, 400]) {
      const cam = camAt(zoom);
      const view = viewAt(cam);
      const cells = pick.footBundles(graph, cam, view, DPR);
      expect(cells.length).toBeGreaterThan(2);
      for (const cell of cells) {
        const groups = pick.bundleGroups(graph, cam, view, cell.lo, cell.hi);
        const count = groups.reduce((n, grp) => n + grp.count, 0);
        const hidden = groups.reduce((n, grp) => n + grp.hidden, 0);
        expect(count, `cell ${cell.lo}-${cell.hi} at ${zoom}x`).toBe(cell.hidden + cell.drawn);
        expect(hidden, `cell ${cell.lo}-${cell.hi} at ${zoom}x`).toBe(cell.hidden);
      }
    }
  });
});

