/* A TITLE'S NUMBER TYPED IN WORDS NAMES IT (search200 fix2 "ed"). A title prints its number in digits ("Regarding the
   144,000 Witnesses"), and a reader types it in words ("regarding the one hundred forty four thousand witnesses"). The
   phrase ranking already read the typed number as its digits in a verse (numbers.js); the title reading did not, so
   the title typed whole was a title remembered loosely, and the text holding the words in a row, or the verse the
   topic quotes, took its place. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'a', 'an', 'of', 'and', 'is', 'in', 'to', 'were', 'there']), SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, ROMAN_NUMS: {},
  // the app's own (search-data.js)
  WORD_NUMS: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100, thousand: 1000 },
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. ';
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 1, sections: [{ heading: '', verses: Array.from({ length: 30 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger in the house of kings, ' + 'abcdefghijklmnopqrstuvwxyzABCD'[i] + (i % 3 ? '; four winds.' : '; forty days, a hundred and one nights.') })) }] },
    ] },
  },
  // a letter saying the number in words, beside the words of the title
  LETTERS_V4: [{ id: 'tribes-letter', num: 1, title: 'The Tribes', blocks: [para(filler + 'And there were sealed one hundred forty four thousand witnesses of all the tribes. ' + filler)] }],
  ANSWERS: [{ id: 'witnesses', num: 1, title: 'Regarding the 144,000 Witnesses', paragraphs: [{ text: filler + 'They are sealed, and not one witness is lost. ' + filler }] }],
};
const first = async (/** @type {string} */ q) => {
  const x = (await E.search(q)).results[0];
  return x && (x.doc.kind === 'answers' ? x.doc.title : x.doc.kind === 'verse' ? x.doc.ref : x.doc.letterId);
};

describe('a title’s number typed in words', () => {
  /** @type {any} */ let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) /** @type {any} */ (globalThis)[k] = /** @type {any} */ (GLOBALS)[k];
    await E.init();
  }, 60000);
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete /** @type {any} */ (globalThis)[k];
  });

  it('names the title as its digits do', async () => {
    expect(await first('regarding the 144000 witnesses')).toBe('Regarding the 144,000 Witnesses');
    expect(await first('regarding the one hundred forty four thousand witnesses')).toBe('Regarding the 144,000 Witnesses');
    expect(await first('the one hundred and forty four thousand witnesses')).toBe('Regarding the 144,000 Witnesses');
  });
});
