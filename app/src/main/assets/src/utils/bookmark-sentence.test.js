// @ts-check
import { describe, it, expect } from 'vitest';
import { sentenceAround, isShortLabel } from './bookmark-sentence.js';

describe('bookmark-sentence (ideas audit A06.9)', () => {
  const text = 'He came at night. The word Christmas was never His day! Then He went on.';

  it('widens a word to the sentence that holds it, end mark included', () => {
    const at = text.indexOf('Christmas');
    const r = sentenceAround(text, at, at + 'Christmas'.length);
    expect(text.slice(r.start, r.end)).toBe('The word Christmas was never His day!');
  });

  it('stops at a line break as well as at . ! ?', () => {
    const t = 'A heading\nthe first line of the letter';
    const at = t.indexOf('first');
    const r = sentenceAround(t, at, at + 5);
    expect(t.slice(r.start, r.end)).toBe('the first line of the letter');
  });

  it('a text with no breaks gives the whole text, trimmed', () => {
    const t = '  only words here  ';
    const r = sentenceAround(t, 7, 12);
    expect(t.slice(r.start, r.end)).toBe('only words here');
  });

  it('isShortLabel: under four words is short', () => {
    expect(isShortLabel('Christmas')).toBe(true);
    expect(isShortLabel('the word Christmas')).toBe(true);
    expect(isShortLabel('the word Christmas was')).toBe(false);
    expect(isShortLabel('')).toBe(true);
  });
});
