/* The third hostile review of claude/plans-1126-r2: a spread-out plan's past changed after the fact whenever its
   target moved (Catch me up, a new Finish by date, a resume), because whether a past day was a rest day was judged
   against the current target. This probe records what the Today card said at the end of every day of seeded
   histories with such changes, then checks that the month calendar and the week strip still say the same. */

import { describe, it, expect } from 'vitest';
import { dayNum, dateOf, newRun, tickItem, untickItem, runStatus, monthCells, streak, isReadingDay, hasEmptyDays, catchUp, changePace, changeWeekdays, pauseRun, resumeRun } from './plan-engine.js';

const at = (s, h = 12) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
/** mulberry32. @param {number} seed */
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

/** One seeded history: [run at the end, what the card said each day, the dates read, the target changes made]. */
function history(seed) {
  const r = rng(seed);
  const n = 2 + Math.floor(r() * 10), days = 2 * n + 2 + Math.floor(r() * 25);
  const weekdays = r() < 0.7 ? undefined : Array.from({ length: 7 }, (_, i) => i === 3 || r() < 0.7);
  let run = newRun({ plan: 'custom', weekdays, tracks: [{ kind: 'bible', by: 'count', items: Array.from({ length: n }, (_, i) => ({ k: 'james:' + (i + 1), w: 500 })) }], pace: { mode: 'days', n: days } }, at('2026-12-01'));
  if (!hasEmptyDays(run)) return null;
  const startN = /** @type {number} */ (dayNum(run.start));
  /** @type {Map<string, { rest: boolean, done: boolean, paused: boolean, reading: boolean, finished: boolean }>} */ const shown = new Map();
  const read = new Set();
  let changes = 0;
  const span = Math.max(4, days - 3 - Math.floor(r() * 6));
  for (let t = startN; t < startN + span; t++) {
    const key = dateOf(t), now = at(key);
    const p = r();
    if (run.paused) { if (p < 0.4) { run = resumeRun(run, now); changes++; } }
    else if (p < 0.07) { run = catchUp(run, now); changes++; }
    else if (p < 0.14) { run = changePace(run, { mode: 'by', date: dateOf(t + 2 + Math.floor(r() * 25)) }, now); changes++; }
    else if (p < 0.18) run = pauseRun(run, now);
    if (!run.paused) {
      const st = runStatus(run, now), q = r();
      if (!st.finished && !st.doneToday && ((!st.spreadOn && q < 0.55) || (st.spreadOn && q < 0.08))) {
        for (const it of st.todayItems) run = tickItem(run, it.k, key, 1);
        read.add(key);
      }
    }
    const st = runStatus(run, now);
    shown.set(key, { rest: !!st.spreadOn, done: st.doneToday, paused: st.paused, reading: isReadingDay(run, t), finished: st.finished });
  }
  return { run, shown, read, changes, endN: startN + span };
}

describe('a spread-out plan\'s past says what the card said, whatever the target did later', () => {
  it('seeded histories with Catch me up, Finish by changes and pauses: 0 days flip between rest and missed', () => {
    let flips = 0, checked = 0, changes = 0, plans = 0;
    const seen = [];
    for (let seed = 1; seed <= 150; seed++) {
      const h = history(seed);
      if (!h) continue;
      const end = at(dateOf(h.endN));
      if (runStatus(h.run, end).finished) continue;   // a finished plan marks nothing missed
      plans++;
      changes += h.changes;
      /** @type {Map<string, string>} */ const cells = new Map();
      for (const [y, m] of [[2026, 11], [2027, 0], [2027, 1]]) for (const c of monthCells(h.run, y, m, end)) cells.set(dateOf(/** @type {number} */ (dayNum(y + '-' + String(m + 1).padStart(2, '0') + '-01')) + c.date - 1), c.state);
      const week = new Map(streak(h.run, end).week.map((w) => [w.date, w.missed]));
      for (const [key, s] of h.shown) {
        if (s.paused || s.done || s.finished || !s.reading || h.read.has(key)) continue;
        const want = s.rest ? 'none' : 'missed';
        checked++;
        if (cells.get(key) !== want) { flips++; if (seen.length < 5) seen.push(seed + ' ' + key + ' said ' + want + ', calendar ' + cells.get(key)); }
        if (week.has(key) && week.get(key) !== (want === 'missed')) { flips++; if (seen.length < 5) seen.push(seed + ' ' + key + ' week strip'); }
      }
    }
    expect(plans).toBeGreaterThan(30);
    expect(changes).toBeGreaterThan(40);
    expect(checked).toBeGreaterThan(300);
    expect(seen).toEqual([]);
    expect(flips).toBe(0);
  });
});

describe('the review\'s example: Keep my daily amount after a late stretch', () => {
  it('James over 10 days: Dec 7 and 8 (James 3 offered, not read) stay missed after Catch me up on Dec 10', () => {
    let run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'james:' + c, w: 500 })) }], pace: { mode: 'days', n: 10 } }, at('2026-12-01'));
    run = tickItem(run, 'james:1', '2026-12-02', 1);
    run = tickItem(run, 'james:2', '2026-12-06', 1);   // due Dec 4, read two days late
    expect(runStatus(run, at('2026-12-07')).spreadOn).toBe('');   // behind: James 3 offered on Dec 7, and on Dec 8
    const cells = (/** @type {any} */ r) => Object.fromEntries(monthCells(r, 2026, 11, at('2026-12-10')).filter((c) => c.date <= 9).map((c) => [c.date, c.state]));
    const before = cells(run);
    expect(before).toMatchObject({ 7: 'missed', 8: 'missed' });
    const caught = catchUp(run, at('2026-12-10'));
    expect(caught.target).not.toBe(run.target);
    expect(cells(caught)).toEqual(before);
  });
});

describe('the fourth review: earlier pins survive a second change of days', () => {
  it('Jude over Tue–Sat from Tue Dec 1: Dec 1 (a rest day, pinned Dec 4) stays a rest day after two changes of days on Dec 10', () => {
    let run = newRun({ plan: 'custom', weekdays: [false, false, true, true, true, true, true], tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3].map((c) => ({ k: 'jude:' + c, w: 500 })) }], pace: { mode: 'days', n: 9 } }, at('2026-12-01'));
    expect(runStatus(run, at('2026-12-01')).spreadOn).toBe('2026-12-02');   // Dec 1: nothing to read today
    const cells = (/** @type {any} */ r, /** @type {string} */ now) => Object.fromEntries(monthCells(r, 2026, 11, at(now)).filter((c) => c.date <= 3).map((c) => [c.date, c.state]));
    expect(cells(run, '2026-12-04')).toEqual({ 1: 'none', 2: 'missed', 3: 'missed' });
    run = changePace(run, { mode: 'by', date: '2026-12-20' }, at('2026-12-04'));
    run = changeWeekdays(run, [true, true, false, true, true, false, false], at('2026-12-10'));   // Sun, Mon, Wed, Thu
    run = changeWeekdays(run, [true, true, true, true, true, true, true], at('2026-12-10'));
    expect(cells(run, '2026-12-10')).toEqual({ 1: 'none', 2: 'missed', 3: 'missed' });
  });
});

describe('the fourth review: an untick is the same on both sides of a pin', () => {
  it('Ruth over 20 days: the Dec 13 reading unticked Dec 21, ticked again Dec 26; Catch me up on Dec 15, 17 or 23 changes no past day', () => {
    const cells = (/** @type {any} */ r, /** @type {string} */ now) => monthCells(r, 2026, 11, at(now)).filter((c) => c.date < 27).map((c) => c.state);
    /** @param {string | null} caught */
    const live = (caught) => {
      let run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 20 } }, at('2026-12-01'));
      /** @type {Record<string, string[]>} */ const seen = {};
      for (let n = /** @type {number} */ (dayNum('2026-12-01')); n <= /** @type {number} */ (dayNum('2026-12-26')); n++) {
        const key = dateOf(n), now = at(key);
        if (key === caught) run = catchUp(run, now);
        if (key === '2026-12-21') run = untickItem(run, /** @type {string} */ (Object.keys(run.ticks).find((k) => run.ticks[k] === '2026-12-13')), now);
        const st = runStatus(run, now);
        // What the card offers, read on the day it is offered, up to Dec 13; Ruth 3 again on Dec 26.
        if ((key <= '2026-12-13' && !st.doneToday && !st.spreadOn) || key === '2026-12-26') for (const it of st.todayItems) run = tickItem(run, it.k, key, 1);
        if (key === '2026-12-21' || key === '2026-12-26') seen[key] = cells(run, key);
      }
      expect(run.ticks).toEqual({ 'ruth:1': '2026-12-03', 'ruth:2': '2026-12-08', 'ruth:3': '2026-12-26' });
      return seen;
    };
    const plain = live(null);
    expect(plain['2026-12-21'].slice(12, 20)).toEqual(Array(8).fill('missed'));   // Dec 13 to 20: Ruth 3 not read
    for (const caught of ['2026-12-15', '2026-12-17', '2026-12-23']) expect(live(caught)).toEqual(plain);
  });
});

describe('the fourth review: pinned rest days are kept as ranges', () => {
  it('12 readings over 365 days, 10 read by October, Catch me up on Dec 5: 10 ranges in about 310 bytes (280 single dates were 3.6 KB); the older list of dates reads the same', () => {
    let run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: Array.from({ length: 12 }, (_, i) => ({ k: 'mark:' + (i + 1), w: 600 })) }], pace: { mode: 'days', n: 365 } }, at('2026-01-01'));
    for (let n = /** @type {number} */ (dayNum('2026-01-01')); n < /** @type {number} */ (dayNum('2026-12-05')); n++) {
      const key = dateOf(n), st = runStatus(run, at(key));
      if (!st.doneToday && !st.spreadOn && n % 3 === 0 && key < '2026-10-01') for (const it of st.todayItems) run = tickItem(run, it.k, key, 1);
    }
    const now = at('2026-12-05'), caught = catchUp(run, now);
    const r = /** @type {{ until: string, ranges: string[][] }} */ (caught.rested);
    expect(r.ranges).toHaveLength(10);
    expect(JSON.stringify(r).length).toBeLessThan(350);
    // The same rest days as single dates (the form an earlier build of this branch stored): the same calendar.
    const dates = r.ranges.flatMap(([a, b]) => Array.from({ length: /** @type {number} */ (dayNum(b)) - /** @type {number} */ (dayNum(a)) + 1 }, (_, i) => dateOf(/** @type {number} */ (dayNum(a)) + i)));
    expect(dates).toHaveLength(280);   // 3.6 KB as single dates
    const old = { ...caught, rested: { until: r.until, dates } };
    const year = (/** @type {any} */ x) => Array.from({ length: 12 }, (_, m) => monthCells(x, 2026, m, now).map((c) => c.state)).flat();
    expect(year(old)).toEqual(year(caught));
    expect(year(caught).filter((s) => s === 'missed').length).toBeGreaterThan(0);
    expect(streak(old, now)).toEqual(streak(caught, now));
  });
});
