/* His names typed restored meet the texts that print them, and the printed names meet the restored texts
   (search200 fix2). The editions print "Christ", "Jesus" and "LORD"; the Volumes print "HaMashiach",
   "YahuShua" and "YAHUWAH". A reader typing one met only the texts printing that one, so a verse saying the
   quote with the name as the edition prints it lost to texts holding the restored name and a word or two.
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const STOP = new Set(['the', 'a', 'of', 'and', 'is', 'in', 'my', 'i', 'not', 'but', 'us', 'he', 'his', 'all', 'with', 'to', 'for', 'it']);
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
      { n: 1, text: 'For the love of Christ compels us, because we judge thus.' },
      { n: 2, text: 'Be not dismayed by this great multitude, for the battle is not yours, but God’s.' },
      { n: 3, text: 'Jesus Christ is the same yesterday, today, and forever.' },
      { n: 4, text: 'The ant and the rock badger keep their houses.' },
      { n: 5, text: 'Then the battle is not yours, but theirs.' },
    ] }] }] },
  },
  LETTERS_V4: [
    // decoys holding the restored names and a typed word or two
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'love-' + i, num: 10 + i, title: 'Love ' + i, blocks: [para('Love HaMashiach, love Mashiach with all your heart.')] })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'battle-' + i, num: 20 + i, title: 'Battles ' + i, blocks: [para('Is the battle yours? No, the battle is YAHUWAH’s, YAHUWAH’s.')] })),
    { id: 'king', num: 30, title: 'YahuShua HaMashiach Is King', blocks: [para('He reigns over every nation, forever.')] },
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: His names, restored or printed, meet each other', () => {
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

  it('"mashiach" typed meets a verse printing "Christ": "for the love of mashiach constraineth us"', async () => {
    expect(refs(await VotSearchMini.search('for the love of mashiach constraineth us'))[0]).toBe('Proverbs 31:1');
  });

  it('the restored name typed as a possessive without its apostrophe: "the battle is not yours but yahuwahs"', async () => {
    expect(refs(await VotSearchMini.search('the battle is not yours but yahuwahs'))[0]).toBe('Proverbs 31:2');
  });

  it('the printed names meet the restored title: "jesus christ is king"', async () => {
    expect(refs(await VotSearchMini.search('jesus christ is king'))[0]).toBe('Volume Four · Letter 30');
  });
});
