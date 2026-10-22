/* A REAL WORD IS NO TYPO OF A TITLE'S WORD (search200 fix1, 2026-10-19). titles.js meets a typed word with a title
   word one letter off as a typo of it (CREDIT.typo), and a word the index holds was met so too: "fame" met "name",
   a heading "In My Name" was admitted for a query about fame, and the letter holding it led (hunt topical M9). A
   typed word the index holds is the word typed: it meets a title word as itself, a form, a near-synonym or a stem,
   never as a typo. A word the index lacks is still read as a typo. Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the morning and of the evening, of the field and of the vineyard. '.repeat(n);
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 100 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger turn in the house of kings ' + i + '.' })) }] },
    ] },
  },
  LETTERS_V4: [
    { id: 'flame-letter', num: 1, title: 'The Flame', blocks: [para(filler(4) + 'The flame burns in the night watch. ' + filler(4))] },
    // a text holding the typed words, one of them a word one letter off the title's
    { id: 'frame-letter', num: 2, title: 'Of Workmanship', blocks: [para(filler(2) + 'He made a silver frame for the mirror of the king. ' + filler(2))] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a real word is no typo of a title word (search200 fix1)', () => {
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

  it('a word the index holds names no title one letter off it', async () => {
    const r = ids(await E.search('frame'));
    expect(r[0]).toBe('frame-letter');
    expect(r).not.toContain('flame-letter');
  });

  it('a word the index lacks is still read as a typo of the title', async () => {
    expect(ids(await E.search('flsme'))[0]).toBe('flame-letter');
  });
});
