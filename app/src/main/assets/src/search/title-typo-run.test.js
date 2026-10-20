/* A PHRASE TYPED AS MEANT IS NO TYPO OF A SHORT TITLE (search200 fix1, scope cause 6). titles.js's trigram reading
   (level 1) measures the whole title, and in a short "The X of The Lord" title "of the lord" is most of the trigrams:
   any short word in X's place read as a typo of X. The word that differs was a real word, and the typed words a phrase
   the texts hold in a row. A level-1 title is named only when no text but its own holds the typed run whole, its lead
   words aside; a run no text holds (a typo's word is in none) is still read as the title. Fixture texts and titles
   only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'me', 'upon', 'regarding']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { micah: 'micah' }, BOOK_DISPLAY: { micah: 'Micah' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v3', screen: 'vot-three-letter', dataVar: 'LETTERS_V3', prefaceVar: null, label: 'Volume Three' }],
  OT_BOOK_IDS: ['micah'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The people went out to the fields at dawn and came home at dusk, and the seasons turned. '.repeat(n);
const GLOBALS = {
  BOOKS: {
    micah: { id: 'micah', title: 'Micah', chapters: [
      { num: 1, sections: [{ heading: '', verses: [
        // the phrase typed as meant: a verse holds it in a row
        { n: 1, text: 'And the rod of the Lord was upon the prophet, and he rose and went down to the river.' },
        ...Array.from({ length: 40 }, (_, i) => ({ n: i + 2, text: 'The flocks lay down by the waters of the valley ' + i + ', and the child slept in his bed.' })),
      ] }] },
    ] },
  },
  LETTERS_V3: [
    // the short title the phrase is a trigram "typo" of
    { id: 'seed-of-the-lord', num: 1, title: 'The Seed of The Lord', blocks: [para(filler(6) + 'Sow and wait upon the rain.')] },
    // a text thick with the phrase's words, apart: it leads the words' order
    { id: 'rods', num: 2, title: 'By the River', blocks: [para('The rod is lifted, says the Lord. ' + filler(1) + 'The Lord holds the rod. ' + filler(1) + 'A rod the Lord will not break.')] },
    ...Array.from({ length: 12 }, (_, k) => ({ id: 'days-' + k, num: 10 + k, title: 'Days ' + k, blocks: [para(filler(3))] })),
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a phrase the texts hold in a row is no trigram typo of a short title (search200 fix1 scope)', () => {
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

  it('a real word in the title word\'s place, the phrase held whole by a verse: the title is not named', async () => {
    const top = ids(await E.search('regarding the rod of the lord'));
    expect(top[0]).not.toBe('seed-of-the-lord');
    expect(top.indexOf('seed-of-the-lord')).not.toBe(1);
  });

  it('a run no text holds whole is still read as the title', async () => {
    // "bed" is a word of the texts, "bed of the lord" a run none holds: the trigram reading stands
    expect(ids(await E.search('regarding the bed of the lord'))[0]).toBe('seed-of-the-lord');
  });
});
