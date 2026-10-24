// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* HomeScreen tests — Wave 0 MISC-SCREENS item (5).
   ──────────────────────────────────────
   The Surprise FAB was a bare "breathing dice" glyph: an aria-label for
   screen readers, but nothing on screen telling a sighted user what the
   pulsing icon does. It now carries a visible "Surprise Me" caption that
   matches the accessible name (label-in-name), pinned here.
*/

import 'fake-indexeddb/auto';   // mw18: the rp1 test saves runs in ReadingPlanStore (IDB); a failed save's toast would leak
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { HomeScreen, continueLabel } from './HomeScreen.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { NavButtons } from '../components/NavButtons.jsx';

// The press-drag lifecycle stays real (inert: no gesture is simulated); the reorder test reads the config
// HomeScreen hands it, to drive its drop commit directly.
const pressDrag = vi.hoisted(() => ({ cfg: null }));
vi.mock('../../utils/press-drag.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, createPressDrag: (c) => { pressDrag.cfg = c; return real.createPressDrag(c); } };
});
import { ThemeBtn } from '../components/ThemeBtn.jsx';

// n173: the day's passage, its source stubbed (DailyPassage.test.jsx covers the pick itself).
const daily = vi.hoisted(() => ({ pick: null }));
vi.mock('../components/DailyPassage.jsx', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, useDailyPassage: () => daily.pick };
});

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

  /* rp1: with a reading plan, today's card sits under the title and above Search
     (r2-home-one.png); with none, Home is as it was; a Bible plan never wakes the Volumes. */
  it('(rp1) shows the Today card above Search only while a plan runs', async () => {
    setupGlobals();
    // mw18: plans are runs in ReadingPlanStore; an rp1 settings plan is moved in on the way.
    const { ReadingPlanStore } = await import('../../stores/reading-plan-store.js');
    localStorage.clear();
    ReadingPlanStore._resetForTests({ forceLoaded: true });
    window.ReadingPlanStore = ReadingPlanStore;
    window.__loadVotCorpus = vi.fn(() => Promise.resolve());
    const onPlanRead = vi.fn();
    const today = new Date();
    const start = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const { container } = renderHome({ readingPlans: [{ id: 'bible-year', start }], isRead: () => false, markAsReadEnabled: true, onPlanRead, onPlansMoved: vi.fn() });
    const card = container.querySelector('.today-card');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Genesis 1-3');
    const search = screen.getByRole('button', { name: 'Search library' });
    expect(card.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.home-main-title').compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read Genesis 1-3' }));
    expect(onPlanRead).toHaveBeenCalledWith({ bid: 'genesis', cid: 1 });
    expect(window.__loadVotCorpus).not.toHaveBeenCalled();
    cleanup();
    ReadingPlanStore.replaceAll([]);
    const bare = renderHome({ readingPlans: [], isRead: () => false });
    // mw18 C8: with no plan, Today offers one; Not now hides it on this device, and it stays hidden
    expect(bare.container.querySelector('.today-card').textContent).toContain('Start a reading plan');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(bare.container.querySelector('.today-card')).toBeNull();
    cleanup();
    expect(renderHome({ readingPlans: [], isRead: () => false }).container.querySelector('.today-card')).toBeNull();
    localStorage.removeItem('vot-plans-offer-hidden');
    delete window.ReadingPlanStore;
  });

  it('honors disabled Search and History in quick access', () => {
    setupGlobals();
    renderHome({ searchEnabled: false, historyEnabled: false });
    expect(screen.queryByRole('button', { name: 'Search library' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
    expect(document.querySelector('.home-continue')).toBeNull();
  });

  /* Corbin, 2026-09-11: "add the scripture web button back to the home screen like it was
     before, as seen in the trailer." Before is b3e3625a's parent — the quick-access button in
     the shortcut row that trailer cut 7 (recorded at d49de8c2, 21:22, an hour before the
     removal) shows. It is the control the tour's 'scripture-web' stop rings. The 2026-09-05
     removal ("still under construction, make users drill for it") is reversed for Home only;
     the Library entry keeps its own route. The row's other three are the control, as before:
     a Home with no shortcut row at all satisfies nothing here. */
  it('Home offers the Scripture Web shortcut again, beside the others, and it opens the web', () => {
    setupGlobals();
    const onScriptureWeb = vi.fn();
    renderHome({ onNotes: () => {}, onBookmarks: () => {}, onScriptureWeb });

    const shortcuts = document.querySelector('.home-shortcuts');
    expect(shortcuts).toBeTruthy();
    const labels = [...shortcuts.querySelectorAll('button')].map((x) => x.textContent.trim());
    expect(labels).toEqual(['Search library', 'History', 'Notes', 'Bookmarks', 'Scripture Web']);

    fireEvent.click(screen.getByRole('button', { name: 'Scripture Web' }));
    expect(onScriptureWeb).toHaveBeenCalledTimes(1);
  });

  it('with no onScriptureWeb the row still has no Scripture Web button (a route decides, not Home)', () => {
    setupGlobals();
    renderHome({ onNotes: () => {}, onBookmarks: () => {} });
    expect(screen.queryByRole('button', { name: /Scripture Web/i })).toBeNull();
    expect(document.querySelector('.home-shortcuts')).toBeTruthy();
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

  // Sweep mw12: a drag hands commitDrop indices into the VISIBLE tiles, but it spliced the saved order (which
  // still holds a hidden History) with them, so a different tile moved once History sat above the dragged one.
  it('a drag reorder with History hidden moves the tile that was dragged', () => {
    setupGlobals();
    HomeOrderStore.get = () => ['volumes', 'history', 'scriptures', 'studies', 'listening', 'library', 'settings'];
    HomeOrderStore.set = vi.fn();
    renderHome({ historyEnabled: false });
    // visible: volumes(0) scriptures(1) studies(2) listening(3) library(4) settings(5); drag Studies up to the top
    act(() => { pressDrag.cfg.onCommit({ idx: 2, targetIdx: 0, data: {} }); });
    expect(HomeOrderStore.set).toHaveBeenLastCalledWith(['studies', 'volumes', 'history', 'scriptures', 'listening', 'library', 'settings']);
    // and down: Volumes (now visible 1) to the last visible slot
    act(() => { pressDrag.cfg.onCommit({ idx: 1, targetIdx: 5, data: {} }); });
    expect(HomeOrderStore.set).toHaveBeenLastCalledWith(['studies', 'history', 'scriptures', 'listening', 'library', 'settings', 'volumes']);
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
  it('(W-04) the Songs card says Over 1,000 before the catalog lands, asks for it, then says the real count', async () => {
    vi.useFakeTimers();
    setupGlobals();
    globalThis.HomeOrderStore = { get: () => ['listening', 'songs'], set: () => {} };
    const listeners = new Set();
    const cat = { loaded: false, v: 0, songs: () => Array.from({ length: 1082 }, () => ({ hid: false, sh: 1 })),
      subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getVersion: () => cat.v, load: vi.fn(async () => {}) };
    globalThis.SongCatalog = cat;
    try {
      renderHome({ onOpenSongs: () => {} });
      expect(screen.getByText('Over 1,000 songs from the words of the letters')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(1600); });
      expect(cat.load).toHaveBeenCalledTimes(1);
      act(() => { cat.loaded = true; cat.v++; for (const cb of listeners) cb(); });
      expect(screen.getByText('1,082 songs from the words of the letters')).toBeTruthy();
    } finally { delete globalThis.SongCatalog; vi.useRealTimers(); }
  });

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

describe('the Home reorder hint', () => {
  /* Corbin, 2026-09-05: the hint read "Hold to rearrange · Keyboard: Alt + ↑ / ↓"
     and the keyboard half is going. It is the only line on Home that teaches a
     gesture, and half of it taught a shortcut almost nobody on a phone can press.

     The Alt+Arrow HANDLER stays — it still reorders, it is just no longer
     advertised. That is a discoverability loss for a keyboard-only user, and it
     is deliberate rather than overlooked; see the branch handoff. */

  const hint = () => document.getElementById('home-reorder-hint');

  it('RED: says nothing about a keyboard shortcut', () => {
    setupGlobals();
    renderHome();

    const el = hint();
    // PRESENCE CONTROL, and it is load-bearing: "the text does not mention a
    // keyboard" is satisfied by a hint that was deleted, or never rendered at
    // all. These two say the line is really there to be read, so the absence
    // below is about its CONTENT.
    expect(el).toBeTruthy();
    expect(el.textContent).toMatch(/hold to rearrange/i);

    expect(el.textContent).not.toMatch(/keyboard/i);
    expect(el.textContent).not.toMatch(/alt/i);
    expect(el.textContent).not.toContain('↑');
    expect(el.textContent).not.toContain('↓');
  });

  it('is still what describes every tile, so the gesture reaches assistive tech', () => {
    // The hint is not decoration: each tile carries aria-describedby pointing at
    // it. Shortening the text must not orphan that reference — a describedby to
    // a missing id is silently nothing.
    setupGlobals();
    const { container } = renderHome();

    const tiles = [...container.querySelectorAll('.home-nav-item')];
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) expect(t.getAttribute('aria-describedby')).toBe('home-reorder-hint');
    expect(hint()).toBeTruthy();
  });

  it('CONTROL: Alt+ArrowUp still reorders, so only the ADVERTISEMENT was removed', () => {
    // The behaviour outlives its hint. Without this, deleting the handler along
    // with the text would pass every assertion above.
    setupGlobals();
    const set = vi.fn();
    globalThis.HomeOrderStore = {
      get: () => ['volumes', 'scriptures', 'studies', 'listening', 'library', 'settings', 'history'],
      set,
    };
    const { container } = renderHome();

    const tiles = [...container.querySelectorAll('.home-nav-item')];
    fireEvent.keyDown(tiles[1], { key: 'ArrowUp', altKey: true });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0].slice(0, 2)).toEqual(['scriptures', 'volumes']);
  });
});

/* U08.1: Highlights were four taps from a letter (Library, Personal Study, Highlights); Home's row holds them now. */
describe('Home shortcut to Highlights', () => {
  it('sits after Notes and opens the Highlights list', () => {
    setupGlobals();
    const onHighlights = vi.fn();
    renderHome({ onNotes: () => {}, onHighlights, onBookmarks: () => {} });
    const buttons = [...document.querySelectorAll('.home-shortcuts button')];
    expect(buttons.map((x) => x.textContent.trim())).toEqual(['Search library', 'History', 'Notes', 'Highlights', 'Bookmarks']);
    buttons[3].click();
    expect(onHighlights).toHaveBeenCalledTimes(1);
  });
});

/* n131/n352 (A07.2, L1.1, U02.1): "Recent reading" opened a History list. The newest place is one tap now
   (Continue: title, place), and before any reading the row says where to start. */
describe('HomeScreen — the Continue row', () => {
  const LETTER = { type: 'letter', letterId: 'chosen-by-god', letterTitle: 'Chosen by God', letterNum: 1, volumeScreen: 'vot-one-index', ts: 2 };
  afterEach(() => { delete globalThis.COL_BY_INDEX_SC; });

  it('continues the newest place in one tap, named by its title and place', () => {
    setupGlobals();
    globalThis.COL_BY_INDEX_SC = new Map([['vot-one-index', { label: 'Volume One' }]]);
    const onContinue = vi.fn();
    renderHome({ history: [LETTER, { ...LETTER, letterTitle: 'Older', ts: 1 }], onContinue, onStartHere: vi.fn() });
    const row = screen.getByRole('button', { name: 'Continue: Chosen by God, Volume One, Letter 1' });
    expect(row.textContent).toBe('ContinueChosen by God · Volume One, Letter 1›');
    fireEvent.click(row);
    expect(onContinue).toHaveBeenCalledWith(LETTER);
    expect(screen.queryByRole('button', { name: /^Start here/ })).toBeNull();
  });

  it('before any reading it offers Start here, which opens the first letter', () => {
    setupGlobals();
    const onStartHere = vi.fn();
    renderHome({ history: [], onContinue: vi.fn(), onStartHere });
    fireEvent.click(screen.getByRole('button', { name: 'Start here: Volume One, Letter 1, Chosen by God' }));
    expect(onStartHere).toHaveBeenCalledTimes(1);
  });

  it('a Bible chapter continues as book and chapter', () => {
    expect(continueLabel({ type: 'bible', bookId: 'john', bookTitle: 'John', chapterNum: 3 })).toEqual({ title: 'John 3', place: '' });
    expect(continueLabel(null)).toBeNull();
  });

  it('with History switched off there is no row', () => {
    setupGlobals();
    renderHome({ historyEnabled: false, history: [LETTER], onContinue: vi.fn(), onStartHere: vi.fn() });
    expect(document.querySelector('.home-continue')).toBeNull();
  });
});

/* n173: the passage for the day sits under the title, above Today, and opens where it sits. A corpus that
   lands while Home is open never inserts it (the cards would jump under the reader's finger). */
describe('HomeScreen — the passage for the day', () => {
  const PICK = { id: 'the-coming-of-the-lord', anchor: 'Behold, the judgments', quote: ['Behold, the judgments of God'], title: 'God Eternal', collection: 'Volume 1' };
  afterEach(() => { daily.pick = null; });

  it('shows above Today once the source is on the page, and opens the passage', () => {
    setupGlobals();
    daily.pick = PICK;
    const onOpenAnswer = vi.fn();
    const { container } = renderHome({ onOpenAnswer });
    const btn = screen.getByRole('button', { name: /^Answer of the day/ });
    expect(btn.textContent).toBe('Answer of the day: Behold, the judgments of GodFrom “God Eternal” · Volume One ›');
    const search = screen.getByRole('button', { name: 'Search library' });
    expect(btn.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.home-main-title').compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(btn);
    expect(onOpenAnswer).toHaveBeenCalledWith(PICK.id, PICK.anchor);
  });

  it('stays out of a Home that opened without it', () => {
    setupGlobals();
    const view = renderHome({ onOpenAnswer: vi.fn() });
    daily.pick = PICK;
    view.rerender(
      <HomeScreen onSelect={() => {}} onSurprise={() => {}} showSurprise={true} onSettings={() => {}} onSearch={() => {}}
        onHistory={() => {}} historyEnabled={true} onAbout={() => {}} history={[]} theme="dark" onThemeChange={() => {}}
        translation="nkjv" onOpenAnswer={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /^Answer of the day/ })).toBeNull();
  });
});
