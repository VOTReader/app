import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { dataSignature, loadCached, saveCached, clearCached, SEARCH_CACHE_NAME, LEGACY_SEARCH_DB, MS_INDEX_VERSION, CORPUS_CONTENT_VERSION } from './cache.js';

describe('cache signature', () => {
  beforeEach(() => { for (const k of ['BOOKS', 'MATTHEW', 'LETTERS_V1', 'WTLB_ONE']) delete globalThis[k]; });

  it('includes the index version + translation', () => {
    const sig = dataSignature('nkjv');
    expect(sig).toContain('v:' + MS_INDEX_VERSION);
    expect(sig).toContain('tr:nkjv');
  });

  it('folds in CORPUS_CONTENT_VERSION so a content-only corpus edit busts the cache (SRCH1)', () => {
    // The gate (tools/check-corpus-version.js) keeps this constant equal to the
    // SW's CORPUS_VERSION; the signature carrying it is what makes a corpus
    // content edit rebuild the index. A structural-only signature would miss
    // a reworded verse of the same length.
    expect(dataSignature('nkjv')).toContain('cv:' + CORPUS_CONTENT_VERSION);
    expect(CORPUS_CONTENT_VERSION).toMatch(/^c\d+$/);
  });

  it('busts when the corpus structure changes (a collection grows)', () => {
    const G = /** @type {any} */ (globalThis);
    const before = dataSignature('nkjv');
    G.LETTERS_V1 = [{ id: 'x' }];
    const after = dataSignature('nkjv');
    expect(after).not.toBe(before);
    delete G.LETTERS_V1;
  });

  it('busts when the alt-translation DATA is absent, so a partial index cannot be served as a whole one', () => {
    /* buildDocs reads window['BIBLE_<CODE>'] once, and when it is absent it
       builds the index with NO alt-translation text at all - silently, because
       an absent global and a translation with nothing to add are the same value
       to it. Nothing in this signature was derived from that data, so the partial
       index cached under `tr:kjv` and the complete one cached under `tr:kjv`, and
       whichever was written first is served for the life of the corpus version.

       Live today without any eviction: a cold build that starts before the
       translation script arrives (a 404, a slow network, or simply the build
       being kicked first) produces exactly this. boot-performance-4 adds a second
       route to it by freeing the global on purpose, which is what made me look. */
    const G = /** @type {any} */ (globalThis);
    delete G.BIBLE_KJV;
    const without = dataSignature('kjv');
    G.BIBLE_KJV = { john: { 3: [{ n: 16, text: 'kjv 16' }] } };
    const with_ = dataSignature('kjv');
    delete G.BIBLE_KJV;
    expect(with_).not.toBe(without);
  });

  it('KJV-R: the base edition (KJV) being in memory is part of the signature too (v07-04)', () => {
    /* The KJV-R overlay is sparse; every verse it does not carry is indexed from
       the KJV. An index built before BIBLE_KJV landed is NKJV-filled and must not
       be served under the key of a complete one. */
    const G = /** @type {any} */ (globalThis);
    const prevOpts = G.TRANSLATION_OPTIONS;
    G.TRANSLATION_OPTIONS = [{ id: 'rkjv', base: 'kjv' }];
    G.BIBLE_RKJV = { john: { 3: [{ n: 16, text: 'rkjv 16' }] } };
    delete G.BIBLE_KJV;
    const without = dataSignature('rkjv');
    G.BIBLE_KJV = { john: { 3: [{ n: 16, text: 'kjv 16' }] } };
    const with_ = dataSignature('rkjv');
    delete G.BIBLE_KJV; delete G.BIBLE_RKJV;
    G.TRANSLATION_OPTIONS = prevOpts;
    expect(with_).not.toBe(without);
  });

  it('CONTROL: nkjv has no alt global by design, so its signature does not move', () => {
    /* NKJV text is baked into BOOKS, so there is no BIBLE_NKJV to be present or
       absent. Without this arm the case above is satisfied by a component that
       flips for every translation including the one it must not. */
    const G = /** @type {any} */ (globalThis);
    delete G.BIBLE_NKJV;
    const a = dataSignature('nkjv');
    G.BIBLE_NKJV = { john: { 3: [{ n: 16, text: 'never read' }] } };
    const b = dataSignature('nkjv');
    delete G.BIBLE_NKJV;
    expect(a).toBe(b);
  });

  it('busts when the translation changes', () => {
    expect(dataSignature('nkjv')).not.toBe(dataSignature('kjv'));
  });

  it('counts book chapters when BOOKS is present', () => {
    const G = /** @type {any} */ (globalThis);
    G.BOOKS = { genesis: { chapters: [{}, {}, {}] } };
    expect(dataSignature('nkjv')).toContain('bk:1.3');
    delete G.BOOKS;
  });
});

/** CacheStorage in memory: the browser's Cache API shape the module uses. */
function memoryCaches() {
  const stores = new Map();
  const key = (req) => new URL(typeof req === 'string' ? req : req.url, 'https://app.test/').href;
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (req) => { const r = m.get(key(req)); return r ? r.clone() : undefined; },
      put: async (req, res) => { m.set(key(req), res.clone()); },
      delete: async (req) => m.delete(key(req)),
    };
  };
  return { stores, open, delete: async (name) => stores.delete(name), keys: async () => [...stores.keys()] };
}

/* 2026-10-11: the warm index is ~21 MB. In IndexedDB that was one value the size of a small
   library - a blob file in the very store the owner's WebView kept destroying, and the
   biggest write the app made. It lives in the Cache API now (CacheStorage, its own
   backend): a lost or broken cache costs one ~10 s rebuild, never the library. */
describe('the warm index in the Cache API', () => {
  const GC = /** @type {any} */ (globalThis);
  let caches0;
  beforeEach(() => { caches0 = GC.caches; GC.caches = memoryCaches(); });
  afterEach(() => { GC.caches = caches0; vi.restoreAllMocks(); });

  it('returns null on a cold cache, then loads a matching signature', async () => {
    expect(await loadCached('sig-1')).toBeNull();
    expect(await saveCached('sig-1', '{"index":true}')).toBe(true);
    expect(await loadCached('sig-1')).toBe('{"index":true}');
    expect([...GC.caches.stores.keys()]).toEqual([SEARCH_CACHE_NAME]);
  });

  // measure:s22 (2026-10-29): the engine hands over the JSON in parts (indexJSONParts), streamed in
  it('stores parts as the one JSON they make, streamed, or at once where a stream is refused', async () => {
    expect(await saveCached('sig-p', ['{"index":', '[1,2]', ',"é":"✦"}'])).toBe(true);
    expect(await loadCached('sig-p')).toBe('{"index":[1,2],"é":"✦"}');
    // an engine that will not store a streamed body
    const open = GC.caches.open;
    let puts = 0;
    GC.caches.open = async (/** @type {string} */ name) => {
      const c = await open(name);
      return { ...c, put: async (/** @type {any} */ req, /** @type {any} */ res) => { if (++puts === 1) throw new TypeError('streamed body'); return c.put(req, res); } };
    };
    expect(await saveCached('sig-q', ['{"a":', '1}'])).toBe(true);
    expect(puts).toBe(2);
    expect(await loadCached('sig-q')).toBe('{"a":1}');
  });

  it('returns null for a stale (non-matching) signature', async () => {
    await saveCached('old', '{"x":1}');
    expect(await loadCached('new')).toBeNull();
  });

  it('keeps a single entry (a new save replaces the old)', async () => {
    await saveCached('a', '{"a":1}');
    await saveCached('b', '{"b":2}');
    expect(await loadCached('a')).toBeNull();
    expect(await loadCached('b')).toBe('{"b":2}');
    expect(GC.caches.stores.get(SEARCH_CACHE_NAME).size).toBe(1);
  });

  it('clears', async () => {
    await saveCached('s', '{"y":2}');
    expect(await clearCached()).toBe(true);
    expect(await loadCached('s')).toBeNull();
  });

  it('never opens IndexedDB', async () => {
    const open = vi.spyOn(GC.indexedDB || { open() {} }, 'open');
    await saveCached('s', '{"y":2}');
    await loadCached('s');
    await clearCached();
    expect(open).not.toHaveBeenCalled();
  });

  it('without the Cache API there is simply no warm cache (search rebuilds)', async () => {
    delete GC.caches;
    expect(await saveCached('s', '{"y":2}')).toBe(false);
    expect(await loadCached('s')).toBeNull();
    expect(await clearCached()).toBe(false);
  });

  it('a failing Cache API is a cold cache, never an error', async () => {
    GC.caches = { open: async () => { throw new Error('SecurityError'); }, delete: async () => { throw new Error('x'); } };
    expect(await saveCached('s', '{"y":2}')).toBe(false);
    expect(await loadCached('s')).toBeNull();
    expect(await clearCached()).toBe(false);
  });

  it('names the retired IndexedDB database for the one-time reclaim', () => {
    expect(LEGACY_SEARCH_DB).toBe('vot-minisearch-cache');
  });
});

/* W27 (sweep 2026-10-13): offline, an incomplete corpus update reads the previous library's files, and right
   after a deploy the network can hand a page the next build's. The service worker marks every corpus file it
   serves from another build (window.__votOtherCorpus). An index built from one is that session's alone: its
   signature says so, and it is never kept, so the reader's whole warm index survives and no later session
   searches the other build's wording under this build's name. */
describe('an index built from another build\'s corpus', () => {
  const GC = /** @type {any} */ (globalThis);
  let caches0;
  beforeEach(() => { caches0 = GC.caches; GC.caches = memoryCaches(); delete GC.__votOtherCorpus; });
  afterEach(() => { GC.caches = caches0; delete GC.__votOtherCorpus; });

  it('CONTROL: nothing marked, the signature is the one every client already holds', () => {
    const clean = dataSignature('nkjv');
    GC.__votOtherCorpus = [];
    expect(dataSignature('nkjv')).toBe(clean);
  });

  it('a marked file changes the signature, so neither index is ever taken for the other', () => {
    const clean = dataSignature('nkjv');
    GC.__votOtherCorpus = ['./src/data/answers.js'];
    expect(dataSignature('nkjv')).not.toBe(clean);
  });

  it('is never kept: the whole index already saved stays', async () => {
    const clean = dataSignature('nkjv');
    await saveCached(clean, '{"whole":true}');
    GC.__votOtherCorpus = ['./dist/bundle-a-bible.js'];
    expect(await saveCached(dataSignature('nkjv'), '{"other":true}')).toBe(false);
    expect(await loadCached(clean)).toBe('{"whole":true}');
  });
});
