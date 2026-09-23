/* Typo tolerance is a FALLBACK, not a second net over every word (2026-09-22).
   The reader audit searched "love one another" at 412 px and the results marked
   "Owe" in Romans 13:8: MiniSearch's fuzzy 0.2 rounds to ONE edit on a three-
   letter word, so a correctly spelled "one" also matched "owe" (and "son"
   matched "sun", "peace" matched "place"). Those verses rode into the results
   with the wrong word highlighted. A literal term now searches exact + prefix
   first and falls back to fuzzy only when that finds nothing, which is exactly
   the typo case: "shephard" still finds the shepherd. Fixture-deterministic,
   the same way golden.test.js is. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { john: 'john', jn: 'john', psalms: 'psalms', ps: 'psalms', romans: 'romans', rom: 'romans' },
  BOOK_DISPLAY: { john: 'John', psalms: 'Psalms', romans: 'Romans' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {},
  COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['psalms'], NT_BOOK_IDS: ['john', 'romans'],
  GENRE_GROUPS: { poetry: ['psalms'], gospels: ['john'], epistles: ['romans'] },
  WORD_NUMS: {}, ROMAN_NUMS: {},
};
const verse = (n, text) => ({ n, text });
const GLOBALS = {
  BOOKS: {
    psalms: { id: 'psalms', title: 'Psalms', chapters: [
      { num: 19, sections: [{ heading: '', verses: [verse(4, 'Their line has gone out through all the earth, and their words to the end of the world. In them He has set a tabernacle for the sun,')] }] },
      { num: 23, sections: [{ heading: '', verses: [verse(1, 'The LORD is my shepherd; I shall not want.')] }] },
    ] },
    john: { id: 'john', title: 'John', chapters: [
      { num: 3, sections: [{ heading: '', verses: [verse(16, 'For God so loved the world that He gave His only begotten Son.')] }] },
      { num: 10, sections: [{ heading: '', verses: [verse(30, 'I and My Father are one.')] }] },
      { num: 14, sections: [{ heading: '', verses: [
        verse(2, 'In My Father’s house are many mansions; if it were not so, I would have told you. I go to prepare a place for you.'),
        verse(27, 'Peace I leave with you, My peace I give to you; not as the world gives do I give to you.'),
      ] }] },
    ] },
    romans: { id: 'romans', title: 'Romans', chapters: [
      { num: 13, sections: [{ heading: '', verses: [verse(7, 'Render therefore to all their due: taxes to whom taxes are due, customs to whom customs, fear to whom fear, honor to whom honor.'), verse(8, 'Owe no man anything except to love.')] }] },
    ] },
  },
};

const refs = (r) => r.results.map((x) => x.doc.ref);

describe('search: typo tolerance only where the word as typed finds nothing', () => {
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

  it('"peace" finds the verse about peace, not the one about a place', async () => {
    const r = await VotSearchMini.search('peace', { synonyms: false });
    expect(refs(r)).toContain('John 14:27');
    expect(refs(r)).not.toContain('John 14:2');
  });

  it('"son" finds the Son, not the sun', async () => {
    const r = await VotSearchMini.search('son', { synonyms: false });
    expect(refs(r)).toContain('John 3:16');
    expect(refs(r)).not.toContain('Psalms 19:4');
  });

  it('"one" does not match "owe" or "gone" while the word itself is there', async () => {
    const r = await VotSearchMini.search('one', { synonyms: false });
    expect(refs(r)).toContain('John 10:30');
    expect(refs(r)).not.toContain('Romans 13:8'); // "Owe"
    expect(refs(r)).not.toContain('Psalms 19:4'); // "gone"
  });

  it('a real typo still finds its word: "shephard" -> the shepherd', async () => {
    const r = await VotSearchMini.search('shephard', { synonyms: false });
    expect(refs(r)).toContain('Psalms 23:1');
  });

  it('the highlight terms a result carries are the words that matched, never a near-miss', async () => {
    const r = await VotSearchMini.search('peace', { synonyms: false });
    for (const hit of r.results) expect(hit.terms || []).not.toContain('place');
  });
});
