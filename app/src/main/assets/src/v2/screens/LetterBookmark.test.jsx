/* The letter's Bookmark (mw6, v2-gaps 12; main's ChapterBookmarkBtn): a tap saves the whole letter in main's REAL
   BookmarkStore (installed on window as bundle-b's _entry-b.js does), under the key main's own screens resolve; a second
   tap removes it with an Undo; a paragraph's bookmark is never touched; Safari's first save waits; a gate boot writes
   nothing. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { LetterBookmark, letterBookmarkKey } from './LetterScreen.jsx';
import { IDBAdapter } from '../../stores/idb-adapter.js';
import { BookmarkStore, bkmId } from '../../stores/bookmark-store.js';
import { placeOfKey } from '../notes-facts.js';

const g = /** @type {any} */ (globalThis);
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const SEEDED = ['COL_BY_KEY', 'LETTERS_V1', 'WTLB_ONE', 'BookmarkStore', 'bkmId', 'StorageHealth'];

const para = (v) => ({ type: 'para', segments: [{ t: 'text', v }] });
const NAME = { id: 'whats-in-a-name', num: 9, title: "What's In a Name", blocks: [para('There is only one name under Heaven.')] };
const GALLOWS = { id: 'building-the-gallows', num: 46, title: 'Building the Gallows', paragraphs: [{ align: 'center', text: 'Vanity is a rope.' }] };
const COLS = [
  ['one', { volKey: 'one', globalName: 'LETTERS_V1', prefaceGlobal: null, label: 'Volume One', letterScreen: 'vot-one-letter' }],
  ['wtlb1', { volKey: 'wtlb1', globalName: 'WTLB_ONE', prefaceGlobal: null, label: 'Words To Live By: Part One', kind: 'wtlb' }],
];
const LETTER = { place: 'letter', collection: 'one', n: 9 };
const ENTRY = { place: 'letter', collection: 'wtlb1', n: 46 };

beforeEach(async () => {
  IDBAdapter._resetForTests();
  await new Promise((done) => { const req = indexedDB.deleteDatabase(IDBAdapter.DB_NAME); req.onsuccess = done; req.onerror = done; });
  BookmarkStore._resetForTests({ forceLoaded: true });
  g.COL_BY_KEY = new Map(/** @type {any} */ (COLS));
  g.LETTERS_V1 = [NAME];
  g.WTLB_ONE = [GALLOWS];
  g.BookmarkStore = BookmarkStore;
  g.bkmId = bkmId;
});

afterEach(() => {
  cleanup();
  for (const k of SEEDED) delete g[k];
});

const button = (root) => /** @type {HTMLButtonElement} */ (root.querySelector('button.ic'));

describe("the letter's Bookmark (v2-gaps 12)", () => {
  it("saves the whole letter as main keeps it, fills, and says it is in Notes; Notes opens the letter from it", () => {
    const { container } = render(<LetterBookmark route={LETTER} gate={null} />);
    expect(button(container).getAttribute('aria-pressed')).toBe('false');
    expect(button(container).getAttribute('aria-label')).toBe('Bookmark this letter');
    click(button(container));
    const all = BookmarkStore.all();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ hlKey: 'letter:whats-in-a-name', label: "What's In a Name", thought: '' });
    expect(all[0].id).toMatch(/^bkm_/);
    expect(button(container).getAttribute('aria-pressed')).toBe('true');
    expect(button(container).getAttribute('aria-label')).toBe('Remove bookmark');
    expect(container.querySelector('.toast').textContent).toBe('Bookmarked. It is in Notes.');
    expect(placeOfKey(all[0].hlKey, g).open).toEqual({ place: 'letter', collection: 'one', n: 9 });
  });

  it('a second tap removes it, and Undo puts the same record back', () => {
    const { container } = render(<LetterBookmark route={LETTER} gate={null} />);
    click(button(container));
    const made = { ...BookmarkStore.all()[0] };
    click(button(container));
    expect(BookmarkStore.all()).toHaveLength(0);
    expect(button(container).getAttribute('aria-pressed')).toBe('false');
    const toast = container.querySelector('.toast');
    expect(toast.textContent).toBe('Bookmark removed.Undo');
    click(toast.querySelector('button.act'));
    expect(BookmarkStore.all()).toEqual([made]);
    expect(button(container).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.toast')).toBeNull();
  });

  it("a bookmark main made on one of its paragraphs is its own: the button stays empty and never removes it", () => {
    BookmarkStore.add(/** @type {any} */ ({ id: 'bkm_para', hlKey: 'letter:whats-in-a-name:0', label: 'one name' }));
    const { container } = render(<LetterBookmark route={LETTER} gate={null} />);
    expect(button(container).getAttribute('aria-pressed')).toBe('false');
    click(button(container));
    click(button(container));
    expect(BookmarkStore.all().map((b) => b.id)).toEqual(['bkm_para']);
  });

  it("a bookmark main made on the letter shows filled (main's LetterView key), and an old thought comes back on Undo", () => {
    BookmarkStore.add(/** @type {any} */ ({ id: 'bkm_old', hlKey: 'letter:whats-in-a-name', label: 'Name', thought: 'Read on Sunday' }));
    const { container } = render(<LetterBookmark route={LETTER} gate={null} />);
    expect(button(container).getAttribute('aria-pressed')).toBe('true');
    click(button(container));
    expect(BookmarkStore.all()).toHaveLength(0);
    click(container.querySelector('.toast button.act'));
    expect(BookmarkStore.all()[0]).toMatchObject({ id: 'bkm_old', thought: 'Read on Sunday' });
  });

  it("a Words To Live By entry is kept as 'wtlb:<id>', the prefix of its paragraphs' keys", () => {
    expect(letterBookmarkKey(GALLOWS)).toBe('wtlb:building-the-gallows');
    expect(letterBookmarkKey(NAME)).toBe('letter:whats-in-a-name');
    const { container } = render(<LetterBookmark route={ENTRY} gate={null} />);
    click(button(container));
    expect(BookmarkStore.all()[0]).toMatchObject({ hlKey: 'wtlb:building-the-gallows', label: 'Building the Gallows' });
    expect(placeOfKey('wtlb:building-the-gallows', g).open).toEqual({ place: 'letter', collection: 'wtlb1', n: 46 });
  });

  it("Safari's first save waits on the 7-day notice: nothing is saved, the button stays empty", () => {
    let asked = 0;
    g.StorageHealth = { checkFirstDataCreation: () => { asked++; return { shouldBlock: asked === 1 }; } };
    const { container } = render(<LetterBookmark route={LETTER} gate={null} />);
    click(button(container));
    expect(BookmarkStore.all()).toHaveLength(0);
    expect(button(container).getAttribute('aria-pressed')).toBe('false');
    click(button(container));
    expect(BookmarkStore.all()).toHaveLength(1);
  });

  it('a gate boot draws the empty bookmark and a tap writes nothing', () => {
    BookmarkStore.add(/** @type {any} */ ({ id: 'bkm_old', hlKey: 'letter:whats-in-a-name', label: 'Name' }));
    const { container } = render(<LetterBookmark route={LETTER} gate={{ id: '1a-letter' }} />);
    expect(button(container).getAttribute('aria-pressed')).toBe('false');
    click(button(container));
    expect(BookmarkStore.all().map((b) => b.id)).toEqual(['bkm_old']);
    expect(container.querySelector('.toast')).toBeNull();
  });
});
