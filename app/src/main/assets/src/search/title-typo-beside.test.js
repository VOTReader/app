/* A REAL WORD BESIDE A TITLE'S OWN WORDS IS A SLIP OF ITS WORD (search200 fix2, 2026-10-22). A typed word the index
   holds meets no title word as a typo of it (title-typo-word.test.js: "fame" alone is no slip for "name"). But a slip
   often lands on a real word: "the holy fame" for "The Holy Flame", "born gain" for "Born Again". Typed beside another
   word of that same title, typed as itself, the real word is read as a slip of the title's word again; alone, or
   beside words the title lacks, it is still the word typed. Fixture texts only (no benchmark query). */
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
    { id: 'flame-letter', num: 1, title: 'The Pure Flame', blocks: [para(filler(4) + 'The flame goes up in the night watch. ' + filler(4))] },
    // the real word, in a text of its own
    { id: 'frame-letter', num: 2, title: 'Of Workmanship', blocks: [para(filler(2) + 'He made a silver frame for the lamp of the king. ' + filler(2))] },
    // texts titled with the title's other word too, and thick with it
    { id: 'gold-letter', num: 3, title: 'Pure Gold', blocks: [para('Pure gold, pure silver, pure in heart; the pure shall see. ' + filler(1))] },
    { id: 'heart-letter', num: 4, title: 'A Pure Heart', blocks: [para('Keep your heart pure; a pure heart, pure and clean all the night. ' + filler(1))] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a real word beside a title\'s own words is a slip of its word (search200 fix2)', () => {
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

  it('typed beside a word of the title, a word the index holds is read as a slip of the title\'s word', async () => {
    expect(ids(await E.search('the pure frame'))[0]).toBe('flame-letter');
  });

  it('alone, the word the index holds is still the word typed', async () => {
    const r = ids(await E.search('frame'));
    expect(r[0]).toBe('frame-letter');
    expect(r).not.toContain('flame-letter');
  });

  it('beside words the title lacks, it is still the word typed', async () => {
    expect(ids(await E.search('silver frame'))[0]).toBe('frame-letter');
  });
});
