/* A TEXT HOLDING MORE OF THE TYPED WORDS IS NO TIE (search200 R4, 2026-10-18). B4 held two texts whose covs sat
   within a small word's weight of each other alike, and the words' order (BM25) ranked them, so a short verse missing
   a typed small word led the letter holding every typed word with one of its own between them. align.js now says
   which typed words a text holds (each text word meeting one, so a word typed twice is met twice); a text holding
   every content word another holds and more, or the same content words and more small ones, is not tied with it.
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'had', 'has', 'have', 'they', 'them', 'their', 'we', 'our', 'me', 'him', 'her', 'she', 'this', 'from', 'or', 'as', 'if', 'than', 'then', 'yet', 'do', 'did', 'does', 'been', 'were', 'said']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger turn in the house of kings ' + i + '.' })) }] },
      { num: 31, sections: [{ heading: '', verses: [
        // a typed word said twice, the verse saying it once: "the" there is "you"
        { n: 1, text: 'Arise, for the hour is come for you, and you shall go up early in the morning.' },
        // a typed small word the verse never says
        { n: 2, text: 'I called you by name, and you are Mine.' },
      ] }] },
    ] },
  },
  LETTERS_V4: [
    // each holds every typed word, with a word of its own between two of them
    { id: 'hour-letter', num: 3, title: 'The Fold', blocks: [para(filler(14) + 'For the hour has come for the lambs to return to the fold. ' + filler(14))] },
    { id: 'weary-letter', num: 4, title: 'The Called', blocks: [para(filler(14) + 'O weary and wandering people, I had called you by your name, yet you turned aside. ' + filler(14))] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a text holding more of the typed words is no tie (R4)', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await E.init();
  }, 60000);
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('a typed word said twice: the text saying it twice leads the one saying it once', async () => {
    expect(ids(await E.search('for the hour come for the'))[0]).toBe('hour-letter');
  });

  it('a small word typed: the text holding it leads the one without it', async () => {
    expect(ids(await E.search('i had called you by name'))[0]).toBe('weary-letter');
  });
});
