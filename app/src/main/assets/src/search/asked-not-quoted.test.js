/* A QUESTION OR A DESCRIPTION IS NO QUOTE (search200 sweep, 2026-10-22). originalsFirst hands a reprint's place (an
   Answers topic, a Words To Live By entry) to its original when the reprint's matched sentence or window shares enough
   typed words with one of the original's, or the entry is cut from a letter holding as much. That serves a reader
   remembering a line: the line's home is the original. A reader asking a question ("what happens if ...") or describing
   a text ("the short one about ...") typed no line, and the words the two texts share are the subject's or the frame's:
   the "original" was a verse sharing "happen" with the question, or the letter the short entry the reader asked for
   was cut from. Such a query keeps the order the words and the meaning gave, unless the reprint holds the typed words
   as a quote (in a row, or B4's alignment). Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'from', 'me', 'or', 'they', 'them', 'this', 'him', 'their', 'what', 'why', 'does', 'do', 'one', 'about', 'like']);
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
const LINES = [
  'Envy leads to hate, and jealousy brings forth every evil work in the hearts of the proud.',
  'Remember the gallows Haman built for another, for upon them he himself was hanged.',
  'Walk not in the way of Cain, who slew his brother because his own works were evil.',
  'Let love cover your brother, and the bitter root shall find no ground in you.',
];
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 30, sections: [{ heading: '', verses: Array.from({ length: 200 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger turn in the house of kings, ' + ['east', 'west', 'north', 'south'][i % 4] + '.' })) }] },
    ] },
  },
  LETTERS_V4: [
    // the letter the entry is cut from: its lines among much else
    { id: 'wolves-letter', num: 1, title: 'Keep the Wolves Away', blocks: [para(filler(8) + LINES.join(' ') + ' ' + filler(8))] },
  ],
  WTLB_TWO: [
    // the short entry, its lines cut from the letter
    { id: 'gallows-entry', num: 7, title: 'The Gallows', paragraphs: [{ text: LINES.join(' ... ') }] },
  ],
};
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a question or a description is no quote (search200 sweep)', () => {
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

  it('the subject\'s words typed: the letter the entry is cut from leads it (the original first)', async () => {
    expect(ids(await E.search('haman cain envy hate')).slice(0, 2)).toEqual(['wolves-letter', 'gallows-entry']);
  });

  it('"the short one about ...": the entry described keeps its place', async () => {
    expect(ids(await E.search('the short one about haman and cain and envy leading to hate'))[0]).toBe('gallows-entry');
  });

  it('a reader\'s question (of the Lord, or of the reader\'s own walk) keeps the order the words gave', async () => {
    expect(ids(await E.search('what does god say about envy and hate like haman and cain'))[0]).toBe('gallows-entry');
    expect(ids(await E.search('why do i envy and hate like haman and cain'))[0]).toBe('gallows-entry');
  });

  it('a question in no reader\'s voice may be a line remembered: the letter first', async () => {
    expect(ids(await E.search('why does envy lead to hate like haman and cain')).slice(0, 2)).toEqual(['wolves-letter', 'gallows-entry']);
  });

  it('a question that is a line typed whole still finds the letter first', async () => {
    expect(ids(await E.search('who slew his brother because his own works were evil')).slice(0, 2)).toEqual(['wolves-letter', 'gallows-entry']);
  });
});
