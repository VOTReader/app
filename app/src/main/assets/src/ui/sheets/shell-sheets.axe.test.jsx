// @ts-nocheck
/* axe-core over the app shell's sheets, dialogs, menus and toasts (a11y pass, 2026-11-01).
   ─────────────────────────────────────────────────────────────────────
   Every sheet AppShellSheets / AppShellOverlays mounts over a live screen,
   rendered in a populated state (and an empty one where it has one), plus
   the shell's nav cluster, banner, pill and toasts: no SERIOUS or CRITICAL
   axe finding (ui/a11y/axe-run.js). The More menu and the Tabs overview's
   landmarks are pinned in ui/components/a11y-axe.test.jsx, not here.

   Besides axe, each dialog is checked for the parts axe cannot see in jsdom:
   role=dialog, aria-modal, an accessible name and focus inside on open
   (useFocusTrap). Free globals are stubbed the way each sheet's own tests do. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { seriousViolations } from '../a11y/axe-run.js';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { NoteSheet } from './NoteSheet.jsx';
import { BookmarkCreateSheet } from './BookmarkCreateSheet.jsx';
import { BookmarkPopover } from './BookmarkPopover.jsx';
import { CopyFallbackSheet } from './CopyFallbackSheet.jsx';
import { LinkPicker } from './LinkPicker.jsx';
import { LinkSidebar } from './LinkSidebar.jsx';
import { MultiNotePopover } from './MultiNotePopover.jsx';
import { AnnotationActionChip } from './AnnotationActionChip.jsx';
import { SelectionToolbar } from './SelectionToolbar.jsx';
import { TabActionSheet } from './TabActionSheet.jsx';
import { TabsOverview } from './TabsOverview.jsx';
import { VersePickerScreen } from './VersePickerScreen.jsx';
import { LetterExcerptPickerScreen } from './LetterExcerptPickerScreen.jsx';
import { AppShellOverlays } from '../components/AppShellOverlays.jsx';
import { TabsNavBtn } from '../components/TabsNavBtn.jsx';
import { NavButtons } from '../components/NavButtons.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { HomeBtn } from '../components/HomeBtn.jsx';
import { BackHintPill } from '../components/BackHintPill.jsx';
import { StorageHealthBanner } from '../components/StorageHealthBanner.jsx';
import { TourOverlay } from '../components/TourOverlay.jsx';
import { createPressDrag } from '../../utils/press-drag.js';
import { StorageHealth } from '../../utils/storage-health.js';
import { formatBytes } from '../../utils/format-bytes.js';
import { TourController } from '../../utils/tour-controller.js';
import { TourDoneFlagStore } from '../../stores/app-flag-stores.js';
import { showToast, showUndoToast, _resetToasts } from '../../utils/toast.js';
import * as RootExit from '../../utils/root-exit-toast.js';

const g = globalThis;
const noop = () => {};
/** Names of the globals a test set, deleted again in afterEach. */
let set = [];
function stub(obj) { for (const k of Object.keys(obj)) { g[k] = obj[k]; set.push(k); } }

/** The parts of a modal dialog axe in jsdom cannot judge. */
function expectModal(name) {
  const dlg = screen.getByRole('dialog', { name });
  expect(dlg.getAttribute('aria-modal')).toBe('true');
  expect(dlg.contains(document.activeElement)).toBe(true);
  return dlg;
}

beforeEach(() => {
  g.ReactDOM = ReactDOM;
  g.ConfirmStrip = ConfirmStrip;
  document.documentElement.lang = 'en';
  document.title = 'VOTReader';
  modalRegistry._reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const k of set) delete g[k];
  set = [];
  modalRegistry._reset();
  _resetToasts();
  RootExit._reset();
  document.body.innerHTML = '';
});

/* ── Notes ─────────────────────────────────────────────────────────────── */

function noteStores(body) {
  stub({
    HL_COLORS: ['yellow', 'green', 'blue'],
    NoteStore: {
      subscribe: () => noop, getVersion: () => 1, update: vi.fn(), remove: vi.fn(),
      get: (gid) => ({ groupId: gid, color: 'yellow', body: body + ' ' + gid, fullText: 'In the beginning', keys: ['k'], notebookIds: ['nb1'], created: 1, updated: 2 }),
    },
    AnnotationStore: {
      subscribe: () => noop, getVersion: () => 1, removeGroup: vi.fn(), recolorGroup: vi.fn(), convertGroup: vi.fn(),
      getByGroup: () => [{ key: 'bible:genesis:1:1', ann: { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'In the beginning' } }],
      get: () => [{ id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'In the beginning' }],
    },
    NotebookStore: { get: (id) => ({ id, name: 'Psalms' }) },
    NoteDefaultStore: { set: vi.fn(), get: () => ({ style: 'highlight', color: 'yellow' }) },
  });
}

describe('axe — NoteSheet', () => {
  it('read mode, with the options menu open', async () => {
    noteStores('A thought');
    render(<NoteSheet groupId="g1" startInEditMode={false} onClose={noop} />);
    expectModal('Note');
    const opts = screen.getByRole('button', { name: 'Options' });
    expect(opts.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(opts);
    expect(opts.getAttribute('aria-expanded')).toBe('true');
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('edit mode (style + colour rows, a named textarea)', async () => {
    noteStores('');
    render(<NoteSheet groupId="g1" startInEditMode onClose={noop} onOpenNotebookPicker={noop} />);
    expect(screen.getByRole('textbox', { name: 'Note text' })).toBeTruthy();
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('the colour panel', async () => {
    noteStores('A thought');
    render(<NoteSheet groupId="g1" startInEditMode={false} onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change note color' }));
    expect(await seriousViolations(document)).toEqual([]);
  });
});

describe('axe — MultiNotePopover', () => {
  it('three notes on one place', async () => {
    noteStores('Reflection');
    render(<MultiNotePopover payload={{ groupIds: ['g1', 'g2', 'g3'], x: 180, y: 300 }} onClose={noop} onPick={noop} />);
    expectModal('3 notes here');
    expect(await seriousViolations(document)).toEqual([]);
  });
});

describe('axe — AnnotationActionChip', () => {
  const chip = { x: 100, y: 100, hlKey: 'bible:genesis:1:1', groupId: 'g1' };
  it('main row, then the colour and style panels', async () => {
    noteStores('');
    g.NoteStore.get = () => null;
    render(<AnnotationActionChip chip={chip} onClose={noop} onNoteRequest={noop} />);
    expectModal('highlight actions');
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.click(screen.getByText('Color'));
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByText('Style'));
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('the remove confirm', async () => {
    noteStores('');
    g.NoteStore.get = () => null;
    render(<AnnotationActionChip chip={chip} onClose={noop} onNoteRequest={noop} />);
    fireEvent.click(screen.getByText('Remove'));
    expect(await seriousViolations(document)).toEqual([]);
  });
});

/* ── Bookmarks ─────────────────────────────────────────────────────────── */

describe('axe — BookmarkCreateSheet', () => {
  it('create mode: a labelled field', async () => {
    render(<BookmarkCreateSheet pending={{ hlKey: 'bible:john:3:16', defaultLabel: 'John 3:16', sourceLabel: 'John 3', excerpt: 'For God so loved the world' }}
      onConfirm={noop} onCancel={noop} />);
    expectModal('New Bookmark');
    expect(screen.getByRole('textbox', { name: 'Label' })).toBeTruthy();
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('edit mode, with the delete confirm', async () => {
    render(<BookmarkCreateSheet pending={{ hlKey: 'bible:john:3:16', editId: 'b1', currentLabel: 'Love' }}
      onConfirm={noop} onCancel={noop} onDelete={noop} onOpen={noop} />);
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.click(screen.getByText('Delete'));
    expect(await seriousViolations(document)).toEqual([]);
  });
});

describe('axe — BookmarkPopover', () => {
  it('two bookmarks on one place, then a delete confirm', async () => {
    stub({ BookmarkStore: { get: (id) => ({ id, label: id === 'b1' ? 'Genesis 1:1' : 'Creation', created: Date.now() - 86400000, thought: id === 'b2' ? 'An old thought' : '' }), remove: vi.fn() } });
    render(<BookmarkPopover bkmIds={['b1', 'b2']} x={100} y={120} onClose={noop} onNavigate={noop} />);
    expectModal('Bookmark actions');
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(await seriousViolations(document)).toEqual([]);
  });
});

/* ── Copy fallback ─────────────────────────────────────────────────────── */

describe('axe — CopyFallbackSheet', () => {
  it('the passage a refused clipboard keeps on screen', async () => {
    render(<CopyFallbackSheet text={'“For God so loved the world” — John 3:16 (NKJV)'} verb="copy" onClose={noop} onCopied={noop} />);
    expectModal('Couldn’t copy');
    expect(await seriousViolations(document)).toEqual([]);
  });
});

/* ── Links ─────────────────────────────────────────────────────────────── */

function linkPickerGlobals({ recent = [], links = [] } = {}) {
  stub({
    RecentNavStore: { list: () => recent, add: vi.fn() },
    searchNavIndex: () => [{ item: { kind: 'bible-chapter', category: 'New Testament', label: 'John 3' } }],
    navItemToEndpoint: (item) => ({ type: 'bible', key: 'k', label: item.label, verse: 1 }),
    LinkStore: { remove: vi.fn(), all: () => links },
    buildSourceEndpoint: () => ({ key: 's', label: 'src' }),
    persistLink: vi.fn(() => ({ id: 'lnk1', target: { label: 'Genesis 1:1' } })),
    COL_NAV_ICON: new Map([['Volume Two', 'V2']]),
    buildNavTree: () => ({
      bibleBooks: [{ bookId: 'genesis', title: 'Genesis', category: 'Old Testament', chapters: [{ chapter: 1 }, { chapter: 2 }] }],
      matthewChapters: [{ chapter: 1 }],
      collections: [{ label: 'Volumes', entries: [{ kind: 'letter', collection: 'Volume Two', label: 'The Wide Path', category: 'Volume Two' }] }],
      studies: [],
    }),
    contentDocToNavItem: () => null,
  });
}
const linkProps = {
  sourceKey: 'bible:john:3:16', sourceLabel: 'John 3:16', sourceText: 'For God so loved the world',
  onClose: noop, onRequestRefine: noop, lastCreatedLink: null, onLinkCreated: noop, mode: null, onPickTarget: null,
};

describe('axe — LinkPicker', () => {
  it('search view: empty, with recent picks, then with results', async () => {
    linkPickerGlobals({ recent: [{ kind: 'bible-chapter', category: 'Old Testament', label: 'Genesis 1' }] });
    render(<LinkPicker {...linkProps} />);
    expectModal('Create a Link');
    expect(screen.getByRole('textbox', { name: 'Search titles and references' })).toBeTruthy();
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'John' } });
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('a link just made (the success strip), and the Full text scope', async () => {
    linkPickerGlobals();
    render(<LinkPicker {...linkProps} lastCreatedLink={{ id: 'lnk1', target: { label: 'Genesis 1:1' } }} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Full text' }));
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('browse view: the top level, then a book’s chapter grid', async () => {
    linkPickerGlobals();
    render(<LinkPicker {...linkProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Browse' }));
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.click(screen.getByText('The Holy Bible'));
    fireEvent.click(screen.getByText('Genesis'));
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('recent view: empty, then two links', async () => {
    linkPickerGlobals();
    const r = render(<LinkPicker {...linkProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Recent' }));
    expect(await seriousViolations(document)).toEqual([]);
    r.unmount();
    set.forEach((k) => delete g[k]); set = [];
    linkPickerGlobals({ links: [
      { id: 'l1', created: 2, source: { key: 'a', label: 'John 3:16' }, target: { key: 'b', label: 'Genesis 1:1' } },
      { id: 'l2', created: 1, source: { key: 'c', label: 'The Wide Path' }, target: { key: 'd', label: 'Psalm 23' } },
    ] });
    render(<LinkPicker {...linkProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Recent' }));
    expect(await seriousViolations(document)).toEqual([]);
  });
});

describe('axe — LinkSidebar', () => {
  const store = (links) => ({ subscribe: () => noop, getVersion: () => 1, getForKeyPrefix: () => links, getTouching: () => links });
  it('no links yet', async () => {
    stub({ LinkStore: store([]) });
    render(<LinkSidebar hlKey="bible:john:3:16" onClose={noop} onNavigate={noop} />);
    expectModal('Links');
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('two links (LinkCard stubbed: it is its own screen group’s component)', async () => {
    stub({
      LinkStore: store([{ id: 'l1' }, { id: 'l2' }]),
      LinkCard: ({ lnk }) => <button type="button">{'Open ' + lnk.id}</button>,
    });
    render(<LinkSidebar hlKey="bible:john:3:16" onClose={noop} onNavigate={noop} />);
    expect(await seriousViolations(document)).toEqual([]);
  });
});

/* ── Refine screens ────────────────────────────────────────────────────── */

const pickerProps = { sourceKey: 'bible:john:3:16', sourceLabel: 'John 3:16', sourceText: '', onClose: noop, returnTargetInsteadOfLink: false };

describe('axe — VersePickerScreen', () => {
  const req = { target: { type: 'bible', bookId: 'genesis', chapter: 1, label: 'Genesis 1', key: 'bible:genesis:1' }, item: { title: 'Genesis' } };
  const globals = (chapters) => stub({
    _allBooks: () => ({ genesis: { chapters } }),
    _matthew: () => null,
    snapRangeToWords: (t, s, e) => ({ start: s, end: e }),
    bibleHlKey: (b, c, v) => 'bible:' + b + ':' + c + ':' + v,
    buildSourceEndpoint: () => ({ key: 's', label: 'src' }),
    persistLink: vi.fn(() => ({ id: 'lnk1' })),
  });

  it('a chapter of verses, then filtered (the count is live)', async () => {
    globals([{ num: 1, verses: [{ n: 1, text: 'In the beginning God created the heavens and the earth.' }, { n: 2, text: 'And the earth was without form.' }] }]);
    render(<VersePickerScreen refineRequest={req} {...pickerProps} />);
    expectModal('Select scripture text');
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter verses by text' }), { target: { value: 'earth' } });
    expect(document.querySelector('.picker-find-count').getAttribute('role')).toBe('status');
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('a chapter that is not there is still a named, focused dialog', async () => {
    globals([]);
    render(<VersePickerScreen refineRequest={req} {...pickerProps} />);
    expectModal('Select Verse');
    expect(await seriousViolations(document)).toEqual([]);
  });
});

describe('axe — LetterExcerptPickerScreen', () => {
  const req = { target: { type: 'letter', letterId: 'the-wide-path', key: 'letter:the-wide-path', collection: 'Volume Two' }, item: { label: 'The Wide Path', collection: 'Volume Two' } };
  const globals = (entry) => stub({
    findEntryContext: () => (entry ? { entry } : null),
    snapSelectionRange: (_c, _t, s, e) => ({ start: s, end: e }),
    buildSourceEndpoint: () => ({ key: 's', label: 'src' }),
    persistLink: vi.fn(() => ({ id: 'lnk1' })),
  });

  it('a letter of two paragraphs, then a find', async () => {
    globals({ title: 'The Wide Path', blocks: [
      { type: 'para', segments: [{ t: 'text', v: 'Peoples of the earth, hear the word of the Lord.' }] },
      { type: 'para', segments: [{ t: 'text', v: 'The path is wide that leads to destruction.' }] },
    ] });
    render(<LetterExcerptPickerScreen refineRequest={req} {...pickerProps} />);
    expectModal('Select letter text');
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'path' } });
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('a letter that is not there is still a named, focused dialog', async () => {
    globals(null);
    render(<LetterExcerptPickerScreen refineRequest={req} {...pickerProps} />);
    expectModal('Select Text to Link');
    expect(await seriousViolations(document)).toEqual([]);
  });
});

/* ── Selection toolbar ─────────────────────────────────────────────────── */

describe('axe — SelectionToolbar', () => {
  it('raised over a selected phrase', async () => {
    vi.useFakeTimers();
    stub({
      HL_COLORS: ['yellow', 'green', 'blue'],
      HighlightStore: { get: () => [] },
      AnnotationStore: { get: () => [], getByGroup: () => [], add: vi.fn(), removeGroup: vi.fn(), convertGroup: vi.fn() },
      NoteStore: { get: () => null, set: vi.fn(), remove: vi.fn() },
      BookmarkStore: { add: vi.fn() },
      snapRangeToWords: (_t, s, e) => ({ start: s, end: e }),
      snapSelectionRange: (_c, _t, s, e) => ({ start: s, end: e }),
      hlId: () => 'hl_test',
    });
    const main = document.createElement('main');
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'bible:test:1:1');
    p.textContent = 'The Revelation of Jesus Christ';
    main.appendChild(p);
    document.body.appendChild(main);
    const orig = window.getSelection;
    const range = document.createRange();
    range.setStart(p.firstChild, 0); range.setEnd(p.firstChild, 14);
    range.getBoundingClientRect = () => ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
    window.getSelection = () => ({
      isCollapsed: false, rangeCount: 1, getRangeAt: () => range, removeAllRanges: noop,
      toString: () => range.toString(), focusNode: range.endContainer, focusOffset: range.endOffset,
    });
    try {
      render(<SelectionToolbar onLinkRequest={noop} onNoteRequest={noop} onBookmarkRequest={noop} />);
      act(() => { p.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })); });
      await act(async () => {
        p.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 80, clientY: 5 }));
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(screen.getByRole('toolbar', { name: 'Text selection actions' })).toBeTruthy();
      vi.useRealTimers();   // axe schedules its own timers
      expect(await seriousViolations(document)).toEqual([]);
    } finally {
      window.getSelection = orig;
    }
  });
});

/* ── Tabs ──────────────────────────────────────────────────────────────── */

function tabGlobals() {
  stub({
    createPressDrag,
    describeTab: (t) => ({ title: t.title, subtitle: 'Volume Two', resolved: true }),
    tabContentKey: (t) => 'k' + t.title,
    tabHasProgressBar: () => true,
    scrollKeyForTab: () => 'k',
  });
}
const TABS = [
  { screen: 'letter', title: 'The Wide Path', scrollPositions: { k: { pct: 0.4 } }, pinned: true },
  { screen: 'bible', title: 'Genesis 1', scrollPositions: {} },
  { screen: 'home', title: 'Home', scrollPositions: {} },
];

describe('axe — TabsOverview + TabActionSheet', () => {
  it('three tabs in the overview dialog; each card’s buttons name their tab', async () => {
    tabGlobals();
    render(
      <div role="dialog" aria-modal="true" aria-labelledby="tabs-overview-title">
        <TabsOverview tabs={TABS} activeTabIdx={1} onSelect={noop} onClose={noop} onNewTab={noop} onMenu={noop}
          onReorder={noop} onClearAll={noop} onDedupe={noop} MAX_TABS={9} thumbnails={null} />
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Close tab: Genesis 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tab actions: Home' }).getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.getByRole('img', { name: 'Pinned' })).toBeTruthy();
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.click(screen.getByText('Clear All'));
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('the tab action sheet, then renaming (a named field)', async () => {
    render(<TabActionSheet idx={1} total={3} tabs={TABS} tab={TABS[1]} onCloseOthers={noop} onCloseToRight={noop}
      onRename={noop} onTogglePin={noop} onMove={noop} onDismiss={noop} />);
    expectModal('Tab actions');
    expect(await seriousViolations(document)).toEqual([]);
    fireEvent.click(screen.getByText('Rename tab…'));
    expect(screen.getByRole('textbox', { name: 'Tab name' })).toBeTruthy();
    expect(await seriousViolations(document)).toEqual([]);
  });
});

/* ── AppShellOverlays: the disable-tabs prompt and the Garden warning ──── */

function overlayGlobals() {
  stub({
    ErrorBoundary: ({ children }) => children,
    StorageHealthBanner: () => null,
    Safari7DayModal: () => null,
    IosPwaWelcomeCard: () => null,
    TourOverlay: () => null,
  });
}
const overlayProps = {
  settings: { tabsEnabled: true, gardenTier: 'standard' }, updateSetting: noop, screen: 'home',
  tabsOverviewOpen: false, setTabsOverviewOpen: noop,
  tabs: [], activeTabIdx: 0, tabThumbnails: {}, MAX_TABS: 9,
  switchToTab: noop, closeTab: noop, openNewTab: noop, closeOtherTabs: noop, closeTabsToTheRight: noop,
  closeAllTabs: noop, deduplicateTabs: noop, reorderTabs: noop, renameTab: noop, togglePinTab: noop,
  tabActionIdx: null, setTabActionIdx: noop, lastTabCloseStrikesRef: { current: 0 },
  disableTabsPromptOpen: false, setDisableTabsPromptOpen: noop,
  gardenWarningOpen: false, setGardenWarningOpen: noop, setScreen: noop,
};

describe('axe — AppShellOverlays', () => {
  it('the disable-tabs prompt', async () => {
    overlayGlobals();
    render(<AppShellOverlays {...overlayProps} disableTabsPromptOpen />);
    expectModal('Disable tabs?');
    expect(await seriousViolations(document)).toEqual([]);
  });

  it('the Garden warning, its quality options a named group', async () => {
    overlayGlobals();
    render(<AppShellOverlays {...overlayProps} gardenWarningOpen />);
    expectModal(/Before You Begin|No connection/);
    expect(screen.getByRole('group', { name: 'Image Quality' })).toBeTruthy();
    expect(await seriousViolations(document)).toEqual([]);
  });
});

/* ── The top-bar cluster, the back pill, the storage banner ────────────── */

describe('axe — the shell’s nav cluster', () => {
  it('LibraryNav (back, Home, reading arrows, NavButtons) and the tabs button with its hint', async () => {
    const TabsContext = React.createContext(null);
    stub({ TabsContext, HomeBtn, NavButtons, ThemeBtn: () => <button type="button" aria-label="Light theme">☀</button>, ChapterBookmarkBtn: () => null });
    localStorage.removeItem('vot-tabs-hint-seen');
    render(
      <TabsContext.Provider value={{ enabled: true, count: 3, onOpen: noop, isOnTabsScreen: false }}>
        <nav className="top-nav" aria-label="Page">
          {LibraryNav({ onBack: noop, backLabel: 'Volumes', arrows: { onPrev: noop, onNext: noop, prevLabel: 'Previous letter', nextLabel: 'Next letter' } })}
          <TabsNavBtn />
        </nav>
        <main><h1>A letter</h1><BackHintPill backHint={{ title: 'The Wide Path', volumeLabel: 'Volume Two' }} onClick={noop} /></main>
      </TabsContext.Provider>,
    );
    expect(screen.getByRole('button', { name: 'Open tabs (3 open)' }).getAttribute('aria-haspopup')).toBe('dialog');
    expect(await seriousViolations(document)).toEqual([]);
    localStorage.removeItem('vot-tabs-hint-seen');
  });

  it('the storage banner (an alert with its actions)', async () => {
    stub({ StorageHealth, formatBytes, OfflineLibraryBanner: () => null });
    StorageHealth._resetForTests({ platform: 'chrome', storageApi: { estimate: () => Promise.resolve({ quota: 1e9, usage: 1e8 }), persisted: () => Promise.resolve(true) } });
    const orig = StorageHealth.getReport;
    StorageHealth.getReport = () => ({
      tier: StorageHealth.TIER.HEALTHY, platform: 'chrome', quota: 1e9, usage: 1e8, persisted: true, percentUsed: 0.1,
      remaining: 9e8, risks: [], privateModeLikely: false, lastAssessedAt: Date.now(), writeFailedThisSession: false, storesDegraded: true,
    });
    try {
      render(<StorageHealthBanner onNavigateSettings={noop} />);
    } finally { StorageHealth.getReport = orig; }
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(await seriousViolations(document)).toEqual([]);
  });
});

/* ── The tour ──────────────────────────────────────────────────────────── */

describe('axe — TourOverlay', () => {
  it('the welcome card', async () => {
    localStorage.clear();
    TourDoneFlagStore._resetForTests({ forceLoaded: true });
    TourController._resetForTests();
    stub({ TourController });
    TourController.attachNav({ goHome: vi.fn(), openLetter: vi.fn(), openBible: vi.fn(), goJournalHub: vi.fn(), openSettingsData: vi.fn() });
    TourController.start('prompt');
    render(<TourOverlay />);
    const dlg = screen.getByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.contains(document.activeElement)).toBe(true);
    expect(await seriousViolations(document)).toEqual([]);
    TourController._resetForTests();
  });
});

/* ── Toasts: every path is a polite (or assertive) status ──────────────── */

describe('axe — toasts', () => {
  it('showToast, an assertive showToast, an undo toast and the root-exit toast are all live status regions', async () => {
    document.body.appendChild(Object.assign(document.createElement('main'), { innerHTML: '<h1>Home</h1>' }));
    showToast({ id: 'vot-toast-copy', className: 'vot-toast', text: 'Link copied' });
    showToast({ id: 'vot-toast-sheet-crash', className: 'vot-toast', text: 'That panel hit a problem and closed.', ariaLive: 'assertive' });
    showUndoToast('vot-toast-undo-test', 'Highlight removed', noop);
    RootExit.arm(2000);
    const ids = ['vot-toast-copy', 'vot-toast-sheet-crash', 'vot-toast-undo-test', 'vot-root-exit-toast'];
    for (const id of ids) {
      const el = document.getElementById(id);
      expect(el, id).not.toBeNull();
      expect(el.getAttribute('role'), id).toBe('status');
      expect(['polite', 'assertive']).toContain(el.getAttribute('aria-live'));
    }
    expect(document.getElementById('vot-toast-sheet-crash').getAttribute('aria-live')).toBe('assertive');
    expect(await seriousViolations(document)).toEqual([]);
    RootExit.disarm();
  });
});
