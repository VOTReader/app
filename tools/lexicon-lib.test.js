/* tools/lexicon-lib.mjs (search200 B7): what the lexicon builders share. Fixture verses, counts and links, the real
   lemma (search/passage.js). Pure: each case its own data. */
import { describe, it, expect } from 'vitest';
import { underOtherWord, swaps, movedIn, npmi, slipCredit, wordnetCredit, lexiconAsset } from './lexicon-lib.mjs';
import { lemma } from '../app/src/main/assets/src/search/passage.js';
import { parseLexicon } from '../app/src/main/assets/src/search/lexicon.js';

const vocabOf = (/** @type {Record<string, number>} */ o) => new Map(Object.entries(o));
const words = (/** @type {string} */ s) => s.split(' ');

describe('underOtherWord', () => {
  it('"not" keeps its lemma: note, said far less, is the word left out, in all its forms', () => {
    const v = vocabOf({ not: 1000, note: 10, notes: 5, noted: 2 });
    expect(lemma('note')).toBe(lemma('not'));
    expect(underOtherWord('not', v, lemma)).toBe(false);
    expect(underOtherWord('note', v, lemma)).toBe(true);
    expect(underOtherWord('notes', v, lemma)).toBe(true);
  });

  it('the word said more keeps the key whichever side it is on: care over car', () => {
    const v = vocabOf({ car: 3, care: 50, cares: 10, cared: 4 });
    expect(underOtherWord('care', v, lemma)).toBe(false);
    expect(underOtherWord('cares', v, lemma)).toBe(false);
    expect(underOtherWord('car', v, lemma)).toBe(true);
  });

  it('a lemma that stands for one word is no one\'s but its own', () => {
    const v = vocabOf({ walk: 30, walked: 9, wide: 12, wider: 2, maker: 40 });
    for (const w of ['walk', 'walked', 'wide', 'maker']) expect(underOtherWord(w, v, lemma)).toBe(false);
  });
});

describe('the translations\' slips: swaps between LCS anchors', () => {
  it('one word each side between two anchors is a swap, in each verse\'s order', () => {
    expect(swaps(words('and they were amazed at his teaching'), words('and they were astonished at his teaching')))
      .toEqual([['amazed', 'astonished']]);
    expect(swaps(words('give me the head on a platter'), words('give me the head on a dish'))).toEqual([['platter', 'dish']]);
  });

  it('two words for one, or a word only one verse has, is no swap', () => {
    expect(swaps(words('he went up into the mountain'), words('he went up on the mountain side'))).toEqual([['into', 'on']]);
    expect(swaps(words('he went into the high mountain'), words('he went up on the mountain'))).toEqual([]);
    expect(swaps(words('the lord is my shepherd'), words('the lord is my shepherd'))).toEqual([]);
  });

  it('a word the other verse says elsewhere moved; it was not traded', () => {
    const a = words('the children of israel went out with joy');
    const b = words('with joy the children of israel went forth');
    const moved = movedIn(a, b, lemma);
    expect(moved(lemma('out'), lemma('forth'))).toBe(false);
    expect(moved(lemma('joy'), lemma('forth'))).toBe(true);
    expect(moved(lemma('out'), lemma('children'))).toBe(true);
  });

  it('the credit runs 0.5..0.9 with how exclusively two words trade: NPMI 1 exclusive, none for chance or less', () => {
    expect(npmi(10, 10, 10, 1000)).toBeCloseTo(1, 10);
    expect(slipCredit(npmi(10, 10, 10, 1000))).toBe(0.9);
    expect(npmi(1, 10, 100, 1000)).toBeCloseTo(0, 10);
    expect(slipCredit(npmi(1, 10, 100, 1000))).toBe(null);
    expect(slipCredit(npmi(1, 100, 100, 1000))).toBe(null);
    expect(slipCredit(0.01)).toBe(0.5);
    expect(slipCredit(0.5)).toBe(0.7);
  });
});

describe('WordNet: a link\'s credit, close above loose', () => {
  it('one synset 0.7, a similar-to link 0.6, both among the two most frequent senses of both words', () => {
    expect(wordnetCredit('syn', 1, 2)).toBe(0.7);
    expect(wordnetCredit('sim', 2, 1)).toBe(0.6);
  });
  it('either through a less frequent sense 0.5', () => {
    expect(wordnetCredit('syn', 1, 3)).toBe(0.5);
    expect(wordnetCredit('sim', 4, 1)).toBe(0.5);
  });
  it('a kind of the other 0.5 among the most frequent senses, and nothing through a rarer one', () => {
    expect(wordnetCredit('hyp', 2, 1)).toBe(0.5);
    expect(wordnetCredit('hyp', 3, 1)).toBe(null);
  });
});

describe('lexiconAsset: the file the app loads', () => {
  it('names itself, carries its license whole, counts its pairs, and reads back as the lexicon written', () => {
    const packed = 'creator maker7\ntread walk5';
    const text = lexiconAsset({ name: 'fixture', about: 'a test', source: 'here', license: 'Line one.\nLine two.', generator: 'this test' }, packed);
    const j = JSON.parse(text);
    expect(j.name).toBe('fixture');
    expect(j.license).toBe('Line one.\nLine two.');
    expect(j.pairs).toBe(2);
    expect(parseLexicon(j.lexicon).get('maker')?.get('creator')).toBe(0.7);
    expect(text.endsWith('}\n')).toBe(true);
    expect(lexiconAsset(j, packed)).toBe(text);
  });
});
