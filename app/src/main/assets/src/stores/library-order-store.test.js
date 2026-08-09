/* LibraryOrderStore — schema-tolerant merge on read.
   ───────────────────────────────────────────────────────────────
   get() must (a) keep a user's custom arrangement when the default
   tile set GROWS (a saved order from before a new tile shipped keeps
   its order, new tiles appended — proven twice now: the 'progress'
   tile, then the 'audio'+'milestones' pair on 2026-08-09), and (b)
   keep it just as intact when the set SHRINKS — a saved id that is
   no longer a default tile is dropped in place instead of rejecting
   the whole save. Per [[user-data-paramount]] a schema change must
   never cost a user their arrangement, and that includes the
   removal direction and the foreign ids an import payload can carry.
   Only a value that isn't an array of strings falls back wholesale. */

import { describe, it, expect, beforeEach } from 'vitest';
import { LibraryOrderStore, DEFAULT_LIBRARY_ORDER } from './library-order-store.js';

beforeEach(() => {
  localStorage.clear();
  LibraryOrderStore._resetForTests({ forceLoaded: true });
});

describe('LibraryOrderStore — DEFAULT_LIBRARY_ORDER constant', () => {
  it('is frozen and carries the 7 canonical tile ids', () => {
    expect(Object.isFrozen(DEFAULT_LIBRARY_ORDER)).toBe(true);
    expect(new Set(DEFAULT_LIBRARY_ORDER)).toEqual(new Set([
      'notes', 'links', 'journal', 'bookmarks', 'highlights', 'progress',
      'milestones',
    ]));
  });
});

describe('LibraryOrderStore — get() schema merge', () => {
  it('returns DEFAULT_LIBRARY_ORDER when no saved data exists', () => {
    expect(LibraryOrderStore.get()).toEqual([...DEFAULT_LIBRARY_ORDER]);
  });

  it('returns a full valid permutation as-is', () => {
    const custom = ['milestones', 'progress', 'highlights', 'bookmarks', 'journal', 'links', 'notes'];
    LibraryOrderStore.set(custom);
    expect(LibraryOrderStore.get()).toEqual(custom);
  });

  it('MIGRATES a pre-audio/milestones 6-tile save: order kept, new tiles appended', () => {
    // The exact shape every install from before 2026-08-09 has on disk.
    /** @type {any} */ (LibraryOrderStore)._cache =
      ['highlights', 'notes', 'links', 'journal', 'bookmarks', 'progress'];
    expect(LibraryOrderStore.get()).toEqual(
      ['highlights', 'notes', 'links', 'journal', 'bookmarks', 'progress', 'milestones']);
  });

  it('MIGRATES the older pre-progress 5-tile save the same way', () => {
    /** @type {any} */ (LibraryOrderStore)._cache =
      ['highlights', 'notes', 'links', 'journal', 'bookmarks'];
    expect(LibraryOrderStore.get()).toEqual(
      ['highlights', 'notes', 'links', 'journal', 'bookmarks', 'progress', 'milestones']);
  });

  it('SHRINKS: a retired id is dropped in place, the rest of the arrangement survives', () => {
    // The shape every install has on the day a tile is REMOVED — the
    // saved order still names it. The other eight keep their custom
    // arrangement and nothing is appended.
    /** @type {any} */ (LibraryOrderStore)._cache =
      ['milestones', 'audio', 'retired-tile', 'progress', 'highlights', 'bookmarks', 'journal', 'links', 'notes'];
    expect(LibraryOrderStore.get()).toEqual(
      ['milestones', 'progress', 'highlights', 'bookmarks', 'journal', 'links', 'notes']);
  });

  it('drops a foreign id from an import payload the same way', () => {
    /** @type {any} */ (LibraryOrderStore)._cache =
      ['highlights', 'foreign-id', 'notes'];
    expect(LibraryOrderStore.get()).toEqual(
      ['highlights', 'notes', 'links', 'journal', 'bookmarks', 'progress', 'milestones']);
  });

  it('returns the full default order for an empty save, and falls back when it is not an array', () => {
    /** @type {any} */ (LibraryOrderStore)._cache = [];
    expect(LibraryOrderStore.get()).toEqual([...DEFAULT_LIBRARY_ORDER]);
    /** @type {any} */ (LibraryOrderStore)._cache = { not: 'an array' };
    expect(LibraryOrderStore.get()).toEqual([...DEFAULT_LIBRARY_ORDER]);
  });

  it('falls back to DEFAULT when the saved array holds non-strings', () => {
    /** @type {any} */ (LibraryOrderStore)._cache = ['notes', 7, 'journal'];
    expect(LibraryOrderStore.get()).toEqual([...DEFAULT_LIBRARY_ORDER]);
    /** @type {any} */ (LibraryOrderStore)._cache = [{ id: 'notes' }, null];
    expect(LibraryOrderStore.get()).toEqual([...DEFAULT_LIBRARY_ORDER]);
  });

  it('dedupes a corrupted save and restores the missing ids at the end', () => {
    /** @type {any} */ (LibraryOrderStore)._cache =
      ['notes', 'notes', 'journal'];
    expect(LibraryOrderStore.get()).toEqual(
      ['notes', 'journal', 'links', 'bookmarks', 'highlights', 'progress', 'milestones']);
  });
});

describe('LibraryOrderStore — set()', () => {
  it('persists a defensive COPY of the caller array', () => {
    const input = ['progress', 'notes', 'links', 'journal', 'bookmarks', 'highlights', 'milestones'];
    LibraryOrderStore.set(input);
    input.push('smuggled');
    expect(LibraryOrderStore.get()).toEqual(
      ['progress', 'notes', 'links', 'journal', 'bookmarks', 'highlights', 'milestones']);
  });
});
