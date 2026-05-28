/* NotebookStore tests — case-insensitive dedup + rename + cascade.
   ─────────────────────────────────────────────────────────────────
   NotebookStore owns the "named bucket" surface — every notebook
   record is the target end of multi-membership references from
   NoteStore (a note's notebookIds[] points at notebook ids). The
   silent-failure modes are:

     1) Dedup-bypass on case mismatch — without the .toLowerCase()
        comparison, "Devotional" + "DEVOTIONAL" would create TWO
        notebooks with identical-looking names and the user's notes
        would scatter between them.
     2) Whitespace-bypass on dedup — without trim() on both sides
        of the lookup, "  Devotional  " would slip past the
        Devotional check.
     3) Blank-name leakage — without the `if (!trimmed) return null`
        guard, '' / '   ' / null / undefined would create empty
        notebooks the UI can't address (Notebook Manager would render
        unclickable rows).
     4) Cascade orphan — remove() must call NoteStore.pruneNotebook
        so notes that referenced the deleted notebook lose JUST that
        membership (not their other notebookIds, not the note itself).
        The cross-store wiring is the load-bearing part.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { NotebookStore } from './notebook-store.js';
import { NoteStore } from './note-store.js';

beforeEach(() => {
  localStorage.clear();
  NotebookStore._resetForTests({ forceLoaded: true });
  NoteStore._resetForTests({ forceLoaded: true });
});

describe('NotebookStore — add()', () => {
  it('creates a new notebook with trimmed name', () => {
    const nb = NotebookStore.add('  Devotional  ');

    expect(nb).not.toBeNull();
    expect(/** @type {any} */ (nb).name).toBe('Devotional');
    expect(/** @type {any} */ (nb).sortIndex).toBe(0);
    expect(/** @type {any} */ (nb).created).toBeGreaterThan(0);
    expect(/** @type {any} */ (nb).updated).toBeGreaterThanOrEqual(
      /** @type {any} */ (nb).created
    );
    // id has the expected nb_ prefix.
    expect(/** @type {any} */ (nb).id).toMatch(/^nb_/);
  });

  it('case-insensitive dedup returns the existing notebook on repeat add', () => {
    const first = NotebookStore.add('Devotional');
    const second = NotebookStore.add('DEVOTIONAL');
    const third = NotebookStore.add('devotional');

    expect(NotebookStore.list().length).toBe(1);
    // All three calls return the SAME notebook reference (same id).
    expect(/** @type {any} */ (second).id).toBe(/** @type {any} */ (first).id);
    expect(/** @type {any} */ (third).id).toBe(/** @type {any} */ (first).id);
    // Name preserves the FIRST casing.
    expect(/** @type {any} */ (first).name).toBe('Devotional');
  });

  it('dedup also matches with surrounding whitespace', () => {
    const first = NotebookStore.add('Devotional');
    const second = NotebookStore.add('  Devotional  ');

    expect(NotebookStore.list().length).toBe(1);
    expect(/** @type {any} */ (second).id).toBe(/** @type {any} */ (first).id);
  });

  it('returns null when name is blank or whitespace-only', () => {
    expect(NotebookStore.add('')).toBeNull();
    expect(NotebookStore.add('   ')).toBeNull();
    expect(NotebookStore.add(null)).toBeNull();
    expect(NotebookStore.add(undefined)).toBeNull();
    // No empty notebooks left over.
    expect(NotebookStore.list().length).toBe(0);
  });

  it('sortIndex increments per non-dup add', () => {
    const a = NotebookStore.add('A');
    const b = NotebookStore.add('B');
    const c = NotebookStore.add('C');

    expect(/** @type {any} */ (a).sortIndex).toBe(0);
    expect(/** @type {any} */ (b).sortIndex).toBe(1);
    expect(/** @type {any} */ (c).sortIndex).toBe(2);
    // Dup add must NOT increment the counter for an existing notebook.
    NotebookStore.add('A');
    expect(NotebookStore.list().length).toBe(3);
  });
});

describe('NotebookStore — rename()', () => {
  it('patches name and bumps updated', async () => {
    const nb = NotebookStore.add('Original');
    const id = /** @type {any} */ (nb).id;
    const t0 = /** @type {any} */ (nb).updated;

    // Small delay so `updated` ts is strictly newer than created.
    await new Promise(r => setTimeout(r, 5));
    NotebookStore.rename(id, 'Renamed');

    const after = NotebookStore.get(id);
    expect(/** @type {any} */ (after).name).toBe('Renamed');
    expect(/** @type {any} */ (after).updated).toBeGreaterThan(t0);
  });

  it('trims the new name', () => {
    const nb = NotebookStore.add('Original');
    NotebookStore.rename(/** @type {any} */ (nb).id, '  Trimmed  ');

    expect(/** @type {any} */ (NotebookStore.get(/** @type {any} */ (nb).id)).name).toBe('Trimmed');
  });

  it('is a no-op with blank name', () => {
    const nb = NotebookStore.add('Original');
    const before = /** @type {any} */ (NotebookStore.get(/** @type {any} */ (nb).id)).updated;

    NotebookStore.rename(/** @type {any} */ (nb).id, '');
    NotebookStore.rename(/** @type {any} */ (nb).id, '   ');
    NotebookStore.rename(/** @type {any} */ (nb).id, null);
    NotebookStore.rename(/** @type {any} */ (nb).id, undefined);

    const after = NotebookStore.get(/** @type {any} */ (nb).id);
    expect(/** @type {any} */ (after).name).toBe('Original');
    expect(/** @type {any} */ (after).updated).toBe(before);
  });

  it('is a no-op on unknown id', () => {
    NotebookStore.add('Other');
    expect(() => NotebookStore.rename('nb_does_not_exist', 'New Name')).not.toThrow();
    expect(NotebookStore.list().length).toBe(1);
    expect(NotebookStore.list()[0].name).toBe('Other');
  });
});

describe('NotebookStore — remove()', () => {
  it('deletes the notebook from the list', () => {
    const a = NotebookStore.add('Keep');
    const b = NotebookStore.add('Delete');

    NotebookStore.remove(/** @type {any} */ (b).id);

    expect(NotebookStore.list().length).toBe(1);
    expect(NotebookStore.list()[0].id).toBe(/** @type {any} */ (a).id);
    expect(NotebookStore.get(/** @type {any} */ (b).id)).toBeNull();
  });

  it('cascades to NoteStore.pruneNotebook (note keeps body but loses the membership)', () => {
    const nb = NotebookStore.add('Devotional');
    const nbId = /** @type {any} */ (nb).id;
    NoteStore.set('g_1', { body: 'My note', notebookIds: [nbId, 'nb_other'] });

    NotebookStore.remove(nbId);

    // Note itself is preserved — only the membership goes away.
    const note = NoteStore.get('g_1');
    expect(note).not.toBeNull();
    expect(/** @type {any} */ (note).body).toBe('My note');
    expect(/** @type {any} */ (note).notebookIds).not.toContain(nbId);
    expect(/** @type {any} */ (note).notebookIds).toContain('nb_other');
  });

  it('is a no-op on unknown id (idempotent)', () => {
    NotebookStore.add('Existing');

    expect(() => NotebookStore.remove('nb_never_existed')).not.toThrow();
    expect(NotebookStore.list().length).toBe(1);
  });
});

describe('NotebookStore — replaceAll()', () => {
  it('replaces the whole list with the provided wrapped data', () => {
    NotebookStore.add('Old A');
    NotebookStore.add('Old B');
    expect(NotebookStore.list().length).toBe(2);

    /** @type {any} */
    const replacement = {
      list: [
        { id: 'nb_new1', name: 'New A', sortIndex: 0, created: 100, updated: 100 },
        { id: 'nb_new2', name: 'New B', sortIndex: 1, created: 200, updated: 200 },
        { id: 'nb_new3', name: 'New C', sortIndex: 2, created: 300, updated: 300 },
      ],
    };
    NotebookStore.replaceAll(replacement);

    expect(NotebookStore.list().length).toBe(3);
    expect(NotebookStore.list().map(n => n.id)).toEqual(['nb_new1', 'nb_new2', 'nb_new3']);
    // Old notebooks gone — replacement is total, not merged.
    expect(NotebookStore.list().find(n => n.name === 'Old A')).toBeUndefined();
  });

  it('coerces non-object / null / array input to empty list', () => {
    NotebookStore.add('Seed');
    expect(NotebookStore.list().length).toBe(1);

    NotebookStore.replaceAll(/** @type {any} */ (null));
    expect(NotebookStore.list().length).toBe(0);

    NotebookStore.add('Seed2');
    NotebookStore.replaceAll(/** @type {any} */ (undefined));
    expect(NotebookStore.list().length).toBe(0);

    NotebookStore.add('Seed3');
    NotebookStore.replaceAll(/** @type {any} */ ('not an object'));
    expect(NotebookStore.list().length).toBe(0);

    NotebookStore.add('Seed4');
    // Bare array (not wrapped { list: [...] }) coerces to empty.
    NotebookStore.replaceAll(/** @type {any} */ ([{ id: 'nb_x', name: 'X' }]));
    expect(NotebookStore.list().length).toBe(0);
  });

  it('coerces { list: <non-array> } to empty', () => {
    NotebookStore.add('Seed');
    NotebookStore.replaceAll(/** @type {any} */ ({ list: 'not an array' }));
    expect(NotebookStore.list().length).toBe(0);
  });
});

describe('NotebookStore — get() and list()', () => {
  it('get returns null for unknown id and the notebook for known id', () => {
    const nb = NotebookStore.add('Devotional');

    expect(NotebookStore.get(/** @type {any} */ (nb).id)).not.toBeNull();
    expect(/** @type {any} */ (NotebookStore.get(/** @type {any} */ (nb).id)).name).toBe('Devotional');
    expect(NotebookStore.get('nb_does_not_exist')).toBeNull();
  });

  it('list returns the array sorted by sortIndex (then created)', () => {
    const a = NotebookStore.add('A');
    const b = NotebookStore.add('B');
    const c = NotebookStore.add('C');

    const arr = NotebookStore.list();
    expect(arr.length).toBe(3);
    expect(arr.map(n => n.id)).toEqual([
      /** @type {any} */ (a).id,
      /** @type {any} */ (b).id,
      /** @type {any} */ (c).id,
    ]);
  });

  it('list returns a fresh sorted array (mutating it does not affect the cache)', () => {
    NotebookStore.add('A');
    NotebookStore.add('B');

    const arr = NotebookStore.list();
    arr.push(/** @type {any} */ ({ id: 'nb_bogus', name: 'Bogus' }));

    // Second call returns unchanged data — cache untouched by the push.
    expect(NotebookStore.list().length).toBe(2);
  });
});
