import { describe, it, expect } from 'vitest';
import { snippet, highlightSpans, matchExcerpt } from './snippet.js';

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

describe('matchExcerpt — where a search hit LANDS in its letter', () => {
  const text = 'In the beginning was the Word. And the still small voice spoke to him in the cave. He listened.';
  it('starts AT the first matched term of the best window, not centred on it', () => {
    const ex = matchExcerpt(text, ['still', 'voice']);
    expect(ex.startsWith('still small voice')).toBe(true);
  });
  it('runs the asked length and no further', () => {
    expect(matchExcerpt(text, ['cave'], 12)).toBe('cave. He lis');
  });
  it('is empty when no term occurs (the letter opens at the top, as before)', () => {
    expect(matchExcerpt(text, ['zebra'])).toBe('');
    expect(matchExcerpt('', ['still'])).toBe('');
    expect(matchExcerpt(text, [])).toBe('');
  });
});

/* Whole words only (2026-09-22). The reader audit searched "love one another" at
   412 px and 1 John 4:7 came back marked "every[one]" and "Be[love]d", while the
   top snippet opened "…d... Understand Love." on half a word. The engine tokenises
   on word boundaries, so a hit inside another word is never what it matched on. */
describe('search results read as whole words', () => {
  const v147 = 'Beloved, let us love one another, for love is of God; and everyone who loves is born of God and knows God.';

  it('marks a term only where a word starts, and marks the whole word', () => {
    const hits = highlightSpans(v147, ['love', 'one', 'another']).filter((s) => s.hit).map((s) => s.text);
    expect(hits).toEqual(['love', 'one', 'another', 'love', 'loves']);
  });

  it('never marks inside another word', () => {
    const spans = highlightSpans('someone gone, done: the stone', ['one']);
    expect(spans).toEqual([{ text: 'someone gone, done: the stone', hit: false }]);
  });

  it('keeps an archaic variant and a capitalised word whole', () => {
    const hits = highlightSpans('Thou lovest righteousness; LORD, Thee I love', ['you', 'love', 'lord']).filter((s) => s.hit).map((s) => s.text);
    expect(hits).toEqual(['Thou', 'lovest', 'LORD', 'Thee', 'love']);
  });

  /** The snippet (without its … marks) is a run of whole words of `text`. */
  function wholeWords(text, out) {
    const core = out.replace(/^…/, '').replace(/…$/, '');
    const at = text.indexOf(core);
    expect(at, `snippet "${out}" is not a slice of the text`).toBeGreaterThan(-1);
    const W = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
    expect(W(text[at - 1]) && W(core[0]), `"${out}" opens inside a word`).toBe(false);
    expect(W(core[core.length - 1]) && W(text[at + core.length]), `"${out}" closes inside a word`).toBe(false);
    // and it opens ON a word, not on the punctuation the cut word left behind ("….. Understand")
    if (out.startsWith('…')) expect(W(core[0]) || /^["“‘(]/.test(core), `"${out}" opens on debris`).toBe(true);
  }

  it('never opens or closes on half a word, at any width', () => {
    const text = 'And now I will make you understand... Understand Love. For in My love were you created, To receive and to give; ' +
      'And in the giving does one also receive. Therefore, love one another As I have loved you, Says The Lord.';
    for (let maxLen = 40; maxLen <= 160; maxLen += 3) wholeWords(text, snippet(text, ['love', 'one', 'another'], maxLen));
  });

  it('still keeps the matched words inside the window', () => {
    const text = 'x'.repeat(30) + ' filler words here and there ' + 'Therefore, love one another As I have loved you' + ' more words follow here'.repeat(4);
    const out = snippet(text, ['love', 'one', 'another'], 70);
    expect(out).toContain('love one another');
  });
});
