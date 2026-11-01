// @ts-nocheck
/* Leak gate for the app shell's sheets and the reader-tabs overview (leak hunt, 2026-11-01).
   ─────────────────────────────────────────────────────────────────────
   The note, link, bookmark and annotation sheets, the tabs overview and its
   action sheet, the shell overlays and the tour, each opened and closed 20 times
   over the page in jsdom. Every listener, timer, frame, observer, store
   subscription, channel, database connection and object URL an open starts must
   be gone after the close (ui/leak/leak-harness.js). Free globals are stubbed the
   way shell-sheets.axe.test.jsx stubs them; the stores' subscribe really adds
   and removes, so what stays subscribed is counted. */
import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { installLeakHarness, expectNoLeaks } from '../leak/leak-harness.js';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { NoteSheet } from './NoteSheet.jsx';
import { BookmarkCreateSheet } from './BookmarkCreateSheet.jsx';
import { LinkPicker } from './LinkPicker.jsx';
import { MultiNotePopover } from './MultiNotePopover.jsx';
import { AnnotationActionChip } from './AnnotationActionChip.jsx';
import { TabActionSheet } from './TabActionSheet.jsx';
import { TabsOverview } from './TabsOverview.jsx';
import { AppShellOverlays } from '../components/AppShellOverlays.jsx';
import { TourOverlay } from '../components/TourOverlay.jsx';
import { createPressDrag } from '../../utils/press-drag.js';
import { TourController } from '../../utils/tour-controller.js';
import { TourDoneFlagStore } from '../../stores/app-flag-stores.js';
import { _resetToasts } from '../../utils/toast.js';

const g = globalThis;
const noop = () => {};
let set = [];
let h = null;
function stub(obj) { for (const k of Object.keys(obj)) { g[k] = obj[k]; set.push(k); } }
const subs = () => { const l = new Set(); return { subscribe: (cb) => { l.add(cb); return () => { l.delete(cb); }; }, getVersion: () => 1 }; };
/** Open → (interact) → close, 20 times. The harness goes in after the test's globals. */
const leakFree = (label, mount, interact) => { h = h || installLeakHarness(); return expectNoLeaks(h, mount, { label, interact, cycles: 20 }); };

beforeEach(() => {
  g.ReactDOM = ReactDOM;
  g.ConfirmStrip = ConfirmStrip;
  document.documentElement.lang = 'en';
  modalRegistry._reset();
});
afterEach(() => {
  if (h) { h.restore(); h = null; }
  cleanup();
  for (const k of set) delete g[k];
  set = [];
  modalRegistry._reset();
  _resetToasts();
  document.body.innerHTML = '';
});

function noteStores(body) {
  stub({
    HL_COLORS: ['yellow', 'green', 'blue'],
    NoteStore: {
      ...subs(), update: vi.fn(), remove: vi.fn(),
      get: (gid) => ({ groupId: gid, color: 'yellow', body: body + ' ' + gid, fullText: 'In the beginning', keys: ['k'], notebookIds: ['nb1'], created: 1, updated: 2 }),
    },
    AnnotationStore: {
      ...subs(), removeGroup: vi.fn(), recolorGroup: vi.fn(), convertGroup: vi.fn(),
      getByGroup: () => [{ key: 'bible:genesis:1:1', ann: { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'In the beginning' } }],
      get: () => [{ id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'In the beginning' }],
    },
    NotebookStore: { get: (id) => ({ id, name: 'Psalms' }) },
    NoteDefaultStore: { set: vi.fn(), get: () => ({ style: 'highlight', color: 'yellow' }) },
  });
}

describe('leaks — note and annotation sheets', () => {
  it('NoteSheet, its options menu open', async () => {
    noteStores('A thought');
    await leakFree('NoteSheet', () => render(<NoteSheet groupId="g1" startInEditMode={false} onClose={noop} />),
      () => { fireEvent.click(screen.getByRole('button', { name: 'Options' })); });
  });
  it('NoteSheet in edit mode, typed into', async () => {
    noteStores('');
    await leakFree('NoteSheet edit', () => render(<NoteSheet groupId="g1" startInEditMode onClose={noop} onOpenNotebookPicker={noop} />),
      () => { fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), { target: { value: 'More' } }); });
  });
  it('MultiNotePopover', async () => {
    noteStores('Reflection');
    await leakFree('MultiNotePopover', () => render(<MultiNotePopover payload={{ groupIds: ['g1', 'g2'], x: 180, y: 300 }} onClose={noop} onPick={noop} />));
  });
  it('AnnotationActionChip, its colour panel open', async () => {
    noteStores('');
    g.NoteStore.get = () => null;
    await leakFree('AnnotationActionChip', () => render(<AnnotationActionChip chip={{ x: 100, y: 100, hlKey: 'bible:genesis:1:1', groupId: 'g1' }} onClose={noop} onNoteRequest={noop} />),
      () => { fireEvent.click(screen.getByText('Color')); });
  });
  it('BookmarkCreateSheet', async () => {
    await leakFree('BookmarkCreateSheet', () => render(<BookmarkCreateSheet pending={{ hlKey: 'bible:john:3:16', defaultLabel: 'John 3:16', sourceLabel: 'John 3', excerpt: 'For God so loved the world' }}
      onConfirm={noop} onCancel={noop} />));
  });
});

describe('leaks — LinkPicker', () => {
  const linkProps = {
    sourceKey: 'bible:john:3:16', sourceLabel: 'John 3:16', sourceText: 'For God so loved the world',
    onClose: noop, onRequestRefine: noop, lastCreatedLink: null, onLinkCreated: noop, mode: null, onPickTarget: null,
  };
  it('searched, then browsed', async () => {
    stub({
      RecentNavStore: { list: () => [], add: vi.fn() },
      searchNavIndex: () => [{ item: { kind: 'bible-chapter', category: 'New Testament', label: 'John 3' } }],
      navItemToEndpoint: (item) => ({ type: 'bible', key: 'k', label: item.label, verse: 1 }),
      LinkStore: { ...subs(), remove: vi.fn(), all: () => [] },
      buildSourceEndpoint: () => ({ key: 's', label: 'src' }),
      persistLink: vi.fn(() => ({ id: 'lnk1', target: { label: 'Genesis 1:1' } })),
      COL_NAV_ICON: new Map([['Volume Two', 'V2']]),
      buildNavTree: () => ({ bibleBooks: [{ bookId: 'genesis', title: 'Genesis', category: 'Old Testament', chapters: [{ chapter: 1 }] }], matthewChapters: [], collections: [], studies: [] }),
      contentDocToNavItem: () => null,
    });
    await leakFree('LinkPicker', () => render(<LinkPicker {...linkProps} />), () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Search titles and references' }), { target: { value: 'John' } });
      fireEvent.click(screen.getByRole('tab', { name: 'Browse' }));
    });
  });
});

describe('leaks — reader tabs', () => {
  const TABS = [
    { screen: 'letter', title: 'The Wide Path', scrollPositions: { k: { pct: 0.4 } }, pinned: true },
    { screen: 'bible', title: 'Genesis 1', scrollPositions: {} },
    { screen: 'home', title: 'Home', scrollPositions: {} },
  ];
  const tabGlobals = () => stub({
    createPressDrag,
    describeTab: (t) => ({ title: t.title, subtitle: 'Volume Two', resolved: true }),
    tabContentKey: (t) => 'k' + t.title,
    tabHasProgressBar: () => true,
    scrollKeyForTab: () => 'k',
  });
  it('the tabs overview, its Clear All confirm open', async () => {
    tabGlobals();
    await leakFree('TabsOverview', () => render(
      <div role="dialog" aria-modal="true" aria-label="Tabs">
        <TabsOverview tabs={TABS} activeTabIdx={1} onSelect={noop} onClose={noop} onNewTab={noop} onMenu={noop}
          onReorder={noop} onClearAll={noop} onDedupe={noop} MAX_TABS={9} thumbnails={null} />
      </div>,
    ), () => { fireEvent.click(screen.getByText('Clear All')); });
  });
  it('a tab card pressed (the press-drag armed) when the overview closes', async () => {
    tabGlobals();
    await leakFree('TabsOverview press', () => render(
      <TabsOverview tabs={TABS} activeTabIdx={1} onSelect={noop} onClose={noop} onNewTab={noop} onMenu={noop}
        onReorder={noop} onClearAll={noop} onDedupe={noop} MAX_TABS={9} thumbnails={null} />,
    ), () => {
      const card = screen.getByRole('button', { name: /Switch to Genesis 1/ });
      fireEvent.pointerDown(card, { pointerId: 1, clientX: 10, clientY: 10, button: 0, isPrimary: true });
    });
  });
  it('the tab action sheet, renaming', async () => {
    await leakFree('TabActionSheet', () => render(<TabActionSheet idx={1} total={3} tabs={TABS} tab={TABS[1]} onCloseOthers={noop} onCloseToRight={noop}
      onRename={noop} onTogglePin={noop} onMove={noop} onDismiss={noop} />), () => { fireEvent.click(screen.getByText('Rename tab…')); });
  });
});

describe('leaks — shell overlays and the tour', () => {
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
  const overlayGlobals = () => stub({
    ErrorBoundary: ({ children }) => children, StorageHealthBanner: () => null, Safari7DayModal: () => null,
    IosPwaWelcomeCard: () => null, TourOverlay: () => null,
  });
  it('the disable-tabs prompt and the Garden warning', async () => {
    overlayGlobals();
    await leakFree('AppShellOverlays prompt', () => render(<AppShellOverlays {...overlayProps} disableTabsPromptOpen />));
    await leakFree('AppShellOverlays garden', () => render(<AppShellOverlays {...overlayProps} gardenWarningOpen />));
  });
  it('the tour\'s welcome card', async () => {
    localStorage.clear();
    TourDoneFlagStore._resetForTests({ forceLoaded: true });
    TourController._resetForTests();
    stub({ TourController });
    TourController.attachNav({ goHome: vi.fn(), openLetter: vi.fn(), openBible: vi.fn(), goJournalHub: vi.fn(), openSettingsData: vi.fn() });
    try {
      await leakFree('TourOverlay', () => { TourController.start('prompt'); return render(<TourOverlay />); });
    } finally { TourController._resetForTests(); }
  });
});
