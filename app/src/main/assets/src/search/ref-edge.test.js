/* A reference typed with words (search200 fix1, the refwords hunt): ref-edge.js read through the engine, on a
   synthetic Bible and letter. Every query here is made up for the fixture; none is a bench query. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'a', 'to', 'in', 'at', 'over', 'was', 'by', 'it', 'so', 'upon']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { john: 'john', jn: 'john', isaiah: 'isaiah', is: 'isaiah', isa: 'isaiah' },
  BOOK_DISPLAY: { john: 'John', isaiah: 'Isaiah' },
  NAMED_PASSAGES: [
    { keys: ['the harbor vigil', 'harbor vigil'], bookId: 'john', chapter: 3, verseStart: 1, verseEnd: 3 },
    { keys: ['walking on water'], bookId: 'isaiah', chapter: 3, verseStart: 1, verseEnd: 1 },   // told again in John 6:16-21 (PARALLELS)
    { keys: ['isaiah 3'], bookId: 'isaiah', chapter: 3 },
  ],
  NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
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
        'Whoever watches the harbor keeps the lantern lit.',
      ]) },
    ] },
    isaiah: { id: 'isaiah', title: 'Isaiah', chapters: [{ num: 3, sections: verses(['The keeper of the harbor sang a new song.']) }] },
  },
  LETTERS_V1: [
    // a letter printing the verse with its reference, and a name the Bible never uses
    { id: 'harbor', num: 1, title: 'Songs at the Harbor', blocks: [{ segments: [{ v: 'It is written in John 3:2, the keeper of the harbor sang over the gray water. So Yahushua keeps the harbor, and the keeper sang. Whosoever watcheth the harbor shall see the lantern. They kept the harbor vigil.' }] }] },
    // a title with a reference in it
    { id: 'dusk', num: 2, title: 'Lanterns at Dusk (John 3:1)', blocks: [{ segments: [{ v: 'At dusk the lanterns were lit along the quay.' }] }] },
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

  it('the KJV’s form of a word the Bible holds is the Bible’s word, not an outside one', async () => {
    const r = await VotSearchMini.search('john 3 4 whosoever watcheth the harbor');
    expect(r.parsed).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 4, text: 'whosoever watcheth the harbor' });
  });

  it('a small word before the reference is prose citing it: the words stay words', async () => {
    expect((await VotSearchMini.search('in john 3 2 the keeper of the harbor sang')).parsed.kind).toBe('text');
  });

  it('a tab that reads no Bible reference keeps the words', async () => {
    const r = await VotSearchMini.search('john 3 2 the keeper of the harbor sang', { corpus: 'volumes' });
    expect(r.parsed.kind).toBe('text');
  });

  it('a number typed in words beside other words is a word, no chapter or verse', async () => {
    expect((await VotSearchMini.search('john three days the keeper sang')).parsed.kind).toBe('text');
    expect((await VotSearchMini.search('the keeper sang to john three')).parsed.kind).toBe('text');
  });

  it('words another verse holds in a row, typed beside a verse that does not: that verse’s words, no card', async () => {
    expect((await VotSearchMini.search('john 3 3 a lantern burned beside the quiet harbor')).parsed.kind).toBe('text');
    expect((await VotSearchMini.search('a lantern burned beside the quiet harbor john 3 3')).parsed.kind).toBe('text');
    // the reading that holds them keeps its card, and so does a rest too short to tell
    expect((await VotSearchMini.search('john 3 a lantern burned beside the quiet harbor')).parsed).toMatchObject({ kind: 'ref-bible', chapter: 3, alsoText: true });
    expect((await VotSearchMini.search('john 3 3 the harbor')).parsed).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 3, text: 'the harbor' });
  });

  it('a text’s whole title typed is the title, the reference in it no card', async () => {
    expect((await VotSearchMini.search('lanterns at dusk john 3 1')).parsed.kind).toBe('text');
  });
});

describe('a whole reference in a shape the parser did not read', () => {
  const card = async (/** @type {string} */ q) => (await VotSearchMini.search(q)).parsed;
  it('numbers in words, a verse list, a range in words', async () => {
    expect(await card('john three two')).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2 });
    expect(await card('john 3 1 2')).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 1, verseEnd: 2 });
    expect(await card('john 3 1 to 3')).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 1, verseEnd: 3 });
    expect(await card('john 1 through 3')).toMatchObject({ kind: 'ref-bible', chapter: 1, chapterEnd: 3 });
  });

  it('a frame round the book, the chapter first, a version spelled out', async () => {
    expect(await card('the gospel of john chapter three verse two')).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2 });
    expect(await card('chapter 3 of john verse 2')).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2 });
    expect(await card('john 3:2 king james version')).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2 });
    expect(await card('the book of isaiah')).toMatchObject({ kind: 'ref-book', bookId: 'isaiah' });
  });

  it('a question round a reference', async () => {
    expect(await card('what does john 3 2 say')).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2 });
    expect(await card('what does the bible say about john 3')).toMatchObject({ kind: 'ref-bible', chapter: 3 });
  });

  it('beside words, the shape is read at the edge too; words with a number word stay words', async () => {
    expect(await card('john 3 1 2 a lantern burned beside the quiet harbor')).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 1, verseEnd: 2, text: 'a lantern burned beside the quiet harbor' });
    expect((await card('john the one who sang')).kind).toBe('text');
  });

  it('the engine\u2019s parse reads them with no index', () => {
    expect(VotSearchMini.parse('john three two', { corpus: 'all' })).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2 });
  });
});

describe('a named passage inside a longer query', () => {
  /** @param {string} q @param {any} [o] */
  const card = async (q, o) => (await VotSearchMini.search(q, o)).parsed;
  it('its card when the rest is a reference over it, its book, or words one of its verses holds in a row', async () => {
    expect(await card('the harbor vigil john 3')).toMatchObject({ kind: 'named-passage', bookId: 'john', chapter: 3, verseStart: 1, verseEnd: 3, text: 'the harbor vigil john 3' });
    expect(await card('harbor vigil in john')).toMatchObject({ kind: 'named-passage', bookId: 'john', chapter: 3, verseStart: 1, verseEnd: 3 });
    expect(await card('harbor vigil the gulls rested upon the long stone wall')).toMatchObject({ kind: 'named-passage', chapter: 3, text: 'harbor vigil the gulls rested upon the long stone wall' });
  });

  it('a parallel telling of it, named by its book', async () => {
    expect(await card('walking on water in john')).toMatchObject({ kind: 'named-passage', bookId: 'john', chapter: 6, verseStart: 16, verseEnd: 21 });
  });

  it('a verse typed inside it is that verse\u2019s card, the name what is searched under it', async () => {
    expect(await card('harbor vigil john 3 2')).toMatchObject({ kind: 'ref-bible', chapter: 3, verseStart: 2, text: 'harbor vigil' });
  });

  it('a name that is itself a reference: only the words beside it are searched', async () => {
    expect(await card('isaiah 3 the keeper of the harbor sang a new song')).toMatchObject({ kind: 'named-passage', bookId: 'isaiah', chapter: 3, text: 'keeper of the harbor sang a new song' });
  });

  it('words none of its verses holds stay words; a tab reading no Bible reference reads none', async () => {
    expect((await card('harbor vigil a lantern at the quay')).kind).toBe('text');
    expect((await card('harbor vigil in john', { corpus: 'volumes' })).kind).toBe('text');
  });
});
