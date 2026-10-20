/* A reference typed with words (search200 fix1, the refwords hunt): ref-edge.js read through the engine, on a
   synthetic Bible and letter. Every query here is made up for the fixture; none is a bench query. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'a', 'to', 'in', 'at', 'over', 'was', 'by', 'it', 'so', 'upon']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { john: 'john', jn: 'john', isaiah: 'isaiah', is: 'isaiah', isa: 'isaiah' },
  BOOK_DISPLAY: { john: 'John', isaiah: 'Isaiah' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: ['isaiah'], NT_BOOK_IDS: ['john'], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const verses = (/** @type {string[]} */ texts) => [{ heading: '', verses: texts.map((text, i) => ({ n: i + 1, text })) }];
const GLOBALS = {
  BOOKS: {
    john: { id: 'john', title: 'John', chapters: [
      { num: 1, sections: verses(['Lanterns were hung along the old quay at evening.']) },
      { num: 3, sections: verses([
        'A lantern burned beside the quiet harbor at dusk.',
        'The keeper of the harbor sang over the gray water.',
        'And the gulls rested upon the long stone wall.',
      ]) },
    ] },
    isaiah: { id: 'isaiah', title: 'Isaiah', chapters: [{ num: 3, sections: verses(['The keeper of the harbor sang a new song.']) }] },
  },
  LETTERS_V1: [
    // a letter printing the verse with its reference, and a name the Bible never uses
    { id: 'harbor', num: 1, title: 'Songs at the Harbor', blocks: [{ segments: [{ v: 'It is written in John 3:2, the keeper of the harbor sang over the gray water. So Yahushua keeps the harbor, and the keeper sang.' }] }] },
  ],
};

let prev;
beforeAll(async () => {
  prev = window.VotSearchData;
  window.VotSearchData = VOT_DATA;
  for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
  await VotSearchMini.init();
});
afterAll(() => {
  window.VotSearchData = prev;
  for (const k of Object.keys(GLOBALS)) delete globalThis[k];
});

describe('a Bible reference at the start or end of the words', () => {
  it('at the start: its card, and the rest is what is searched under it', async () => {
    const r = await VotSearchMini.search('john 3 2 the keeper of the harbor sang over the gray water');
    expect(r.parsed).toMatchObject({ kind: 'ref-bible', bookId: 'john', chapter: 3, verseStart: 2, alsoText: true, text: 'the keeper of the harbor sang over the gray water' });
    expect(r.parsedTerms).not.toContain('john');
    expect(r.parsedTerms).not.toContain('3');
    expect(r.results.length).toBeGreaterThan(0);
  });

  it('at the end, a citation’s colon and brackets read as the reference', async () => {
    const end = await VotSearchMini.search('the keeper of the harbor sang john 3:2');
    expect(end.parsed).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2, text: 'the keeper of the harbor sang' });
    const cited = await VotSearchMini.search('(John 3:2) The keeper of the harbor sang');
    expect(cited.parsed).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2, text: 'The keeper of the harbor sang' });
  });

  it('words that only frame the reference make the card alone', async () => {
    const r = await VotSearchMini.search('john 3 2 bible verse');
    expect(r.parsed).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2 });
    expect(r.parsed.alsoText).toBeFalsy();
    expect(r.results).toEqual([]);
  });

  it('stays words: a word only the other texts use, a chapter the Bible lacks, a wordish book with no verse', async () => {
    expect((await VotSearchMini.search('john 3 2 yahushua keeps the harbor')).parsed.kind).toBe('text');
    expect((await VotSearchMini.search('john 7 2 the keeper of the harbor sang')).parsed.kind).toBe('text');
    expect((await VotSearchMini.search('is 3 the keeper of the harbor sang')).parsed.kind).toBe('text');
  });

  it('a small word before the reference is prose citing it: the words stay words', async () => {
    expect((await VotSearchMini.search('in john 3 2 the keeper of the harbor sang')).parsed.kind).toBe('text');
  });

  it('a tab that reads no Bible reference keeps the words', async () => {
    const r = await VotSearchMini.search('john 3 2 the keeper of the harbor sang', { corpus: 'volumes' });
    expect(r.parsed.kind).toBe('text');
  });
});
