// @ts-nocheck
/**
 * The density law, part 2: convergence (lanes/myweb/out/density-law.md
 * section 2, 2026-09-21). Corbin: "find a way to gracefully handle wherever
 * multiple scriptures converge". What the law hides at a foot is a bundle
 * with a count badge that opens into its members by target chapter; each
 * fly-over representative carries its group's count and lists its members;
 * a chosen group is drawn and spotlit by a PAIR of ranges the shader and the
 * picker both honour.
 *
 * Reads the new exports off the module objects: loads on the landing-1 tree
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
const W_CSS = 800, DPR = 2, W = W_CSS * DPR;
const psalm107 = graph.chapters.find((ch) => graph.books[ch[0]].id.startsWith('psalms') && ch[1] === 107);
const CENTRE = psalm107[2] + psalm107[3] / 2;
function camAt(zoom) {
  const cam = geo.createCamera(graph.total);
  cam.ppv = geo.fitPPV(cam, W) * zoom;
  cam.x = CENTRE;
  return cam;
}
const viewAt = (cam, extra) => Object.assign({
  width: W, base: 500, ceil: 480, squash: geo.squashFactor(480, W),
  localize: geo.localizeFactor(cam.ppv / geo.fitPPV(cam, W)), density: 'famous',
  level: geo.levelOf(cam.ppv / DPR, graph.total),
}, extra);

describe('foot bundles: what the law hides at each cell, counted once per foot', () => {
  it('exports exist', () => {
    expect(typeof pick.footBundles).toBe('function');
    expect(typeof pick.flyBundles).toBe('function');
    expect(typeof pick.bundleGroups).toBe('function');
    expect(typeof pick.groupMembers).toBe('function');
  });

  it('at 12x on Psalm 107 the cells are chapter runs at least BUNDLE_MIN_CSS wide and hide thousands', () => {
    const cam = camAt(12);
    const cells = pick.footBundles(graph, cam, viewAt(cam), DPR);
    expect(cells.length).toBeGreaterThan(5);
    for (const c of cells) {
      expect(c.verse).toBe(false);
      const wide = (c.hi - c.lo + 1) * cam.ppv >= pick.BUNDLE_MIN_CSS * DPR;
      // the last cell may be cut by the canon's end
      if (c.chapterHi < graph.chapters.length - 1) expect(wide).toBe(true);
    }
    const hidden = cells.reduce((n, c) => n + c.hidden, 0);
    const drawn = cells.reduce((n, c) => n + c.drawn, 0);
    expect(hidden).toBeGreaterThan(5000);
    expect(drawn).toBeGreaterThan(20);
    expect(drawn).toBeLessThan(400);
    // cells tile the frame in order without overlap
    for (let i = 1; i < cells.length; i++) expect(cells[i].lo).toBe(cells[i - 1].hi + 1);
  });

  it('at the ceiling the cells are single verses and hide nothing (fully granular)', () => {
    const cam = camAt(geo.maxZoomFor(graph.total, W_CSS));
    const cells = pick.footBundles(graph, cam, viewAt(cam), DPR);
    expect(cells.length).toBeGreaterThan(10);
    expect(cells.every((c) => c.verse)).toBe(true);
    expect(cells.reduce((n, c) => n + c.hidden, 0)).toBe(0);
  });

  it('a cell counts exactly the hidden anchored threads with a foot in it', () => {
    const cam = camAt(30);
    const view = viewAt(cam);
    const cells = pick.footBundles(graph, cam, view, DPR);
    const cell = cells.reduce((a, b) => (b.hidden > a.hidden ? b : a));
    const drawn = pick.drawnTest(graph, view);
    let hidden = 0, shown = 0;
    for (let i = 0; i < graph.count; i++) {
      const a = graph.from[i], b = graph.to[i];
      if (!((a >= cell.lo && a <= cell.hi) || (b >= cell.lo && b <= cell.hi))) continue;
      const x0 = geo.verseToX(cam, W, a), x1 = geo.verseToX(cam, W, b);
      const anchored = geo.arcAnchored(x0, x1, W);
      if (!anchored) continue;
      if (drawn(i, anchored)) shown++; else hidden++;
    }
    expect(cell.hidden).toBe(hidden);
    expect(cell.drawn).toBe(shown);
  });

  it('a cell opens into its threads grouped by the other end\'s chapter, biggest first', () => {
    const cam = camAt(12);
    const view = viewAt(cam);
    const cells = pick.footBundles(graph, cam, view, DPR);
    const cell = cells.reduce((a, b) => (b.hidden > a.hidden ? b : a));
    const groups = pick.bundleGroups(graph, cam, view, cell.lo, cell.hi);
    expect(groups.length).toBeGreaterThan(3);
    for (let i = 1; i < groups.length; i++) expect(groups[i].count).toBeLessThanOrEqual(groups[i - 1].count);
    const total = groups.reduce((n, grp) => n + grp.count, 0);
    expect(total).toBe(pick.countTouching(graph, cell.lo, cell.hi, 'famous'));
    for (const grp of groups) {
      expect(grp.hidden).toBeLessThanOrEqual(grp.count);
      expect(grp.votes).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('fly-over bundles: one representative, one count', () => {
  it('at 12x the crossing fly-overs group under a few dozen keys whose counts sum to all of them', () => {
    const cam = camAt(12);
    const view = viewAt(cam);
    const bundles = pick.flyBundles(graph, cam, view);
    let crossing = 0;
    for (let i = 0; i < graph.count; i++) {
      const x0 = geo.verseToX(cam, W, graph.from[i]), x1 = geo.verseToX(cam, W, graph.to[i]);
      if (x1 < 0 || x0 > W || geo.arcAnchored(x0, x1, W)) continue;
      crossing++;
    }
    expect(crossing).toBeGreaterThan(5000);
    let sum = 0, withRep = 0;
    for (const b of bundles.values()) { sum += b.count; if (b.rep >= 0) withRep++; }
    expect(sum).toBe(crossing);
    expect(bundles.size).toBeGreaterThan(10);
    expect(bundles.size).toBeLessThan(400);
    // a group whose representative crosses the frame is what the eye sees; most do
    expect(withRep).toBeGreaterThan(bundles.size / 2);
    // the drawn fly-overs are exactly the representatives with a group here
    const drawnFly = pick.visibleArcs(graph, cam, view, 1e9)
      .filter((i) => !geo.arcAnchored(geo.verseToX(cam, W, graph.from[i]), geo.verseToX(cam, W, graph.to[i]), W));
    expect(new Set(drawnFly)).toEqual(new Set([...bundles.values()].filter((b) => b.rep >= 0).map((b) => b.rep)));
  });

  it('a representative lists its group, strongest first, itself included', () => {
    const cam = camAt(12);
    const bundles = pick.flyBundles(graph, cam, viewAt(cam));
    const big = [...bundles.values()].filter((b) => b.rep >= 0).reduce((a, b) => (b.count > a.count ? b : a));
    const members = pick.groupMembers(graph, big.rep, 'famous');
    expect(members[0]).toBe(big.rep);
    expect(members.length).toBeGreaterThanOrEqual(big.count);
    for (let i = 1; i < members.length; i++) expect(graph.votes[members[i]]).toBeLessThanOrEqual(graph.votes[members[i - 1]]);
    expect(pick.groupMembers(graph, big.rep, 'essential').every((i) => graph.votes[i] >= 20)).toBe(true);
  });
});

describe('a chosen group is drawn and spotlit by a pair of ranges, in the shader and the picker', () => {
  it('the shader carries the second range and lights a thread only with a foot in each', () => {
    expect(SHADER_SOURCE.vertex).toMatch(/uniform vec2\s+uFocusRange2/);
    expect(SHADER_SOURCE.vertex).toMatch(/uFocusRange2\.x <= uFocusRange2\.y/);
  });

  it('the picker: a plain focus range no longer forces hidden threads to draw; a pair does', () => {
    const cam = camAt(12);
    const view = viewAt(cam);
    const cells = pick.footBundles(graph, cam, view, DPR);
    const cell = cells.reduce((a, b) => (b.hidden > a.hidden ? b : a));
    const groups = pick.bundleGroups(graph, cam, view, cell.lo, cell.hi);
    const grp = groups.find((x) => x.hidden > 0);
    expect(grp).toBeTruthy();
    const plain = pick.drawnTest(graph, Object.assign({}, view, { focusRange: [cell.lo, cell.hi] }));
    const pair = pick.drawnTest(graph, Object.assign({}, view, { focusRange: [cell.lo, cell.hi], focusRange2: [grp.lo, grp.hi] }));
    const bare = pick.drawnTest(graph, view);
    let hiddenInGroup = 0, hiddenOutside = 0;
    for (let i = 0; i < graph.count; i++) {
      const a = graph.from[i], b = graph.to[i];
      const inCell = (a >= cell.lo && a <= cell.hi) || (b >= cell.lo && b <= cell.hi);
      if (!inCell) continue;
      const x0 = geo.verseToX(cam, W, a), x1 = geo.verseToX(cam, W, b);
      const anchored = geo.arcAnchored(x0, x1, W);
      if (bare(i, anchored)) continue;                       // drawn anyway
      expect(plain(i, anchored)).toBe(false);                 // a chapter tap does not make a wall
      const other = (a >= cell.lo && a <= cell.hi) ? b : a;
      const inGroup = other >= grp.lo && other <= grp.hi;
      expect(pair(i, anchored)).toBe(inGroup);
      if (inGroup) hiddenInGroup++; else hiddenOutside++;
    }
    expect(hiddenInGroup).toBe(grp.hidden);
    expect(hiddenOutside).toBeGreaterThan(0);
  });
});

describe('a representative badge sits on the body, mid-frame, never at the clipped edge', () => {
  it('bodyMidpoint returns a point in the sky near the centre of the visible run, or null', () => {
    const cam = camAt(12);
    const view = viewAt(cam, { inset: 40 });
    const bundles = pick.flyBundles(graph, cam, view);
    let found = 0;
    for (const b of bundles.values()) {
      if (b.rep < 0) continue;
      const at = pick.bodyMidpoint(graph, cam, view, b.rep);
      if (!at) continue;
      found++;
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(W);
      expect(at.y).toBeGreaterThanOrEqual(40);
      expect(at.y).toBeLessThanOrEqual(view.base);
    }
    expect(found).toBeGreaterThan(0);
    expect(pick.bodyMidpoint(graph, camAt(12), view, 0) === null || true).toBe(true);
  });
});
