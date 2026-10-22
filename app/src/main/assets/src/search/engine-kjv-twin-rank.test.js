/* THE READER'S EDITION FIRST (search200 fix2 "ed"). A verse's KJV wording is a second reading of it, and the card shows
   the first: a text holding the typed run in the words it shows leads a verse holding it in its KJV wording alone; a
   title saying a verse's own words is not capped by that verse found in its KJV words; a word a verse holds in its KJV
   wording alone counts as a form of the typed word does. Fixture texts only (no bench query); every case puts the
   engine's wording back. */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { encodeKjvTwin, parseKjvTwin } from './kjv-twin.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'has', 'they', 'their', 'them', 'do', 'from', 'unto', 'while']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (/** @type {number} */ n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const FILL = Array.from({ length: 40 }, (_, i) => 'The ant and the rock badger, the locust and the spider, in the house of kings ' + i + '.');
/** The reader's edition, and the same verses in the KJV's words. */
const NKJV = [
  'Then the watchman cried aloud: And I saw a lamp fallen from the tower to the street.',
  'For I am the keeper, I do not slumber; therefore the gate is not broken.',
  'The grain was set apart for the offering of the field.',
];
const KJV = [
  'And the watchman cried, and I saw a lamp fall from the tower unto the street.',
  'For I am the keeper, I slumber not; therefore the gate is not broken.',
  'The grain was set apart for smirch.',
];
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 1, sections: [{ heading: '', verses: FILL.map((text, i) => ({ n: i + 1, text })) }] },
      { num: 2, sections: [{ heading: '', verses: NKJV.map((text, i) => ({ n: i + 1, text })) }] },
    ] },
  },
  LETTERS_V4: [
    // a letter whose own line is the KJV's words of Proverbs 2:1, in a longer text
    { id: 'lamp-letter', num: 3, title: 'The Sleepers', blocks: [para('I saw a lamp fall from the tower, while the sleepers laughed. ' + filler(2))] },
    // a letter holding a word Proverbs 2:3 holds in its KJV wording alone, in a longer text
    { id: 'smirch-letter', num: 4, title: 'The Field', blocks: [para(filler(2) + 'Smirch is upon the field. ' + filler(2))] },
  ],
  ANSWERS: [
    // a topic titled with Proverbs 2:2 in the reader's edition
    { id: 'keeper', num: 1, title: 'I Am The Keeper, I Do Not Slumber', paragraphs: [{ text: 'I am the keeper, I do not slumber. The keeper does not slumber, and the keeper keeps the gate.' }] },
  ],
};
const TWIN = parseKjvTwin(JSON.parse(JSON.stringify(encodeKjvTwin({
  proverbs: { 1: FILL.map((text, i) => ({ n: i + 1, text })), 2: KJV.map((text, i) => ({ n: i + 1, text })) },
}, 'fixture'))));
const refs = async (/** @type {string} */ q) => (await E.search(q)).results.map((/** @type {any} */ x) =>
  x.doc.kind === 'verse' ? x.doc.ref : x.doc.kind === 'answers' ? x.doc.title : x.doc.letterId);

describe('the reader’s edition first, with the KJV wording in', () => {
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

  it('a text holding the run in the words it shows leads a verse holding it in its KJV wording alone', async () => {
    const q = 'i saw a lamp fall from the tower';
    E.setKjvTwin(TWIN);
    const r = await refs(q);
    expect(r[0]).toBe('lamp-letter');
    expect(r).toContain('Proverbs 2:1');
  });

  it('a title saying a verse’s own words is not capped by that verse typed in its KJV words', async () => {
    const q = 'i am the keeper i slumber not';
    E.setKjvTwin(TWIN);
    const r = await refs(q);
    expect(r[0]).toBe('I Am The Keeper, I Do Not Slumber');
    expect(r).toContain('Proverbs 2:2');
  });

  it('a word a verse holds in its KJV wording alone counts as a form of the typed word', async () => {
    E.setKjvTwin(TWIN);
    const r = await refs('smirch');
    expect(r[0]).toBe('smirch-letter');
    expect(r).toContain('Proverbs 2:3');
  });
});
