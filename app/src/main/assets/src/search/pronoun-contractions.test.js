/* A pronoun contraction is its two words (search200 fix1). Typed bare ("youre", "theyre") it was no index
   term, so the typo fixer turned it into another word ("your", "there"); written in a text ("you’re") it
   indexed as "you" + "re", which "you are" never met. Both sides now read it as its words. A bare form that is
   a word of its own ("were", "well", "ill") is never read so. Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { kjvEncode, kjvEncodeAt } from './tokenize.js';
import { VotSearchMini, expandContractions } from './engine.js';

describe('kjvEncode: a pronoun contraction', () => {
  it('typed bare is its two words', () => {
    expect(kjvEncode('youre here')).toEqual(['you', 'are', 'here']);
    expect(kjvEncode('theyre gone, youve won')).toEqual(['they', 'are', 'gone', 'you', 'have', 'won']);
    expect(kjvEncode('ive seen, weve heard, youll know, itll pass')).toEqual(
      ['i', 'have', 'seen', 'we', 'have', 'heard', 'you', 'will', 'know', 'it', 'will', 'pass']);
  });

  it('written, its piece after the pronoun is its word', () => {
    expect(kjvEncode('you’re here')).toEqual(['you', 'are', 'here']);
    expect(kjvEncode("They're gone; I'm glad")).toEqual(['they', 'are', 'gone', 'i', 'am', 'glad']);
    expect(kjvEncode('we’ve heard, she’ll know')).toEqual(['we', 'have', 'heard', 'she', 'will', 'know']);
  });

  it('a word of its own stays the word; a piece after no pronoun stays as it was', () => {
    expect(kjvEncode('we were well, ill and wed')).toEqual(['we', 'were', 'well', 'ill', 'and', 'wed']);
    expect(kjvEncode('the shell, its lets, hell')).toEqual(['the', 'shell', 'its', 'lets', 'hell']);
    expect(kjvEncode('the Lord’s house')).toEqual(['the', 'lord', 's', 'house']);
    expect(kjvEncode('I’d go')).toEqual(['i', 'd', 'go']);
    expect(kjvEncode('Ha’re')).toEqual(['ha', 're']);
  });

  it('a bare "im" stays a word: it is "in" one key over ("im the beginning"); written, "I’m" is I am', () => {
    expect(kjvEncode('im the beginning')).toEqual(['im', 'the', 'beginning']);
    expect(expandContractions('im the beginning')).toBe('im the beginning');
    expect(kjvEncode('I’m glad')).toEqual(['i', 'am', 'glad']);
    expect(expandContractions('I’m glad')).toBe('I am glad');
  });

  it('kjvEncodeAt reads the same tokens', () => {
    for (const s of ['You’re here and theyre gone', "I'm glad we've heard", 'we were well']) {
      expect(kjvEncodeAt(s).tokens).toEqual(kjvEncode(s));
    }
  });

  it('the query spells a pronoun contraction out, bare or written; a negative one typed bare stays', () => {
    expect(expandContractions('youre the salt')).toBe('you are the salt');
    expect(expandContractions('They’re here, Ive come')).toBe('They are here, i have come');
    expect(expandContractions("we've seen it, you'll know")).toBe('we have seen it, you will know');
    expect(expandContractions('we were well, dont go')).toBe('we were well, dont go');
  });
});

const STOP = new Set(['the', 'a', 'of', 'and', 'is', 'in', 'you', 'are', 'your', 'they', 'not', 'i', 'am', 'it', 'said']);
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
      { n: 1, text: 'You are the lamp of the valley; the ant and the rock badger keep their houses, the locust has no king, and the spider is in the house of kings.' },
      { n: 2, text: 'The ant and the rock badger keep their houses.' },
    ] }] }] },
  },
  LETTERS_V4: [
    { id: 'sower', num: 1, title: 'The Sower', blocks: [para('They’re not of the field, said the sower, and he went on his way to the city of the king, to the people of the land who waited for the rain.')] },
    // decoys thick with the words a corrected or a split contraction leaves
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'lamp-' + i, num: 10 + i, title: 'Lamps ' + i, blocks: [para('Your lamp of the valley.')] })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'field-' + i, num: 20 + i, title: 'Fields ' + i, blocks: [para('They say: not of the field.')] })),
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: a pronoun contraction meets its words', () => {
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

  it('"youre the lamp of the valley" opens on the verse saying "You are the lamp of the valley"', async () => {
    expect(refs(await VotSearchMini.search('youre the lamp of the valley'))[0]).toBe('Proverbs 31:1');
  });

  it('the phrase "they are not of the field" holds the letter saying "They’re not of the field"', async () => {
    const r = await VotSearchMini.search('"they are not of the field"');
    expect(r.unquoted).toBeFalsy();   // the phrase is held: no fall back to its words unquoted
    expect(refs(r)[0]).toBe('Volume Four · Letter 1');
  });
});
