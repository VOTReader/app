/* A RUN OF COMMON WORDS STAYS READ WITH THE KJV WORDING IN (search200 fix1 "ed", 2026-10-20). A typed run is looked
   for in every text holding its rarest word when the index holds that word in no more than RUN_HOLDERS texts
   (engine.js runHolders); counted over both wordings, the verses holding it in the KJV alone pushed a common word past
   the bound, the run went unread, and a letter holding it word for word below the 500 best-scored texts lost its
   boost. The bound is the index's own count. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { encodeKjvTwin, parseKjvTwin } from './kjv-twin.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'a', 'of', 'and', 'to', 'by', 'in', 'was', 'there', 'with']), SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
// 4,980 short verses hold the three words apart, in both wordings; 40 hold "olm" in their KJV wording alone
const APART = Array.from({ length: 4980 }, (_, i) => `The olm went down by the pid to the rax, verse ${i}.`);
const OWN = Array.from({ length: 40 }, (_, i) => `The pid was there with the rax, line ${i}.`);
const KJV = Array.from({ length: 40 }, (_, i) => `The olm was there with the pid and the rax, line ${i}.`);
const filler = 'The farmer walks the long field at evening and counts the sheaves that the reapers bound in the morning. '.repeat(12);
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 1, sections: [{ heading: '', verses: APART.map((text, i) => ({ n: i + 1, text })) }] },
      { num: 2, sections: [{ heading: '', verses: OWN.map((text, i) => ({ n: i + 1, text })) }] },
    ] },
  },
  // a long letter holding the run word for word: the short verses outscore it on the words
  LETTERS_V4: [{ id: 'run-letter', num: 1, title: 'The Field', blocks: [para(filler + 'And so the olm pid rax was seen. ' + filler)] }],
};
const TWIN = parseKjvTwin(JSON.parse(JSON.stringify(encodeKjvTwin({
  proverbs: { 1: APART.map((text, i) => ({ n: i + 1, text })), 2: KJV.map((text, i) => ({ n: i + 1, text })) },
}, 'fixture'))));
const first = async (/** @type {string} */ q) => {
  const r = await E.search(q);
  const x = r.results[0];
  return x && (x.doc.kind === 'verse' ? x.doc.ref : x.doc.letterId);
};

describe('a run of common words, with the KJV wording in', () => {
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

  it('is read in every text holding its rarest word when the index holds that word in few enough', async () => {
    expect(await first('olm pid rax')).toBe('run-letter');
    // the KJV wording's 40 verses take "olm" past the bound counted over both wordings: the run is still read
    E.setKjvTwin(TWIN);
    expect(await first('olm pid rax')).toBe('run-letter');
  }, 60000);
});
