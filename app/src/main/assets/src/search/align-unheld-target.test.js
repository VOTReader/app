/* A TYPED WORD NO TEXT HOLDING THE QUOTE HOLDS, THE TARGET'S OWN (search200 last2 review, 2026-10-18). A typed word
   no text holding half the typed words' weight holds is left out of the weight (align-unheld.test.js). But the reader's
   own word in the quote's place can be the one that is rare ("fortress" for strength) and weigh enough that the short
   texts holding it and one common typed word hold half the weight, while the verse remembered, holding every other
   word, falls under it. Its word ("joy") is then the one no text holding half the weight holds, and leaving it out
   would drop the true word and keep the reader's own: the short texts, aligned without it, led the verse. A word is
   left out only when no text holding it holds as many of the typed words as the best text holding half the weight.
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'had', 'has', 'have', 'they', 'them', 'their', 'we', 'our', 'me', 'him', 'her', 'she', 'this', 'from', 'or', 'as', 'if', 'than', 'then', 'yet', 'do', 'did', 'does', 'been', 'were', 'said', 'which', 'will', 'shall', 'your', 'go', 'eat']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { ruth: 'ruth' }, BOOK_DISPLAY: { ruth: 'Ruth' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['ruth'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'His people speak of many things, of the hills and of the valleys, of the sea and of the dry land. '.repeat(n);
// the common typed word (LORD) in half the verses, the true word (joy) in a few, the reader's own word (fortress) in none
const LINES = ['Gather your stones from the hill, for the day is long', 'The LORD sees the sheaves of your barn and it is good', 'Your farmer goes out to sow the barley, as is the way of the land', 'The LORD makes your willows grow where the river is wide', 'The ant and the rock badger turn in the house of kings, and your house is safe', 'The LORD gives rain on the field of your fathers, and it is enough'];
const chapter1 = Array.from({ length: 240 }, (_, i) => ({ n: i + 1, text: LINES[i % 6] + (i % 16 === 7 ? ', and they shout for joy' : '') + ' ' + i + '.' }));
const GLOBALS = {
  BOOKS: {
    ruth: { id: 'ruth', title: 'Ruth', chapters: [
      { num: 1, sections: [{ heading: '', verses: chapter1 }] },
      { num: 2, sections: [{ heading: '', verses: [
        { n: 1, text: 'Go your way, eat the fat, and drink the sweet, for this day is holy.' },
        // the verse remembered: every typed word but the reader's own, in the typed order
        { n: 2, text: 'Do not sorrow, for the joy of the LORD is your strength.' },
        { n: 3, text: 'So the Levites quieted all the people, saying, Be still, for the day is holy.' },
      ] }] },
      // short verses holding the reader's own word and the common typed word, apart from each other
      { num: 3, sections: [{ heading: '', verses: [
        { n: 1, text: 'The LORD is your strong fortress, O Israel.' },
        { n: 2, text: 'The sun rose over the hills of the east.' },
        { n: 3, text: 'The rains came and the brooks ran over.' },
        { n: 4, text: 'The LORD is your high fortress in the day of trouble.' },
        { n: 5, text: 'The flocks lay down by the still waters.' },
        { n: 6, text: 'The cedar grows tall upon the mountain.' },
        { n: 7, text: 'Know that the LORD is your mighty fortress.' },
      ] }] },
    ] },
  },
  LETTERS_V4: [1, 2, 3].map((num) => ({ id: 'harvest-' + num, num, title: 'The Harvest ' + num, blocks: [para(filler(6))] })),
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a typed word no text holding the quote holds, the target\'s own (search200 last2 review)', () => {
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

  it('the verse holding the rest of the quote leads the short texts holding the reader\'s own word', async () => {
    expect(ids(await E.search('the joy of the lord is your fortress'))[0]).toBe('Ruth 2:2');
  });
});
