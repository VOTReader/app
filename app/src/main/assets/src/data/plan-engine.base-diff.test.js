/* plan-engine against 03d0ea090 (before spread-out plans): a plan that reads one day after another keeps its days in a
   row, week strip and month calendar exactly (the hostile review of claude/plans-1126-r2: a behind reader's missed days
   had vanished and days in a row counted across gaps). The one change kept on purpose: when today is not a reading
   day, the days ahead in the month are numbered from today's portion, not one past it. */

import { describe, it, expect } from 'vitest';
import { dayNum, dateOf, todayKey, dayItems, newRun, tickItem, streak, monthCells, runStatus, isReadingDay, hasEmptyDays, totalDays } from './plan-engine.js';
import * as base from './__fixtures__/plan-engine-03d0ea090.js';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
const chapters = (bid, n) => Array.from({ length: n }, (_, i) => ({ k: bid + ':' + (i + 1), w: 400 + ((i * 37) % 300) }));
const readDay = (run, d, date) => dayItems(run, d).reduce((r, it) => tickItem(r, it.k, date, 1), run);

/** A small seeded random (mulberry32). @param {number} seed */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Months (year, month 0-11) from the plan's start month to the month after `now`. */
function monthsOf(run, now) {
  const s = run.start.split('-').map(Number);
  const out = [];
  let y = s[0], m = s[1] - 1;
  const endY = now.getFullYear(), endM = now.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) { out.push([y, m]); m++; if (m > 11) { m = 0; y++; } }
  return out;
}

/** The new engine agrees with 03d0ea090 on `run` at `now` (the month's ahead day numbers: see the header). */
function expectSameAsBase(run, now) {
  const a = streak(run, now), b = base.streak(run, now);
  expect(a).toEqual(b);
  const st = runStatus(run, now);
  const todayN = /** @type {number} */ (dayNum(todayKey(now)));
  // 03d0ea090 numbered every day ahead one too high when today's portion was not due today (today a day off).
  const shift = !st.doneToday && !st.finished && !isReadingDay({ ...run, paused: undefined }, todayN) ? 1 : 0;
  for (const [y, m] of monthsOf(run, now)) {
    const mine = monthCells(run, y, m, now), theirs = base.monthCells(run, y, m, now);
    // (Only today's month: a later month counted from today's reading days, and was right.)
    const off = y === now.getFullYear() && m === now.getMonth() ? shift : 0;
    expect(mine.map((c) => c.state)).toEqual(theirs.map((c) => c.state));
    expect(mine.map((c) => c.read)).toEqual(theirs.map((c) => c.read));
    expect(mine.map((c) => (c.day == null ? null : c.day))).toEqual(theirs.map((c) => (c.day == null ? null : c.day - off)));
  }
}

describe('a plan that reads one day after another behaves as on 03d0ea090', () => {
  it('a 7-chapter, 7-day plan read with gaps: days in a row 1, Sunday the 22nd missed, the 17th, 18th and 22nd missed', () => {
    let run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: chapters('genesis', 7) }], pace: { mode: 'days', n: 7 } }, at('2026-11-15'));
    expect(hasEmptyDays(run)).toBe(false);
    ['2026-11-15', '2026-11-16', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-23'].forEach((date, d) => { run = readDay(run, d, date); });
    const now = at('2026-11-24');
    const s = streak(run, now);
    expect(s.inRow).toBe(1);
    expect(s.week.filter((w) => w.missed).map((w) => w.date)).toEqual(['2026-11-22']);
    const missed = monthCells(run, 2026, 10, now).filter((c) => c.state === 'missed').map((c) => c.date);
    expect(missed).toEqual([17, 18, 22]);
    expectSameAsBase(run, now);
  });

  it('a lapsed Bible in a Year on weekdays (started Nov 2024, 300 days read): every November weekday missed', () => {
    const weekdays = [false, true, true, true, true, true, false];
    const items = Array.from({ length: 1189 }, (_, i) => ({ k: 'b' + Math.floor(i / 20) + ':' + ((i % 20) + 1), w: 600 }));
    let run = newRun({ plan: 'bible-year', tracks: [{ kind: 'bible', by: 'count', items }], pace: { mode: 'days', n: 365 }, weekdays }, at('2024-11-04'));
    expect(hasEmptyDays(run)).toBe(false);
    let n = /** @type {number} */ (dayNum('2024-11-04'));
    for (let d = 0; d < 300; n++) if (isReadingDay(run, n)) { run = readDay(run, d, dateOf(n)); d++; }
    const now = at('2026-11-26');
    const missed = monthCells(run, 2026, 10, now).filter((c) => c.state === 'missed');
    expect(missed.length).toBe(18);
    expect(streak(run, now).week.filter((w) => w.missed).map((w) => w.date)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25']);
    expectSameAsBase(run, now);
  });

  it('random reading histories (seeded) on plans of every pace and weekday set', () => {
    let tried = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed);
      const days = 3 + Math.floor(r() * 30);
      const count = days + Math.floor(r() * 40);   // at least one item a day: no empty day
      const weekdays = r() < 0.6 ? [true, true, true, true, true, true, true] : Array.from({ length: 7 }, () => r() < 0.6);
      const startKey = dateOf(/** @type {number} */ (dayNum('2026-09-01')) + Math.floor(r() * 60));
      const by = r() < 0.5 ? 'count' : 'words';
      let run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by, items: chapters('psalms', count) }], pace: { mode: 'days', n: days }, weekdays }, at(startKey));
      if (hasEmptyDays(run)) continue;   // a words cut may still leave a day empty: that is a spread-out plan
      tried++;
      const startN = /** @type {number} */ (dayNum(run.start));
      const span = 5 + Math.floor(r() * 60);
      let next = 0;
      for (let n = startN; n < startN + span && next < totalDays(run); n++) {
        const p = r();
        if (p < 0.55) run = readDay(run, next++, dateOf(n));
        else if (p < 0.65 && next + 1 < totalDays(run)) { run = readDay(run, next++, dateOf(n)); run = readDay(run, next++, dateOf(n)); }
        else if (p < 0.72) { const it = dayItems(run, next)[0]; if (it) run = tickItem(run, it.k, dateOf(n), 1); }
      }
      const now = at(dateOf(startN + span + Math.floor(r() * 3)));
      expectSameAsBase(run, now);
    }
    expect(tried).toBeGreaterThan(80);
  });
});
