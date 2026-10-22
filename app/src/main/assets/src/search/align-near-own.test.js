/* A TEXT ALIGNED ONLY FOR ITS NEAR PHRASE IS HELD ON ITS OWN WORDS (search200 fix2). Every text graded near the typed
   phrase joins B4's alignment past its cut and gate (align-near-added.test.js). One so added that holds only the
   common words after a typed small word ("nor in the house of Jacob" for "the lyre of the house of jacob") was joined
   to the verse before it, which holds the typed word that names the saying, and held as the quote itself: it led
   that verse, and as a first result one word off it kept every text below it in place. It was brought in for its own
   words, and a neighbour joined to it is no quote it holds; the verse the quote starts in is held with it, and it
   comes right after (TWO VERSES RUN TOGETHER, BOTH SHOWN). Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'me', 'upon', 'this', 'they', 'were', 'went', 'there', 'from', 'while', 'have', 'do', 'nor', 'no', 'whom', 'will']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { micah: 'micah', nahum: 'nahum' }, BOOK_DISPLAY: { micah: 'Micah', nahum: 'Nahum' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['micah', 'nahum'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const PLACES = ['field', 'hill', 'gate', 'road', 'well', 'court', 'shore', 'vale'];
const GLOBALS = {
  BOOKS: {
    // the other typed words, common
    micah: { id: 'micah', title: 'Micah', chapters: [{ num: 1, sections: [{ heading: '', verses:
      Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: i < 60 ? 'Jacob came to the house by the ' + PLACES[i % 8] + ', ' + (i + 1) + '.' : 'The sheep went out to the ' + PLACES[i % 8] + ', ' + (i + 1) + '.' })) }] }] },
    nahum: { id: 'nahum', title: 'Nahum', chapters: [{ num: 1, sections: [{ heading: '', verses: [
      // the typed word that names the saying, the rarest
      { n: 1, text: 'I will praise Him all my days on the lyre.' },
      // its neighbour: the common words after the typed small word, in a row
      { n: 2, text: 'Nor in the house of Jacob.' },
      ...Array.from({ length: 20 }, (_, i) => ({ n: i + 3, text: 'The flocks lay down by the waters of the valley ' + i + '.' })),
    ] }] }] },
  },
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('a text aligned only for its near phrase is held on its own words (search200 fix2)', () => {
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

  it('the quote run across two verses opens on the verse it starts in, its neighbour right after', async () => {
    expect(refs(await E.search('the lyre of the house of jacob')).slice(0, 2)).toEqual(['Nahum 1:1', 'Nahum 1:2']);
  });
});
