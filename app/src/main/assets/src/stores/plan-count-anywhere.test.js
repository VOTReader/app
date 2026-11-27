/* plan-own (Corbin 11-26 18:20): "it looks like all your reading counts towards the plan, which I don't like. That
   should be an option or a toggle". A plan's "Count reading from anywhere" switch (PlanRun.countAnywhere; absent is
   on, today's behaviour). Off: a read counts for the plan only when it was opened from the plan (a sitting of that
   plan: its Today card, a day row, the reminder, Next into the day's next reading) or ticked by hand there; a read
   from anywhere else ticks nothing in it and offers "Count it" instead. */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReadingPlanStore } from './reading-plan-store.js';
import { mergePlanStore } from './store-merge.js';
import { newRun, replaceContents, freshFromDated, countsAnywhere } from '../data/plan-engine.js';
import { startOverRun } from '../utils/plan-runs-view.js';
import { beginPlanSession, endPlanSession, notePlanSessionPlace, sessionReachedEnd, setPlanSessionHost, planSession,
  _resetPlanSessionForTests } from '../utils/plan-session.js';
import { useReadProgress } from '../hooks/useMarkAsRead.js';

const at = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 9); };
const mk = (items, extra = {}) => ({ ...newRun({ plan: 'x', tracks: [{ kind: 'bible', by: 'count', items: items.map((k) => ({ k, w: 600 })) }],
  pace: { mode: 'days', n: items.length } }, at('2026-10-22')), ...extra });

beforeEach(() => {
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  ReadingPlanStore.setSitting(null);
});

describe('countAnywhere on the run', () => {
  it('absent or true counts reading from anywhere; only false is "from the plan only"', () => {
    expect(countsAnywhere(mk(['genesis:1']))).toBe(true);
    expect(countsAnywhere(mk(['genesis:1'], { countAnywhere: true }))).toBe(true);
    expect(countsAnywhere(mk(['genesis:1'], { countAnywhere: false }))).toBe(false);
  });
});

describe('noteRead with a plan that counts only its own reading', () => {
  it('a read from elsewhere does not tick an OFF run, and does tick an ON run beside it', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false });
    const on = mk(['genesis:1', 'exodus:1']);
    ReadingPlanStore.put(off); ReadingPlanStore.put(on);
    expect(ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'))).toBe(true);   // the ON run holds and counts it
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({});
    expect(ReadingPlanStore.get(on.id).ticks).toEqual({ 'genesis:1': '2026-10-23' });
  });

  it('an OFF run alone: the read is not counted, so it does not stand in for Mark as read (false)', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false });
    ReadingPlanStore.put(off);
    expect(ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'))).toBe(false);
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({});
  });

  it('holds() still names the chapter, so the read detector stays on for it with Mark as read off (the offer needs the read)', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false, start: '2020-01-01' });
    ReadingPlanStore.put(off);
    expect(ReadingPlanStore.holds('genesis', 1)).toBe(true);
    expect(ReadingPlanStore.holds('exodus', 1)).toBe(false);
  });

  it('a read opened from the plan (its sitting) ticks the OFF run and counts as a plan read (true)', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false });
    ReadingPlanStore.put(off);
    ReadingPlanStore.setSitting({ runId: off.id, keys: ['genesis:1', 'genesis:2'] });
    expect(ReadingPlanStore.noteRead('genesis', 2, at('2026-10-23'))).toBe(true);
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({ 'genesis:2': '2026-10-23' });
  });

  it("another plan's sitting does not count for an OFF run, and a sitting never counts a chapter outside its day", () => {
    const a = mk(['genesis:1', 'genesis:2'], { countAnywhere: false });
    const b = mk(['genesis:1', 'genesis:3'], { countAnywhere: false });
    ReadingPlanStore.put(a); ReadingPlanStore.put(b);
    ReadingPlanStore.setSitting({ runId: a.id, keys: ['genesis:1'] });
    ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'));
    expect(ReadingPlanStore.get(a.id).ticks).toEqual({ 'genesis:1': '2026-10-23' });
    expect(ReadingPlanStore.get(b.id).ticks).toEqual({});
    ReadingPlanStore.noteRead('genesis', 2, at('2026-10-23'));                       // a's, but not in the sitting's day
    expect(ReadingPlanStore.get(a.id).ticks).toEqual({ 'genesis:1': '2026-10-23' });
  });

  it("the Matthew Study Bible's read counts for an OFF Bible plan's matthew-plain chapter inside its sitting", () => {
    const off = mk(['matthew-plain:5', 'matthew-plain:6'], { countAnywhere: false });
    ReadingPlanStore.put(off);
    ReadingPlanStore.setSitting({ runId: off.id, keys: ['matthew-plain:5', 'matthew-plain:6'] });
    ReadingPlanStore.noteRead('matthew', 5, at('2026-10-23'));
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({ 'matthew-plain:5': '2026-10-23' });
  });
});

describe('the offer: a plan item finished from elsewhere', () => {
  it('names the OFF runs that hold it and did not count it; ON runs, paused runs and ticked items are not offered', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false });
    const done = mk(['genesis:1'], { countAnywhere: false, ticks: { 'genesis:1': '2026-10-22' } });
    const paused = mk(['genesis:1'], { countAnywhere: false, status: 'paused', paused: '2026-10-22' });
    const on = mk(['genesis:1']);
    for (const r of [off, done, paused, on]) ReadingPlanStore.put(r);
    const seen = [];
    const stop = ReadingPlanStore.onOffer((o) => seen.push(o));
    ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'));
    stop();
    expect(seen).toEqual([{ bid: 'genesis', cid: 1, runIds: [off.id], at: at('2026-10-23').getTime() }]);
  });

  it('a read inside the sitting offers nothing for that run; nothing is offered when no OFF run holds it', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false });
    ReadingPlanStore.put(off);
    const seen = [];
    const stop = ReadingPlanStore.onOffer((o) => seen.push(o));
    ReadingPlanStore.setSitting({ runId: off.id, keys: ['genesis:1', 'genesis:2'] });
    ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'));
    ReadingPlanStore.setSitting(null);
    ReadingPlanStore.noteRead('exodus', 1, at('2026-10-23'));
    stop();
    expect(seen).toEqual([]);
  });

  it('Count it ticks the item in those runs, dated today, and from then on the read counts as a plan read', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false });
    const other = mk(['genesis:1'], { countAnywhere: false });
    ReadingPlanStore.put(off); ReadingPlanStore.put(other);
    ReadingPlanStore.countRead([off.id], 'genesis', 1, at('2026-10-23'));
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({ 'genesis:1': '2026-10-23' });
    expect(ReadingPlanStore.get(other.id).ticks).toEqual({});
    expect(ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'))).toBe(true);   // counted: the read record follows it
  });
});

describe("the plan's own Listen is opened from the plan", () => {
  afterEach(() => { ReadingPlanStore.setListening(null); });

  it('a full listen of a reading its Listen is playing ticks the OFF run, once; a later listen of it elsewhere is elsewhere', () => {
    const off = mk(['genesis:1', 'genesis:2', 'genesis:3'], { countAnywhere: false });
    ReadingPlanStore.put(off);
    ReadingPlanStore.setListening({ runId: off.id, keys: ['genesis:1', 'genesis:2'] });
    const seen = [];
    const stop = ReadingPlanStore.onOffer((o) => seen.push(o));
    expect(ReadingPlanStore.noteRead('genesis', 1, undefined, { listen: true })).toBe(true);
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:1']);
    expect(ReadingPlanStore.noteRead('genesis', 3, undefined, { listen: true })).toBe(false);                    // not in the portion it plays
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:1']);
    stop();
    expect(seen.map((o) => o.cid)).toEqual([3]);
  });

  it("another plan's Listen counts nothing for an OFF run, and null forgets it", () => {
    const a = mk(['genesis:1'], { countAnywhere: false });
    const b = mk(['genesis:1'], { countAnywhere: false });
    ReadingPlanStore.put(a); ReadingPlanStore.put(b);
    ReadingPlanStore.setListening({ runId: a.id, keys: ['genesis:1'] });
    ReadingPlanStore.noteRead('genesis', 1, undefined, { listen: true });
    expect(Object.keys(ReadingPlanStore.get(a.id).ticks)).toEqual(['genesis:1']);
    expect(ReadingPlanStore.get(b.id).ticks).toEqual({});
    const c = mk(['exodus:1'], { countAnywhere: false });
    ReadingPlanStore.put(c);
    ReadingPlanStore.setListening({ runId: c.id, keys: ['exodus:1'] });
    ReadingPlanStore.setListening(null);
    expect(ReadingPlanStore.noteRead('exodus', 1, undefined, { listen: true })).toBe(false);
    expect(ReadingPlanStore.get(c.id).ticks).toEqual({});
  });
});

describe('the switch survives a merge, a backup and every new run made from a plan', () => {
  it('two copies with different values: the newer copy (updated) wins, as remind and autoAudio do; the ticks of both stay', () => {
    const base = mk(['genesis:1', 'genesis:2']);
    const ours = { ...base, countAnywhere: false, updated: base.updated + 1000 };
    const theirs = { ...base, ticks: { 'genesis:1': '2026-10-23' }, updated: base.updated + 500 };
    const m = mergePlanStore([base], [ours], [theirs]);
    expect(m[0].countAnywhere).toBe(false);
    expect(m[0].ticks).toEqual({ 'genesis:1': '2026-10-23' });
    const later = { ...base, countAnywhere: true, updated: base.updated + 2000 };
    expect(mergePlanStore([base], [ours], [later])[0].countAnywhere).toBe(true);
  });

  it('a backup carries it: replaceAll and a stored copy read back keep false and true; a backup without it stays on', () => {
    const off = mk(['genesis:1'], { countAnywhere: false });
    const on = mk(['exodus:1'], { countAnywhere: true });
    const old = mk(['john:1']);
    ReadingPlanStore.replaceAll(JSON.parse(JSON.stringify([off, on, old])));
    expect(ReadingPlanStore.get(off.id).countAnywhere).toBe(false);
    expect(ReadingPlanStore.get(on.id).countAnywhere).toBe(true);
    expect(countsAnywhere(ReadingPlanStore.get(old.id))).toBe(true);
  });

  it('Start over, Change what is in it and Count only this plan\'s reading keep the choice', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false, ticks: { 'genesis:1': '' }, credited: 1 });
    expect(startOverRun(off, at('2026-10-24'))[1].countAnywhere).toBe(false);
    expect(replaceContents(off, { plan: 'x', tracks: off.tracks, pace: off.pace }, at('2026-10-24')).countAnywhere).toBe(false);
    expect(/** @type {any} */ (freshFromDated(off, at('2026-10-24'))).countAnywhere).toBe(false);
    const on = { ...off, countAnywhere: true };
    expect(startOverRun(on, at('2026-10-24'))[1].countAnywhere).toBe(true);
    const old = mk(['genesis:1', 'genesis:2'], { ticks: { 'genesis:1': '' }, credited: 1 });
    expect(countsAnywhere(startOverRun(old, at('2026-10-24'))[1])).toBe(true);
  });
});

describe('a plan sitting tells the store it is open', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).ReadingPlanStore = ReadingPlanStore;
    _resetPlanSessionForTests();
  });
  afterEach(() => { _resetPlanSessionForTests(); delete (/** @type {any} */ (globalThis)).ReadingPlanStore; vi.useRealTimers(); });

  const begin = () => {
    const off = { ...newRun({ plan: 'x', tracks: [{ kind: 'bible', by: 'count', items: ['genesis:1', 'genesis:2', 'genesis:3', 'genesis:4'].map((k) => ({ k, w: 600 })) }],
      pace: { mode: 'days', n: 2 } }, new Date()), countAnywhere: false };
    ReadingPlanStore.put(off);
    beginPlanSession({ runId: off.id, day: 0, name: 'X' });
    return off;
  };

  it('inside the sitting a read of the day counts (and stands in for Mark as read); after Stop for now it does not', () => {
    const off = begin();
    notePlanSessionPlace('genesis', 1);
    expect(ReadingPlanStore.noteRead('genesis', 2)).toBe(true);
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:2']);
    endPlanSession();
    expect(ReadingPlanStore.noteRead('genesis', 1)).toBe(false);
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:2']);
  });

  it('a sitting left another way (paused) counts nothing: the same chapter opened later from the Bible is "elsewhere"', () => {
    const off = begin();
    notePlanSessionPlace('genesis', 1);
    notePlanSessionPlace(null);
    vi.runAllTimers();
    expect(ReadingPlanStore.noteRead('genesis', 1)).toBe(false);
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({});
  });

  it("reaching the end of a reading inside the sitting ticks the plan through the read record (Mark as read off)", () => {
    const off = begin();
    const marked = [];
    setPlanSessionHost(/** @type {any} */ ({ move() {}, open() {}, back() {}, openPlans() {}, openNote() {}, unmarkRead() {}, isRead: () => false,
      markRead: (bid, cid) => { if (ReadingPlanStore.noteRead(bid, cid)) marked.push(bid + ':' + cid); } }));
    notePlanSessionPlace('genesis', 1);
    sessionReachedEnd('genesis:1');
    expect(marked).toEqual(['genesis:1']);
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:1']);
  });
});

/* hub 11-26 (plan-own r2): with the switch off a sitting is the one door that counts reading, so a sitting that never
   ended would count the day's readings wherever they were read. What ends (pauses) one: leaving the plan's reader for
   any screen that is not one of the day's readings, and a reload (it comes back paused). The app going to the
   background ends nothing: nothing is read while hidden, and it comes back on the same reading, strip and all. */
describe('what ends a sitting, with the switch off', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).ReadingPlanStore = ReadingPlanStore;
    _resetPlanSessionForTests();
  });
  afterEach(() => { _resetPlanSessionForTests(); delete (/** @type {any} */ (globalThis)).ReadingPlanStore; vi.useRealTimers(); });

  // Day 1 is Genesis 1 and 2; day 2 is Genesis 3 and 4.
  const begin = () => {
    const off = { ...newRun({ plan: 'x', tracks: [{ kind: 'bible', by: 'count', items: ['genesis:1', 'genesis:2', 'genesis:3', 'genesis:4'].map((k) => ({ k, w: 600 })) }],
      pace: { mode: 'days', n: 2 } }, new Date()), countAnywhere: false };
    ReadingPlanStore.put(off);
    beginPlanSession({ runId: off.id, day: 0, name: 'X' });
    notePlanSessionPlace('genesis', 1);
    return off;
  };
  const offers = () => { const seen = []; const stop = ReadingPlanStore.onOffer((o) => seen.push(o)); return { seen, stop }; };

  it('paused, then the same chapter read elsewhere: the offer shows, nothing is ticked until Count it', () => {
    const off = begin();
    notePlanSessionPlace(null);                       // left by a link, search or a tab
    vi.runAllTimers();
    expect(planSession()).toBeNull();
    notePlanSessionPlace('genesis', 1);               // the same chapter, opened from the Bible
    expect(planSession()).toBeNull();                 // stays outside the plan
    const { seen, stop } = offers();
    expect(ReadingPlanStore.noteRead('genesis', 1)).toBe(false);
    stop();
    expect(seen).toEqual([{ bid: 'genesis', cid: 1, runIds: [off.id], at: expect.any(Number) }]);
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({});
    ReadingPlanStore.countRead(seen[0].runIds, 'genesis', 1);
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:1']);
  });

  it("leaving the plan's reader pauses it: a screen that is not a reader, another chapter, the next day's reading", () => {
    for (const place of [[null], ['exodus', 1], ['genesis', 3]]) {
      _resetPlanSessionForTests();
      const off = begin();
      notePlanSessionPlace(.../** @type {[any, any?]} */ (place));
      vi.runAllTimers();
      expect(planSession()).toBeNull();
      expect(ReadingPlanStore.noteRead('genesis', 2)).toBe(false);
      expect(ReadingPlanStore.get(off.id).ticks).toEqual({});
    }
  });

  it('a reload brings it back paused: a read of the day from Home counts nothing; reopening on its reading is back inside', () => {
    const off = begin();
    _resetPlanSessionForTests({ keepStorage: true });  // the app starts again over what was saved
    notePlanSessionPlace(null);                       // its first screen is Home
    notePlanSessionPlace('genesis', 2);               // then the day's reading, opened from the Bible
    expect(planSession()).toBeNull();
    expect(ReadingPlanStore.noteRead('genesis', 2)).toBe(false);
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({});

    _resetPlanSessionForTests({ keepStorage: true });
    notePlanSessionPlace('genesis', 1);               // the app reopens on the sitting's reading
    expect(planSession()).not.toBeNull();
    expect(ReadingPlanStore.noteRead('genesis', 2)).toBe(true);
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:2']);
  });

  it('the app going to the background ends nothing: back in front on the same reading, it still counts', () => {
    const off = begin();
    const was = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    vi.runAllTimers();
    if (was) Object.defineProperty(document, 'visibilityState', was); else delete (/** @type {any} */ (document)).visibilityState;
    notePlanSessionPlace('genesis', 1);
    expect(planSession()).not.toBeNull();
    expect(ReadingPlanStore.noteRead('genesis', 2)).toBe(true);
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:2']);
  });
});

describe('useReadProgress with Mark as read off and a plan that counts only its own reading', () => {
  it('a read from elsewhere writes no read record and ticks nothing; inside the sitting it does both', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false, start: '2020-01-01' });
    ReadingPlanStore.put(off);
    const { result } = renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: false }));
    act(() => result.current.markRead('genesis', 1, { words: 600, activeMs: 120000 }));
    expect(result.current.readItems['v1:genesis:1']).toBeUndefined();
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({});
    ReadingPlanStore.setSitting({ runId: off.id, keys: ['genesis:1', 'genesis:2'] });
    act(() => result.current.markRead('genesis', 2, { words: 600, activeMs: 120000 }));
    expect(result.current.readItems['v1:genesis:2']).toBe(1);
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:2']);
  });
});
