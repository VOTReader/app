/**
 * tools/search-bench/nearest-floor.test.js — tests for the pure core of
 * tools/search-bench/nearest-floor.mjs (quantile, floorTable).
 *
 * The script itself is a minutes-scale analysis run over the real corpus
 * and the on-device semantic model, so it is not run here: importing it
 * proves the main-guard (the import returns at once, the engine never
 * starts), and the extracted pure helpers carry the assertions.
 */

import { describe, it, expect } from 'vitest';
import { quantile, floorTable } from './nearest-floor.mjs';

describe('quantile', () => {
  const sorted = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  it('the value at index p*length, clamped to the last', () => {
    expect(quantile(sorted, 0)).toBe(0.1);
    expect(quantile(sorted, 0.1)).toBe(0.2);
    expect(quantile(sorted, 0.25)).toBe(0.3);
    expect(quantile(sorted, 0.5)).toBe(0.6);
    expect(quantile(sorted, 0.9)).toBe(1.0);
    expect(quantile(sorted, 1)).toBe(1.0);
  });
  it('an empty array has no quantile', () => {
    expect(quantile([], 0.5)).toBeUndefined();
  });
});

describe('floorTable', () => {
  // Values sit between floors, never on one: the 0.01-step accumulation
  // is float, and a hit exactly on a floor would make the count depend
  // on which side of the floor the accumulated double lands.
  const hits = [0.52, 0.67, 0.72, 0.77, 0.91];
  const guesses = [{ top: 0.57 }, { top: 0.83 }];
  it('one row per floor from 0.60 to 0.80', () => {
    expect(floorTable(hits, guesses)).toHaveLength(21);
  });
  it('keeps what is at or above the floor, on each side', () => {
    const rows = floorTable(hits, guesses);
    expect(rows[0]).toEqual({ floor: 0.6, rightKept: 4, rightTotal: 5, guessesKept: 1, guessTotal: 2 });
    expect(rows[5]).toEqual({ floor: 0.65, rightKept: 4, rightTotal: 5, guessesKept: 1, guessTotal: 2 });
    expect(rows[10]).toEqual({ floor: 0.7, rightKept: 3, rightTotal: 5, guessesKept: 1, guessTotal: 2 });
    expect(rows[20]).toEqual({ floor: 0.8, rightKept: 1, rightTotal: 5, guessesKept: 1, guessTotal: 2 });
  });
  it('empty sides stay empty', () => {
    expect(floorTable([], []).every((r) => r.rightKept === 0 && r.guessesKept === 0)).toBe(true);
  });
});

describe('main-guard', () => {
  it('importing the module does not start the analysis run', () => {
    expect(typeof quantile).toBe('function');
    expect(typeof floorTable).toBe('function');
  });
});
