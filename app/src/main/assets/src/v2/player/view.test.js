/* What the v2 player says (rv1): clocks, speed and sleep words, the cover, the mini player's line and up next. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  clock, timeLeft, progressPct, rateLabel, speedWords, ratePct, clampRate, sleepChip, sleepChoice, trackInfo, miniLine,
  upNextRows, initials,
} from './view.js';

const g = /** @type {any} */ (globalThis);

beforeEach(() => {
  g.COL_BY_KEY = new Map([
    ['one', { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' }],
    ['wtlb1', { volKey: 'wtlb1', label: 'Words to Live By', globalName: 'WTLB_ONE' }],
  ]);
  g.LETTERS_V1 = [
    { id: 'a-word-of-warning', title: 'A Word of Warning', date: '' },
    { id: 'chosen-by-god', num: 1, title: 'Chosen by God', date: '8/31/04' },
    { id: 'honor', num: 2, title: 'Honor Not the Day of the Dead... Honor God', date: '10/6/04' },
  ];
  g.BIBLE_AUDIO_BOOKS = Array.from({ length: 66 }, (_, i) => [i === 0 ? 'genesis' : i === 42 ? 'john' : 'b' + i, i === 42 ? 'John' : 'Book']);
  g.BIBLE_AUDIO_EDITIONS = { 'wop-nkjv': { volKey: 'bible-wop-nkjv', translation: 'nkjv', label: 'NKJV · The Word of Promise' } };
});
afterEach(() => {
  delete g.COL_BY_KEY; delete g.LETTERS_V1; delete g.BIBLE_AUDIO_BOOKS; delete g.BIBLE_AUDIO_EDITIONS;
});

describe('clocks', () => {
  it('3:51 and −6:17 add up to 10:08; an hour shows hours', () => {
    expect(clock(231)).toBe('3:51');
    expect(clock(231.9)).toBe('3:51');
    expect(timeLeft(231.9, 608.4)).toBe('−6:17');
    expect(clock(3725)).toBe('1:02:05');
    expect(clock(NaN)).toBe('0:00');
    expect(progressPct(231, 608)).toBe(37.99);
    expect(progressPct(5, 0)).toBe(0);
  });
});

describe('speed', () => {
  it('labels, words and the slider place', () => {
    expect(rateLabel(1)).toBe('1×');
    expect(rateLabel(1.25)).toBe('1.25×');
    expect(rateLabel(0.7500000001)).toBe('0.75×');
    expect(speedWords(1)).toBe('Normal speed');
    expect(speedWords(0.99)).toBe('Slower than recorded');
    expect(speedWords(1.25)).toBe('Faster than recorded');
    expect(ratePct(1.25)).toBe(30);
    expect(ratePct(9)).toBe(100);
    expect(clampRate(1.25 + 0.01)).toBe(1.26);
    expect(clampRate(0.2)).toBe(0.5);
    expect(clampRate(3.5)).toBe(3);
  });
});

describe('sleep timer', () => {
  it('the chip shows what runs; the sheet ticks it', () => {
    expect(sleepChip({}, 0)).toBe('Sleep timer');
    expect(sleepChip({ sleepMinutes: 30 }, 1440)).toBe('24 min');
    expect(sleepChip({ sleepMinutes: 30 }, 1439)).toBe('24 min');
    expect(sleepChip({ sleepAtTrackEnd: true }, 0)).toBe('End of recording');
    expect(sleepChoice({ sleepMinutes: 30 }, 1440)).toBe(30);
    expect(sleepChoice({ sleepAtTrackEnd: true }, 0)).toBe('end');
    expect(sleepChoice({ sleepMinutes: 30 }, 0)).toBe('off');
  });
});

describe('trackInfo', () => {
  it('a letter: overline, title, reader, the volume numeral', () => {
    const info = trackInfo({ key: 'one:chosen-by-god', title: 'x', sub: 'Volume One', readerCode: 'B' });
    expect(info).toMatchObject({ kind: 'letter', title: 'Chosen by God', overline: 'Volume One · Letter 1', by: 'Read by Benjamin',
      mini: 'Volume One · Benjamin', cover: { cn: 'I', cl: 'Volume One', sm: false }, date: '8/31/04', collection: 'one', n: 1 });
  });
  it('a preface has no number; another collection draws its initials', () => {
    expect(trackInfo({ key: 'one:a-word-of-warning', readerCode: 'B' }).overline).toBe('Volume One');
    g.WTLB_ONE = [{ id: 'w1', num: 1, title: 'Love' }];
    expect(trackInfo({ key: 'wtlb1:w1', readerCode: 'V' })).toMatchObject({ cover: { cn: 'WL', sm: true }, mini: 'Words to Live By · Text-to-speech' });
    delete g.WTLB_ONE;
    expect(initials('The Blessed')).toBe('B');
  });
  it('a Bible chapter: NT / OT, the translation', () => {
    const john = trackInfo({ key: 'bible-wop-nkjv:john', title: 'John 3', readerCode: 'B' });
    expect(john).toMatchObject({ kind: 'bible', title: 'John 3', mini: 'The Scriptures of Truth · NKJV', cover: { cn: 'NT', sm: true } });
    expect(trackInfo({ key: 'bible-wop-nkjv:genesis', title: 'Genesis 1' }).cover.cn).toBe('OT');
  });
  it('a letter whose volume has not loaded yet still names itself', () => {
    delete g.LETTERS_V1;
    expect(trackInfo({ key: 'one:chosen-by-god', title: 'Chosen by God', readerCode: 'B' })).toMatchObject({ title: 'Chosen by God', overline: 'Volume One' });
  });
});

describe('miniLine', () => {
  const info = { mini: 'Volume One · Benjamin' };
  it('playing: collection and reader; paused: also the minutes left (picture 0a)', () => {
    expect(miniLine(info, { status: 'playing', time: 231, duration: 608 })).toBe('Volume One · Benjamin');
    expect(miniLine(info, { status: 'paused', time: 231, duration: 608 })).toBe('Volume One · Benjamin · 6 min left');
    expect(miniLine(info, { status: 'paused', time: 600, duration: 608 })).toBe('Volume One · Benjamin · 1 min left');
  });
});

describe('upNextRows', () => {
  it('the playing item first, numbered by queue position; the rest by date', () => {
    const queue = [{ key: 'one:chosen-by-god', readerCode: 'B' }, { key: 'one:honor', readerCode: 'B' }];
    const { rows, count } = upNextRows({ status: 'playing', queue, qi: 0 });
    expect(count).toBe('1 of 2');
    expect(rows.map((r) => [r.no, r.title, r.sub, r.current])).toEqual([
      [1, 'Chosen by God', 'Playing now · Benjamin', true],
      [2, 'Honor Not the Day of the Dead... Honor God', '10/6/04', false],
    ]);
    expect(upNextRows({ status: 'paused', queue, qi: 1 }).rows).toHaveLength(1);
    expect(upNextRows({ status: 'paused', queue, qi: 1 }).rows[0].sub).toBe('Paused · Benjamin');
    expect(upNextRows({ status: 'idle', queue: [], qi: 0 })).toEqual({ rows: [], count: '' });
  });
});
