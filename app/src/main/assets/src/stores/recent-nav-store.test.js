/* RecentNavStore — dedup, cap, ordering, and replaceAll tests.
   ──────────────────────────────────────────────────────────────
   RecentNavStore persists up to 30 entries and surfaces the last 20
   via list(). Dedup uses a 5-tuple JSON.stringify signature:
   (kind, bookId, chapter, letterId, entryId). Re-adding the same
   destination bumps it to the head instead of creating a duplicate.
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecentNavStore } from './recent-nav-store.js';

beforeEach(() => {
  localStorage.clear();
  RecentNavStore._resetForTests({ forceLoaded: true });
});

/** Build a nav item with sensible defaults. */
function mkItem(kind, overrides = {}) {
  return { kind, ...overrides };
}

/* ═══════════════════════════════════════════════════════════════════
   add() — prepend, dedup, cap, stamping
   ═══════════════════════════════════════════════════════════════════ */

describe('RecentNavStore — add()', () => {
  it('prepends item with ts=Date.now()', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'genesis', chapter: 1 }));
    const list = RecentNavStore.list();
    expect(list.length).toBe(1);
    expect(list[0].kind).toBe('bible-ch');
    expect(list[0].ts).toBe(now);
    vi.restoreAllMocks();
  });

  it('prepends newest at index 0', () => {
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'genesis', chapter: 1 }));
    RecentNavStore.add(mkItem('letter', { letterId: 'the-wide-path' }));
    const list = RecentNavStore.list();
    expect(list[0].kind).toBe('letter');
    expect(list[1].kind).toBe('bible-ch');
  });

  it('dedups on the 5-tuple (kind, bookId, chapter, letterId, entryId)', () => {
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'genesis', chapter: 1 }));
    RecentNavStore.add(mkItem('letter', { letterId: 'the-wide-path' }));
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'genesis', chapter: 1 }));
    const list = RecentNavStore.list();
    expect(list.length).toBe(2);
    expect(list[0].kind).toBe('bible-ch');
    expect(list[1].kind).toBe('letter');
  });

  it('does not dedup when same kind but different bookId', () => {
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'genesis', chapter: 1 }));
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'exodus', chapter: 1 }));
    expect(RecentNavStore.list().length).toBe(2);
  });

  it('does not dedup when same kind but different chapter', () => {
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'genesis', chapter: 1 }));
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'genesis', chapter: 2 }));
    expect(RecentNavStore.list().length).toBe(2);
  });

  it('handles undefined fields in the dedup tuple', () => {
    RecentNavStore.add(mkItem('letter', { letterId: 'abc' }));
    RecentNavStore.add(mkItem('letter', { letterId: 'abc' }));
    expect(RecentNavStore.list().length).toBe(1);
  });

  it('caps at 30 entries', () => {
    for (let i = 0; i < 35; i++) {
      RecentNavStore.add(mkItem('bible-ch', { bookId: 'b' + i, chapter: i }));
    }
    // Internal cache is capped at 30.
    expect(RecentNavStore._load().length).toBe(30);
    // list() returns top 20.
    expect(RecentNavStore.list().length).toBe(20);
  });

  it('no-op when item is null', () => {
    const v0 = RecentNavStore.getVersion();
    RecentNavStore.add(null);
    expect(RecentNavStore.list().length).toBe(0);
    expect(RecentNavStore.getVersion()).toBe(v0);
  });

  it('no-op when item is undefined', () => {
    RecentNavStore.add(undefined);
    expect(RecentNavStore.list().length).toBe(0);
  });

  it('no-op when item has no kind', () => {
    // @ts-expect-error — testing defensive missing-kind handling
    RecentNavStore.add({ bookId: 'genesis', chapter: 1 });
    expect(RecentNavStore.list().length).toBe(0);
  });

  it('bumps version on successful add', () => {
    const v0 = RecentNavStore.getVersion();
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'gen', chapter: 1 }));
    expect(RecentNavStore.getVersion()).toBe(v0 + 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   list() — top-20 read contract
   ═══════════════════════════════════════════════════════════════════ */

describe('RecentNavStore — list()', () => {
  it('returns empty array on empty store', () => {
    expect(RecentNavStore.list()).toEqual([]);
  });

  it('returns at most 20 items', () => {
    for (let i = 0; i < 25; i++) {
      RecentNavStore.add(mkItem('bible-ch', { bookId: 'b' + i, chapter: i }));
    }
    expect(RecentNavStore.list().length).toBe(20);
  });

  it('returns newest first', () => {
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'a', chapter: 1 }));
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'b', chapter: 1 }));
    const list = RecentNavStore.list();
    expect(list[0].bookId).toBe('b');
    expect(list[1].bookId).toBe('a');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   replaceAll() — full replacement (W2.6 import path)
   ═══════════════════════════════════════════════════════════════════ */

describe('RecentNavStore — replaceAll()', () => {
  it('replaces the entire list', () => {
    RecentNavStore.add(mkItem('bible-ch', { bookId: 'gen', chapter: 1 }));
    RecentNavStore.replaceAll([
      mkItem('letter', { letterId: 'abc', ts: 100 }),
      mkItem('letter', { letterId: 'def', ts: 200 }),
    ]);
    const list = RecentNavStore.list();
    expect(list.length).toBe(2);
    expect(list[0].letterId).toBe('abc');
  });

  it('caps at 30', () => {
    const items = Array.from({ length: 40 }, (_, i) => mkItem('bible-ch', { bookId: 'b' + i, chapter: i }));
    RecentNavStore.replaceAll(items);
    expect(RecentNavStore._load().length).toBe(30);
  });

  it('replaceAll(null) becomes empty', () => {
    RecentNavStore.add(mkItem('letter', { letterId: 'x' }));
    RecentNavStore.replaceAll(null);
    expect(RecentNavStore.list()).toEqual([]);
  });

  it('replaceAll(undefined) becomes empty', () => {
    RecentNavStore.replaceAll(undefined);
    expect(RecentNavStore.list()).toEqual([]);
  });

  it('replaceAll(non-array) becomes empty', () => {
    // @ts-expect-error — testing defensive non-array handling
    RecentNavStore.replaceAll('not-an-array');
    expect(RecentNavStore.list()).toEqual([]);
  });

  it('bumps version', () => {
    const v0 = RecentNavStore.getVersion();
    RecentNavStore.replaceAll([]);
    expect(RecentNavStore.getVersion()).toBe(v0 + 1);
  });
});
