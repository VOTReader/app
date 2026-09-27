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

describe('kjvEncode: numbers and KJV auxiliaries (search audit 2026-09-27)', () => {
  it('reads a number with thousands separators as one number, as a reader types it', () => {
    expect(kjvEncode('the 144,000 sealed')).toEqual(['the', '144000', 'sealed']);
    expect(kjvEncode('1,000,000 men')).toEqual(['1000000', 'men']);
  });

  it('leaves a comma that is not a thousands separator alone', () => {
    expect(kjvEncode('verses 16,17 and 1,2345')).toEqual(['verses', '16', '17', 'and', '1', '2345']);
  });

  it('folds the archaic auxiliaries to their one modern form, so KJV wording lines up with the NKJV', () => {
    expect(kjvEncode('Thou shalt not kill')).toEqual(['you', 'shall', 'not', 'kill']);
    expect(kjvEncode('the LORD hath spoken; doth he not')).toEqual(['the', 'lord', 'has', 'spoken', 'does', 'he', 'not']);
    expect(kjvEncode('wilt thou, hast thou, dost thou, didst thou, canst thou'))
      .toEqual(['will', 'you', 'have', 'you', 'do', 'you', 'did', 'you', 'can', 'you']);
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
