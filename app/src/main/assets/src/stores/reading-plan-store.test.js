/* ReadingPlanStore (mw18): plan runs in their own store, ticked by the read record, merged per run. */

import 'fake-indexeddb/auto'; // the stores' real IDB write path, so no 'IndexedDB is not available' write failures (console-clean)
import { describe, it, expect, beforeEach } from 'vitest';
import { ReadingPlanStore } from './reading-plan-store.js';
import { mergePlanStore } from './store-merge.js';
import { newRun, runStatus, tickItem, catchUp, untickItem, monthCells } from '../data/plan-engine.js';

const at = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 9); };
const run = (items, plan = 'x') => newRun({ plan, tracks: [{ kind: 'bible', by: 'count', items: items.map((k) => ({ k, w: 600 })) }], pace: { mode: 'days', n: items.length } }, at('2026-10-22'));

beforeEach(() => {
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
});

describe('ReadingPlanStore', () => {
  it('puts, gets and lists runs; a malformed record never gets in', () => {
    const r = run(['genesis:1', 'genesis:2']);
    ReadingPlanStore.put(r);
    ReadingPlanStore.put(/** @type {any} */ ({ id: 'bad' }));
    expect(ReadingPlanStore.all().map((x) => x.id)).toEqual([r.id]);
    expect(ReadingPlanStore.get(r.id)).toEqual(r);
    expect(ReadingPlanStore.active().length).toBe(1);
  });

  it('a run with a null or keyless item never gets in, so reading and Home never trip on it (review 11-26)', () => {
    const good = run(['genesis:1']);
    const bad = run(['genesis:1', 'genesis:2']);
    bad.tracks[0].items[1] = /** @type {any} */ (null);
    const keyless = run(['exodus:1']);
    keyless.tracks[0].items[0] = /** @type {any} */ ({ w: 600 });
    ReadingPlanStore.put(good); ReadingPlanStore.put(bad); ReadingPlanStore.put(keyless);
    expect(ReadingPlanStore.all().map((x) => x.id)).toEqual([good.id]);
    expect(() => ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'))).not.toThrow();
  });

  it('noteRead ticks every running run that holds the chapter, dated today, and nothing else', () => {
    const a = run(['genesis:1', 'genesis:2']), b = run(['genesis:1', 'exodus:1']);
    ReadingPlanStore.put(a); ReadingPlanStore.put(b);
    ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'));
    expect(ReadingPlanStore.get(a.id).ticks).toEqual({ 'genesis:1': '2026-10-23' });
    expect(ReadingPlanStore.get(b.id).ticks).toEqual({ 'genesis:1': '2026-10-23' });
    ReadingPlanStore.noteRead('john', 3, at('2026-10-23'));
    expect(Object.keys(ReadingPlanStore.get(a.id).ticks)).toEqual(['genesis:1']);
  });

  it('a paused run is not ticked and does not hold the read (P2 3.8: counts nothing while paused)', () => {
    const a = { ...run(['genesis:1', 'genesis:2']), status: /** @type {'paused'} */ ('paused'), paused: '2026-10-22' };
    ReadingPlanStore.put(a);
    expect(ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'))).toBe(false);
    expect(ReadingPlanStore.get(a.id).ticks).toEqual({});
  });

  it('a run whose start is still ahead is not ticked by a read and does not hold it; from its start day it is (C6)', () => {
    const a = { ...run(['genesis:1', 'genesis:2']), start: '2026-10-25' };
    ReadingPlanStore.put(a);
    expect(ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'))).toBe(false);
    expect(ReadingPlanStore.get(a.id).ticks).toEqual({});
    expect(ReadingPlanStore.noteRead('genesis', 1, at('2026-10-25'))).toBe(true);
    expect(ReadingPlanStore.get(a.id).ticks).toEqual({ 'genesis:1': '2026-10-25' });
    const later = { ...run(['exodus:1'], 'y'), start: '2999-01-01' };
    ReadingPlanStore.put(later);
    expect(ReadingPlanStore.holds('exodus', 1)).toBe(false);
    expect(ReadingPlanStore.holds('genesis', 2)).toBe(true);
  });

  it('a stopped or finished run is not ticked', () => {
    const a = { ...run(['genesis:1', 'genesis:2']), status: /** @type {'stopped'} */ ('stopped') };
    ReadingPlanStore.put(a);
    ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'));
    expect(ReadingPlanStore.get(a.id).ticks).toEqual({});
  });

  it('the Matthew Study Bible\'s "matthew" read ticks a Bible plan\'s "matthew-plain" chapter (bug 2)', () => {
    const a = run(['matthew-plain:5']);
    ReadingPlanStore.put(a);
    ReadingPlanStore.noteRead('matthew', 5, at('2026-10-23'));
    const got = /** @type {any} */ (ReadingPlanStore.get(a.id));
    expect(got.ticks['matthew-plain:5']).toBe('2026-10-23');
    expect(got.status).toBe('finished');
    expect(runStatus(got, at('2026-10-23')).finished).toBe(true);
  });

  it('replaceAll keeps only well-formed runs', () => {
    const a = run(['genesis:1']);
    ReadingPlanStore.replaceAll(/** @type {any} */ ([a, null, { id: 'x' }]));
    expect(ReadingPlanStore.all().map((x) => x.id)).toEqual([a.id]);
  });
});

describe('mergePlanStore', () => {
  it('two tabs that ticked different chapters of one run keep both ticks', () => {
    const base = run(['genesis:1', 'genesis:2', 'genesis:3']);
    const ours = { ...base, ticks: { 'genesis:1': '2026-10-22' }, updated: 5 };
    const theirs = { ...base, ticks: { 'genesis:2': '2026-10-22' }, updated: 6 };
    const out = mergePlanStore([base], [ours], [theirs]);
    expect(out.length).toBe(1);
    expect(Object.keys(out[0].ticks).sort()).toEqual(['genesis:1', 'genesis:2']);
  });
  it('a chapter un-marked in one tab stays un-marked when the other tab did not touch it (C4)', () => {
    const base = { ...run(['genesis:1', 'genesis:2']), ticks: { 'genesis:1': '2026-10-21', 'genesis:2': '2026-10-21' } };
    const ours = { ...base, ticks: { 'genesis:2': '2026-10-21' }, updated: 7 };
    const theirs = { ...base, ticks: { ...base.ticks, 'genesis:3': '2026-10-22' }, updated: 6 };
    const out = mergePlanStore([base], [ours], [theirs]);
    expect(Object.keys(out[0].ticks).sort()).toEqual(['genesis:2', 'genesis:3']);
  });
  it('a run removed in one tab stays removed; a run added in the other is kept', () => {
    const a = run(['genesis:1']), b = run(['exodus:1']);
    const out = mergePlanStore([a], [], [a, b]);
    expect(out.map((r) => r.id)).toEqual([b.id]);
  });
});

describe('a run\'s pinned rest days (rested) survive the store, backups and merges (Hub Lock 11-26, point 2)', () => {
  /** A Ruth run over 20 days, read Dec 3, caught up Dec 10: it holds `rested`. */
  const pinned = () => catchUp(tickItem(newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 20 } }, at('2026-12-01')), 'ruth:1', '2026-12-03', at('2026-12-03').getTime()), at('2026-12-10'));

  it('(d) put, get and replaceAll keep it, and so does a stored copy read back', () => {
    const r = pinned();
    expect(r.rested && r.rested.until).toBe('2026-12-10');
    ReadingPlanStore.put(r);
    expect(ReadingPlanStore.get(r.id)).toEqual(r);
    ReadingPlanStore.replaceAll([JSON.parse(JSON.stringify(r))]);
    expect(ReadingPlanStore.get(r.id).rested).toEqual(r.rested);
  });

  it('(b) a backup from before the field (no rested, or the older list of dates) restores as it was', () => {
    const r = pinned();
    const bare = { ...r }; delete bare.rested;
    ReadingPlanStore.replaceAll([bare]);
    expect('rested' in ReadingPlanStore.get(r.id)).toBe(false);
  });

  it('(c) two copies of a run merge with the rested of whichever has it, whichever copy is newer', () => {
    const r = pinned();
    const bare = { ...r }; delete bare.rested;
    const newer = (/** @type {any} */ x) => ({ ...x, updated: x.updated + 60000, ticks: { ...x.ticks, 'ruth:2': '2026-12-11' } });
    // The copy without it is the newer (a tick on a device still on 03d0ea090, or one that never made the change).
    const a = mergePlanStore([bare], [newer(bare)], [r]).find((x) => x.id === r.id);
    expect(a.rested).toEqual(r.rested);
    expect(a.ticks).toEqual({ 'ruth:1': '2026-12-03', 'ruth:2': '2026-12-11' });
    const b = mergePlanStore([bare], [r], [newer(bare)]).find((x) => x.id === r.id);
    expect(b.rested).toEqual(r.rested);
    // A restore merges the live record with the snapshot's, base-less, through the same merge (data-safety).
    expect(mergePlanStore(null, [newer(bare)], [r])[0].rested).toEqual(r.rested);
    expect(mergePlanStore(null, [r], [newer(bare)])[0].rested).toEqual(r.rested);
    // Both have it: the newer copy's stays.
    const later = { ...newer(r), rested: { until: '2026-12-11', ranges: [['2026-12-01', '2026-12-02']] } };
    expect(mergePlanStore(null, [r], [later])[0].rested).toEqual(later.rested);
  });
});

describe('refute 0e2c8009f: a merge that drops an unticked read drops the pins it made, as the untick did', () => {
  it('Ruth over 20 days, caught up Dec 17; tab A: Dec 13\'s read not read (Dec 21); tab B, newer, edits its older copy: Dec 14 to 16 are missed, as in A', () => {
    let run = newRun({ id: 'p-m', plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 20 } }, at('2026-12-01'));
    run = tickItem(run, 'ruth:1', '2026-12-03', 1); run = tickItem(run, 'ruth:2', '2026-12-08', 1); run = tickItem(run, 'ruth:3', '2026-12-13', 1);
    const base = catchUp(run, at('2026-12-17'));
    const a = untickItem(base, 'ruth:3', at('2026-12-21'));
    const b = { ...base, notes: { 3: 'a note' }, updated: at('2026-12-21').getTime() + 3600000 };   // an hour later
    const cells = (/** @type {any} */ r) => monthCells(r, 2026, 11, at('2026-12-21')).filter((c) => c.date >= 13 && c.date <= 16).map((c) => c.state);
    expect(cells(a)).toEqual(['missed', 'missed', 'missed', 'missed']);
    for (const [ours, theirs] of [[a, b], [b, a]]) {
      const m = mergePlanStore([base], [ours], [theirs])[0];
      expect('ruth:3' in m.ticks).toBe(false);
      expect(cells(m)).toEqual(cells(a));
      expect(m.notes).toEqual({ 3: 'a note' });
    }
  });
});
