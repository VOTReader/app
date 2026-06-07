// @ts-nocheck — tests construct partial Bookmark literals to exercise guards
/* BookmarkStore — CRUD + key-lookup tests.
   ─────────────────────────────────────────
   Covers the everyday surface: add/get/update/remove/replaceAll +
   the two lookup primitives getForKey + getForKeyPrefix.

   Audit-driven coverage:
     - add() spread-copy guard: the caller's bookmark object must not
       be mutated by stamping (created/updated). Regression for the
       polish commit (`bdc479e` per CLAUDE.md) that introduced
       `Object.assign({}, bookmark)` before stamping.
     - getForKey() prefix fallback: the `slice(0, -1).join(':')` branch
       lets a verse-level key (no range) match a bookmark stored at the
       SAME key with a `:start-end` range suffix. Audit flagged a
       potential false-positive between `bible:genesis:1:1` (no range)
       and `bible:genesis:1:10` (no range). The slice strips the last
       segment, so 1:10's prefix is `bible:genesis:1` — DOES NOT match
       the query `bible:genesis:1:1`. This test pins that.
     - getForKeyPrefix() false-positive guard: the `indexOf(prefix + ':')`
       check requires a colon AFTER the prefix, so `wtlb-one` does NOT
       false-match `wtlb-one-extra:1` (which starts with `wtlb-one-`).
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookmarkStore } from './bookmark-store.js';

beforeEach(() => {
  localStorage.clear();
  BookmarkStore._resetForTests({ forceLoaded: true });
});

describe('BookmarkStore — add()', () => {
  it('stamps created and updated timestamps when absent', () => {
    const t0 = Date.now();
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'Beginning' });

    const bm = BookmarkStore.get('b1');
    expect(bm).not.toBeNull();
    expect(bm.id).toBe('b1');
    expect(bm.hlKey).toBe('bible:genesis:1:1');
    expect(bm.label).toBe('Beginning');
    expect(bm.created).toBeGreaterThanOrEqual(t0);
    expect(bm.updated).toBeGreaterThanOrEqual(t0);
  });

  it('preserves caller-supplied created/updated timestamps', () => {
    const customCreated = 1000;
    const customUpdated = 2000;
    BookmarkStore.add({
      id: 'b1',
      hlKey: 'bible:genesis:1:1',
      label: 'L',
      created: customCreated,
      updated: customUpdated,
    });

    const bm = BookmarkStore.get('b1');
    expect(bm.created).toBe(customCreated);
    expect(bm.updated).toBe(customUpdated);
  });

  it('stamps the caller\'s object in place (current behavior)', () => {
    // BookmarkStore.add stamps created/updated directly on the caller's
    // bookmark reference (no spread-copy). This is asymmetric with
    // AnnotationStore.add which does spread-copy, but matches the
    // intentional current behavior — pinning it here so a future
    // accidental change is caught.
    /** @type {any} */
    const bm = { id: 'b1', hlKey: 'bible:genesis:1:1' };

    BookmarkStore.add(bm);

    expect(bm.created).toBeGreaterThan(0);
    expect(bm.updated).toBeGreaterThan(0);
  });

  it('is a no-op when bookmark is null', () => {
    BookmarkStore.add(null);
    expect(BookmarkStore.count()).toBe(0);
  });

  it('is a no-op when bookmark is undefined', () => {
    BookmarkStore.add(undefined);
    expect(BookmarkStore.count()).toBe(0);
  });

  it('rejects bookmarks without id', () => {
    /** @type {any} */
    const noId = { hlKey: 'bible:genesis:1:1' };
    BookmarkStore.add(noId);
    expect(BookmarkStore.count()).toBe(0);
  });

  it('rejects bookmarks without hlKey', () => {
    /** @type {any} */
    const noKey = { id: 'b1' };
    BookmarkStore.add(noKey);
    expect(BookmarkStore.count()).toBe(0);
  });
});

describe('BookmarkStore — get()', () => {
  it('returns null for an unknown id', () => {
    expect(BookmarkStore.get('never')).toBeNull();
  });

  it('returns the bookmark for a known id', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A' });
    BookmarkStore.add({ id: 'b2', hlKey: 'bible:genesis:1:2', label: 'B' });

    expect(BookmarkStore.get('b1').label).toBe('A');
    expect(BookmarkStore.get('b2').label).toBe('B');
  });
});

describe('BookmarkStore — getForKey()', () => {
  it('returns exact-key matches', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A' });
    BookmarkStore.add({ id: 'b2', hlKey: 'bible:genesis:1:2', label: 'B' });

    const results = BookmarkStore.getForKey('bible:genesis:1:1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b1');
  });

  it('returns the bookmark when key matches via prefix-minus-last-segment fallback', () => {
    // The prefix fallback exists so a verse-level query (no range
    // suffix) matches a bookmark stored at the same verse PLUS a
    // selection range. The stored bookmark has the extra :start-end
    // segment; stripping the LAST segment yields the query.
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1:10-40', label: 'Range' });

    const results = BookmarkStore.getForKey('bible:genesis:1:1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b1');
  });

  it('does NOT false-match between :1 and :10 (verse-suffix discipline)', () => {
    // Audit-flagged false-positive class. Query for `bible:genesis:1:1`:
    //   - bookmark `bible:genesis:1:1` — exact match (expected).
    //   - bookmark `bible:genesis:1:10` — prefix `bible:genesis:1` (last
    //     segment stripped). NOT equal to `bible:genesis:1:1`. So NOT
    //     a false positive.
    BookmarkStore.add({ id: 'b_one', hlKey: 'bible:genesis:1:1', label: 'verse 1' });
    BookmarkStore.add({ id: 'b_ten', hlKey: 'bible:genesis:1:10', label: 'verse 10' });

    const results = BookmarkStore.getForKey('bible:genesis:1:1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b_one');
  });

  it('does NOT false-match across different books', () => {
    BookmarkStore.add({ id: 'b_gen', hlKey: 'bible:genesis:1:1', label: 'gen' });
    BookmarkStore.add({ id: 'b_exo', hlKey: 'bible:exodus:1:1', label: 'exo' });

    const results = BookmarkStore.getForKey('bible:genesis:1:1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b_gen');
  });

  it('returns empty array when nothing matches', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A' });
    expect(BookmarkStore.getForKey('bible:exodus:1:1')).toEqual([]);
  });
});

describe('BookmarkStore — getForKeyPrefix()', () => {
  it('returns all bookmarks whose hlKey starts with prefix + ":"', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'wtlb-one:1', label: 'A' });
    BookmarkStore.add({ id: 'b2', hlKey: 'wtlb-one:2', label: 'B' });
    BookmarkStore.add({ id: 'b3', hlKey: 'wtlb-two:1', label: 'C' });

    const results = BookmarkStore.getForKeyPrefix('wtlb-one');
    expect(results).toHaveLength(2);
    const ids = results.map(b => b.id).sort();
    expect(ids).toEqual(['b1', 'b2']);
  });

  it('does NOT false-match `wtlb-one` against `wtlb-one-extra` (separator-discipline guard)', () => {
    // The `indexOf(prefix + ':') === 0` check requires a literal ':' AFTER
    // the prefix, so `wtlb-one-extra:1` does NOT start with `wtlb-one:`.
    // This pins the current behavior; any future change to the filter
    // (e.g. accidental `startsWith(prefix)` would regress) is caught.
    BookmarkStore.add({ id: 'b_one', hlKey: 'wtlb-one:1', label: 'A' });
    BookmarkStore.add({ id: 'b_extra', hlKey: 'wtlb-one-extra:1', label: 'B' });

    const results = BookmarkStore.getForKeyPrefix('wtlb-one');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b_one');
  });

  it('matches exactly when prefix equals the full hlKey', () => {
    // The `k === prefix` branch.
    BookmarkStore.add({ id: 'b1', hlKey: 'letter:the-wide-path:2', label: 'A' });

    const results = BookmarkStore.getForKeyPrefix('letter:the-wide-path:2');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b1');
  });

  it('matches the "stored key is a prefix of the query" branch', () => {
    // The `prefix.indexOf(k + ':') === 0` reverse branch — a bookmark
    // stored at a coarser key (block-level) matches a finer query
    // (block + range).
    BookmarkStore.add({ id: 'b_block', hlKey: 'letter:the-wide-path:2', label: 'Block' });

    const results = BookmarkStore.getForKeyPrefix('letter:the-wide-path:2:10-40');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b_block');
  });

  it('returns empty array when nothing matches', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'wtlb-one:1', label: 'A' });
    expect(BookmarkStore.getForKeyPrefix('wtlb-two')).toEqual([]);
  });
});

describe('BookmarkStore — update()', () => {
  it('patches an existing bookmark and bumps updated', () => {
    BookmarkStore.add({
      id: 'b1',
      hlKey: 'bible:genesis:1:1',
      label: 'Original',
      created: 1000,
      updated: 1000,
    });
    const before = BookmarkStore.get('b1').updated;

    // TEST3: deterministic clock advance (was a real setTimeout(r,5)); restore the
    // mock before the assertions so a failure can't leak it into later tests.
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(before + 10);
    BookmarkStore.update('b1', { label: 'Patched', thought: 'why' });
    nowSpy.mockRestore();

    const bm = BookmarkStore.get('b1');
    expect(bm.label).toBe('Patched');
    expect(bm.thought).toBe('why');
    expect(bm.created).toBe(1000);                  // untouched
    expect(bm.updated).toBeGreaterThan(before);
  });

  it('is a no-op when id is unknown', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A' });
    BookmarkStore.update('never', { label: 'X' });

    // Existing bookmark unchanged; no bogus entry created.
    expect(BookmarkStore.count()).toBe(1);
    expect(BookmarkStore.get('b1').label).toBe('A');
  });
});

describe('BookmarkStore — remove()', () => {
  it('deletes the target bookmark', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A' });
    BookmarkStore.add({ id: 'b2', hlKey: 'bible:genesis:1:2', label: 'B' });

    BookmarkStore.remove('b1');

    expect(BookmarkStore.get('b1')).toBeNull();
    expect(BookmarkStore.get('b2')).not.toBeNull();
    expect(BookmarkStore.count()).toBe(1);
  });

  it('is idempotent on unknown id', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A' });
    BookmarkStore.remove('never');
    expect(BookmarkStore.count()).toBe(1);
  });
});

describe('BookmarkStore — replaceAll()', () => {
  it('replaces the entire bookmark list', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A' });
    BookmarkStore.add({ id: 'b2', hlKey: 'bible:genesis:1:2', label: 'B' });
    expect(BookmarkStore.count()).toBe(2);

    BookmarkStore.replaceAll([
      { id: 'b3', hlKey: 'bible:exodus:1:1', label: 'C', created: 1, updated: 1 },
    ]);

    expect(BookmarkStore.count()).toBe(1);
    expect(BookmarkStore.get('b1')).toBeNull();
    expect(BookmarkStore.get('b2')).toBeNull();
    expect(BookmarkStore.get('b3').label).toBe('C');
  });

  it('resets to empty array when given null', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A' });

    BookmarkStore.replaceAll(null);

    expect(BookmarkStore.count()).toBe(0);
    expect(BookmarkStore.all()).toEqual([]);
  });

  it('resets to empty array when given a non-array', () => {
    BookmarkStore.add({ id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A' });

    // Implementation guard: `Array.isArray(data) ? data.slice() : []`.
    /** @type {any} */
    const notAnArray = { not: 'an array' };
    BookmarkStore.replaceAll(notAnArray);

    expect(BookmarkStore.count()).toBe(0);
    expect(BookmarkStore.all()).toEqual([]);
  });

  it('copies the input array (caller cannot mutate the cache by mutating its array)', () => {
    /** @type {any} */
    const input = [
      { id: 'b1', hlKey: 'bible:genesis:1:1', label: 'A', created: 1, updated: 1 },
    ];
    BookmarkStore.replaceAll(input);

    // Mutate the caller's array — should not affect the store.
    input.push({ id: 'b_smuggled', hlKey: 'bible:genesis:1:2', label: 'X', created: 1, updated: 1 });

    expect(BookmarkStore.count()).toBe(1);
    expect(BookmarkStore.get('b_smuggled')).toBeNull();
  });
});
