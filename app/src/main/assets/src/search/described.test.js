/* A TEXT DESCRIBED, NOT QUOTED (search200 sealed2, 2026-10-22). A reader describing a text opens with what it is and how
   it speaks ("letter saying now is the time for servants watchmen and trumpet", the panel's unsealed t498; "the part
   where ..."), and those words are none of the text's: "letter" and "saying" weighed as subject words, and a text
   holding them led the one holding what the letter says. The opening is searched as no words of it. Fixture texts
   only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'now', 'o', 'about', 'where']);
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
    ] },
  },
  LETTERS_V4: [
    // servants and watchmen are words many letters say
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: 'watch-' + n, num: n, title: 'Keep Watch ' + n, blocks: [para(filler(2) + 'My servants and My watchmen keep the walls by night. ' + filler(2))] })),
    // a letter saying "letter" and "saying" again and again, with the time and the trumpet
    { id: 'letter-letter', num: 30, title: 'The Letter Sent', blocks: [para('A letter went out saying: the time is near. The letter came saying: sound the trumpet. Saying this, the letter ended. ' + filler(2))] },
  ],
  WTLB_TWO: [
    { id: 'it-is-time', num: 94, title: 'It Is Time', paragraphs: [{ text: 'Now is the time, O servants; now is the time, O watchmen: sound the trumpet in Zion, for the day draws near.' }] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a text described, not quoted (sealed2)', () => {
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

  it('"letter saying ...": the text holding what follows leads the one holding "letter" and "saying"', async () => {
    const r = await E.search('letter saying now is the time for servants watchmen and trumpet');
    expect(ids(r)[0]).toBe('it-is-time');
    // the card marks what the letter says, not the words describing it
    expect(r.parsedTerms).not.toContain('letter');
    expect(r.parsedTerms).not.toContain('saying');
  });

  it('a text\'s kind typed with no telling word is searched as typed', async () => {
    const r = await E.search('the letter sent');
    expect(ids(r)[0]).toBe('letter-letter');
    expect(r.parsedTerms).toContain('letter');
  });
});
