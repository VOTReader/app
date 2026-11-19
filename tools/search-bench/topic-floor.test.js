/**
 * tools/search-bench/topic-floor.test.js — tests for the pure core of
 * tools/search-bench/topic-floor.mjs (plain, floorTable).
 *
 * The script itself is a minutes-scale analysis run over the real corpus
 * (one 6000-result search per question-shaped case), so it is not run
 * here: importing it proves the main-guard (the import returns at once,
 * the engine never starts), and the extracted pure helpers carry the
 * assertions.
 */

import { describe, it, expect } from 'vitest';
import { plain, floorTable } from './topic-floor.mjs';

describe('plain', () => {
  it('lowercases, strips diacritics and apostrophes, and pads with spaces', () => {
    expect(plain("YahuShua's Word")).toBe(' yahushuas word ');
    expect(plain('Émile — “quoted”')).toBe(' emile quoted ');
    expect(plain('  A   B  ')).toBe(' a b ');
  });
  it('an empty string is just the padding', () => {
    expect(plain('')).toBe('  ');
    expect(plain(null)).toBe('  ');
  });
});

describe('floorTable', () => {
  const withCand = [
    { cand: { meaning: 0.9 }, right: true },
    { cand: { meaning: 0.75 }, right: false },
    { cand: { meaning: 0.6 }, right: true },
  ];
  it('one row per floor from 0.700 to 0.850', () => {
    expect(floorTable(withCand)).toHaveLength(31);
  });
  it('shows what is at or above the floor, and splits right from wrong', () => {
    const rows = floorTable(withCand);
    expect(rows[0]).toEqual({ floor: 0.7, shown: 2, right: 1, wrong: 1 });
    expect(rows[11]).toEqual({ floor: 0.755, shown: 1, right: 1, wrong: 0 });
    expect(rows[30]).toEqual({ floor: 0.85, shown: 1, right: 1, wrong: 0 });
  });
  it('no candidates, no rows shown', () => {
    expect(floorTable([]).every((r) => r.shown === 0 && r.right === 0 && r.wrong === 0)).toBe(true);
  });
});

describe('main-guard', () => {
  it('importing the module does not start the analysis run', () => {
    expect(typeof plain).toBe('function');
    expect(typeof floorTable).toBe('function');
  });
});
