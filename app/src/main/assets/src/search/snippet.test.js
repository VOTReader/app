import { describe, it, expect } from 'vitest';
import { snippet, highlightSpans } from './snippet.js';

describe('snippet', () => {
  it('returns short text unchanged when no terms', () => {
    expect(snippet('short text', [])).toBe('short text');
  });

  it('truncates long text with an ellipsis when no terms', () => {
    const out = snippet('abcdefghij', [], 5);
    expect(out).toBe('abcde…');
  });

  it('centers on the matched term with ellipses', () => {
    const text = 'A'.repeat(100) + ' shepherd ' + 'B'.repeat(100);
    const out = snippet(text, ['shepherd'], 60);
    expect(out).toContain('shepherd');
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
  });

  it('centers on the densest cluster of query terms, not the first stray hit', () => {
    const early = 'beloved beloved beloved beloved beloved. '; // "beloved" alone, early
    const cluster = 'Now I call my beloved ones to come. ';     // call + beloved + ones together
    const text = early + 'x'.repeat(40) + cluster + 'y'.repeat(60);
    const out = snippet(text, ['call', 'beloved', 'ones'], 80);
    // The window with all three terms (the cluster) wins over the lone early "beloved".
    expect(out).toContain('call');
    expect(out).toContain('ones');
  });

  it('is archaic-aware (a "you" query centers on "thou")', () => {
    expect(snippet('Thou art holy', ['you'])).toBe('Thou art holy');
  });

  it('falls back to truncation when no term is found', () => {
    const out = snippet('xxxxxxxxxxxxxxxx', ['zzz'], 8);
    expect(out).toBe('xxxxxxxx…');
  });

  it('handles empty text', () => {
    expect(snippet('', ['x'])).toBe('');
  });
});

describe('highlightSpans', () => {
  it('splits into hit / non-hit spans', () => {
    const spans = highlightSpans('the LORD is good', ['lord']);
    expect(spans).toEqual([
      { text: 'the ', hit: false },
      { text: 'LORD', hit: true },
      { text: ' is good', hit: false },
    ]);
  });

  it('returns a single non-hit span when no terms', () => {
    expect(highlightSpans('plain text', [])).toEqual([{ text: 'plain text', hit: false }]);
  });

  it('highlights archaic variants of a modern query term', () => {
    const spans = highlightSpans('thou art mine', ['you']);
    expect(spans.some((s) => s.hit && s.text === 'thou')).toBe(true);
  });

  it('ignores sub-2-char terms', () => {
    expect(highlightSpans('a a a', ['a'])).toEqual([{ text: 'a a a', hit: false }]);
  });

  it('is regex-escape safe (special chars do not throw)', () => {
    const spans = highlightSpans('a.b c', ['a.b']);
    expect(spans.some((s) => s.hit && s.text === 'a.b')).toBe(true);
  });

  it('handles empty text', () => {
    expect(highlightSpans('', ['x'])).toEqual([{ text: '', hit: false }]);
  });
});
