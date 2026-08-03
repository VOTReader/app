// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* LibraryScreen tests — Wave 0 MISC-SCREENS item (3).
   ──────────────────────────────────────
   The "No X yet" empty tiles never said how X happens. Each empty tile
   now carries a one-line guidance caption (.library-tile-guide) in the
   voice of the destination screens' own empty states (NotesIndexScreen,
   BookmarksScreen, LinksScreen, HighlightsScreen, JournalHubScreen).
   Captions vanish once the tile has real content.
*/

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LibraryScreen } from './LibraryScreen.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'NoteStore', 'LinkStore', 'BookmarkStore',
  'JournalStore', 'AnnotationStore', 'LibraryOrderStore', 'createPressDrag'];

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
  globalThis.LibraryOrderStore = {
    get: () => ['notes', 'links', 'journal', 'bookmarks', 'highlights', 'progress'],
    set: () => {},
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
    totalReadCount={0}
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

describe('LibraryScreen — empty-tile guidance captions', () => {
  it('every empty tile explains how its content happens', () => {
    setupGlobals();
    renderLibrary();
    const guides = [...document.querySelectorAll('.library-tile-guide')];
    expect(guides).toHaveLength(6);
    guides.forEach((g) => expect(g.textContent.length).toBeGreaterThan(10));
    // Spot-pin the voice/accuracy of each caption against the destination
    // screens' own empty-state copy.
    expect(tileEl('Notes').querySelector('.library-tile-guide').textContent).toMatch(/tap Note/i);
    expect(tileEl('Links').querySelector('.library-tile-guide').textContent).toMatch(/tap Link/i);
    expect(tileEl('Journal').querySelector('.library-tile-guide').textContent).toMatch(/New Entry/);
    expect(tileEl('Bookmarks').querySelector('.library-tile-guide').textContent).toMatch(/tap Bookmark/i);
    expect(tileEl('Highlights & Underlines').querySelector('.library-tile-guide').textContent).toMatch(/tap a color/i);
    expect(tileEl('Progress').querySelector('.library-tile-guide').textContent).toMatch(/read/i);
  });

  it('a tile with real content drops its caption', () => {
    setupGlobals({ NoteStore: fakeStore({ count: () => 3 }) });
    renderLibrary();
    expect(tileEl('Notes').querySelector('.library-tile-guide')).toBeNull();
    expect(tileEl('Notes').querySelector('.library-tile-detail').textContent).toBe('3 notes');
    // The other five tiles are still empty and keep their captions.
    expect(document.querySelectorAll('.library-tile-guide')).toHaveLength(5);
  });

  it('the Progress tile drops its caption once anything is read', () => {
    setupGlobals();
    renderLibrary({ totalReadCount: 7 });
    expect(tileEl('Progress').querySelector('.library-tile-guide')).toBeNull();
    expect(document.querySelectorAll('.library-tile-guide')).toHaveLength(5);
  });
});
