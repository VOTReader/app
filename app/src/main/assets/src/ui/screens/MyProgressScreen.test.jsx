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
import { render, cleanup, act } from '@testing-library/react';
import { MyProgressScreen, _fmtWords } from './MyProgressScreen.jsx';
import { tallyGroup, countReadFor, mostAnnotatedSources } from '../../utils/progress-stats.js';
import { countTextWords } from '../../utils/word-count.js';

const STUBBED = [
  'ScreenLayout', 'LibraryNav',
  'NoteStore', 'LinkStore', 'BookmarkStore', 'JournalStore',
  'JournalStatsStore', 'ReadingStreakStore', 'AnnotationStore',
  'ReadingStatsStore', 'JournalMediaStore', 'countTextWords',
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
  globalThis.JournalStore = mkStore({
    count: () => over.journal || 0,
    // .all() only when entries are given — its ABSENCE is the guard path
    // the pre-stats tests pin (Journaling section hidden).
    ...(over.entries ? { all: () => over.entries } : {}),
  });
  globalThis.JournalStatsStore = mkStore({ get: () => ({ currentStreak: over.streak || 0 }) });
  globalThis.ReadingStreakStore = mkStore({
    get: () => ({ currentStreak: over.readStreak || 0 }),
    recomputeFromLoad: () => {},
  });
  globalThis.AnnotationStore = mkStore({ all: () => over.ann || {} });
  // ReadingStatsStore only when asked — absent-store tests double as the
  // hide-not-zero guard contract for the new hero cells + day bars.
  if (over.stats) {
    globalThis.ReadingStatsStore = mkStore({
      get: () => ({ totalWordsRead: over.stats.words || 0 }),
      measuredWpm: () => (over.stats.wpm == null ? null : over.stats.wpm),
      wordsForDays: (n) => over.stats.days
        || Array.from({ length: n }, (_, i) => ({ date: 'd' + i, words: 0 })),
    });
  }
  if (over.media) globalThis.JournalMediaStore = { list: () => Promise.resolve(over.media) };
  if (over.entries) globalThis.countTextWords = countTextWords;
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

describe('_fmtWords — compact hero count', () => {
  it('renders exact counts with separators below 10k', () => {
    expect(_fmtWords(0)).toBe('0');
    expect(_fmtWords(9999)).toBe('9,999');
  });
  it('renders one-decimal k from 10k, dropping trailing .0', () => {
    expect(_fmtWords(10000)).toBe('10k');
    expect(_fmtWords(12440)).toBe('12.4k');
  });
  it('renders one-decimal M from 1M', () => {
    expect(_fmtWords(1234567)).toBe('1.2M');
  });
});

describe('MyProgressScreen — reading measurement hero cells', () => {
  it('shows Words Read compactly and hides Reading Pace while measuredWpm is null', () => {
    setupGlobals({ stats: { words: 12440, wpm: null } });
    const { container } = renderScreen();
    const labels = [...container.querySelectorAll('.prg-stat-label')].map((n) => n.textContent);
    expect(labels).toContain('Words Read');
    expect(labels).not.toContain('Reading Pace');
    const nums = [...container.querySelectorAll('.prg-stat-num')].map((n) => n.textContent);
    expect(nums).toContain('12.4k');
  });

  it('shows the measured pace cell once a pace exists', () => {
    setupGlobals({ stats: { words: 100, wpm: 214 } });
    const { container } = renderScreen();
    const labels = [...container.querySelectorAll('.prg-stat-label')].map((n) => n.textContent);
    expect(labels).toContain('Reading Pace');
    const nums = [...container.querySelectorAll('.prg-stat-num')].map((n) => n.textContent);
    expect(nums).toContain('214');
  });
});

describe('MyProgressScreen — last-14-days bars', () => {
  it('renders 14 bars with heights keyed to each day (zero days get no inline height)', () => {
    const days = Array.from({ length: 14 }, (_, i) => ({ date: 'd' + i, words: 0 }));
    days[12] = { date: 'd12', words: 500 };  // 14-day max → 100%
    days[13] = { date: 'd13', words: 250 };  // half → 50%
    setupGlobals({ stats: { words: 750, wpm: null, days } });
    const { container } = renderScreen();
    const wrap = container.querySelector('.prg-days-wrap');
    expect(wrap.getAttribute('aria-label')).toBe('Words read, last 14 days');
    const bars = [...wrap.querySelectorAll('.prg-days-bar')];
    expect(bars).toHaveLength(14);
    expect(bars[12].style.height).toBe('100%');
    expect(bars[13].style.height).toBe('50%');
    expect(bars[0].style.height).toBe('');
    const summaries = [...wrap.querySelectorAll('.sr-only')].map((el) => el.textContent);
    expect(summaries[0]).toBe('750 words this week');
    expect(summaries[1]).toContain('d12: 500 words');
    expect(summaries[1]).toContain('d13: 250 words');
    expect(wrap.querySelector('.prg-days-head').textContent).toContain('Last 14 days');
    expect(wrap.querySelector('.prg-days-head').textContent).toContain('750 words this week');
  });

  it('renders no bars at all when ReadingStatsStore is absent', () => {
    setupGlobals();
    const { container } = renderScreen();
    expect(container.querySelector('.prg-days-wrap')).toBeNull();
  });
});

describe('MyProgressScreen — journaling section', () => {
  const flush = async () => act(async () => {});

  it('sums words written over p/h2/quote blocks only', async () => {
    setupGlobals({ entries: [
      { blocks: [
        { type: 'p', text: 'one two three' },
        { type: 'quote', text: 'four five' },
        { type: 'letter-card', text: 'quoted excerpt never counted' },
      ] },
      { blocks: [{ type: 'h2', text: 'six' }] },
    ] });
    const { container } = renderScreen();
    await flush();
    const row = [...container.querySelectorAll('.progress-row')]
      .find((r) => r.textContent.includes('Words written'));
    expect(row.querySelector('.progress-row-tally').textContent).toBe('6');
  });

  it('shows voice-memo minutes from audio durations, ignoring images', async () => {
    setupGlobals({ entries: [], media: [
      { type: 'audio', duration: 150 },
      { type: 'audio', duration: 90 },
      { type: 'image' },
    ] });
    const { container } = renderScreen();
    await flush();
    const row = [...container.querySelectorAll('.progress-row')]
      .find((r) => r.textContent.includes('Voice memos'));
    expect(row.querySelector('.progress-row-tally').textContent).toBe('4 min');
  });

  it('omits the voice-memo row entirely at 0 minutes', async () => {
    setupGlobals({ entries: [], media: [{ type: 'image' }] });
    const { container } = renderScreen();
    await flush();
    expect(container.textContent).toContain('Words written');
    expect(container.textContent).not.toContain('Voice memos');
  });

  it('hides the whole section when the word counter and media store are absent', () => {
    setupGlobals();
    const { container } = renderScreen();
    expect(container.textContent).not.toContain('Words written');
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
