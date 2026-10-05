import { describe, it, expect } from 'vitest';
import { lemma, bestWindow } from './passage.js';

const q = (words, syn = {}) => words.map(([w, weight]) => ({ lem: lemma(w), weight, syn: new Set((syn[w] || []).map(lemma)) }));
const text = (s) => s.toLowerCase().split(/\W+/).filter(Boolean).map(lemma);

describe('lemma: words only need to meet', () => {
  it('folds KJV endings, tense, number and the irregular forms', () => {
    expect(lemma('giveth')).toBe(lemma('give'));
    expect(lemma('cometh')).toBe(lemma('come'));
    expect(lemma('comes')).toBe(lemma('come'));
    expect(lemma('saith')).toBe(lemma('said'));
    expect(lemma('loved')).toBe(lemma('love'));
    expect(lemma('men')).toBe(lemma('man'));
    expect(lemma('heavens')).toBe(lemma('heaven'));
  });
  it('keeps words that only look inflected', () => {
    expect(lemma('glass')).toBe('glass');
    expect(lemma('jesus')).toBe('jesus');
    expect(lemma('harvest')).toBe('harvest');
  });
});

describe('bestWindow: the share of a query one passage holds', () => {
  const query = q([['lamb', 3], ['slain', 4], ['foundation', 2]]);
  it('is whole when one stretch holds every word', () => {
    expect(bestWindow(query, text('the Lamb slain from the foundation of the world'), 12)).toBe(1);
  });
  it('counts only one window: the same words scattered far apart hold less', () => {
    const far = text('the lamb ' + 'and so on '.repeat(40) + 'was slain ' + 'and so on '.repeat(40) + 'from the foundation');
    expect(bestWindow(query, far, 12)).toBeLessThan(0.6);
  });
  it('weighs rare words more, and a synonym half', () => {
    expect(bestWindow(query, text('the lamb was slain'), 12)).toBeCloseTo(7 / 9);
    const withSyn = q([['lamb', 3], ['slain', 4], ['foundation', 2]], { slain: ['killed'] });
    expect(bestWindow(withSyn, text('the lamb was killed from the foundation'), 12)).toBeCloseTo((3 + 2 + 2) / 9);
  });
  it('is 0 for an empty text or a weightless query', () => {
    expect(bestWindow(query, [], 12)).toBe(0);
    expect(bestWindow([], text('lamb'), 12)).toBe(0);
  });
});
