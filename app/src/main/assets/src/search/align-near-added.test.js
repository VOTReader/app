/* A TEXT B4 ALIGNS ONLY FOR ITS NEAR PHRASE IS NEVER ITS NEAR MISS (search200 fix1, scope cause 1). Every text graded
   near the typed phrase is aligned now, past ALIGN_CANDIDATES and the ALIGN_MASS gate. One added so may be held, but
   it never becomes `under`, the best text left under ALIGN_HELD that every held text must clear: a text holding the
   typed words in a row but the heaviest of them not at all would tie the verses holding the quote with a slip, drop
   them all, and hand the lead back to the words' order. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'me', 'upon']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { joel: 'joel' }, BOOK_DISPLAY: { joel: 'Joel' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v3', screen: 'vot-three-letter', dataVar: 'LETTERS_V3', prefaceVar: null, label: 'Volume Three' }],
  OT_BOOK_IDS: ['joel'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const QUERY = 'and he is the man who keeps the gate of zebulun';
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const GLOBALS = {
  BOOKS: {
    joel: { id: 'joel', title: 'Joel', chapters: [{ num: 1, sections: [{ heading: '', verses: [
      // the quote with a slip: held
      { n: 1, text: 'So he is a man who guards the gate of Zebulun.' },
      { n: 2, text: 'Truly he is a man who watches the gate of Zebulun.' },
      // the land, named elsewhere too
      ...Array.from({ length: 6 }, (_, i) => ({ n: i + 3, text: 'Zebulun dwells by the haven of the sea, ' + i + '.' })),
      // the small words typed, common here
      ...Array.from({ length: 30 }, (_, i) => ({ n: i + 9, text: 'Of the night watch ' + i + ': who is he, and where?' })),
    ] }] }] },
  },
  LETTERS_V3: [
    // the typed words in a row, the heaviest of them not at all
    { id: 'city-gate', num: 1, title: 'The City', blocks: [para('Hear Me: and he is the man who keeps the gate of the city, says The Lord.')] },
    ...Array.from({ length: 70 }, (_, k) => ({ id: 'watch-' + k, num: 10 + k, title: 'Watch ' + k, blocks: [para('Man keeps gate, watch ' + k + ', till morning.')] })),
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a text aligned only for its near phrase is never B4\'s near miss (search200 fix1 scope)', () => {
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

  it('the verses holding the quote with a slip stay held and lead', async () => {
    expect(ids(await E.search(QUERY)).slice(0, 2).sort()).toEqual(['Joel 1:1', 'Joel 1:2']);
  });
});
