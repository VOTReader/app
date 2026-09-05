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

  it('busts when the translation changes', () => {
    expect(dataSignature('nkjv')).not.toBe(dataSignature('kjv'));
  });

  it('search-3: retires every NON-NKJV slot the old builder wrote, and leaves nkjv alone', () => {
    // Before search-3 a non-NKJV index was built from NKJV text (the BIBLE_<CODE> global was
    // never loaded) and cached under that code. Those slots must never be read back. NKJV
    // slots were always correct — this is what makes the retirement targeted rather than an
    // MS_INDEX_VERSION bump, which would rebuild every reader's index to fix some readers'.
    expect(dataSignature('kjv')).toContain('tr:kjv.t2');
    expect(dataSignature('web')).toContain('tr:web.t2');
    // CONTROL, and it is the whole point of doing it this way: nkjv is untouched, so an NKJV
    // reader's cached index still matches and they rebuild nothing.
    expect(dataSignature('nkjv')).toContain('tr:nkjv');
    expect(dataSignature('nkjv')).not.toContain('.t2');
    // …and the empty/absent code still resolves to the nkjv slot, not to a '.t2' one.
    expect(dataSignature('')).toBe(dataSignature('nkjv'));
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
