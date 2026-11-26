/* The third hostile review of claude/plans-1126-r2: a spread-out plan's past changed after the fact whenever its
   target moved (Catch me up, a new Finish by date, a resume), because whether a past day was a rest day was judged
   against the current target. This probe records what the Today card said at the end of every day of seeded
   histories with such changes, then checks that the month calendar and the week strip still say the same. */

import { describe, it, expect } from 'vitest';
import { dayNum, dateOf, newRun, tickItem, runStatus, monthCells, streak, isReadingDay, hasEmptyDays, catchUp, changePace, pauseRun, resumeRun } from './plan-engine.js';

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
