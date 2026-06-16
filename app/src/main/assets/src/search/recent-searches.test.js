import { describe, it, expect, beforeEach } from 'vitest';
import { getRecentSearches, addRecentSearch, clearRecentSearches } from './recent-searches.js';

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
});
