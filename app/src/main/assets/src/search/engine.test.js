import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

// ── Fixture corpus (window globals + VotSearchData), installed for the suite ──
const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his']),
  SYNONYM_MAP: {
    mercy: ['mercy', 'compassion'], compassion: ['mercy', 'compassion'],
    shepherd: ['shepherd', 'pastor'], pastor: ['shepherd', 'pastor'],
  },
  BOOK_ABBREVS: { john: 'john', jn: 'john', genesis: 'genesis', gen: 'genesis', psalms: 'psalms', ps: 'psalms', psalm: 'psalms' },
  BOOK_DISPLAY: { john: 'John', genesis: 'Genesis', psalms: 'Psalms' },
  NAMED_PASSAGES: [{ keys: ['shepherd psalm'], bookId: 'psalms', chapter: 23 }],
  NAMED_PASSAGE_INDEX: { 'shepherd psalm': { bookId: 'psalms', chapter: 23 } },
  COMMANDS: [{ keys: ['/home'], action: 'home', label: 'Go home' }],
  COMMAND_MAP: { '/home': { action: 'home', label: 'Go home' } },
  VOLUME_TOKEN_MAP: { v1: { id: 'v1', screen: 'vot-one-letter', label: 'Volume One' } },
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['genesis', 'psalms'],
  NT_BOOK_IDS: ['john'],
  GENRE_GROUPS: { gospels: ['john'], law: ['genesis'], poetry: ['psalms'] },
  WORD_NUMS: { one: 1 },
  ROMAN_NUMS: { i: 1 },
};

const GLOBALS = {
  BOOKS: {
    psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 23, sections: [{ heading: '', verses: [
      { n: 1, text: 'The LORD is my shepherd; I shall not want.' },
      { n: 2, text: 'He makes me to lie down in green pastures; He leads me beside the still waters.' },
    ] }] }] },
    john: { id: 'john', title: 'John', chapters: [{ num: 3, sections: [{ heading: '', verses: [
      { n: 16, text: 'For God so loved the world that He gave His only begotten Son.' },
    ] }] }] },
    genesis: { id: 'genesis', title: 'Genesis', chapters: [{ num: 1, sections: [{ heading: '', verses: [
      { n: 1, text: 'In the beginning God created the heavens and the earth.' },
    ] }] }] },
  },
  // Title deliberately omits "mercy" so synonym matching (mercy→compassion) is testable.
  LETTERS_V1: [{ id: 'compassion-letter', num: 1, title: 'Of Tender Compassion', blocks: [{ segments: [{ v: 'Great is the compassion of the Lord toward all His people.' }] }] }],
};

function refs(results) { return results.map((r) => r.doc.ref); }

describe('VotSearchMini engine', () => {
  let prevData;
  beforeAll(async () => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    await VotSearchMini.init();
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });

  it('builds an in-memory index and reports ready', () => {
    expect(VotSearchMini.getState().ready).toBe(true);
    expect(VotSearchMini.getStats().docCount).toBe(5); // 3 verses + 1 verse + 1 letter
  });

  it('finds a single-word verse hit', async () => {
    const { results } = await VotSearchMini.search('shepherd');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].doc.ref).toBe('Psalms 23:1');
    expect(results[0].doc.kind).toBe('verse');
  });

  it('ranks a remembered phrase to the top (coverage + phrase boost)', async () => {
    const { results } = await VotSearchMini.search('the lord is my shepherd');
    expect(results[0].doc.ref).toBe('Psalms 23:1');
  });

  it('tolerates a typo (fuzzy)', async () => {
    const { results } = await VotSearchMini.search('shephard');
    expect(refs(results)).toContain('Psalms 23:1');
  });

  it('expands synonyms only when enabled (mercy → compassion)', async () => {
    const on = await VotSearchMini.search('mercy', { synonyms: true });
    expect(on.results.some((r) => r.doc.kind === 'letter')).toBe(true);
    const off = await VotSearchMini.search('mercy', { synonyms: false });
    expect(off.results.some((r) => r.doc.kind === 'letter')).toBe(false);
  });

  it('short-circuits a structured reference (no text results)', async () => {
    const { parsed, results } = await VotSearchMini.search('john 3:16');
    expect(parsed.kind).toBe('ref-bible');
    expect(results.length).toBe(0);
  });

  it('short-circuits a command', async () => {
    const { parsed, results } = await VotSearchMini.search('/home');
    expect(parsed.kind).toBe('command');
    expect(results.length).toBe(0);
  });

  it('returns nothing for an all-stop-word query', async () => {
    const { results } = await VotSearchMini.search('the of and');
    expect(results.length).toBe(0);
  });

  it('scopes by corpus with NO cross-corpus leak', async () => {
    const scr = await VotSearchMini.search('lord', { corpus: 'scriptures' });
    expect(scr.results.length).toBeGreaterThan(0);
    expect(scr.results.every((r) => r.doc.corpus === 'scriptures')).toBe(true);

    const vol = await VotSearchMini.search('lord', { corpus: 'volumes' });
    expect(vol.results.length).toBeGreaterThan(0);
    expect(vol.results.every((r) => r.doc.corpus === 'volumes')).toBe(true);
  });

  it('scopes to a single book', async () => {
    const { results } = await VotSearchMini.search('god', { scope: { bookId: 'genesis' } });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.doc.bookId === 'genesis')).toBe(true);
  });

  it('honors a quoted phrase', async () => {
    const { results } = await VotSearchMini.search('"green pastures"');
    expect(refs(results)).toContain('Psalms 23:2');
  });

  it('honors -excluded terms', async () => {
    const { results } = await VotSearchMini.search('god -world');
    expect(refs(results)).toContain('Genesis 1:1');
    expect(refs(results)).not.toContain('John 3:16');
  });

  it('emits the { score, doc } routing contract', async () => {
    const { results } = await VotSearchMini.search('shepherd');
    const e = results[0];
    expect(typeof e.score).toBe('number');
    expect(e.doc).toMatchObject({ kind: 'verse', bookId: 'psalms', chapterNum: 23, verseNum: 1, corpus: 'scriptures' });
    expect(e.doc.ref).toBe('Psalms 23:1');
  });

  it('exposes facade helpers (suggest / parse / snippet / fuzzyBookSuggest)', () => {
    expect(VotSearchMini.suggest('shep').some((s) => s.query === 'shepherd psalm')).toBe(true);
    expect(VotSearchMini.suggest('/ho').some((s) => s.kind === 'command')).toBe(true);
    expect(VotSearchMini.parse('gen 1').kind).toBe('ref-bible');
    expect(VotSearchMini.fuzzyBookSuggest('jhon')).toBe('john');
    expect(VotSearchMini.snippet('The LORD is my shepherd', ['shepherd'])).toContain('shepherd');
  });

  it('rebuild() drops and re-creates a working index', async () => {
    await VotSearchMini.rebuild();
    expect(VotSearchMini.getState().ready).toBe(true);
    const { results } = await VotSearchMini.search('shepherd');
    expect(results.length).toBeGreaterThan(0);
  });
});
