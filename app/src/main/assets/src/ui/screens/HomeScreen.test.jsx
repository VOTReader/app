// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* HomeScreen tests — Wave 0 MISC-SCREENS item (5).
   ──────────────────────────────────────
   The Surprise FAB was a bare "breathing dice" glyph: an aria-label for
   screen readers, but nothing on screen telling a sighted user what the
   pulsing icon does. It now carries a visible "Surprise Me" caption that
   matches the accessible name (label-in-name), pinned here.
*/

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { HomeScreen } from './HomeScreen.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { NavButtons } from '../components/NavButtons.jsx';
import { ThemeBtn } from '../components/ThemeBtn.jsx';

const GLOBALS = ['ScreenLayout', 'ThemeBtn', 'HomeOrderStore', 'createPressDrag', 'translationLabel', 'LibraryNav', 'NavButtons'];

function setupGlobals() {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.ThemeBtn = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.NavButtons = NavButtons;
  globalThis.HomeOrderStore = {
    get: () => ['volumes', 'scriptures', 'studies', 'listening', 'library', 'settings', 'history'],
    set: () => {},
  };
  // The shared press-drag lifecycle — inert here; no gesture is simulated.
  globalThis.createPressDrag = () => ({
    start: () => {}, suppressed: () => false, destroy: () => {}, land: () => {},
  });
  globalThis.translationLabel = () => 'NKJV';
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
  ['__loadVotCorpus', '__loadBibleCorpus', '__loadMatthewCorpus', 'loadBibleStudies'].forEach((k) => { delete window[k]; });
});

const renderHome = (props = {}) => render(
  <HomeScreen
    onSelect={() => {}}
    onSurprise={() => {}}
    showSurprise={true}
    onSettings={() => {}}
    onSearch={() => {}}
    onHistory={() => {}}
    historyEnabled={true}
    onAbout={() => {}}
    history={[]}
    theme="dark"
    onThemeChange={() => {}}
    translation="nkjv"
    {...props}
  />
);

describe('HomeScreen — shortcuts and demand loading', () => {
  it('keeps corpora idle until a destination is approached, even with Surprise enabled', () => {
    setupGlobals();
    window.__loadVotCorpus = vi.fn(() => Promise.resolve());
    window.__loadBibleCorpus = vi.fn(() => Promise.resolve());
    renderHome();
    expect(window.__loadVotCorpus).not.toHaveBeenCalled();
    expect(window.__loadBibleCorpus).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByRole('button', { name: /The Scriptures of Truth/ }));
    expect(window.__loadBibleCorpus).toHaveBeenCalledTimes(1);
    expect(window.__loadVotCorpus).not.toHaveBeenCalled();
  });

  it('honors disabled Search and History in quick access', () => {
    setupGlobals();
    renderHome({ searchEnabled: false, historyEnabled: false });
    expect(screen.queryByRole('button', { name: 'Search library' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recent reading' })).toBeNull();
  });

  /* Corbin, 2026-09-05: "get rid of scripture web on the landing page, make
     users drill for it, still under construction." Home is the landing page,
     so the shortcut goes; the Library entry stays and carries the caption. The
     routes and deep links are untouched — this is about what Home OFFERS, not
     about what the app can reach.

     Asserted by absence, and absence is the weak kind of assertion, so the
     second half of this case is the control: the OTHER shortcuts must still be
     there. A Home that rendered no shortcut row at all would satisfy the first
     expectation and fail the reader. */
  it('Home offers no Scripture Web shortcut, and still offers the others', () => {
    setupGlobals();
    renderHome({ onNotes: () => {}, onBookmarks: () => {} });

    expect(screen.queryByRole('button', { name: /Scripture Web/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Scripture Web/i);

    // The control: the row itself is alive.
    const shortcuts = document.querySelector('.home-shortcuts');
    expect(shortcuts).toBeTruthy();
    const labels = [...shortcuts.querySelectorAll('button')].map((x) => x.textContent.trim());
    expect(labels).toContain('Notes');
    expect(labels).toContain('Bookmarks');
    expect(labels).toContain('Recent reading');
    expect(labels).not.toContain('Scripture Web');
  });

  it('reorders by keyboard while preserving hidden History and focus', () => {
    setupGlobals();
    HomeOrderStore.get = () => ['volumes', 'history', 'scriptures', 'studies', 'listening', 'library', 'settings'];
    HomeOrderStore.set = vi.fn();
    renderHome({ historyEnabled: false });
    const card = screen.getByRole('button', { name: /The Scriptures of Truth/ });
    card.focus();
    fireEvent.keyDown(card, { key: 'ArrowUp', altKey: true });
    expect(HomeOrderStore.set).toHaveBeenCalledWith(['scriptures', 'history', 'volumes', 'studies', 'listening', 'library', 'settings']);
    expect(document.activeElement).toBe(card);
  });

  it('waits for every Surprise source and prevents repeated taps', async () => {
    setupGlobals();
    let finish;
    window.__loadVotCorpus = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    window.__loadBibleCorpus = vi.fn(() => Promise.resolve());
    window.__loadMatthewCorpus = vi.fn(() => Promise.resolve());
    window.loadBibleStudies = vi.fn(() => Promise.resolve());
    const onSurprise = vi.fn();
    renderHome({ onSurprise });
    const button = screen.getByRole('button', { name: /Surprise Me/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    expect(onSurprise).not.toHaveBeenCalled();
    expect(window.loadBibleStudies).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(onSurprise).toHaveBeenCalledTimes(1);
  });

  it('offers retry after a failed Surprise load', async () => {
    setupGlobals();
    window.__loadVotCorpus = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const onSurprise = vi.fn();
    renderHome({ onSurprise });
    const button = screen.getByRole('button', { name: /Surprise Me/ });
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole('status').textContent).toContain('try Surprise Me again');
    expect(button.disabled).toBe(false);
    await act(async () => { fireEvent.click(button); });
    expect(onSurprise).toHaveBeenCalledTimes(1);
  });

  it('does not navigate after leaving Home during a Surprise load', async () => {
    setupGlobals();
    let finish;
    window.__loadVotCorpus = () => new Promise((resolve) => { finish = resolve; });
    const onSurprise = vi.fn();
    const view = renderHome({ onSurprise });
    fireEvent.click(screen.getByRole('button', { name: /Surprise Me/ }));
    view.unmount();
    await act(async () => { finish(); });
    expect(onSurprise).not.toHaveBeenCalled();
  });
});

describe('HomeScreen — Listening Library card', () => {
  it('renders the card pixel-consistent with its neighbors and routes through onOpenAudio', () => {
    setupGlobals();
    const onOpenAudio = vi.fn();
    const onSelect = vi.fn();
    renderHome({ onOpenAudio, onSelect });

    const card = screen.getByRole('button', { name: /Listening Library/ });
    expect(card.className).toContain('home-nav-item');           // same anatomy as the other six
    expect(card.textContent).toContain('Audio Readings');        // eyebrow
    expect(card.textContent).toContain('The Letters & Scriptures, read aloud');

    fireEvent.click(card);
    expect(onOpenAudio).toHaveBeenCalledTimes(1);                // origin-aware capture path…
    expect(onSelect).not.toHaveBeenCalled();                     // …never the origin-less chain
  });
});

describe('HomeScreen — Surprise FAB naming', () => {
  const NAME = 'Surprise Me — open a random chapter or letter';

  it('exposes an accessible name that says what the button does', () => {
    setupGlobals();
    renderHome();
    const fab = screen.getByRole('button', { name: NAME });
    expect(fab.className).toContain('surprise-fab');
  });

  /* C2-C [C8]: hover said "Open a Random Chapter or Letter" and TalkBack said
     "Surprise Me" — two different answers to the same question. One string
     now feeds both. */
  it('gives the tooltip and the accessible name the SAME string', () => {
    setupGlobals();
    renderHome();
    const fab = screen.getByRole('button', { name: NAME });
    expect(fab.getAttribute('title')).toBe(NAME);
    expect(fab.getAttribute('aria-label')).toBe(fab.getAttribute('title'));
  });

  it('shows a visible caption the accessible name still contains (label-in-name)', () => {
    setupGlobals();
    renderHome();
    const fab = screen.getByRole('button', { name: NAME });
    const caption = fab.querySelector('.surprise-fab-caption');
    expect(caption).toBeTruthy();
    expect(caption.textContent).toBe('Surprise Me');
    expect(NAME.startsWith(caption.textContent)).toBe(true);
  });

  it('renders no FAB when the setting is off', () => {
    setupGlobals();
    renderHome({ showSurprise: false });
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
  });
});

/* C2-C [C8] — the top-nav icon cluster. These three buttons named themselves
   through `title` alone. A title is only a LAST-RESORT fallback in the
   accessible-name computation, is not announced by every assistive
   technology, and never appears at all on touch — which is where this app
   lives. The titles are simultaneously load-bearing CSS selectors
   (`.nav-search-btn[title="Search"]`, `[title="History"]`), so they had to
   stay byte-identical while the labels were added. */
describe('NavButtons — the icon cluster names itself', () => {
  // The REAL ThemeBtn, not the null stub: the fourth icon is part of the
  // cluster contract below (title and label must agree on every one).
  const nav = () => {
    globalThis.ThemeBtn = ThemeBtn;
    return render(
      <div>{NavButtons({ onSettings: () => {}, onHistory: () => {}, onSearch: () => {}, theme: 'dark', onThemeChange: () => {} })}</div>,
    );
  };

  it('gives Settings / History / Search EXPLICIT accessible names', () => {
    setupGlobals();
    const { container } = nav();
    // Asserted as the attribute, not via getByRole: `title` already satisfies
    // a by-name query as the accessible-name computation's last-resort
    // fallback, which is precisely the fragile source this replaces.
    expect(container.querySelector('.settings-gear-btn').getAttribute('aria-label')).toBe('Settings');
    expect(container.querySelector('[title="History"]').getAttribute('aria-label')).toBe('History');
    expect(container.querySelector('[title="Search"]').getAttribute('aria-label')).toBe('Search');
    // …and the names still resolve, from the label now.
    expect(screen.getByRole('button', { name: 'Settings' }).className).toContain('settings-gear-btn');
    expect(screen.getByRole('button', { name: 'History' }).className).toContain('nav-search-btn');
    expect(screen.getByRole('button', { name: 'Search' }).className).toContain('nav-search-btn');
  });

  it('leaves the title strings byte-identical — CSS selects on them', () => {
    setupGlobals();
    const { container } = nav();
    expect(container.querySelector('[title="Settings"]')).toBeTruthy();
    expect(container.querySelector('.nav-search-btn[title="History"]')).toBeTruthy();
    expect(container.querySelector('.nav-search-btn[title="Search"]')).toBeTruthy();
  });

  it('keeps label and title in agreement on all FOUR cluster icons', () => {
    setupGlobals();
    const { container } = nav();
    const btns = [...container.querySelectorAll('button[title]')];
    expect(btns).toHaveLength(4);   // settings, history, search, theme
    for (const btn of btns) {
      expect(btn.getAttribute('aria-label'), btn.getAttribute('title')).toBe(btn.getAttribute('title'));
    }
  });
});
