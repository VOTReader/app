// @ts-nocheck - fixture runs are plain JSON
/* Task 2310 item 6 (Corbin 11-16 "change it"): a custom plan's contents change after it starts. The plan written by the
   shipping build (plan-runs-dc31d3e27.fixture.json, 'st-custom': Ruth, Jonah, Esther, 8 chapters read Nov 12-15) is
   changed by this build: a NEW run with the new contents, every tick of a kept chapter carried by its key with its
   date, the old run kept as stopped (Past plans), nothing re-cut in place and no field the stored runs lack. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import FIX from './plan-runs-dc31d3e27.fixture.json';
import { IDBAdapter } from './idb-adapter.js';
import { ReadingPlanStore } from './reading-plan-store.js';
import { editRun } from '../utils/plan-runs-view.js';
import { builderFromRun, builderSpec } from '../data/plan-builder.js';
import { runStatus, replaceContents, newRun, tickItem, pauseRun, totalDays, todayKey, dayNum, dateOf, schedule } from '../data/plan-engine.js';

const NOW = new Date(FIX.now);   // 2026-11-16 12:00
const clone = (x) => JSON.parse(JSON.stringify(x));
const custom = () => clone(FIX.runs.find((r) => r.id === 'st-custom'));
const keysOf = (run) => run.tracks.flatMap((t) => t.items.map((it) => it.k));
/** The fixture plan's builder state with its picks changed by `fn`. */
const changed = (run, fn) => {
  const b = builderFromRun(run, null);
  return builderSpec({ ...b, picks: fn(b.picks), order: 'picked' }, null);
};
// Ruth and Jonah kept, Esther out, Jonah's neighbour Micah in
const swapEsther = (picks) => picks.filter((p) => p.bid !== 'esther').concat([{ t: 'b', bid: 'micah', ch: null }]);

describe('the builder reads a stored custom plan back', () => {
  it('as its picks, in its order, whole books whole; the same picks rebuild the same chapters, so saving them changes nothing', () => {
    const run = custom();
    const b = builderFromRun(run, null);
    expect(b.picks).toEqual([{ t: 'b', bid: 'ruth', ch: null }, { t: 'b', bid: 'jonah', ch: null }, { t: 'b', bid: 'esther', ch: null }]);
    expect([b.share, b.goal, b.name]).toEqual(['serial', { mode: 'minutes', n: 5 }, 'Three short books']);
    const spec = builderSpec({ ...b, order: 'picked' }, null);
    expect(spec.tracks.flatMap((t) => t.items.map((it) => it.k))).toEqual(keysOf(run));
    expect(editRun(run, spec, NOW)).toBeNull();
    const renamed = editRun(run, { ...spec, name: 'Short books' }, NOW);
    expect(renamed.length).toBe(1);
    expect(renamed[0]).toEqual({ ...run, name: 'Short books', updated: NOW.getTime() });
  });

  it('some chapters of a book stay some chapters', () => {
    const run = newRun(builderSpec({ picks: [{ t: 'b', bid: 'genesis', ch: [1, 2, 5] }], order: 'picked', share: 'side', goal: { mode: 'items', n: 1 }, weekdays: Array(7).fill(true) }, null), NOW);
    expect(builderFromRun(run, null).picks).toEqual([{ t: 'b', bid: 'genesis', ch: [1, 2, 5] }]);
  });
});

describe('changing a stored custom plan makes a new run that keeps every tick', () => {
  let out, run;
  beforeAll(async () => {
    await IDBAdapter.put('vot-reading-plans', 'v', clone(FIX.runs));
    ReadingPlanStore._resetForTests();
    await ReadingPlanStore._hydrate();
    run = ReadingPlanStore.get('st-custom');
    out = editRun(run, changed(run, swapEsther), NOW);
    for (const r of out) ReadingPlanStore.put(r);
    await new Promise((r) => setTimeout(r, 50));
    ReadingPlanStore._resetForTests();
    await ReadingPlanStore._hydrate();   // what the next launch reads
  });

  it('the old run is kept as it was, only stopped today: every tick, its days and segs untouched', () => {
    const old = ReadingPlanStore.get('st-custom');
    expect(old).toEqual({ ...custom(), status: 'stopped', stopped: '2026-11-16', updated: NOW.getTime() });
  });

  it('the new run has the new chapters, from today, and every tick of a kept chapter with its own date', () => {
    const fresh = ReadingPlanStore.get(out[1].id);
    expect(fresh.id).not.toBe('st-custom');
    expect(fresh.status).toBe('running');
    expect(fresh.start).toBe('2026-11-16');
    expect(keysOf(fresh)).toEqual(['ruth:1', 'ruth:2', 'ruth:3', 'ruth:4', 'jonah:1', 'jonah:2', 'jonah:3', 'jonah:4',
      'micah:1', 'micah:2', 'micah:3', 'micah:4', 'micah:5', 'micah:6', 'micah:7']);
    const kept = Object.fromEntries(Object.entries(custom().ticks).filter(([k]) => keysOf(fresh).includes(k)));
    expect(Object.keys(kept).length).toBe(8);   // all 8 read chapters are Ruth and Jonah
    expect(fresh.ticks).toEqual(kept);
    expect(runStatus(fresh, NOW)).toMatchObject({ itemsDone: 8, itemsTotal: 15, finished: false, doneToday: false });
    expect(['name', 'plan', 'share', 'weekdays', 'pace'].map((k) => fresh[k])).toEqual(['Three short books', 'custom', 'serial', custom().weekdays, { mode: 'minutes', n: 5 }]);
    // no field the shipping build's runs do not have
    const known = new Set(FIX.runs.flatMap((r) => Object.keys(r)));
    expect(Object.keys(fresh).filter((k) => !known.has(k))).toEqual([]);
  });

  it('what is left is cut at the plan\'s 5 minutes a day from today; the read days stay read', () => {
    const fresh = ReadingPlanStore.get(out[1].id);
    const st = runStatus(fresh, NOW);
    const days = schedule(fresh, NOW);
    expect(days.filter((d) => d.done).flatMap((d) => d.items.map((it) => it.k)).sort()).toEqual(Object.keys(fresh.ticks).sort());
    expect(days.find((d) => !d.done).date).toBe('2026-11-16');
    expect(st.perDay.words).toBeLessThanOrEqual(5 * 200 * 1.6);
    expect(st.behind).toBe(0);
  });
});

describe('the plan keeps its pace, pause, start and reminder', () => {
  const genesis = (n) => Array.from({ length: n }, (_, i) => i + 1);
  const spec = (ch, pace) => builderSpec({ picks: [{ t: 'b', bid: 'genesis', ch }], order: 'picked', share: 'side', goal: pace, weekdays: Array(7).fill(true) }, null);
  const daysAgo = (n) => new Date(NOW.getTime() - n * 864e5);
  const readFirst = (run, n) => { let r = run; for (let i = 0; i < n; i++) r = tickItem(r, 'genesis:' + (i + 1), todayKey(daysAgo(n - i)), 1); return r; };

  it('a length is the whole plan\'s: 10 days with 4 read leaves 6 days for what is left, 2 chapters added', () => {
    const run = readFirst(newRun(spec(genesis(10), { mode: 'days', n: 10 }), daysAgo(4)), 4);
    const fresh = replaceContents(run, spec(genesis(12), { mode: 'days', n: 10 }), NOW);
    const st = runStatus(fresh, NOW);
    expect(st.itemsDone).toBe(4);
    expect(st.total - st.day).toBe(6);
  });

  it('a Finish by date stays the date', () => {
    const by = dateOf(dayNum('2026-11-16') + 9);
    const run = readFirst(newRun(spec(genesis(20), { mode: 'by', date: by }), daysAgo(3)), 3);
    const fresh = replaceContents(run, spec(genesis(25), { mode: 'by', date: by }), NOW);
    expect(fresh.target).toBe(by);
    expect(runStatus(fresh, NOW).projected).toBe(by);
  });

  it('a paused plan stays paused; one that starts later keeps its start; the reminder carries', () => {
    const paused = pauseRun({ ...readFirst(newRun(spec(genesis(10), { mode: 'days', n: 10 }), daysAgo(4)), 2), remind: '07:30' }, daysAgo(1));
    const p2 = replaceContents(paused, spec(genesis(11), { mode: 'days', n: 10 }), NOW);
    expect([p2.status, p2.remind, Object.keys(p2.ticks).length]).toEqual(['paused', '07:30', 2]);
    const later = newRun({ ...spec(genesis(5), { mode: 'items', n: 1 }), startOn: '2026-11-20' }, NOW);
    expect(replaceContents(later, spec(genesis(6), { mode: 'items', n: 1 }), NOW).start).toBe('2026-11-20');
  });

  it('every chapter of the new contents already read: the new run is finished', () => {
    const run = readFirst(newRun(spec(genesis(5), { mode: 'days', n: 5 }), daysAgo(3)), 3);
    const fresh = replaceContents(run, spec([1, 2, 3], { mode: 'days', n: 5 }), NOW);
    expect([fresh.status, totalDays(fresh) > 0]).toEqual(['finished', true]);
  });
});
