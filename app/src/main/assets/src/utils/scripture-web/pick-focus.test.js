/* A1 (w2 digest, item 7): while a line is chosen, the receded threads are not targets, so a tap
   on what reads as empty sky beside the chosen line clears instead of choosing a line the reader
   can barely see. The filter is the shader's lit rule (web-renderer.js): the chosen thread, a foot
   in the chosen range, and the lit set. */
import { describe, it, expect } from 'vitest';
import { squashFactor, createCamera, clampCamera, footX, arcShape, arcHeightAt } from './geometry.js';
import { pickArcs, focusedPickFilter } from './pick.js';
import { fansOf } from './decode.js';

/** Two books, four chapters, 40 verses; one bucket with every pair given. */
function makeGraph(pairs) {
  const chapters = [[0, 1, 0, 10], [0, 2, 10, 10], [1, 1, 20, 10], [1, 2, 30, 10]];
  const total = 40;
  const chapterOfVerse = new Uint16Array(total);
  for (let ci = 0; ci < chapters.length; ci++) {
    for (let v = 0; v < chapters[ci][3]; v++) chapterOfVerse[chapters[ci][2] + v] = ci;
  }
  const n = pairs.length;
  const from = new Uint16Array(n), to = new Uint16Array(n), votes = new Int16Array(n);
  pairs.forEach((p, i) => { from[i] = p[0]; to[i] = p[1]; votes[i] = 30; });
  return {
    total, count: n, from, to, votes,
    buckets: [{ off: 0, len: n, off20: n, off10: n, segments: 32, chunks: [] }],
    books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 }, { id: 'beta', title: 'Beta', abbr: 'Bet', start: 20 }],
    chapters, chapterOfVerse, densityTiers: [20, 7], attribution: '', votEdges: [], prophecy: [], votLinks: [], chunkSize: 256,
  };
}
const VIEW = (over) => Object.assign({
  width: 1000, height: 600, base: 520, ceil: 480, localize: 0,
  squash: squashFactor(480, 1000), density: 'famous', rulerDepth: 40,
}, over);
/** A point on thread `index`, at fraction t of its span (the picker's own curve). */
function pointOn(g, cam, view, index, t) {
  const { fanA, fanB } = fansOf(g);
  const x0 = footX(cam, view.width, g.from[index], fanA[index]);
  const x1 = footX(cam, view.width, g.to[index], fanB[index]);
  const { A } = arcShape((x1 - x0) / 2, view.squash);
  const x = x0 + (x1 - x0) * t;
  return [x, view.base - arcHeightAt(x, x0, x1, A)];
}

// thread 0 runs 2-38 (the wide one), thread 1 runs 5-15 (inside chapter 1 and 2), thread 2 runs 22-28
const g = makeGraph([[2, 38], [5, 15], [22, 28]]);
const cam = createCamera(g.total);
clampCamera(cam, 1000, 5000);

describe('focusedPickFilter: the shader\'s lit rule, as targets', () => {
  it('is null with nothing chosen: every thread is a target', () => {
    expect(focusedPickFilter({})).toBeNull();
    expect(focusedPickFilter({ focusArc: -1, focusRange: null })).toBeNull();
  });
  it('a chosen thread: it alone, and the lit set', () => {
    const f = focusedPickFilter({ focusArc: 1, focusRange: null, lit: Int32Array.from([2]) });
    expect([0, 1, 2].map((i) => f(i, g.from[i], g.to[i]))).toEqual([false, true, true]);
  });
  it('a chosen range: a foot in it (the group pair is retired, w5: a stray second range is not read)', () => {
    const r = focusedPickFilter({ focusArc: -1, focusRange: [20, 29] });
    expect([0, 1, 2].map((i) => r(i, g.from[i], g.to[i]))).toEqual([false, false, true]);
    const stray = /** @type {any} */ ({ focusArc: -1, focusRange: [0, 9], focusRange2: [30, 39] });
    const one = focusedPickFilter(stray);
    expect([0, 1, 2].map((i) => one(i, g.from[i], g.to[i]))).toEqual([true, true, false]);
  });
});

describe('pickArcs while a line is chosen (A1)', () => {
  it('CONTROL: with nothing chosen, a point on thread 0 picks thread 0', () => {
    const view = VIEW();
    const [px, py] = pointOn(g, cam, view, 0, 0.5);
    expect(pickArcs(g, cam, view, px, py, 6, 4).map((h) => h.index)).toEqual([0]);
  });
  it('with thread 2 chosen, a tap on receded thread 0 finds nothing (so the tap clears)', () => {
    const view = VIEW({ focusArc: 2, focusRange: null });
    const [px, py] = pointOn(g, cam, view, 0, 0.5);
    expect(pickArcs(g, cam, view, px, py, 6, 4)).toEqual([]);
  });
  it('the chosen thread itself and a lit one stay targets', () => {
    const view = VIEW({ focusArc: 2, focusRange: null, lit: Int32Array.from([0]) });
    const [px, py] = pointOn(g, cam, view, 0, 0.5);
    expect(pickArcs(g, cam, view, px, py, 6, 4).map((h) => h.index)).toEqual([0]);
    const [qx, qy] = pointOn(g, cam, view, 2, 0.5);
    expect(pickArcs(g, cam, view, qx, qy, 6, 4).map((h) => h.index)).toEqual([2]);
  });
  it('with a verse range chosen, the threads touching it are targets and the rest are not', () => {
    const view = VIEW({ focusArc: -1, focusRange: [5, 5] });
    const [px, py] = pointOn(g, cam, view, 1, 0.5);
    expect(pickArcs(g, cam, view, px, py, 6, 4).map((h) => h.index)).toEqual([1]);
    const [qx, qy] = pointOn(g, cam, view, 0, 0.5);
    expect(pickArcs(g, cam, view, qx, qy, 6, 4)).toEqual([]);
  });
});
