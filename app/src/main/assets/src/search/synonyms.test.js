import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { expandQueryTerms } from './synonyms.js';

const FIXTURE = {
  SYNONYM_MAP: {
    mercy: ['mercy', 'compassion', 'pity'],
    compassion: ['mercy', 'compassion', 'pity'],
    pity: ['mercy', 'compassion', 'pity'],
    love: ['love', 'charity', 'agape'],
    charity: ['love', 'charity', 'agape'],
    agape: ['love', 'charity', 'agape'],
  },
};

describe('expandQueryTerms', () => {
  let prev;
  beforeAll(() => { prev = window.VotSearchData; window.VotSearchData = FIXTURE; });
  afterAll(() => { window.VotSearchData = prev; });

  it('expands a term into literal + synonym units with shared origin', () => {
    const { units, didExpand } = expandQueryTerms(['mercy']);
    expect(didExpand).toBe(true);
    const literal = units.find((u) => u.literal);
    expect(literal.term).toBe('mercy');
    expect(literal.origin).toBe(0);
    const syns = units.filter((u) => !u.literal);
    expect(syns.map((u) => u.term)).toEqual(expect.arrayContaining(['compassion', 'pity']));
    expect(syns.every((u) => u.origin === 0)).toBe(true);
  });

  it('does not expand when disabled — literal only', () => {
    const { units, didExpand } = expandQueryTerms(['mercy'], { enabled: false });
    expect(didExpand).toBe(false);
    expect(units).toEqual([{ term: 'mercy', origin: 0, literal: true }]);
  });

  it('tracks distinct origins across multiple query terms', () => {
    const { units } = expandQueryTerms(['love', 'mercy']);
    const loveUnit = units.find((u) => u.term === 'love');
    const mercyUnit = units.find((u) => u.term === 'mercy');
    expect(loveUnit.origin).toBe(0);
    expect(mercyUnit.origin).toBe(1);
  });

  it('never emits a duplicate term', () => {
    const { units } = expandQueryTerms(['mercy', 'compassion']);
    const terms = units.map((u) => u.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('passes a no-synonym term through as a lone literal', () => {
    const { units, didExpand } = expandQueryTerms(['shepherd']);
    expect(didExpand).toBe(false);
    expect(units).toEqual([{ term: 'shepherd', origin: 0, literal: true }]);
  });
});
