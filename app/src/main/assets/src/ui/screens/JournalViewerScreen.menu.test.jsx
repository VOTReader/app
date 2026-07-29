/* Journal pin/menu UX (2026-07-12, owner-reported).
   ─────────────────────────────────────────────────────────────────
   (1) VIEWER NAV DECONGESTION: the viewer used to add SEPARATE pin +
   delete icons to LibraryNav (8 icons total) — they rendered off-screen
   on narrow Android. The nav now carries ONE ⋯ button that opens the
   same entry-options sheet the hub cards use (JournalCardMenu) with the
   redundant "Open Entry" hidden and the triple-confirm delete inside.

   (2) HUB PIN MARKER: the pinned indicator used to be an absolutely-
   positioned icon at right:44px that drew ON TOP of the card's
   timestamp. It is now an INLINE glyph inside the date span — it flows
   with the text and can never overlap.

   Screens read bare globals — stubbed below; JournalCardMenu is real
   (imported from the hub module, exactly how the bundle globalizes it). */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { JournalViewerScreen } from './JournalViewerScreen.jsx';
import { JournalHubScreen, JournalCardMenu } from './JournalHubScreen.jsx';

/** @type {any} */ (globalThis).JournalCardMenu = JournalCardMenu;

const ENTRY = {
  id: 'e1', title: 'Morning Reflection', pinned: true,
  created: 1720000000000, updated: 1720000000000,
  blocks: [], tags: [],
};

function setupGlobals({ entries = [ENTRY] } = {}) {
  window.ScreenLayout = ({ children, navChildren }) => (
    <div>
      <div className="test-nav">{navChildren}</div>
      {children}
    </div>
  );
  window.LibraryNav = (opts) => <>{(opts && opts.rightExtras) || null}</>;
  window.JournalStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    get: (id) => entries.find(e => e.id === id) || null,
    all: () => entries.slice(),
    togglePin: vi.fn(),
    remove: vi.fn(),
    associatedDataSummary: () => null,
  };
  window.JournalHelpers = {
    entryDisplayTitle: (e) => e.title,
    previewText: () => 'a short preview',
    attachmentSummary: () => [],
    shortDate: () => 'Jul 12',
    shortTime: () => '3:04 PM',
    longDate: () => 'July 12, 2026',
  };
}

beforeEach(() => {
  modalRegistry._reset();
});

afterEach(() => {
  cleanup();
  modalRegistry._reset();
  delete window.ScreenLayout;
  delete window.LibraryNav;
  delete window.JournalStore;
  delete window.JournalHelpers;
  delete window.__journalBackStack;
});

describe('JournalViewerScreen — decongested nav + ⋯ entry menu', () => {
  it('the nav carries ONE ⋯ extra — the separate pin and delete icons are gone', () => {
    setupGlobals();
    const { container } = render(<JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} />);
    expect(container.querySelector('.jrn-entry-menu-btn')).toBeTruthy();
    expect(container.querySelector('.jrn-pin-btn')).toBeNull();
    expect(container.querySelector('.jrn-del-btn')).toBeNull();
  });

  it('⋯ opens Edit/Pin/Delete — the pen FAB is gone (Edit now lives in the menu); Open stays hidden', () => {
    setupGlobals();
    const { container } = render(<JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} />);
    // No floating pen — the edit affordance moved INTO the ⋯ menu.
    expect(container.querySelector('.jrn-fab-action.is-edit')).toBeNull();
    fireEvent.click(container.querySelector('.jrn-entry-menu-btn'));
    expect(screen.queryByText('Open Entry')).toBeNull();       // already inside the entry
    expect(screen.getByText('Edit Entry')).toBeTruthy();
    expect(screen.getByText('Unpin Entry')).toBeTruthy();      // ENTRY.pinned = true
    expect(screen.getByText('Delete Entry')).toBeTruthy();
  });

  it('the menu Edit item calls onEdit', () => {
    const onEdit = vi.fn();
    setupGlobals();
    const { container } = render(<JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={onEdit} />);
    fireEvent.click(container.querySelector('.jrn-entry-menu-btn'));
    fireEvent.click(screen.getByText('Edit Entry'));
    expect(onEdit).toHaveBeenCalled();
  });

  it('the menu pin item toggles the pin in the store', () => {
    setupGlobals();
    const { container } = render(<JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} />);
    fireEvent.click(container.querySelector('.jrn-entry-menu-btn'));
    fireEvent.click(screen.getByText('Unpin Entry'));
    expect(window.JournalStore.togglePin).toHaveBeenCalledWith('e1');
  });

  it('delete runs the triple confirm (NO type-DELETE — owner call 2026-07-28: typing is reserved for the Settings erase-all wipe)', () => {
    setupGlobals();
    const onBack = vi.fn();
    const { container } = render(<JournalViewerScreen entryId="e1" onBack={onBack} onEdit={() => {}} />);
    fireEvent.click(container.querySelector('.jrn-entry-menu-btn'));
    fireEvent.click(screen.getByText('Delete Entry'));
    expect(screen.getByText('Delete this entry?')).toBeTruthy();
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('I am sure'));
    expect(container.querySelector('.jrn-tripledel-input')).toBeNull();
    const finalBtn = /** @type {HTMLButtonElement} */ (screen.getByText('Delete forever'));
    expect(finalBtn.disabled).toBe(false);
    fireEvent.click(finalBtn);
    expect(window.JournalStore.remove).toHaveBeenCalledWith('e1');
    expect(onBack).toHaveBeenCalled();
  });
});

describe('JournalViewerScreen — inline {{ref:}} links actually navigate (dead-UI sweep 2026-07-12)', () => {
  // Pre-fix these tappable gold links called window.__openScriptureSheet — a
  // bridge NO screen installs — so the tap was a silent no-op.
  const REF_ENTRY = {
    ...ENTRY,
    blocks: [{ id: 'b1', type: 'p', text: 'See {{ref:Psalms 23:1}} this morning.' }],
  };

  afterEach(() => {
    delete window.parseRefStr;
    delete window.findBook;
    delete window.__loadBibleCorpus;
    vi.useRealTimers();
  });

  it('tapping the ref navigates to the verse endpoint when the corpus is resolvable', () => {
    setupGlobals({ entries: [REF_ENTRY] });
    window.parseRefStr = (s) => (s === 'Psalms 23:1' ? { rawBook: 'Psalms', chapter: 23, verse: 1, verseEnd: null, tag: null } : null);
    window.findBook = () => 'psalms';
    const onNavigateToLink = vi.fn();
    const { container } = render(
      <JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} onNavigateToLink={onNavigateToLink} />
    );
    fireEvent.click(container.querySelector('.jrn-inline-ref'));
    expect(onNavigateToLink).toHaveBeenCalledWith(
      { type: 'bible', bookId: 'psalms', chapter: 23, verse: 1 },
      expect.anything()
    );
  });

  it('when the Bible corpus is not loaded, the tap fires the loader and navigates once it resolves', () => {
    vi.useFakeTimers();
    setupGlobals({ entries: [REF_ENTRY] });
    window.parseRefStr = () => ({ rawBook: 'Psalms', chapter: 23, verse: 1, verseEnd: null, tag: null });
    let loaded = false;
    window.findBook = () => (loaded ? 'psalms' : null);
    window.__loadBibleCorpus = vi.fn(() => { loaded = true; });
    const onNavigateToLink = vi.fn();
    const { container } = render(
      <JournalViewerScreen entryId="e1" onBack={() => {}} onEdit={() => {}} onNavigateToLink={onNavigateToLink} />
    );
    fireEvent.click(container.querySelector('.jrn-inline-ref'));
    expect(window.__loadBibleCorpus).toHaveBeenCalled();
    expect(onNavigateToLink).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300); // one retry tick after the "load" lands
    expect(onNavigateToLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'bible', bookId: 'psalms', chapter: 23 }),
      expect.anything()
    );
  });
});

describe('JournalHubScreen — inline pin indicator (no timestamp overlap)', () => {
  it('a pinned card renders the pin INSIDE the date span; the old absolute marker is gone', () => {
    setupGlobals();
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    expect(container.querySelector('.jrn-card-pin-marker')).toBeNull();
    const inline = container.querySelector('.jrn-card-date .jrn-card-pin-inline');
    expect(inline).toBeTruthy();
  });

  it('an unpinned card renders no pin glyph at all', () => {
    setupGlobals({ entries: [{ ...ENTRY, id: 'e2', pinned: false }] });
    const { container } = render(<JournalHubScreen onBack={() => {}} onOpenEntry={() => {}} />);
    expect(container.querySelector('.jrn-card-pin-inline')).toBeNull();
    expect(container.querySelector('.jrn-card-pin-marker')).toBeNull();
  });
});
