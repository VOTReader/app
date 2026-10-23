/* A BOOK OR COLLECTION NAMED BESIDE THE WORDS (search200 sweep, scope-word.js): the name is where the text is, not a word
   it must hold. Read through the engine on a synthetic Bible, volume and Answers collection; every query here is made
   up for the fixture, none is a bench query. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';
import { scopeWord } from './scope-word.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'a', 'to', 'in', 'at', 'over', 'was', 'by', 'it', 'so', 'upon', 'he', 'his', 'from', 'about', 'can', 'only', 'give']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { haggai: 'haggai', hag: 'haggai', nehemiah: 'nehemiah', neh: 'nehemiah', john: 'john', jn: 'john', mark: 'mark', mk: 'mark', '1 john': '1john' },
  BOOK_DISPLAY: { haggai: 'Haggai', nehemiah: 'Nehemiah', john: 'John', mark: 'Mark', '1john': '1 John' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['haggai', 'nehemiah'], NT_BOOK_IDS: ['john', 'mark', '1john'], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const verses = (/** @type {string[]} */ texts) => [{ heading: '', verses: texts.map((text, i) => ({ n: i + 1, text })) }];
const filler = (/** @type {number} */ n) => 'The people went up to the house and sat by the gate until the evening came. '.repeat(n);
const GLOBALS = {
  BOOKS: {
    haggai: { id: 'haggai', title: 'Haggai', chapters: [{ num: 1, sections: verses([
      'The word came in the second year of the king.',
      'Consider your ways, for the barley is gathered and the lanterns are lit.',
      // a verse of the book naming its prophet twice and holding none of the subject's words
      'Then Haggai the prophet spoke, and Haggai the prophet said, Hear.',
    ]) }] },
    nehemiah: { id: 'nehemiah', title: 'Nehemiah', chapters: [{ num: 2, sections: verses([
      // a verse naming Haggai the man, and verses holding the subject's words many times over
      'Then Haggai the scribe came up to the wall.',
      'They carried lanterns, lanterns of brass, and lanterns of silver to the wall.',
      'The lanterns hung by the granite gate of the city.',
      'John the gatekeeper kept the keys of the tower.',
      'They brought barley to the gate, and barley to the tower, and barley to the wall.',
      'The barley lay in heaps by the barley floor.',
    ]) }] },
    john: { id: 'john', title: 'John', chapters: [{ num: 1, sections: verses([
      'The gatekeeper opens to him, and the sheep hear his voice.',
      'In the morning the fishermen drew their nets to the shore.',
    ]) }] },
    mark: { id: 'mark', title: 'Mark', chapters: [{ num: 1, sections: verses([
      'The harvest is plentiful, but the laborers are few.',
    ]) }] },
  },
  LETTERS_V1: [
    // a letter holding the subject's words, and "mark" as a common word
    { id: 'harvest-mark', num: 1, title: 'The Mark of the Harvest', blocks: [{ segments: [{ v: 'Beloved, the mark of the harvest is upon you; the harvest comes and the harvest is near. ' + filler(1) }] }] },
    { id: 'lamps', num: 2, title: 'Lamps in the Dark', blocks: [{ segments: [{ v: 'Light your lanterns, and keep the oil of your lanterns full, for the bridegroom comes. ' + filler(1) }] }] },
    { id: 'keepers', num: 3, title: 'The Keeper’s Watch', blocks: [{ segments: [{ v: 'The keeper keeps watch through the night, and the keeper rests at dawn. ' + filler(1) }] }] },
    ...Array.from({ length: 6 }, (_, k) => ({ id: 'plain-' + k, num: 10 + k, title: 'Words ' + k, blocks: [{ segments: [{ v: filler(2) }] }] })),
  ],
  ANSWERS: [
    // the collection's own front page: titled with its name, and holding its words
    { id: 'front', num: 0, title: 'Answers Only God Can Give', paragraphs: [{ text: 'Answers Only God Can Give. The Lord answers what many have asked, on many topics. ' + filler(2) }] },
    { id: 'regarding-lanterns', num: 1, title: 'Regarding Lamps', paragraphs: [{ text: 'Should the lanterns burn on the holy day? ' + filler(3) }] },
    // a topic quoting a letter and citing it by title and collection
    { id: 'regarding-watching', num: 3, title: 'Regarding Watching', paragraphs: [{ text: 'Watch and be ready. ~ From “The Keeper’s Watch” ~ Volume One ~ ' + filler(3) }] },
    { id: 'regarding-gates', num: 2, title: 'Regarding Gates', paragraphs: [{ text: 'Who keeps the gates? ' + filler(3) }] },
  ],
};

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

const first = (/** @type {any} */ r) => {
  const d = r.results[0] && r.results[0].doc;
  return !d ? null : d.kind === 'verse' ? `${d.bookId} ${d.chapterNum}:${d.verseNum}` : `${d.volumeId}/${d.letterId}`;
};

describe('scopeWord reads a book or collection named at an edge', () => {
  it('a book at the start or end, the joining small words off the rest', () => {
    expect(scopeWord('haggai lanterns')).toMatchObject({ book: 'haggai', rest: 'lanterns' });
    expect(scopeWord('lanterns in haggai')).toMatchObject({ book: 'haggai', rest: 'lanterns' });
    expect(scopeWord('first john fishermen')).toMatchObject({ book: '1john', rest: 'fishermen' });
  });
  it('a collection by its full name, at either end', () => {
    expect(scopeWord('answers only god can give about lanterns')).toMatchObject({ volumes: ['answers'], rest: 'lanterns' });
    expect(scopeWord('lanterns in volume one')).toMatchObject({ volumes: ['v1'], rest: 'lanterns' });
  });
  it('none: a name alone, a reference shape, a quote, a name inside the words', () => {
    expect(scopeWord('haggai')).toBeNull();
    expect(scopeWord('haggai 1 lanterns')).toBeNull();
    expect(scopeWord('"haggai lanterns"')).toBeNull();
    expect(scopeWord('the lanterns of haggai are lit')).toBeNull();
    expect(scopeWord('mark harvest')).toMatchObject({ book: 'mark', wordish: true });
  });
});

describe('a book named beside the words leads with its verses', () => {
  it('the book’s verse holding the words leads over verses elsewhere and the verse naming the man', async () => {
    expect(first(await VotSearchMini.search('haggai lanterns'))).toBe('haggai 1:2');
    expect(first(await VotSearchMini.search('lanterns in haggai'))).toBe('haggai 1:2');
  });
  it('a verse of the book that only names its prophet gives way to the book’s verse holding the words', async () => {
    expect(first(await VotSearchMini.search('haggai barley'))).toBe('haggai 1:2');
  });
  it('a book holding none of the words leaves the words’ order', async () => {
    const plain = await VotSearchMini.search('granite gate');
    const named = await VotSearchMini.search('haggai granite gate');
    expect(first(named)).toBe(first(plain));
  });
  it('a name held with the words in a row is a name, not the book (a person typed with his title)', async () => {
    expect(first(await VotSearchMini.search('john the gatekeeper'))).toBe('nehemiah 2:4');
  });
  it('a book named by an English word needs more than a tie', async () => {
    expect(first(await VotSearchMini.search('mark harvest'))).toBe('v1/harvest-mark');
  });
});

describe('a collection named beside the words leads with its texts', () => {
  it('its topic holding the words leads over its front page and the other collections', async () => {
    expect(first(await VotSearchMini.search('answers only god can give lanterns'))).toBe('answers/regarding-lanterns');
  });
  it('a text holding the typed words in a row keeps its place (a citation typed whole, its apostrophe dropped)', async () => {
    expect(first(await VotSearchMini.search('from the keepers watch volume one'))).toBe('answers/regarding-watching');
  });
  it('at the end, after a joining word', async () => {
    expect(first(await VotSearchMini.search('lanterns in volume one'))).toBe('v1/lamps');
  });
});
