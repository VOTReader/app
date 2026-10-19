/* A TYPED WORD NO TEXT HOLDING THE QUOTE HOLDS (search200 last2, 2026-10-18). B4 aligns the texts holding half the
   typed words' weight. A word of the reader's own in the quote's place, one the texts barely use ("softly" for
   privately), weighed more than any other typed word, so the verse holding every other word in the typed order held
   under half the weight and was never aligned, and a shorter verse holding three of the words led it. A typed word
   that no text holding half the weight holds, in any form or synonym, tells none of them apart: it is left out of
   the weight, and the texts are read again for half of what is left. The verse beside a verse holding half of it
   holds the quote with it, so its words keep their weight (align-rank.test.js: two verses remembered as one saying).
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'had', 'has', 'have', 'they', 'them', 'their', 'we', 'our', 'me', 'him', 'her', 'she', 'this', 'from', 'or', 'as', 'if', 'than', 'then', 'yet', 'do', 'did', 'does', 'been', 'were', 'said', 'which', 'will', 'shall']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { ruth: 'ruth' }, BOOK_DISPLAY: { ruth: 'Ruth' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['ruth'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the hills and of the valleys, of the sea and of the dry land. '.repeat(n);
// the typed words the texts use often, one to a verse, so the reader's own word weighs the most of them
const COMMON = ['Gather the stones from the hill', 'The sheaves stand in the barn', 'The farmer goes out to sow the barley', 'Where the river bends the willows grow', 'The ant and the rock badger turn in the house of kings'];
const GLOBALS = {
  BOOKS: {
    ruth: { id: 'ruth', title: 'Ruth', chapters: [
      { num: 1, sections: [{ heading: '', verses: Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: COMMON[i % 5] + ' ' + i + '.' })) }] },
      { num: 2, sections: [{ heading: '', verses: [
        // the verse remembered: every typed word but the reader's own and one more, in the typed order
        { n: 1, text: 'Then he turned to the reapers and said privately, Gather the sheaves which you sow.' },
        // a shorter verse holding three of the typed words, out of the typed order
        { n: 2, text: 'You sow in tears; gather sheaves.' },
      ] }] },
    ] },
  },
  LETTERS_V4: [
    // texts holding every typed word but the reader's own, far apart
    ...[1, 2, 3].map((num) => ({ id: 'harvest-' + num, num, title: 'The Harvest ' + num, blocks: [para(filler(4) + 'Where are the workers? ' + filler(3) + 'Gather what is yours. ' + filler(3) + 'The sheaves are heavy. ' + filler(3) + 'In hope you sow. ' + filler(4))] })),
    // the one text saying the reader's own word, and none of the others
    { id: 'softly', num: 9, title: 'The Still Night', blocks: [para(filler(2) + 'The night falls softly on the hills. ' + filler(2))] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a typed word no text holding the quote holds (search200 last2)', () => {
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

  it('the verse holding the rest of the quote in order leads, the reader\'s own word left out', async () => {
    expect(ids(await E.search('and said softly gather the sheaves where you sow'))[0]).toBe('Ruth 2:1');
  });
});
