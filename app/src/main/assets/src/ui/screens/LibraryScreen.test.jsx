// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* LibraryScreen — the LIBRARY tab's root (the layout pass, 2026-11-10, mock library.png): Reading plans and
   Progress rows; "Yours" tiles with a real count from each store, or a plain line of what the tile holds while
   it is empty; "Recently read" with the three newest History rows and See all. Scripture Web left for Read. */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, cleanup, fireEvent, screen } from '@testing-library/react';
import { LibraryScreen, readWhen, plansLine, RECENT_ROWS } from './LibraryScreen.jsx';

const GLOBALS = ['ScreenLayout', 'NoteStore', 'LinkStore', 'BookmarkStore', 'JournalStore', 'AnnotationStore', 'ReadingPlanStore', 'COL_BY_INDEX_SC'];

const fakeStore = (extra = {}) => ({
  subscribe: () => () => {}, getVersion: () => 0, all: () => ({}), count: () => 0,
  ...extra,
});

function setupGlobals(over = {}) {
  globalThis.ScreenLayout = ({ children, navChildren, navEnd, root }) => (
    <div data-testid="screen-layout" data-root={root ? '1' : '0'}><nav>{navChildren}{navEnd}</nav>{children}</div>
  );
  globalThis.NoteStore = over.NoteStore || fakeStore();
  globalThis.LinkStore = over.LinkStore || fakeStore({ all: () => [] });
  globalThis.BookmarkStore = over.BookmarkStore || fakeStore();
  globalThis.JournalStore = over.JournalStore || fakeStore();
  globalThis.AnnotationStore = over.AnnotationStore || fakeStore();
  if (over.ReadingPlanStore) globalThis.ReadingPlanStore = over.ReadingPlanStore;
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const renderLibrary = (props = {}) => render(
  <LibraryScreen
    onOpenNotes={() => {}} onOpenLinks={() => {}} onOpenBookmarks={() => {}} onOpenJournal={() => {}}
    onOpenHighlights={() => {}} onOpenProgress={() => {}} onOpenPlans={() => {}}
    onSearch={() => {}} onSettings={() => {}}
    historyEnabled={true} history={[]} onOpenHistory={() => {}} onOpenHistoryEntry={() => {}}
    {...props}
  />
);

const tile = (title) => [...document.querySelectorAll('.lib-tile')].find((t) => t.querySelector('.root-tile-title').textContent === title);
const tileLine = (title) => tile(title).querySelector('.root-tile-detail').textContent;

describe('LibraryScreen — the Library root', () => {
  it('is a root titled Library, with Search and the gear', () => {
    setupGlobals();
    const onSettings = vi.fn();
    renderLibrary({ onSettings });
    expect(screen.getByTestId('screen-layout').getAttribute('data-root')).toBe('1');
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('Reading plans and Progress rows open their screens', () => {
    setupGlobals();
    const onOpenPlans = vi.fn(), onOpenProgress = vi.fn();
    renderLibrary({ onOpenPlans, onOpenProgress });
    fireEvent.click(screen.getByRole('button', { name: /Reading plans/ }));
    fireEvent.click(screen.getByRole('button', { name: /Progress/ }));
    expect(onOpenPlans).toHaveBeenCalledTimes(1);
    expect(onOpenProgress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Reading plans/ }).textContent).toContain('The Bible, the letters, short starts');
  });

  it('Yours: five tiles in the mock order, each opening its list; no Scripture Web', () => {
    setupGlobals();
    const handlers = { onOpenNotes: vi.fn(), onOpenHighlights: vi.fn(), onOpenBookmarks: vi.fn(), onOpenJournal: vi.fn(), onOpenLinks: vi.fn() };
    renderLibrary(handlers);
    expect([...document.querySelectorAll('.lib-tile .root-tile-title')].map((t) => t.textContent)).toEqual(['Notes', 'Highlights', 'Bookmarks', 'Journal', 'Links']);
    for (const t of ['Notes', 'Highlights', 'Bookmarks', 'Journal', 'Links']) fireEvent.click(tile(t));
    for (const fn of Object.values(handlers)) expect(fn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Scripture Web/)).toBeNull();
  });

  it('an empty tile says what it holds; a tile with something gives its real count', () => {
    setupGlobals({
      NoteStore: fakeStore({ count: () => 23 }),
      BookmarkStore: fakeStore({ count: () => 1 }),
      JournalStore: fakeStore({ count: () => 4 }),
      AnnotationStore: fakeStore({ all: () => ({ 'v1:john:3': [{ id: 'a1', kind: 'highlight', color: 'yellow' }] }) }),
    });
    renderLibrary();
    expect(tileLine('Notes')).toBe('23 notes');
    expect(tileLine('Highlights')).toBe('1 marked passage');
    expect(tileLine('Bookmarks')).toBe('1 place');
    expect(tileLine('Journal')).toBe('4 entries');
    expect(tileLine('Links')).toBe('Passages you joined together');
  });

  it('a blank-colour note is not counted as a highlight (n363)', () => {
    setupGlobals({ AnnotationStore: fakeStore({ all: () => ({
      'v1:john:3': [{ id: 'b1', kind: 'highlight', color: 'blank' }, { id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow' }],
      'v1:john:4': [{ id: 'a2', groupId: 'g1', kind: 'highlight', color: 'yellow' }],
    }) }) });
    renderLibrary();
    expect(tileLine('Highlights')).toBe('1 marked passage');
  });

  /* The counts read their stores directly at render; what re-renders the screen when one changes is the screen's
     subscription to each store. Drop a store from that list and its count goes stale while the Library is open. */
  it.each([
    ['Notes', 'NoteStore', (n) => fakeStore({ count: () => n })],
    ['Links', 'LinkStore', (n) => fakeStore({ all: () => Array.from({ length: n }, (_, i) => ({ id: 'l' + i })) })],
    ['Bookmarks', 'BookmarkStore', (n) => fakeStore({ count: () => n })],
    ['Journal', 'JournalStore', (n) => fakeStore({ count: () => n })],
    ['Highlights', 'AnnotationStore', (n) => fakeStore({ all: () => (n ? { 'v1:john:3': [{ id: 'a1', kind: 'highlight' }] } : {}) })],
  ])('updates the %s count while the Library stays open', (title, storeName, make) => {
    let version = 0;
    let n = 0;
    const listeners = new Set();
    const live = {
      subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
      getVersion: () => version,
      count: () => make(n).count(),
      all: () => make(n).all(),
    };
    setupGlobals({ [storeName]: live });
    renderLibrary();
    expect(tileLine(title)).not.toMatch(/^\d/);
    act(() => { n = 1; version++; listeners.forEach((cb) => cb()); });
    expect(tileLine(title)).toMatch(/^1 /);
  });
});

describe('LibraryScreen — Recently read', () => {
  const NOW = Date.now();
  const rows = [
    { type: 'letter', letterTitle: 'Wisdom Has Spoken', letterNum: 14, volumeScreen: 'vot-index', ts: NOW },
    { type: 'bible', bookId: 'genesis', bookTitle: 'Genesis', chapterNum: 1, ts: NOW - 1000 },
    { type: 'bible', bookId: 'john', bookTitle: 'John', chapterNum: 3, ts: NOW - 86400000 },
    { type: 'bible', bookId: 'acts', bookTitle: 'Acts', chapterNum: 2, ts: NOW - 3 * 86400000 },
  ];

  it('shows the three newest with their place and day, opens one, and See all opens History', () => {
    setupGlobals();
    globalThis.COL_BY_INDEX_SC = new Map([['vot-index', { label: 'Volume Two' }]]);
    const onOpenHistory = vi.fn(), onOpenHistoryEntry = vi.fn();
    renderLibrary({ history: rows, onOpenHistory, onOpenHistoryEntry });
    const list = [...document.querySelectorAll('.root-row-plain')];
    expect(list).toHaveLength(RECENT_ROWS);
    expect(list[0].textContent).toBe('Wisdom Has SpokenVolume Two, Letter 14 · today›');
    expect(list[1].textContent).toContain('The Scriptures of Truth · today');
    expect(list[2].textContent).toContain('John 3');
    fireEvent.click(list[1]);
    expect(onOpenHistoryEntry).toHaveBeenCalledWith(rows[1]);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it('is gone with History switched off, and with nothing read', () => {
    setupGlobals();
    renderLibrary({ history: rows, historyEnabled: false });
    expect(screen.queryByText('Recently read')).toBeNull();
    cleanup();
    renderLibrary({ history: [] });
    expect(screen.queryByText('Recently read')).toBeNull();
  });

  it('says when in a word', () => {
    const now = new Date(2026, 10, 10, 9);
    expect(readWhen(new Date(2026, 10, 10, 1).getTime(), now)).toBe('today');
    expect(readWhen(new Date(2026, 10, 9, 23).getTime(), now)).toBe('yesterday');
    expect(readWhen(new Date(2026, 10, 3).getTime(), now)).toBe('Nov 3');
    expect(readWhen(undefined, now)).toBe('');
  });
});

describe('LibraryScreen — the plans line', () => {
  it('names what plans there are with none running, else the plan that runs', () => {
    expect(plansLine([])).toBe('The Bible, the letters, short starts');
    expect(plansLine([{ id: 'x', plan: 'nope', name: 'My plan' }])).toMatch(/^My plan/);
    expect(plansLine([{ id: 'x', name: 'A' }, { id: 'y', name: 'B' }])).toMatch(/^A.* · and 1 more$/);
  });
});
