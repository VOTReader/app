/* The plans list says what the Today card says on a spread-out plan (the hostile review of claude/plans-1126-r2):
   Ruth's 4 chapters over 7 days, made Thursday Nov 26 2026 (readings on days 1, 3, 5 and 7). */

import { describe, it, expect } from 'vitest';
import { newRun, tickItem, runStatus } from '../../data/plan-engine.js';
import { runRow } from '../../utils/plan-runs-view.js';
import { planStateLine, stoppedLine } from './ReadingPlansScreen.jsx';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
const ruth = () => newRun({ plan: 'custom', name: 'Ruth', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 7 } }, at('2026-11-26'));
/** The Today card's line under the title (TodayCard PlanRow): "Sat Nov 28: Ruth 2" once done or on an empty day. */
const cardSub = (row) => (row.done ? (row.nextWhen || 'Tomorrow') + ': ' + row.tomorrow : row.rest ? row.nextWhen + ': ' + row.label : '');

describe('the plans list on a spread-out plan', () => {
  it('Thursday, Ruth 1 read: "Done today" with Ruth 2 on Saturday, as the card says, never "tomorrow"', () => {
    const run = tickItem(ruth(), 'ruth:1', '2026-11-26', 1);
    const now = at('2026-11-26', 20);
    expect(cardSub(runRow(run, now))).toBe('Sat Nov 28: Ruth 2');
    expect(planStateLine(run, now)).toMatchObject({ lead: 'Done today', rest: 'Sat Nov 28: Ruth 2' });
  });

  it('Friday, the empty day: "Nothing to read today" with Ruth 2 on Saturday, never "Today: Ruth 2"', () => {
    const run = tickItem(ruth(), 'ruth:1', '2026-11-26', 1);
    const now = at('2026-11-27');
    const row = runRow(run, now);
    expect(row.rest).toBe(true);
    expect(cardSub(row)).toBe('Sat Nov 28: Ruth 2');
    expect(planStateLine(run, now)).toMatchObject({ lead: 'On track', rest: 'Nothing to read today · Sat Nov 28: Ruth 2' });
  });

  it('Saturday, Ruth 2 due: "Today: Ruth 2" as before', () => {
    const run = tickItem(ruth(), 'ruth:1', '2026-11-26', 1);
    expect(planStateLine(run, at('2026-11-28'))).toMatchObject({ lead: 'On track', rest: 'Today: Ruth 2' });
  });

  it('stopped on the empty day: its own day (Day 2), as the card counts it, never the next reading\'s', () => {
    const run = tickItem(ruth(), 'ruth:1', '2026-11-26', 1);
    const now = at('2026-11-27');
    expect(runStatus(run, now).todayDay).toBe(1);
    const stopped = { ...run, status: 'stopped', stopped: '2026-11-27' };   // what Stop saves (plan-runs-view stopRun)
    expect(stoppedLine(stopped, now)).toBe('Stopped Nov 27 · day 2 of 7');
  });
});
