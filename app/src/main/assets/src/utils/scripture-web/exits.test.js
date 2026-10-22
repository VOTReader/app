// @ts-nocheck
/* exits.js: a "+n" pill's fan, pure. On hand-made censuses over the real asset's 66 books: what a chip
   names (a book, or the stretch of books it reaches: never a section's name), that no leg is in two
   chips or in none, that a side holds at most `most` chips, nearest lowest. On the real asset at the
   Isaiah 53 deep frame (s06b, PC): the census against the frame's visible set, and its memo. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as dec from './decode.js';
import * as geo from './geometry.js';
import { frameSetAt } from './frame-set.js';
import { webFrame } from './web-frame.js';
import {
  sectionGroups, fanGroups, bookGroups, mergeTo, exitCensus, exitIds, areaLabel, areaOf, EXIT_SECTIONS, sectionOf,
} from './exits.js';

const here = dirname(fileURLToPath(import.meta.url));
const g = dec.decodeGraph(runInNewContext(readFileSync(resolve(here, '../../data/scripture-web-data.js'), 'utf8') + ';SCRIPTURE_WEB_DATA', {}));
const B = (abbr) => {
  const i = g.books.findIndex((b) => b.abbr === abbr);
  if (i < 0) throw new Error('no book ' + abbr);
  return i;
};

/** A census: per side, {abbr: legs}; the home book by its abbreviation. */
function census(left, right, home) {
  const side = (m) => {
    const count = new Int32Array(g.books.length), t = new Float64Array(g.books.length);
    for (const [k, n] of Object.entries(m)) { count[B(k)] = n; t[B(k)] = n * 0.5; }
    return { count, t };
  };
  const l = side(left), r = side(right);
  const legs = [...l.count, ...r.count].reduce((a, b) => a + b, 0);
  return { legs, left: l, right: r, home: home ? B(home) : -1, lo: 0, hi: 0 };
}
const names = (row) => [...row.left.map((x) => '<' + x.name), ...row.right.map((x) => x.name + '>')].join('|');

/** Every present book of a side in exactly one chip, no two chips' stretches sharing a book, and the
 * chips' counts summing to the census's legs. */
function partitions(c, row) {
  let sum = 0;
  for (const side of ['left', 'right']) {
    const seen = new Set();
    for (const grp of row[side]) {
      for (const b of grp.books) { expect(seen.has(b), side + ' book ' + b + ' twice').toBe(false); seen.add(b); }
      for (const b of grp.books) expect(b >= grp.lo && b <= grp.hi, grp.name + ' names its books').toBe(true);
      sum += grp.count;
    }
    for (let b = 0; b < g.books.length; b++) if (c[side].count[b] > 0) expect(seen.has(b), side + ' book ' + b + ' in a chip').toBe(true);
    const spans = row[side].map((x) => [x.lo, x.hi]).sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < spans.length; k++) expect(spans[k][0], side + ' stretches apart').toBeGreaterThan(spans[k - 1][1]);
  }
  expect(sum, "the chips' counts sum to the census's legs").toBe(c.legs);
}

/** A chip's words: one book's title, or "abbr - abbr" of the stretch; never a section's name. */
const SECTION_WORDS = /\b(Law|History|Wisdom|Prophets|Minor Prophets|Gospels|Paul|Letters)\b/;
function wordsHold(grp) {
  expect(grp.name, grp.name).not.toMatch(SECTION_WORDS);
  expect(grp.title, grp.title).not.toMatch(SECTION_WORDS);
  expect(grp.name + grp.title, 'ASCII hyphens only (Permanent Rule 1)').not.toMatch(/[–—]/);
  if (grp.kind === 'book') {
    expect(grp.name).toBe(g.books[grp.books[0]].title);
    expect(grp.title).toBe(grp.name);
  } else if (grp.lo === grp.hi) {
    expect(grp.name).toBe(g.books[grp.lo].title);
  } else {
    expect(grp.name).toBe(g.books[grp.lo].abbr + ' - ' + g.books[grp.hi].abbr);
    expect(grp.title, 'the title in full').toBe(g.books[grp.lo].title + ' - ' + g.books[grp.hi].title);
  }
}

// Isaiah 53 deep in (the curtain): legs left to the Law, History, Wisdom and earlier Isaiah, right to
// later Isaiah, the other Prophets, the Minor Prophets and the New Testament
const LEFT = { Gen: 40, Exod: 22, Lev: 9, Deut: 30, Josh: 4, '1Sam': 6, '2Kgs': 12, Neh: 3, Esth: 2, Job: 18, Ps: 120, Prov: 25, Eccl: 3, Isa: 60 };
const RIGHT = { Isa: 50, Jer: 30, Lam: 4, Ezek: 15, Dan: 6, Hos: 8, Mic: 9, Zech: 14, Mal: 5, Matt: 50, Mark: 20, Luke: 40, John: 45, Acts: 30, Rom: 40, '1Cor': 10, Heb: 25, '1Pet': 20, Rev: 15 };

describe('sectionGroups: a side folded into runs of books, named by the books they reach', () => {
  it("folds a side by EXIT_SECTIONS, the frame's own book its own chip, every leg in one chip, no section words", () => {
    const c = census(LEFT, RIGHT, 'Isa');
    const row = { left: sectionGroups(g, c, 'left'), right: sectionGroups(g, c, 'right') };
    expect(names(row)).toBe('<Gen - Deut|<Josh - Esth|<Job - Song|<Isaiah|Isaiah>|Jer - Dan>|Hos - Mal>|Matt - John>|Acts>|Rom - Phlm>|Heb - Jude>|Revelation>');
    expect(row.left[2].title).toBe('Job - Song of Solomon');
    partitions(c, row);
    for (const grp of [...row.left, ...row.right]) wordsHold(grp);
  });

  it("a run the frame's book splits names its stretch, whether or not a book at its end has legs", () => {
    const withDan = census({}, { Jer: 3, Lam: 1, Dan: 2 }, 'Isa');
    const noDan = census({}, { Jer: 3, Lam: 1 }, 'Isa');
    const a = sectionGroups(g, withDan, 'right'), b = sectionGroups(g, noDan, 'right');
    expect(a.map((x) => x.name)).toEqual(['Jer - Dan']);
    expect(b.map((x) => x.name)).toEqual(['Jer - Dan']);
    expect([b[0].lo, b[0].hi]).toEqual([B('Jer'), B('Dan')]);
    // CONTROL: one book with legs is that book
    expect(sectionGroups(g, census({}, { Ezek: 2 }, 'Isa'), 'right').map((x) => x.name)).toEqual(['Ezekiel']);
  });

  it("the fold units are the canon's 66 books, each in one", () => {
    const all = EXIT_SECTIONS.flatMap((s) => Array.from({ length: s.hi - s.lo + 1 }, (_, k) => s.lo + k));
    expect(all).toEqual(Array.from({ length: 66 }, (_, k) => k));
    for (let b = 0; b < 66; b++) expect(sectionOf(b)).toBeGreaterThanOrEqual(0);
    expect(sectionOf(66)).toBe(-1);
    // fold units only: they carry no names a chip could wear
    for (const s of EXIT_SECTIONS) expect(Object.keys(s).sort()).toEqual(['hi', 'lo']);
  });
});

describe("fanGroups: a column's fan", () => {
  it('lists each side nearest first, at most `most` a side, every leg in exactly one chip', () => {
    const c = census(LEFT, RIGHT, 'Isa');
    for (const most of [5, 4, 3, 2, 1]) {
      const fan = fanGroups(g, c, most);
      expect(fan.left.length, 'most ' + most).toBeLessThanOrEqual(most);
      expect(fan.right.length, 'most ' + most).toBeLessThanOrEqual(most);
      partitions(c, fan);
      for (const grp of [...fan.left, ...fan.right]) wordsHold(grp);
      // nearest lowest: the left stack runs from the frame's book back to Genesis, the right one on
      for (let k = 1; k < fan.left.length; k++) expect(fan.left[k].hi).toBeLessThan(fan.left[k - 1].lo);
      for (let k = 1; k < fan.right.length; k++) expect(fan.right[k].lo).toBeGreaterThan(fan.right[k - 1].hi);
    }
  });

  it('a side with room keeps its books one chip each; one past it folds into runs, then merges the smallest pairs', () => {
    const c = census({}, { Jer: 3, Lam: 1, Ezek: 2, Hos: 4, Matt: 5 }, 'Isa');
    expect(fanGroups(g, c, 5).right.map((x) => x.name)).toEqual(['Jeremiah', 'Lamentations', 'Ezekiel', 'Hosea', 'Matthew']);
    expect(fanGroups(g, c, 4).right.map((x) => x.name)).toEqual(['Jer - Dan', 'Hosea', 'Matthew']);
    const two = fanGroups(g, c, 2).right;
    expect(two.length).toBe(2);
    // the smallest neighbouring pair merges: Hosea and Matthew (9) before Jeremiah's run and Hosea (10)
    expect(two.map((x) => x.count)).toEqual([6, 9]);
    expect(two.map((x) => x.name)).toEqual(['Jer - Dan', 'Hos - John']);
    expect(two[1].title).toBe('Hosea - John');
  });

  it("the frame's own book merges last", () => {
    const c = census({}, { Isa: 1, Jer: 30, Matt: 40, Rom: 20 }, 'Isa');
    const fan = mergeTo(g, c, bookGroups(g, c, 'right'), 2);
    expect(fan.map((x) => x.name)).toEqual(['Isaiah', 'Jer - Rom']);
  });
});

/* ── the census on the real asset: the Isaiah 53 deep frame (s06b), PC ── */
const isa = g.books.findIndex((b) => b.id === 'isaiah' || b.id.startsWith('isaiah-'));
const ch53 = g.chapters.find((c) => c[0] === isa && c[1] === 53);
const V = { W: 1600, H: 900, DPR: 1 };
const F = webFrame(V, false);
const SQ = geo.squashFactor(F.ceil, V.W);
const PPV = (V.W / g.total) * 208.8;
const CAMX = ch53[2] + 13.3;
const setAt = (camX = CAMX, ppv = PPV) => frameSetAt(g, 'famous', V.W, F.base, SQ, camX, 0, ppv, 1);

describe('exitCensus against the frame set (s06b, Isaiah 50-57 at 208.8x, PC)', () => {
  it('every drawn thread is exactly one of dome, leg or fly-over; each leg is counted once', () => {
    const set = setAt();
    const c = exitCensus(g, set, V.W);
    const { fx0, fx1, rankOf } = set.order;
    let dome = 0, leg = 0, fly = 0;
    const seen = new Set();
    for (let k = 0; k < set.count; k++) {
      const i = set.list[k];
      expect(seen.has(i), 'a thread drawn twice').toBe(false);
      seen.add(i);
      const r = rankOf[i];
      const on = (x) => x >= 0 && x <= V.W;
      const n = (on((fx0[r] - CAMX) * PPV + V.W / 2) ? 1 : 0) + (on((fx1[r] - CAMX) * PPV + V.W / 2) ? 1 : 0);
      if (n === 2) dome++; else if (n === 1) leg++; else fly++;
    }
    expect(dome + leg + fly).toBe(set.count);
    expect(c.legs).toBe(leg);
    const tally = [...c.left.count, ...c.right.count].reduce((a, b) => a + b, 0);
    expect(tally, "the books' tallies sum to the legs").toBe(c.legs);
    // the books' leg ids, side by side, are the legs, each once
    const ids = new Set();
    for (const side of ['left', 'right']) {
      const got = exitIds(g, set, V.W, side, 0, g.books.length - 1);
      for (const i of got) { expect(ids.has(i)).toBe(false); ids.add(i); }
    }
    expect(ids.size).toBe(c.legs);
    // the frame as measured: 1,814 drawn, 1,671 legs by the area's rule (a foot on [0, W]); the
    // shader's anchoring counts a foot up to FLYOVER_MARGIN past the edges, which reads 1,705 (the
    // prototype's figure): the difference is that rule, not the camera
    expect(set.count).toBe(1814);
    expect(c.legs).toBe(1671);
  });

  it("a column's census holds only the legs standing on its cell, and its chips' ids are the census's", () => {
    const set = setAt();
    const cell = { lo: ch53[2], hi: ch53[2] + 11 };
    const c = exitCensus(g, set, V.W, cell);
    expect(c.legs).toBeGreaterThan(0);
    const fan = fanGroups(g, c, 5);
    partitions(c, fan);
    let n = 0;
    for (const grp of [...fan.left, ...fan.right]) {
      const ids = exitIds(g, set, V.W, grp.side, grp.lo, grp.hi, cell);
      expect(ids.length, grp.name + ": the chip's count is its lines'").toBe(grp.count);
      for (const i of ids) {
        const near = grp.side === 'right' ? g.from[i] : g.to[i];
        expect(near >= cell.lo && near <= cell.hi).toBe(true);
      }
      n += ids.length;
    }
    expect(n).toBe(c.legs);
  });

  it('the memo: the same set serial, Wc and cell return the same census; a pan or a panel inset counts again', () => {
    const set = setAt();
    const cell = { lo: ch53[2], hi: ch53[2] + 11 };
    const a = exitCensus(g, set, V.W, cell);
    expect(exitCensus(g, set, V.W, { ...cell })).toBe(a);
    const inset = exitCensus(g, set, V.W - 400, cell);
    expect(inset).not.toBe(a);
    const moved = setAt(CAMX + 3);
    const panned = exitCensus(g, moved, V.W, cell);
    expect(panned).not.toBe(a);
    expect(exitCensus(g, moved, V.W, null)).not.toBe(panned);
  });

  it("the area's words: ASCII hyphens, a book's chapters or a chapter's verses", () => {
    const set = setAt();
    expect(areaOf(g, set, V.W).label).toMatch(/^Isaiah \d+-\d+$/);
    expect(areaLabel(g, ch53[2], ch53[2] + 11)).toBe('Isaiah 53:1-12');
  });
});
