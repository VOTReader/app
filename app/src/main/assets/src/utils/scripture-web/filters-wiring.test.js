// @ts-nocheck
/* A ghost is drawn but never tapped, labelled or drawn gold (filters.js): with masks in force, the
   picker, the label feed and the top pass skip what they ghost, and a cleared filter brings it
   all back. The graph is pick-prophecy.test.js's: three arcs and two prophecy pairs. */
import { describe, it, expect, afterEach } from 'vitest';
import { pickProphecy, pickArcs, labelFeed, visibleArcs } from './pick.js';
import { prophecySet, topSet } from './frame-set.js';
import * as geo from './geometry.js';
import { setFilterMasks } from './filters.js';

const W = 800, base = 260, ceil = 240;
const view = { width: W, height: 720, base, ceil, squash: geo.squashFactor(ceil, W), localize: 1, density: 'famous', rulerDepth: 40 };
const g = {
  total: 200, count: 3,
  from: new Uint16Array([10, 60, 120]), to: new Uint16Array([150, 70, 190]), votes: new Int16Array([30, 141, 8]),
  buckets: [{ off: 0, len: 3, off20: 3, off10: 3, segments: 8, chunks: [] }], chunkSize: 256,
  books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 }],
  chapters: [[0, 1, 0, 200]], chapterOfVerse: new Uint16Array(200), votEdges: [], votLinks: [],
  prophecy: [{ a: 60, b: 70, studyId: 's', chapterId: 'c' }, { a: 20, b: 180, studyId: 's', chapterId: 'c' }],
};
const cam = { x: 100, y: 0, ppv: 4, total: 200 };
const masks = (threads, pairs) => ({ threads: new Uint8Array(threads), pairs: new Uint8Array(pairs), kept: 0, keptPairs: 0, serial: 1 });

/** A point on the apex of arc i's drawn curve. */
function apexOf(i) {
  const x0 = geo.footX(cam, W, g.from[i], 0.5), x1 = geo.footX(cam, W, g.to[i], 0.5);
  const { A } = geo.arcShape((x1 - x0) / 2, view.squash);
  return [(x0 + x1) / 2, base - A];
}
function apexOfPair(k) {
  const ps = prophecySet(g);
  const x0 = geo.footX(cam, W, ps.from[k], ps.fanA[k]), x1 = geo.footX(cam, W, ps.to[k], ps.fanB[k]);
  const { A } = geo.arcShape((x1 - x0) / 2, view.squash);
  return [(x0 + x1) / 2, base - A];
}

afterEach(() => setFilterMasks(g, null));

describe('filters: a ghost is not there to tap, label or draw gold', () => {
  it('the picker skips a ghosted arc and a ghosted pair, and finds them again once cleared', () => {
    const [px, py] = apexOf(0);
    expect(pickArcs(g, cam, view, px, py, 14).map((h) => h.index)).toContain(0);
    const [qx, qy] = apexOfPair(1);
    expect(pickProphecy(g, cam, view, qx, qy, 14)).toHaveLength(1);
    setFilterMasks(g, masks([0, 1, 1], [1, 0]));
    expect(pickArcs(g, cam, view, px, py, 14).map((h) => h.index)).not.toContain(0);
    expect(pickProphecy(g, cam, view, qx, qy, 14)).toEqual([]);
    setFilterMasks(g, null);
    expect(pickArcs(g, cam, view, px, py, 14).map((h) => h.index)).toContain(0);
  });

  it('the label feed and the visible list leave a ghost out', () => {
    const all = labelFeed(g, cam, view).map((t) => t.i);
    expect(all).toContain(2);
    setFilterMasks(g, masks([1, 1, 0], [1, 1]));
    expect(labelFeed(g, cam, view).map((t) => t.i)).not.toContain(2);
    expect(visibleArcs(g, cam, view, 10)).not.toContain(2);
  });

  it('the top pass draws only the kept pairs and lit arcs, and a change of masks rebuilds it', () => {
    const ask = { lit: [0, 2], litKey: 'k' };
    const open = topSet(g, ask, null);
    const prophecy = (s) => s.ranges.find((r) => r.kind === 'prophecy').count;
    const lit = (s) => s.ranges.find((r) => r.kind === 'lit').count;
    expect(prophecy(open)).toBe(2);
    expect(lit(open)).toBe(2);
    setFilterMasks(g, masks([1, 1, 0], [0, 1]));
    const kept = topSet(g, ask, open);
    expect(kept).not.toBe(open);
    expect(prophecy(kept)).toBe(1);
    expect(lit(kept)).toBe(1);
    expect(kept.from[0]).toBe(20);
    expect(topSet(g, ask, kept)).toBe(kept);
  });
});
