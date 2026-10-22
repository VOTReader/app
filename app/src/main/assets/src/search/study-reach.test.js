/* A TOPIC GIVES ITS PLACE ONLY TO A STUDY OR HOLY DAYS TEXT THAT HOLDS IT (search200 fix1, 2026-10-19). An Answers
   topic near the top yields to a text just below it that holds the query as well: Answers reprints the studies and
   the Holy Days texts (6e2ceaaa6). The test let any kind below the topic's take its place, so a verse or a letter
   holding one or two of the typed words in a short passage led the topic that names the query in its title; and a
   study holding the common typed words, none of the one that names the topic, led it too. Now a topic its title
   names by a typed word yields only to a study or Holy Days text, and only one holding most of the typed words'
   rarity that the topic holds, its title included. A topic its title does not name still yields to any original
   below holding the query as well (a quote's letter or verse).
   Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'has', 'from', 'me', 'or', 'they', 'them', 'have', 'this', 'him', 'their', 'regarding']);
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
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger turn in the house of kings ' + i + '.' })) }] },
      // a short verse holding one of the typed words, not the one the topic's title names
      { num: 31, sections: [{ heading: '', verses: [{ n: 1, text: 'The keeper of the vines went out early.' }, { n: 2, text: 'Blow the trumpet in the land.' }] }] },
    ] },
  },
  LETTERS_V4: [
    { id: 'city-letter', num: 3, title: 'The Old City', blocks: [para(filler(6) + 'There were orchards in the old city, and fountains in its squares, and sheaves at its gates, and watchmen on its walls. ' + filler(6))] },
    // a letter holding one of the typed words, not the one the topic's title names
    { id: 'springs-letter', num: 4, title: 'The Hills', blocks: [para('The springs run clear in the hills. ' + filler(2))] },
    // a letter a topic below quotes, its line typed by its opening words
    { id: 'watch-letter', num: 5, title: 'Who Shall Stand', blocks: [para(filler(3) + 'Behold, the bright and fearful hour of the watch is near, and who shall stand when it comes? ' + filler(3))] },
  ],
  // topics naming a typed word in their titles, the typed words far apart in a long body
  ANSWERS: [
    { id: 'orchards-topic', num: 1, title: 'Regarding Orchards', paragraphs: [{ text: 'The orchards bear in their season. ' + filler(10) + 'The vines are many. ' + filler(10) }] },
    { id: 'fountains-topic', num: 4, title: 'Regarding Fountains', paragraphs: [{ text: 'Fountains rise in the court. ' + filler(10) + 'Springs feed them. ' + filler(10) }] },
    { id: 'cities-topic', num: 5, title: 'Regarding Cities', paragraphs: [{ text: filler(6) + 'Lanterns hang in its streets. ' + filler(6) }] },
    { id: 'lanterns-topic', num: 2, title: 'Regarding Lanterns', paragraphs: [{ text: 'Lanterns are lit at dusk. ' + filler(10) + 'Bring oil. ' + filler(10) }] },
    // a topic its title does not name, the typed words far apart in it
    { id: 'watchmen-topic', num: 6, title: 'Regarding Watchmen', paragraphs: [{ text: 'The trumpet sounds at dawn. ' + filler(10) + 'The walls stand. ' + filler(10) }] },
    // a topic its title names by a typed word, quoting the letter's line in a sentence of its own
    { id: 'hour-topic', num: 7, title: 'Regarding the Hour', paragraphs: [{ text: 'The hour is set. ' + filler(1) + 'For the bright and fearful hour of the watch? draws near... ' + filler(1) }] },
    { id: 'sheaves-topic', num: 3, title: 'Regarding Sheaves', paragraphs: [{ text: 'Sheaves lie in the field. ' + filler(10) + 'The gleaning is done. ' + filler(10) }] },
  ],
  BIBLE_STUDIES: [
    // a study holding one of the typed words, not the one the topic's title names
    { id: 'lamps', slug: 'lamps', title: 'Of Lamps', chapters: [
      { id: 'lamps-ch1', num: 1, title: 'The Wise Virgins', blocks: [para(filler(4) + 'Bring the oil before the bridegroom comes. ' + filler(4))] },
    ] },
    // a study holding the typed words as the topic does: what the topic reprints
    { id: 'harvest', slug: 'harvest', title: 'Of the Harvest', chapters: [
      { id: 'harvest-ch1', num: 1, title: 'The Field of Boaz', blocks: [para('The sheaves were bound at noon. ' + filler(4) + 'Ruth went gleaning after the reapers. ' + filler(4))] },
    ] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a topic yields only to a study or Holy Days text holding it (search200 fix1)', () => {
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

  it('a verse just below holding one typed word does not take the place of the topic its title names', async () => {
    expect(ids(await E.search('orchards vines'))[0]).toBe('orchards-topic');
  });

  it('a letter just below does not either', async () => {
    expect(ids(await E.search('fountains springs'))[0]).toBe('fountains-topic');
  });

  it('a study holding the common typed word, not the one the title names, stays below the topic', async () => {
    expect(ids(await E.search('lanterns oil'))[0]).toBe('lanterns-topic');
  });

  it('a topic its title does not name still gives way to a verse below holding the query as well', async () => {
    expect(ids(await E.search('trumpet walls')).slice(0, 2)).toEqual(['Proverbs 31:2', 'watchmen-topic']);
  });

  it('a quote typed by its opening words finds the letter it is from before the topic quoting it, its title or not', async () => {
    expect(ids(await E.search('for the bright and fearful hour of the')).slice(0, 2)).toEqual(['watch-letter', 'hour-topic']);
  });

  it('a study holding the typed words as the topic does still comes before it (6e2ceaaa6)', async () => {
    const r = ids(await E.search('sheaves gleaning'));
    expect(r.slice(0, 2)).toEqual(['harvest', 'sheaves-topic']);
  });
});
