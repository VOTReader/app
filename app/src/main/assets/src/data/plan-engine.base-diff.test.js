/* plan-engine against 03d0ea090 (before spread-out plans): a plan that reads one day after another keeps its days in a
   row, week strip and month calendar exactly (the hostile review of claude/plans-1126-r2: a behind reader's missed days
   had vanished and days in a row counted across gaps). The one change kept on purpose: when today is not a reading
   day, the days ahead in the month are numbered from today's portion, not one past it. */

import { describe, it, expect } from 'vitest';
import { dayNum, dateOf, todayKey, dayItems, newRun, tickItem, streak, monthCells, runStatus, isReadingDay, hasEmptyDays, totalDays, creditRead, catchUp, spreadOut, pauseRun } from './plan-engine.js';
import { planStateLine, stoppedLine } from '../ui/screens/ReadingPlansScreen.jsx';
import { continueRun } from '../utils/plan-runs-view.js';
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
  // "Day N of M" (runRow's day): 03d0ea090 said the day just read once today's was done, else the portion's.
  const was = base.runStatus(run, now);
  expect(st.todayDay).toBe(was.doneToday ? was.day - 1 : was.day);
  expect(st.doneToday).toBe(was.doneToday);
  expect(st.projected).toBe(was.projected);
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

  it('a 7-chapter plan, Day 3 read and paused the same evening: "Day 4 of 7", as on 03d0ea090', () => {
    let run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: chapters('genesis', 7) }], pace: { mode: 'days', n: 7 } }, at('2026-11-24'));
    ['2026-11-24', '2026-11-25', '2026-11-26'].forEach((date, d) => { run = readDay(run, d, date); });
    const eve = at('2026-11-26', 21);
    run = pauseRun(run, eve);
    expect(planStateLine(run, eve)).toMatchObject({ lead: 'Paused', rest: 'Day 4 of 7' });
    expect(stoppedLine({ ...run, paused: undefined, status: 'stopped', stopped: '2026-11-26' }, eve)).toMatch(/ · day 4 of 7$/);
    expectSameAsBase(run, eve);
  });

  it('random reading histories (seeded) on plans of every pace and weekday set', () => {
    let tried = 0, held = 0, recuts = 0, twoTrack = 0, oldCut = 0, finishedToday = 0, continued = 0, early = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed);
      const days = 3 + Math.floor(r() * 30);
      const count = days + Math.floor(r() * 40);   // at least one item a day: no empty day
      const weekdays = r() < 0.6 ? [true, true, true, true, true, true, true] : Array.from({ length: 7 }, () => r() < 0.6);
      const startKey = dateOf(/** @type {number} */ (dayNum('2026-09-01')) + Math.floor(r() * 60));
      const by = r() < 0.5 ? 'count' : 'words';
      const shape = r();
      /** @type {any[]} */ let tracks = [{ kind: 'bible', by, items: chapters('psalms', count) }];
      // Two tracks side by side; or an old short cut (before even cuts) whose last days are empty.
      if (shape < 0.2) tracks = [tracks[0], { kind: 'bible', by: 'count', items: chapters('proverbs', days + Math.floor(r() * 10)) }];
      if (shape >= 0.2 && shape < 0.4) tracks = [{ kind: 'bible', by: 'words', items: chapters('psalms', 2 + Math.floor(r() * (days - 1))).map((it, i) => (i ? it : { ...it, w: 9000 })) }];
      let run = newRun({ plan: 'custom', tracks, pace: { mode: 'days', n: days }, weekdays }, at(startKey));
      if (shape >= 0.2 && shape < 0.4) run = { ...run, segs: run.segs.map((sg) => ({ ...sg, even: false })) };
      if (hasEmptyDays(run)) continue;   // a words cut may still leave a day empty: that is a spread-out plan
      if (tracks.length > 1) twoTrack++;
      if (shape >= 0.2 && shape < 0.4 && !dayItems(run, totalDays(run) - 1).length) oldCut++;
      tried++;
      const startN = /** @type {number} */ (dayNum(run.start));
      // Some plans start with chapters read before (credited, undated).
      if (r() < 0.2) { const upTo = 1 + Math.floor(r() * 5); run = creditRead(run, (_b, c) => Number(c) <= upTo); }
      const span = 5 + Math.floor(r() * 60);
      const recutAt = r() < 0.3 ? startN + Math.floor(r() * span) : -1, recut = r() < 0.5 ? catchUp : spreadOut;
      // Half the histories run up to today itself, so today's portion is often read (a pause the same evening).
      const endN = startN + span - 1 + (r() < 0.5 ? 0 : 1 + Math.floor(r() * 3));
      let next = 0;
      while (next < totalDays(run) && dayItems(run, next).every((it) => it.k in run.ticks)) next++;
      for (let n = startN; n <= Math.min(endN, startN + span - 1) && next < totalDays(run); n++) {
        if (n === recutAt) {
          // Catch me up or Spread it out, on the day the reader chose it (a cut that leaves a day empty is spread out).
          const cut = recut(run, at(dateOf(n)));
          if (!hasEmptyDays(cut)) { run = cut; recuts++; next = runStatus(run, at(dateOf(n))).day; }
        }
        const p = r();
        if (p < 0.55) run = readDay(run, next++, dateOf(n));
        else if (p < 0.65 && next + 1 < totalDays(run)) { run = readDay(run, next++, dateOf(n)); run = readDay(run, next++, dateOf(n)); }
        else if (p < 0.72) { const it = dayItems(run, next)[0]; if (it) run = tickItem(run, it.k, dateOf(n), 1); }
      }
      // A plan read to its end: often seen on the day its last reading was done (finished today).
      const lastRead = Math.max(...Object.values(run.ticks).map((v) => dayNum(v) ?? -Infinity));
      const nowN = runStatus(run, at(dateOf(endN))).finished && r() < 0.6 && lastRead > -Infinity ? lastRead : endN;
      if (nowN === lastRead && base.runStatus(run, at(dateOf(nowN))).finished) finishedToday++;
      const now = at(dateOf(nowN), r() < 0.3 ? 21 : 9);
      // Paused or stopped on a recent date (often the day of the last read): the line names the day 03d0ea090 named.
      const q = r(), heldOn = nowN - Math.floor(r() * 3);
      if (q < 0.08) {
        // Paused before its start: a plan made to start later, paused at once.
        let fresh = newRun({ plan: 'custom', tracks, pace: { mode: 'days', n: days }, weekdays }, at(dateOf(nowN + 3 + Math.floor(r() * 5))));
        if (shape >= 0.2 && shape < 0.4) fresh = { ...fresh, segs: fresh.segs.map((sg) => ({ ...sg, even: false })) };
        if (!hasEmptyDays(fresh)) {
          fresh = pauseRun({ ...fresh }, now);
          const was = base.runStatus(fresh, now);
          expect(planStateLine(fresh, now)).toMatchObject({ lead: 'Paused', rest: 'Day ' + (was.day + 1) + ' of ' + was.total });
          expectSameAsBase(fresh, now);
          early++;
        }
      } else if (q < 0.25) {
        run = pauseRun(run, at(dateOf(heldOn), 21));
        const was = base.runStatus(run, now);
        if (!was.finished) { expect(planStateLine(run, now)).toMatchObject({ lead: 'Paused', rest: 'Day ' + (was.day + 1) + ' of ' + was.total }); held++; }
      } else if (q < 0.45) {
        run = { ...run, status: /** @type {'stopped'} */ ('stopped'), stopped: dateOf(heldOn) };
        const was = base.runStatus(run, now);
        expect(stoppedLine(run, now).split(' · ').pop()).toBe('day ' + Math.min(was.total, was.day + 1) + ' of ' + was.total.toLocaleString('en-US'));
        held++;
        if (r() < 0.5) {
          // Continue where I stopped, a few days later: the stopped days become a pause.
          const later = at(dateOf(nowN + 1 + Math.floor(r() * 4)));
          run = continueRun(run, later);
          expectSameAsBase(run, later);
          continued++;
        }
      }
      expectSameAsBase(run, now);
    }
    expect(tried).toBeGreaterThan(80);
    expect(held).toBeGreaterThan(20);
    expect(recuts).toBeGreaterThan(5);
    expect([twoTrack, oldCut, finishedToday, continued, early].every((c) => c >= 3)).toBe(true);
  });
});
