/* A VERSE'S TWO WORDINGS ARE READ APART IN A WINDOW TOO (search200 fix2 "ed"). The token store and the passage lemmas
   hold a verse's KJV wording after its own, TWIN_GAP between; a passage window reaches 1.6 times the typed words either
   side of a word, past the gap for a long query, and read the end of one wording and the start of the other as one
   passage. Each wording is read alone. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { encodeKjvTwin, parseKjvTwin } from './kjv-twin.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'a', 'an', 'of', 'and', 'by', 'were', 'there', 'stood', 'grew']), SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const FILL = Array.from({ length: 40 }, (_, i) => 'The ant and the rock badger, the locust and the spider, in the house of kings ' + i + '.');
// the first five typed words close the verse's own wording, and the other five open its KJV wording
const OWN = 'The keepers planted by the river the alder birch cedar dogwood elm';
const KJV = 'Fir gum hazel ironwood juniper grew by the river of the keepers.';
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 1, sections: [{ heading: '', verses: FILL.map((text, i) => ({ n: i + 1, text })) }] },
      { num: 2, sections: [{ heading: '', verses: [{ n: 1, text: OWN }] }] },
    ] },
  },
  // a letter holding seven of the ten in one passage, in no order
  LETTERS_V4: [{ id: 'grove-letter', num: 1, title: 'The Grove', blocks: [para('The elm stood by the alder, and the fir by the cedar; the birch, the gum and the dogwood were there.')] }],
};
const TWIN = parseKjvTwin(JSON.parse(JSON.stringify(encodeKjvTwin({
  proverbs: { 1: FILL.map((text, i) => ({ n: i + 1, text })), 2: [{ n: 1, text: KJV }] },
}, 'fixture'))));
const refs = async (/** @type {string} */ q) => (await E.search(q)).results.map((/** @type {any} */ x) => x.doc.kind === 'verse' ? x.doc.ref : x.doc.letterId);

describe('a verse’s two wordings, read apart in a passage window', () => {
  /** @type {any} */ let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) /** @type {any} */ (globalThis)[k] = /** @type {any} */ (GLOBALS)[k];
    E.setKjvTwin(null);
    await E.init();
  }, 60000);
  afterAll(() => {
    E.setKjvTwin(null);
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete /** @type {any} */ (globalThis)[k];
  });

  it('a verse holding half the query in each wording holds no passage of more than half of it', async () => {
    const q = 'alder birch cedar dogwood elm fir gum hazel ironwood juniper';
    expect((await refs(q))[0]).toBe('grove-letter');
    E.setKjvTwin(TWIN);
    const r = await refs(q);
    expect(r[0]).toBe('grove-letter');
    expect(r).toContain('Proverbs 2:1');
  });
});
