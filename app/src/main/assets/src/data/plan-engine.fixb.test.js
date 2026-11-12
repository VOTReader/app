/* FIXB (2026-11-12): the review fixes in reading plans, each with a main-shaped stored run where the store is read. */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { dayNum, dateOf, dayItems, newRun, runStatus, tickItem, finishUnseen, markDay, changePace, changeWeekdays, catchUp, totalDays,
  againPace, firstRecutDate } from './plan-engine.js';
import { BIBLE_BOOKS } from './reading-plans.js';
import { ReadingPlanStore } from '../stores/reading-plan-store.js';
import { useTodayRows } from '../ui/components/TodayCard.jsx';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
const bibleItems = () => BIBLE_BOOKS.flatMap(([bid, , n]) => Array.from({ length: Number(n) }, (_, i) => ({ k: bid + ':' + (i + 1), w: 600 })));
const plus = (s, n) => dateOf(/** @type {number} */ (dayNum(s)) + n);
const ALL_DAYS = [true, true, true, true, true, true, true];
const bibleYear = (now, extra = {}) => newRun({ plan: 'bible-year', tracks: [{ kind: 'bible', by: 'count', items: bibleItems() }], pace: { mode: 'days', n: 365 }, ...extra }, now);
const readDay = (run, d, date) => dayItems(run, d).reduce((r, it) => tickItem(r, it.k, date, 1), run);
const readDays = (run, from, n) => { for (let d = 0; d < n; d++) run = readDay(run, d, plus(from, d)); return run; };
/** What is left of the run, from the first day not read, and how many days it is cut into. */
const leftOf = (run, now) => { const st = runStatus(run, now); return { days: st.total - st.day, today: st.todayItems.length }; };

afterEach(cleanup);

describe('1. a plan finished before the update stays put away (TodayCard.jsx:47)', () => {
  // A finished run exactly as main stored it: no `seen` field (main had none).
  const MAIN_FINISHED = {
    id: 'run_psalms_main', plan: 'psalms', created: 1, updated: 2, start: '2026-09-01', status: 'finished', finished: '2026-09-30',
    tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'psalms:1', w: 200 }, { k: 'psalms:2', w: 200 }] }], share: 'side',
    weekdays: ALL_DAYS, segs: [{ day0: 0, from: [0], to: [2], days: 2 }], target: '2026-09-02',
    ticks: { 'psalms:1': '2026-09-01', 'psalms:2': '2026-09-30' }, pauses: [], pace: { mode: 'days', n: 2 },
  };
  beforeEach(() => { localStorage.clear(); ReadingPlanStore._resetForTests({ forceLoaded: true }); });

  it('a main-shaped finished run counts as seen; a finish made now waits to be seen', () => {
    expect(finishUnseen(MAIN_FINISHED)).toBe(false);
    let run = newRun({ plan: 'psalms', tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'psalms:1', w: 200 }, { k: 'psalms:2', w: 200 }] }], pace: { mode: 'days', n: 2 } }, at('2026-11-10'));
    run = tickItem(run, 'psalms:1', '2026-11-10', 1);
    expect(finishUnseen(run)).toBe(false);
    run = tickItem(run, 'psalms:2', '2026-11-11', 2);
    expect(run.status).toBe('finished');
    expect(finishUnseen(run)).toBe(true);
    expect(finishUnseen({ ...run, seen: true })).toBe(false);
  });

  it('the Read tab shows "You finished" for the new finish only, and the old run is stored unchanged', () => {
    const json = JSON.stringify(MAIN_FINISHED);
    let fresh = newRun({ plan: 'gospels', tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'john:1', w: 200 }] }], pace: { mode: 'days', n: 1 } }, at('2026-11-10'));
    fresh = markDay(fresh, 0, true, at('2026-11-10'));
    ReadingPlanStore.replaceAll(JSON.parse(JSON.stringify([MAIN_FINISHED, fresh])));
    const g = /** @type {any} */ (globalThis);
    const had = g.ReadingPlanStore;
    g.ReadingPlanStore = ReadingPlanStore;
    try {
      const { result } = renderHook(() => useTodayRows(undefined, () => false));
      expect(result.current.filter((r) => r.finished).map((r) => r.id)).toEqual([fresh.id]);
    } finally { g.ReadingPlanStore = had; }
    expect(JSON.stringify(ReadingPlanStore.get(MAIN_FINISHED.id))).toBe(json);
  });
});

describe('2. a shorter Length or a Finish-by date never crams the rest into one day (plan-engine.js:590, :488)', () => {
  it('Length 90 days on day 100 of the Bible year: what is left is shared, at most twice a 90-day plan a day', () => {
    const run = readDays(bibleYear(at('2026-07-01')), '2026-07-01', 100);
    const now = at(plus('2026-07-01', 100));
    const next = changePace(run, { mode: 'days', n: 90 }, now);
    const { days, today } = leftOf(next, now);
    expect(days).toBeGreaterThan(30);
    expect(today).toBeLessThanOrEqual(Math.ceil(2 * 1189 / 90));
    expect(Object.keys(next.ticks).length).toBe(Object.keys(run.ticks).length);
  });
  it('Psalms on day 20, then 15 days: still more than one day', () => {
    const items = Array.from({ length: 150 }, (_, i) => ({ k: 'psalms:' + (i + 1), w: 300 }));
    let run = newRun({ plan: 'psalms', tracks: [{ kind: 'bible', by: 'count', items }], pace: { mode: 'days', n: 30 } }, at('2026-10-01'));
    run = readDays(run, '2026-10-01', 20);
    const now = at('2026-10-21');
    expect(leftOf(changePace(run, { mode: 'days', n: 15 }, now), now).days).toBeGreaterThan(1);
  });
  it('"90 days" still means 90 early on (plans2)', () => {
    const run = readDays(bibleYear(at('2026-11-01')), '2026-11-01', 10);
    expect(totalDays(changePace(run, { mode: 'days', n: 90 }, at('2026-11-11')))).toBe(90);
  });
  it('Run it again on a Finish-by plan runs over as many days as it had, not one', () => {
    let run = newRun({ plan: 'psalms', tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'psalms:1', w: 1 }, { k: 'psalms:2', w: 1 }, { k: 'psalms:3', w: 1 }] }],
      pace: { mode: 'by', date: '2026-10-03' } }, at('2026-10-01'));
    expect(totalDays(run)).toBe(3);
    const again = newRun({ plan: run.plan, tracks: run.tracks, pace: againPace(run) }, at('2026-11-12'));
    expect(totalDays(again)).toBe(3);
    expect(againPace({ ...run, pace: { mode: 'days', n: 30 } })).toEqual({ mode: 'days', n: 30 });
  });
  it('a weekday change on a Finish-by plan whose date has passed keeps the days left', () => {
    let run = bibleYear(at('2026-10-01'), { pace: { mode: 'by', date: '2026-12-31' } });
    const now = at('2027-01-05');   // ran late: the date is behind
    const before = leftOf(run, now).days;
    const next = changeWeekdays(run, [false, true, true, true, true, true, false], now);
    expect(leftOf(next, now).days).toBe(before);
  });
  it('Keep my daily amount moves a Finish-by date with the finish, so a weekday change after it does not cram', () => {
    let run = bibleYear(at('2026-10-01'), { pace: { mode: 'by', date: '2027-09-30' } });
    run = readDays(run, '2026-10-01', 5);
    const now = at('2026-10-20');   // 14 days not read
    const kept = catchUp(run, now);
    expect(kept.pace).toEqual({ mode: 'by', date: kept.target });
    expect(leftOf(changeWeekdays(kept, [false, true, true, true, true, true, false], now), now).days).toBeGreaterThan(200);   // weekdays only to the moved date
  });
  it('Finish by today after today is read changes nothing; the date field starts at the first day it can cut from', () => {
    let run = readDays(bibleYear(at('2026-11-01')), '2026-11-01', 12);   // day 12 read on 11-12
    const now = at('2026-11-12', 20);
    expect(runStatus(run, now).doneToday).toBe(true);
    expect(changePace(run, { mode: 'by', date: '2026-11-12' }, now)).toBe(run);
    expect(firstRecutDate(run, now)).toBe('2026-11-13');
    expect(leftOf(changePace(run, { mode: 'by', date: '2026-11-13' }, now), now).days).toBe(1);
  });
});
