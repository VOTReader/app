import { describe, it, expect } from 'vitest';
import { snapRangeToWords } from './annotation-engine.jsx';
import { resolveAnchor } from './anchor-resolve.js';
import { isWordChar, isLetterOrDigit } from './word-char.js';

// heart-1 + i18n-text-n1 (audit 2026-11-23 #5): ASCII \w trimmed accented letters off saved marks,
// and re-anchoring in another translation matched inside other words.
const RVR_316 = 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.';

const sel = (text, word) => { const i = text.indexOf(word); return snapRangeToWords(text, i, i + word.length); };
const pick = (text, r) => text.slice(r.start, r.end);

describe('word-char predicate (heart-1)', () => {
  it('reads accented, Hebrew and ligature letters as word chars', () => {
    for (const c of ['ó', 'é', 'Æ', 'ñ', 'ש', '\u05B8', '7', '’', "'", '-', '_']) expect(isWordChar(c)).toBe(true);
    for (const c of [' ', ',', '.', '¹', '⁶', '“', '']) expect(isWordChar(c)).toBe(false);
  });
  it('isLetterOrDigit leaves out apostrophes and hyphens', () => {
    expect(isLetterOrDigit('é')).toBe(true);
    expect(isLetterOrDigit('’')).toBe(false);
    expect(isLetterOrDigit('-')).toBe(false);
  });
});

describe('snapRangeToWords keeps accented words whole (heart-1)', () => {
  it('"amó" saves as amó, not am', () => { expect(pick(RVR_316, sel(RVR_316, 'amó'))).toBe('amó'); });
  it('"él" saves as él, not l', () => { expect(pick(RVR_316, sel(RVR_316, 'él'))).toBe('él'); });
  it('a drag ending mid-word widens through the accent ("unigé" -> unigénito)', () => {
    const i = RVR_316.indexOf('unigé');
    expect(pick(RVR_316, snapRangeToWords(RVR_316, i + 2, i + 5))).toBe('unigénito');
  });
  it('KJV "Ænon" stays whole', () => {
    const t = 'And John also was baptizing in Ænon near to Salim,';
    expect(pick(t, sel(t, 'Ænon'))).toBe('Ænon');
  });
  it('Hebrew snaps to the word, not to nothing', () => {
    const t = 'The Name שָׁלוֹם means peace.';
    const w = 'שָׁלוֹם';
    expect(pick(t, sel(t, w))).toBe(w);
  });
  it('a superscript verse number stays out of the mark ("¹⁶For" -> For)', () => {
    const t = '¹⁶For God so loved the world';
    expect(pick(t, snapRangeToWords(t, 0, 5))).toBe('For');
  });
});

describe('resolveAnchor needs a word boundary in tiers 2-3 (i18n-text-n1)', () => {
  it('tier 1 still keeps a mark whose own offsets match, so an old cut mark keeps painting where it was made', () => {
    expect(resolveAnchor(RVR_316, { start: 21, end: 23, text: 'am' })).toEqual({ start: 21, end: 23, exact: true });
  });
  it('a stored "the" does not land inside "there"', () => {
    expect(resolveAnchor('and there was light', { start: 0, end: 3, text: 'the' })).toBeNull();
  });
  it('a stored cut "l" does not paint inside "should"', () => {
    expect(resolveAnchor('whosoever believeth in him should not perish', { start: 101, end: 102, text: 'l' })).toBeNull();
  });
  it('a whole word still re-anchors, skipping an inside-word occurrence for a standalone one', () => {
    const t = 'there was the light';
    expect(resolveAnchor(t, { start: 1, end: 4, text: 'the' })).toEqual({ start: 10, end: 13, exact: true });
  });
  it('the loose tier also needs the boundary', () => {
    expect(resolveAnchor('Others, said He', { start: 0, end: 4, text: 'Oth' })).toBeNull();
    expect(resolveAnchor('the world, that he gave', { start: 0, end: 15, text: 'world that He' })).toEqual({ start: 4, end: 18, exact: false });
  });
  it('stored text that starts or ends on punctuation is not held to a boundary on that side', () => {
    expect(resolveAnchor('xx, said he', { start: 0, end: 4, text: ', said' })).toEqual({ start: 2, end: 8, exact: true });
  });
  it('accented neighbours count as letters ("l" inside "él" is not a word)', () => {
    expect(resolveAnchor('no l en él', { start: 8, end: 9, text: 'l' })).toEqual({ start: 3, end: 4, exact: true });
    expect(resolveAnchor('en él', { start: 0, end: 1, text: 'l' })).toBeNull();
  });
});
