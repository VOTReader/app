/* rp1 — the reading-plan schedules (data/reading-plans.js). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  BIBLE_BOOKS, BIBLE_CHAPTER_COUNT, BIBLE_YEAR_DAYS, biblePortion, volumeSequence, volumesPortion, volumesDays,
  dayIndex, localDateKey, planStatus,
} from './reading-plans.js';

const dataDir = dirname(fileURLToPath(import.meta.url));
function loadVar(file, varName) {
  const sb = {}; sb.window = sb;
  runInNewContext(readFileSync(resolve(dataDir, file), 'utf8'), sb, { filename: file });
  return sb[varName];
}

describe('Bible in a Year', () => {
  it('the fixed table is the shipped canon: same ids, same chapter numbers, 1,189 chapters', () => {
    const BOOKS = loadVar('books.js', 'BOOKS');
    const MATTHEW_PLAIN = loadVar('matthew-plain.js', 'MATTHEW_PLAIN');
    expect(BIBLE_CHAPTER_COUNT).toBe(1189);
    expect(BIBLE_BOOKS.length).toBe(66);
    for (const [id, , n] of BIBLE_BOOKS) {
      const book = id === 'matthew-plain' ? MATTHEW_PLAIN : BOOKS[id];
      expect(book, id).toBeTruthy();
      expect(book.chapters.map((c) => c.num), id).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });

  it('365 days read every chapter exactly once, in order, 3 or 4 a day', () => {
    const seen = [];
    for (let d = 0; d < BIBLE_YEAR_DAYS; d++) {
      const p = biblePortion(d);
      expect(p.items.length).toBeGreaterThanOrEqual(3);
      expect(p.items.length).toBeLessThanOrEqual(4);
      seen.push(...p.items.map((i) => i.bid + ':' + i.cid));
    }
    expect(seen.length).toBe(1189);
    expect(new Set(seen).size).toBe(1189);
    expect(seen[0]).toBe('genesis:1');
    expect(seen[1188]).toBe('revelation:22');
  });

  it('labels a portion the way a reader says it', () => {
    expect(biblePortion(0).label).toBe('Genesis 1-3');
    expect(biblePortion(364).label).toBe('Revelation 20-22');
    const cross = Array.from({ length: 365 }, (_, d) => biblePortion(d).label).find((l) => l.includes(' - '));
    expect(cross).toMatch(/^Genesis \d+ - Exodus \d+$/);
    expect(biblePortion(365)).toEqual({ items: [], label: '' });
    expect(biblePortion(-1)).toEqual({ items: [], label: '' });
  });
});

describe('The Volumes in order', () => {
  const cols = new Map([
    ['one', { volKey: 'one', readKey: 'vot-one', letterScreen: 'vot-one-letter', short: 'Volume One' }],
    ['empty', { volKey: 'empty', readKey: 'vot-empty', letterScreen: 'x', short: 'Empty' }],
    ['two', { volKey: 'two', readKey: 'vot-two', letterScreen: 'vot-letter', short: 'Volume Two' }],
    ['garden', { volKey: 'garden', short: 'Garden' }], // no letter screen: not a reading collection
  ]);
  const letters = { one: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], two: [{ id: 'c', title: 'C' }] };
  const seq = volumeSequence({
    chain: ['one', 'empty', 'two', 'garden'], colByKey: cols,
    letters: (c) => letters[c.volKey] || [], preface: (c) => (c.volKey === 'one' ? { id: 'pref', title: 'A Word of Warning' } : null),
  });

  it('prefaces first, then letters, collection by collection in site order', () => {
    expect(seq.map((e) => e.bid + ':' + e.cid)).toEqual(['vot-one:pref', 'vot-one:a', 'vot-one:b', 'vot-two:c']);
  });

  it('portions at the reader\'s pace, the last day short', () => {
    expect(volumesDays(seq, 3)).toBe(2);
    expect(volumesPortion(seq, 0, 3).label).toBe('Volume One: A Word of Warning and 2 more');
    expect(volumesPortion(seq, 1, 3)).toEqual({ items: [{ bid: 'vot-two', cid: 'c' }], label: 'Volume Two: C' });
    expect(volumesPortion(seq, 1, 2).label).toBe('Volume One: B - Volume Two: C');
    expect(volumesPortion(seq, 9, 2).items).toEqual([]);
  });
});

describe('days', () => {
  it('counts calendar dates, whatever the hour', () => {
    expect(dayIndex('2026-09-24', new Date(2026, 8, 24, 0, 1))).toBe(0);
    expect(dayIndex('2026-09-24', new Date(2026, 8, 24, 23, 59))).toBe(0);
    expect(dayIndex('2026-09-24', new Date(2026, 8, 25, 0, 0))).toBe(1);
    expect(dayIndex('2026-02-27', new Date(2026, 2, 30, 12))).toBe(31);  // across a DST change
    expect(dayIndex('junk', new Date())).toBe(0);
    expect(localDateKey(new Date(2026, 0, 5, 23))).toBe('2026-01-05');
  });
});

describe('planStatus', () => {
  const read = new Set();
  const isRead = (bid, cid) => read.has(bid + ':' + cid);
  const plan = { id: 'bible-year', start: '2026-09-01' };

  it('day 3, nothing read: behind 2 days, catch up from day 0, today not done', () => {
    read.clear();
    const s = planStatus(plan, new Date(2026, 8, 3, 9), isRead);
    expect(s).toMatchObject({ day: 2, totalDays: 365, todayDone: false, doneDays: 0, behind: 2, catchUpDay: 0, percent: 0 });
    expect(s.today.label).toBe(biblePortion(2).label);
  });

  it('reading the day\'s chapters from anywhere ticks it; reading ahead counts', () => {
    read.clear();
    for (const d of [0, 1, 2, 3]) for (const i of biblePortion(d).items) read.add(i.bid + ':' + i.cid);
    const s = planStatus(plan, new Date(2026, 8, 3, 9), isRead);
    expect(s).toMatchObject({ todayDone: true, doneDays: 4, behind: 0, catchUpDay: -1, percent: 1 });
  });

  it('a partly read day is not done', () => {
    read.clear();
    read.add('genesis:1');
    expect(planStatus(plan, new Date(2026, 8, 1), isRead).todayDone).toBe(false);
  });

  it('holds on the last day after the plan ends, and waits for the Volumes to load', () => {
    read.clear();
    expect(planStatus(plan, new Date(2027, 11, 1), isRead).day).toBe(364);
    expect(planStatus({ id: 'volumes', start: '2026-09-01', pace: 2 }, new Date(2026, 8, 2), isRead, [])).toBeNull();
    expect(planStatus({ id: 'nope', start: '2026-09-01' }, new Date(), isRead)).toBeNull();
  });
});
