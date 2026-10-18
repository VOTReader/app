// @ts-nocheck
/* The prophecy class is pickable where it is drawn (GL item 4). Every
   g.prophecy pair is drawn, always, by the top pass on frame-set.prophecySet's
   feet; the picker walks the same table and the same curve law, so a finger on
   the drawn line finds the pair, the arcs it overlaps are flagged with it, and
   a pair that is no arc is a thread of its own (index -1). The oracle below
   puts the finger on the drawn curve as the top pass computes it. */
import { describe, it, expect } from 'vitest';
import { pickProphecy, pickThreads, pickArcs } from './pick.js';
import { prophecySet } from './frame-set.js';
import { fansOf } from './decode.js';
import * as geo from './geometry.js';
import { describeFound, connectionMeta, sheetMeta, prophecyMeta } from './describe.js';

const W = 800, base = 260, ceil = 240;
const view = { width: W, height: 720, base, ceil, squash: geo.squashFactor(ceil, W), localize: 1, density: 'famous', rulerDepth: 40 };
const graph = () => ({
  total: 200, count: 3,
  from: new Uint16Array([10, 60, 120]), to: new Uint16Array([150, 70, 190]), votes: new Int16Array([30, 141, 8]),
  buckets: [{ off: 0, len: 3, off20: 3, off10: 3, segments: 8, chunks: [] }], chunkSize: 256,
  books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 }],
  chapters: [[0, 1, 0, 200]], chapterOfVerse: new Uint16Array(200), votEdges: [], votLinks: [],
  prophecy: [
    { a: 60, b: 70, studyId: 's', chapterId: 'c' },    // arc 1 joins these verses
    { a: 20, b: 180, studyId: 's', chapterId: 'c' },   // no arc
  ],
});
const cam = { x: 100, y: 0, ppv: 4, total: 200 };

/** A point on pair k's drawn curve (the top pass's feet and law), at the share u of its span. */
function onPair(g, k, u) {
  const ps = prophecySet(g);
  const x0 = geo.footX(cam, W, ps.from[k], ps.fanA[k]), x1 = geo.footX(cam, W, ps.to[k], ps.fanB[k]);
  const { A } = geo.arcShape((x1 - x0) / 2, view.squash);
  const tau = Math.acos(1 - 2 * u);
  const p = geo.arcPointAt(tau, x0, x1, A);
  return [p.x, base - p.h];
}

describe('pickProphecy: a pair is found on the curve the top pass draws', () => {
  it('ORACLE: a finger on the drawn line, anywhere along it, finds the pair within half a px', () => {
    const g = graph();
    for (const u of [0.05, 0.25, 0.5, 0.8]) {
      const [px, py] = onPair(g, 1, u);
      const hits = pickProphecy(g, cam, view, px, py, 14);
      expect(hits[0], `u ${u}`).toMatchObject({ prophecy: 1, index: -1, from: 20, to: 180, votes: 0 });
      expect(hits[0].distance).toBeLessThan(0.5);
    }
  });

  it('a pair that is an arc names it, with its votes; a point 20 px off the line finds nothing', () => {
    const g = graph();
    const [px, py] = onPair(g, 0, 0.5);
    expect(pickProphecy(g, cam, view, px, py, 14)[0]).toMatchObject({ prophecy: 0, index: 1, votes: 141 });
    const [qx, qy] = onPair(g, 1, 0.5);
    expect(pickProphecy(g, cam, view, qx, qy - 20, 14)).toEqual([]);
  });

  it('a pair given twice is found once, as the first of the two (one chooser row, not two)', () => {
    const g = Object.assign(graph(), { prophecy: [...graph().prophecy, { a: 180, b: 20, studyId: 's2', chapterId: 'c2' }] });
    const [px, py] = onPair(g, 1, 0.5);
    const hits = pickProphecy(g, cam, view, px, py, 14);
    expect(hits.filter((h) => h.from === 20 && h.to === 180).map((h) => h.prophecy)).toEqual([1]);
    expect(pickThreads(g, cam, view, px, py, 14, 4).filter((h) => h.from === 20 && h.to === 180).length).toBe(1);
  });

  it('reads the camera\'s y: the drawn baseline stands cam.y lower', () => {
    const g = graph();
    const [px, py] = onPair(g, 1, 0.5);
    const up = Object.assign({}, cam, { y: 30 });
    expect(pickProphecy(g, up, view, px, py + 30, 3)[0]).toMatchObject({ prophecy: 1 });
  });
});

describe('pickThreads: the arcs, flagged when they are a pair, and the pairs that are no arc', () => {
  it('an arc that is a pair comes back once, flagged with it (not twice)', () => {
    const g = graph();
    const [px, py] = onPair(g, 0, 0.5);
    const hits = pickThreads(g, cam, view, px, py, 14, 4);
    const its = hits.filter((h) => h.index === 1);
    expect(its.length).toBe(1);
    expect(its[0].prophecy).toBe(0);
  });

  it('a pair that is no arc is a thread of its own (index -1); a plain arc carries prophecy -1', () => {
    const g = graph();
    const [px, py] = onPair(g, 1, 0.3);
    const hits = pickThreads(g, cam, view, px, py, 14, 4);
    expect(hits[0]).toMatchObject({ index: -1, prophecy: 1 });
    for (const h of pickArcs(g, cam, view, px, py, 14, 4)) {
      const t = hits.find((x) => x.index === h.index);
      if (t && h.index !== 1) expect(t.prophecy).toBe(-1);
    }
  });

  it('nearest first, and no more than asked', () => {
    const g = graph();
    const [px, py] = onPair(g, 1, 0.5);
    const hits = pickThreads(g, cam, view, px, py, 400, 2);
    expect(hits.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < hits.length; i++) expect(hits[i].distance).toBeGreaterThanOrEqual(hits[i - 1].distance);
  });

  it('the ruler band is the ruler\'s: a camera looking up sinks a line through it, and the sunk part (scissored away) is not picked', () => {
    const g = graph();
    const up = Object.assign({}, cam, { y: 100 });
    const fans = fansOf(g);
    const x0 = geo.footX(up, W, g.from[0], fans.fanA[0]), x1 = geo.footX(up, W, g.to[0], fans.fanB[0]);
    const { A } = geo.arcShape((x1 - x0) / 2, view.squash);
    const p = geo.arcPointAt(Math.asin(50 / A), x0, x1, A);   // 50 px over the sunk baseline: 50 px under the ruler's top
    const py = base + up.y - p.h;
    expect(py).toBeGreaterThan(base + 14);
    expect(pickArcs(g, up, view, p.x, py, 14, 4).map((h) => h.index), 'CONTROL: the curve is there').toContain(0);
    expect(pickThreads(g, up, view, p.x, py, 14, 4)).toEqual([]);
    // above the ruler the same line is picked as ever
    const q = geo.arcPointAt(Math.PI / 2, x0, x1, A);
    expect(pickThreads(g, up, view, q.x, base + up.y - q.h, 14, 4).map((h) => h.index)).toContain(0);
  });

  it('a graph with no prophecy is pickArcs, each hit flagged -1', () => {
    const g = Object.assign(graph(), { prophecy: [] });
    const [px, py] = onPair(graph(), 0, 0.5);
    const plain = pickArcs(g, cam, view, px, py, 14, 4);
    const hits = pickThreads(g, cam, view, px, py, 14, 4);
    expect(hits.map((h) => h.index)).toEqual(plain.map((h) => h.index));
    expect(hits.every((h) => h.prophecy === -1)).toBe(true);
  });
});

describe('the words: a prophecy pair reads "Prophecy fulfilled" (the mockup\'s chosen panel)', () => {
  const ctx = (g) => ({ g, personal: null, cam, v: { W }, viewFor: () => view, density: 'famous' });
  it('an arc that is a pair: "Prophecy fulfilled · 141 votes · 10 verses apart" in the rows and the sheet', () => {
    const g = graph();
    const [px, py] = onPair(g, 0, 0.5);
    const hit = pickThreads(g, cam, view, px, py, 14, 4).find((h) => h.index === 1);
    const info = describeFound({ kind: 'arc', hit }, ctx(g));
    expect(info).toMatchObject({ prophecy: true, prophecyIndex: 0 });
    expect(connectionMeta(info)).toBe('Prophecy fulfilled · 141 votes · 10 verses apart');
    expect(sheetMeta(info)).toBe('Prophecy fulfilled · 141 votes · 10 verses apart');
  });

  it('a pair that is no arc has no votes to give', () => {
    const g = graph();
    const [px, py] = onPair(g, 1, 0.5);
    const info = describeFound({ kind: 'arc', hit: pickThreads(g, cam, view, px, py, 14, 4)[0] }, ctx(g));
    expect(info).toMatchObject({ kind: 'arc', index: -1, prophecy: true, prophecyIndex: 1 });
    expect(sheetMeta(info)).toBe('Prophecy fulfilled · 160 verses apart');
    expect(prophecyMeta({ index: -1, votes: 0, span: 15632 })).toBe('Prophecy fulfilled · 15,632 verses apart');
  });

  it('CONTROL: an ordinary arc keeps its words', () => {
    const g = graph();
    const info = describeFound({ kind: 'arc', hit: { index: 0, from: 10, to: 150, votes: 30 } }, ctx(g));
    expect(info).toMatchObject({ prophecy: false, prophecyIndex: -1 });
    expect(connectionMeta(info)).toBe('30 votes · 140 verses apart');
    expect(sheetMeta(info)).toBe('140 verses apart · weight 30');
  });
});
