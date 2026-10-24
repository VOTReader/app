/* cutAtWord — previews cut between words, not inside one (s01.9, s14.6). */
import { describe, it, expect } from 'vitest';
import { cutAtWord } from './cut-at-word.js';

describe('cutAtWord', () => {
  it('leaves a text that fits alone', () => {
    expect(cutAtWord('In the beginning', 40)).toBe('In the beginning');
    expect(cutAtWord('', 10)).toBe('');
  });

  it('goes back to the last space rather than cut a word', () => {
    expect(cutAtWord('In the beginning God created the heavens', 24)).toBe('In the beginning God');
    expect(cutAtWord('In the beginning God created', 20)).toBe('In the beginning God');
  });

  it('a cut that already falls on a space keeps the whole word before it', () => {
    expect(cutAtWord('In the beginning God', 16)).toBe('In the beginning');
    expect(cutAtWord('In the beginning God', 17)).toBe('In the beginning');
  });

  it('drops a dangling comma or dash', () => {
    expect(cutAtWord('Grace, mercy, and peace from God', 13)).toBe('Grace, mercy');
    expect(cutAtWord('He said — then left the room', 9)).toBe('He said');
  });

  it('keeps the hard cut when no space is near (one long run)', () => {
    const url = 'https://thevolumesoftruth.com/a-very-long-path-without-spaces';
    expect(cutAtWord('See ' + url, 30)).toBe(('See ' + url).slice(0, 30));
  });

  it('never splits an emoji', () => {
    const t = 'ab😀cd';
    expect(cutAtWord(t, 3)).toBe('ab');
  });
});
