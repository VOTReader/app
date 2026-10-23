/* What a search that found nothing offers (search200 ideas G): fewer words, and the nearest texts above the floor. */
import { describe, it, expect } from 'vitest';
import { fewerWords, nearestShown, NEAREST_MEANING_FLOOR, NEAREST_SHOWN } from './srch-empty.js';

const STOP = new Set(['the', 'of', 'a', 'in', 'and']);
const isStop = (/** @type {string} */ w) => STOP.has(w);

describe('fewerWords', () => {
  it('keeps the content words some text holds', () => {
    const knows = (/** @type {string} */ w) => w !== 'photosynthesis';
    expect(fewerWords('the seven trumpets of the photosynthesis age', isStop, knows)).toBe('seven trumpets age');
  });
  it('takes the quote marks and + off, and drops a word ruled out', () => {
    expect(fewerWords('"seven trumpets" +angels -wrath', isStop, null)).toBe('seven trumpets angels');
    expect(fewerWords('“the seven trumpets”', isStop, null)).toBe('seven trumpets');
  });
  it('offers nothing when the trim leaves the query as it was, or leaves nothing', () => {
    expect(fewerWords('seven trumpets', isStop, null)).toBe('');
    expect(fewerWords('Seven, trumpets!', isStop, null)).toBe('');
    expect(fewerWords('photosynthesis', isStop, () => false)).toBe('');
    expect(fewerWords('the of a', isStop, null)).toBe('');
  });
  it('says a word once', () => {
    expect(fewerWords('trumpets the trumpets', isStop, null)).toBe('trumpets');
  });
});

describe('nearestShown', () => {
  it('shows the nearest at the floor or above, at most NEAREST_SHOWN', () => {
    const e = (/** @type {number} */ m) => ({ meaning: m, doc: {} });
    expect(nearestShown([e(NEAREST_MEANING_FLOOR + 0.1), e(NEAREST_MEANING_FLOOR), e(NEAREST_MEANING_FLOOR - 0.001)]).map((x) => x.meaning))
      .toEqual([NEAREST_MEANING_FLOOR + 0.1, NEAREST_MEANING_FLOOR]);
    expect(nearestShown(Array.from({ length: 6 }, () => e(0.99)))).toHaveLength(NEAREST_SHOWN);
    expect(nearestShown([{ doc: {} }, e(0.1)])).toEqual([]);
    expect(nearestShown(/** @type {any} */ (null))).toEqual([]);
  });
});
