/* resolveActiveContent — the book, chapter and letter App() is showing.
   Mocks ../data/scripture-resolution.js (the collection registry): the real
   colLetterArr(undefined) is [] and colPreface(undefined) is null (verified
   against scripture-resolution.js:88-90), so the mock mirrors that shape.
   Globals MATTHEW / BOOKS are typeof-guarded in the source; window.__ALL_BOOKS
   is set as a side effect. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveActiveContent } from './active-content.js';

const mockStore = vi.hoisted(() => ({
  byKey: new Map(),
  byScreen: new Map(),
}));

vi.mock('../data/scripture-resolution.js', () => ({
  COL_BY_KEY: mockStore.byKey,
  COL_BY_LETTER_SC: mockStore.byScreen,
  colLetterArr: (col) => (col && Array.isArray(col.letters) ? col.letters : []),
  colPreface: (col) => (col && col.preface ? col.preface : null),
}));

/** @type {any} */
const g = globalThis;

const LETTER_A = { id: 'l1', title: 'Letter One' };
const LETTER_B = { id: 'l2', title: 'Letter Two' };
const PREFACE = { id: 'pref', title: 'Preface' };

const BOOK = {
  id: 'genesis',
  chapters: [
    { num: 1, verses: ['In the beginning'] },
    { num: 2, verses: ['Thus the heavens'] },
  ],
};

beforeEach(() => {
  mockStore.byKey.clear();
  mockStore.byScreen.clear();
  mockStore.byKey.set('one', { volKey: 'one', letters: [LETTER_A, LETTER_B], preface: PREFACE });
  mockStore.byKey.set('two', { volKey: 'two', letters: [LETTER_B], preface: null });
  mockStore.byScreen.set('vot-one-letter', { volKey: 'one' });
  mockStore.byScreen.set('vot-letter', { volKey: 'two' });
  g.BOOKS = { genesis: BOOK };
  delete g.MATTHEW;
  delete g.window.__ALL_BOOKS;
});

afterEach(() => {
  delete g.BOOKS;
  delete g.MATTHEW;
  delete g.window.__ALL_BOOKS;
});

describe('book and chapter', () => {
  it('returns null book with no bookId', () => {
    const { book, chapter } = resolveActiveContent({ screen: 'x', bookId: null, chapterNum: 1, letterId: null });
    expect(book).toBeNull();
    expect(chapter).toBeNull();
  });

  it('returns undefined book for an unknown bookId', () => {
    // ALL_BOOKS[bookId] is undefined for a missing key; only a null bookId
    // gives a null book.
    const { book, chapter } = resolveActiveContent({ screen: 'x', bookId: 'exodus', chapterNum: 1, letterId: null });
    expect(book).toBeUndefined();
    expect(chapter).toBeNull();
  });

  it('finds the chapter by number', () => {
    const { book, chapter } = resolveActiveContent({ screen: 'x', bookId: 'genesis', chapterNum: 2, letterId: null });
    expect(book).toBe(BOOK);
    expect(chapter).toBe(BOOK.chapters[1]);
  });

  it('returns null chapter when chapterNum is null', () => {
    const { chapter } = resolveActiveContent({ screen: 'x', bookId: 'genesis', chapterNum: null, letterId: null });
    expect(chapter).toBeNull();
  });

  it('returns undefined chapter when the number is not in the book', () => {
    const { chapter } = resolveActiveContent({ screen: 'x', bookId: 'genesis', chapterNum: 99, letterId: null });
    expect(chapter).toBeUndefined();
  });
});

describe('findLetter', () => {
  it('finds a letter from the collection array', () => {
    const { findLetter } = resolveActiveContent({ screen: 'x', bookId: null, chapterNum: null, letterId: 'l2' });
    expect(findLetter('one')).toBe(LETTER_B);
  });

  it('falls back to the preface when the id is not in the array', () => {
    const { findLetter } = resolveActiveContent({ screen: 'x', bookId: null, chapterNum: null, letterId: 'pref' });
    expect(findLetter('one')).toBe(PREFACE);
  });

  it('returns null when there is no letterId', () => {
    const { findLetter } = resolveActiveContent({ screen: 'x', bookId: null, chapterNum: null, letterId: null });
    expect(findLetter('one')).toBeNull();
  });

  it('returns null when the volKey has no collection', () => {
    const { findLetter } = resolveActiveContent({ screen: 'x', bookId: null, chapterNum: null, letterId: 'l1' });
    expect(findLetter('nine')).toBeNull();
  });

  it('returns null when the letter is in neither the array nor the preface', () => {
    const { findLetter } = resolveActiveContent({ screen: 'x', bookId: null, chapterNum: null, letterId: 'nope' });
    expect(findLetter('one')).toBeNull();
  });

  it('works standalone after the call returns', () => {
    const { findLetter } = resolveActiveContent({ screen: 'x', bookId: null, chapterNum: null, letterId: 'l1' });
    expect(findLetter('two')).toBeNull();
    expect(findLetter('one')).toBe(LETTER_A);
  });
});

describe('active letter and volume', () => {
  it('resolves the active letter from the screen collection', () => {
    const { activeLetter, activeVolKey } = resolveActiveContent({ screen: 'vot-one-letter', bookId: null, chapterNum: null, letterId: 'l1' });
    expect(activeVolKey).toBe('one');
    expect(activeLetter).toBe(LETTER_A);
  });

  it('resolves the preface as the active letter when the id matches it', () => {
    const { activeLetter } = resolveActiveContent({ screen: 'vot-one-letter', bookId: null, chapterNum: null, letterId: 'pref' });
    expect(activeLetter).toBe(PREFACE);
  });

  it('returns null activeVolKey when there is no letterId', () => {
    const { activeLetter, activeVolKey } = resolveActiveContent({ screen: 'vot-letter', bookId: null, chapterNum: null, letterId: null });
    expect(activeVolKey).toBeNull();
    expect(activeLetter).toBeNull();
  });

  it('returns null activeVolKey when the screen has no collection', () => {
    const { activeLetter, activeVolKey } = resolveActiveContent({ screen: 'unknown-screen', bookId: null, chapterNum: null, letterId: 'l1' });
    expect(activeVolKey).toBeNull();
    expect(activeLetter).toBeNull();
  });

  it('returns null activeLetter when the active volume has no such letter', () => {
    const { activeLetter, activeVolKey } = resolveActiveContent({ screen: 'vot-letter', bookId: null, chapterNum: null, letterId: 'l1' });
    expect(activeVolKey).toBe('two');
    expect(activeLetter).toBeNull();
  });
});

describe('ALL_BOOKS globals', () => {
  it('exposes BOOKS on window.__ALL_BOOKS', () => {
    resolveActiveContent({ screen: 'x', bookId: null, chapterNum: null, letterId: null });
    expect(g.window.__ALL_BOOKS).toEqual({ genesis: BOOK });
  });

  it('adds MATTHEW under matthew when the global exists', () => {
    g.MATTHEW = { id: 'matthew', chapters: [] };
    const { book } = resolveActiveContent({ screen: 'x', bookId: 'matthew', chapterNum: null, letterId: null });
    expect(book).toBe(g.MATTHEW);
    expect(g.window.__ALL_BOOKS.matthew).toBe(g.MATTHEW);
  });

  it('lets BOOKS win a matthew key clash over MATTHEW', () => {
    const bookMatthew = { id: 'matthew-from-books', chapters: [] };
    g.MATTHEW = { id: 'matthew-from-global', chapters: [] };
    g.BOOKS = { genesis: BOOK, matthew: bookMatthew };
    const { book } = resolveActiveContent({ screen: 'x', bookId: 'matthew', chapterNum: null, letterId: null });
    expect(book).toBe(bookMatthew);
  });

  it('works with neither global defined', () => {
    delete g.BOOKS;
    const { book } = resolveActiveContent({ screen: 'x', bookId: 'genesis', chapterNum: null, letterId: null });
    expect(book).toBeUndefined();
    expect(g.window.__ALL_BOOKS).toEqual({});
  });
});
