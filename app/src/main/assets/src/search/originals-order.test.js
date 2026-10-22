/* THE ORIGINAL FIRST, AND THE VERSE IT QUOTES ABOVE IT (search200 fix2, group orig, 2026-10-22). originalsFirst
   (ac496a4b3, 8a9021d24) lifts the original a reprint names to the reprint's place, one hop, and B4 orders the texts
   holding a quote alike by their score. Each case is a fixture shaped like the hunt bench's misses of that kind:
   - a verse a letter quotes, ranked between a topic reprinting the letter and the letter: the letter was lifted over
     the verse, and the verse holding the quote as well is the letter's own original; a verse holding it less nearly
     than the letter (a typed word it lacks) is not, and stays below;
   - a verse leading on the typed run, and another verse holding the typed words in order (a saying worded twice)
     ranked below the letters quoting the first: it is shown second;
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'has', 'from', 'me', 'or', 'they', 'them', 'have', 'this', 'him', 'shall', 'their', 'but', 'upon', 'as', 'what']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs', ecclesiastes: 'ecclesiastes' }, BOOK_DISPLAY: { proverbs: 'Proverbs', ecclesiastes: 'Ecclesiastes' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs', 'ecclesiastes'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const cite = (title) => ' ~ [From “' + title + '” ~ Volume 4]';
// a letter's line quoting a verse, which an Answers topic reprints (twice)
const LAMP = 'Thus I say to you, the lamp of the upright shines in the night of the wicked, and they shall see it and be ashamed.';
// three more letters like it, each reprinted by a topic and echoed by a verse
const TORCH = 'Thus I say to you, the torch of the upright shines in the night of the wicked, and they shall see it and be ashamed.';
const CUP = 'Thus I say to you, the cup of the faithful overflows in the house of the humble, and they shall drink of it.';
const PRESENCE = 'The presence of the King is an oppressive storm, which abases the proud and causes the high-minded to flee!';
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger turn in the house of kings ' + i + '.' })) }] },
      { num: 31, sections: [{ heading: '', verses: [
        { n: 1, text: 'The lamp of the upright shines, but the lamp of the wicked shall be put out.' },
        { n: 2, text: 'A good name is better than fine oil, and the day of death than the day of birth.' },
        { n: 4, text: 'He shall gather the wheat into the barn, and burn the chaff with fire.' },
        { n: 6, text: 'Tremble, for the presence of the King is near.' },
        { n: 7, text: 'The cup of the faithful overflowed, but the cup of the scoffer is dry.' },
        { n: 9, text: 'The torches of the upright shine, but the torch of the wicked shall be put out.' },
      ] }] },
    ] },
    ecclesiastes: { id: 'ecclesiastes', title: 'Ecclesiastes', chapters: [
      { num: 3, sections: [{ heading: '', verses: [
        { n: 1, text: 'He will gather the wheat into His barn with a winnowing fan.' },
        { n: 2, text: 'A time to plant, and a time to pluck up what is planted.' },
      ] }] },
    ] },
  },
  LETTERS_V4: [
    { id: 'torch-letter', num: 32, title: 'The Night of the Proud', blocks: [para(filler(12) + TORCH + ' ' + filler(12))] },
    { id: 'cup-letter', num: 31, title: 'The House of the Humble', blocks: [para(filler(12) + CUP + ' ' + filler(12))] },
    { id: 'storm-letter', num: 30, title: 'The Storm', blocks: [para(filler(12) + PRESENCE + ' ' + filler(12))] },
    // six letters quoting one verse word for word, which another verse words nearly alike
    ...[10, 11, 12, 13, 14, 15].map((num) => ({ id: 'harvest-letter-' + num, num, title: 'Harvest ' + num, blocks: [para(filler(1) + 'It is written, He will gather the wheat into His barn with a winnowing fan. ' + filler(1))] })),
    { id: 'lamp-letter', num: 3, title: 'The Night of the Wicked', blocks: [para(filler(12) + LAMP + ' ' + filler(12))] },
  ],
  ANSWERS: [
    { id: 'torch-topic', num: 8, title: 'Regarding the Torch of the Upright', paragraphs: [{ text: TORCH + cite('The Night of the Proud') + ' ✦ ' + TORCH + cite('The Night of the Proud') }] },
    { id: 'cup-topic', num: 7, title: 'Regarding the Cup of the Faithful', paragraphs: [{ text: CUP + cite('The House of the Humble') + ' ✦ ' + CUP + cite('The House of the Humble') }] },
    { id: 'storm-topic', num: 6, title: 'Regarding the Proud', paragraphs: [{ text: PRESENCE + cite('The Storm') + ' ✦ ' + PRESENCE + cite('The Storm') }] },
    { id: 'lamp-topic', num: 1, title: 'Regarding the Lamp of the Upright', paragraphs: [{ text: LAMP + cite('The Night of the Wicked') + ' ✦ ' + LAMP + cite('The Night of the Wicked') }] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('the original first, and the verse it quotes above it (search200 fix2)', () => {
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

  it('a verse ranked between a topic and the letter it reprints, holding the quote as the letter does, stays above the letter', async () => {
    // the topic (its title and two prints) leads, the verse next, the letter below: the letter comes up, under the verse
    expect(ids(await E.search('the lamp of the upright shines')).slice(0, 3)).toEqual(['Proverbs 31:1', 'lamp-letter', 'lamp-topic']);
  });

  it('a verse wording the typed run as the leading verse does is shown second, over the letters quoting the first', async () => {
    // Ecclesiastes 3:1 leads, the six letters quoting it next: Proverbs 31:4 holds the typed words in order too, and comes up second
    expect(ids(await E.search('gather the wheat into his barn')).slice(0, 2)).toEqual(['Ecclesiastes 3:1', 'Proverbs 31:4']);
  });

  it('a verse holding the typed words less nearly than the letter does (a word of them it lacks) stays below the letter', async () => {
    // "you" stands before the run in the letter and the topic, not in the verse: the letter is the original, first
    expect(ids(await E.search('you the lamp of the upright shines')).slice(0, 3)).toEqual(['lamp-letter', 'lamp-topic', 'Proverbs 31:1']);
  });
});
