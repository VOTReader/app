/* A POOL IS READ IN THE READER'S EDITION FIRST (search200 fix2 "ed"). The phrase ranking reads the PHRASE_CANDIDATES
   best-scored texts holding the typed words (and the alignment its ALIGN_CANDIDATES); read on the two readings alone,
   verses holding the words in their KJV wording filled the pool, and a letter holding them one word off in a row,
   which the reader's edition puts among the best, was never read. The pool is the best as the reader's edition scores
   them, and beside them the best the KJV wording brings. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { encodeKjvTwin, parseKjvTwin } from './kjv-twin.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'a', 'of', 'and', 'to', 'by', 'in', 'was', 'there', 'with', 'is']), SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
// N short verses say other words in the reader's edition, and the four typed words over again, out of order, in the KJV's
const N = 600;
const tag = (/** @type {number} */ i) => i.toString(36).replace(/\d/g, (d) => 'qwertyuiop'[+d]);
// ...among M verses holding none of them in either wording
const M = 3000;
const REST = Array.from({ length: M }, (_, i) => `The ant and the rock badger in the house of kings, line ${tag(i)}.`);
// ...and H longer verses holding them apart in both wordings (the words are common in the reader's edition)
const H = 450;
const APART = Array.from({ length: H }, (_, i) => `The olm went down, and by the pid the rax and the tov were found in the long dry field of the west, line ${tag(i)}.`);
const OWN = Array.from({ length: N }, (_, i) => `The field is wide and the vine is green, line ${tag(i)}.`);
const KJV = Array.from({ length: N }, (_, i) => `Tov tov rax pid olm tov rax pid olm rax pid olm ${tag(i)}.`);
const filler = 'The farmer walks the long field at evening and counts the sheaves that the reapers bound in the morning. '.repeat(2);
const GLOBALS = {
  BOOKS: { proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
    { num: 1, sections: [{ heading: '', verses: REST.map((text, i) => ({ n: i + 1, text })) }] },
    { num: 2, sections: [{ heading: '', verses: OWN.map((text, i) => ({ n: i + 1, text })) }] },
    { num: 3, sections: [{ heading: '', verses: APART.map((text, i) => ({ n: i + 1, text })) }] },
  ] } },
  // a letter holding the typed words in a row with one word between
  LETTERS_V4: [{ id: 'row-letter', num: 1, title: 'The Field', blocks: [para(filler + 'And so the olm pid zed rax tov was seen. ' + filler)] }],
};
const TWIN = parseKjvTwin(JSON.parse(JSON.stringify(encodeKjvTwin({
  proverbs: { 1: REST.map((text, i) => ({ n: i + 1, text })), 2: KJV.map((text, i) => ({ n: i + 1, text })), 3: APART.map((text, i) => ({ n: i + 1, text })) },
}, 'fixture'))));
const first = async (/** @type {string} */ q) => {
  const r = await E.search(q);
  const x = r.results[0];
  return x && (x.doc.kind === 'verse' ? x.doc.ref : x.doc.letterId);
};

describe('a pool read in the reader’s edition first, with the KJV wording in', () => {
  /** @type {any} */ let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) /** @type {any} */ (globalThis)[k] = /** @type {any} */ (GLOBALS)[k];
    E.setKjvTwin(null);
    await E.init();
  }, 120000);
  afterAll(() => {
    E.setKjvTwin(null);
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete /** @type {any} */ (globalThis)[k];
  });

  it('keeps the text the reader’s edition reads among the best, though the KJV wording brings more', async () => {
    expect(await first('olm pid rax tov')).toBe('row-letter');
    E.setKjvTwin(TWIN);
    expect(await first('olm pid rax tov')).toBe('row-letter');
  }, 60000);
});
