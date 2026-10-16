import { describe, it, expect, beforeEach } from 'vitest';
import { getRecentSearches, addRecentSearch, removeRecentSearch, restoreRecentSearch, clearRecentSearches } from './recent-searches.js';

describe('recent-searches', () => {
  beforeEach(() => { localStorage.clear(); });

  it('starts empty', () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it('records most-recent-first', () => {
    addRecentSearch('mercy');
    addRecentSearch('grace');
    expect(getRecentSearches()).toEqual(['grace', 'mercy']);
  });

  it('dedups case-insensitively, moving the repeat to the front', () => {
    addRecentSearch('mercy');
    addRecentSearch('grace');
    addRecentSearch('MERCY');
    expect(getRecentSearches()).toEqual(['MERCY', 'grace']);
  });

  it('ignores blanks and single-character queries', () => {
    addRecentSearch('');
    addRecentSearch('  ');
    addRecentSearch('a');
    expect(getRecentSearches()).toEqual([]);
  });

  it('caps the list at 20', () => {
    for (let i = 0; i < 30; i++) addRecentSearch('query-' + i);
    const list = getRecentSearches();
    expect(list.length).toBe(20);
    expect(list[0]).toBe('query-29'); // newest first
  });

  it('clears', () => {
    addRecentSearch('mercy');
    expect(clearRecentSearches()).toEqual([]);
    expect(getRecentSearches()).toEqual([]);
  });

  it('survives malformed storage', () => {
    localStorage.setItem('vot-recent-searches', '{not json');
    expect(getRecentSearches()).toEqual([]);
  });
  /* W0 SEARCH-UI (micro-gap b) — per-recent removal backs the SearchScreen
     per-chip ✕ affordance (previously only the all-or-nothing "/clear history"
     command existed). Same case-insensitive identity as addRecentSearch's
     dedupe so "MERCY" removes "mercy". */
  it('removeRecentSearch drops one entry case-insensitively and returns the updated list', () => {
    addRecentSearch('mercy');
    addRecentSearch('grace');
    expect(removeRecentSearch('MERCY')).toEqual(['grace']);
    expect(getRecentSearches()).toEqual(['grace']);
  });

  it('removeRecentSearch is a no-op for an absent query', () => {
    addRecentSearch('mercy');
    expect(removeRecentSearch('zebra')).toEqual(['mercy']);
    expect(getRecentSearches()).toEqual(['mercy']);
  });

  it('removeRecentSearch tolerates blanks and an empty store', () => {
    expect(removeRecentSearch('')).toEqual([]);
    expect(removeRecentSearch('  ')).toEqual([]);
  });
  /* v2's Undo after a chip's x (zs26): the query goes back where it was, in the list as it is by then. */
  it('restoreRecentSearch puts a removed query back at its old place, deduped and capped', () => {
    addRecentSearch('mercy');
    addRecentSearch('grace');
    addRecentSearch('chosen');
    expect(removeRecentSearch('grace')).toEqual(['chosen', 'mercy']);
    expect(restoreRecentSearch('grace', 1)).toEqual(['chosen', 'grace', 'mercy']);
    expect(getRecentSearches()).toEqual(['chosen', 'grace', 'mercy']);
    // already back (or typed again since): moved, never twice; an index past the end goes last
    expect(restoreRecentSearch('GRACE', 9)).toEqual(['chosen', 'mercy', 'GRACE']);
    expect(restoreRecentSearch('x', 0)).toEqual(['chosen', 'mercy', 'GRACE']);
    for (let i = 0; i < 25; i++) addRecentSearch('q' + i);
    expect(restoreRecentSearch('mercy', 0)).toHaveLength(20);
    expect(getRecentSearches()[0]).toBe('mercy');
  });
});
