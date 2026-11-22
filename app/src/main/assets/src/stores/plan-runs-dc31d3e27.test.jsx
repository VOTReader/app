// @ts-nocheck - ScreenLayout / LibraryNav are free globals, as in the other reading-plan screen tests
/* Task 2235 (reading plans at a glance): plan runs written by the build that ships today (dc31d3e27) load in this one
   unchanged, every tick kept, and each says its one status. plan-runs-dc31d3e27.fixture.json was written by
   `node tools/plan-states.mjs --date 2026-11-16` BEFORE 2235 changed any plan code (the plan engine, store and views
   were byte-identical to dc31d3e27 then): Bible in a Year on track, done today, 1 and 3 days behind, paused, starting
   in four days, stopped; Ruth finished; a built plan part way. The runs go into IndexedDB as the store keeps them
   (record 'v') and come back through the store's own hydrate. Main 53ae2f891's runs are main-store-upgrade.test.jsx. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import FIX from './plan-runs-dc31d3e27.fixture.json';
import { IDBAdapter } from './idb-adapter.js';
import { ReadingPlanStore } from './reading-plan-store.js';
import { planStatus, continueRun, runRow } from '../utils/plan-runs-view.js';
import { runStatus, streak, monthCells, catchUp, markDay, todayKey } from '../data/plan-engine.js';
import { startCatalogPlan } from '../data/plan-catalog.js';
import { PlansHub } from '../ui/screens/PlansHub.jsx';
import { TodayCard } from '../ui/components/TodayCard.jsx';
import { _resetPlanNavForTests } from '../utils/plan-nav.js';

const NOW = new Date(FIX.now);   // 2026-11-16 12:00, a Monday
const at = (key) => new Date(key + 'T12:00:00');
const clone = (x) => JSON.parse(JSON.stringify(x));
const byState = () => Object.fromEntries(ReadingPlanStore.all().map((r) => [r.id.replace(/^st-/, ''), r]));

beforeAll(async () => {
  await IDBAdapter.put('vot-reading-plans', 'v', clone(FIX.runs));
  ReadingPlanStore._resetForTests();
  await ReadingPlanStore._hydrate();
});

describe('plan runs the shipping build (dc31d3e27) wrote, opened by this build', () => {
  it('load record for record, every tick kept, nothing rewritten', () => {
    expect(ReadingPlanStore.getState()).toBe('loaded');
    expect(clone(ReadingPlanStore.all())).toEqual(FIX.runs);
    expect(ReadingPlanStore.all().map((r) => [r.id, r.status, Object.keys(r.ticks || {}).length])).toEqual(
      FIX.runs.map((r) => [r.id, r.status, Object.keys(r.ticks || {}).length]));
    expect(ReadingPlanStore.active().map((r) => r.id)).toEqual(['st-ontrack', 'st-donetoday', 'st-missed1', 'st-missed3', 'st-paused', 'st-notstarted', 'st-custom']);
  });

  it('each says one status, in the words every plan surface uses', () => {
    const said = Object.fromEntries(Object.entries(byState()).map(([k, r]) => [k, planStatus(r, NOW).text]));
    expect(said).toEqual({
      ontrack: 'On track', donetoday: 'Done today', missed1: '1 day behind · finishes Nov 11, 2027', missed3: '3 days behind · finishes Nov 10, 2027',
      paused: 'Paused', notstarted: 'Not started · starts Fri Nov 20', finished: 'Finished', stopped: 'Stopped Nov 10', custom: 'On track',
    });
    // runRow carries the same status to Home's card
    expect(runRow(byState().missed3, NOW).status.text).toBe(said.missed3);
  });

  it('the dates that went unread show on the week strip and in the month; a paused stretch is not missed', () => {
    const s = byState();
    const missedIn = (r) => streak(r, NOW).week.filter((d) => d.missed).map((d) => d.n);
    expect(missedIn(s.missed3)).toEqual([15]);   // Fri 13 and Sat 14 are last week
    expect(monthCells(s.missed3, 2026, 10, NOW).filter((c) => c.state === 'missed').map((c) => c.date)).toEqual([13, 14, 15]);
    expect(missedIn(s.missed1)).toEqual([15]);
    expect(missedIn(s.ontrack)).toEqual([]);
    expect(missedIn(s.paused)).toEqual([]);
    expect(streak(s.paused, NOW).week.filter((d) => d.off).map((d) => d.n)).toEqual([15, 16, 17, 18, 19, 20, 21]);   // paused from Fri 13 on: no reading day
  });

  it('Home, the Plans list and a plan page draw them without writing a run or reading the retired ribbon key', () => {
    globalThis.ScreenLayout = ({ children, navChildren }) => <main>{navChildren}{children}</main>;
    globalThis.LibraryNav = ({ leftExtras, rightExtras }) => <div>{leftExtras}{rightExtras}</div>;
    globalThis.ReadingPlanStore = ReadingPlanStore;
    localStorage.setItem('vot-plan-ribbon-hidden', '1');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const v0 = ReadingPlanStore.getVersion();
    try {
      _resetPlanNavForTests();
      const rows = ReadingPlanStore.active().map((r) => runRow(r, NOW));
      render(<><TodayCard rows={rows} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} onOpenPlan={vi.fn()} />
        <PlansHub readingPlans={[]} isRead={() => false} onStartSession={vi.fn()} onBack={vi.fn()} /></>);
      expect(document.querySelectorAll('.plan-run-row').length).toBe(7);
      expect(document.querySelector('[aria-label="Past plans"]').textContent).toMatch(/Ruth in four days.*Bible in a Year|Bible in a Year.*Ruth in four days/);
      expect(ReadingPlanStore.getVersion()).toBe(v0);
      expect(clone(ReadingPlanStore.all())).toEqual(FIX.runs);
      expect(get.mock.calls.filter(([k]) => k === 'vot-plan-ribbon-hidden')).toEqual([]);
      expect(localStorage.getItem('vot-plan-ribbon-hidden')).toBe('1');   // left in storage, as the overhaul does
    } finally {
      get.mockRestore();
      cleanup();
      delete globalThis.ReadingPlanStore;
    }
  });

  it('a stopped run continues where it stopped: ticks kept, the stopped days a pause (never missed or behind)', () => {
    const r = byState().stopped;
    const before = runStatus(r, at('2026-11-10'));
    const back = continueRun(r, NOW);
    expect(back.status).toBe('running');
    expect(back.ticks).toEqual(r.ticks);
    expect(back.pauses.at(-1)).toEqual(['2026-11-10', '2026-11-15']);
    expect(runStatus(back, NOW).behind).toBe(before.behind);
    expect(streak(back, NOW).week.filter((d) => d.missed)).toEqual([]);
  });
});

describe('the status counts reading days of slip (hub 22:35)', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => cleanup());

  it('a Mon-Fri plan that missed one Friday is 1 day behind, though its finish moves three calendar days', () => {
    const weekdays = [false, true, true, true, true, true, false];
    let run = startCatalogPlan('bible-year', null, at('2026-11-02'), { pace: { mode: 'days', n: 10 }, weekdays });
    expect(run.target).toBe('2026-11-13');   // ten weekdays: Mon Nov 2 to Fri Nov 13
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'];
    days.forEach((k, d) => { run = markDay(run, d, true, at(k)); });
    const st = runStatus(run, NOW);   // Mon Nov 16, Friday the 13th not read
    expect([st.behind, st.late]).toEqual([1, 3]);
    expect(planStatus(run, NOW, st).text).toBe('1 day behind · finishes Nov 16');
    expect(streak(run, NOW).week.filter((d) => d.off).map((d) => d.n)).toEqual([15, 21]);   // Sun, Sat: no reading
  });

  it('missed 4 days, caught up 1: 3 days behind beside 4 dashed dates; Keep my daily amount clears the status, the dates stay', () => {
    let run = startCatalogPlan('bible-year', null, at('2026-11-09'));
    for (const [d, k] of [[0, '2026-11-09'], [1, '2026-11-10'], [2, '2026-11-11'], [3, '2026-11-16'], [4, '2026-11-16']]) run = markDay(run, d, true, at(k));
    const missed = (r) => monthCells(r, 2026, 10, NOW).filter((c) => c.state === 'missed').map((c) => c.date);
    expect(missed(run)).toEqual([12, 13, 14, 15]);
    expect(planStatus(run, NOW).text).toBe('3 days behind · finishes Nov 11, 2027');
    act(() => { run = catchUp(run, NOW); });
    expect(planStatus(run, NOW).key).toBe('done');   // today's portion is read: "Done today", no longer behind
    expect(runStatus(run, NOW).behind).toBe(0);
    expect(missed(run)).toEqual([12, 13, 14, 15]);
    expect(todayKey(NOW)).toBe('2026-11-16');
  });
});
