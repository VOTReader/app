/* placeRailLabelsRanked (w3 canvas stream): the shared rail law with a rank,
   so the major books (GEN, PSALMS, ISAIAH, MATT, JOHN, REV) are placed before
   their neighbours, and a row a corner button sits over can be refused. With
   one rank for every box it is placeRailLabels exactly. */
import { describe, it, expect } from 'vitest';
import { placeRailLabels, placeRailLabelsRanked } from './rail-labels.js';

function boxes(seed, n) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    x += rnd() * 40;
    out.push({ left: x, right: x + 8 + rnd() * 60 });
  }
  return out;
}

describe('placeRailLabelsRanked', () => {
  it('with equal ranks it places exactly as placeRailLabels does', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const b = boxes(seed, 80);
      expect(placeRailLabelsRanked(b, 5, 2)).toEqual(placeRailLabels(b, 5, 2));
      expect(placeRailLabelsRanked(b, 5, 2, b.map(() => 1))).toEqual(placeRailLabels(b, 5, 2));
    }
  });

  it('a major book wins its row from the neighbours before it', () => {
    // three overlapping names: in x order the first two take both rows and REV is dropped
    const b = [{ left: 0, right: 50 }, { left: 30, right: 80 }, { left: 45, right: 95 }];
    expect(placeRailLabels(b, 5, 2)).toEqual([0, 1, -1]);
    const r = placeRailLabelsRanked(b, 5, 2, [1, 1, 0]);
    expect(r[2]).toBe(0);
    expect(r.filter((x) => x >= 0).length).toBe(2);
  });

  it('a blocked row is never taken, and the name falls to the free one or goes', () => {
    const b = [{ left: 0, right: 50 }, { left: 100, right: 150 }];
    expect(placeRailLabelsRanked(b, 5, 2, undefined, (i, row) => i === 1 && row === 0)).toEqual([0, 1]);
    expect(placeRailLabelsRanked(b, 5, 2, undefined, (i) => i === 1)).toEqual([0, -1]);
  });

  /* w4 review 2: a name pinned to its own place went for a few pixels (LUKE beside JOHN); one
     given a range slides to the nearest place a pad clear of its neighbours, within that range. */
  it('a box with a range slides to the nearest free place in it; without one it goes as before', () => {
    const john = { left: 100, right: 140 };
    const luke = { left: 50, right: 90 };   // 10 short of a pad of 13 from JOHN
    const at = [];
    expect(placeRailLabelsRanked([luke, john], 13, 1, [1, 0])).toEqual([-1, 0]);
    expect(placeRailLabelsRanked([Object.assign({ lo: 40, hi: 60 }, luke), john], 13, 1, [1, 0], undefined, at)).toEqual([0, 0]);
    expect(at[0]).toBe(47);   // its right edge a pad from JOHN's left
    expect(at[1]).toBe(100);
    // the range is a bound: 2 px of slide is not enough, and the name goes
    expect(placeRailLabelsRanked([Object.assign({ lo: 48, hi: 52 }, luke), john], 13, 1, [1, 0])).toEqual([-1, 0]);
    // nearest first, on either side: between two names it takes the closer free edge
    const a = { left: 0, right: 30 }, c = { left: 120, right: 150 };
    const mid = { left: 38, right: 68, lo: 20, hi: 90 };
    const at2 = [];
    expect(placeRailLabelsRanked([a, mid, c], 10, 1, [0, 1, 0], undefined, at2)).toEqual([0, 0, 0]);
    expect(at2[1]).toBe(40);
  });

  /* w4 fix 2: slid to a bare pad, a name sat hard against its neighbour ("LUKE |JOHN| ACTS"). Given
     a roomy gap, a slide takes the nearest place that far clear within its range, and a pad clear
     only where the range has no such place. */
  it('a slide looks first for a place a roomy gap clear, then a pad clear; a box that fits stays put', () => {
    const john = { left: 100, right: 140 };
    const luke = { left: 50, right: 90 };
    const at = [];
    expect(placeRailLabelsRanked([Object.assign({ lo: 0, hi: 60 }, luke), john], 13, 1, [1, 0], undefined, at, 24)).toEqual([0, 0]);
    expect(at[0]).toBe(36);   // its right edge 24 from JOHN's left, not 13
    // the range has no room for 24 (36 < 40), so it takes the pad as before
    expect(placeRailLabelsRanked([Object.assign({ lo: 40, hi: 60 }, luke), john], 13, 1, [1, 0], undefined, at, 24)).toEqual([0, 0]);
    expect(at[0]).toBe(47);
    // a box that fits a pad clear at its own place does not move for the roomy gap
    const near = { left: 40, right: 80, lo: 0, hi: 60 };
    expect(placeRailLabelsRanked([near, john], 13, 1, [1, 0], undefined, at, 24)).toEqual([0, 0]);
    expect(at[0]).toBe(40);
    // a roomy place blocked, the pad place next
    const r = placeRailLabelsRanked([Object.assign({ lo: 0, hi: 60 }, luke), john], 13, 1, [1, 0], (i, _row, x) => i === 0 && x < 40, at, 24);
    expect(r).toEqual([0, 0]);
    expect(at[0]).toBe(47);
  });

  it('a slide never takes a blocked place: blocked is asked at the left edge it would take', () => {
    const john = { left: 100, right: 140 };
    const luke = { left: 50, right: 90, lo: 0, hi: 200 };
    const at = [];
    // the place left of JOHN is blocked, so LUKE goes to the right of it
    const r = placeRailLabelsRanked([luke, john], 13, 1, [1, 0], (i, _row, x) => i === 0 && x < 100, at);
    expect(r).toEqual([0, 0]);
    expect(at[0]).toBe(153);
  });

  it('no two names on one row come within the pad', () => {
    const b = boxes(5, 120);
    const rank = b.map((_, i) => (i % 7 === 0 ? 0 : 1));
    const rows = placeRailLabelsRanked(b, 5, 2, rank);
    for (let i = 0; i < b.length; i++) {
      for (let j = i + 1; j < b.length; j++) {
        if (rows[i] < 0 || rows[i] !== rows[j]) continue;
        expect(b[i].right + 5 <= b[j].left || b[j].right + 5 <= b[i].left, i + ' / ' + j).toBe(true);
      }
    }
  });
});
