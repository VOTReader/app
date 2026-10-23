/* THE ORIGINAL OF A LINE ITS REPRINT CUT (search200 sealed2, 2026-10-22). Corbin (DECISIONS 10-14): the original first,
   its reprint second, both shown. The panel's unsealed misses of that kind, each on a fixture shaped like its texts:
   - a Words To Live By entry cut from two letters, the reader typing a line of one of them: the letter holding the
     line leads, though the entry draws as much on the other letter;
   - an entry's line is its letter's with two small words cut ("I have indeed written it, even on tablets of stone"),
     and the reader types the entry's words: the letter, holding every typed word in order with those two between,
     leads;
   - a letter leads and another letter shares only the end of its sentence ("they have refused to accept Me as I truly
     am"): the reprint holding the whole sentence comes up second, not the letter holding its last words.
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'has', 'from', 'me', 'or', 'they', 'them', 'have', 'this', 'him', 'does', 'when', 'as', 'am', 'these', 'did', 'out', 'which', 'no', 'were', 'what']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const cite = (title) => ' ~ [From “' + title + '” ~ Volume 4]';
// a letter's lines, and an entry that cuts two small words from one of them
const STONE = 'For I have indeed written it, even on tablets of stone and within the heart of man, and within the pages of My Book it is made plain; thus they are without excuse.';
const STONE_MORE = 'The proud shall stumble over the stone they rejected, and the lowly shall be lifted up upon the rock of their salvation.';
// two letters, and an entry cut from both, each line of one letter beside lines of the other
const PROPHET = ['Is he not a man, My servant, whom I have chosen and called?', 'And when does My servant become a prophet, and what is the length of time he remains as such?',
  'Lo, he is only a prophet in that self-same moment in which I speak to him and cause him to hear.', 'There is no prophecy apart from My will, and without My voice there is none.',
  'Therefore receive the word of a prophet only when I have spoken it, and test every word by the Law and the Testimony.'];
const EARS = ['Blessed are the ears that hear the counsel of the Lord in the evening and in the morning.', 'Woe to those who stop their ears against the counsel, for they shall walk in darkness.',
  'The humble listen and harden not their hearts, and they receive understanding as rain upon the grass.', 'Let the deaf hear, and let the blind behold the glory of the King of kings.'];
// a letter's sentence, the end of it in another letter, and an Answers topic reprinting it whole
const CUP = 'For these did not seek out My Salvation which came down in the flesh, they wanted no part with Him who was sent; they refused to accept Me as I truly am.';
const SWORD = 'A great emptiness with the way ahead unsure, for those who have not known Me, for they have refused to accept Me as I truly am.';
// a letter's two sentences, the typed words across their end, and an Answers topic holding them in one sentence
const HARLOT = 'Woe to you, for you have gone after the harlot! She has deceived you with the wine of her cup, and you drank deeply.';
const CALLED = 'Come out of her, My people, and hear. The harlot has deceived you! Her cup is full of abominations and the wine of her fornication.';
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger turn in the house of kings ' + i + '.' })) }] },
    ] },
  },
  LETTERS_V4: [
    { id: 'stone-letter', num: 14, title: 'I Shall Correct All Those I Love', blocks: [para(filler(12) + STONE + ' ' + STONE_MORE + ' ' + filler(12))] },
    { id: 'prophet-letter', num: 2, title: 'Gnashing Children', blocks: [para(filler(12) + PROPHET.join(' ') + ' ' + filler(12))] },
    { id: 'ears-letter', num: 38, title: 'Open the Ear', blocks: [para(filler(12) + EARS.join(' ') + ' ' + filler(12))] },
    { id: 'cup-letter', num: 26, title: 'The Cup Is Full', blocks: [para(filler(12) + CUP + ' ' + filler(12))] },
    { id: 'harlot-letter', num: 70, title: 'Come Out', blocks: [para(filler(12) + HARLOT + ' ' + filler(12))] },
    { id: 'sword-letter', num: 52, title: 'The Sword', blocks: [para(SWORD + ' Refuse Me not, for I truly am He who comes.')] },
    ...[1, 2, 3].map((n) => ({ id: 'accept-letter-' + n, num: 60 + n, title: 'Accept Me ' + n, blocks: [para(filler(3) + 'Come and accept Me as I truly am, beloved. ' + filler(3))] })),
  ],
  WTLB_TWO: [
    { id: 'only-witness', num: 18, title: 'The Only Faithful and True Witness', paragraphs: [
      { text: 'I have written it on tablets of stone\n\nAnd within the heart of man, and within\n\nThe pages of My Book it is made plain;\n\nThus they are without excuse...' },
      { text: STONE_MORE },
    ] },
    { id: 'a-prophet', num: 185, title: 'A Prophet', paragraphs: [
      { text: EARS[0] + '\n\n' + PROPHET[0] + '\n\n' + EARS[1] },
      { text: PROPHET[1].replace(', and what', '?\n\nAnd what') + '\n\n' + EARS[2] },
      { text: PROPHET[2] + '\n\n' + EARS[3] + '\n\n' + PROPHET[3] + '\n\n' + PROPHET[4] },
    ] },
  ],
  ANSWERS: [
    { id: 'calling-out', num: 2, title: 'I Am Calling You Out', paragraphs: [{ text: [filler(30), CALLED, filler(30)].join(' ✦ ') }] },
    { id: 'second-death', num: 1, title: 'Regarding the Second Death', paragraphs: [{ text: [filler(30), 'Behold the end of the wicked. ' + CUP + cite('The Cup Is Full'), filler(30)].join(' ✦ ') }] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('the original of a line its reprint cut (sealed2)', () => {
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

  it('an entry cut from two letters: the letter holding the typed line leads, the entry next', async () => {
    const top = ids(await E.search('and when does my servant become a prophet'));
    expect(top.slice(0, 2)).toEqual(['prophet-letter', 'a-prophet']);
  });

  it('an entry cutting two small words from its letter\'s line, typed as the entry words it: the letter leads, the entry next', async () => {
    const top = ids(await E.search('i have written it on tablets of stone'));
    expect(top.slice(0, 2)).toEqual(['stone-letter', 'only-witness']);
  });

  it('a letter first: the reprint holding its whole sentence comes up second, not a letter holding the sentence\'s end', async () => {
    const top = ids(await E.search('they refused to accept me as i truly am'));
    expect(top.slice(0, 2)).toEqual(['cup-letter', 'second-death']);
  });

  it('typed words a letter holds only across a sentence\'s end are not its line: the topic holding them in one sentence leads', async () => {
    const top = ids(await E.search('the harlot has deceived you'));
    expect(top[0]).toBe('calling-out');
  });
});
