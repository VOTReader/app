/* THE FIRST SEARCH AFTER A BUILD DOES NOT HOLD THE PAGE (sweep W68, 2026-10-14). The originals
   (every verse's and letter's sentences, keyed, and a letter's runs of words, which put an original
   above its reprint) were read on the first search after each build, in one block on the page's
   thread: 440 ms on a desktop, seconds on a phone, with the page frozen. They are read a slice at a
   time now, from an idle moment after the index swaps in; a search that comes first waits for them
   with the page live between slices, and finds what it always found. Separate file: the engine holds
   module-level state, and these cases need an index no other search has read. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini as E } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'is', 'my', 'of', 'and', 'a', 'in', 'like']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { psalms: 'psalms', ps: 'psalms' },
  BOOK_DISPLAY: { psalms: 'Psalms' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['psalms'], NT_BOOK_IDS: [], GENRE_GROUPS: { poetry: ['psalms'] },
  WORD_NUMS: {}, ROMAN_NUMS: {},
};
// Enough verses that reading their sentences takes many slices.
const WORDS = ['righteous', 'flourish', 'palm', 'cedar', 'lebanon', 'planted', 'house', 'courts', 'fruit', 'old', 'age', 'fresh', 'green', 'declare', 'upright', 'rock', 'unrighteousness', 'shepherd', 'waters', 'still'];
const verse = (n) => ({ n, text: Array.from({ length: 24 }, (_, i) => WORDS[(n * 7 + i * 3) % WORDS.length] + (i % 6 === 5 ? '.' : '')).join(' ') + ' ' + 'w' + n + '.' });
const GLOBALS = {
  BOOKS: { psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 92, sections: [{ heading: '', verses: Array.from({ length: 6000 }, (_, i) => verse(i + 1)) }] }] } },
};

describe('the originals are read a slice at a time (sweep W68)', () => {
  let prevData;
  beforeAll(async () => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await E.init();
  }, 60000);
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('a search that comes first lets the page run while they are read, and finds what a later one does', async () => {
    expect(E.getState().originals).not.toBe('ready');
    const seen = [];
    const tick = setInterval(() => seen.push(E.getState().originals), 0);
    const first = await E.search('righteous flourish palm cedar lebanon');
    clearInterval(tick);
    // The page ran (a timer fired) while they were being read, not only before or after.
    expect(seen).toContain('building');
    expect(E.getState().originals).toBe('ready');
    const again = await E.search('righteous flourish palm cedar lebanon');
    expect(first.results.map((r) => r.doc.ref)).toEqual(again.results.map((r) => r.doc.ref));
  }, 60000);
});
