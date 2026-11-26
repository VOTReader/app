/* A spread-out plan's past (the hostile review of claude/plans-1126-r2): the week strip, days in a row and the month
   calendar follow what the Today card told the reader on each date. Ruth's 4 chapters over 7 days, made Thursday
   Nov 26 2026, hold readings on days 1, 3, 5 and 7; the next reading follows the date the last one was finished. */

import { describe, it, expect } from 'vitest';
import { dayNum, dateOf, todayKey, dayItems, newRun, tickItem, streak, monthCells, runStatus, hasEmptyDays } from './plan-engine.js';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
const ruth = () => newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 7 } }, at('2026-11-26'));
const read = (run, ch, date) => tickItem(run, 'ruth:' + ch, date, 1);
const novState = (run, now) => Object.fromEntries(monthCells(run, 2026, 10, now).filter((c) => c.date >= 26).map((c) => [c.date, c.state]));
/** What the Today card said on each date from the 26th to the day before `now`: the date its next reading fell on. */
const cardSaid = (run, now) => {
  const out = {};
  for (let n = /** @type {number} */ (dayNum('2026-11-26')); n < /** @type {number} */ (dayNum(todayKey(now))); n++) {
    const key = dateOf(n);
    const ticks = Object.fromEntries(Object.entries(run.ticks).filter(([, v]) => v < key));
    out[key] = runStatus({ ...run, ticks }, at(key)).spreadOn;
  }
  return out;
};

describe('a spread-out plan\'s past follows what the reader was told', () => {
  it('the layout: Ruth 1, 2, 3 and 4 on days 1, 3, 5 and 7', () => {
    const run = ruth();
    expect(hasEmptyDays(run)).toBe(true);
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => dayItems(run, d).map((it) => it.k).join())).toEqual(['ruth:1', '', 'ruth:2', '', 'ruth:3', '', 'ruth:4']);
  });

  it('A: Ruth 1 read Friday, rest Saturday as told, Ruth 2 Sunday: Saturday is never missed, 2 days in a row', () => {
    let run = read(ruth(), 1, '2026-11-27');
    expect(runStatus(run, at('2026-11-28')).spreadOn).toBe('2026-11-29');   // Saturday: "Nothing to read today · Sun Nov 29: Ruth 2"
    run = read(run, 2, '2026-11-29');
    const now = at('2026-11-30');
    expect(cardSaid(run, now)['2026-11-28']).toBe('2026-11-29');
    expect(novState(run, now)).toEqual({ 26: 'missed', 27: 'read', 28: 'none', 29: 'read', 30: 'today' });
    expect(streak(run, now).inRow).toBe(2);
  });

  it('A, Sunday skipped: Sunday (when Ruth 2 was due) is missed and ends the days in a row', () => {
    const run = read(ruth(), 1, '2026-11-27');
    const now = at('2026-11-30');
    expect(novState(run, now)).toEqual({ 26: 'missed', 27: 'read', 28: 'none', 29: 'missed', 30: 'today' });
    expect(streak(run, now).inRow).toBe(0);
    expect(streak(run, now).week.find((w) => w.date === '2026-11-29').missed).toBe(true);
  });

  it('B: Ruth 1 Thursday, Ruth 2 Friday (its empty day), Ruth 3 Sunday: Saturday is a rest day, 3 days in a row', () => {
    let run = read(ruth(), 1, '2026-11-26');
    run = read(run, 2, '2026-11-27');
    expect(runStatus(run, at('2026-11-28')).spreadOn).toBe('2026-11-29');
    run = read(run, 3, '2026-11-29');
    const now = at('2026-11-30');
    expect(novState(run, now)).toEqual({ 26: 'read', 27: 'read', 28: 'none', 29: 'read', 30: 'today' });
    expect(streak(run, now).inRow).toBe(3);
  });

  it('a date is missed exactly when the card had a reading due that day and none was read', () => {
    let run = read(ruth(), 1, '2026-11-26');
    run = read(run, 2, '2026-11-30');   // two days late
    const now = at('2026-12-04');
    const said = cardSaid(run, now);
    const cells = [...monthCells(run, 2026, 10, now), ...monthCells(run, 2026, 11, now).map((c) => ({ ...c, date: c.date + 30 }))];
    for (const [key, spreadOn] of Object.entries(said)) {
      const n = /** @type {number} */ (dayNum(key)) - /** @type {number} */ (dayNum('2026-11-01')) + 1;
      const cell = cells.find((c) => c.date === n);
      const readThen = Object.values(run.ticks).includes(key);
      expect([key, cell.state]).toEqual([key, readThen ? 'read' : spreadOn > key ? 'none' : 'missed']);
    }
  });
});
