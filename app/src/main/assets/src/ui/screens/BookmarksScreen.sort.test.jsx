// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* BookmarksScreen — the sort modes stop being dead code (C2-C [C10]).
   ═══════════════════════════════════════════════════════════════════════
   displayBookmarks' comparator has always carried four branches: 'oldest',
   'source-az', 'label-az', and the newest-first default. The affordance
   above it was a two-state recent/oldest toggle, so two of those four were
   UNREACHABLE — implemented, tested by nothing, reachable by no one, and
   indistinguishable from a finished feature to the next reader of the file.

   Wire or delete; the half-state is the finding. Wired: the same one button
   (the shape NotesIndexScreen and LinksScreen use) now cycles the whole list.
   These are also this screen's first tests (BACKLOG [D6] names the gap).
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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

const sortBtn = () => document.querySelector('.notes-index-sort-btn');
const sources = () => [...document.querySelectorAll('.bkm-row-source')].map((el) => el.textContent);
const labels = () => [...document.querySelectorAll('.bkm-row-label')].map((el) => el.textContent);
const step = () => fireEvent.click(sortBtn());

describe('BookmarksScreen — the sort cycle reaches every implemented mode', () => {
  it('starts newest-first', () => {
    show();
    expect(sortBtn().textContent).toBe('Sort: Newest ↓');
    expect(sources()).toEqual(['Alpha 1', 'Mu 1', 'Zeta 1']);
  });

  it('steps to oldest-first', () => {
    show();
    step();
    expect(sortBtn().textContent).toBe('Sort: Oldest ↑');
    expect(sources()).toEqual(['Zeta 1', 'Mu 1', 'Alpha 1']);
  });

  it('reaches source A-Z — which nothing could reach before', () => {
    show();
    step(); step();
    expect(sortBtn().textContent).toBe('Sort: Source A-Z');
    expect(sources()).toEqual(['Alpha 1', 'Mu 1', 'Zeta 1']);
    // …and it is genuinely sorting by SOURCE: the labels are not in order.
    expect(labels()).toEqual(['Mu note', 'Zeta note', 'Alpha note']);
  });

  it('reaches label A-Z — likewise, and it is a different order', () => {
    show();
    step(); step(); step();
    expect(sortBtn().textContent).toBe('Sort: Label A-Z');
    expect(labels()).toEqual(['Alpha note', 'Mu note', 'Zeta note']);
    expect(sources()).toEqual(['Zeta 1', 'Alpha 1', 'Mu 1']);
  });

  it('wraps back to the start on the fourth press', () => {
    show();
    step(); step(); step(); step();
    expect(sortBtn().textContent).toBe('Sort: Newest ↓');
    expect(sources()).toEqual(['Alpha 1', 'Mu 1', 'Zeta 1']);
  });

  it('names itself as a cycle, not a toggle', () => {
    show();
    expect(sortBtn().getAttribute('title')).toBe('Cycle sort order');
  });

  it('sorts the FILTERED list, not the whole store', () => {
    show();
    fireEvent.change(document.querySelector('input.notes-index-search'), { target: { value: 'note' } });
    step(); step(); step();   // → label A-Z
    expect(labels()).toEqual(['Alpha note', 'Mu note', 'Zeta note']);
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
    step(); step();
    expect(sortBtn().textContent).toBe('Sort: Source A-Z');
    const box = document.querySelector('input.notes-index-search');
    for (const q of ['n', 'no', 'not', 'note']) fireEvent.change(box, { target: { value: q } });
    expect(sources().length).toBe(60);
    expect(sources()[0]).toBe('Alpha 12');   // A-Z on the label text: 'alpha 12' < 'alpha 3'
    expect(alls).toBe(1);
    expect(resolves).toBe(60);
  });
});

/* ds5 s19.9 (idea sweep 2026-10-22): Escape cancels a label edit, but the input also saves on
   blur, and a browser may blur it as it unmounts: the cancelled text could still be saved. */
describe('BookmarkRow — Escape on a label edit never saves (ds5 s19.9)', () => {
  it('a blur that follows Escape does not save the typed label', async () => {
    const { BookmarkRow } = await import('./BookmarksScreen.jsx');
    const saves = [];
    const cancels = [];
    const bkm = BOOKMARKS[0];
    render(<BookmarkRow bkm={bkm} source="Zeta 1" onNavigate={() => {}} onLongPress={() => {}}
      editingId={bkm.id} onEditSave={(id, v) => saves.push(v)} onEditCancel={() => cancels.push(1)} />);
    const input = document.querySelector('.bkm-row-edit-input');
    fireEvent.change(input, { target: { value: 'typed then cancelled' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);                       // the blur some browsers fire on the way out
    expect(saves).toEqual([]);
    expect(cancels.length).toBeGreaterThanOrEqual(1);
  });

  it('Enter still saves', async () => {
    const { BookmarkRow } = await import('./BookmarksScreen.jsx');
    const saves = [];
    const bkm = BOOKMARKS[0];
    render(<BookmarkRow bkm={bkm} source="Zeta 1" onNavigate={() => {}} onLongPress={() => {}}
      editingId={bkm.id} onEditSave={(id, v) => saves.push(v)} onEditCancel={() => {}} />);
    const input = document.querySelector('.bkm-row-edit-input');
    fireEvent.change(input, { target: { value: 'kept' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(saves).toEqual(['kept']);
  });
});

/* n118: one empty-state pattern. No bookmarks: the how-to and one primary button, no search or sort. */
describe('BookmarksScreen — empty state', () => {
  it('hides search and sort, keeps the instruction, offers one button that goes Home', () => {
    globalThis.BookmarkStore = { ...globalThis.BookmarkStore, all: () => [] };
    let home = 0;
    const r = render(<BookmarksScreen onBack={() => {}} onHome={() => { home++; }} onSearch={() => {}} onHistory={() => {}} theme="dark" onThemeChange={() => {}} />);
    expect(r.container.querySelector('input')).toBeNull();
    expect(sortBtn()).toBeNull();
    expect(r.container.querySelector('.notes-empty-hint').textContent).toMatch(/tap Bookmark in the toolbar/);
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
    fireEvent.change(document.querySelector('input.notes-index-search'), { target: { value: 'shepherd' } });
    expect(labels()).toEqual(['Zeta note']);
  });

  it('a bookmark with no thought still matches on label and source', () => {
    show();
    fireEvent.change(document.querySelector('input.notes-index-search'), { target: { value: 'alpha' } });
    expect(labels().sort()).toEqual(['Alpha note', 'Mu note']);
  });
});
