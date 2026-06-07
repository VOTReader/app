/* store-merge — 3-way cross-tab merge helpers (STORE-1).
   ─────────────────────────────────────────────────────────────────────
   Pure-function suite. Exercises every cell of the conflict matrix for
   both mergeRecordsById (id-keyed arrays) and mergeMapByKey (keyed maps),
   the pre-built per-store strategies, totality against garbage input, and
   the load-bearing real-world scenarios:
     - the STORE-1 clobber itself (A adds X, B adds Y → both survive)
     - delete vs untouched (honor delete) vs delete vs edit (keep edit)
     - immutable links (no `updated` — add/delete only)
     - annotation segment-bucket merge under a shared hlKey
     - import reduces to the imported value when no sibling diverged
   ───────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  mergeRecordsById, mergeMapByKey, unionStrings,
  mergeArrayStore, mergeListStore, mergeMapStore,
  mergeAnnotationsStore, mergeJournalIndexStore,
} from './store-merge.js';

const rec = (id, updated, extra) => ({ id, updated, created: updated, ...(extra || {}) });
const ids = (arr) => arr.map((r) => r.id);

describe('mergeRecordsById — conflict matrix', () => {
  it('add / add: both siblings\' new records survive (the STORE-1 clobber)', () => {
    const base = [rec('a', 1)];
    const ours = [rec('a', 1), rec('y', 5)];   // we added y
    const theirs = [rec('a', 1), rec('x', 4)]; // sibling committed x
    const out = mergeRecordsById(base, ours, theirs);
    expect(ids(out).sort()).toEqual(['a', 'x', 'y']);
  });

  it('delete vs untouched: honors the sibling delete', () => {
    const base = [rec('a', 1), rec('x', 1)];
    const ours = [rec('a', 1), rec('x', 1)];   // we still hold x, unchanged
    const theirs = [rec('a', 1)];              // sibling deleted x
    const out = mergeRecordsById(base, ours, theirs);
    expect(ids(out)).toEqual(['a']);           // x stays deleted
  });

  it('our delete vs their untouched: honors our delete', () => {
    const base = [rec('a', 1), rec('x', 1)];
    const ours = [rec('a', 1)];                // we deleted x
    const theirs = [rec('a', 1), rec('x', 1)]; // sibling still holds it, unchanged
    const out = mergeRecordsById(base, ours, theirs);
    expect(ids(out)).toEqual(['a']);
  });

  it('delete vs edit: the edit wins (never lose content)', () => {
    const base = [rec('x', 1, { body: 'v1' })];
    const ours = [rec('x', 9, { body: 'v2' })]; // we edited x (newer)
    const theirs = [];                          // sibling deleted x
    const out = mergeRecordsById(base, ours, theirs);
    expect(out).toEqual([rec('x', 9, { body: 'v2' })]);
  });

  it('their edit vs our delete: the edit wins (resurrects with their content)', () => {
    const base = [rec('x', 1, { body: 'v1' })];
    const ours = [];                            // we deleted x
    const theirs = [rec('x', 9, { body: 'v2' })]; // sibling edited x
    const out = mergeRecordsById(base, ours, theirs);
    expect(out).toEqual([rec('x', 9, { body: 'v2' })]);
  });

  it('edit vs edit: newer `updated` wins', () => {
    const base = [rec('x', 1, { body: 'base' })];
    const ours = [rec('x', 3, { body: 'ours' })];
    const theirs = [rec('x', 7, { body: 'theirs' })];
    expect(mergeRecordsById(base, ours, theirs)).toEqual([rec('x', 7, { body: 'theirs' })]);
    // symmetric: ours newer
    expect(mergeRecordsById(base, [rec('x', 9, { body: 'ours' })], theirs))
      .toEqual([rec('x', 9, { body: 'ours' })]);
  });

  it('edit/edit tie resolves to theirs (committed) — deterministic', () => {
    const base = [rec('x', 1)];
    const out = mergeRecordsById(base, [rec('x', 5, { who: 'ours' })], [rec('x', 5, { who: 'theirs' })]);
    expect(out[0].who).toBe('theirs');
  });

  it('both deleted: stays deleted', () => {
    expect(mergeRecordsById([rec('x', 1)], [], [])).toEqual([]);
  });

  it('preserves our order, appends sibling additions at the end', () => {
    const base = [rec('a', 1), rec('b', 1)];
    const ours = [rec('a', 1), rec('b', 1), rec('c', 2)];
    const theirs = [rec('a', 1), rec('b', 1), rec('z', 2)];
    expect(ids(mergeRecordsById(base, ours, theirs))).toEqual(['a', 'b', 'c', 'z']);
  });
});

describe('mergeRecordsById — immutable records (links: no `updated`)', () => {
  const link = (id, created) => ({ id, created, source: {}, target: {} });

  it('two tabs add different links → both survive', () => {
    const base = [link('l1', 1)];
    const ours = [link('l1', 1), link('l2', 2)];
    const theirs = [link('l1', 1), link('l3', 3)];
    expect(ids(mergeRecordsById(base, ours, theirs)).sort()).toEqual(['l1', 'l2', 'l3']);
  });

  it('sibling deletes a link we never touched → honored (no resurrection)', () => {
    const base = [link('l1', 1), link('l2', 2)];
    const ours = [link('l1', 1), link('l2', 2)]; // unchanged (links are immutable)
    const theirs = [link('l1', 1)];              // sibling removed l2
    expect(ids(mergeRecordsById(base, ours, theirs))).toEqual(['l1']);
  });
});

describe('mergeMapByKey — conflict matrix (keyed records, default newer-wins)', () => {
  it('add / add on distinct keys: both survive', () => {
    const base = { a: rec('a', 1) };
    const ours = { a: rec('a', 1), y: rec('y', 5) };
    const theirs = { a: rec('a', 1), x: rec('x', 4) };
    expect(Object.keys(mergeMapByKey(base, ours, theirs)).sort()).toEqual(['a', 'x', 'y']);
  });

  it('delete vs untouched: honored both directions', () => {
    const base = { a: rec('a', 1), x: rec('x', 1) };
    expect(Object.keys(mergeMapByKey(base, { a: rec('a', 1), x: rec('x', 1) }, { a: rec('a', 1) }))).toEqual(['a']);
    expect(Object.keys(mergeMapByKey(base, { a: rec('a', 1) }, { a: rec('a', 1), x: rec('x', 1) }))).toEqual(['a']);
  });

  it('edit vs edit: newer wins', () => {
    const base = { x: rec('x', 1, { v: 'b' }) };
    const out = mergeMapByKey(base, { x: rec('x', 3, { v: 'o' }) }, { x: rec('x', 8, { v: 't' }) });
    expect(out.x.v).toBe('t');
  });

  it('delete vs edit: edit wins', () => {
    const base = { x: rec('x', 1, { v: 'b' }) };
    const out = mergeMapByKey(base, { x: rec('x', 9, { v: 'o' }) }, {}); // sibling deleted x
    expect(out.x.v).toBe('o');
  });
});

describe('unionStrings', () => {
  it('dedups, ours first', () => {
    expect(unionStrings(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });
  it('coerces garbage to empty', () => {
    expect(unionStrings(null, undefined)).toEqual([]);
    expect(unionStrings('nope', 5)).toEqual([]);
  });
});

describe('totality — never throws on garbage input', () => {
  it('mergeRecordsById coerces non-arrays to empty', () => {
    expect(mergeRecordsById(null, undefined, 0)).toEqual([]);
    expect(mergeRecordsById({}, 'x', 42)).toEqual([]);
  });
  it('mergeRecordsById skips records with no id', () => {
    const out = mergeRecordsById([], [{ noId: 1 }, rec('a', 1)], []);
    expect(ids(out)).toEqual(['a']);
  });
  it('mergeMapByKey coerces non-objects (incl. arrays) to empty', () => {
    expect(mergeMapByKey(null, undefined, [])).toEqual({});
    expect(mergeMapByKey([1], 'x', 9)).toEqual({});
  });
});

describe('pre-built per-store strategies', () => {
  it('mergeArrayStore = mergeRecordsById (bookmarks/links)', () => {
    const base = [rec('a', 1)];
    const out = mergeArrayStore(base, [rec('a', 1), rec('b', 2)], [rec('a', 1), rec('c', 3)]);
    expect(ids(out).sort()).toEqual(['a', 'b', 'c']);
  });

  it('mergeListStore merges inside {list} and always returns the wrapper', () => {
    const base = { list: [rec('a', 1)] };
    const ours = { list: [rec('a', 1), rec('b', 2)] };
    const theirs = { list: [rec('a', 1), rec('c', 3)] };
    const out = mergeListStore(base, ours, theirs);
    expect(out).toHaveProperty('list');
    expect(ids(out.list).sort()).toEqual(['a', 'b', 'c']);
  });

  it('mergeListStore tolerates a null/empty cache (returns {list: []})', () => {
    expect(mergeListStore(null, null, null)).toEqual({ list: [] });
  });

  it('mergeMapStore = mergeMapByKey newer-wins (notes)', () => {
    const base = { g1: rec('g1', 1, { body: 'b' }) };
    const out = mergeMapStore(base, { g1: rec('g1', 1, { body: 'b' }), g2: rec('g2', 2) }, { g1: rec('g1', 5, { body: 't' }) });
    expect(out.g1.body).toBe('t');     // sibling's newer edit
    expect(out.g2).toBeTruthy();       // our add survives
  });

  it('mergeAnnotationsStore merges segment buckets under a shared hlKey', () => {
    // Two tabs highlight the SAME verse differently — both segments must survive.
    const seg = (id, updated) => ({ id, groupId: id, kind: 'highlight', updated, created: updated });
    const base = { 'bible:gen:1:1': [seg('s0', 1)] };
    const ours = { 'bible:gen:1:1': [seg('s0', 1), seg('s2', 5)] };   // we added s2
    const theirs = { 'bible:gen:1:1': [seg('s0', 1), seg('s1', 4)] }; // sibling added s1
    const out = mergeAnnotationsStore(base, ours, theirs);
    expect(ids(out['bible:gen:1:1']).sort()).toEqual(['s0', 's1', 's2']);
  });

  it('mergeAnnotationsStore keeps distinct-verse highlights from both tabs', () => {
    const seg = (id) => ({ id, groupId: id, kind: 'highlight', updated: 1, created: 1 });
    const base = {};
    const ours = { 'bible:gen:1:1': [seg('s1')] };
    const theirs = { 'bible:gen:1:2': [seg('s2')] };
    const out = mergeAnnotationsStore(base, ours, theirs);
    expect(Object.keys(out).sort()).toEqual(['bible:gen:1:1', 'bible:gen:1:2']);
  });

  it('STOR1: deleting our last segment is NOT resurrected by a sibling edit to the same hlKey', () => {
    // Tab A holds s1 under K (base). A sibling adds s2 → committed K:[s1,s2]. Tab A
    // then removes s1, emptying the bucket, so AnnotationStore deletes the key (K
    // absent from ours). The merge must honor our member-delete of s1 while keeping
    // the sibling's s2 — NOT resurrect the whole [s1,s2] bucket.
    const seg = (id, updated) => ({ id, groupId: id, kind: 'highlight', updated, created: updated });
    const base = { 'bible:gen:1:1': [seg('s1', 1)] };
    const ours = {};                                                   // we deleted s1 → bucket gone
    const theirs = { 'bible:gen:1:1': [seg('s1', 1), seg('s2', 2)] };  // sibling added s2
    const out = mergeAnnotationsStore(base, ours, theirs);
    expect(ids(out['bible:gen:1:1'] || [])).toEqual(['s2']);          // s1 stays deleted, s2 survives
  });

  it('STOR1: a whole-bucket delete is honored when the sibling did not touch it (no empty key)', () => {
    const seg = (id, updated) => ({ id, groupId: id, kind: 'highlight', updated, created: updated });
    const base = { 'bible:gen:1:1': [seg('s1', 1)] };
    const ours = {};                                          // we deleted the only segment
    const theirs = { 'bible:gen:1:1': [seg('s1', 1)] };       // sibling unchanged
    const out = mergeAnnotationsStore(base, ours, theirs);
    expect(out['bible:gen:1:1']).toBeUndefined();             // honored delete, no empty bucket left behind
  });

  it('mergeJournalIndexStore unions entry-id lists per refKey', () => {
    const base = { 'verse:gen:1:1': ['e0'] };
    const ours = { 'verse:gen:1:1': ['e0', 'eY'] };   // our entry references it
    const theirs = { 'verse:gen:1:1': ['e0', 'eX'] }; // sibling's entry references it
    const out = mergeJournalIndexStore(base, ours, theirs);
    expect(out['verse:gen:1:1'].sort()).toEqual(['e0', 'eX', 'eY']);
  });
});

describe('import semantics — merge(base, imported, idb) reduces to imported when no sibling diverged', () => {
  it('keyed map: idb === base ⇒ result is exactly the imported value', () => {
    const oldData = { a: rec('a', 1), b: rec('b', 1) };     // pre-import state
    const imported = { a: rec('a', 9, { v: 'new' }), c: rec('c', 9) }; // backup drops b, edits a, adds c
    const out = mergeMapByKey(oldData, imported, oldData);  // theirs == base (no sibling)
    expect(Object.keys(out).sort()).toEqual(['a', 'c']);    // b dropped, c added
    expect(out.a.v).toBe('new');
  });

  it('id array: idb === base ⇒ result is exactly the imported list', () => {
    const oldData = [rec('a', 1), rec('b', 1)];
    const imported = [rec('a', 9, { v: 'new' }), rec('c', 9)];
    const out = mergeRecordsById(oldData, imported, oldData);
    expect(ids(out).sort()).toEqual(['a', 'c']);
  });

  it('import with a concurrent sibling addition keeps the sibling record too (no loss)', () => {
    const oldData = [rec('a', 1)];
    const imported = [rec('a', 9)];                 // backup just re-affirms a
    const siblingNow = [rec('a', 1), rec('s', 2)];  // a sibling tab added s during import
    const out = mergeRecordsById(oldData, imported, siblingNow);
    expect(ids(out).sort()).toEqual(['a', 's']);    // sibling's s is NOT lost
  });
});
