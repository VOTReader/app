// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* BookmarksScreen — the sort modes stop being dead code (C2-C [C10]).
   ═══════════════════════════════════════════════════════════════════════
   displayBookmarks' comparator has always carried four branches: 'oldest',
   'source-az', 'label-az', and the newest-first default. The affordance
   above it was a two-state recent/oldest toggle, so two of those four were
   UNREACHABLE — implemented, tested by nothing, reachable by no one, and
   indistinguishable from a finished feature to the next reader of the file.

   Wire or delete; the half-state is the finding. Wired: since the UI pass the
   line over the list says its order ("Newest first") and opens a sheet of all
   four (Newest first, Oldest first, Place A-Z, Name A-Z).
   These are also this screen's first tests (BACKLOG [D6] names the gap).
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { BookmarksScreen } from './BookmarksScreen.jsx';
/* The screen reads the source label as a free global now that it is lazy and
   the derivation stayed in bundle-d — so the stub here is the REAL law, which
   is what makes a source-az pass mean what it says. */
import { _bookmarkSourceLabel } from '../../utils/bookmark-source.js';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'BookmarkStore', 'relativeDate',
  'ConfirmStrip', '_bookTitle', '_bookmarkSourceLabel', '_bookmarkSourceEndpoint'];

/* hlKey 'bible:<book>:<ch>' renders as "<Book title> <ch>" — the SOURCE label.
   `label` is the reader's own name for the bookmark. The two orders differ on
   purpose, so a source-az pass cannot be mistaken for a label-az pass. */
const BOOKMARKS = [
  { id: 'b1', hlKey: 'bible:zeta:1', label: 'Alpha note', created: 100, updated: 100 },
  { id: 'b2', hlKey: 'bible:mu:1', label: 'Zeta note', created: 200, updated: 200 },
  { id: 'b3', hlKey: 'bible:alpha:1', label: 'Mu note', created: 300, updated: 300 },
];

beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = () => null;
  globalThis.relativeDate = () => '';
  globalThis._bookTitle = (id) => id.charAt(0).toUpperCase() + id.slice(1);
  globalThis._bookmarkSourceLabel = _bookmarkSourceLabel;
  globalThis.BookmarkStore = {
    subscribe: () => () => {}, getVersion: () => 0,
    all: () => BOOKMARKS.slice(), remove: () => {}, update: () => {},
    get: (id) => BOOKMARKS.find((b) => b.id === id) || null,
  };
});

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const show = () => render(
  <BookmarksScreen onBack={() => {}} onSearch={() => {}} onHistory={() => {}} theme="dark" onThemeChange={() => {}} />,
);

const sortBtn = () => document.querySelector('.lib-qline .ui-tool');
const rowsOf = () => [...document.querySelectorAll('.bkm-row')];
const labels = () => rowsOf().map((r) => r.querySelector('.ui-row-title').textContent);
const sources = () => rowsOf().map((r) => r.querySelector('.ui-row-meta').textContent.split(' · ')[0]);
const pick = (name) => {
  fireEvent.click(sortBtn());
  fireEvent.click([...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes(name)));
};
const box = () => document.querySelector('input[type="search"]');

describe('BookmarksScreen — the sort sheet reaches every implemented order', () => {
  it('starts newest-first and says so', () => {
    show();
    expect(sortBtn().getAttribute('aria-label')).toBe('Sort: Newest first');
    expect(sources()).toEqual(['Alpha 1', 'Mu 1', 'Zeta 1']);
  });

  it('offers the four orders', () => {
    show();
    fireEvent.click(sortBtn());
    expect([...document.querySelectorAll('[role="radio"]')].map((b) => b.textContent.replace('✓', ''))).toEqual(['Newest first', 'Oldest first', 'Place A-Z', 'Name A-Z']);
  });

  it('oldest-first', () => {
    show();
    pick('Oldest first');
    expect(sortBtn().getAttribute('aria-label')).toBe('Sort: Oldest first');
    expect(sources()).toEqual(['Zeta 1', 'Mu 1', 'Alpha 1']);
  });

  it('by place, which is not the name order', () => {
    show();
    pick('Place A-Z');
    expect(sources()).toEqual(['Alpha 1', 'Mu 1', 'Zeta 1']);
    expect(labels()).toEqual(['Mu note', 'Zeta note', 'Alpha note']);
  });

  it('by name, a different order again', () => {
    show();
    pick('Name A-Z');
    expect(labels()).toEqual(['Alpha note', 'Mu note', 'Zeta note']);
    expect(sources()).toEqual(['Zeta 1', 'Alpha 1', 'Mu 1']);
  });

  it('sorts the FILTERED list, not the whole store', () => {
    show();
    fireEvent.change(box(), { target: { value: 'note' } });
    pick('Name A-Z');
    expect(labels()).toEqual(['Alpha note', 'Mu note', 'Zeta note']);
  });
});

/* The name said once (bug: the card repeated it): a label that is the place's own name shows once. */
describe('BookmarkRow — the name once, then where it is', () => {
  it('a label equal to the place shows once; a different label names the place in the meta line', () => {
    globalThis.BookmarkStore = { ...globalThis.BookmarkStore, all: () => [
      { id: 'x1', hlKey: 'bible:alpha:1', label: 'Alpha 1', created: 5, updated: 5 },
      { id: 'x2', hlKey: 'bible:mu:1', label: '', created: 4, updated: 4 },
      { id: 'x3', hlKey: 'bible:zeta:1', label: 'My place', created: 3, updated: 3 },
    ] };
    show();
    expect(labels()).toEqual(['Alpha 1', 'Mu 1', 'My place']);
    expect(rowsOf()[0].querySelector('.ui-row-meta')).toBeNull();
    expect(rowsOf()[2].querySelector('.ui-row-meta').textContent).toMatch(/^Zeta 1/);
  });
});

/* Sweep W69: the list was a fresh slice per render (so the memo never held), and the search, the
   Source A-Z comparator and every row each resolved the source label again: a corpus or journal
   lookup, 2 n log n of them per sort, on every keystroke. Now: one list and one label per bookmark
   per store version. */
describe('BookmarksScreen — large libraries', () => {
  it('reads the store and resolves each source label once per version, not per keystroke', () => {
    let alls = 0, resolves = 0;
    const many = [];
    for (let i = 0; i < 60; i++) many.push({ id: 'm' + i, hlKey: 'bible:' + ['zeta', 'mu', 'alpha'][i % 3] + ':' + (i + 1), label: 'note ' + i, created: i, updated: i });
    globalThis.BookmarkStore = { ...globalThis.BookmarkStore, all: () => { alls++; return many.slice(); } };
    globalThis._bookmarkSourceLabel = (k) => { resolves++; return _bookmarkSourceLabel(k); };
    show();
    pick('Place A-Z');
    for (const q of ['n', 'no', 'not', 'note']) fireEvent.change(box(), { target: { value: q } });
    expect(sources().length).toBe(60);
    expect(sources()[0]).toBe('Alpha 12');   // A-Z on the label text: 'alpha 12' < 'alpha 3'
    expect(alls).toBe(1);
    expect(resolves).toBe(60);
  });
});

/* ds5 s19.9 moved with the UI pass: a label is renamed in its own sheet (Cancel | Save), so Cancel closes it
   without saving and only Save writes. */
describe('Bookmarks — Rename in its own sheet', () => {
  const openRename = () => {
    fireEvent.click(rowsOf()[0].querySelector('.ui-row-menu'));
    fireEvent.click([...document.querySelectorAll('.ui-sheet .ui-row-press')].find((r) => r.textContent === 'Rename'));
  };
  const field = () => document.querySelector('input[aria-label="Bookmark name"]');
  const sheetButton = (name) => [...document.querySelectorAll('.ui-sheet button')].find((b) => b.textContent === name);

  it('Cancel never saves; Save writes the new name', () => {
    const updates = [];
    globalThis.BookmarkStore = { ...globalThis.BookmarkStore, update: (id, v) => updates.push([id, v]) };
    show();
    openRename();
    fireEvent.change(field(), { target: { value: 'typed then cancelled' } });
    fireEvent.click(sheetButton('Cancel'));
    expect(updates).toEqual([]);
    expect(field()).toBeNull();
    openRename();
    fireEvent.change(field(), { target: { value: 'kept' } });
    fireEvent.click(sheetButton('Save'));
    expect(updates).toEqual([['b3', { label: 'kept' }]]);
  });

  it('the menu says Open, Rename, Delete bookmark in plain words', () => {
    show();
    fireEvent.click(rowsOf()[0].querySelector('.ui-row-menu'));
    expect([...document.querySelectorAll('.ui-sheet .ui-row-title')].map((t) => t.textContent)).toEqual(['Open', 'Rename', 'Delete bookmark']);
  });
});

/* n118: one empty-state pattern. No bookmarks: the how-to and one primary button, no search or sort. */
describe('BookmarksScreen — empty state', () => {
  it('hides search and sort, names the bar button, offers one button that goes Home', () => {
    globalThis.BookmarkStore = { ...globalThis.BookmarkStore, all: () => [] };
    let home = 0;
    const r = render(<BookmarksScreen onBack={() => {}} onHome={() => { home++; }} onSearch={() => {}} onHistory={() => {}} theme="dark" onThemeChange={() => {}} />);
    expect(r.container.querySelector('input')).toBeNull();
    expect(sortBtn()).toBeNull();
    expect(r.container.querySelector('.ui-empty-text').textContent).toMatch(/Tap the bookmark at the top of any letter or chapter/);
    fireEvent.click(r.getByRole('button', { name: 'Start reading' }));
    expect(home).toBe(1);
  });

  it('a full list names its search box', () => {
    const r = show();
    expect(r.getByRole('searchbox', { name: 'Search bookmarks' })).toBeTruthy();
  });
});

/* n163 (idea sweep s19.2): the search also reads each bookmark's thought, the note the reader wrote on it. */
describe('BookmarksScreen — search matches thoughts', () => {
  it('finds a bookmark by a word only in its thought', () => {
    globalThis.BookmarkStore = { ...globalThis.BookmarkStore,
      all: () => BOOKMARKS.map((b) => (b.id === 'b2' ? { ...b, thought: 'Remember the Shepherd here' } : b)) };
    show();
    fireEvent.change(box(), { target: { value: 'shepherd' } });
    expect(labels()).toEqual(['Zeta note']);
  });

  it('a bookmark with no thought still matches on label and source', () => {
    show();
    fireEvent.change(box(), { target: { value: 'alpha' } });
    expect(labels().sort()).toEqual(['Alpha note', 'Mu note']);
  });
});
