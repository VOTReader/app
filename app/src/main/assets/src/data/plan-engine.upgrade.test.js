/* Upgrade from the live build (Hub Lock, 2026-11-26): runs stored by 03d0ea090 (spread-out layouts shipped that
   morning, judged by an engine that knew no rest days) or by a build before 11-26 (cuts without `even`, which scatter
   empty days through a short plan) are read by this branch's engine with no migration. Each past day must say what
   it said on 03d0ea090 (read, missed, off), and the days in a row must not drop. The one change allowed: a day the
   plan laid nothing on, which 03d0ea090 marked missed although nothing was due, is now a rest day ("Nothing to read
   today" on the card), so it leaves the calendar's missed days and stops breaking the days in a row. Every such day of
   the stored runs below is listed with that reason. */

import { describe, it, expect } from 'vitest';
import * as mine from './plan-engine.js';
import * as base from './__fixtures__/plan-engine-03d0ea090.js';
import STORED from '../stores/plan-runs-dc31d3e27.fixture.json';
import WRITTEN from './__fixtures__/plan-runs-03d0ea090-spread.json';

const at = (/** @type {string} */ s, h = 12) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
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

/**
 * Every past day where the two engines differ: the month calendar's state, the week strip's done, missed and off,
 * and the days in a row. @param {any} run @param {Date} now @returns {string[]}
 */
function flips(run, now) {
  const out = [];
  const today = /** @type {number} */ (base.dayNum(base.todayKey(now)));
  const s = run.start.split('-').map(Number);
  for (let y = s[0], m = s[1] - 1; y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth()); m = m === 11 ? 0 : m + 1, y = m === 0 ? y + 1 : y) {
    const a = base.monthCells(run, y, m, now), b = mine.monthCells(run, y, m, now);
    a.forEach((c, i) => {
      const key = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(c.date).padStart(2, '0');
      if (/** @type {number} */ (base.dayNum(key)) < today && c.state !== b[i].state) out.push(key + ' ' + c.state + '>' + b[i].state);
    });
  }
  const sa = base.streak(run, now), sb = mine.streak(run, now);
  sa.week.forEach((x, i) => {
    if (/** @type {number} */ (base.dayNum(x.date)) >= today) return;
    for (const f of /** @type {const} */ (['done', 'missed', 'off'])) if (x[f] !== sb.week[i][f]) out.push(x.date + ' week ' + f + ' ' + x[f] + '>' + sb.week[i][f]);
  });
  if (sa.inRow !== sb.inRow) out.push('in a row ' + sa.inRow + '>' + sb.inRow);
  return out;
}

/** The allowed change, checked for one flip: a reading day of the plan's own days (so not a change of what is a day
    off) that was missed and is now a rest day, or days in a row that went up. */
function allowed(/** @type {any} */ run, /** @type {string} */ f) {
  const row = f.match(/^in a row (\d+)>(\d+)$/);
  if (row) return Number(row[2]) > Number(row[1]);
  if (!/ missed>none$| week missed true>false$/.test(f)) return false;
  return mine.hasEmptyDays(run) && mine.isReadingDay(run, /** @type {number} */ (base.dayNum(f.slice(0, 10))));
}

describe('runs stored by the live build read the same on this build', () => {
  it('the dc31d3e27 store fixture (9 real runs, one day after another): no past day flips, days in a row the same', () => {
    const now = new Date(STORED.now);
    for (const run of STORED.runs) expect([run.id, flips(run, now)]).toEqual([run.id, []]);
  });

  it('runs written by 03d0ea090\'s own engine with spread-out layouts: only the listed rest days change, days in a row never drop', () => {
    const now = new Date(WRITTEN.now);
    // Reason for every line: a day the plan laid nothing on. 03d0ea090 marked it missed (it knew no rest days); the
    // card on this build says "Nothing to read today" for it, so it is not missed and does not break the days in a row.
    /** @type {Record<string, string[]>} */ const INTENDED = {
      'sp-schedule': [
        '2026-11-26 missed>none', '2026-11-27 missed>none', '2026-11-29 missed>none', '2026-11-30 missed>none', '2026-12-01 missed>none', '2026-12-02 missed>none',
        '2026-12-03 missed>none', '2026-12-05 missed>none', '2026-12-06 missed>none', '2026-12-07 missed>none', '2026-12-08 missed>none', '2026-12-09 missed>none',
        '2026-12-06 week missed true>false', '2026-12-07 week missed true>false', '2026-12-08 week missed true>false', '2026-12-09 week missed true>false',
        'in a row 0>2'],
      'sp-eager': [],
      'sp-late': ['2026-12-06 week missed true>false'],
      'sp-weekdays': ['2026-11-27 missed>none', '2026-11-28 missed>none', '2026-12-01 missed>none', '2026-12-02 missed>none', '2026-12-03 missed>none'],
      'sp-paused': ['2026-11-26 missed>none', '2026-11-27 missed>none', '2026-11-28 missed>none', '2026-12-02 missed>none'],
      'pre-scattered': [
        '2026-11-01 missed>none', '2026-11-02 missed>none', '2026-11-03 missed>none', '2026-11-04 missed>none', '2026-11-06 missed>none', '2026-11-07 missed>none',
        '2026-11-08 missed>none', '2026-11-09 missed>none', '2026-11-10 missed>none', '2026-11-11 missed>none', '2026-11-12 missed>none', '2026-11-14 missed>none',
        '2026-11-15 missed>none', '2026-11-16 missed>none', '2026-11-17 missed>none', '2026-11-18 missed>none', '2026-11-19 missed>none', '2026-11-20 missed>none',
        '2026-11-22 missed>none', '2026-11-23 missed>none', '2026-11-24 missed>none', '2026-11-25 missed>none', '2026-11-26 missed>none', '2026-11-27 missed>none',
        '2026-11-28 missed>none', '2026-11-29 missed>none', '2026-12-01 missed>none', '2026-12-02 missed>none', '2026-12-03 missed>none', '2026-12-04 missed>none',
        '2026-12-05 missed>none', '2026-12-06 missed>none', '2026-12-07 missed>none', '2026-12-09 missed>none',
        '2026-12-06 week missed true>false', '2026-12-07 week missed true>false', '2026-12-09 week missed true>false',
        'in a row 0>5'],
    };
    expect(WRITTEN.runs.map((r) => r.id)).toEqual(Object.keys(INTENDED));
    for (const run of WRITTEN.runs) {
      expect(mine.hasEmptyDays(run)).toBe(true);
      expect([run.id, flips(run, now)]).toEqual([run.id, INTENDED[run.id]]);
    }
    // 55 calendar days, 8 week-strip days, 2 days-in-a-row counts that went up; none down.
    const all = Object.values(INTENDED).flat();
    expect([all.filter((f) => / missed>none$/.test(f)).length, all.filter((f) => / week /.test(f)).length, all.filter((f) => /^in a row/.test(f)).length]).toEqual([55, 8, 2]);
  });

  it('seeded histories played on 03d0ea090\'s engine (its own reads, Catch me up, Spread it out, pauses), today\'s cuts and pre-11-26 cuts: nothing but rest days change', () => {
    let runs = 0, scattered = 0, changed = 0, rows = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed), oldCut = seed % 2 === 0;
      const n = 2 + Math.floor(r() * 12), days = n + 1 + Math.floor(r() * (2 * n + 10));
      const weekdays = r() < 0.7 ? undefined : Array.from({ length: 7 }, (_, i) => i === 3 || r() < 0.7);
      const by = r() < 0.3 ? 'words' : 'count';
      const items = Array.from({ length: n }, (_, i) => ({ k: 'mark:' + (i + 1), w: 500 + Math.floor(r() * 400) }));
      const startKey = base.dateOf(/** @type {number} */ (base.dayNum('2026-10-20')) + Math.floor(r() * 30));
      let run = /** @type {any} */ (base.newRun({ plan: 'custom', weekdays, tracks: [{ kind: 'bible', by, items }], pace: { mode: 'days', n: days } }, at(startKey)));
      if (oldCut) run = { ...run, segs: run.segs.map((/** @type {any} */ sg) => { const { even, ...rest } = sg; return rest; }) };
      if (!mine.hasEmptyDays(run)) continue;
      const startN = /** @type {number} */ (base.dayNum(run.start));
      const span = 3 + Math.floor(r() * (days + 5)), readP = r() * 0.9;
      for (let t = startN; t < startN + span; t++) {
        const key = base.dateOf(t), now = at(key);
        const p = r();
        if (run.paused) { if (p < 0.4) run = base.resumeRun(run, now); }
        else if (p < 0.04) run = base.catchUp(run, now);
        else if (p < 0.07) run = base.spreadOut(run, now);
        else if (p < 0.09) run = base.pauseRun(run, now);
        if (!run.paused) {
          const st = base.runStatus(run, now);
          if (!st.finished && r() < readP) for (const it of st.todayItems) run = base.tickItem(run, it.k, key, 1);
        }
      }
      run = JSON.parse(JSON.stringify(run));   // as stored
      const now = at(base.dateOf(startN + span), r() < 0.5 ? 9 : 21);
      runs++; if (oldCut) scattered++;
      for (const f of flips(run, now)) {
        expect([run.id, f, allowed(run, f)]).toEqual([run.id, f, true]);
        if (/^in a row/.test(f)) rows++; else changed++;
      }
    }
    expect(runs).toBeGreaterThan(250);
    expect(scattered).toBeGreaterThan(100);
    expect(changed).toBeGreaterThan(300);
    expect(rows).toBeGreaterThan(20);
  });
});

describe('a run with `rested` on 03d0ea090 (a backup from this build restored on the live one, point 2a)', () => {
  it('03d0ea090 reads it as if the field were not there, its own changes keep it, and back here its past reads the same', () => {
    let run = mine.newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 20 } }, at('2026-12-01'));
    run = mine.tickItem(run, 'ruth:1', '2026-12-03', 1);
    run = mine.catchUp(run, at('2026-12-10'));
    expect(run.rested && run.rested.until).toBe('2026-12-10');
    const bare = /** @type {any} */ ({ ...run });
    delete bare.rested;
    const now = at('2026-12-12');
    expect(base.runStatus(run, now)).toEqual(base.runStatus(bare, now));
    expect(base.streak(run, now)).toEqual(base.streak(bare, now));
    expect(base.monthCells(run, 2026, 11, now)).toEqual(base.monthCells(bare, 2026, 11, now));
    const ticked = base.tickItem(run, 'ruth:2', '2026-12-12', 1);
    for (const next of [ticked, base.catchUp(run, now), base.spreadOut(run, now), base.changePace(run, { mode: 'by', date: '2026-12-30' }, now),
      base.changeWeekdays(run, [true, true, true, true, true, false, false], now), base.pauseRun(run, now), base.untickItem(run, 'ruth:1', now)]) {
      expect(next.rested).toEqual(run.rested);
    }
    const back = JSON.parse(JSON.stringify(ticked));
    const past = (/** @type {any} */ x) => mine.monthCells(x, 2026, 11, now).filter((c) => c.date < 12).map((c) => c.state);
    expect(past(back)).toEqual(past(run));
  });

  it('the same for the days off a change of days pins (rested.off, b529d9fe9): 03d0ea090 ignores and keeps them', () => {
    // b529d9fe9's Jude: Tue-Sat from Dec 1, Jude 1 read Dec 2, Finish by Dec 20 set Dec 4, every day from Dec 10.
    let run = mine.newRun({ plan: 'custom', weekdays: [false, false, true, true, true, true, true], tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3].map((c) => ({ k: 'jude:' + c, w: 500 })) }], pace: { mode: 'days', n: 9 } }, at('2026-12-01'));
    run = mine.changePace(mine.tickItem(run, 'jude:1', '2026-12-02', 1), { mode: 'by', date: '2026-12-20' }, at('2026-12-04'));
    run = JSON.parse(JSON.stringify(mine.changeWeekdays(run, [true, true, true, true, true, true, true], at('2026-12-10'))));
    expect(run.rested.off).toEqual([['2026-12-06', '2026-12-07']]);
    const bare = /** @type {any} */ ({ ...run });
    delete bare.rested;
    const now = at('2026-12-11');
    expect(base.runStatus(run, now)).toEqual(base.runStatus(bare, now));
    expect(base.streak(run, now)).toEqual(base.streak(bare, now));
    expect(base.monthCells(run, 2026, 11, now)).toEqual(base.monthCells(bare, 2026, 11, now));
    const offDays = (/** @type {any} */ x) => mine.monthCells(x, 2026, 11, now).filter((c) => c.date === 6 || c.date === 7).map((c) => c.state);
    for (const next of [base.tickItem(run, 'jude:2', '2026-12-11', 1), base.catchUp(run, now), base.spreadOut(run, now), base.changePace(run, { mode: 'by', date: '2026-12-30' }, now),
      base.changeWeekdays(run, [false, false, true, true, true, true, true], now), base.pauseRun(run, now), base.resumeRun(base.pauseRun(run, at('2026-12-10')), now),
      base.untickItem(run, 'jude:1', now), base.markDay(run, 0, false, now), base.markOn(run, '2026-12-03', now)]) {
      expect(next.rested).toEqual(run.rested);
      expect(offDays(JSON.parse(JSON.stringify(next)))).toEqual(['none', 'none']);   // back here: still days off
    }
  });
});
