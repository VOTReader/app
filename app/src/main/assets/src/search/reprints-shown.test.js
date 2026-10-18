/* THE ORIGINAL FIRST, ITS REPRINT SECOND, BOTH SHOWN (search200 R1, 2026-10-18). Corbin (DECISIONS 10-14): "the
   original first, its reprint second, both shown". Round 2 of the tri bench's open misses of that kind, each on a
   fixture shaped like its texts:
   - an Answers topic prints a letter's line with one word in another form ("messengers" where the letter says
     "messenger"), and the reader types the topic's words: the letter, holding the line up to that word's form, leads;
   - a letter's line quotes a verse word for word, and the reader types the letter's own words around it: the verse
     it quotes comes up second, not a text that quotes the verse too;
   - an Answers topic found by its title opens on an excerpt it prints under a heading of its own: a topic printing
     that heading again comes up second, and the letter the excerpt cites after it.
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'has', 'from', 'me', 'or', 'they', 'them', 'have', 'this', 'him', 'much', 'shall', 'their', 'own']);
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
// a letter's line, and the Answers' print of it with one word in another form
const HEED = 'For I tell you the truth, whoever turns away from My Letters or My messenger has turned from Me toward his own desire.';
const HEEDS = HEED.replace('My messenger has', 'My messengers has');
// ...and a print of it with a word changed to another word
const HEED_SERVANTS = HEED.replace('My messenger has', 'My servants has');
const cite = (title) => ' ~ [From “' + title + '” ~ Volume 4]';
const SMOKE = 'Thus says The Lord: The nations feast upon the high places, and the smoke of their offerings goes up before Me continually!';
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger turn in the house of kings ' + i + '.' })) }] },
      { num: 31, sections: [{ heading: '', verses: [
        { n: 1, text: 'He who keeps watch at the gate of the city shall not be ashamed in the day of trouble, for his lamp is trimmed.' },
      ] }] },
    ] },
  },
  LETTERS_V4: [
    { id: 'heed-letter', num: 3, title: 'Heed My Words', blocks: [para(filler(12) + HEED + ' Pride has bound them, and the world holds them fast. ' + filler(12))] },
    { id: 'grain-letter', num: 4, title: 'The Grain', blocks: [para(filler(12) + 'Gather the grain before the rain, for the season turns. ' + filler(12))] },
    // a letter's line quoting the verse after a colon, and a letter quoting it too
    { id: 'watch-letter', num: 5, title: 'Keep Watch', blocks: [para(filler(12) + 'Children, have you not remembered this word: He who keeps watch at the gate of the city shall not be ashamed in the day of trouble, for his lamp is trimmed. ' + filler(12))] },
    { id: 'gate-letter', num: 6, title: 'At the Gate', blocks: [para(filler(2) + 'It is written, He who keeps watch at the gate of the city shall not be ashamed in the day of trouble, for his lamp is trimmed. Remembered by few. ' + filler(2))] },
    // a letter an Answers topic prints under a heading of the topic's own words, its own body never saying them
    { id: 'smoke-letter', num: 7, title: 'Smoke on the High Places', blocks: [para(SMOKE + ' ' + filler(14))] },
    // ...and letters thick with the topic's title words
    ...['Lanterns', 'Tents', 'Harvests', 'Seasons', 'Banners', 'Gates'].map((w, i) => ({
      id: 'feasts-' + i, num: 20 + i, title: 'Of ' + w,
      blocks: [para('The feasts of the nations are many, and the feasts of the nations are loud. '.repeat(3) + filler(2))],
    })),
  ],
  ANSWERS: [
    // three topics print the line with the plural, each denser in the typed words than the long letter
    ...['Scoffers', 'Pride', 'Obedience'].map((w, i) => ({
      id: w.toLowerCase() + '-topic', num: i + 1, title: 'Regarding ' + w,
      paragraphs: [{ text: [filler(1) + HEEDS + ' Pride has bound them.' + cite('Heed My Words'), 'Gather the grain before the rain.' + cite('The Grain')].join(' ✦ ') }],
    })),
    // a topic printing it with another word in the place of one: the letter does not hold that line
    { id: 'servants-topic', num: 4, title: 'Regarding Servants', paragraphs: [{ text: filler(1) + HEED_SERVANTS + ' Pride has bound them.' + cite('Heed My Words') }] },
    // a topic opening on a heading of its own over an excerpt of the letter, the letter's heading before it
    { id: 'feasts-topic', num: 5, title: 'Regarding the Feasts of the Nations', paragraphs: [
      { align: 'center', text: '**The Feasts of the Nations Grieve the Name of The Lord**' },
      { text: '3/4/09 From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy For All Those Who Have Ears to Hear (Regarding the feasts of the nations) ' + SMOKE + cite('Smoke on the High Places') + ' ✦ Gather the grain before the rain.' + cite('The Grain') },
    ] },
    // ...and a topic printing that heading and excerpt again, deep in it
    { id: 'idols-topic', num: 6, title: 'Regarding Idols', paragraphs: [
      { text: filler(6) + 'Gather the grain before the rain.' + cite('The Grain') + ' ✦ • The Feasts of the Nations Grieve the Name of The Lord 3/4/09 From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy For All Those Who Have Ears to Hear ' + SMOKE + cite('Smoke on the High Places') },
    ] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('the original first, its reprint second, both shown (R1)', () => {
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

  it('a line an Answers topic prints with a word in another form: the letter holding it so leads, a topic next', async () => {
    const top = ids(await E.search('or my messengers has turned from me toward his own desire'));
    expect(top[0]).toBe('heed-letter');
    expect(['scoffers-topic', 'pride-topic', 'obedience-topic']).toContain(top[1]);
  });

  it('a letter\'s line quoting a verse, found by the letter\'s own words: the verse it quotes comes up second', async () => {
    const top = ids(await E.search('children have you not remembered this word'));
    expect(top[0]).toBe('watch-letter');
    expect(top[1]).toBe('Proverbs 31:1');
  });

  it('a topic found by its title, opening on a heading of its own over an excerpt: the topic reprinting it next, then the letter it cites', async () => {
    const top = ids(await E.search('feasts of the nations'));
    expect(top.slice(0, 3)).toEqual(['feasts-topic', 'idols-topic', 'smoke-letter']);
  });

  it('a line a topic prints with another word in a word\'s place: the topic holding the typed run leads', async () => {
    expect(ids(await E.search('or my servants has turned from me toward his own desire'))[0]).toBe('servants-topic');
  });
});
