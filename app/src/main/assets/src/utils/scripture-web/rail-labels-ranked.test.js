/* placeRailLabelsRanked (w3 canvas stream): the shared rail law with a rank,
   so the major books (GEN, PSALMS, ISAIAH, MATT, JOHN, REV) are placed before
   their neighbours, and a row a corner button sits over can be refused. With
   one rank for every box it is placeRailLabels exactly. */
import { describe, it, expect } from 'vitest';
import { placeRailLabels, placeRailLabelsRanked, placeRailLabelsSliding } from './rail-labels.js';

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

  /* w4 readdown (minor): JUDG, MARK and ROM went on a PC's one row because their neighbours had
     already taken the middle of their own books. With `at` given, a box with no free place makes
     room by moving the row's names along their own ranges, a pad (or the roomy gap) from each, each
     as near where it stood as the room allows; a name without a range, or one that would have to
     move onto a blocked place, holds, and then the box goes as before. */
  it('a box with no free place moves its neighbours along their own ranges to make room', () => {
    const a = { left: 0, right: 40, lo: -20, hi: 0 };
    const c = { left: 100, right: 140, lo: 100, hi: 120 };
    const b = { left: 50, right: 90, lo: 45, hi: 55 };
    const at = [];
    // without at (nobody can be told where they moved) it goes as before
    expect(placeRailLabelsRanked([a, b, c], 13, 1, [0, 1, 0])).toEqual([0, -1, 0]);
    expect(placeRailLabelsRanked([a, b, c], 13, 1, [0, 1, 0], undefined, at)).toEqual([0, 0, 0]);
    expect(at[1]).toBe(50);                          // the box at its own place
    expect(at[1] - (at[0] + 40)).toBeGreaterThanOrEqual(13);
    expect(at[2] - (at[1] + 40)).toBeGreaterThanOrEqual(13);
    expect(at[0]).toBeGreaterThanOrEqual(-20);       // each within its own range
    expect(at[2]).toBeLessThanOrEqual(120);
    expect(at[0]).toBe(-3);                          // and moved no further than the room needs
    expect(at[2]).toBe(103);
    // the roomy gap first, where the ranges have room for it
    const at2 = [];
    expect(placeRailLabelsRanked([a, b, c], 13, 1, [0, 1, 0], undefined, at2, 18)).toEqual([0, 0, 0]);
    expect([at2[0], at2[2]]).toEqual([-8, 108]);
    // a neighbour with no range holds, and with no room left the box goes
    const at3 = [];
    const tight = Object.assign({}, b, { hi: 52 });
    expect(placeRailLabelsRanked([{ left: 0, right: 40 }, tight, c], 13, 1, [0, 1, 0], undefined, at3)).toEqual([0, -1, 0]);
    expect([at3[0], at3[2]]).toEqual([0, 100]);
    // a neighbour that would move onto a blocked place holds there, and the rest make the room
    const at4 = [];
    expect(placeRailLabelsRanked([a, b, c], 13, 1, [0, 1, 0], (i, _r, x) => i === 2 && x > 100, at4)).toEqual([0, 0, 0]);
    expect([at4[0], at4[1], at4[2]]).toEqual([-6, 47, 100]);
    // the box itself never takes a blocked place
    const at5 = [];
    expect(placeRailLabelsRanked([a, b, c], 13, 1, [0, 1, 0], (i) => i === 1, at5)).toEqual([0, -1, 0]);
    expect([at5[0], at5[2]]).toEqual([0, 100]);
  });

  it('making room keeps the row\'s roomy cells roomy; only a box marked squeeze may close them to a pad', () => {
    // a and c stand 30 apart, a roomy cell (roomy 24); d may move right to 156. b (between c and d)
    // fits only if c moves left into that cell, closing it to 17
    const a = { left: 0, right: 40 };
    const c = { left: 70, right: 110, lo: 50, hi: 70 };
    const d = { left: 150, right: 190, lo: 150, hi: 156 };
    const b = { left: 110, right: 140, lo: 104, hi: 116 };
    const run = (box) => { const at = []; return { rows: placeRailLabelsRanked([a, c, d, box], 13, 1, [0, 0, 0, 1], undefined, at, 24), at }; };
    const plain = run(b);
    expect(plain.rows).toEqual([0, 0, 0, -1]);
    expect(plain.at.slice(0, 3)).toEqual([0, 70, 150]);
    const sq = run(Object.assign({ squeeze: true }, b));
    expect(sq.rows).toEqual([0, 0, 0, 0]);
    expect(sq.at[1] - 40, 'the a|c cell closes, to no less than the pad').toBeGreaterThanOrEqual(13);
    expect(sq.at[1] - 40).toBeLessThan(24);
    expect(sq.at[3] - (sq.at[1] + 40)).toBeGreaterThanOrEqual(13);
    expect(sq.at[2] - (sq.at[3] + 30)).toBeGreaterThanOrEqual(13);
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

describe('placeRailLabelsSliding (w4: the Volumes rail on a phone names every collection)', () => {
  it('with no room to slide it is placeRailLabels exactly', () => {
    for (let seed = 1; seed < 40; seed++) {
      const b = boxes(seed, 30);
      const items = b.map((x) => ({ x: (x.left + x.right) / 2, w: x.right - x.left, max: (x.left + x.right) / 2 }));
      expect(placeRailLabelsSliding(items, 5, 2).map((p) => p.row)).toEqual(placeRailLabels(b, 5, 2));
    }
  });
  it('a name stands centred over its band on any row with room for it there, before it slides (w4 fix-review: names over their slots, r2-05)', () => {
    // a 40 wide name at 50 meets the first row's end at 40: row 1 has it where it stands,
    // so it takes row 1 centred (through the first review it slid to 65 on row 0, and on
    // a PC "TIMOTHY HOLY DAYS MTAM" ran together off their slots)
    const [a, b] = placeRailLabelsSliding([{ x: 20, w: 40, max: 20 }, { x: 50, w: 40, max: 70 }], 5, 2);
    expect(a).toEqual({ row: 0, x: 20 });
    expect(b).toEqual({ row: 1, x: 50 });
  });
  it('with no row free where it stands, a name slides right within its bound, to the row that needs the least slide, and never past the bound', () => {
    // row 0 ends at 40 (a), row 1 at 45 (b): c at 50 needs 65 on row 0, 70 on row 1
    const [, , c] = placeRailLabelsSliding([{ x: 20, w: 40, max: 20 }, { x: 25, w: 40, max: 25 }, { x: 50, w: 40, max: 75 }], 5, 2);
    expect(c).toEqual({ row: 0, x: 65 });
    // bound at 60: neither row's slide reaches, so it is not placed
    const [, , d] = placeRailLabelsSliding([{ x: 20, w: 40, max: 20 }, { x: 22, w: 40, max: 22 }, { x: 24, w: 40, max: 30 }], 5, 2);
    expect(d.row).toBe(-1);
  });
  it('no two names on one row come nearer than the pad, and every slide stays in bound', () => {
    for (let seed = 1; seed < 40; seed++) {
      const b = boxes(seed, 30);
      const items = b.map((x) => { const c = (x.left + x.right) / 2; return { x: c, w: x.right - x.left, max: c + 12 }; });
      const out = placeRailLabelsSliding(items, 5, 2);
      const last = [-Infinity, -Infinity];
      out.forEach((p, i) => {
        if (p.row < 0) return;
        expect(p.x).toBeGreaterThanOrEqual(items[i].x);
        expect(p.x).toBeLessThanOrEqual(items[i].max);
        expect(p.x - items[i].w / 2).toBeGreaterThanOrEqual(last[p.row] + 5 - 1e-9);
        // a slid name had no row with room where it stands
        if (p.x > items[i].x) for (const end of last) expect(items[i].x - items[i].w / 2).toBeLessThan(end + 5);
        last[p.row] = p.x + items[i].w / 2;
      });
    }
  });
});
