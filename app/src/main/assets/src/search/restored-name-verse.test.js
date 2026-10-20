/* His name typed restored, in a verse (search200 fix1). The editions print the Father's name as "LORD" and the
   Son's as "Jesus": a verse never held the typed run "yahuwah is my keeper ...", so the texts holding the
   restored name among the typed words led it. A verse is also read with the typed name as the editions print
   it, for the run. Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const STOP = new Set(['the', 'a', 'of', 'and', 'is', 'in', 'my', 'i', 'shall', 'not', 'says', 'he']);
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
      { n: 1, text: 'The LORD is my keeper; I shall not stray from the paths of the valley, nor turn aside from the well.' },
      { n: 2, text: 'And Jesus sat by the well of the valley, and He was weary.' },
      { n: 3, text: 'The ant and the rock badger keep their houses.' },
    ] }] }] },
  },
  LETTERS_V4: [
    // decoys holding the restored name and the typed words, all but in a row
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'keeper-' + i, num: 10 + i, title: 'Keepers ' + i, blocks: [para('Yahuwah, is He my keeper? I shall not stray.')] })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'well-' + i, num: 20 + i, title: 'Wells ' + i, blocks: [para('YahuShua then sat by the well.')] })),
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: His name typed restored meets the verse printing it', () => {
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

  it('the Father\'s name: "yahuwah is my keeper i shall not stray" opens on "The LORD is my keeper; I shall not stray"', async () => {
    expect(refs(await VotSearchMini.search('yahuwah is my keeper i shall not stray'))[0]).toBe('Proverbs 31:1');
  });

  it('the Son\'s name: "yahushua sat by the well" opens on "Jesus sat by the well"', async () => {
    expect(refs(await VotSearchMini.search('yahushua sat by the well'))[0]).toBe('Proverbs 31:2');
  });
});
