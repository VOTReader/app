/* A spread-out plan, second hostile review of claude/plans-1126-r2: a plan that opens with empty days, a pause or stop
   that holds the day, and a late reader who gets the next reading today instead of a rest day. */

import { describe, it, expect } from 'vitest';
import { dateOf, dayNum, dayItems, newRun, tickItem, runStatus, schedule, hasEmptyDays } from './plan-engine.js';
import { planStateLine } from '../ui/screens/ReadingPlansScreen.jsx';

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
