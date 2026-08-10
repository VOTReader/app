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

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'BookmarkStore', 'relativeDate',
  'ConfirmStrip', '_bookTitle'];

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
