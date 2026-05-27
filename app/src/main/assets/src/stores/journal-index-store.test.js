/* Q5.5 — JournalIndexStore cascade regression tests.
   ────────────────────────────────────────────────────
   The reverse-index stores `{ refKey: [entryId, entryId, ...] }` —
   one bucket per resource (letter, chapter, verse, bookmark, etc.),
   one entryId per journal entry that references it. Cascade operations
   (rebuildForEntry, removeEntry) walk every bucket and surgically
   add/remove a single entryId.

   The silent-failure mode this test guards: prune-one-too-many — an
   over-eager filter that removes a SHARED bucket entry while trying
   to update a DIFFERENT entry's references. E.g., entry A's rebuild
   accidentally also strips entry B from a key both legitimately
   reference. User sees "X journal entries" chip count drop by 1
   without explanation; the missing entry's count won't recover until
   they edit and re-save the entry.

   Coverage:
     - entriesReferencing: defensive copy + empty fallback
     - hasReferences: cheap-path predicate
     - rebuildForEntry: remove-from-old + add-to-new with SHARED keys
     - removeEntry: cascade across multiple buckets
     - Empty-bucket cleanup (key deleted when last entry removed)
     - refsForEntry: reverse lookup
     - clear: wipe + restate
     - Idempotency / null-input guards
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { JournalIndexStore } from './journal-index-store.js';

beforeEach(() => {
  localStorage.clear();
  JournalIndexStore._resetForTests({ forceLoaded: true });
});

describe('JournalIndexStore — entriesReferencing', () => {
  it('returns empty array for an unknown refKey', () => {
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual([]);
  });

  it('returns empty array when refKey is null/undefined/empty', () => {
    expect(JournalIndexStore.entriesReferencing(null)).toEqual([]);
    expect(JournalIndexStore.entriesReferencing(undefined)).toEqual([]);
    expect(JournalIndexStore.entriesReferencing('')).toEqual([]);
  });

  it('returns the list of entries for a known refKey', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    JournalIndexStore.rebuildForEntry('j_b', ['chapter:matthew:5']);

    const entries = JournalIndexStore.entriesReferencing('chapter:matthew:5');
    expect(entries).toContain('j_a');
    expect(entries).toContain('j_b');
    expect(entries.length).toBe(2);
  });

  it('returns a DEFENSIVE COPY — mutation of the result doesn\'t affect the cache', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['letter:vol1/foo']);

    const entries = JournalIndexStore.entriesReferencing('letter:vol1/foo');
    entries.push('j_bogus');  // mutate the returned array

    // Second call returns the ORIGINAL data, not the mutated copy.
    const entries2 = JournalIndexStore.entriesReferencing('letter:vol1/foo');
    expect(entries2).toEqual(['j_a']);
  });
});

describe('JournalIndexStore — hasReferences', () => {
  it('returns false for unknown / falsy refKey', () => {
    expect(JournalIndexStore.hasReferences('chapter:matthew:5')).toBe(false);
    expect(JournalIndexStore.hasReferences(null)).toBe(false);
    expect(JournalIndexStore.hasReferences(undefined)).toBe(false);
    expect(JournalIndexStore.hasReferences('')).toBe(false);
  });

  it('returns true for a refKey with at least one entry', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    expect(JournalIndexStore.hasReferences('chapter:matthew:5')).toBe(true);
  });

  it('returns false after all entries are removed from a refKey', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    expect(JournalIndexStore.hasReferences('chapter:matthew:5')).toBe(true);

    JournalIndexStore.rebuildForEntry('j_a', []);  // remove from everything
    expect(JournalIndexStore.hasReferences('chapter:matthew:5')).toBe(false);
  });
});

describe('JournalIndexStore — rebuildForEntry (the over-prune risk)', () => {
  it('adds an entry to new refKeys', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5', 'bookmark:bkm_1']);

    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual(['j_a']);
    expect(JournalIndexStore.entriesReferencing('bookmark:bkm_1')).toEqual(['j_a']);
  });

  it('removes an entry from refKeys no longer in its set', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5', 'bookmark:bkm_1']);

    // Entry now only refs the bookmark.
    JournalIndexStore.rebuildForEntry('j_a', ['bookmark:bkm_1']);

    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual([]);
    expect(JournalIndexStore.entriesReferencing('bookmark:bkm_1')).toEqual(['j_a']);
  });

  it('PRESERVES other entries when one entry\'s refs change (the prune-one-too-many guard)', () => {
    // The critical case: two entries reference the same refKey. Rebuild
    // ONE entry away from that refKey must NOT remove the other entry.
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5', 'bookmark:bkm_1']);
    JournalIndexStore.rebuildForEntry('j_b', ['chapter:matthew:5', 'letter:vol1/foo']);

    // Before: chapter:matthew:5 has both entries.
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5').sort()).toEqual(['j_a', 'j_b']);

    // j_a's rebuild removes its reference to chapter:matthew:5.
    JournalIndexStore.rebuildForEntry('j_a', ['bookmark:bkm_1']);

    // j_b's reference to chapter:matthew:5 MUST survive.
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual(['j_b']);
    // j_b's other references intact.
    expect(JournalIndexStore.entriesReferencing('letter:vol1/foo')).toEqual(['j_b']);
    // j_a's remaining reference intact.
    expect(JournalIndexStore.entriesReferencing('bookmark:bkm_1')).toEqual(['j_a']);
  });

  it('deletes a refKey bucket when the last entry is removed from it', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);

    JournalIndexStore.rebuildForEntry('j_a', []);  // removes from everywhere

    // The bucket should be GONE, not just empty.
    const allRefs = JournalIndexStore.refsForEntry('j_a');
    expect(allRefs).toEqual([]);
    // hasReferences confirms: bucket missing OR empty.
    expect(JournalIndexStore.hasReferences('chapter:matthew:5')).toBe(false);
  });

  it('is idempotent on identical refs (no duplicates added)', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);

    // Still exactly one occurrence of j_a in the bucket.
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual(['j_a']);
  });

  it('handles null entryId / null refs gracefully (no-op)', () => {
    JournalIndexStore.rebuildForEntry(null, ['chapter:matthew:5']);
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual([]);

    JournalIndexStore.rebuildForEntry('', ['chapter:matthew:5']);
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual([]);

    // null refs treated as empty — removes entry from everywhere.
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    JournalIndexStore.rebuildForEntry('j_a', null);
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual([]);
  });
});

describe('JournalIndexStore — removeEntry (full cascade)', () => {
  it('strips the entry from every refKey it referenced', () => {
    JournalIndexStore.rebuildForEntry('j_a', [
      'chapter:matthew:5',
      'verse:matthew:5:3',
      'bookmark:bkm_1',
      'letter:vol1/foo',
    ]);

    JournalIndexStore.removeEntry('j_a');

    for (const refKey of [
      'chapter:matthew:5', 'verse:matthew:5:3',
      'bookmark:bkm_1', 'letter:vol1/foo',
    ]) {
      expect(JournalIndexStore.entriesReferencing(refKey)).toEqual([]);
    }
  });

  it('PRESERVES other entries\' references (full-cascade prune-one-too-many guard)', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5', 'bookmark:bkm_1']);
    JournalIndexStore.rebuildForEntry('j_b', ['chapter:matthew:5']);
    JournalIndexStore.rebuildForEntry('j_c', ['bookmark:bkm_1', 'letter:vol1/foo']);

    JournalIndexStore.removeEntry('j_a');

    // j_b still references chapter:matthew:5.
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual(['j_b']);
    // j_c still references bookmark:bkm_1.
    expect(JournalIndexStore.entriesReferencing('bookmark:bkm_1')).toEqual(['j_c']);
    // j_c's other reference intact.
    expect(JournalIndexStore.entriesReferencing('letter:vol1/foo')).toEqual(['j_c']);
  });

  it('deletes empty buckets after removeEntry', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    JournalIndexStore.removeEntry('j_a');

    // The bucket should be deleted, not left as []
    const raw = JournalIndexStore.raw();
    expect('chapter:matthew:5' in raw).toBe(false);
  });

  it('is a no-op when the entry has no references', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);

    // Removing a never-indexed entry leaves everything alone.
    JournalIndexStore.removeEntry('j_never_indexed');

    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual(['j_a']);
  });

  it('handles null / empty entryId without throwing', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);

    expect(() => JournalIndexStore.removeEntry(null)).not.toThrow();
    expect(() => JournalIndexStore.removeEntry('')).not.toThrow();
    expect(() => JournalIndexStore.removeEntry(undefined)).not.toThrow();

    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual(['j_a']);
  });
});

describe('JournalIndexStore — refsForEntry (reverse lookup)', () => {
  it('returns every refKey an entry contributes to', () => {
    JournalIndexStore.rebuildForEntry('j_a', [
      'chapter:matthew:5',
      'verse:matthew:5:3',
      'bookmark:bkm_1',
    ]);

    const refs = JournalIndexStore.refsForEntry('j_a').sort();
    expect(refs).toEqual(['bookmark:bkm_1', 'chapter:matthew:5', 'verse:matthew:5:3']);
  });

  it('returns [] for unknown / null entryId', () => {
    expect(JournalIndexStore.refsForEntry('j_never')).toEqual([]);
    expect(JournalIndexStore.refsForEntry(null)).toEqual([]);
    expect(JournalIndexStore.refsForEntry('')).toEqual([]);
  });

  it('does NOT include refKeys referenced only by other entries', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    JournalIndexStore.rebuildForEntry('j_b', ['letter:vol1/foo']);

    expect(JournalIndexStore.refsForEntry('j_a')).toEqual(['chapter:matthew:5']);
    expect(JournalIndexStore.refsForEntry('j_b')).toEqual(['letter:vol1/foo']);
  });
});

describe('JournalIndexStore — clear', () => {
  it('wipes all buckets', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    JournalIndexStore.rebuildForEntry('j_b', ['letter:vol1/foo']);

    JournalIndexStore.clear();

    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual([]);
    expect(JournalIndexStore.entriesReferencing('letter:vol1/foo')).toEqual([]);
    expect(JournalIndexStore.refsForEntry('j_a')).toEqual([]);
  });

  it('allows rebuild after clear', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    JournalIndexStore.clear();
    JournalIndexStore.rebuildForEntry('j_a', ['verse:matthew:5:3']);

    expect(JournalIndexStore.entriesReferencing('verse:matthew:5:3')).toEqual(['j_a']);
  });
});

describe('JournalIndexStore — multi-entry / multi-rebuild scenarios', () => {
  it('handles 3 entries each citing the same 2 refKeys without crosstalk', () => {
    // All 3 entries point at the same 2 keys.
    JournalIndexStore.rebuildForEntry('j_1', ['chapter:matthew:5', 'bookmark:bkm_1']);
    JournalIndexStore.rebuildForEntry('j_2', ['chapter:matthew:5', 'bookmark:bkm_1']);
    JournalIndexStore.rebuildForEntry('j_3', ['chapter:matthew:5', 'bookmark:bkm_1']);

    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5').sort()).toEqual(['j_1', 'j_2', 'j_3']);
    expect(JournalIndexStore.entriesReferencing('bookmark:bkm_1').sort()).toEqual(['j_1', 'j_2', 'j_3']);

    // Remove j_2; the others stay.
    JournalIndexStore.removeEntry('j_2');

    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5').sort()).toEqual(['j_1', 'j_3']);
    expect(JournalIndexStore.entriesReferencing('bookmark:bkm_1').sort()).toEqual(['j_1', 'j_3']);
  });

  it('rebuildForEntry → removeEntry → re-rebuildForEntry round-trip', () => {
    JournalIndexStore.rebuildForEntry('j_a', ['chapter:matthew:5']);
    JournalIndexStore.removeEntry('j_a');
    JournalIndexStore.rebuildForEntry('j_a', ['verse:matthew:5:3']);

    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual([]);
    expect(JournalIndexStore.entriesReferencing('verse:matthew:5:3')).toEqual(['j_a']);
  });
});
