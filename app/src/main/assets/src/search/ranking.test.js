import { describe, it, expect } from 'vitest';
import { KIND_BOOST, coverageMultiplier, popcount, phraseTokenMatch, PHRASE_BOOST, SYNONYM_DEMOTION } from './ranking.js';
import { kjvEncode } from './tokenize.js';

describe('KIND_BOOST', () => {
  it('weights verse and letter equally, demotes bible-study', () => {
    expect(KIND_BOOST.verse).toBe(1.0);
    expect(KIND_BOOST.letter).toBe(1.0);
    expect(KIND_BOOST.wtlb).toBe(1.0);
    expect(KIND_BOOST['holy-day']).toBe(1.0);
    expect(KIND_BOOST['bible-study']).toBe(0.8);
  });

  it('does NOT contain excluded kinds (footnote/heading/chapter-title/study-note/cross-ref)', () => {
    for (const k of ['footnote', 'heading', 'chapter-title', 'study-note', 'cross-ref', 'letter-title']) {
      expect(KIND_BOOST[k]).toBeUndefined();
    }
  });
});

describe('coverageMultiplier', () => {
  it('is 1× for a single matched term, then escalates gently', () => {
    expect(coverageMultiplier(1)).toBe(1);
    expect(coverageMultiplier(2)).toBe(3);
    expect(coverageMultiplier(3)).toBe(5);
    expect(coverageMultiplier(4)).toBe(7);
  });
});

describe('popcount', () => {
  it('counts set bits', () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(0b1)).toBe(1);
    expect(popcount(0b101)).toBe(2);
    expect(popcount(0b1111)).toBe(4);
  });
});

describe('constants', () => {
  it('exposes the phrase boost and synonym demotion factors', () => {
    expect(PHRASE_BOOST).toBe(6);
    expect(SYNONYM_DEMOTION).toBe(0.5);
  });
});

describe('phraseTokenMatch', () => {
  it('matches a contiguous token run', () => {
    expect(phraseTokenMatch('The Lord is my shepherd', kjvEncode('lord is my'))).toBe(true);
  });

  it('is punctuation-immune', () => {
    expect(phraseTokenMatch('Be still, and know that I am God', kjvEncode('be still and know'))).toBe(true);
  });

  it('is archaic-immune (thou art ↔ you art)', () => {
    expect(phraseTokenMatch('Thou art holy', kjvEncode('you art'))).toBe(true);
  });

  it('rejects a scattered (non-contiguous) match', () => {
    expect(phraseTokenMatch('lord of the shepherd flock', kjvEncode('lord shepherd'))).toBe(false);
  });

  it('returns false for <2 query tokens or oversized query', () => {
    expect(phraseTokenMatch('hello world', kjvEncode('hello'))).toBe(false);
    expect(phraseTokenMatch('short', kjvEncode('a much longer query here'))).toBe(false);
    expect(phraseTokenMatch('', kjvEncode('a b'))).toBe(false);
  });
});
