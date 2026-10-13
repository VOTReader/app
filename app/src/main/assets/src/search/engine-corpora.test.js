/* THE INDEX IS BUILT FROM EVERY TEXT, FOR THE READER'S EDITION (engine.js init, sweep W2,
   2026-10-13). A search that reached the engine before the lazy corpora loaded built from what
   had arrived, a build for NKJV was handed to a KJV search, and nothing ever built again. Each
   case gets a fresh engine (the engine holds module-level state). The warm index lives in
   IndexedDB on this branch (fake-indexeddb here). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'is', 'my', 'of', 'and', 'i']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: { psalms: 'psalms' }, BOOK_DISPLAY: { psalms: 'Psalms' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['psalms'], NT_BOOK_IDS: [], GENRE_GROUPS: { poetry: ['psalms'] }, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const BOOKS = {
  psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 23, sections: [{ heading: '', verses: [
    { n: 1, text: 'The LORD is my shepherd; I shall not want.' },
  ] }] }] },
};
const BIBLE_KJV = { psalms: { 23: [{ n: 1, text: 'The LORD is my shepherd; I shall not want, saith the psalmist.' }] } };
const ANSWERS = [{ id: 'lilies', num: 1, title: 'Of the Lilies', paragraphs: [{ text: 'Consider the lilies of the field, how they grow in the zebulonite valley.' }] }];
const SET = ['BOOKS', 'ANSWERS', 'BIBLE_KJV', 'loadBibleStudies', '__loadAnswersCorpus', 'loadTranslation', 'requestIdleCallback'];

/** A promise and the hand that settles it. */
function deferred() {
  /** @type {(v?: any) => void} */ let resolve = () => {};
  /** @type {(e?: any) => void} */ let reject = () => {};
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const g = /** @type {any} */ (globalThis);

/** @type {any} */ let E;
/** @type {any} */ let prevData;
beforeEach(async () => {
  prevData = window.VotSearchData;
  window.VotSearchData = VOT_DATA;
  for (const k of SET) delete g[k];
  g.BOOKS = BOOKS;
  vi.resetModules();
  E = (await import('./engine.js')).VotSearchMini;
});
afterEach(() => {
  window.VotSearchData = prevData;
  for (const k of SET) delete g[k];
});

describe('the index waits for every corpus', () => {
  it('a text search that reaches the engine before a corpus loads finds that corpus', async () => {
    const answers = deferred();
    g.__loadAnswersCorpus = vi.fn(() => answers.promise);
    const pending = E.search('zebulonite lilies');
    await new Promise((r) => setTimeout(r, 50)); // long enough for a build that did not wait to finish
    expect(E.getState().ready).toBe(false); // nothing built from the Bible alone
    g.ANSWERS = ANSWERS;
    answers.resolve();
    const r = await pending;
    expect(r.results.map((e) => e.doc.letterId)).toContain('lilies');
  });

  it('init builds only after the studies (and every loader) have settled', async () => {
    const studies = deferred();
    g.loadBibleStudies = vi.fn(() => studies.promise);
    const done = E.init();
    await flush();
    expect(g.loadBibleStudies).toHaveBeenCalled();
    expect(E.getState().ready).toBe(false);
    studies.resolve(true);
    await done;
    expect(E.getState().ready).toBe(true);
  });

  it('a corpus that loads after the index was built is searched: the index is built again', async () => {
    await E.init();
    expect((await E.search('zebulonite lilies')).results).toEqual([]);
    g.ANSWERS = ANSWERS; // the reader opened Answers since
    expect(E.isCurrent()).toBe(false);
    const r = await E.search('zebulonite lilies');
    expect(r.results.map((e) => e.doc.letterId)).toContain('lilies');
  });

  it('an index built while a corpus failed to load is not cached over the whole one', async () => {
    const C = await import('./cache.js');
    await C.clearCached();
    g.requestIdleCallback = (/** @type {() => void} */ fn) => setTimeout(fn, 0);
    g.__loadAnswersCorpus = () => Promise.reject(new Error('offline'));
    await E.init();
    await new Promise((r) => setTimeout(r, 50));
    expect(E.getState().ready).toBe(true);
    expect(await C.loadCached(C.dataSignature('nkjv'))).toBeNull();
    // the control: with every corpus in, it is cached
    g.ANSWERS = ANSWERS;
    g.__loadAnswersCorpus = () => Promise.resolve();
    await E.init();
    await new Promise((r) => setTimeout(r, 50));
    expect(await C.loadCached(C.dataSignature('nkjv'))).not.toBeNull();
  });
});

describe('the index is for the edition asked', () => {
  it('a KJV search during an NKJV build is answered from a KJV index', async () => {
    g.BIBLE_KJV = BIBLE_KJV;
    const nkjv = E.init({ translation: 'nkjv' });
    const r = await E.search('shepherd', { translation: 'kjv' });
    await nkjv;
    expect(r.results[0].doc.translation).toBe('kjv');
    expect(r.results[0].doc.text).toContain('saith');
    expect(E.getState().translation).toBe('kjv');
  });

  it('a call that names no edition uses the one built', async () => {
    g.BIBLE_KJV = BIBLE_KJV;
    await E.init({ translation: 'kjv' });
    expect(E.isCurrent()).toBe(true);
    const r = await E.search('shepherd');
    expect(r.results[0].doc.translation).toBe('kjv');
  });

  it("the edition's own text is loaded before the build", async () => {
    g.loadTranslation = vi.fn((/** @type {string} */ code) => { g['BIBLE_' + code.toUpperCase()] = BIBLE_KJV; return Promise.resolve(); });
    await E.init({ translation: 'kjv' });
    expect(g.loadTranslation).toHaveBeenCalledWith('kjv');
    expect((await E.search('shepherd', { translation: 'kjv' })).results[0].doc.text).toContain('saith');
  });
});
