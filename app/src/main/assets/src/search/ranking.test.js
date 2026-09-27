import { describe, it, expect } from 'vitest';
import { KIND_BOOST, coverageMultiplier, popcount, phraseTokenMatch, PHRASE_BOOST, SYNONYM_DEMOTION, nearPhrase, titleMatch, TITLE_EXACT_BOOST, BM25_PARAMS } from './ranking.js';
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

/* Search audit 2026-09-27: the phrase ranking graded, and a title signal. */
describe('nearPhrase: how much of the typed phrase a text holds together', () => {
  const STOP = new Set(['the', 'of', 'and', 'my', 'a', 'to', 'shall', 'will', 'like']);
  const near = (text, q) => nearPhrase(kjvEncode(text), kjvEncode(q), STOP);

  it('is 1 for the phrase itself', () => {
    expect(near('The earth will grow old like a garment, and they shall be changed', 'the earth will grow old like a garment')).toBe(1);
  });

  it('keeps most of a phrase one word off, swapped or dropped', () => {
    const text = 'The earth will grow old like a garment';
    expect(near(text, 'the earth shall grow old like a garment')).toBeGreaterThan(0.6);   // will -> shall
    expect(near(text, 'the earth grow old like a garment')).toBeGreaterThan(0.6);          // a word dropped
  });

  it('is 0 for the same words scattered, and a pair of stop words counts for little', () => {
    expect(near('earth and more, grow and more, old and more, garment', 'earth grow old garment')).toBe(0);
    expect(near('of the of the of the', 'the power of the spirit')).toBeLessThan(0.2);
  });

  it('holds the pairs within one stretch: two halves far apart are not the phrase', () => {
    const far = 'the earth will grow ' + 'word '.repeat(50) + 'old like a garment';
    expect(near(far, 'the earth will grow old like a garment')).toBeLessThan(0.6);
  });
});

describe('titleMatch: a title typed whole ranks its unit first', () => {
  const tm = (title, q) => titleMatch(kjvEncode(title), kjvEncode(q));
  it('the title typed whole, a leading Regarding or The aside', () => {
    expect(tm('Wisdom', 'wisdom')).toBe(TITLE_EXACT_BOOST);
    expect(tm('Regarding Tithing', 'tithing')).toBe(TITLE_EXACT_BOOST);
    expect(tm('The Truth', 'the truth')).toBe(TITLE_EXACT_BOOST);
    expect(tm('Vengeance Is Mine, I Shall Repay', 'vengeance is mine i shall repay')).toBe(TITLE_EXACT_BOOST);
  });
  it('a title typed in part: by how much of the title the typed words are', () => {
    expect(tm('Vengeance Is Mine, I Shall Repay', 'vengeance is mine')).toBeCloseTo(2.5);   // half the title
    expect(tm('Regarding the Days of Noah', 'regarding the days')).toBeCloseTo(2.6);
  });
  it('a title misremembered by a word still counts, less', () => {
    const t = tm('Pride Goes Before a Fall', 'pride comes before a fall');
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(TITLE_EXACT_BOOST);
  });
  it('a title typed without its apostrophe is the title', () => {
    expect(tm('What\u2019s in a Name', 'whats in a name')).toBe(TITLE_EXACT_BOOST);
    expect(tm('The Dust Has Been Shaken Off the Feet of God\u2019s Messengers', 'the dust has been shaken off the feet of gods messengers')).toBe(TITLE_EXACT_BOOST);
  });
  it('1 for a passage that shares a few of the title\u2019s words', () => {
    expect(tm('The Resurrection and The Life', 'jesus said i am the resurrection and the life he that believeth')).toBe(1);
  });
  it('1 for a word the title merely holds, or none of it', () => {
    expect(tm('Vengeance Is Mine, I Shall Repay', 'mine')).toBe(1);
    expect(tm('The Wide Path', 'narrow gate')).toBe(1);
  });
});

describe('BM25_PARAMS', () => {
  it('is BM25 as published: no BM25+ floor paying long texts for every word they hold', () => {
    expect(BM25_PARAMS.d).toBe(0);
  });
});
