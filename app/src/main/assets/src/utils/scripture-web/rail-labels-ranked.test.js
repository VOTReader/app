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
