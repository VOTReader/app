import { describe, it, expect } from 'vitest';
import { kjvEncode, expandArchaicTerms, ARCHAIC_NORMALIZE, ARCHAIC_EXPAND } from './tokenize.js';

describe('kjvEncode', () => {
  it('lowercases and splits on whitespace', () => {
    expect(kjvEncode('Hello World')).toEqual(['hello', 'world']);
  });

  it('strips punctuation to spaces (phrase stays tokenized)', () => {
    expect(kjvEncode('be still, and know!')).toEqual(['be', 'still', 'and', 'know']);
  });

  it('folds diacritics via NFD (SRCH-4)', () => {
    expect(kjvEncode('resurrección')).toEqual(['resurreccion']);
    expect(kjvEncode('Misérables')).toEqual(['miserables']);
  });

  it('normalizes archaic pronouns bidirectionally at token time', () => {
    expect(kjvEncode('thee thou ye')).toEqual(['you', 'you', 'you']);
    expect(kjvEncode('thy thine')).toEqual(['your', 'your']);
    expect(kjvEncode('thyself')).toEqual(['yourself']);
  });

  it('collapses whitespace runs and drops empties', () => {
    expect(kjvEncode('a   b\t\nc')).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for empty / non-string input', () => {
    expect(kjvEncode('')).toEqual([]);
    expect(kjvEncode(/** @type {any} */ (null))).toEqual([]);
    expect(kjvEncode(/** @type {any} */ (undefined))).toEqual([]);
    expect(kjvEncode(/** @type {any} */ (123))).toEqual([]);
  });

  it('keeps digits (verse-number tokens survive)', () => {
    expect(kjvEncode('psalm 23')).toEqual(['psalm', '23']);
  });
});

describe('ARCHAIC_NORMALIZE / ARCHAIC_EXPAND tables', () => {
  it('normalize maps the six archaic forms', () => {
    expect(ARCHAIC_NORMALIZE.thee).toBe('you');
    expect(ARCHAIC_NORMALIZE.thy).toBe('your');
    expect(ARCHAIC_NORMALIZE.thyself).toBe('yourself');
  });

  it('expand is bidirectional and includes siblings', () => {
    expect(ARCHAIC_EXPAND.you).toEqual(expect.arrayContaining(['you', 'thee', 'thou', 'ye']));
    expect(ARCHAIC_EXPAND.thee).toEqual(expect.arrayContaining(['thee', 'you', 'thou', 'ye']));
    expect(ARCHAIC_EXPAND.your).toEqual(expect.arrayContaining(['your', 'thy', 'thine']));
  });
});

describe('expandArchaicTerms', () => {
  it('expands modern → archaic forms', () => {
    const out = expandArchaicTerms(['you']);
    expect(out).toEqual(expect.arrayContaining(['you', 'thee', 'thou', 'ye']));
  });

  it('expands an archaic term → modern + siblings', () => {
    const out = expandArchaicTerms(['thee']);
    expect(out).toEqual(expect.arrayContaining(['thee', 'you', 'thou']));
  });

  it('passes non-archaic terms through unchanged', () => {
    expect(expandArchaicTerms(['shepherd'])).toEqual(['shepherd']);
  });

  it('dedups across multiple expanding terms', () => {
    const out = expandArchaicTerms(['thee', 'thou']); // both expand to overlapping sets
    expect(new Set(out).size).toBe(out.length);
  });

  it('handles empty input', () => {
    expect(expandArchaicTerms([])).toEqual([]);
    expect(expandArchaicTerms(/** @type {any} */ (null))).toEqual([]);
  });
});
