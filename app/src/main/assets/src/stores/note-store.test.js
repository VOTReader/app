/* Q5.7 — NoteStore cascade tests (notebook deletion + multi-membership).
   ────────────────────────────────────────────────────────────────────
   NoteStore is symmetric to JournalStore for notebooks: a notebook
   deletion via NotebookStore.remove cascades through
   NoteStore.pruneNotebook to strip that notebookId from every note
   that referenced it. The silent failure mode is the same as Q5.5's
   JournalIndexStore: over-eager pruning removes a note's OTHER
   notebookIds, or under-eager pruning leaves dangling references.

   Plus the set/update/remove CRUD surface — set's "upsert with
   default scaffolding" pattern has its own silent-loss risk: the
   spread order in `data[groupId] = { ...defaults, ...(existing),
   ...fields, updated: ts }` must put defaults FIRST so existing data
   wins on overlap. A flipped spread order silently resets the user's
   color/notebookIds/body each set() call.
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoteStore } from './note-store.js';

beforeEach(() => {
  localStorage.clear();
  NoteStore._resetForTests({ forceLoaded: true });
});

describe('NoteStore — CRUD surface', () => {
  it('get returns null for unknown groupId', () => {
    expect(NoteStore.get('g_never')).toBeNull();
  });

  it('set upserts a new note with default scaffolding', () => {
    NoteStore.set('g_1', { body: 'My note', color: 'yellow' });

    const note = NoteStore.get('g_1');
    expect(note).not.toBeNull();
    expect(note.groupId).toBe('g_1');
    expect(note.body).toBe('My note');
    expect(note.color).toBe('yellow');
    expect(note.notebookIds).toEqual([]);
    expect(note.keys).toEqual([]);
    expect(note.created).toBeGreaterThan(0);
    expect(note.updated).toBeGreaterThanOrEqual(note.created);
  });

  it('set preserves existing fields when patching (silent-data-loss guard)', () => {
    // This is the critical regression for set's spread order. If the
    // implementation accidentally puts `existing` AFTER `fields`, the
    // patch would overwrite NEW data with OLD; if it puts the defaults
    // after `existing`, every set() would reset the user's color and
    // notebookIds. The current implementation:
    //   { defaults, ...(existing || {}), ...fields, updated: ts }
    // is the correct order — test that it survives.
    NoteStore.set('g_1', { body: 'Original', color: 'green', notebookIds: ['nb_a'] });

    // Patch only body — color and notebookIds must survive.
    NoteStore.set('g_1', { body: 'Updated' });

    const note = NoteStore.get('g_1');
    expect(note.body).toBe('Updated');
    expect(note.color).toBe('green');        // preserved
    expect(note.notebookIds).toEqual(['nb_a']); // preserved
  });

  it('set preserves keys[] across patches', () => {
    NoteStore.set('g_1', { keys: ['letter:vol1:0', 'letter:vol1:1'] });
    NoteStore.set('g_1', { body: 'Edit' });

    expect(NoteStore.get('g_1').keys).toEqual(['letter:vol1:0', 'letter:vol1:1']);
  });

  it('update patches an existing note in place + bumps updated', () => {
    NoteStore.set('g_1', { body: 'A', color: 'green' });
    const t0 = NoteStore.get('g_1').updated;

    // TEST3: deterministic clock advance (was a real setTimeout(r,5), which could
    // flake if Date.now() didn't tick across 5 wall-clock ms). Restore BEFORE the
    // assertions so a failure can't leak the mock into later tests.
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0 + 10);
    NoteStore.update('g_1', { body: 'B' });
    nowSpy.mockRestore();

    const note = NoteStore.get('g_1');
    expect(note.body).toBe('B');
    expect(note.color).toBe('green');           // untouched
    expect(note.updated).toBeGreaterThan(t0);
  });

  it('update is a no-op when groupId is unknown', () => {
    NoteStore.update('g_never', { body: 'X' });
    expect(NoteStore.get('g_never')).toBeNull();
    // No bogus entry created.
    expect(NoteStore.count()).toBe(0);
  });

  it('remove deletes a note', () => {
    NoteStore.set('g_1', { body: 'A' });
    NoteStore.set('g_2', { body: 'B' });
    NoteStore.remove('g_1');

    expect(NoteStore.get('g_1')).toBeNull();
    expect(NoteStore.get('g_2')).not.toBeNull();
    expect(NoteStore.count()).toBe(1);
  });

  it('remove is idempotent on unknown groupId', () => {
    NoteStore.set('g_1', { body: 'A' });
    NoteStore.remove('g_never');
    expect(NoteStore.count()).toBe(1);
  });

  it('list returns notes sorted newest first by updated', () => {
    // TEST3: deterministic monotonic clock (was two real setTimeout(r,5) waits).
    let now = 1000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    NoteStore.set('g_old', { body: 'old' });          // updated 1000
    now = 2000;
    NoteStore.set('g_new', { body: 'new' });          // updated 2000
    now = 3000;
    NoteStore.update('g_old', { body: 'old-updated' }); // updated 3000 → newest
    nowSpy.mockRestore();

    const sorted = NoteStore.list();
    expect(sorted[0].groupId).toBe('g_old');   // most-recently-updated first
    expect(sorted[1].groupId).toBe('g_new');
  });

  it('count tracks total notes', () => {
    expect(NoteStore.count()).toBe(0);
    NoteStore.set('a', {});
    NoteStore.set('b', {});
    expect(NoteStore.count()).toBe(2);
    NoteStore.remove('a');
    expect(NoteStore.count()).toBe(1);
  });
});

describe('NoteStore — toggleNotebook', () => {
  beforeEach(() => {
    NoteStore.set('g_1', { body: 'note', notebookIds: [] });
  });

  it('adds a notebookId when not present', () => {
    NoteStore.toggleNotebook('g_1', 'nb_a');
    expect(NoteStore.get('g_1').notebookIds).toEqual(['nb_a']);
  });

  it('removes a notebookId when already present', () => {
    NoteStore.toggleNotebook('g_1', 'nb_a');
    NoteStore.toggleNotebook('g_1', 'nb_a');  // toggle off
    expect(NoteStore.get('g_1').notebookIds).toEqual([]);
  });

  it('toggling B does not disturb A (multi-membership independence)', () => {
    NoteStore.toggleNotebook('g_1', 'nb_a');
    NoteStore.toggleNotebook('g_1', 'nb_b');
    NoteStore.toggleNotebook('g_1', 'nb_b');  // toggle B off

    // A still present, B removed.
    expect(NoteStore.get('g_1').notebookIds).toEqual(['nb_a']);
  });

  it('is a no-op when the note doesn\'t exist', () => {
    NoteStore.toggleNotebook('g_never', 'nb_a');
    expect(NoteStore.get('g_never')).toBeNull();
  });

  it('handles a note with malformed notebookIds (not-array) gracefully', () => {
    // Defensive — the code's Array.isArray guard means a missing or
    // non-array notebookIds shouldn't throw; it just initializes to [].
    /** @type {any} */
    const data = NoteStore._load();
    data['g_legacy'] = { groupId: 'g_legacy', notebookIds: null };
    NoteStore._save();

    NoteStore.toggleNotebook('g_legacy', 'nb_a');
    expect(NoteStore.get('g_legacy').notebookIds).toEqual(['nb_a']);
  });
});

describe('NoteStore — pruneNotebook cascade (prune-one-too-many guard)', () => {
  it('strips a deleted notebookId from a single note', () => {
    NoteStore.set('g_1', { body: 'A', notebookIds: ['nb_a', 'nb_b'] });

    NoteStore.pruneNotebook('nb_a');

    expect(NoteStore.get('g_1').notebookIds).toEqual(['nb_b']);
  });

  it('strips a notebookId from every note that referenced it', () => {
    NoteStore.set('g_1', { body: 'A', notebookIds: ['nb_a', 'nb_b'] });
    NoteStore.set('g_2', { body: 'B', notebookIds: ['nb_a'] });
    NoteStore.set('g_3', { body: 'C', notebookIds: ['nb_b'] });  // no nb_a

    NoteStore.pruneNotebook('nb_a');

    expect(NoteStore.get('g_1').notebookIds).toEqual(['nb_b']);
    expect(NoteStore.get('g_2').notebookIds).toEqual([]);
    expect(NoteStore.get('g_3').notebookIds).toEqual(['nb_b']);  // untouched
  });

  it('does NOT touch other notebookIds on the same note (prune-one-too-many)', () => {
    // The critical regression — pruning nb_a must NOT strip nb_b or nb_c
    // even though they're on the same note's notebookIds array.
    NoteStore.set('g_1', { body: 'A', notebookIds: ['nb_a', 'nb_b', 'nb_c'] });

    NoteStore.pruneNotebook('nb_a');

    expect(NoteStore.get('g_1').notebookIds).toEqual(['nb_b', 'nb_c']);
  });

  it('bumps updated only on notes that ACTUALLY had the membership', () => {
    // TEST3: mock the clock so the prune stamp (2000) would DIFFER from the set
    // stamp (1000) if pruneNotebook wrongly bumped g_without — a stronger check
    // than the old setTimeout(r,5), which could read the same ms and pass falsely.
    let now = 1000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    NoteStore.set('g_with', { body: 'A', notebookIds: ['nb_a'] });
    NoteStore.set('g_without', { body: 'B', notebookIds: [] });

    const updated_without_before = NoteStore.get('g_without').updated; // 1000
    now = 2000;
    NoteStore.pruneNotebook('nb_a');
    nowSpy.mockRestore();

    // g_with had the membership → updated bumped. g_without didn't → unchanged
    // (still 1000, not the 2000 it would be if it had been bumped).
    expect(NoteStore.get('g_without').updated).toBe(updated_without_before);
    expect(NoteStore.get('g_with').notebookIds).toEqual([]);
  });

  it('is a no-op when no note references the notebookId', () => {
    NoteStore.set('g_1', { body: 'A', notebookIds: ['nb_a'] });

    NoteStore.pruneNotebook('nb_unused');

    expect(NoteStore.get('g_1').notebookIds).toEqual(['nb_a']);
  });

  it('handles notes with missing notebookIds field (legacy data)', () => {
    /** @type {any} */
    const data = NoteStore._load();
    data['g_legacy'] = { groupId: 'g_legacy' };  // no notebookIds
    NoteStore._save();

    expect(() => NoteStore.pruneNotebook('nb_a')).not.toThrow();
    // Legacy note untouched.
    expect(/** @type {any} */ (NoteStore.get('g_legacy')).notebookIds).toBeUndefined();
  });
});

describe('NoteStore — all() / list() invariants', () => {
  it('all() returns the raw map (mutation persists on next _save)', () => {
    NoteStore.set('g_1', { body: 'A' });

    const map = NoteStore.all();
    expect(map.g_1).toBeDefined();
    expect(map.g_1.body).toBe('A');
  });

  it('list() returns a fresh sorted array (caller can sort/filter without affecting cache)', () => {
    NoteStore.set('g_1', { body: 'A' });
    NoteStore.set('g_2', { body: 'B' });

    const sorted = NoteStore.list();
    sorted.push(/** @type {any} */ ({ groupId: 'g_bogus' }));  // mutate result

    // Second call returns unchanged data.
    expect(NoteStore.list().length).toBe(2);
  });
});

describe('NoteStore — APP1 keyed reactivity', () => {
  it("set/remove bump only the note's anchor keys (other verses stay isolated)", () => {
    const K1 = 'bible:genesis:1:1', K2 = 'bible:genesis:1:2';
    const k1a = NoteStore.getVersionForKey(K1);
    const k2a = NoteStore.getVersionForKey(K2);
    NoteStore.set('g_1', { body: 'x', keys: [K1] });
    expect(NoteStore.getVersionForKey(K1)).not.toBe(k1a);   // K1's verse re-renders
    expect(NoteStore.getVersionForKey(K2)).toBe(k2a);       // K2's verse does NOT
    const k1b = NoteStore.getVersionForKey(K1);
    NoteStore.remove('g_1');
    expect(NoteStore.getVersionForKey(K1)).not.toBe(k1b);   // removal re-renders K1
    expect(NoteStore.getVersionForKey(K2)).toBe(k2a);       // still isolated
  });

  it('still bumps the global version so the imperative DOM note pass wakes', () => {
    const g0 = NoteStore.getVersion();
    NoteStore.set('g_2', { body: 'y', keys: ['bible:genesis:2:1'] });
    expect(NoteStore.getVersion()).not.toBe(g0);
  });

  it('a note with no keys falls back to a global bump (every verse re-checks)', () => {
    const K = 'bible:genesis:3:1';
    const ka = NoteStore.getVersionForKey(K);
    NoteStore.set('g_3', { body: 'z' });   // no keys → global bump reaches every key
    expect(NoteStore.getVersionForKey(K)).not.toBe(ka);
  });
});
