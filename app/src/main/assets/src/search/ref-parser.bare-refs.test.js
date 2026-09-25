/* References the way readers type them (improvement sweep 2026-09-22 REPORT #8).
   v07-01: "Jude 3" read the lone number as a CHAPTER - Jude has one - and
   opened a blank reading screen; so did Obadiah 4, Philemon 6, 2 John 12 and
   3 John 4. In a one-chapter book a lone number is the verse, as readers cite
   them. v07-05: "John 3 16", "John 3.16" and "john 3v16" (no colon) became
   text searches of 134-200 study hits with no card to the verse. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseReference } from './ref-parser.js';

const FIXTURE = {
  BOOK_ABBREVS: {
    john: 'john', jn: 'john', psalm: 'psalms', psalms: 'psalms', ps: 'psalms', genesis: 'genesis',
    jude: 'jude', obadiah: 'obadiah', obad: 'obadiah', philemon: 'philemon', phlm: 'philemon',
    '2 john': '2john', '2john': '2john', '3 john': '3john', '3john': '3john',
  },
  BOOK_DISPLAY: {
    john: 'John', psalms: 'Psalms', genesis: 'Genesis', jude: 'Jude', obadiah: 'Obadiah',
    philemon: 'Philemon', '2john': '2 John', '3john': '3 John',
  },
  NAMED_PASSAGE_INDEX: {}, COMMAND_MAP: {}, VOLUME_TOKEN_MAP: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
  VOLUME_COLLECTIONS: [],
};

/** The parse, reduced to what opens the reader. */
function ref(q) {
  const r = parseReference(q, { corpus: 'scriptures' });
  return r && { kind: r.kind, bookId: r.bookId, chapter: r.chapter, verseStart: r.verseStart, verseEnd: r.verseEnd };
}

let prev;
beforeAll(() => { prev = window.VotSearchData; window.VotSearchData = FIXTURE; });
afterAll(() => { window.VotSearchData = prev; });

describe('a one-chapter book: a lone number is the verse (v07-01)', () => {
  it.each([
    ['Jude 3', 'jude', 3],
    ['Obadiah 4', 'obadiah', 4],
    ['Philemon 6', 'philemon', 6],
    ['2 John 12', '2john', 12],
    ['3 John 4', '3john', 4],
  ])('%s opens chapter 1 at verse %i', (q, bookId, v) => {
    expect(ref(q)).toMatchObject({ kind: 'ref-bible', bookId, chapter: 1, verseStart: v });
  });

  it('"Jude 3-5" is a verse range in the one chapter', () => {
    expect(ref('Jude 3-5')).toMatchObject({ bookId: 'jude', chapter: 1, verseStart: 3, verseEnd: 5 });
  });

  it('an explicit chapter:verse is taken as written', () => {
    expect(ref('Jude 1:3')).toMatchObject({ bookId: 'jude', chapter: 1, verseStart: 3 });
  });

  it('CONTROL: in a many-chapter book a lone number is still the chapter', () => {
    const r = ref('John 3');
    expect(r).toMatchObject({ kind: 'ref-bible', bookId: 'john', chapter: 3 });
    expect(r.verseStart).toBeUndefined();
  });
});

describe('chapter and verse without the colon (v07-05)', () => {
  it.each([['John 3 16'], ['jn 3 16'], ['John 3.16'], ['john 3v16'], ['John 3:16']])('%s is John 3:16', (q) => {
    expect(ref(q)).toMatchObject({ kind: 'ref-bible', bookId: 'john', chapter: 3, verseStart: 16 });
  });

  it('"psalm 23 1" is Psalms 23:1', () => {
    expect(ref('psalm 23 1')).toMatchObject({ kind: 'ref-bible', bookId: 'psalms', chapter: 23, verseStart: 1 });
  });

  it('"John 3 16-18" is a verse range', () => {
    expect(ref('John 3 16-18')).toMatchObject({ bookId: 'john', chapter: 3, verseStart: 16, verseEnd: 18 });
  });

  it('"Jude 1 3" in a one-chapter book is Jude 1:3', () => {
    expect(ref('Jude 1 3')).toMatchObject({ bookId: 'jude', chapter: 1, verseStart: 3 });
  });

  it('CONTROL: three bare numbers are not a reference', () => {
    expect(ref('Genesis 1 2 3').kind).toBe('text');
  });
});
