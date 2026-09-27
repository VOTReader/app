/* Coverage counts the words the reader typed, once each (search audit 2026-09-27).
   A word typed twice ("dust you are, and to dust you shall return") and a typed word
   that is another typed word's synonym ("Christ and Jesus") both left an origin no
   unit could fill, so the phrase ranking, which needs every typed word, never fired:
   the verse lost to a long text that says the words everywhere. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';
import { expandQueryTerms } from './synonyms.js';

const STOP = new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'are', 'shall', 'whom', 'call']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP,
  SYNONYM_MAP: { christ: ['christ', 'jesus', 'messiah'], jesus: ['christ', 'jesus', 'messiah'], messiah: ['christ', 'jesus', 'messiah'] },
  BOOK_ABBREVS: { genesis: 'genesis' }, BOOK_DISPLAY: { genesis: 'Genesis' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['genesis'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
// A long letter that says every word, scattered, many times: it wins on word counts alone.
const scattered = (words, n) => Array.from({ length: n }, (_, i) => words[i % words.length] + ' went on and on.').join(' ');
const GLOBALS = {
  BOOKS: {
    genesis: { id: 'genesis', title: 'Genesis', chapters: [
      { num: 3, sections: [{ heading: '', verses: [{ n: 19, text: 'For dust you are, And to dust you shall return.' }] }] },
    ] },
  },
  LETTERS_V1: [
    { id: 'many-words', num: 1, title: 'Many Words', blocks: [{ segments: [{ v: scattered(['Dust', 'Return', 'Christ', 'Jesus', 'Gift', 'YahuShua'], 72) }] }] },
    // the phrase, in a letter long enough that word counts alone cannot put it first
    { id: 'the-gift', num: 2, title: 'A Word to the Nations', blocks: [{ segments: [{ v: 'Hear My words. '.repeat(150) + 'YahuShua is The Gift, Whom you call Christ and Jesus.' }] }] },
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('expandQueryTerms: every typed word is a literal of its own', () => {
  let prev;
  beforeAll(() => { prev = window.VotSearchData; window.VotSearchData = VOT_DATA; });
  afterAll(() => { window.VotSearchData = prev; });

  it('a typed word that is an earlier word\u2019s synonym still gets its own literal unit and origin', () => {
    const { units } = expandQueryTerms(['christ', 'jesus']);
    expect(units.filter((u) => u.literal).map((u) => [u.term, u.origin])).toEqual([['christ', 0], ['jesus', 1]]);
    expect(units.filter((u) => !u.literal).map((u) => u.term)).toEqual(['messiah']);
  });

  it('a word typed twice is one unit, at the first place it was typed', () => {
    const { units } = expandQueryTerms(['dust', 'dust', 'return'], { enabled: false });
    expect(units.map((u) => [u.term, u.origin])).toEqual([['dust', 0], ['return', 2]]);
  });
});

describe('search: the phrase ranking fires whatever the typed words repeat or share', () => {
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

  it('a word typed twice: "dust you are and to dust you shall return" finds Genesis 3:19 first', async () => {
    expect(refs(await VotSearchMini.search('dust you are and to dust you shall return'))[0]).toBe('Genesis 3:19');
  });

  it('two typed words from one synonym group: "Whom you call Christ and Jesus" finds its letter first', async () => {
    expect(refs(await VotSearchMini.search('YahuShua is The Gift, Whom you call Christ and Jesus'))[0]).toBe('Volume One · Letter 2');
  });
});
