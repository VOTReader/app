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
import { DEFAULT_LIBRARY_ORDER } from '../../stores/library-order-store.js';

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
  /* DERIVED FROM THE REAL DEFAULT, never re-typed.
     This list used to be a hand-written copy that had fallen a tile behind:
     it omitted 'scripture-web', which DEFAULT_LIBRARY_ORDER has carried since
     the tile shipped. So no case in this file had ever rendered that tile, and
     the screen's own suite could not have caught its removal, its caption, or
     its route — it would have reported green either way. A stub that has to
     agree with a constant is two definitions of one thing; this is the one
     that gets deleted. */
  globalThis.LibraryOrderStore = over.LibraryOrderStore || {
    get: () => [...DEFAULT_LIBRARY_ORDER],
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
    // No bespoke order any more: the shared stub now derives from
    // DEFAULT_LIBRARY_ORDER, so this case renders the tile the app renders.
    // It also asserts that, rather than trusting it — a stub that silently
    // stopped carrying the id would otherwise make this case vacuous instead
    // of red, which is the failure it was written to prevent.
    expect(DEFAULT_LIBRARY_ORDER).toContain('scripture-web');
    setupGlobals();
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
    /* DERIVED, not re-typed. This was a hard 7 while the shared stub carried a
       hand-copied seven-id order, and the two agreed only by accident — the app
       had eight tiles. Counting against DEFAULT_LIBRARY_ORDER means adding a
       tile fails this case for the right reason (its caption is missing) rather
       than for the wrong one (a number nobody updated). */
    expect(guides).toHaveLength(DEFAULT_LIBRARY_ORDER.length);
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
    // The eighth. Its caption says the tile is unfinished rather than how to
    // fill it, which is the honest caption for a screen under construction —
    // and the case above claims EVERY tile, so it has to be named here too.
    expect(tileEl('Scripture Web').querySelector('.library-tile-guide').textContent).toMatch(/under construction/i);
  });

  it('a tile with real content drops its caption', () => {
    setupGlobals({ NoteStore: fakeStore({ count: () => 3 }) });
    renderLibrary();
    expect(tileEl('Notes').querySelector('.library-tile-guide')).toBeNull();
    expect(tileEl('Notes').querySelector('.library-tile-detail').textContent).toBe('3 notes');
    // A first note also earns the matching milestone, so those TWO tiles now
    // have real content; every other tile keeps its caption.
    expect(document.querySelectorAll('.library-tile-guide')).toHaveLength(DEFAULT_LIBRARY_ORDER.length - 2);
  });

  it('the Progress tile drops its caption once anything is read', () => {
    setupGlobals();
    renderLibrary({ totalReadCount: 7 });
    expect(tileEl('Progress').querySelector('.library-tile-guide')).toBeNull();
    expect(document.querySelectorAll('.library-tile-guide')).toHaveLength(DEFAULT_LIBRARY_ORDER.length - 1);
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
