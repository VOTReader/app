/* A QUOTE TYPED ONE WORD OFF IS READ WHEREVER IT RANKS (search200 fix1, scope cause 1). The phrase pass graded a run
   one word off (nearPhrase) only in the PHRASE_CANDIDATES best-scored texts, and B4 aligned only the ALIGN_CANDIDATES
   best of the gated ones: both cuts drawn corpus-wide, before any scope. A text quoting the typed words with one word
   swapped, outscored by hundreds of short texts thick with the words, was never read, in any scope. The run each
   typed word leaves on its longer side is read from the token store (runHolders, as B3 reads the whole run); a text
   holding it and the phrase pass's own cover is graded, and every text graded near the phrase is aligned. Fixture
   texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'me', 'upon', 'this', 'they', 'were', 'went', 'there', 'from']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { hosea: 'hosea', amos: 'amos' }, BOOK_DISPLAY: { hosea: 'Hosea', amos: 'Amos' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['hosea', 'amos'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const PLACES = ['field', 'hill', 'gate', 'road', 'well', 'court', 'shore', 'vale'];
// many short verses thick with the typed words, out of their order: they outscore the quote
const thick = Array.from({ length: 560 }, (_, i) => ({ n: i + 1, text: 'Israel came to the house by the ' + PLACES[i % 8] + ', and a jar the potter shaped stood there, ' + (i + 1) + '.' }));
const GLOBALS = {
  BOOKS: {
    hosea: { id: 'hosea', title: 'Hosea', chapters: [{ num: 1, sections: [{ heading: '', verses: thick }] }] },
    amos: { id: 'amos', title: 'Amos', chapters: [{ num: 1, sections: [{ heading: '', verses: [
      // the quote, one word swapped ("people" for the typed "house"), in a longer verse
      { n: 1, text: 'And it came to pass in those days that the potter of this people shaped Israel upon the wheel, as clay is turned in the hand of the one who works it, and he made of it another vessel as seemed good to him.' },
      // in its book too, verses thick with the words
      ...Array.from({ length: 5 }, (_, i) => ({ n: i + 2, text: 'Israel came to the house by the ' + PLACES[i] + ', and a jar the potter shaped stood there.' })),
      // most of the typed run in a row, and two typed content words of four
      { n: 7, text: 'So the potter of this house sat at his wheel all day and sang.' },
      ...Array.from({ length: 20 }, (_, i) => ({ n: i + 8, text: 'The flocks lay down by the waters of the valley ' + i + '.' })),
    ] }] }] },
  },
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('a quote typed one word off is read wherever it ranks (search200 fix1 scope)', () => {
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

  it('unscoped, the verse quoting the typed words with one swapped leads the texts thick with them', async () => {
    expect(refs(await E.search('the potter of this house shaped israel'))[0]).toBe('Amos 1:1');
  });

  it('a text holding half the typed run and few of the typed words is not graded so', async () => {
    const top = refs(await E.search('the potter of this house shaped israel', { scope: { bookId: 'amos' } }));
    expect(top.indexOf('Amos 1:7')).toBeGreaterThan(3);
  });

  it('kept to its book, it leads there too', async () => {
    expect(refs(await E.search('the potter of this house shaped israel', { scope: { bookId: 'amos' } }))[0]).toBe('Amos 1:1');
  });
});
