/* reading-plan-view (rp1): what the Today card and the Plans screen show, from
   the plans in settings and the app's own read record. */
import { describe, it, expect } from 'vitest';
import { readingPlansOf, todayRows, startPlan, stopPlan, monthDays, PLAN_NAMES } from './reading-plan-view.js';

const NOW = new Date(2026, 8, 25, 9, 0);   // 25 September 2026, local
const none = () => false;

describe('readingPlansOf', () => {
  it('keeps the known plans with a start date, once each', () => {
    const s = { readingPlans: [{ id: 'bible-year', start: '2026-09-25' }, { id: 'nope', start: '2026-09-25' },
      { id: 'bible-year', start: '2026-01-01' }, { id: 'volumes' }, null] };
    expect(readingPlansOf(s)).toEqual([{ id: 'bible-year', start: '2026-09-25' }]);
    expect(readingPlansOf({})).toEqual([]);
    expect(readingPlansOf(null)).toEqual([]);
  });
});

describe('todayRows', () => {
  it('names day one of Bible in a Year and where to start', () => {
    const [row] = todayRows([{ id: 'bible-year', start: '2026-09-25' }], NOW, none, []);
    expect(row).toMatchObject({ id: 'bible-year', name: PLAN_NAMES['bible-year'], label: 'Genesis 1-3', done: false,
      day: 0, totalDays: 365, percent: 0, behind: 0 });
    expect(row.next).toEqual({ bid: 'genesis', cid: 1 });
  });

  it('starts at the first chapter not yet read, and a day read through is done', () => {
    const read = (bid, cid) => bid === 'genesis' && cid <= 1;
    expect(todayRows([{ id: 'bible-year', start: '2026-09-25' }], NOW, read, [])[0].next).toEqual({ bid: 'genesis', cid: 2 });
    const all = (bid, cid) => bid === 'genesis' && cid <= 3;
    expect(todayRows([{ id: 'bible-year', start: '2026-09-25' }], NOW, all, [])[0].done).toBe(true);
  });

  it('counts the days behind, never as a failure', () => {
    const [row] = todayRows([{ id: 'bible-year', start: '2026-09-22' }], NOW, none, []);
    expect(row.day).toBe(3);
    expect(row.behind).toBe(3);
  });

  it('waits for the Volumes to load before it names a portion', () => {
    const [row] = todayRows([{ id: 'volumes', start: '2026-09-25', pace: 2 }], NOW, none, []);
    expect(row).toMatchObject({ id: 'volumes', loading: true, label: '' });
    const seq = [{ bid: 'volume-one', cid: 'a', title: 'A', volKey: 'one', short: 'Vol I' },
      { bid: 'volume-one', cid: 'b', title: 'B', volKey: 'one', short: 'Vol I' },
      { bid: 'volume-one', cid: 'c', title: 'C', volKey: 'one', short: 'Vol I' }];
    const [ready] = todayRows([{ id: 'volumes', start: '2026-09-25', pace: 2 }], NOW, none, seq);
    expect(ready.loading).toBe(false);
    expect(ready.next).toEqual({ bid: 'volume-one', cid: 'a' });
    expect(ready.totalDays).toBe(2);
  });
});

describe('startPlan / stopPlan', () => {
  it('starts a plan today (once), keeps the others, and stops one', () => {
    const one = startPlan([], 'bible-year', NOW);
    expect(one).toEqual([{ id: 'bible-year', start: '2026-09-25' }]);
    const two = startPlan(one, 'volumes', NOW, 3);
    expect(two).toEqual([{ id: 'bible-year', start: '2026-09-25' }, { id: 'volumes', start: '2026-09-25', pace: 3 }]);
    expect(startPlan(two, 'bible-year', NOW)).toBe(two);
    expect(stopPlan(two, 'bible-year')).toEqual([{ id: 'volumes', start: '2026-09-25', pace: 3 }]);
  });
});

describe('monthDays', () => {
  it('marks each day of the month done, missed, today or ahead, and blank outside the plan', () => {
    const plan = { id: 'bible-year', start: '2026-09-23' };
    // day 0 (Genesis 1-3) and day 2 (Genesis 8-10) read; day 1 (24 Sep, Genesis 4-7) missed; 25 Sep is today
    const read = (bid, cid) => bid === 'genesis' && ((cid >= 1 && cid <= 3) || (cid >= 8 && cid <= 10));
    const days = monthDays(plan, NOW, read, []);
    const at = (d) => days.find((x) => x.date === d);
    expect(days.length).toBe(30);
    expect(at(22).state).toBe('none');
    expect(at(23).state).toBe('done');
    expect(at(24).state).toBe('missed');
    expect(at(25).state).toBe('today');
    expect(at(25).done).toBe(true);
    expect(at(26).state).toBe('ahead');
    expect(days[0].weekday).toBe(2);   // 1 September 2026 is a Tuesday
  });
});
