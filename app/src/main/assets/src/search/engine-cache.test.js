/* Engine ↔ cache integration: proves init() WARM-RESTORES a serialized index
   (the 30× perf path) instead of rebuilding. Separate file so it gets its own
   isolated engine-module instance (the engine holds module-level state) with
   fake-indexeddb available. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import MiniSearch from './vendor/minisearch.js';
import { buildMiniSearchOptions } from './search-config.js';
import { buildDocs } from './index-builder.js';
import { saveCached, dataSignature } from './cache.js';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'is', 'my', 'of', 'and']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { psalms: 'psalms', ps: 'psalms' },
  BOOK_DISPLAY: { psalms: 'Psalms' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['psalms'], NT_BOOK_IDS: [], GENRE_GROUPS: { poetry: ['psalms'] },
  WORD_NUMS: {}, ROMAN_NUMS: {},
};
const GLOBALS = {
  BOOKS: {
    psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 23, sections: [{ heading: '', verses: [
      { n: 1, text: 'The LORD is my shepherd; I shall not want.' },
    ] }] }] },
  },
};

describe('engine warm-cache restore', () => {
  let prevData;
  beforeAll(async () => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    // Pre-populate the cache with a real serialized index under the exact sig
    // that build() will compute, so init() takes the loadJSON warm path.
    const ms = new MiniSearch(buildMiniSearchOptions());
    ms.addAll(buildDocs({ translation: 'nkjv' }));
    await saveCached(dataSignature('nkjv'), JSON.stringify(ms));
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('restores from cache (cached:true) and searches the restored index', async () => {
    await VotSearchMini.init();
    expect(VotSearchMini.getState().ready).toBe(true);
    expect(VotSearchMini.getStats().cached).toBe(true);
    const r = await VotSearchMini.search('shepherd');
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results[0].doc.ref).toBe('Psalms 23:1');
  });
});
