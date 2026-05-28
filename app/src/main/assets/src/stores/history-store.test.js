/* W2 Tier 2 — HistoryStore add/clear/pruneDay/setAll regression tests.
   ─────────────────────────────────────────────────────────────────────
   HistoryStore owns the reading-history array migrated out of the
   pre-W2 use-history.js hook (now a thin subscriber). The store's
   contract:
     - add: prepend stamped entry, cap at 2000 (oldest dropped).
     - clear: empty the array.
     - pruneDay(year, month, day): dedupe by key within a calendar
       day, preserve entries on other days.
     - setAll: full replace, enforce 2000 cap, gracefully handle
       null/non-array (used by W2.6 import path).

   Silent-failure modes this suite guards:
     - Cap overflow: a future "cap=2001" bug would never fire the
       sliced read until production data hits the boundary.
     - Month indexing: pruneDay uses `new Date(year, month, day)`
       (month is 0-indexed JS-Date convention). Wrong indexing would
       prune the WRONG calendar day silently — no error, just missing
       dedup.
     - Day-boundary leak: pruning Jan 15 must not touch Jan 14 / 16
       entries, even if the same key is duplicated across days.
     - setAll(null): if not array-guarded, the next list() throws.
     - Stamped key/ts: an entry pushed via add() must get the
       correct dedup key per _historyKey so pruneDay can match it.

   All cases use `_resetForTests({ forceLoaded: true })` to bypass
   the IDB hydration state machine; the store runs LS-mode-byte-
   identical at 'loaded' state.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryStore } from './history-store.js';

beforeEach(() => {
  localStorage.clear();
  HistoryStore._resetForTests({ forceLoaded: true });
});

/** Build a timestamp for (year, monthIdx, day, hour). Default hour=0
 *  so a boundary call like `_ts(2026, 0, 15)` returns Jan 15 00:00 —
 *  matching what pruneDay's `new Date(year, month, day)` (dayStart)
 *  computes. Mirrors the helper convention in use-history.test.js. */
function _ts(y, m, d, h = 0) {
  return new Date(y, m, d, h).getTime();
}

describe('HistoryStore — add()', () => {
  it('appends a single entry with stamped key + ts (chapter type)', () => {
    const before = Date.now();
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    const after = Date.now();

    const list = HistoryStore.list();
    expect(list.length).toBe(1);
    expect(list[0].type).toBe('chapter');
    expect(list[0].bookId).toBe('matthew');
    expect(list[0].chapterNum).toBe(5);
    expect(list[0].key).toBe('ch:matthew:5');
    expect(list[0].ts).toBeGreaterThanOrEqual(before);
    expect(list[0].ts).toBeLessThanOrEqual(after);
  });

  it('appends with letter-style dedup key for letter entries', () => {
    HistoryStore.add({ type: 'letter', letterId: 'the-wide-path' });
    expect(HistoryStore.list()[0].key).toBe('lt:the-wide-path');
  });

  it('prepends newest first (LIFO list order)', () => {
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    HistoryStore.add({ type: 'chapter', bookId: 'mark', chapterNum: 1 });
    HistoryStore.add({ type: 'letter', letterId: 'the-wide-path' });

    const list = HistoryStore.list();
    expect(list.length).toBe(3);
    expect(list[0].key).toBe('lt:the-wide-path');     // most recent
    expect(list[1].key).toBe('ch:mark:1');
    expect(list[2].key).toBe('ch:matthew:5');         // oldest
  });

  it('caps at 2000 entries (oldest dropped on overflow)', () => {
    // The list is newest-first ordered (production add() prepends).
    // So position 0 = newest, position 1999 = oldest. The slice(0,2000)
    // after a 2001-element prepend drops POSITION 2000 — which means
    // the previously-oldest entry (position 1999, i.e. the i=0 chapter
    // with the lowest ts) is the one that disappears.
    /** @type {any[]} */
    const seed = [];
    for (let i = 0; i < 2000; i++) {
      // i=0 is the NEWEST (position 0, highest ts); i=1999 is OLDEST.
      const idxFromNewest = i;          // 0=newest, 1999=oldest
      const seedNum = 1999 - idxFromNewest;  // newest entry has highest seedNum
      seed.push({
        type: 'chapter', bookId: 'matthew', chapterNum: seedNum,
        key: 'ch:matthew:' + seedNum,
        ts: 1_700_000_000_000 + seedNum,
      });
    }
    HistoryStore._cache = seed;
    HistoryStore._save();
    expect(HistoryStore.list().length).toBe(2000);
    // Verify the seed orientation: index 0 has the highest ts.
    expect(HistoryStore.list()[0].key).toBe('ch:matthew:1999');
    expect(HistoryStore.list()[1999].key).toBe('ch:matthew:0');

    // The 2001st add must drop the oldest (ch:matthew:0).
    HistoryStore.add({ type: 'chapter', bookId: 'mark', chapterNum: 1 });

    const list = HistoryStore.list();
    expect(list.length).toBe(2000);                  // still capped
    expect(list[0].key).toBe('ch:mark:1');           // new entry at top
    expect(list.some(e => e.key === 'ch:matthew:0')).toBe(false);    // oldest dropped
    expect(list.some(e => e.key === 'ch:matthew:1999')).toBe(true);  // newest seed preserved
  });

  it('is a no-op when entry is null', () => {
    HistoryStore.add(/** @type {any} */ (null));
    expect(HistoryStore.list().length).toBe(0);
  });

  it('is a no-op when entry is undefined', () => {
    HistoryStore.add(/** @type {any} */ (undefined));
    expect(HistoryStore.list().length).toBe(0);
  });

  it('bumps the version on every successful add', () => {
    const v0 = HistoryStore.getVersion();
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    expect(HistoryStore.getVersion()).toBeGreaterThan(v0);
  });
});

describe('HistoryStore — clear()', () => {
  it('empties the list', () => {
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    HistoryStore.add({ type: 'letter', letterId: 'the-wide-path' });
    expect(HistoryStore.list().length).toBe(2);

    HistoryStore.clear();
    expect(HistoryStore.list()).toEqual([]);
  });

  it('is idempotent on an already-empty list', () => {
    expect(HistoryStore.list().length).toBe(0);
    HistoryStore.clear();
    HistoryStore.clear();
    expect(HistoryStore.list()).toEqual([]);
  });

  it('bumps the version', () => {
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    const v0 = HistoryStore.getVersion();
    HistoryStore.clear();
    expect(HistoryStore.getVersion()).toBeGreaterThan(v0);
  });
});

describe('HistoryStore — pruneDay() — within-day dedup', () => {
  it('dedupes duplicate keys within a calendar day (keeps the FIRST encounter)', () => {
    // 3 visits to the same chapter on Jan 15. After prune: keep just one.
    // (Production order is newest-first; the FIRST in iteration is the
    // most-recent visit.)
    /** @type {any[]} */
    const seed = [
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 14) },  // newest
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 10) },
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 8) },
    ];
    HistoryStore._cache = seed;
    HistoryStore._save();

    HistoryStore.pruneDay(2026, 0, 15);

    const list = HistoryStore.list();
    expect(list.length).toBe(1);
    expect(list[0].ts).toBe(_ts(2026, 0, 15, 14));   // newest preserved
  });

  it('preserves DIFFERENT keys on the same day', () => {
    /** @type {any[]} */
    const seed = [
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 10) },
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 9) },
      { type: 'chapter', key: 'ch:matthew:6', ts: _ts(2026, 0, 15, 8) },
      { type: 'chapter', key: 'ch:matthew:6', ts: _ts(2026, 0, 15, 7) },
    ];
    HistoryStore._cache = seed;
    HistoryStore._save();

    HistoryStore.pruneDay(2026, 0, 15);

    const list = HistoryStore.list();
    expect(list.length).toBe(2);
    const keys = list.map(e => e.key).sort();
    expect(keys).toEqual(['ch:matthew:5', 'ch:matthew:6']);
  });

  it('preserves entries OUTSIDE the pruned day (multi-day independence)', () => {
    // Same key duplicated across two days. Pruning Jan 15 leaves Jan 14
    // entries fully alone — even if they're the same key.
    /** @type {any[]} */
    const seed = [
      // Jan 15 dups (will collapse to 1)
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 12) },
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 11) },
      // Jan 14 visit (must survive intact)
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 14, 12) },
      // Jan 16 visit (must also survive)
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 16, 9) },
    ];
    HistoryStore._cache = seed;
    HistoryStore._save();

    HistoryStore.pruneDay(2026, 0, 15);

    const list = HistoryStore.list();
    // Jan 15 → 1; Jan 14 → 1; Jan 16 → 1 → total 3.
    expect(list.length).toBe(3);
    const tsList = list.map(e => e.ts).sort();
    expect(tsList).toEqual([
      _ts(2026, 0, 14, 12),
      _ts(2026, 0, 15, 12),
      _ts(2026, 0, 16, 9),
    ]);
  });

  it('is a no-op for a day with no entries', () => {
    /** @type {any[]} */
    const seed = [
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 14, 10) },
    ];
    HistoryStore._cache = seed;
    HistoryStore._save();

    HistoryStore.pruneDay(2026, 0, 15);  // no entries on Jan 15

    expect(HistoryStore.list().length).toBe(1);
    expect(HistoryStore.list()[0].ts).toBe(_ts(2026, 0, 14, 10));
  });

  it('is a no-op for a totally-empty history', () => {
    HistoryStore.pruneDay(2026, 0, 15);
    expect(HistoryStore.list()).toEqual([]);
  });

  it('treats entries without a ts as ts=0 (epoch — outside any modern day)', () => {
    // Defensive guard from the source: `const ts = e.ts || 0`. An
    // entry without ts is treated as ts=0 (Jan 1 1970), so a prune
    // of (2026, 0, 15) does NOT touch it.
    /** @type {any[]} */
    const seed = [
      { type: 'chapter', key: 'ch:matthew:5' },   // no ts
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 10) },
    ];
    HistoryStore._cache = seed;
    HistoryStore._save();

    HistoryStore.pruneDay(2026, 0, 15);

    // The ts-less entry survives (not in the Jan 15 window). The Jan
    // 15 entry has no duplicates → also survives.
    expect(HistoryStore.list().length).toBe(2);
  });

  it('bumps the version even when no dedup happened', () => {
    /** @type {any[]} */
    const seed = [
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 10) },
    ];
    HistoryStore._cache = seed;
    HistoryStore._save();

    const v0 = HistoryStore.getVersion();
    HistoryStore.pruneDay(2026, 0, 15);
    expect(HistoryStore.getVersion()).toBeGreaterThan(v0);
  });
});

describe('HistoryStore — pruneDay() — month indexing (JS Date convention)', () => {
  // PIN the month-indexing convention. The source uses
  //   const dayStart = new Date(year, month, day).getTime();
  // which is JS-Date convention: month is 0-indexed (Jan=0, Dec=11).
  // The use-history.js hook callers (and the existing
  // use-history.test.js) pass `pruneHistoryDay(2026, 0, 15)` for Jan 15.
  //
  // This is the audit-concern test: if anyone "fixes" the indexing to
  // be 1-based (calendar convention), the pruning windows shift by a
  // month silently. These tests fail loud.

  it('month=0 prunes January (NOT December of prior year)', () => {
    /** @type {any[]} */
    const seed = [
      // Two Jan 15 2026 entries — would be deduped by a Jan prune.
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 10) },
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 9) },
      // One Dec 15 2025 entry — would be deduped by a Dec prune.
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2025, 11, 15, 10) },
    ];
    HistoryStore._cache = seed;
    HistoryStore._save();

    // Prune (2026, 0, 15) — should target January 15, 2026.
    HistoryStore.pruneDay(2026, 0, 15);

    const list = HistoryStore.list();
    // Jan 15 dups → collapsed to 1. Dec 15 untouched. Total = 2.
    expect(list.length).toBe(2);
    const dec15 = list.find(e => e.ts === _ts(2025, 11, 15, 10));
    expect(dec15).toBeDefined();   // not pruned — different month
  });

  it('month=11 prunes December (NOT January)', () => {
    /** @type {any[]} */
    const seed = [
      // Two Jan 15 2026 entries — should be untouched by a Dec prune.
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 10) },
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2026, 0, 15, 9) },
      // Two Dec 15 2025 entries — should be deduped by a Dec prune.
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2025, 11, 15, 10) },
      { type: 'chapter', key: 'ch:matthew:5', ts: _ts(2025, 11, 15, 9) },
    ];
    HistoryStore._cache = seed;
    HistoryStore._save();

    // Prune (2025, 11, 15) — should target December 15, 2025.
    HistoryStore.pruneDay(2025, 11, 15);

    const list = HistoryStore.list();
    // Dec 15 dups → collapsed to 1. Jan 15 untouched (2 entries). Total = 3.
    expect(list.length).toBe(3);
    const jan15 = list.filter(e => e.ts === _ts(2026, 0, 15, 10) || e.ts === _ts(2026, 0, 15, 9));
    expect(jan15.length).toBe(2);   // not pruned — different month
  });
});

describe('HistoryStore — setAll()', () => {
  it('replaces the full list', () => {
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    expect(HistoryStore.list().length).toBe(1);

    /** @type {any[]} */
    const replacement = [
      { type: 'letter', letterId: 'a', key: 'lt:a', ts: 1_700_000_000_000 },
      { type: 'letter', letterId: 'b', key: 'lt:b', ts: 1_700_000_000_001 },
    ];
    HistoryStore.setAll(replacement);

    const list = HistoryStore.list();
    expect(list.length).toBe(2);
    expect(list[0].letterId).toBe('a');
    expect(list[1].letterId).toBe('b');
  });

  it('enforces 2000 cap on import (slice from the head)', () => {
    /** @type {any[]} */
    const huge = [];
    for (let i = 0; i < 2500; i++) {
      huge.push({ type: 'chapter', key: 'ch:matthew:' + i, ts: 1_700_000_000_000 + i });
    }
    HistoryStore.setAll(huge);

    const list = HistoryStore.list();
    expect(list.length).toBe(2000);
    // The first 2000 entries (indices 0..1999) survive; the tail is dropped.
    expect(list[0].key).toBe('ch:matthew:0');
    expect(list[1999].key).toBe('ch:matthew:1999');
    expect(list.some(e => e.key === 'ch:matthew:2000')).toBe(false);
  });

  it('handles null gracefully (empties the list)', () => {
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    expect(HistoryStore.list().length).toBe(1);

    HistoryStore.setAll(/** @type {any} */ (null));
    expect(HistoryStore.list()).toEqual([]);
  });

  it('handles a non-array (string, object) gracefully — empties the list', () => {
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });

    HistoryStore.setAll(/** @type {any} */ ('not an array'));
    expect(HistoryStore.list()).toEqual([]);

    HistoryStore.add({ type: 'chapter', bookId: 'mark', chapterNum: 1 });
    HistoryStore.setAll(/** @type {any} */ ({ length: 5 }));
    expect(HistoryStore.list()).toEqual([]);
  });

  it('accepts an empty array (explicit clear)', () => {
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    HistoryStore.setAll([]);
    expect(HistoryStore.list()).toEqual([]);
  });

  it('bumps the version', () => {
    const v0 = HistoryStore.getVersion();
    HistoryStore.setAll([
      { type: 'letter', letterId: 'a', key: 'lt:a', ts: 1_700_000_000_000 },
    ]);
    expect(HistoryStore.getVersion()).toBeGreaterThan(v0);
  });
});

describe('HistoryStore — list() invariants', () => {
  it('returns an array on fresh state', () => {
    const list = HistoryStore.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);
  });

  it('returns the live cache reference (mutations visible across calls)', () => {
    HistoryStore.add({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    const ref1 = HistoryStore.list();
    const ref2 = HistoryStore.list();
    expect(ref1).toBe(ref2);  // same reference (no defensive copy)
  });
});
