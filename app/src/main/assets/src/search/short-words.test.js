/* Short words, stop words and apostrophes match whole words (search audit 2026-09-27).
   A literal word was also searched as a prefix, so "a", "i", the "s" an apostrophe
   leaves of "Lord's", and stop words like "the" matched thousands of words, and the
   longest texts, holding all of them, outranked the verse: "a virgin shall conceive"
   put Isaiah 7:14 45th, "lord's supper" put topics highlighting "skillful" and
   "smoke" above 1 Corinthians 11:20. Fixture-deterministic: each long letter here
   wins only through the old prefix reach. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini, expandContractions } from './engine.js';
import { highlightSpans, findPlaces } from './snippet.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'do', 'shall', 'these', 'them', 'their']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { isaiah: 'isaiah', '1 corinthians': '1corinthians' }, BOOK_DISPLAY: { isaiah: 'Isaiah', '1corinthians': '1 Corinthians' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['isaiah'], NT_BOOK_IDS: ['1corinthians'], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const GLOBALS = {
  BOOKS: {
    isaiah: { id: 'isaiah', title: 'Isaiah', chapters: [{ num: 7, sections: [{ heading: '', verses: [{ n: 14, text: 'Behold, the virgin shall conceive and bear a Son.' }] }] }] },
    '1corinthians': { id: '1corinthians', title: '1 Corinthians', chapters: [{ num: 11, sections: [{ heading: '', verses: [{ n: 20, text: 'It is not to eat the Lord’s Supper.' }] }] }] },
  },
  LETTERS_V1: [
    // every word beginning with a, s, don…: what the old prefix reach found
    { id: 'long-a', num: 1, title: 'Many Things', blocks: [{ segments: [{ v: 'Authority ahead appointment amen abundant after again ancient answer. '.repeat(30) + 'Skillful smoke smell sweet savor, sons, servants, saints, the Lord and His supper. '.repeat(30) + 'The virgin will conceive.' }] }] },
    { id: 'look-back', num: 2, title: 'Look Not Behind', blocks: [{ segments: [{ v: 'Flee, and do not look back upon the city, in the year 16.' }] }] },
    { id: 'done', num: 3, title: 'Done', blocks: [{ segments: [{ v: 'Donkeys done, donations done; look back and look back and back.' }] }] },
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: short words and apostrophes', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await VotSearchMini.init();
  });
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('"a" is the word a, not every word beginning with a: Isaiah 7:14 first', async () => {
    expect(refs(await VotSearchMini.search('a virgin shall conceive'))[0]).toBe('Isaiah 7:14');
  });

  it('"lord’s" searches Lord, not Lord plus every word beginning with s', async () => {
    expect(refs(await VotSearchMini.search('lord’s supper'))[0]).toBe('1 Corinthians 11:20');
    expect(refs(await VotSearchMini.search("lord's supper"))[0]).toBe('1 Corinthians 11:20');
  });

  it('a negative contraction is its two words: "don’t look back" finds "do not look back"', async () => {
    expect(expandContractions('don’t look back')).toBe('do not look back');
    expect(expandContractions("won't, can't, shan't")).toBe('will not, cannot, shall not');
    expect(refs(await VotSearchMini.search('don’t look back'))[0]).toBe('Volume One · Letter 2');
  });

  it('a number is never "corrected" to another number', async () => {
    const r = await VotSearchMini.search('316');
    expect(r.corrections).toEqual([]);
  });

  it('a stop word the reader typed among real words is not a word the result marks', async () => {
    const r = await VotSearchMini.search('the virgin');
    const hit = r.results.find((x) => x.doc.ref === 'Isaiah 7:14');
    expect(hit.terms).not.toContain('the');
  });
});

describe('highlight and places: a short word or a stop word marks only itself', () => {
  let prev;
  beforeAll(() => { prev = window.VotSearchData; window.VotSearchData = VOT_DATA; });
  afterAll(() => { window.VotSearchData = prev; });
  const marks = (text, terms) => highlightSpans(text, terms).filter((s) => s.hit).map((s) => s.text);

  it('"ye" never marks "Yet", "me" never "men", "the" never "these"', () => {
    expect(marks('Yet ye shall know me, and the men of these days', ['ye', 'me', 'the'])).toEqual(['ye', 'me', 'the']);
  });

  it('a longer word still marks its forms whole', () => {
    expect(marks('He loved them and loves them still', ['love'])).toEqual(['loved', 'loves']);
  });

  it('a stop word counts no place inside another word', () => {
    const t = 'these and them and their. ' + 'word '.repeat(40) + 'the end';
    expect(findPlaces(t, ['the']).map((p) => t.slice(p.start, p.start + 3))).toEqual(['the']);
  });
});
