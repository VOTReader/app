/* Golden search-quality suite (fixture-deterministic, runs in CI).
   Acceptance predicates over a small faithful fixture — pins ranking quality +
   the no-cross-corpus-leak invariant. The REAL-corpus golden (remembered verses,
   typos, synonyms against the shipped data) runs in preview at cutover. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his']),
  SYNONYM_MAP: { mercy: ['mercy', 'compassion'], compassion: ['mercy', 'compassion'] },
  BOOK_ABBREVS: { genesis: 'genesis', gen: 'genesis', psalms: 'psalms', ps: 'psalms', psalm: 'psalms', john: 'john', jn: 'john' },
  BOOK_DISPLAY: { genesis: 'Genesis', psalms: 'Psalms', john: 'John' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {},
  COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['genesis', 'psalms'], NT_BOOK_IDS: ['john'],
  GENRE_GROUPS: { law: ['genesis'], poetry: ['psalms'], gospels: ['john'] },
  WORD_NUMS: {}, ROMAN_NUMS: {},
};
const GLOBALS = {
  BOOKS: {
    psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 23, sections: [{ heading: '', verses: [
      { n: 1, text: 'The LORD is my shepherd; I shall not want.' },
      { n: 2, text: 'He makes me to lie down in green pastures.' },
    ] }] }] },
    john: { id: 'john', title: 'John', chapters: [{ num: 3, sections: [{ heading: '', verses: [
      { n: 16, text: 'For God so loved the world that He gave His only begotten Son.' },
    ] }] }] },
    genesis: { id: 'genesis', title: 'Genesis', chapters: [{ num: 1, sections: [{ heading: '', verses: [
      { n: 1, text: 'In the beginning God created the heavens and the earth.' },
    ] }] }] },
  },
  LETTERS_V1: [{ id: 'compassion-letter', num: 1, title: 'Of Tender Compassion', blocks: [{ segments: [{ v: 'Great is the compassion of the Lord.' }] }] }],
};

const topRef = (r) => (r.results[0] && r.results[0].doc.ref) || null;
const allRefs = (r) => r.results.map((x) => x.doc.ref);

describe('golden search quality', () => {
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

  const cases = [
    { q: 'the lord is my shepherd', expect: async (r) => expect(topRef(r)).toBe('Psalms 23:1') },
    { q: 'shepherd', expect: async (r) => expect(topRef(r)).toBe('Psalms 23:1') },
    { q: 'shephard (typo)', run: 'shephard', expect: async (r) => expect(allRefs(r)).toContain('Psalms 23:1') },
    { q: 'mercy (synonym→compassion)', run: 'mercy', opts: { synonyms: true }, expect: async (r) => expect(r.results.some((x) => x.doc.kind === 'letter')).toBe(true) },
    { q: '"green pastures" (phrase)', run: '"green pastures"', expect: async (r) => expect(allRefs(r)).toContain('Psalms 23:2') },
  ];

  for (const c of cases) {
    it(`ranks: ${c.q}`, async () => {
      const r = await VotSearchMini.search(c.run || c.q, c.opts);
      await c.expect(r);
    });
  }

  it('NO cross-corpus leak: a scriptures search never returns a volumes doc (and vice versa)', async () => {
    const scr = await VotSearchMini.search('lord', { corpus: 'scriptures' });
    expect(scr.results.length).toBeGreaterThan(0);
    expect(scr.results.every((x) => x.doc.corpus === 'scriptures')).toBe(true);
    const vol = await VotSearchMini.search('compassion', { corpus: 'volumes' });
    expect(vol.results.length).toBeGreaterThan(0);
    expect(vol.results.every((x) => x.doc.corpus === 'volumes')).toBe(true);
  });

  it('a typed reference resolves to a nav card, not noisy text hits', async () => {
    const r = await VotSearchMini.search('gen 1');
    expect(r.parsed.kind).toBe('ref-bible');
    expect(r.parsed.bookId).toBe('genesis');
    expect(r.results.length).toBe(0);
  });
});
