/* lexicon.js (search200 B7): the packed form of a substitution lexicon, read both ways. Pure. */
import { describe, it, expect } from 'vitest';
import { formatLexicon, parseLexicon, lemmaSurfaces } from './lexicon.js';
import { lemma } from './passage.js';

describe('formatLexicon / parseLexicon', () => {
  it('a pair written once is read in both directions, at its credit', () => {
    const lex = parseLexicon(formatLexicon([['maker', 'creator', 0.7], ['broad', 'wid', 0.6]]));
    expect(lex.get('maker')?.get('creator')).toBe(0.7);
    expect(lex.get('creator')?.get('maker')).toBe(0.7);
    expect(lex.get('wid')?.get('broad')).toBe(0.6);
    expect(lex.get('broad')?.get('wid')).toBe(0.6);
  });

  it('writes each pair once, under the lemma that sorts first, partners sorted, credit as a last digit', () => {
    expect(formatLexicon([['tread', 'walk', 0.5], ['maker', 'creator', 0.7], ['maker', 'author', 0.6]]))
      .toBe('author maker6\ncreator maker7\ntread walk5');
  });

  it('a pair listed twice keeps its higher credit, and so does a pair two lexicons both hold', () => {
    expect(formatLexicon([['a', 'b', 0.5], ['b', 'a', 0.8]])).toBe('a b8');
    const lex = parseLexicon('a b5', 'a b7\nc d6');
    expect(lex.get('b')?.get('a')).toBe(0.7);
    expect(lex.get('d')?.get('c')).toBe(0.6);
  });

  it('credits round to a tenth inside 0.1..0.9 (a lexicon never gives the full credit of the word itself)', () => {
    expect(formatLexicon([['a', 'b', 1], ['c', 'd', 0.01], ['e', 'f', 0.64]])).toBe('a b9\nc d1\ne f6');
  });

  it('refuses a pair that is not two different words of plain letters', () => {
    expect(() => formatLexicon([['a', 'a', 0.5]])).toThrow(/bad pair/);
    expect(() => formatLexicon([['maker', 'creator2', 0.5]])).toThrow(/bad pair/);
    expect(() => formatLexicon([['Maker', 'creator', 0.5]])).toThrow(/bad pair/);
  });

  it('skips what it cannot read rather than inventing credits: nothing, a bare head, a partner with no digit', () => {
    expect(parseLexicon().size).toBe(0);
    expect(parseLexicon('', /** @type {any} */ (null)).size).toBe(0);
    const lex = parseLexicon('lone\nmaker creator creator0 author6');
    expect(lex.get('lone')).toBeUndefined();
    expect([...(lex.get('maker') || new Map()).keys()]).toEqual(['author']);
  });
});

describe('lemmaSurfaces', () => {
  it('the text words a lemma stands for: the word and its endings, each of whose lemma is that lemma', () => {
    const s = lemmaSurfaces('walk', lemma);
    for (const w of ['walk', 'walks', 'walked', 'walking', 'walketh']) expect(s).toContain(w);
    for (const w of s) expect(lemma(w)).toBe('walk');
  });
  it('a lemma that dropped its -e meets the word with it', () => {
    const s = lemmaSurfaces(lemma('wide'), lemma);
    expect(s).toContain('wide');
    for (const w of s) expect(lemma(w)).toBe(lemma('wide'));
  });
});
