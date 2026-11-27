/* audit-pipeline r7 (hub 11-26, refute plan-own): defects found in the hostile read of "Count reading from
   anywhere". Each test was red on plan-own 4fe4afac1. */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReadingPlanStore } from './reading-plan-store.js';
import { newRun } from '../data/plan-engine.js';
import { _resetPlanSessionForTests } from '../utils/plan-session.js';
import { useReadProgress } from '../hooks/useMarkAsRead.js';
import { _resetToasts } from '../utils/toast.js';

const at = (s, h = 9, mi = 0, se = 0) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h, mi, se); };
const mk = (items, extra = {}) => ({ ...newRun({ plan: 'x', tracks: [{ kind: 'bible', by: 'count', items: items.map((k) => ({ k, w: 600 })) }],
  pace: { mode: 'days', n: items.length } }, at('2026-10-22')), ...extra });

beforeEach(() => {
  localStorage.clear();
  _resetToasts();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  ReadingPlanStore.setSitting(null);
  ReadingPlanStore.setListening(null);
  /** @type {any} */ (globalThis).ReadingPlanStore = ReadingPlanStore;
  _resetPlanSessionForTests();
});
afterEach(() => {
  vi.useRealTimers();
  ReadingPlanStore.setListening(null);
  _resetToasts();
  delete (/** @type {any} */ (globalThis)).ReadingPlanStore;
});

describe("the plan's Listen counts listens, not every read of its portion that day", () => {
  it('Listen tapped (then stopped): a READ of a portion item outside the plan is elsewhere and is offered', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false });
    ReadingPlanStore.put(off);
    ReadingPlanStore.setListening({ runId: off.id, keys: ['genesis:1', 'genesis:2'] });
    const seen = [];
    const stop = ReadingPlanStore.onOffer((o) => seen.push(o));
    expect(ReadingPlanStore.noteRead('genesis', 2)).toBe(false);      // the read detector, from the Bible tab
    stop();
    expect(ReadingPlanStore.get(off.id).ticks).toEqual({});
    expect(seen.map((o) => o.cid)).toEqual([2]);
  });

  it('a full listen of a portion item (the player reports it) still ticks the OFF run', () => {
    const off = mk(['genesis:1', 'genesis:2'], { countAnywhere: false });
    ReadingPlanStore.put(off);
    ReadingPlanStore.setListening({ runId: off.id, keys: ['genesis:1', 'genesis:2'] });
    renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: false }));
    act(() => { /** @type {any} */ (window).__votAudioListened('bible-kjv', 'genesis', 1); });
    expect(Object.keys(ReadingPlanStore.get(off.id).ticks)).toEqual(['genesis:1']);
  });
});
