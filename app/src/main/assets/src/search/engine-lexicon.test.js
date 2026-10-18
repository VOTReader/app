/* THE SUBSTITUTION LEXICON IN THE ENGINE (search200 B7, 2026-10-18). A quote remembered with a word traded for
   another (creator for Maker, broad for wide) leads when the lexicon knows the pair, and only then; a query some
   text holds as typed ranks exactly as it does with no lexicon. The app names a lexicon file
   (setAlignLexiconSource), read beside the index; one that fails to load is no lexicon. Fixture texts and pairs only
   (no bench query, no shipped lexicon). Every case puts the engine's lexicon back, so the cases pass in any order. */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { VotSearchMini as E } from './engine.js';
import { parseLexicon } from './lexicon.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'my', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'are', 'be', 'with', 'all', 'on', 'who', 'by', 'was', 'at', 'so', 'your', 'has', 'they', 'their', 'them', 'do', 'nor', 'among']);
const VOT_DATA = {
  STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: {},
  BOOK_ABBREVS: { proverbs: 'proverbs' }, BOOK_DISPLAY: { proverbs: 'Proverbs' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [
    { id: 'v4', screen: 'vot-four-letter', dataVar: 'LETTERS_V4', prefaceVar: null, label: 'Volume Four' },
    { id: 'flock', screen: 'vot-flock-letter', dataVar: 'LETTERS_FLOCK', prefaceVar: null, label: 'Letters to The Lord’s Little Flock' },
  ],
  OT_BOOK_IDS: ['proverbs'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const para = (/** @type {string} */ v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const filler = (/** @type {number} */ n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const GLOBALS = {
  BOOKS: {
    proverbs: { id: 'proverbs', title: 'Proverbs', chapters: [
      { num: 1, sections: [{ heading: '', verses: Array.from({ length: 40 }, (_, i) => ({ n: i + 1, text: 'The ant and the rock badger, the locust and the spider, in the house of kings ' + i + '.' })) }] },
    ] },
  },
  LETTERS_V4: [
    // the line remembered, with two of its words traded: Maker (typed creator) and wide (typed broad)
    { id: 'maker-letter', num: 3, title: 'Remain Apart', blocks: [para(filler(12) + 'Give them no place among you, for they rebel against their Maker and walk the wide road that leads to ruin. ' + filler(6))] },
    // the line as typed, word for word, in a letter of its own
    { id: 'typed-letter', num: 4, title: 'The Gate', blocks: [para(filler(10) + 'The proud of the earth will rebel against their master and walk the narrow ledge alone. ' + filler(4))] },
  ],
  LETTERS_FLOCK: [
    // a letter holding most of the line as typed, creator and all, and not its end: it leads with no lexicon
    { id: 'half-letter', num: 4, title: 'Cast Out', blocks: [para(filler(8) + 'For they rebel against their creator and walk in darkness all their days. ' + filler(8))] },
  ],
};
const LEX = 'creator maker7\nbroad wid7';
const ids = (/** @type {any} */ r) => r.results.map((/** @type {any} */ x) => x.doc.letterId || x.doc.ref);
const Q = 'for they rebel against their creator and walk the broad road';
/** A fetch answering the lexicon file once, as the app's file would be answered. */
const answer = (/** @type {any} */ init, /** @type {any} */ body) => vi.fn(async () => ({ ok: true, redirected: false, status: 200, json: async () => body, ...init }));

describe('the substitution lexicon in the engine (B7)', () => {
  /** @type {any} */ let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) /** @type {any} */ (globalThis)[k] = /** @type {any} */ (GLOBALS)[k];
    E.setAlignLexicon(null);
    await E.init();
  }, 60000);
  afterEach(() => {
    E.setAlignLexicon(null);
    vi.unstubAllGlobals();
  });
  afterAll(() => {
    E.setAlignLexicon(null);
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete /** @type {any} */ (globalThis)[k];
  });

  it('a quote with two words traded leads when the lexicon knows the pairs, and not without it', async () => {
    E.setAlignLexicon(null);
    expect(ids(await E.search(Q))[0]).not.toBe('maker-letter');
    E.setAlignLexicon(parseLexicon(LEX));
    const r = await E.search(Q);
    expect(ids(r)[0]).toBe('maker-letter');
    // it opens on the line remembered
    const p = r.results[0].placeStart;
    expect(typeof p).toBe('number');
    expect(r.results[0].doc.text.slice(p, p + 8)).toBe('for they');
  });

  it('a query a text holds as typed ranks exactly as it does with no lexicon', async () => {
    const q = 'will rebel against their master and walk the narrow ledge alone';
    E.setAlignLexicon(null);
    const off = await E.search(q);
    E.setAlignLexicon(parseLexicon(LEX + '\nmaster maker7\nledg road7\nnarrow wid7'));
    const on = await E.search(q);
    expect(ids(on)).toEqual(ids(off));
    expect(on.results.map((/** @type {any} */ x) => x.score)).toEqual(off.results.map((/** @type {any} */ x) => x.score));
    expect(ids(on)[0]).toBe('typed-letter');
  });

  it('the app names a file: read once beside the index, a text search waits for it, and its pairs count', async () => {
    const fetch = answer({}, { name: 'fixture', lexicon: LEX });
    vi.stubGlobal('fetch', fetch);
    E.setAlignLexiconSource('search-lexicon.json');
    expect(ids(await E.search(Q))[0]).toBe('maker-letter');
    expect(ids(await E.search(Q))[0]).toBe('maker-letter');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual(['search-lexicon.json']);
  });

  it('a file that does not load is no lexicon, and search goes on: a 404, a redirect, no lexicon in it, a throw', async () => {
    E.setAlignLexicon(null);
    const base = ids(await E.search(Q));
    expect(base[0]).not.toBe('maker-letter');
    const fails = [
      answer({ ok: false, status: 404 }, { lexicon: LEX }),
      answer({ redirected: true }, { lexicon: LEX }),
      answer({}, { name: 'empty' }),
      vi.fn(async () => { throw new TypeError('offline'); }),
    ];
    for (const f of fails) {
      vi.stubGlobal('fetch', f);
      E.setAlignLexiconSource('search-lexicon.json');
      expect(ids(await E.search(Q))).toEqual(base);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it('a lexicon set directly wins over a file: the file is not read', async () => {
    const fetch = answer({}, { lexicon: 'unrelated pair7' });
    vi.stubGlobal('fetch', fetch);
    E.setAlignLexiconSource('search-lexicon.json');
    E.setAlignLexicon(parseLexicon(LEX));
    expect(ids(await E.search(Q))[0]).toBe('maker-letter');
    expect(fetch).not.toHaveBeenCalled();
  });
});
