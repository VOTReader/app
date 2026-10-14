/* THE RANKING GIVES THE PAGE TURNS (sr7, 2026-10-14). With the originals read (sweep W68), a first
   search still ranked in one block: 110-400 ms on a desktop, about 350 ms on the S22, the page frozen
   under the reader's typing. It yields whenever a slice is spent now, and a search the screen has
   moved past (its signal aborted) stops at its next turn instead of ranking for nobody. Separate file:
   the engine holds module-level state, and these cases need an index of their own. */
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
// Many verses holding the query's words, so ranking them takes many slices.
const WORDS = ['righteous', 'flourish', 'palm', 'cedar', 'lebanon', 'planted', 'house', 'courts', 'fruit', 'old', 'age', 'fresh', 'green', 'declare', 'upright', 'rock', 'unrighteousness', 'shepherd', 'waters', 'still'];
const verse = (n) => ({ n, text: Array.from({ length: 24 }, (_, i) => WORDS[(n * 7 + i * 3) % WORDS.length] + (i % 6 === 5 ? '.' : '')).join(' ') + ' ' + 'w' + n + '.' });
const GLOBALS = {
  BOOKS: { psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 92, sections: [{ heading: '', verses: Array.from({ length: 6000 }, (_, i) => verse(i + 1)) }] }] } },
};
const Q = 'righteous flourish palm cedar lebanon planted house';
const refs = (r) => r.results.map((x) => x.doc.ref);

describe('the ranking gives the page turns (sr7)', () => {
  let prevData;
  beforeAll(async () => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await E.init();
    // the idle read of the originals (W68): what is left to a search is its own ranking
    while (E.getState().originals !== 'ready') await new Promise((r) => setTimeout(r, 20));
  }, 60000);
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('a timer runs while a search ranks, and the search finds what it finds again', async () => {
    let ticks = 0;
    const tick = setInterval(() => { ticks++; }, 0);
    const first = await E.search(Q);
    clearInterval(tick);
    expect(ticks, 'the page ran between slices of the ranking').toBeGreaterThan(0);
    expect(first.results.length).toBeGreaterThan(0);
    expect(refs(await E.search(Q))).toEqual(refs(first));
  }, 60000);

  it('a search whose signal is aborted stops at its next turn', async () => {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 0);
    const r = await E.search(Q, { signal: ctl.signal });
    expect(r.aborted).toBe(true);
    expect(r.results).toEqual([]);
  }, 60000);
});
