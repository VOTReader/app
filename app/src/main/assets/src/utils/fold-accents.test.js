import { describe, it, expect } from 'vitest';
import { foldAccents, foldLower } from './fold-accents.js';

describe('foldAccents (heart-2)', () => {
  it('takes accents off and keeps the length', () => {
    for (const [a, b] of [['Jesús', 'Jesus'], ['unigénito', 'unigenito'], ['corazón', 'corazon'], ['ÉL', 'EL'], ['niño', 'nino']]) {
      expect(foldAccents(a)).toBe(b);
    }
  });
  it('keeps what has no one-unit base letter: Æ, a lone combining mark, Hebrew with points', () => {
    for (const s of ['Ænon', 'e\u0301', 'שָׁלוֹם', '¹⁶For', '“quote”', 'a😀b']) expect(foldAccents(s).length).toBe(s.length);
    expect(foldAccents('Ænon')).toBe('Ænon');
    expect(foldAccents('“quote”')).toBe('“quote”');
  });
  it('foldLower lowercases first', () => { expect(foldLower('Unigénito')).toBe('unigenito'); expect(foldLower(null)).toBe(''); });
});
