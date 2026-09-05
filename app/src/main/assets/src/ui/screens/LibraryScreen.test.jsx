// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* LibraryScreen tests — Wave 0 MISC-SCREENS item (3).
   ──────────────────────────────────────
   The "No X yet" empty tiles never said how X happens. Each empty tile
   now carries a one-line guidance caption (.library-tile-guide) in the
   voice of the destination screens' own empty states (NotesIndexScreen,
   BookmarksScreen, LinksScreen, HighlightsScreen, JournalHubScreen).
   Captions vanish once the tile has real content.
*/

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, cleanup, fireEvent, screen } from '@testing-library/react';
import { LibraryScreen } from './LibraryScreen.jsx';
import { ACHIEVEMENT_TOTAL } from '../../utils/achievements.js';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'NoteStore', 'LinkStore', 'BookmarkStore',
  'JournalStore', 'AnnotationStore', 'ReadingStatsStore', 'ReadingStreakStore',
  'JournalStatsStore', 'AudioLibraryStore', 'LibraryOrderStore', 'createPressDrag'];

const fakeStore = (extra = {}) => ({
  subscribe: () => () => {}, getVersion: () => 0, all: () => ({}), count: () => 0,
  ...extra,
});

function setupGlobals(over = {}) {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.LibraryNav = () => null;
  globalThis.NoteStore = over.NoteStore || fakeStore();
  globalThis.LinkStore = over.LinkStore || fakeStore({ all: () => [] });
  globalThis.BookmarkStore = over.BookmarkStore || fakeStore();
  globalThis.JournalStore = over.JournalStore || fakeStore();
  globalThis.AnnotationStore = over.AnnotationStore || fakeStore();
  globalThis.ReadingStatsStore = over.ReadingStatsStore || fakeStore({ get: () => ({}) });
  globalThis.ReadingStreakStore = over.ReadingStreakStore || fakeStore({ get: () => ({}) });
  globalThis.JournalStatsStore = over.JournalStatsStore || fakeStore({ get: () => ({}) });
  globalThis.AudioLibraryStore = over.AudioLibraryStore || fakeStore({ saved: () => [], getPlays: () => 0 });
  globalThis.LibraryOrderStore = over.LibraryOrderStore || {
    get: () => ['notes', 'links', 'journal', 'bookmarks', 'highlights', 'progress', 'milestones'],
    set: () => {},
    subscribe: () => () => {},
    getVersion: () => 0,
  };
  // The shared press-drag lifecycle — inert here; no gesture is simulated.
  globalThis.createPressDrag = () => ({
    start: () => {}, suppressed: () => false, destroy: () => {}, land: () => {},
  });
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const renderLibrary = (props = {}) => render(
  <LibraryScreen
    onBack={() => {}}
    onOpenNotes={() => {}}
    onOpenLinks={() => {}}
    onOpenBookmarks={() => {}}
    onOpenJournal={() => {}}
    onOpenHighlights={() => {}}
    onOpenProgress={() => {}}
    onOpenAudio={() => {}}
    onOpenMilestones={() => {}}
    totalReadCount={0}
    readItems={{}}
    theme="dark"
    onThemeChange={() => {}}
    onSearch={() => {}}
    onHistory={() => {}}
    onSettings={() => {}}
    historyEnabled={true}
    {...props}
  />
);

const tileEl = (title) => [...document.querySelectorAll('.library-tile')]
  .find((t) => { const h = t.querySelector('.library-tile-title'); return h && h.textContent.trim() === title; });

/* Scripture Web is reachable only by drilling now (Corbin, 2026-09-05): the
   Home shortcut is gone and this is the way in. It carries an "under
   construction" caption in the app's own `library-tile-guide` style — the same
   one-line span the empty Notes / Links / Bookmarks tiles use — rather than a
   banner or a rectangle of its own. */
describe('Scripture Web is reachable from the Library, and says it is unfinished', () => {
  it('renders the tile with an under-construction caption in the tile-guide style', () => {
    // The shared stub's order list predates the tile and omits it; the REAL
    // LibraryOrderStore default DOES carry 'scripture-web'
    // (library-order-store.js:35), which is what makes the drill-down route
    // Corbin asked for actually reachable. Pass an order that says so rather
    // than widening the shared stub, which several other cases pin.
    setupGlobals({
      LibraryOrderStore: {
        get: () => ['notes', 'links', 'journal', 'bookmarks', 'highlights', 'progress', 'milestones', 'scripture-web'],
        set: () => {}, subscribe: () => () => {}, getVersion: () => 0,
      },
    });
    const onOpenScriptureWeb = vi.fn();
    renderLibrary({ onOpenScriptureWeb });

    const tile = screen.getByText('Scripture Web').closest('button');
    expect(tile).toBeTruthy();

    const guide = tile.querySelector('.library-tile-guide');
    expect(guide).toBeTruthy();
    expect(guide.textContent).toMatch(/under construction/i);

    // Still the way in.
    fireEvent.click(tile);
    expect(onOpenScriptureWeb).toHaveBeenCalledTimes(1);
  });
});

describe('LibraryScreen — empty-tile guidance captions', () => {
  it('every empty tile explains how its content happens', () => {
    setupGlobals();
    renderLibrary();
    const guides = [...document.querySelectorAll('.library-tile-guide')];
    expect(guides).toHaveLength(7);
    guides.forEach((g) => expect(g.textContent.length).toBeGreaterThan(10));
    // Spot-pin the voice/accuracy of each caption against the destination
    // screens' own empty-state copy.
    expect(tileEl('Notes').querySelector('.library-tile-guide').textContent).toMatch(/tap Note/i);
    expect(tileEl('Links').querySelector('.library-tile-guide').textContent).toMatch(/tap Link/i);
    expect(tileEl('Journal').querySelector('.library-tile-guide').textContent).toMatch(/New Entry/);
    expect(tileEl('Bookmarks').querySelector('.library-tile-guide').textContent).toMatch(/tap Bookmark/i);
    expect(tileEl('Highlights & Underlines').querySelector('.library-tile-guide').textContent).toMatch(/tap a color/i);
    expect(tileEl('Progress').querySelector('.library-tile-guide').textContent).toMatch(/read/i);
    expect(tileEl('Milestones').querySelector('.library-tile-guide').textContent).toMatch(/listening/i);
  });

  it('a tile with real content drops its caption', () => {
    setupGlobals({ NoteStore: fakeStore({ count: () => 3 }) });
    renderLibrary();
    expect(tileEl('Notes').querySelector('.library-tile-guide')).toBeNull();
    expect(tileEl('Notes').querySelector('.library-tile-detail').textContent).toBe('3 notes');
    // A first note also earns the matching milestone, so those two tiles now
    // have real content; the remaining five still keep their captions.
    expect(document.querySelectorAll('.library-tile-guide')).toHaveLength(5);
  });

  it('the Progress tile drops its caption once anything is read', () => {
    setupGlobals();
    renderLibrary({ totalReadCount: 7 });
    expect(tileEl('Progress').querySelector('.library-tile-guide')).toBeNull();
    expect(document.querySelectorAll('.library-tile-guide')).toHaveLength(6);
  });

  it('updates the Milestones tile while Library stays open', () => {
    let version = 0;
    let plays = 0;
    const listeners = new Set();
    const audio = fakeStore({
      subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
      getVersion: () => version,
      getPlays: () => plays,
      saved: () => [],
    });
    setupGlobals({ AudioLibraryStore: audio });
    renderLibrary();
    expect(tileEl('Milestones').querySelector('.library-tile-detail').textContent).toBe('None reached yet');

    act(() => {
      plays = 1;
      version++;
      listeners.forEach((cb) => cb());
    });
    // The TOTAL is whatever the table declares — pinning a literal here made
    // adding a category a two-file edit for no assertion value.
    expect(tileEl('Milestones').querySelector('.library-tile-detail').textContent)
      .toBe('1 of ' + ACHIEVEMENT_TOTAL + ' reached');
  });

  it('adopts a restored custom tile order after asynchronous hydration', () => {
    let version = 0;
    let order = ['notes', 'links', 'journal', 'bookmarks', 'highlights', 'progress', 'milestones'];
    let listener = null;
    const orderStore = {
      get: () => order,
      set: () => {},
      getVersion: () => version,
      subscribe: (cb) => { listener = cb; return () => { listener = null; }; },
    };
    setupGlobals({ LibraryOrderStore: orderStore });
    renderLibrary();
    expect(tileEl('Notes')).toBe(document.querySelector('.library-tile'));

    act(() => {
      order = ['progress', 'notes', 'links', 'journal', 'bookmarks', 'highlights', 'milestones'];
      version++;
      listener();
    });
    expect(tileEl('Progress')).toBe(document.querySelector('.library-tile'));
  });
});
