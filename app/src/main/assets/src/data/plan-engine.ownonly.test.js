/* 0450: "Count only this plan's reading" (the hub's pick on 0245 Part B, lanes/vot-ui/out/t0245/partB.md). A run that
   counted reads from before it began starts again from today holding only its dated ticks; rp1 runs and runs with no
   credit never offer it. Fixtures B2 and B3 are Part B's: Bible in a Year from 2026-10-01 with Count my N on (300
   chapters), read every day the app showed (B3: five days missed), today 2026-11-17. */
import { describe, it, expect } from 'vitest';
import { runStatus, tickItem, todayKey, creditRead, freshFromDated, canCountOwnOnly, pauseRun, itemsLabel } from './plan-engine.js';
import { startCatalogPlan, bookTitle } from './plan-catalog.js';
import { countOwnOnlyRun } from '../utils/plan-runs-view.js';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
const addDays = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n, 9);
const NOW = at('2026-11-17', 20);

/** Part B's B2 (missed 0) and B3 (missed 5). */
function partB(missed) {
  let run = startCatalogPlan('bible-year', null, at('2026-10-01'));
  const first300 = new Set(run.tracks[0].items.slice(0, 300).map((it) => it.k));
  run = creditRead(run, (b, c) => first300.has(b + ':' + c));
  const skip = new Set(['2026-10-10', '2026-10-20', '2026-10-30', '2026-11-05', '2026-11-12'].slice(0, missed));
  for (let dt = at('2026-10-01'); dt <= NOW; dt = addDays(dt, 1)) {
    if (skip.has(todayKey(dt))) continue;
    const st = runStatus(run, dt);
    if (st.finished || st.doneToday) continue;
    for (const it of st.todayItems) if (!(it.k in run.ticks)) run = tickItem(run, it.k, todayKey(dt), dt.getTime());
  }
  return run;
}

describe('freshFromDated (0450): a credited run starts again from today with its own reading', () => {
  for (const [name, missed, percent] of [['B2', 0, 13], ['B3', 5, 12]]) {
    it(`${name}: Day 1 from today, on track, Genesis 1-3, only the dated ticks, no credit; the old run is untouched`, () => {
      const run = partB(missed);
      const before = JSON.stringify(run);
      expect(run.credited).toBe(300);
      expect(runStatus(run, NOW).ahead).toBeGreaterThan(0);
      const fresh = freshFromDated(run, NOW);
      expect(JSON.stringify(run)).toBe(before);
      expect(fresh.id).not.toBe(run.id);
      expect([fresh.plan, fresh.start, fresh.status, fresh.credited]).toEqual(['bible-year', '2026-11-17', 'running', undefined]);
      const dated = Object.entries(run.ticks).filter(([, v]) => v);
      expect(Object.entries(fresh.ticks)).toEqual(dated);
      expect(Object.values(fresh.ticks).every(Boolean)).toBe(true);
      const st = runStatus(fresh, NOW);
      expect([st.day, st.behind, st.ahead, st.percent]).toEqual([0, 0, 0, percent]);
      expect(itemsLabel(st.todayItems, bookTitle)).toBe('Genesis 1-3');
      expect(fresh.weekdays).toEqual(run.weekdays);
      expect(fresh.pace).toEqual(run.pace);
    });
  }

  it('carries the reminder, the download choice and the name; a paused plan stays paused', () => {
    const run = pauseRun({ ...partB(0), remind: '07:30', autoAudio: false, name: 'My year' }, at('2026-11-15'));
    const fresh = freshFromDated(run, NOW);
    expect([fresh.remind, fresh.autoAudio, fresh.name, fresh.status, fresh.paused]).toEqual(['07:30', false, 'My year', 'paused', '2026-11-17']);
  });

  it('a Finish by date becomes the plan\'s own length (a restart to that date would cram it)', () => {
    const run = { ...partB(0), pace: { mode: 'by', date: '2026-12-31' } };
    const fresh = freshFromDated(run, NOW);
    expect(fresh.pace.mode).toBe('days');
    expect(fresh.pace.n).toBeGreaterThan(300);
  });

  it('never for a run with no credit, an rp1 run, or one stopped or finished: null, and no Manage row', () => {
    const plain = startCatalogPlan('bible-year', null, at('2026-10-01'));
    const credited = partB(0);
    for (const r of [plain, { ...credited, credited: 0 }, { ...credited, from: 'rp1' }, { ...credited, status: 'stopped' }, { ...credited, status: 'finished' }]) {
      expect(canCountOwnOnly(r)).toBe(false);
      expect(freshFromDated(r, NOW)).toBeNull();
      expect(countOwnOnlyRun(r, NOW)).toBeNull();
    }
    expect(canCountOwnOnly(credited)).toBe(true);
    expect(canCountOwnOnly(pauseRun(credited, NOW))).toBe(true);
  });

  it('countOwnOnlyRun: the old run as stopped today (Past plans), with the new run', () => {
    const run = partB(5);
    const [old, fresh] = countOwnOnlyRun(run, NOW);
    expect([old.id, old.status, old.stopped, old.credited]).toEqual([run.id, 'stopped', '2026-11-17', 300]);
    expect(old.ticks).toBe(run.ticks);
    expect(fresh.credited).toBeUndefined();
  });
});
