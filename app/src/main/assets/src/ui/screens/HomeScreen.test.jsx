// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* HomeScreen — the READ tab's root (the layout pass, 2026-11-10, mock read.png): the root top bar, a search
   field, the up-next card (plans and Continue), "Read" with four tiles, "Explore" with Scripture Web and
   Surprise me. Listening, Songs, the Library, Settings and History tiles, the title block and (i) are gone. */

import 'fake-indexeddb/auto';   // mw18: the rp1 test saves runs in ReadingPlanStore (IDB); a failed save's toast would leak
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { HomeScreen, continueLabel, readTileOrder, READ_TILES } from './HomeScreen.jsx';
import { NavButtons } from '../components/NavButtons.jsx';
import { ThemeBtn } from '../components/ThemeBtn.jsx';

const GLOBALS = ['ScreenLayout', 'ThemeBtn', 'HomeOrderStore', 'translationLabel', 'NavButtons'];

function setupGlobals() {
  // The stub draws what a root's ScreenLayout draws: the bar's start, then navEnd (the gear), then the page.
  globalThis.ScreenLayout = ({ children, navChildren, navEnd, root }) => (
    <div data-testid="screen-layout" data-root={root ? '1' : '0'}><nav>{navChildren}{navEnd}</nav>{children}</div>
  );
  globalThis.ThemeBtn = () => null;
  globalThis.NavButtons = NavButtons;
  globalThis.HomeOrderStore = {
    get: () => ['volumes', 'scriptures', 'studies', 'listening', 'library', 'settings', 'history'],
    set: () => {},
  };
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
    onScriptureWeb={() => {}}
    historyEnabled={true}
    history={[]}
    translation="nkjv"
    {...props}
  />
);

const tileTitles = () => [...document.querySelectorAll('.home-tile .root-tile-title')].map((t) => t.textContent);

describe('HomeScreen — the Read root', () => {
  it('is a root: its bar names VOTReader and has the gear, and no Search icon (the field is under it), About or Back', () => {
    setupGlobals();
    const onSettings = vi.fn();
    renderHome({ onSettings });
    expect(screen.getByTestId('screen-layout').getAttribute('data-root')).toBe('1');
    expect(screen.getByRole('heading', { level: 1, name: 'VOTReader' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /About/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Back/ })).toBeNull();
  });

  it('has the search field, then four READ tiles, then Explore; the old tiles and the title block are gone', () => {
    setupGlobals();
    const onSearch = vi.fn();
    const { container } = renderHome({ onSearch });
    fireEvent.click(screen.getByRole('button', { name: 'Search the letters and the Bible' }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(tileTitles()).toEqual(['The Volumes of Truth', 'The Scriptures of Truth', 'Studies', 'Answers Only God Can Give']);
    expect([...container.querySelectorAll('.root-section')].map((h) => h.textContent)).toEqual(['Read', 'Explore']);
    for (const gone of ['Listening Library', 'Songs of the Letters', 'Library', 'Settings', 'History']) {
      expect(container.querySelector('.home-tile[data-tile="' + gone.toLowerCase() + '"]')).toBeNull();
      expect(tileTitles()).not.toContain(gone);
    }
    expect(container.querySelector('.home-main-title, .home-main-amp, .home-ornament, .home-nav-item, .home-shortcuts')).toBeNull();
  });

  it('a tile opens its place; Answers opens a fresh landing', () => {
    setupGlobals();
    const onSelect = vi.fn();
    renderHome({ onSelect });
    fireEvent.click(screen.getByRole('button', { name: /The Volumes of Truth/ }));
    fireEvent.click(screen.getByRole('button', { name: /Answers Only God Can Give/ }));
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(['volumes', 'answers']);
  });

  it('keeps the four in the saved order, ignores the ids that left Home, and adds any it lacks', () => {
    expect(readTileOrder(['history', 'studies', 'library', 'volumes'])).toEqual(['studies', 'volumes', 'scriptures', 'answers']);
    expect(readTileOrder(null)).toEqual([...READ_TILES]);
  });

  it('Alt+arrow moves a tile, stores it and says so', () => {
    setupGlobals();
    HomeOrderStore.set = vi.fn();
    renderHome();
    const tiles = [...document.querySelectorAll('.home-tile')];
    fireEvent.keyDown(tiles[1], { key: 'ArrowUp', altKey: true });
    expect(HomeOrderStore.set).toHaveBeenCalledTimes(1);
    expect(readTileOrder(HomeOrderStore.set.mock.calls[0][0]).slice(0, 2)).toEqual(['scriptures', 'volumes']);
    expect(screen.getByRole('status').textContent).toBe('The Scriptures of Truth moved earlier.');
  });

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

  it('Explore holds Scripture Web (its one way in) and Surprise me', () => {
    setupGlobals();
    const onScriptureWeb = vi.fn();
    renderHome({ onScriptureWeb });
    const buttons = [...document.querySelectorAll('.root-explore-btn')].map((b) => b.textContent);
    expect(buttons).toEqual(['Scripture Web', 'Surprise me']);
    fireEvent.click(screen.getByRole('button', { name: 'Scripture Web' }));
    expect(onScriptureWeb).toHaveBeenCalledTimes(1);
  });

  it('Search switched off takes the field and the bar icon with it', () => {
    setupGlobals();
    renderHome({ searchEnabled: false });
    expect(screen.queryByRole('button', { name: /Search/ })).toBeNull();
  });

  /* rp1, slimmed 2026-11-10: with a reading plan, the up-next card's plan row sits under the search field;
     with none it offers one until Not now; a Bible plan never wakes the Volumes. */
  it('(rp1) shows the plan row in the up-next card under the search field only while a plan runs', async () => {
    setupGlobals();
    const { ReadingPlanStore } = await import('../../stores/reading-plan-store.js');
    localStorage.clear();
    ReadingPlanStore._resetForTests({ forceLoaded: true });
    window.ReadingPlanStore = ReadingPlanStore;
    window.__loadVotCorpus = vi.fn(() => Promise.resolve());
    const onPlanRead = vi.fn();
    const today = new Date();
    const start = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const { container } = renderHome({ readingPlans: [{ id: 'bible-year', start }], isRead: () => false, markAsReadEnabled: true, onPlanRead, onPlansMoved: vi.fn() });
    const card = container.querySelector('.upnext');
    expect(card.querySelectorAll('[data-plan]')).toHaveLength(1);
    expect(card.textContent).toContain('Genesis 1-3');
    const search = container.querySelector('.root-search');
    expect(search.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read Genesis 1-3' }));
    expect(onPlanRead).toHaveBeenCalledWith({ bid: 'genesis', cid: 1 });
    expect(window.__loadVotCorpus).not.toHaveBeenCalled();
    cleanup();
    ReadingPlanStore.replaceAll([]);
    const bare = renderHome({ readingPlans: [], isRead: () => false });
    expect(bare.container.querySelector('.upnext').textContent).toContain('Start a reading plan');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(bare.container.querySelector('.upnext')).toBeNull();   // nothing else to show: no empty card
    cleanup();
    expect(renderHome({ readingPlans: [], isRead: () => false }).container.querySelector('.upnext')).toBeNull();
    localStorage.removeItem('vot-plans-offer-hidden');
    delete window.ReadingPlanStore;
  });
});

describe('HomeScreen — Surprise me', () => {
  const NAME = 'Surprise me — open a random chapter or letter';

  it('says what it does: the name opens with the visible caption (label-in-name), and the tooltip is the same string', () => {
    setupGlobals();
    renderHome();
    const btn = screen.getByRole('button', { name: NAME });
    expect(btn.getAttribute('title')).toBe(NAME);
    expect(btn.textContent).toBe('Surprise me');
    expect(NAME.startsWith(btn.textContent)).toBe(true);
  });

  it('is not there when the setting is off', () => {
    setupGlobals();
    renderHome({ showSurprise: false });
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
    expect(screen.getByRole('button', { name: 'Scripture Web' })).toBeTruthy();
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
    const button = screen.getByRole('button', { name: NAME });
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
    const button = screen.getByRole('button', { name: NAME });
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole('status').textContent).toContain('try Surprise me again');
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
    fireEvent.click(screen.getByRole('button', { name: NAME }));
    view.unmount();
    await act(async () => { finish(); });
    expect(onSurprise).not.toHaveBeenCalled();
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
    expect(document.querySelector('.upnext-continue')).toBeNull();
  });
});

