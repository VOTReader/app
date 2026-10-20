/* A stop word takes no prefix forms (search200 fix1). Only the trimmed list was asked, so "who", "can" and
   "all", stop words of the full list kept for their meaning, reached forward to "whole", "canaan" and
   "altar": a text full of those met the typed word it never held. Fixture texts only (no benchmark query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS: new Set(['the', 'a', 'of', 'and', 'in', 'he', 'then', 'who', 'can', 'all', 'were']),
  STOP_WORDS_TRIMMED: new Set(['the', 'a', 'of', 'and', 'in', 'he', 'then', 'were']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: {}, BOOK_DISPLAY: {},
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const GLOBALS = {
  BOOKS: {},
  LETTERS_V4: [
    { id: 'whole', num: 1, title: 'The City', blocks: [para('The whole city wept, the whole of it, wholly.')] },
    { id: 'who', num: 2, title: 'The Mourner', blocks: [para('Who then? He wept, and the people of the land were many, and the fields were wide and green.')] },
  ],
};
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: a stop word matches itself, not words it begins', () => {
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

  it('"who wept" opens on the text holding "who", not on the one holding "whole"', async () => {
    const r = await VotSearchMini.search('who wept');
    expect(refs(r)[0]).toBe('Volume Four · Letter 2');
    const whole = r.results.find((x) => x.doc.ref === 'Volume Four · Letter 1');
    expect(whole ? whole.terms || [] : []).not.toContain('whole');
  });
});
