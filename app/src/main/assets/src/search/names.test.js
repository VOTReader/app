/* Names as readers type them (search audit 2026-09-27): a name the Volumes write as
   one word, typed in two ("Ha Mashiach" for HaMashiach), and the KJV's Greek
   spellings of prophets' names ("Elias" for Elijah, "Esaias" for Isaiah). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { john: 'john' }, BOOK_DISPLAY: { john: 'John' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: ['john'], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const GLOBALS = {
  BOOKS: { john: { id: 'john', title: 'John', chapters: [{ num: 1, sections: [{ heading: '', verses: [{ n: 41, text: 'We have found the Messiah.' }] }] }] } },
  LETTERS_V1: [
    { id: 'one-word', num: 1, title: 'The Anointed', blocks: [{ segments: [{ v: 'Behold, YahuShua HaMashiach, your King, comes.' }] }] },
    { id: 'part', num: 2, title: 'The Anointed One', blocks: [{ segments: [{ v: 'Mashiach, the Anointed One, is near.' }] }] },
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('a name typed in parts', () => {
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

  it('"Ha Mashiach" finds HaMashiach, first, and marks it', async () => {
    const r = await VotSearchMini.search('Ha Mashiach');
    expect(refs(r)[0]).toBe('Volume One · Letter 1');
    expect(r.results[0].terms).toContain('hamashiach');
  });
});

describe('the KJV\u2019s Greek spellings of names, on the app\u2019s own tables', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    // @ts-ignore -- a classic script: it sets window.VotSearchData
    await import('../../search-data.js');
  });
  afterAll(() => { window.VotSearchData = prev; });

  it('Elias is Elijah, Esaias is Isaiah, and Immanuel is written Immanu El too', () => {
    const SYN = window.VotSearchData.SYNONYM_MAP;
    expect(SYN.elias).toContain('elijah');
    expect(SYN.esaias).toContain('isaiah');
    expect(SYN.immanuel).toContain('immanu el');
  });
});
