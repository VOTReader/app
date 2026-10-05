/* The ranking the search audit measured (2026-09-27), on a fixture where the old one
   loses: a long topic holding every common word outranked the short verse or letter
   the reader quoted; a phrase one word off lost its letter; a title typed whole lost
   to texts holding its words; a word in a title counted for almost nothing once verses,
   which have no title, pulled the average title under one word. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const STOP = new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'will', 'shall', 'like', 'no', 'man', 'but', 'me', 'by', 'am']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: { wisdom: ['wisdom', 'discernment', 'understanding'], discernment: ['wisdom', 'discernment', 'understanding'] },
  BOOK_ABBREVS: { john: 'john' }, BOOK_DISPLAY: { john: 'John' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: ['john'], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
// Verses outnumber titled texts, as in the corpus: MiniSearch's average title is then
// under one word, the condition the title's floor answers (ranking.js KEYWORD_BM25).
const FILLER = Array.from({ length: 40 }, (_, i) => ({ n: 7 + i, text: 'And the people went up to the city, and they sat down there. ' + i }));
const WATCHMAN = 'Hear Me, O My people. To this day you persecute My prophets and stone My servants, says The Lord. Repent, and turn from your ways, for the hour is late and the harvest is near.';
const topic = (words, n) => Array.from({ length: n }, (_, i) => words[i % words.length] + ' is spoken of here, and more besides.').join(' ');
const GLOBALS = {
  BOOKS: {
    john: { id: 'john', title: 'John', chapters: [{ num: 14, sections: [{ heading: '', verses: [{ n: 6, text: 'Jesus said to him, I am the way, the truth, and the life. No one comes to the Father except through Me.' }].concat(FILLER) }] }] },
  },
  LETTERS_V1: [
    { id: 'garment', num: 1, title: 'All Things Pass', blocks: [{ segments: [{ v: 'Hear Me. The earth will grow old like a garment, and all its works shall be burned up.' }] }] },
    { id: 'discern', num: 2, title: 'Discernment', blocks: [{ segments: [{ v: 'Wisdom and discernment and understanding: seek wisdom, love discernment, gain understanding. '.repeat(4) }] }] },
    { id: 'wisdom', num: 3, title: 'Wisdom', blocks: [{ segments: [{ v: 'Hear, O My people, and be wise. ' + 'Hear My words. '.repeat(40) }] }] },
    { id: 'humility', num: 4, title: 'Humility and The Word of God', blocks: [{ segments: [{ v: 'Walk in humility before Me, and keep My word, says The Lord. Take heed, and do what is right in My sight, for the day is near.' }] }] },
    { id: 'evident', num: 5, title: 'Evident', blocks: [{ segments: [{ v: 'Let your humility be evident.' }] }] },
    { id: 'watchman', num: 6, title: 'The Watchman', blocks: [{ segments: [{ v: WATCHMAN }] }] },
    { id: 'false-prophets', num: 7, title: 'False Prophets Among You', blocks: [{ segments: [{ v: 'Beware of false prophets, for false prophets are many, and the false prophets speak lies.' }] }] },
    { id: 'silver', num: 9, title: 'The Silver Cord', blocks: [{ segments: [{ v: 'Hear Me. The silver cord is loosed and the golden bowl is broken, says The Lord, and the pitcher is shattered at the fountain.' }] }] },
    { id: 'creator', num: 8, title: 'In the Days of Your Youth', blocks: [{ segments: [{ v: 'Hear Me. Remember now your Creator in the days of your youth, before the difficult days come, says The Lord.' }] }] },
  ],
  ANSWERS: [
    // the long compilation that holds every word, everywhere
    { id: 'long-topic', num: 1, title: 'Regarding Many Things', paragraphs: [{ text: topic(['way', 'truth', 'life', 'Father', 'comes', 'earth', 'grow', 'old', 'garment', 'Jesus', 'said', 'wisdom'], 400) }] },
    // a topic that reprints the letter, and quotes its passage once more
    { id: 'persecution', num: 2, title: 'Regarding Persecution', paragraphs: [{ text: WATCHMAN + ' To this day you persecute My prophets.' }] },
    { id: 'false-prophets-topic', num: 3, title: 'Regarding False Prophets', paragraphs: [{ text: 'The Lord speaks of false prophets. ' + topic(['watch', 'pray', 'stand', 'endure', 'repent', 'hear', 'obey', 'walk', 'turn', 'love', 'wait', 'seek'], 60) }] },
    // a topic that reprints the letter and dwells on its words (search benchmark, 2026-10-05)
    // a long topic holding the same few words over and over, never together (search benchmark, 2026-10-05)
    { id: 'scattered', num: 5, title: 'Regarding Seasons', paragraphs: [{ text: Array.from({ length: 40 }, (_, i) => ['remember', 'creator', 'days', 'come', 'young'][i % 5] + ' is spoken of here. ' + 'The field is sown and the grain is gathered in its season. '.repeat(4)).join('') }] },
    { id: 'late-hour', num: 4, title: 'Regarding the Hour', paragraphs: [{ text: 'The hour is late; turn, and repent, says The Lord. '.repeat(12) + WATCHMAN }] },
    // a chain of cited excerpts, as the Answers are: one reprints a letter, the rest hold the query's words apart (2026-10-05)
    { id: 'excerpts', num: 6, title: 'Regarding Silver', paragraphs: [{ text: [
      'The silver cord is loosed and the golden bowl is broken, says The Lord. ~ [From “The Silver Cord” ~ Volume 1]',
      ...Array.from({ length: 12 }, (_, i) => ['Silver snaps', 'The cord breaks', 'Gold', 'The bowl', 'The fountain', 'When it snaps'][i % 6] + ' is spoken of here, and the potter and the pitcher besides; the wheel turns. ~ [From “The Watchman” ~ Volume 1]'),
    ].join(' ✦ ') }] },
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref + (x.doc.kind === 'verse' ? '' : ' · ' + x.doc.title));

describe('ranking on the audit\u2019s cases', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await VotSearchMini.init();
  });
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('a quoted verse outranks a long topic holding every one of its words', async () => {
    expect(refs(await VotSearchMini.search('I am the way, the truth, and the life: no man cometh unto the Father, but by me'))[0]).toBe('John 14:6');
  });

  it('a phrase one word off still finds its letter first ("shall" for "will")', async () => {
    expect(refs(await VotSearchMini.search('The earth shall grow old like a garment'))[0]).toBe('Volume One · Letter 1 · All Things Pass');
  });

  it('a word in a title counts: "humility" finds the letter titled with it before a line that mentions it', async () => {
    expect(refs(await VotSearchMini.search('humility'))[0]).toBe('Volume One · Letter 4 · Humility and The Word of God');
  });

  it('a passage quoted finds its letter before the topic that reprints it, quoted or not', async () => {
    expect(refs(await VotSearchMini.search('to this day you persecute my prophets'))[0]).toBe('Volume One · Letter 6 · The Watchman');
    expect(refs(await VotSearchMini.search('"to this day you persecute"'))[0]).toBe('Volume One · Letter 6 · The Watchman');
  });

  /* A remembered sentence came back with the topic that reprints it first (search benchmark
     2026-10-05: 74 of 187 open misses). The original takes the reprint's place. */
  it('a quote remembered a word off finds the original before a topic that reprints it and dwells on its words', async () => {
    const q = 'repent and turn from your paths, for the hour is late';
    const r = refs(await VotSearchMini.search(q));
    expect(r[0]).toBe('Volume One · Letter 6 · The Watchman');
    expect(r).toContain('Answers Only God Can Give · Regarding the Hour');
  });

  /* A remembered sentence in the reader's own words: a long topic holds its few words, far apart, and
     outscored the short letter holding them together (search benchmark 2026-10-05). */
  it('a sentence put in other words finds the passage holding its words together, not a topic scattering them', async () => {
    expect(refs(await VotSearchMini.search('remember the creator while you are young before the days come'))[0]).toBe('Volume One · Letter 8 · In the Days of Your Youth');
  });

  /* An Answers topic is a chain of excerpts, each naming its letter: one reprints the passage meant and
     the rest hold its words apart, and the whole topic counted as holding them all (search benchmark
     2026-10-05: an Answers topic first in 47 of 108 open misses). The letter comes first. */
  it('a passage in other words finds its letter before the Answers topic that excerpts it', async () => {
    const r = refs(await VotSearchMini.search('when the silver cord snaps and the gold bowl breaks at the fountain'));
    expect(r[0]).toBe('Volume One · Letter 9 · The Silver Cord');
    expect(r).toContain('Answers Only God Can Give · Regarding Silver');
  });

  it('a word or two is a keyword search: the topic titled with them comes first', async () => {
    expect(refs(await VotSearchMini.search('false prophets'))[0]).toBe('Answers Only God Can Give · Regarding False Prophets');
  });

  it('a quote nothing holds word for word is searched as its words, and says so', async () => {
    const r = await VotSearchMini.search('"The earth shall grow old like a garment"');
    expect(r.unquoted).toBe('The earth shall grow old like a garment');
    expect(refs(r)[0]).toBe('Volume One · Letter 1 · All Things Pass');
    // a quote the text holds stays a quote
    expect((await VotSearchMini.search('"grow old like a garment"')).unquoted).toBeUndefined();
  });

  it('a one-word title typed whole ranks its letter above a text rich in its synonyms', async () => {
    expect(refs(await VotSearchMini.search('Wisdom'))[0]).toBe('Volume One · Letter 3 · Wisdom');
  });
});
