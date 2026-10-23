/* EXACT AND RELATED MARKS (search200 ideas D, 2026-10-22). A card and the reader's find bar marked every word the
   search matched alike: "Jesus wept" washed "YahuShua" and "weeping" exactly as it washed the words typed, so a
   reader could not tell the words they typed from the ones search brought in for them. A mark now says which it is:
   the typed word itself (or a longer word it starts, "loves" for a typed "love"; an archaic twin, "thou" for "you")
   is exact; a word form ("weeping" for "wept"), a synonym ("pastor" for "shepherd") or one of His names
   ("YahuShua" for "Jesus") is related (`rel`), which the screen marks with a dotted underline and no wash. Two
   marks of different kinds never join into one run. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { highlightSpans, findPlaces } from './snippet.js';

describe('search200 ideas D: a mark says whether it is the typed word or a related one', () => {
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
  /** @param {string} t @param {string[]} terms @param {string[]} [typed] */
  const marks = (t, terms, typed) => highlightSpans(t, terms, typed).filter((s) => s.hit).map((s) => (s.rel ? '~' : '') + s.text);

  it('the typed words are exact; His name, a word form and a synonym are related', () => {
    const t = 'Jesus wept. Then YahuShua wept, and the Jews were weeping.';
    expect(marks(t, ['jesus', 'wept', 'yahushua', 'weeping'], ['jesus', 'wept'])).toEqual(['Jesus wept', '~YahuShua', 'wept', '~weeping']);
    // the screen hands the typed word with its synonyms after it (expandSnippetTerms): "pastor" is shepherd's
    expect(marks('I will give you pastors according to My heart', ['shepherd', 'pastor'], ['shepherd', 'pastor'])).toEqual(['~pastors']);
  });

  it('a longer word the typed word starts and an archaic twin stay exact', () => {
    expect(marks('He loves them', ['love'], ['love'])).toEqual(['loves']);
    expect(marks('thou art mine', ['you', 'mine'], ['you', 'mine'])).toEqual(['thou', 'mine']);
    // the word a typed slip meant is the word typed, but a form one letter off a short word is a form
    expect(marks('He who keeps Israel', ['keeps', 'isreal', 'israel'], ['keeps', 'isreal'])).toEqual(['keeps Israel']);
    expect(marks('they sang a song', ['sing', 'sang'], ['sing'])).toEqual(['~sang']);
    // and, on the find bar, a typed name the text writes with inner apostrophes
    expect(findPlaces('YHWH Tz’va’ot says', ['tzvaot'], 120, ['tzvaot']).map((p) => p.hits.map((h) => !!h.rel))).toEqual([[false]]);
  });

  it('an exact mark never joins a related one into one run; a small word joins either', () => {
    expect(marks('the good shepherd and pastor', ['shepherd', 'pastor', 'good'], ['good', 'shepherd', 'pastor'])).toEqual(['good shepherd', '~pastor']);
    // the engine's small word beside a typed word joins it, and beside a related one takes its kind
    expect(marks('those who mourn', ['mourn', 'who'], ['mourn'])).toEqual(['who mourn']);
    expect(marks('those who mourned', ['mourn', 'mourned', 'who'], ['mourn', 'mourned'])).toEqual(['who mourned']);
    expect(marks('those who wept', ['weep', 'wept', 'who'], ['weep'])).toEqual(['~who wept']);
  });

  it('a card with no typed list reads its terms as typed, as before', () => {
    expect(highlightSpans('the LORD is good', ['lord'])).toEqual([
      { text: 'the ', hit: false },
      { text: 'LORD', hit: true },
      { text: ' is good', hit: false },
    ]);
  });

  it('the find bar\'s places say which of their hits are related, when it knows the typed words', () => {
    const t = 'Jesus wept. ' + 'word '.repeat(40) + 'And they were weeping. ' + 'word '.repeat(40) + 'YahuShua wept again.';
    const places = findPlaces(t, ['jesus', 'wept', 'yahushua', 'weeping'], 120, ['jesus', 'wept']);
    const kinds = places.map((p) => p.hits.map((h) => (h.rel ? '~' : '') + t.slice(h.idx, h.idx + h.len)));
    // (two words typed: a place holding as many of them as the best place does; findPlaces keep)
    expect(kinds).toEqual([['Jesus', 'wept'], ['~YahuShua', 'wept']]);
    const one = 'He wept. ' + 'word '.repeat(40) + 'And they were weeping.';
    expect(findPlaces(one, ['wept', 'weeping'], 120, ['wept']).map((p) => p.hits.map((h) => !!h.rel))).toEqual([[false], [true]]);
    // without the typed words, no hit says it is related
    expect(findPlaces(t, ['jesus', 'wept', 'yahushua', 'weeping'], 120).every((p) => p.hits.every((h) => !('rel' in h)))).toBe(true);
  });
});
