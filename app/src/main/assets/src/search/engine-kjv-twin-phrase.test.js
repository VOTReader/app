/* A QUOTED PHRASE IS SHOWN FIRST WHERE IT IS READ (search200 fix2, the stack). A quoted phrase holds in either wording
   of a verse, and the card shows the reader's edition: a verse holding the phrase in the words it shows leads a verse
   holding it in its KJV wording alone, as a typed run does (engine-kjv-twin-rank.test.js). Fixture texts only (no
   bench query); every case puts the engine's wording back. */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { encodeKjvTwin, parseKjvTwin } from './kjv-twin.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'has', 'they', 'their', 'them', 'do', 'from', 'unto', 'when', 'there']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const FILL = Array.from({ length: 40 }, (_, i) => 'The ant and the rock badger, the locust and the spider, in the house of kings ' + i + '.');
/** The reader's edition, and the same verses in the KJV's words. */
const NKJV = [
  // the phrase in the words the card shows, in a longer verse
  'Then the watchman set the stones of the wall in their courses, one upon another, from the gate to the tower, and it was so.',
  // the phrase in its KJV wording alone ("So it happened" here), its words many times over in that wording
  'So it happened, whenever the watchmen saw that much grain was in the chest, that the scribe came up and counted it.',
];
const KJV = [
  'Then the watchman set the stones of the wall in their courses, one upon another, from the gate unto the tower: and it was so.',
  'And it was so, when the watchmen saw that there was much grain in the chest, that the scribe came up, and it was told, and it was counted, and it was so.',
];
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 1, sections: [{ heading: '', verses: FILL.map((text, i) => ({ n: i + 1, text })) }] },
      { num: 2, sections: [{ heading: '', verses: NKJV.map((text, i) => ({ n: i + 1, text })) }] },
    ] },
  },
  LETTERS_V4: [
    { id: 'field-letter', num: 3, title: 'The Field', blocks: [para('The Lord speaks to His people of the field and of the vineyard.')] },
  ],
};
const TWIN = parseKjvTwin(JSON.parse(JSON.stringify(encodeKjvTwin({
  proverbs: { 1: FILL.map((text, i) => ({ n: i + 1, text })), 2: KJV.map((text, i) => ({ n: i + 1, text })) },
}, 'fixture'))));
const refs = async (/** @type {string} */ q) => (await E.search(q)).results.map((/** @type {any} */ x) =>
  x.doc.kind === 'verse' ? x.doc.ref : x.doc.letterId);

describe('a quoted phrase, with the KJV wording in', () => {
  /** @type {any} */ let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) /** @type {any} */ (globalThis)[k] = /** @type {any} */ (GLOBALS)[k];
    E.setKjvTwin(null);
    await E.init();
  }, 60000);
  afterEach(() => E.setKjvTwin(null));
  afterAll(() => {
    E.setKjvTwin(null);
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete /** @type {any} */ (globalThis)[k];
  });

  it('the verse showing the phrase leads the verse holding it in its KJV wording alone', async () => {
    E.setKjvTwin(TWIN);
    const r = await refs('"and it was so"');
    expect(r[0]).toBe('Proverbs 2:1');
    expect(r).toContain('Proverbs 2:2');
  });

  it('without the KJV wording, only the verse showing the phrase holds it', async () => {
    const r = await refs('"and it was so"');
    expect(r[0]).toBe('Proverbs 2:1');
    expect(r).not.toContain('Proverbs 2:2');
  });
});
