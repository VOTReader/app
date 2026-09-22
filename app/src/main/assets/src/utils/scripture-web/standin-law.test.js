// @ts-nocheck
/**
 * The density law, part 2b: STAND-INS (the refuter's finding 3c, 2026-09-21,
 * taken as landing 5 at the hub's word). A fly-over group draws its
 * strongest member as representative - but the representative's own span
 * may not cross this frame while 2,344 threads of its group do (18 of 73
 * groups at the ceiling on Psalm 107): a bundle with no line and no badge.
 * Now such a group's strongest CROSSING member stands in for the frame: the
 * screen hands the shader up to STANDIN_MAX indices per frame (uStandIn),
 * the picker honours the same list, and the badge rides the stand-in.
 *
 * Reads the new exports off the module objects: loads on landing 4's tree
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
const graph = dec.decodeGraph(runInNewContext(readFileSync(resolve(here, '../../data/scripture-web-data.js'), 'utf8') + ';SCRIPTURE_WEB_DATA', {}));
const W_CSS = 800, DPR = 2, W = W_CSS * DPR, BASE = 520, CEIL = 512;
const psalm107 = graph.chapters.find((ch) => graph.books[ch[0]].id.startsWith('psalms') && ch[1] === 107);
const CENTRE = psalm107[2] + psalm107[3] / 2;
function camAt(zoom) {
  const cam = geo.createCamera(graph.total);
  cam.ppv = geo.fitPPV(cam, W) * zoom;
  cam.x = CENTRE;
  return cam;
}
const viewAt = (cam, extra) => Object.assign({
  width: W, base: BASE, ceil: CEIL, squash: geo.squashFactor(CEIL, W),
  localize: geo.localizeFactor(cam.ppv / geo.fitPPV(cam, W)), density: 'famous',
  level: geo.levelOf(cam.ppv / DPR, graph.total), inset: 240,
}, extra);
const crossesUnanchored = (cam, i) => {
  const x0 = geo.verseToX(cam, W, graph.from[i]), x1 = geo.verseToX(cam, W, graph.to[i]);
  return !(x1 < 0 || x0 > W) && !geo.arcAnchored(x0, x1, W);
};

describe('a group whose representative is off the frame gets a stand-in', () => {
  it('exports', () => {
    expect(typeof pick.standInsFor).toBe('function');
    expect(geo.STANDIN_MAX).toBeGreaterThanOrEqual(16);
    expect(SHADER_SOURCE.vertex).toMatch(/uniform float uStandIn\[/);
    expect(SHADER_SOURCE.vertex).toMatch(/standIn/);
  });

  it('flyBundles names each rep-less group\'s strongest crossing member; standInsFor lists them strongest-count first, capped', () => {
    const cam = camAt(geo.maxZoomFor(graph.total, W_CSS));
    const view = viewAt(cam);
    const bundles = pick.flyBundles(graph, cam, view);
    const repless = [...bundles.values()].filter((b) => b.rep < 0);
    expect(repless.length).toBeGreaterThan(5);                       // the hole: 18 of 73 at the ceiling
    const { groupOf } = dec.lodOf(graph);
    for (const b of repless) {
      expect(b.standIn).toBeGreaterThanOrEqual(0);
      expect(groupOf[b.standIn]).toBe(b.key);
      expect(crossesUnanchored(cam, b.standIn)).toBe(true);
      // the strongest crossing member of its group
      for (let i = 0; i < graph.count; i++) {
        if (groupOf[i] !== b.key || !crossesUnanchored(cam, i)) continue;
        expect(graph.votes[i]).toBeLessThanOrEqual(graph.votes[b.standIn]);
      }
    }
    for (const b of bundles.values()) if (b.rep >= 0) expect(b.standIn).toBe(-1);
    const list = pick.standInsFor(bundles);
    expect(list.length).toBe(Math.min(repless.length, geo.STANDIN_MAX));
    for (let i = 1; i < list.length; i++) {
      expect(bundles.get(groupOf[list[i]]).count).toBeLessThanOrEqual(bundles.get(groupOf[list[i - 1]]).count);
    }
  });

  it('the picker draws the stand-ins: visibleArcs with view.standIns includes each, and only reps otherwise', () => {
    const cam = camAt(12);
    const view = viewAt(cam);
    const bundles = pick.flyBundles(graph, cam, view);
    const standIns = pick.standInsFor(bundles);
    expect(standIns.length).toBeGreaterThan(3);
    const without = new Set(pick.visibleArcs(graph, cam, view, 1e9));
    for (const i of standIns) expect(without.has(i)).toBe(false);
    const withThem = new Set(pick.visibleArcs(graph, cam, Object.assign({}, view, { standIns }), 1e9));
    for (const i of standIns) expect(withThem.has(i)).toBe(true);
    expect(withThem.size).toBe(without.size + standIns.length);
  });

  it('after the stand-ins, every crossing fly-over group with 2+ members has a drawn line to carry its badge', () => {
    for (const zoom of [12, geo.maxZoomFor(graph.total, W_CSS)]) {
      const cam = camAt(zoom);
      const view = viewAt(cam);
      const bundles = pick.flyBundles(graph, cam, view);
      const standIns = new Set(pick.standInsFor(bundles));
      let unmarked = 0;
      for (const b of bundles.values()) if (b.rep < 0 && !standIns.has(b.standIn)) unmarked++;
      expect(unmarked).toBe(0);
    }
  });
});
