/* A spread-out plan, second hostile review of claude/plans-1126-r2: a plan that opens with empty days, a pause or stop
   that holds the day, and a late reader who gets the next reading today instead of a rest day. */

import { describe, it, expect } from 'vitest';
import { dateOf, dayNum, dayItems, newRun, tickItem, runStatus, schedule, pauseRun, resumeRun, hasEmptyDays, streak, monthCells } from './plan-engine.js';
import { planStateLine } from '../ui/screens/ReadingPlansScreen.jsx';
import { doneToday, restDates } from '../utils/plan-reminder.js';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
const book = (b, n, days) => newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: Array.from({ length: n }, (_, i) => ({ k: b + ':' + (i + 1), w: 600 })) }], pace: { mode: 'days', n: days } }, at('2026-11-26'));
const layout = (run) => Array.from({ length: run.tracks ? 99 : 0 }, (_, d) => d).filter((d) => d < runStatus(run, at('2026-11-26')).total).map((d) => dayItems(run, d).map((it) => it.k).join());
const firstReading = (run, now) => schedule(run, now).find((d) => d.items.length).date;

describe('a plan that opens with empty days', () => {
  for (const [b, n, days, firstDay] of [['2pet', 3, 7, 1], ['jude', 1, 7, 3], ['obad', 1, 3, 1]]) {
    it(b + ' ' + n + ' chapter(s) over ' + days + ' days, made Thursday: Day 1, nothing late, first reading on its layout day', () => {
      const run = book(b, n, days);
      expect(hasEmptyDays(run)).toBe(true);
      expect(layout(run).findIndex((l) => l)).toBe(firstDay);
      const thu = at('2026-11-26');
      const st = runStatus(run, thu);
      expect(st.todayDay).toBe(0);
      expect(st.late).toBe(0);
      expect(st.behind).toBe(0);
      expect(st.spreadOn).toBe(dateOf(/** @type {number} */ (dayNum('2026-11-26')) + firstDay));
      expect(firstReading(run, thu)).toBe(st.spreadOn);
      expect(planStateLine(run, thu).rest).not.toMatch(/behind|Day 0/);
      // On the layout's first reading day the reading is today's, on Day firstDay + 1.
      const due = at(st.spreadOn);
      const then = runStatus(run, due);
      expect(then.spreadOn).toBe('');
      expect(then.todayDay).toBe(firstDay);
      expect(then.todayItems.map((it) => it.k)).toEqual([b + ':1']);
      expect(then.late).toBe(0);
    });
  }

  it('2 Peter over 7 days: the day before its first reading is Day ' + 1 + ', never Day 0', () => {
    const run = book('2pet', 3, 7);
    expect(runStatus(run, at('2026-11-26')).todayDay + 1).toBe(1);
    expect(runStatus(run, at('2026-11-27')).todayDay + 1).toBe(2);
  });
});

describe('a paused or stopped spread-out plan keeps its day', () => {
  it('Ruth 1 read Thursday, paused Friday: Day 2 on Friday, Saturday, Sunday and after resuming on Monday', () => {
    let run = tickItem(book('ruth', 4, 7), 'ruth:1', '2026-11-26', 1);
    run = pauseRun(run, at('2026-11-27'));
    const days = ['2026-11-27', '2026-11-28', '2026-11-29'].map((d) => runStatus(run, at(d)).todayDay + 1);
    const mon = at('2026-11-30');
    const resumed = resumeRun(run, mon);
    expect([...days, runStatus(resumed, mon).todayDay + 1]).toEqual([2, 2, 2, 2]);
    expect(planStateLine(run, at('2026-11-29'))).toMatchObject({ lead: 'Paused', rest: 'Day 2 of 7' });
  });

  it('Ruth 1 read Thursday, stopped Friday: the stopped day stays Day 2 a week later', () => {
    const run = { ...tickItem(book('ruth', 4, 7), 'ruth:1', '2026-11-26', 1), status: /** @type {'stopped'} */ ('stopped'), stopped: '2026-11-27' };
    expect(runStatus(run, at('2026-11-27')).todayDay + 1).toBe(2);
    expect(runStatus(run, at('2026-12-04')).todayDay + 1).toBe(2);
  });
});

describe('a late reader on a spread-out plan gets the next reading today', () => {
  it('Ruth 1 read a day late on Friday: on Saturday the card and the list both offer Ruth 2, nothing behind', () => {
    const run = tickItem(book('ruth', 4, 7), 'ruth:1', '2026-11-27', 1);
    const sat = at('2026-11-28');
    const st = runStatus(run, sat);
    expect(st.spreadOn).toBe('');
    expect(st.todayItems.map((it) => it.k)).toEqual(['ruth:2']);
    expect(st.late).toBe(0);
    const line = planStateLine(run, sat);
    expect(line.lead + ' ' + line.rest).not.toMatch(/Nothing to read today|behind/);
    // The reminder stays on: Saturday is not a rest day and not done.
    expect(restDates(run, sat)).toEqual([]);
    expect(doneToday(run, sat)).toBe(false);
  });

  it('a reader who starts late catches up: reading on each day offered, the plan finishes on its target', () => {
    let run = book('ruth', 4, 7);
    const target = run.target;
    // Ruth 1 two days late (Saturday), then whatever the card offers, read on the day it is offered.
    let n = /** @type {number} */ (dayNum('2026-11-28'));
    run = tickItem(run, 'ruth:1', dateOf(n), 1);
    const finishes = [];
    for (n++; n < (dayNum('2026-12-20') ?? 0); n++) {
      const st = runStatus(run, at(dateOf(n)));
      if (st.finished) break;
      finishes.push(st.projected);
      if (st.spreadOn) continue;
      for (const it of st.todayItems) run = tickItem(run, it.k, dateOf(n), 1);
    }
    expect(Object.entries(run.ticks).sort((a, b) => a[0].localeCompare(b[0]))).toEqual([['ruth:1', '2026-11-28'], ['ruth:2', '2026-11-29'], ['ruth:3', '2026-11-30'], ['ruth:4', '2026-12-02']]);
    expect(target).toBe('2026-12-02');
    // Each read day brings the finish closer (the old rule kept it two days late on every read): Thu Dec 3, then on time.
    expect(finishes).toEqual(['2026-12-03', '2026-12-02', '2026-12-02', '2026-12-02']);
  });
});

describe('a long spread-out plan\'s past is worked out once', () => {
  it('a second look at the week strip and the month (the card, the list, the page) does not redo each rest day', () => {
    // 300 chapters over 500 days (empty days between most readings), read on every day the card offered one.
    const items = Array.from({ length: 300 }, (_, i) => ({ k: 'b' + Math.floor(i / 20) + ':' + ((i % 20) + 1), w: 600 }));
    let run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items }], pace: { mode: 'days', n: 500 } }, at('2026-01-01'));
    const startN = /** @type {number} */ (dayNum('2026-01-01'));
    for (let n = startN; n < startN + 300; n++) {
      const st = runStatus(run, at(dateOf(n)));
      if (!st.spreadOn) for (const it of st.todayItems) run = tickItem(run, it.k, dateOf(n), 1);
    }
    // Count the passes over the plan's tracks (one per runStatus) through a counting view of the same array.
    let passes = 0;
    const tracks = new Proxy(run.tracks, { get: (t, p, r) => { if (p === Symbol.iterator) passes++; return Reflect.get(t, p, r); } });
    const watched = { ...run, tracks };
    const now = at(dateOf(startN + 300));
    const first = streak(watched, now).inRow;
    const once = passes;
    passes = 0;
    expect(streak(watched, now).inRow).toBe(first);
    monthCells(watched, now.getFullYear(), now.getMonth(), now);
    expect(first).toBeGreaterThan(60);
    expect(once).toBeGreaterThan(60);
    expect(passes).toBeLessThan(once / 4);
  });
});
