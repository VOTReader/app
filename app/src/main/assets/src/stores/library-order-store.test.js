/* LibraryOrderStore — growth-tolerant schema validation on read.
   ───────────────────────────────────────────────────────────────
   get() must (a) keep a user's custom arrangement when the default
   tile set GROWS (a saved order from before a new tile shipped keeps
   its order, new tiles appended — proven twice now: the 'progress'
   tile, then the 'audio'+'milestones' pair on 2026-08-09), while (b)
   still rejecting saves that carry foreign ids — the same
   import-payload safety HomeOrderStore enforces ([[user-data-paramount]]). */

import { describe, it, expect, beforeEach } from 'vitest';
import { LibraryOrderStore, DEFAULT_LIBRARY_ORDER } from './library-order-store.js';

beforeEach(() => {
  localStorage.clear();
  LibraryOrderStore._resetForTests({ forceLoaded: true });
});

describe('LibraryOrderStore — DEFAULT_LIBRARY_ORDER constant', () => {
  it('is frozen and carries the 8 canonical tile ids', () => {
    expect(Object.isFrozen(DEFAULT_LIBRARY_ORDER)).toBe(true);
    expect(new Set(DEFAULT_LIBRARY_ORDER)).toEqual(new Set([
      'notes', 'links', 'journal', 'bookmarks', 'highlights', 'progress',
      'audio', 'milestones',
    ]));
  });
});

describe('LibraryOrderStore — get() schema validation', () => {
  it('returns DEFAULT_LIBRARY_ORDER when no saved data exists', () => {
    expect(LibraryOrderStore.get()).toEqual([...DEFAULT_LIBRARY_ORDER]);
  });

  it('returns a full valid permutation as-is', () => {
    const custom = ['milestones', 'audio', 'progress', 'highlights', 'bookmarks', 'journal', 'links', 'notes'];
    LibraryOrderStore.set(custom);
    expect(LibraryOrderStore.get()).toEqual(custom);
  });

  it('MIGRATES a pre-audio/milestones 6-tile save: order kept, new tiles appended', () => {
    // The exact shape every install from before 2026-08-09 has on disk.
    /** @type {any} */ (LibraryOrderStore)._cache =
      ['highlights', 'notes', 'links', 'journal', 'bookmarks', 'progress'];
    expect(LibraryOrderStore.get()).toEqual(
      ['highlights', 'notes', 'links', 'journal', 'bookmarks', 'progress', 'audio', 'milestones']);
  });

  it('MIGRATES the older pre-progress 5-tile save the same way', () => {
    /** @type {any} */ (LibraryOrderStore)._cache =
      ['highlights', 'notes', 'links', 'journal', 'bookmarks'];
    expect(LibraryOrderStore.get()).toEqual(
      ['highlights', 'notes', 'links', 'journal', 'bookmarks', 'progress', 'audio', 'milestones']);
  });

  it('falls back to DEFAULT when the save carries a foreign id', () => {
    /** @type {any} */ (LibraryOrderStore)._cache =
      ['notes', 'links', 'journal', 'bookmarks', 'highlights', 'foreign-id'];
    expect(LibraryOrderStore.get()).toEqual([...DEFAULT_LIBRARY_ORDER]);
  });

  it('falls back to DEFAULT when the save is empty or not an array', () => {
    /** @type {any} */ (LibraryOrderStore)._cache = [];
    expect(LibraryOrderStore.get()).toEqual([...DEFAULT_LIBRARY_ORDER]);
    /** @type {any} */ (LibraryOrderStore)._cache = { not: 'an array' };
    expect(LibraryOrderStore.get()).toEqual([...DEFAULT_LIBRARY_ORDER]);
  });

  it('dedupes a corrupted save and restores the missing ids at the end', () => {
    /** @type {any} */ (LibraryOrderStore)._cache =
      ['notes', 'notes', 'journal'];
    expect(LibraryOrderStore.get()).toEqual(
      ['notes', 'journal', 'links', 'bookmarks', 'highlights', 'progress', 'audio', 'milestones']);
  });
});

describe('LibraryOrderStore — set()', () => {
  it('persists a defensive COPY of the caller array', () => {
    const input = ['progress', 'notes', 'links', 'journal', 'bookmarks', 'highlights', 'audio', 'milestones'];
    LibraryOrderStore.set(input);
    input.push('smuggled');
    expect(LibraryOrderStore.get()).toEqual(
      ['progress', 'notes', 'links', 'journal', 'bookmarks', 'highlights', 'audio', 'milestones']);
  });
});
