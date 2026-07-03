import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { dataSignature, loadCached, saveCached, clearCached, MS_INDEX_VERSION, CORPUS_CONTENT_VERSION } from './cache.js';

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
