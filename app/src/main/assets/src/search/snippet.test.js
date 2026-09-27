import { describe, it, expect } from 'vitest';
import { snippet, highlightSpans, matchExcerpt, morePlaces, findPlaces } from './snippet.js';

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

/* Every place a letter says the words (Brianna, 2026-09-26). "flood" showed
   Vengeance Is Mine's "a flooding rain" and never the "flood of judgment" further
   down the same letter; a card now lists the rest. The text below is that letter's
   shape: one early hit, then three late ones, two of them one line apart. */
describe('morePlaces — every other place a unit matches', () => {
  const pad = (n) => 'and the word went on. '.repeat(n);
  const TEXT = pad(3) + 'Behold, I shall bring upon them a flooding rain, a great deluge. ' + pad(300)
    + 'nor shall I flood the face of the earth in My anger, nor drown the nations in the depths of My sorrow. '
    + 'For that which I pour out shall not Be a flood of water which covers, But a flood of judgment to destroy, '
    + pad(3);

  it('lists the hits the snippet does not show, a line apart joined as one place, in reading order', () => {
    const places = morePlaces(TEXT, ['flood'], 120);
    expect(places.map((p) => TEXT.slice(p.start, p.start + 12))).toEqual(['flood the fa', 'flood of wat']);
    expect(places[0].clip).toContain('nor shall I flood the face');
    expect(places[1].clip).toContain('Be a flood of water which covers, But a flood of judgment');
  });

  it('never lists the hit the snippet already shows', () => {
    const shown = snippet(TEXT, ['flood'], 180);
    expect(shown).toContain('flooding rain');
    expect(morePlaces(TEXT, ['flood'], 120).some((p) => p.clip.includes('flooding rain'))).toBe(false);
  });

  it('counts a word and the longer forms the engine matched as ONE word', () => {
    // SrchCard highlights the query plus the engine's matched forms: flood + flooding.
    // Counted apart, the "flooding" hit was worth two words and every place holding
    // "flood" alone was filtered away as a partial match.
    const places = morePlaces(TEXT, ['flood', 'flooding'], 120);
    expect(places.map((p) => TEXT.slice(p.start, p.start + 5))).toEqual(['flood', 'flood']);
  });

  it('with two query words, keeps only the places that hold both', () => {
    const t = pad(3) + 'the flood came first. ' + pad(40) + 'a flood alone here. ' + pad(40)
      + 'a flood of judgment to destroy. ' + pad(40) + 'judgment alone. ' + pad(3);
    const places = morePlaces(t, ['flood', 'judgment'], 120);
    // the snippet shows the both-words window; nothing else holds both
    expect(snippet(t, ['flood', 'judgment'], 180)).toContain('flood of judgment');
    expect(places).toEqual([]);
  });

  it('counts an archaic form as its modern word ("thee" is "you")', () => {
    const t = pad(3) + 'I love you. ' + pad(40) + 'I have called thee by name. ' + pad(40) + 'you and thee both. ' + pad(3);
    const places = morePlaces(t, ['you'], 120);
    // one query word: every place is kept, whichever form it holds
    expect(places.map((p) => t.slice(p.start, p.start + 4))).toEqual(['thee', 'you ']);
  });

  it('returns nothing for no terms, no hits, or one hit', () => {
    expect(morePlaces(TEXT, [])).toEqual([]);
    expect(morePlaces(TEXT, ['zebra'])).toEqual([]);
    expect(morePlaces(pad(10) + 'one flood only. ' + pad(10), ['flood'])).toEqual([]);
  });

  it('starts every place on a word, so the landing excerpt reads from the hit', () => {
    for (const p of morePlaces(TEXT, ['flood'], 120)) {
      expect(TEXT.slice(p.start).startsWith('flood')).toBe(true);
    }
  });
});

describe('bestMatch counts word families, not highlight forms', () => {
  it('a longer matched form is not worth two words: the earliest window of the typed word wins', () => {
    const t = 'the flood rose. ' + 'and the word went on. '.repeat(20) + 'the flooding came, flooded and flooding. ';
    // Before: flood + flooding + flooded counted as three distinct terms, pulling the
    // snippet to the late cluster of longer forms and away from the plain word.
    expect(snippet(t, ['flood', 'flooding', 'flooded'], 60)).toContain('the flood rose');
  });
});

/* When the query's words never meet in a text, the passage worth showing is the
   one with the word that tells this text apart, not the first of a word it says
   everywhere (2026-09-26: "the lord is my shepherd" showed an Answers topic's
   first "Lord" and listed 23 more Lords, with its one "shepherd" nowhere). */
describe('the rarer word leads when the words never meet', () => {
  const pad = (n) => 'and the word went on. '.repeat(n);
  const TOPIC = pad(2) + 'the Lord spoke. ' + pad(20) + 'the Lord came. ' + pad(20) + 'the Lord is near. '
    + pad(20) + 'He is our shepherd and guide. ' + pad(20) + 'the Lord reigns. ' + pad(2);

  it('the snippet shows the rarer word', () => {
    expect(snippet(TOPIC, ['lord', 'shepherd'], 120)).toContain('our shepherd');
  });

  it('the other places are the rarer word\'s, not every "Lord"', () => {
    const two = TOPIC + pad(20) + 'The good shepherd knows His own. ' + pad(2);
    const places = morePlaces(two, ['lord', 'shepherd'], 120);
    expect(places.map((p) => two.slice(p.start, p.start + 8))).toEqual(['shepherd']);
    expect(places[0].clip).toContain('good shepherd knows');
  });

  it('a word said 500 times cannot crowd the rarer one out of the scan', () => {
    const t = 'Lord, '.repeat(500) + 'my shepherd. ' + pad(3);
    expect(snippet(t, ['lord', 'shepherd'], 120)).toContain('my shepherd');
  });

  it('where the words DO meet, that passage still wins over the rare word alone', () => {
    const t = pad(2) + 'a shepherd alone. ' + pad(20) + 'the Lord is my shepherd. ' + pad(20) + 'the Lord. ' + pad(2);
    expect(snippet(t, ['lord', 'shepherd'], 120)).toContain('the Lord is my shepherd');
  });
});

describe('findPlaces — every place, the snippet\'s own included, with its hits', () => {
  it('lists each place in reading order with the hits it marks', () => {
    const t = 'a flooding rain. ' + 'and the word went on. '.repeat(10) + 'Be a flood of water which covers, But a flood of judgment.';
    const places = findPlaces(t, ['flood', 'flooding'], 120);
    expect(places.map((p) => p.hits.map((h) => t.slice(h.idx, h.idx + h.len)))).toEqual([['flooding'], ['flood', 'flood']]);
    expect(t.slice(places[1].start).startsWith('flood of water')).toBe(true);
  });

  it('is empty for no hits', () => {
    expect(findPlaces('nothing here', ['flood'])).toEqual([]);
  });
});
