// @ts-nocheck — stubs runtime globals (caches/FontFace/fetch/document.fonts)
// whose lib.dom types fight the fakes; assertions carry the contract.
/* reading-fonts tests — the registry contract + the download/cache loader.
   ─────────────────────────────────────────────────────────────────────────
   Registry: every id the Settings picker can persist into
   settings.fontStyle must stay well-formed forever (ids are stored in
   backups — a rename would orphan users' choices), and every remote file
   must be an https fontsource URL (the CSP connect-src allowlists exactly
   that host). Loader: cache-first, fetch-once, all-files-or-nothing, and
   a clean false (not a throw) when the runtime lacks the font APIs. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  READING_FONTS, READING_FONT_CACHE, readingFontById, readingFontCss,
  ensureReadingFont, isReadingFontCached,
} from './reading-fonts.js';

describe('READING_FONTS registry', () => {
  it('ids are unique and kebab-case', () => {
    const ids = READING_FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('keeps the two historical built-ins, first, with no files', () => {
    expect(READING_FONTS[0].id).toBe('classic');
    expect(READING_FONTS[1].id).toBe('modern');
    expect(READING_FONTS[0].files).toBeNull();
    expect(READING_FONTS[1].files).toBeNull();
  });

  it('offers a real menu of downloadable fonts', () => {
    const remote = READING_FONTS.filter((f) => f.files);
    expect(remote.length).toBeGreaterThanOrEqual(12);
    for (const f of remote) {
      expect(f.kb).toBeGreaterThan(0);
      expect(f.files.length).toBeGreaterThan(0);
      expect(f.family).toBeTruthy();
      // css quotes the family and ends in a generic fallback.
      expect(f.css).toContain(`'${f.family}'`);
      expect(f.css).toMatch(/, (serif|sans-serif)$/);
      for (const file of f.files) {
        expect(file.url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/fontsource\/fonts\//);
        expect(file.url).toMatch(/\.woff2$/);
        expect(file.weight).toMatch(/^\d+( \d+)?$/);
        expect(['normal', 'italic']).toContain(file.style);
      }
      // Exactly one regular face to build previews/synthesis from.
      expect(f.files.filter((x) => x.style === 'normal').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('readingFontById finds every id and misses unknowns', () => {
    for (const f of READING_FONTS) expect(readingFontById(f.id)).toBe(f);
    expect(readingFontById('papyrus')).toBeUndefined();
    expect(readingFontById(null)).toBeUndefined();
  });

  it('readingFontCss falls back to the EB Garamond stack for classic AND unknowns', () => {
    expect(readingFontCss('classic')).toBe("'EB Garamond', serif");
    expect(readingFontCss('some-future-font')).toBe("'EB Garamond', serif");
    expect(readingFontCss(undefined)).toBe("'EB Garamond', serif");
    expect(readingFontCss('lora')).toBe("'Lora', serif");
  });
});

/* ── Loader ─────────────────────────────────────────────────────────────
   jsdom has neither CacheStorage, FontFace, nor document.fonts — install
   minimal fakes. Synthetic defs (never registry ids) keep the module-level
   loaded-set from leaking state between tests. */

let defSeq = 0;
const makeDef = (files) => ({
  id: `test-font-${++defSeq}`, label: 'T', family: 'TestFam',
  css: "'TestFam', serif", kb: 10, sub: '', files,
});
const file = (url) => ({ url, weight: '400', style: 'normal' });

function makeFakeCache() {
  const store = new Map();
  return {
    store,
    match: vi.fn(async (url) => store.get(url) || undefined),
    put: vi.fn(async (url, res) => { store.set(url, res); }),
  };
}
const fakeResponse = () => ({
  ok: true,
  clone() { return fakeResponse(); },
  arrayBuffer: async () => new ArrayBuffer(8),
});

describe('ensureReadingFont / isReadingFontCached', () => {
  let cache, added;

  beforeEach(() => {
    cache = makeFakeCache();
    added = [];
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal('FontFace', class {
      constructor(family, buf, desc) { this.family = family; this.desc = desc; }
    });
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: (f) => added.push(f) },
    });
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse()));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.fonts;
  });

  it('built-ins resolve true without touching any API', async () => {
    await expect(ensureReadingFont(readingFontById('classic'))).resolves.toBe(true);
    await expect(ensureReadingFont(readingFontById('modern'))).resolves.toBe(true);
    await expect(ensureReadingFont(undefined)).resolves.toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches uncached files ONCE, caches them, and registers every face', async () => {
    const def = makeDef([file('https://x/a.woff2'), file('https://x/b.woff2')]);
    await expect(ensureReadingFont(def)).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cache.put).toHaveBeenCalledTimes(2);
    expect(added.length).toBe(2);
    expect(added[0].family).toBe('TestFam');
    // Second ensure: the in-memory loaded set short-circuits everything.
    await ensureReadingFont(def);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('serves from the cache without fetching', async () => {
    const def = makeDef([file('https://x/c.woff2')]);
    cache.store.set('https://x/c.woff2', fakeResponse());
    await expect(ensureReadingFont(def)).resolves.toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(added.length).toBe(1);
  });

  it('REJECTS on a failed fetch and registers no face (all-or-nothing)', async () => {
    fetch.mockImplementation(async (url) =>
      url.endsWith('bad.woff2') ? { ok: false, status: 404 } : fakeResponse());
    const def = makeDef([file('https://x/good.woff2'), file('https://x/bad.woff2')]);
    await expect(ensureReadingFont(def)).rejects.toThrow('font fetch failed');
    expect(added.length).toBe(0);
    // A retry can still succeed (nothing latched as loaded).
    fetch.mockImplementation(async () => fakeResponse());
    await expect(ensureReadingFont(def)).resolves.toBe(true);
    expect(added.length).toBe(2);
  });

  it('returns false (no throw) when the font APIs are missing', async () => {
    vi.stubGlobal('FontFace', undefined);
    const def = makeDef([file('https://x/d.woff2')]);
    await expect(ensureReadingFont(def)).resolves.toBe(false);
  });

  it('isReadingFontCached: true only when EVERY file is present', async () => {
    const def = makeDef([file('https://x/e.woff2'), file('https://x/f.woff2')]);
    await expect(isReadingFontCached(def)).resolves.toBe(false);
    cache.store.set('https://x/e.woff2', fakeResponse());
    await expect(isReadingFontCached(def)).resolves.toBe(false);
    cache.store.set('https://x/f.woff2', fakeResponse());
    await expect(isReadingFontCached(def)).resolves.toBe(true);
    // Built-ins are always "cached".
    await expect(isReadingFontCached(readingFontById('modern'))).resolves.toBe(true);
  });

  it('uses the dedicated vot-fonts bucket, not the SW caches', async () => {
    const def = makeDef([file('https://x/g.woff2')]);
    await ensureReadingFont(def);
    expect(caches.open).toHaveBeenCalledWith(READING_FONT_CACHE);
    expect(READING_FONT_CACHE).toBe('vot-fonts-v1');
  });
});
