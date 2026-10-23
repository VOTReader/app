/* SEARCH READS THE EDITION THE READER CAN SHOW (search200 wave 3, RC.6, 2026-10-23). The offline sweep picked WEB
   on a phone that did not have it: the Bible showed NKJV ("WEB isn't on this phone yet"), while search built its
   index "for WEB" and badged its verses WEB. The reader shows an edition only when its text is in memory
   (translations.js isTranslationLoaded, BibleChapterView's shownTranslation); otherwise it shows NKJV. Search now
   builds from the same edition: NKJV text under an NKJV label while the picked one is absent (a sparse overlay
   without its own text read its base's words before, which the reader never shows), and the picked edition as
   soon as its text is in memory. Fixture texts only (no bench query). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'is', 'my', 'of', 'and', 'i']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: { isaiah: 'isaiah' }, BOOK_DISPLAY: { isaiah: 'Isaiah' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['isaiah'], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const BOOKS = {
  isaiah: { id: 'isaiah', title: 'Isaiah', chapters: [{ num: 54, sections: [{ heading: '', verses: [
    { n: 8, text: 'With a little wrath I hid My face from you for a moment; but with everlasting kindness I will have mercy on you, says the LORD, your Redeemer.' },
  ] }] }] },
};
const BIBLE_WEB = { isaiah: { 54: [{ n: 8, text: 'In overflowing wrath I hid my face from you for a moment; but with everlasting loving kindness I will have mercy on you, says Yahweh your Redeemer.' }] } };
const BIBLE_KJV = { isaiah: { 54: [{ n: 8, text: 'In a little wrath I hid my face from thee for a moment; but with everlasting kindness will I have mercy on thee, saith the LORD thy Redeemer.' }] } };
const OPTIONS = [{ id: 'nkjv', label: 'NKJV' }, { id: 'web', label: 'WEB' }, { id: 'kjv', label: 'KJV' }, { id: 'rkjv', label: 'KJV-R', base: 'kjv' }];
const SET = ['BOOKS', 'BIBLE_WEB', 'BIBLE_KJV', 'BIBLE_RKJV', 'TRANSLATION_OPTIONS', 'loadTranslation', 'translateVerse', 'caches', 'requestIdleCallback'];
const g = /** @type {any} */ (globalThis);

/** @type {any} */ let E;
/** @type {any} */ let prevData;
beforeEach(async () => {
  prevData = window.VotSearchData;
  window.VotSearchData = VOT_DATA;
  for (const k of SET) delete g[k];
  g.BOOKS = BOOKS;
  g.TRANSLATION_OPTIONS = OPTIONS;
  // translateVerse as bundle-d publishes it (isTranslationLoaded is not a global)
  vi.resetModules();
  g.translateVerse = (await import('../data/translations.js')).translateVerse;
  // offline: the edition's file never arrives
  g.loadTranslation = vi.fn(() => Promise.resolve());
  E = (await import('./engine.js')).VotSearchMini;
});
afterEach(() => {
  window.VotSearchData = prevData;
  for (const k of SET) delete g[k];
});

const top = async (/** @type {string} */ q, /** @type {string} */ translation) => (await E.search(q, { translation })).results[0].doc;

describe('search reads the edition the reader can show', () => {
  it('WEB picked but not on the phone: the verse is the NKJV, labelled NKJV, as the reader shows it', async () => {
    await E.init({ translation: 'web' });
    const d = await top('mercy redeemer', 'web');
    expect(d.text).toContain('says the LORD');
    expect(d.translation).toBe('nkjv');
  });

  it('once the WEB is in memory, search builds again and reads it', async () => {
    await E.init({ translation: 'web' });
    expect((await top('mercy redeemer', 'web')).translation).toBe('nkjv');
    g.BIBLE_WEB = BIBLE_WEB;
    const d = await top('mercy redeemer', 'web');
    expect(d.text).toContain('Yahweh');
    expect(d.translation).toBe('web');
  });

  it('a sparse overlay whose base is not on the phone is not badged as itself: the reader shows NKJV there', async () => {
    g.BIBLE_RKJV = { isaiah: {} }; // KJV-R's own verses are here, the KJV it falls back to is not
    await E.init({ translation: 'rkjv' });
    expect((await top('mercy redeemer', 'rkjv')).translation).toBe('nkjv');
  });

  it('a sparse overlay without its own text is not read through its base: the reader shows NKJV there', async () => {
    g.BIBLE_KJV = BIBLE_KJV; // the base is on the phone, KJV-R itself is not
    await E.init({ translation: 'rkjv' });
    const d = await top('mercy redeemer', 'rkjv');
    expect(d.text).not.toContain('saith');
    expect(d.translation).toBe('nkjv');
  });
});
