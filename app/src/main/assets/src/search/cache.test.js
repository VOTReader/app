import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { dataSignature, loadCached, saveCached, clearCached, openDb, MS_INDEX_VERSION, CORPUS_CONTENT_VERSION } from './cache.js';

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

describe('cache IDB round-trip', () => {
  beforeEach(async () => { await clearCached(); });

  it('returns null on a cold cache, then loads a matching signature', async () => {
    expect(await loadCached('sig-1')).toBeNull();
    expect(await saveCached('sig-1', '{"index":true}')).toBe(true);
    expect(await loadCached('sig-1')).toBe('{"index":true}');
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
  });

  it('clears', async () => {
    await saveCached('s', '{"y":2}');
    await clearCached();
    expect(await loadCached('s')).toBeNull();
  });
});

describe('cache IDB — storage-backup-4 sibling: an open connection must not block Clear All', () => {
  it('REPRO: deleteDatabase succeeds (not blocked) while a connection from openDb is still live', async () => {
    const db = await openDb();
    expect(db).toBeTruthy();
    const outcome = await new Promise((resolve) => {
      // Settings -> Clear All My Data's exact call for this database.
      const req = indexedDB.deleteDatabase('vot-minisearch-cache');
      req.onsuccess = () => resolve('success');
      req.onblocked = () => resolve('blocked');
      req.onerror = () => resolve('error');
    });
    expect(outcome).toBe('success');
  });
});
