/* ONE COMMON WORD IS NO SENTENCE OF THE QUERY (search200 fix1, 2026-10-19). originalsFirst lifts an original above
   a reprint near the top when the reprint's matched sentence is one of the original's: the sentence holds `need` of
   the typed words, half of them (three at most). With two typed words one is enough, and the commoner decided: an
   Answers topic named by the rare word reprints a letter's line holding the common one, and the letter led the topic
   (hunt topical M4: "people" for a query of two words). Where one word is enough, the sentence must hold half the
   typed words' rarity (log(1+N/df)) as well; a typed word the index lacks weighs as the rarest (df 1), not nothing.
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'from', 'me', 'or', 'they', 'them', 'this', 'him', 'their', 'regarding']);
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
const FORGET = 'Woe to the people who forget the Lord in the day of plenty.';
const rains = (n) => 'The rains fall on the hills and the valleys, and the rivers run down to the sea. '.repeat(n);
const HALLOWED = 'Keep My hallowed feasts in their seasons, says the Lord.';
const cite = (title) => ' ~ [From “' + title + '” ~ Volume 4]';
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger turn in the house of kings, ' + ['east', 'west', 'north', 'south'][i % 4] + '.' })) }] },
      // the common typed word of a synonym query, in many texts
      { num: 31, sections: [{ heading: '', verses: Array.from({ length: 30 }, (_, i) => ({ n: i + 1, text: 'The feasts were kept in the land, ' + ['east', 'west', 'north', 'south'][i % 4] + ' ' + i + '.' })) }] },
    ] },
  },
  LETTERS_V4: [
    { id: 'forget-letter', num: 1, title: 'In the Day of Plenty', blocks: [para(filler(6) + FORGET + ' Woe to the kings who forget the Lord in the day of plenty. ' + filler(6))] },
    { id: 'hallowed-letter', num: 2, title: 'In Their Seasons', blocks: [para(rains(12) + HALLOWED + ' ' + rains(12))] },
  ],
  ANSWERS: [
    // a topic its title names by a common typed word, reprinting a letter's line holding it, the other typed word one the index lacks
    { id: 'kings-topic', num: 2, title: 'Regarding Kings', paragraphs: [{ text: 'They numbered 144,000 at the gate. ' + filler(1) + 'Woe to the kings who forget the Lord in the day of plenty.' + cite('In the Day of Plenty') + ' ' + filler(2) }] },
    // a topic reprinting a letter's line holding the rare typed word's synonym and the common typed word
    { id: 'feasts-topic', num: 3, title: 'Regarding the Feasts of the Lord', paragraphs: [{ text: 'The feasts come in their seasons. ' + HALLOWED + cite('In Their Seasons') + ' ' + filler(1) }] },
    // a topic its title names by the rare typed word, reprinting a letter's line holding the common one
    { id: 'tanners-topic', num: 1, title: 'Regarding Tanners', paragraphs: [{ text: 'The tanners work the hides by the sea. ' + filler(1) + FORGET + cite('In the Day of Plenty') + ' ' + filler(2) }] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('one common word is no sentence of the query (search200 fix1)', () => {
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

  it('a topic its rare word names keeps its place over the letter of a line holding the common word', async () => {
    expect(ids(await E.search('tanners people')).slice(0, 2)).toEqual(['tanners-topic', 'forget-letter']);
  });

  it('a typed word the index lacks weighs as the rarest: the common word alone names no original', async () => {
    expect(ids(await E.search('zqxv kings'))[0]).toBe('kings-topic');
  });

  it('a synonym of a typed word weighs as the word: the line holding it names its letter first', async () => {
    expect(ids(await E.search('sacred feasts')).slice(0, 2)).toEqual(['hallowed-letter', 'feasts-topic']);
  });

  it('a line of the letter typed still finds the letter first', async () => {
    expect(ids(await E.search('forget plenty'))[0]).toBe('forget-letter');
  });
});
