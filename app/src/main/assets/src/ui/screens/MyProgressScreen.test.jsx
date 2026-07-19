// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* MyProgressScreen — the dashboard's render contract over stubbed stores.
   ──────────────────────────────────────────────────────────────────────
   The aggregation math lives in utils/progress-stats.js (tested there);
   these cases pin the SCREEN's behavior: the hero cells, the
   historyEnabled=false row suppression, the markAsRead-off note, the
   zero-data empty states, and the most-annotated list. Real tallyGroup /
   mostAnnotatedSources / countReadFor are wired in ([[dont-over-mock]]);
   only buildProgressGroups is stubbed so the reading rows don't need a
   full 66-book corpus fixture. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MyProgressScreen } from './MyProgressScreen.jsx';
import { tallyGroup, countReadFor, mostAnnotatedSources } from '../../utils/progress-stats.js';

const STUBBED = [
  'ScreenLayout', 'LibraryNav',
  'NoteStore', 'LinkStore', 'BookmarkStore', 'JournalStore',
  'JournalStatsStore', 'ReadingStreakStore', 'AnnotationStore',
  'buildProgressGroups', 'tallyGroup', 'countReadFor', 'mostAnnotatedSources',
  'findEntryContext', 'BIBLE_BOOK_LIST',
];

const mkStore = (over = {}) => ({ subscribe: () => () => {}, getVersion: () => 0, ...over });

function setupGlobals(over = {}) {
  globalThis.ScreenLayout = ({ children }) => <div data-testid="layout">{children}</div>;
  globalThis.LibraryNav = () => null;
  globalThis.NoteStore = mkStore({ count: () => over.notes || 0 });
  globalThis.LinkStore = mkStore({ all: () => new Array(over.links || 0).fill({}) });
  globalThis.BookmarkStore = mkStore({ count: () => over.bookmarks || 0 });
  globalThis.JournalStore = mkStore({ count: () => over.journal || 0 });
  globalThis.JournalStatsStore = mkStore({ get: () => ({ currentStreak: over.streak || 0 }) });
  globalThis.ReadingStreakStore = mkStore({
    get: () => ({ currentStreak: over.readStreak || 0 }),
    recomputeFromLoad: () => {},
  });
  globalThis.AnnotationStore = mkStore({ all: () => over.ann || {} });
  globalThis.buildProgressGroups = () => over.groups || [];
  globalThis.tallyGroup = tallyGroup;
  globalThis.countReadFor = countReadFor;
  globalThis.mostAnnotatedSources = mostAnnotatedSources;
  globalThis.BIBLE_BOOK_LIST = [{ id: 'psalms', title: 'Psalms' }];
}

afterEach(() => {
  cleanup();
  STUBBED.forEach((k) => { delete globalThis[k]; });
});

const noop = () => {};
const renderScreen = (props = {}) => render(
  <MyProgressScreen
    onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop}
    theme="dark" onThemeChange={noop}
    settings={{ markAsRead: true }}
    readItems={{}}
    historyCount={0}
    historyEnabled={true}
    {...props}
  />,
);

const GROUP = {
  id: 'nt', label: 'New Testament',
  genres: [{ label: 'Gospels', books: [{ id: 'mark', label: 'Mark', total: 16 }] }],
};

describe('MyProgressScreen — hero + empty states (brand-new user)', () => {
  it('renders zero-data as intentional: 0-value hero cells + the annotate hint', () => {
    setupGlobals();
    const { container } = renderScreen();
    const nums = [...container.querySelectorAll('.prg-stat-num')].map((n) => n.textContent);
    expect(nums).toEqual(['0', '0', '0', '0']);
    expect(container.textContent).toContain('Nothing marked yet');
    expect(container.textContent).toContain('Loading your library…'); // corpora not loaded
  });

  it('fills the hero from readItems + reading streak + journal stats + journal count', () => {
    setupGlobals({ streak: 6, journal: 4, readStreak: 12 });
    const { container } = renderScreen({ readItems: { 'v1:mark:1': 1, 'v1:mark:2': 1 } });
    const nums = [...container.querySelectorAll('.prg-stat-num')].map((n) => n.textContent);
    expect(nums).toEqual(['2', '12', '6', '4']);
    const labels = [...container.querySelectorAll('.prg-stat-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Read', 'Reading Streak', 'Journal Streak', 'Entries']);
    expect(container.textContent).toContain('days of reading');
  });
});

describe('MyProgressScreen — reading section', () => {
  it('renders one bar row per group with the tally and a clamped width', () => {
    setupGlobals({ groups: [GROUP] });
    const { container } = renderScreen({ readItems: { 'v1:mark:1': 1, 'v1:mark:2': 1, 'v1:mark:3': 1, 'v1:mark:4': 1 } });
    const row = container.querySelector('.prg-row');
    expect(row.textContent).toContain('New Testament');
    expect(row.textContent).toContain('4 / 16');
    expect(container.querySelector('.prg-bar-fill').style.width).toBe('25%');
  });

  it('shows the explanatory note INSTEAD of bars when Mark as Read is off', () => {
    setupGlobals({ groups: [GROUP] });
    const { container } = renderScreen({ settings: { markAsRead: false } });
    expect(container.textContent).toContain('Mark as Read is off');
    expect(container.querySelector('.prg-bar')).toBeNull();
  });

  it('skips groups whose corpus total is still 0 (lazy corpus not yet loaded)', () => {
    const empty = { id: 'studies', label: 'Studies', genres: [{ label: 'x', books: [] }] };
    setupGlobals({ groups: [GROUP, empty] });
    const { container } = renderScreen();
    const labels = [...container.querySelectorAll('.prg-row-label')].map((n) => n.textContent);
    expect(labels).toEqual(['New Testament']);
  });
});

describe('MyProgressScreen — historyEnabled', () => {
  it('shows the reading-history row when history is enabled', () => {
    setupGlobals();
    const { container } = renderScreen({ historyCount: 7, historyEnabled: true });
    expect(container.querySelector('.prg-history-row').textContent).toContain('7 entries');
  });

  it('hides the reading-history row when the user disabled history', () => {
    setupGlobals();
    const { container } = renderScreen({ historyCount: 7, historyEnabled: false });
    expect(container.querySelector('.prg-history-row')).toBeNull();
  });
});

describe('MyProgressScreen — library counts + most annotated', () => {
  it('lists the four library counts from their stores', () => {
    setupGlobals({ notes: 3, links: 2, bookmarks: 1, ann: {
      'bible:psalms:23:1': [{ id: 'a', groupId: 'a', kind: 'highlight' }],
    } });
    const { container } = renderScreen();
    const rows = [...container.querySelectorAll('.progress-row')].map((r) => r.textContent);
    expect(rows).toEqual(['Notes3', 'Highlights & Underlines1', 'Bookmarks1', 'Links2']);
  });

  it('renders the most-annotated list through the real aggregator (title + collection + count)', () => {
    setupGlobals({ ann: {
      'bible:psalms:23:1': [{ id: 'a1', groupId: 'g1', kind: 'highlight' }, { id: 'a2', groupId: 'g2', kind: 'note' }],
      'bible:psalms:23:2': [{ id: 'a3', groupId: 'g1', kind: 'highlight' }],
      'journal:e1:0': [{ id: 'j1', groupId: 'j1', kind: 'highlight' }],
    } });
    const { container } = renderScreen();
    const rows = [...container.querySelectorAll('.prg-src-row')];
    expect(rows.length).toBe(1); // the journal key never surfaces
    expect(rows[0].querySelector('.prg-src-title').textContent).toBe('Psalms');
    expect(rows[0].querySelector('.prg-src-col').textContent).toBe('Scripture');
    expect(rows[0].textContent).toContain('2 marks');
  });
});
