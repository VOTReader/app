/* FIXB (2026-11-12): the review fixes in reading plans, each with a main-shaped stored run where the store is read. */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { dayNum, dateOf, dayItems, newRun, runStatus, tickItem, finishUnseen, markDay } from './plan-engine.js';
import { BIBLE_BOOKS } from './reading-plans.js';
import { ReadingPlanStore } from '../stores/reading-plan-store.js';
import { useTodayRows } from '../ui/components/TodayCard.jsx';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
const bibleItems = () => BIBLE_BOOKS.flatMap(([bid, , n]) => Array.from({ length: Number(n) }, (_, i) => ({ k: bid + ':' + (i + 1), w: 600 })));
const plus = (s, n) => dateOf(/** @type {number} */ (dayNum(s)) + n);
const ALL_DAYS = [true, true, true, true, true, true, true];

afterEach(cleanup);

describe('1. a plan finished before the update stays put away (TodayCard.jsx:47)', () => {
  // A finished run exactly as main stored it: no `seen` field (main had none).
  const MAIN_FINISHED = {
    id: 'run_psalms_main', plan: 'psalms', created: 1, updated: 2, start: '2026-09-01', status: 'finished', finished: '2026-09-30',
    tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'psalms:1', w: 200 }, { k: 'psalms:2', w: 200 }] }], share: 'side',
    weekdays: ALL_DAYS, segs: [{ day0: 0, from: [0], to: [2], days: 2 }], target: '2026-09-02',
    ticks: { 'psalms:1': '2026-09-01', 'psalms:2': '2026-09-30' }, pauses: [], pace: { mode: 'days', n: 2 },
  };
  beforeEach(() => { localStorage.clear(); ReadingPlanStore._resetForTests({ forceLoaded: true }); });

  it('a main-shaped finished run counts as seen; a finish made now waits to be seen', () => {
    expect(finishUnseen(MAIN_FINISHED)).toBe(false);
    let run = newRun({ plan: 'psalms', tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'psalms:1', w: 200 }, { k: 'psalms:2', w: 200 }] }], pace: { mode: 'days', n: 2 } }, at('2026-11-10'));
    run = tickItem(run, 'psalms:1', '2026-11-10', 1);
    expect(finishUnseen(run)).toBe(false);
    run = tickItem(run, 'psalms:2', '2026-11-11', 2);
    expect(run.status).toBe('finished');
    expect(finishUnseen(run)).toBe(true);
    expect(finishUnseen({ ...run, seen: true })).toBe(false);
  });

  it('the Read tab shows "You finished" for the new finish only, and the old run is stored unchanged', () => {
    const json = JSON.stringify(MAIN_FINISHED);
    let fresh = newRun({ plan: 'gospels', tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'john:1', w: 200 }] }], pace: { mode: 'days', n: 1 } }, at('2026-11-10'));
    fresh = markDay(fresh, 0, true, at('2026-11-10'));
    ReadingPlanStore.replaceAll(JSON.parse(JSON.stringify([MAIN_FINISHED, fresh])));
    const g = /** @type {any} */ (globalThis);
    const had = g.ReadingPlanStore;
    g.ReadingPlanStore = ReadingPlanStore;
    try {
      const { result } = renderHook(() => useTodayRows(undefined, () => false));
      expect(result.current.filter((r) => r.finished).map((r) => r.id)).toEqual([fresh.id]);
    } finally { g.ReadingPlanStore = had; }
    expect(JSON.stringify(ReadingPlanStore.get(MAIN_FINISHED.id))).toBe(json);
  });
});
