/* bible-facts.js - The Bible's book list and a book's chapters in v2 (pictures 5a-bible, 5b-book), from data that is
   there before the 5 MB Bible loads: the canon table main's reading plans keep (data/reading-plans.js BIBLE_BOOKS:
   [id as in BOOKS, title, chapters], index.html's BIBLE_BOOK_LIST order), and the reader's own record, read only:
   - a chapter is read when main's read record says so (vot-state readItems 'v1:<bookId>:<chapter>', useMarkAsRead);
   - the reader's place in a book is main's lastReadChapters[bookId]; once that chapter is read, the next one;
   - the book being read is the newest Bible chapter in main's history, else main's active Bible place.
   Pure: no storage writes, no DOM. */
import { BIBLE_BOOKS } from '../data/reading-plans.js';
import { continueFromState } from './home-facts.js';

/** Genesis to Malachi: the first 39 books of the canon table. */
export const OT_COUNT = 39;

/** @typedef {{ id: string, title: string, chapters: number, testament: 'old' | 'new' }} Book */

/** @type {Book[]} */
export const BOOK_LIST = BIBLE_BOOKS.map((row, i) => ({
  id: String(row[0]), title: String(row[1]), chapters: Number(row[2]), testament: /** @type {'old' | 'new'} */ (i < OT_COUNT ? 'old' : 'new'),
}));

/** main's other names for a book (TSOT Matthew's study id): the reader's place in it is the canon book's. */
const ALIASES = { matthew: 'matthew-plain' };

/** The canon book for an id, or null. @param {string} id @returns {Book | null} */
export function bookOf(id) {
  const key = ALIASES[id] || id;
  return BOOK_LIST.find((b) => b.id === key) || null;
}

/** @param {'old' | 'new'} t */
export function testamentBooks(t) {
  return BOOK_LIST.filter((b) => b.testament === t);
}

/**
 * The book being read: the newest Bible chapter in main's history (newest first), else main's active Bible place.
 * @param {any} state vot-state @param {any[]} entries HistoryStore.list() @returns {string | null} a canon book id
 */
export function readingBook(state, entries) {
  for (const e of Array.isArray(entries) ? entries : []) {
    if (e && e.type === 'chapter' && e.bookId) {
      const b = bookOf(String(e.bookId));
      if (b) return b.id;
    }
  }
  const cont = continueFromState(state);
  const b = cont && cont.kind === 'chapter' ? bookOf(cont.book) : null;
  return b ? b.id : null;
}

/**
 * A book's chapters as the grid shows them: which are read, and the reader's place (ringed).
 * @param {any} state vot-state @param {Book} book @returns {{ read: number[], place: number | null }}
 */
export function bookProgress(state, book) {
  const s = state && typeof state === 'object' ? state : {};
  const items = s.readItems && typeof s.readItems === 'object' ? s.readItems : {};
  const read = [];
  for (let c = 1; c <= book.chapters; c += 1) if (items['v1:' + book.id + ':' + c]) read.push(c);
  const chapters = s.lastReadChapters && typeof s.lastReadChapters === 'object' ? s.lastReadChapters : {};
  let place = Number(chapters[book.id]) || 0;
  if (place < 1 || place > book.chapters) return { read, place: null };
  while (place < book.chapters && read.includes(place)) place += 1;
  return { read, place: read.includes(place) ? null : place };
}

/** The reader's saved state and history, read only (a real boot, under HydrationGate). */
export function savedBible(gl = /** @type {any} */ (globalThis)) {
  let state = null;
  let entries = [];
  try {
    const store = gl.StateStore;
    if (store && typeof store.isReady === 'function' && store.isReady()) state = store.get();
  } catch (_e) { /* nothing saved: no marks */ }
  try {
    const hist = gl.HistoryStore;
    if (hist && typeof hist.isReady === 'function' && hist.isReady()) entries = hist.list() || [];
  } catch (_e) { /* no history */ }
  return { state, entries };
}

/** The reader's translation as the pages name it ("NKJV"): main's label when it has one. @param {string | undefined} tr */
export function translationName(tr, gl = /** @type {any} */ (globalThis)) {
  const id = tr || 'nkjv';
  return typeof gl.translationLabel === 'function' ? gl.translationLabel(id) : String(id).toUpperCase();
}
