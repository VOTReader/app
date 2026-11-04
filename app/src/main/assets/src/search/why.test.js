/* WHY THIS MATCHED (search200 ideas E, PICKS.md E; h8 2026-11-04): the one reason a result card gives when the words
   typed did not find it as typed, read off the card's own text and the words it marks when it renders (snippet.js
   whyMatched), never in the search. Priority: one of His names ("YahuShua = Jesus"), then a word swapped ("shepherd →
   pastor": a synonym or a word form), then the verse's KJV wording, then the meaning model. A text holding every typed
   content word as typed gives none. The real synonym table (search-data.js: pastor is shepherd's). */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { whyMatched } from './snippet.js';

/** His other names, as engine.js NAME_FORMS gives them (a few). @type {Record<string, string[]>} */
const NAMES = { jesus: ['yahushua'], yahushua: ['jesus'], yeshua: ['yahushua', 'jesus'], christ: ['hamashiach', 'mashiach'] };
const names = (/** @type {string} */ w) => NAMES[w] || [];

describe('whyMatched: why a card is there', () => {
  /** @type {any} */ let prev;
  /** @type {any} */ let REAL;
  beforeAll(async () => {
    prev = window.VotSearchData;
    // @ts-ignore -- a classic script: it sets window.VotSearchData
    await import('../../search-data.js');
    REAL = window.VotSearchData;
  });
  beforeEach(() => { window.VotSearchData = REAL; });
  afterEach(() => { window.VotSearchData = prev; });
  afterAll(() => { window.VotSearchData = prev; });

  it('none for a text holding every typed word as typed, a longer word one starts or its archaic twin', () => {
    expect(whyMatched('Jesus wept.', ['jesus', 'wept'], ['jesus', 'wept'], { names, meaning: true, kjv: true })).toBe(null);
    expect(whyMatched('For God so loved the world', ['love', 'world'], ['love', 'world'], { names })).toBe(null);
    expect(whyMatched('I will never leave thee', ['you', 'leave'], ['you', 'leave'], { names })).toBe(null);
    // a word the reader misspelled and search corrected counts as typed
    expect(whyMatched('Hear, O Israel', ['isreal', 'israel'], ['isreal'], { names })).toBe(null);
  });

  it('none when no content word was typed, or no text', () => {
    expect(whyMatched('anything at all', [], [], { names, meaning: true })).toBe(null);
    expect(whyMatched('', ['shepherd'], ['shepherd'], { names })).toBe(null);
  });

  it('a typed name the text holds as another of His names says so first, as the text writes it', () => {
    const t = 'YahuShua wept at the grave, and the Jews were weeping.';
    expect(whyMatched(t, ['jesus', 'wept', 'yahushua'], ['jesus', 'wept'], { names, kjv: true, meaning: true }))
      .toEqual({ kind: 'name', from: 'jesus', to: 'YahuShua' });
    // even when the card's terms lack the name: His names for the typed word are looked for in the text
    expect(whyMatched(t, ['jesus', 'wept'], ['jesus', 'wept'], { names })).toEqual({ kind: 'name', from: 'jesus', to: 'YahuShua' });
    // a name the text holds whose own names hold the typed one ("Jesus" for a typed yeshua is NAMES.yeshua's too)
    expect(whyMatched('Jesus wept.', ['yeshua', 'wept', 'jesus'], ['yeshua', 'wept'], { names })).toEqual({ kind: 'name', from: 'yeshua', to: 'Jesus' });
  });

  it('then a word swapped (a synonym, a word form) for the first typed word the text does not hold', () => {
    expect(whyMatched('I will give you pastors according to My heart', ['shepherd', 'pastor'], ['shepherd', 'pastor'], { names, kjv: true, meaning: true }))
      .toEqual({ kind: 'swap', from: 'shepherd', to: 'pastor' });
    expect(whyMatched('And the women were weeping at the tomb.', ['wept', 'weeping'], ['wept'], { names }))
      .toEqual({ kind: 'swap', from: 'wept', to: 'weeping' });
    // two typed words, the text holding the first: the swap is the second's
    expect(whyMatched('The good shepherd gathers the sheep', ['shepherd', 'flock', 'sheep'], ['shepherd', 'flock'], { names }))
      .toEqual({ kind: 'swap', from: 'flock', to: 'sheep' });
  });

  it('a related word for a typed word the text holds as typed explains nothing', () => {
    expect(whyMatched('The shepherd and the pastor', ['shepherd', 'pastor'], ['shepherd', 'pastor'], { names, meaning: true })).toBe(null);
  });

  it('then the KJV wording, then the meaning; else none (a text holding some of the words)', () => {
    expect(whyMatched('He will feed His flock', ['shepherd', 'flock'], ['shepherd', 'flock'], { names, kjv: true, meaning: true })).toEqual({ kind: 'kjv' });
    expect(whyMatched('He will feed His flock', ['shepherd', 'flock'], ['shepherd', 'flock'], { names, meaning: true })).toEqual({ kind: 'meaning' });
    expect(whyMatched('He will feed His flock', ['shepherd', 'flock'], ['shepherd', 'flock'], { names })).toBe(null);
  });

  it('a phrase in the typed list is not a word to hold; its words are', () => {
    expect(whyMatched('Jesus wept.', ['jesus wept', 'jesus', 'wept'], ['jesus wept', 'jesus', 'wept'], { names, meaning: true })).toBe(null);
  });

  it('reads without a names list (no name kind then)', () => {
    expect(whyMatched('YahuShua wept.', ['jesus', 'wept'], ['jesus', 'wept'], { meaning: true })).toEqual({ kind: 'meaning' });
  });
});
