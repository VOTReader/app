/* A number typed in words is also its digits (search200 fix1). kjvEncode reads a number under a hundred as
   its digits, but "six hundred sixty six" stayed three words that never met a text's "666". The query is
   also read with such a number as its digits. Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { kjvEncode } from './tokenize.js';
import { numberReading } from './numbers.js';
import { VotSearchMini } from './engine.js';

const read = (s) => numberReading(kjvEncode(s));

describe('numberReading', () => {
  it('a number over a hundred written in words is its digits, with or without "and"', () => {
    expect(read('six hundred sixty six')).toEqual(['666']);
    expect(read('six hundred and sixty-six')).toEqual(['666']);
    expect(read('a hundred and fifty three fish')).toEqual(['153', 'fish']);
    expect(read('one hundred and forty four thousand')).toEqual(['144000']);
    expect(read('forty six thousand five hundred')).toEqual(['46500']);
    expect(read('seven thousand men')).toEqual(['7000', 'men']);
    expect(read('two hundred')).toEqual(['200']);
  });

  it('tokens making no such number stay as they are', () => {
    expect(read('the one who overcomes')).toEqual(['the', 'one', 'who', 'overcomes']);
    expect(read('ninety nine sheep')).toEqual(['99', 'sheep']);
    expect(read('psalm 119 105')).toEqual(['psalm', '119', '105']);
    expect(read('hundreds and thousands')).toEqual(['hundreds', 'and', 'thousands']);
    expect(read('a hundredfold')).toEqual(['a', 'hundredfold']);
    expect(read('twelve hundred')).toEqual(['12', 'hundred']);
  });
});

const STOP = new Set(['the', 'a', 'of', 'and', 'is', 'in', 'his', 'it', 'then', 'more']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [{ num: 31, sections: [{ heading: '', verses: [
      { n: 1, text: 'Let the wise reckon the tally, for it is the tally of a house: his tally is 666.' },
      { n: 2, text: 'The ant and the rock badger keep their houses.' },
    ] }] }] },
  },
  LETTERS_V4: [
    // decoys holding the typed words one by one
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'tally-' + i, num: 10 + i, title: 'Tallies ' + i, blocks: [para('His tally: six hundred sheep and sixty goats, then six more.')] })),
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: a number typed in words meets the number in digits', () => {
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

  it('"his tally is six hundred and sixty six" opens on the verse saying "his tally is 666"', async () => {
    expect(refs(await VotSearchMini.search('his tally is six hundred and sixty six'))[0]).toBe('Proverbs 31:1');
  });
});
