/* ReadingPlanStore (mw18): plan runs in their own store, ticked by the read record, merged per run. */

import 'fake-indexeddb/auto'; // the stores' real IDB write path, so no 'IndexedDB is not available' write failures (console-clean)
import { describe, it, expect, beforeEach } from 'vitest';
import { ReadingPlanStore } from './reading-plan-store.js';
import { mergePlanStore } from './store-merge.js';
import { newRun, runStatus, tickItem, catchUp, untickItem, monthCells, markDay, markOn, changePace, changeWeekdays } from '../data/plan-engine.js';
import { startOverRun } from '../utils/plan-runs-view.js';

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

  /* Hub Lock 11-26 (resurrection): a copy without `rested` that is newer than one with it must never get the older
     copy's pins back over a change the reader made on purpose. The app never deletes the field (an untick that cuts
     every pin leaves { until, ranges: [] }), so a copy without it never had it; what such a copy can still do on
     purpose is take a read back or date one in the past, which cuts the pins from that date. */
  const ruth = (/** @type {string} */ readOn) => tickItem(newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 20 } }, at('2026-12-01')), 'ruth:1', readOn, at(readOn).getTime());
  const one = (/** @type {any[]} */ out, /** @type {string} */ id) => out.find((x) => x.id === id);

  it('(e) an untick that cuts every pin keeps the field, and the merge keeps the cut (with a base and without)', () => {
    const r = catchUp(ruth('2026-12-01'), at('2026-12-10'));
    expect(r.rested).toEqual({ until: '2026-12-10', ranges: [['2026-12-01', '2026-12-05']] });
    const cut = untickItem(r, 'ruth:1', at('2026-12-11'));
    expect(cut.rested).toEqual({ until: '2026-12-01', ranges: [] });
    expect(one(mergePlanStore([r], [cut], [r]), r.id).rested).toEqual(cut.rested);
    expect(one(mergePlanStore([r], [r], [cut]), r.id).rested).toEqual(cut.rested);
    expect(mergePlanStore(null, [cut], [r])[0].rested).toEqual(cut.rested);
    expect(mergePlanStore(null, [r], [cut])[0].rested).toEqual(cut.rested);
    // "Not read yet" on the day, and "I read it on…", the same.
    const r3 = catchUp(ruth('2026-12-03'), at('2026-12-10'));
    for (const changed of [markDay(r3, 2, false, at('2026-12-11')), markOn(r3, '2026-12-05', at('2026-12-11'))]) {
      expect(changed.rested.until < r3.rested.until).toBe(true);
      expect(one(mergePlanStore([r3], [changed], [r3]), r3.id).rested).toEqual(changed.rested);
      expect(one(mergePlanStore([r3], [r3], [changed]), r3.id).rested).toEqual(changed.rested);
    }
  });

  it('(f) a Stop or a Start over keeps the stopped run\'s pins, and the new run never gets them', () => {
    const r = catchUp(ruth('2026-12-03'), at('2026-12-10'));
    const [old, fresh] = startOverRun(r, at('2026-12-11'));
    expect(old.status).toBe('stopped');
    expect(old.rested).toEqual(r.rested);
    for (const out of [mergePlanStore([r], [old, fresh], [r]), mergePlanStore([r], [r], [old, fresh]), mergePlanStore(null, [old, fresh], [r])]) {
      expect(one(out, r.id).status).toBe('stopped');
      expect(one(out, r.id).rested).toEqual(r.rested);
      expect('rested' in one(out, fresh.id)).toBe(false);
    }
  });

  it('(g) a read taken back or dated back on a copy that never had the pins cuts them in the merge, as on the copy that had them', () => {
    const before = ruth('2026-12-03');                       // the copy a second tab (or 03d0ea090) still holds
    const r = catchUp(before, at('2026-12-10'));             // this tab caught up: pins up to Dec 10
    const ops = [
      (/** @type {any} */ x) => untickItem(x, 'ruth:1', at('2026-12-11')),
      (/** @type {any} */ x) => markDay(x, 2, false, at('2026-12-11')),
      (/** @type {any} */ x) => markOn(x, '2026-12-05', at('2026-12-11')),
    ];
    for (const op of ops) {
      const stale = op(before);
      expect('rested' in stale).toBe(false);
      const want = op(r).rested;                             // what the change does on the copy with the pins
      expect(want.until < r.rested.until).toBe(true);
      const a = one(mergePlanStore([before], [stale], [r]), r.id);   // the second tab saves over the caught-up copy
      expect(a.ticks).toEqual(stale.ticks);
      expect(a.rested).toEqual(want);
      const b = one(mergePlanStore([before], [r], [stale]), r.id);   // this tab saves after the second tab's change
      expect(b.ticks).toEqual(stale.ticks);
      expect(b.rested).toEqual(want);
    }
    // A plain read today on the copy without the pins (on or after the day they end) leaves them as they were (c).
    const read = tickItem(before, 'ruth:2', '2026-12-11', at('2026-12-11').getTime());
    expect(one(mergePlanStore([before], [read], [r]), r.id).rested).toEqual(r.rested);
    // A broken stored range never throws in the save path.
    const broken = { ...r, rested: { until: '2026-12-10', ranges: [null, ['2026-12-01']] } };
    expect(() => mergePlanStore([before], [ops[0](before)], [broken])).not.toThrow();
  });

  it('(h) a read this copy took back BEFORE it pinned leaves its pins whole when the merge drops the read the other copy kept', () => {
    // Ruth over 10 days from Dec 1, read Dec 3 and Dec 4; this copy takes the Dec 4 read back on Dec 5 and catches up on
    // Dec 8, so its pins never counted that read and Dec 4 shows missed. The other copy still holds it; the merge drops
    // it (C4). Cutting the pins from Dec 4 (its date) re-judged Dec 4 against the caught-up target: a rest day.
    let base = tickItem(newRun({ id: 'p-h', plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 10 } }, at('2026-12-01')), 'ruth:1', '2026-12-03', at('2026-12-03').getTime());
    base = tickItem(base, 'ruth:2', '2026-12-04', at('2026-12-04').getTime());
    const mine = catchUp(untickItem(base, 'ruth:2', at('2026-12-05')), at('2026-12-08'));
    const cells = (/** @type {any} */ r) => monthCells(r, 2026, 11, at('2026-12-08')).filter((c) => c.date < 8).map((c) => c.state);
    expect(cells(mine)).toEqual(['none', 'missed', 'read', 'missed', 'missed', 'missed', 'missed']);
    for (const later of [3600000, -3600000]) {   // the other copy, still holding ruth:2, saved an hour after this one, or before
      const other = { ...base, notes: { 1: 'a note' }, updated: mine.updated + later };
      for (const [ours, theirs] of [[mine, other], [other, mine]]) {
        const m = one(mergePlanStore([base], [ours], [theirs]), base.id);
        expect('ruth:2' in m.ticks).toBe(false);
        expect(m.rested).toEqual(mine.rested);
        if (later < 0) expect(cells(m)).toEqual(cells(mine));   // this copy the newer: the merge reads as it does
      }
    }
  });

  it('(i) the days off a change of days pinned (rested.off) stay through the merge\'s cut, and a broken rested is left as it was', () => {
    // b529d9fe9's Jude: Tue-Sat from Dec 1, Jude 1 read Dec 2, Finish by Dec 20 set Dec 4, every day from Dec 10.
    let base = newRun({ id: 'p-i', plan: 'custom', weekdays: [false, false, true, true, true, true, true], tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3].map((c) => ({ k: 'jude:' + c, w: 500 })) }], pace: { mode: 'days', n: 9 } }, at('2026-12-01'));
    base = changePace(tickItem(base, 'jude:1', '2026-12-02', 1), { mode: 'by', date: '2026-12-20' }, at('2026-12-04'));
    const pinned = changeWeekdays(base, [true, true, true, true, true, true, true], at('2026-12-10'));
    expect(pinned.rested.off).toEqual([['2026-12-06', '2026-12-07']]);
    const stale = untickItem(base, 'jude:1', at('2026-12-11'));               // the other tab, before the change of days
    const offDays = (/** @type {any} */ r) => monthCells(r, 2026, 11, at('2026-12-11')).filter((c) => c.date === 6 || c.date === 7).map((c) => c.state);
    for (const later of [3600000, -3600000]) {
      const p = { ...pinned, updated: stale.updated + later };
      for (const [ours, theirs] of [[p, stale], [stale, p]]) {
        const m = one(mergePlanStore([base], [ours], [theirs]), base.id);
        expect('jude:1' in m.ticks).toBe(false);
        expect(offDays(m)).toEqual(['none', 'none']);
        if (later > 0) expect(m.rested).toEqual(untickItem(pinned, 'jude:1', at('2026-12-11')).rested);   // as the untick on the pinned copy
      }
    }
    const broken = { ...pinned, rested: { ranges: [['2026-12-01', '2026-12-05']] }, updated: stale.updated + 3600000 };
    expect(one(mergePlanStore([base], [broken], [stale]), base.id).rested).toEqual(broken.rested);
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
