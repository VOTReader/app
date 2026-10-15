/* Engine ↔ cache integration: proves init() WARM-RESTORES a serialized index
   (the 30× perf path) instead of rebuilding. Separate file so it gets its own
   isolated engine-module instance (the engine holds module-level state). The
   warm index lives in the Cache API since 2026-10-11 (search/cache.js), so an
   in-memory CacheStorage stands in for the browser's. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'fake-indexeddb/auto';

/** CacheStorage in memory, the shape search/cache.js uses. */
function memoryCaches() {
  const stores = new Map();
  const key = (req) => new URL(typeof req === 'string' ? req : req.url, 'https://app.test/').href;
  return {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        match: async (req) => { const r = m.get(key(req)); return r ? r.clone() : undefined; },
        put: async (req, res) => { m.set(key(req), res.clone()); },
      };
    },
    delete: async (name) => stores.delete(name),
  };
}
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
  let prevCaches;
  beforeAll(async () => {
    prevCaches = /** @type {any} */ (globalThis).caches;
    /** @type {any} */ (globalThis).caches = memoryCaches();
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
    /** @type {any} */ (globalThis).caches = prevCaches;
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

  /* "Rebuild the index" dropped the warm cache without waiting (sweep 2026-10-14 v100): the build it started read
     the cache before the delete landed and swapped the same index back in, so nothing was built again. */
  it('rebuild() builds the index again instead of restoring the cache it drops', async () => {
    const cs = /** @type {any} */ (globalThis).caches;
    const del = cs.delete;
    cs.delete = async (/** @type {string} */ name) => { await new Promise((r) => setTimeout(r, 20)); return del(name); };
    try {
      await VotSearchMini.rebuild();
    } finally {
      cs.delete = del;
    }
    expect(VotSearchMini.getStats().cached).toBe(false);
    expect((await VotSearchMini.search('shepherd')).results[0].doc.ref).toBe('Psalms 23:1');
  });
});
