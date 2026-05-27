/* Q5.8 — useHistory tests (gated mutator + day-prune).
   ──────────────────────────────────────────────────────
   useHistory is the reading-history state container. Two silent-failure
   modes to guard:

     A) The gate. addToHistory consults enabledRef.current (mirrored
        from historyEnabled prop). If the ref isn't synced when the
        user disables history, OLD entries get prepended after the
        user thought they'd stopped recording. Conversely, if the gate
        is wrong-direction (rejects when enabled), the entire feature
        silently produces an empty trail.

     B) pruneHistoryDay's same-day dedup. The function must dedup ONLY
        within the requested calendar day; over-aggressive dedup (across
        days) silently loses legitimate visit history. Under-aggressive
        leaves the duplicates the user asked to clean. Both fail
        silently — the user just sees "weird gaps" later.

   Tests use real localStorage via jsdom + renderHook (no mocks per
   [[dont-over-mock]]).
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from './use-history.js';
import { HistoryStore } from '../stores/history-store.js';

beforeEach(() => {
  localStorage.clear();
  // W2.3b: HistoryStore (IDB-backed) is the source of truth. Tests
  // bypass async hydration via forceLoaded — without this, IDB-mode
  // pending state would return a fresh [] from copyDefault on every
  // useSyncExternalStore getSnapshot call, triggering an infinite
  // re-render loop.
  HistoryStore._resetForTests({ forceLoaded: true });
});

describe('useHistory — initial state', () => {
  it('initializes to [] when store is empty', () => {
    const { result } = renderHook(() => useHistory(true));
    expect(result.current.readHistory).toEqual([]);
  });

  it('hydrates from HistoryStore on mount', () => {
    const seed = [
      { type: 'chapter', bookId: 'matthew', chapterNum: 5, key: 'ch:matthew:5', ts: 1700000000000 },
      { type: 'letter', letterId: 'the-wide-path', key: 'lt:the-wide-path', ts: 1700000001000 },
    ];
    HistoryStore._cache = /** @type {any} */ (seed);

    const { result } = renderHook(() => useHistory(true));

    expect(result.current.readHistory).toEqual(seed);
  });

  it('returns [] when the store falls back to LS with malformed JSON', () => {
    // Wipe any prior cache and seed bad LS — the next _load() will
    // fall through to the LS read path (state is 'loaded' so it goes
    // straight to JSON.parse, which throws on the malformed payload
    // and seeds _cache to []).
    HistoryStore._cache = null;
    localStorage.setItem('vot-history', '{not valid json');

    const { result } = renderHook(() => useHistory(true));

    expect(result.current.readHistory).toEqual([]);
  });
});

describe('useHistory — addToHistory (the gate)', () => {
  it('records when historyEnabled = true', () => {
    const { result } = renderHook(() => useHistory(true));

    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    });

    expect(result.current.readHistory.length).toBe(1);
    expect(result.current.readHistory[0].bookId).toBe('matthew');
    expect(result.current.readHistory[0].chapterNum).toBe(5);
  });

  it('does NOT record when historyEnabled = false (gate guard)', () => {
    const { result } = renderHook(() => useHistory(false));

    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    });

    expect(result.current.readHistory).toEqual([]);
  });

  it('respects the gate AFTER it flips mid-session (ref-mirror invariant)', () => {
    // The whole point of mirroring historyEnabled via useRefMirror is
    // that the addToHistory closure sees the LATEST value. A test that
    // toggles the prop and assert the gate switches direction validates
    // the ref-mirror behavior.
    const { result, rerender } = renderHook(
      ({ enabled }) => useHistory(enabled),
      { initialProps: { enabled: true } }
    );

    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    });
    expect(result.current.readHistory.length).toBe(1);

    // Disable.
    rerender({ enabled: false });

    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 6 });
    });
    expect(result.current.readHistory.length).toBe(1);  // not added — gate caught it

    // Re-enable.
    rerender({ enabled: true });

    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 7 });
    });
    expect(result.current.readHistory.length).toBe(2);  // added
    expect(result.current.readHistory[0].chapterNum).toBe(7);  // newest first
  });

  it('builds the right key shape per entry type', () => {
    const { result } = renderHook(() => useHistory(true));

    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
      result.current.addToHistory({ type: 'letter', letterId: 'the-wide-path' });
      result.current.addToHistory({ type: 'study-chapter', bookId: 'matthew', chapterNum: 22 });
    });

    // chapter / study-chapter both use the 'ch:' shape.
    const byType = Object.fromEntries(result.current.readHistory.map(e => [e.type, e.key]));
    expect(byType.chapter).toBe('ch:matthew:5');
    expect(byType.letter).toBe('lt:the-wide-path');
    expect(byType['study-chapter']).toBe('ch:matthew:22');
  });

  it('does NOT dedup — every visit is recorded (per spec)', () => {
    const { result } = renderHook(() => useHistory(true));

    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    });

    // 3 visits → 3 entries. User prunes per-day if they want fewer.
    expect(result.current.readHistory.length).toBe(3);
  });

  it('caps the history at 2000 entries (silent eviction at the tail)', () => {
    // The cap is a documented behavior — tail entries get evicted
    // silently when adding past 2000. This test verifies the cap kicks
    // in: length stays at 2000, the new entry is at index 0, and the
    // last surviving entry is the original seed[1998] (since the prepend
    // pushed seed[1999] off the tail).
    const seed = Array.from({ length: 2000 }, (_, i) => ({
      type: 'chapter',
      bookId: 'matthew',
      chapterNum: 1,
      key: 'ch:matthew:1',
      ts: i,  // ts: 0..1999; seed[0] is OLDEST by ts (but at front of array)
    }));
    HistoryStore._cache = /** @type {any} */ (seed);

    const { result } = renderHook(() => useHistory(true));
    expect(result.current.readHistory.length).toBe(2000);

    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 99 });
    });

    // Cap held + newest entry at front.
    expect(result.current.readHistory.length).toBe(2000);
    expect(result.current.readHistory[0].chapterNum).toBe(99);
    // The prepend + slice(0, 2000) drops the LAST seeded entry from
    // the original tail. Last surviving = seed[1998] (ts: 1998).
    expect(result.current.readHistory[1999].ts).toBe(1998);
  });

  it('persists each add to HistoryStore', () => {
    const { result } = renderHook(() => useHistory(true));

    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    });

    // W2.3b: persistence is now IDB-backed via HistoryStore; the
    // assertion shifts from "LS has the entry" to "store has it."
    const persisted = HistoryStore.list();
    expect(persisted.length).toBe(1);
    expect(persisted[0].bookId).toBe('matthew');
  });
});

describe('useHistory — clearHistory', () => {
  it('wipes the in-memory state', () => {
    const { result } = renderHook(() => useHistory(true));
    act(() => {
      result.current.addToHistory({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    });
    expect(result.current.readHistory.length).toBe(1);

    act(() => { result.current.clearHistory(); });

    expect(result.current.readHistory).toEqual([]);
  });

  it('wipes the HistoryStore too', () => {
    const seed = [{ type: 'chapter', bookId: 'matthew', chapterNum: 5, key: 'ch:matthew:5', ts: 1 }];
    HistoryStore._cache = /** @type {any} */ (seed);
    const { result } = renderHook(() => useHistory(true));

    act(() => { result.current.clearHistory(); });

    expect(HistoryStore.list()).toEqual([]);
  });
});

describe('useHistory — pruneHistoryDay (same-day dedup)', () => {
  // Helper: ts for a given (y, m, d, hour). Default hour is 0 so a
  // boundary call like `ts(2026, 0, 15)` returns Jan 15 00:00 — matching
  // what production's `new Date(year, month, day)` (the dayStart in
  // pruneHistoryDay) computes. A non-zero default would silently cross
  // day boundaries in filter assertions.
  const ts = (y, m, d, h = 0) => new Date(y, m, d, h).getTime();

  it('dedupes by key within ONE calendar day (keeps newest of each key)', () => {
    // 3 visits to matthew:5 on the same day; pruning should keep just
    // the most-recent (which is the first occurrence in the newest-first
    // list).
    const seed = [
      { type: 'chapter', bookId: 'matthew', chapterNum: 5, key: 'ch:matthew:5', ts: ts(2026, 0, 15, 14) },
      { type: 'chapter', bookId: 'matthew', chapterNum: 5, key: 'ch:matthew:5', ts: ts(2026, 0, 15, 10) },
      { type: 'chapter', bookId: 'matthew', chapterNum: 5, key: 'ch:matthew:5', ts: ts(2026, 0, 15, 8) },
    ];
    HistoryStore._cache = /** @type {any} */ (seed);
    const { result } = renderHook(() => useHistory(true));

    act(() => { result.current.pruneHistoryDay(2026, 0, 15); });

    // Just the newest survivor.
    expect(result.current.readHistory.length).toBe(1);
    expect(result.current.readHistory[0].ts).toBe(ts(2026, 0, 15, 14));
  });

  it('does NOT dedup across days (different key visits on different days survive)', () => {
    // Three days, three duplicates each. Prune ONE day; only that day's
    // dups collapse — others untouched.
    const seed = [
      // Jan 15 — 2 visits to ch:matthew:5
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 15, 10) },
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 15, 8) },
      // Jan 16 — 2 visits to ch:matthew:5
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 16, 10) },
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 16, 8) },
    ];
    // Newest-first ordering.
    seed.sort((a, b) => b.ts - a.ts);
    HistoryStore._cache = /** @type {any} */ (seed);
    const { result } = renderHook(() => useHistory(true));

    // Prune only Jan 15.
    act(() => { result.current.pruneHistoryDay(2026, 0, 15); });

    // Jan 15: dedup'd to 1. Jan 16: both still there.
    const jan15 = result.current.readHistory.filter(e => e.ts >= ts(2026, 0, 15) && e.ts < ts(2026, 0, 16));
    const jan16 = result.current.readHistory.filter(e => e.ts >= ts(2026, 0, 16) && e.ts < ts(2026, 0, 17));
    expect(jan15.length).toBe(1);
    expect(jan16.length).toBe(2);
  });

  it('preserves DIFFERENT keys on the same day (multi-key independence)', () => {
    // The dedup must be by KEY within a day. Two visits to chapter A
    // and two to chapter B on the same day → 2 survivors (one per key).
    const seed = [
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 15, 10) },
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 15, 9) },
      { type: 'chapter', key: 'ch:matthew:6', ts: ts(2026, 0, 15, 8) },
      { type: 'chapter', key: 'ch:matthew:6', ts: ts(2026, 0, 15, 7) },
    ];
    seed.sort((a, b) => b.ts - a.ts);
    HistoryStore._cache = /** @type {any} */ (seed);
    const { result } = renderHook(() => useHistory(true));

    act(() => { result.current.pruneHistoryDay(2026, 0, 15); });

    // 2 survivors — one per distinct key.
    expect(result.current.readHistory.length).toBe(2);
    const keys = result.current.readHistory.map(e => e.key).sort();
    expect(keys).toEqual(['ch:matthew:5', 'ch:matthew:6']);
  });

  it('preserves entries OUTSIDE the pruned day (other-day entries pass through)', () => {
    // Entry on Jan 14 must survive a prune of Jan 15.
    const seed = [
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 15, 12) },
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 15, 11) },
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 14, 12) },
    ];
    seed.sort((a, b) => b.ts - a.ts);
    HistoryStore._cache = /** @type {any} */ (seed);
    const { result } = renderHook(() => useHistory(true));

    act(() => { result.current.pruneHistoryDay(2026, 0, 15); });

    // Jan 15 dedup'd to 1; Jan 14 entry preserved → 2 total.
    expect(result.current.readHistory.length).toBe(2);
    expect(result.current.readHistory.find(e => e.ts === ts(2026, 0, 14, 12))).toBeDefined();
  });

  it('is a no-op when the day has no entries', () => {
    const seed = [
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 14, 10) },
    ];
    HistoryStore._cache = /** @type {any} */ (seed);
    const { result } = renderHook(() => useHistory(true));

    // Prune a different day.
    act(() => { result.current.pruneHistoryDay(2026, 0, 15); });

    expect(result.current.readHistory).toEqual(seed);
  });

  it('persists the prune to HistoryStore', () => {
    const seed = [
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 15, 10) },
      { type: 'chapter', key: 'ch:matthew:5', ts: ts(2026, 0, 15, 8) },
    ];
    HistoryStore._cache = /** @type {any} */ (seed);
    const { result } = renderHook(() => useHistory(true));

    act(() => { result.current.pruneHistoryDay(2026, 0, 15); });

    expect(HistoryStore.list().length).toBe(1);
  });
});
