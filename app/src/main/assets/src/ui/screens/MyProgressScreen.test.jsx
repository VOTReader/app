// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* MyProgressScreen — the dashboard's render contract over stubbed stores.
   ──────────────────────────────────────────────────────────────────────
   The aggregation math lives in utils/progress-stats.js (tested there);
   these cases pin the SCREEN's behavior: the summary sentence and rows, the
   historyEnabled=false row suppression, the markAsRead-off note, the
   zero-data empty states, and the most-annotated list. Real tallyGroup /
   mostAnnotatedSources / countReadFor are wired in ([[dont-over-mock]]);
   only buildProgressGroups is stubbed so the reading rows don't need a
   full 66-book corpus fixture. */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { MyProgressScreen, _fmtWords } from './MyProgressScreen.jsx';
import { tallyGroup, countReadFor, mostAnnotatedSources } from '../../utils/progress-stats.js';
import { countTextWords } from '../../utils/word-count.js';
import { onIdle } from '../../utils/on-idle.js';

const STUBBED = [
  'ScreenLayout', 'LibraryNav',
  'NoteStore', 'LinkStore', 'BookmarkStore', 'JournalStore',
  'JournalStatsStore', 'ReadingStreakStore', 'AnnotationStore',
  'ReadingStatsStore', 'JournalMediaStore', 'countTextWords',
  'buildProgressGroups', 'tallyGroup', 'countReadFor', 'mostAnnotatedSources',
  'findEntryContext', 'BIBLE_BOOK_LIST', 'AudioLibraryStore',
  // Cross-bundle now: the screen ships in bundle-g and reads these from the
  // window slots bundle-d fills (see src/ui/_entry-g.js), so the test installs
  // the REAL implementations as globals rather than importing them for it.
  'onIdle',
];

const mkStore = (over = {}) => ({ subscribe: () => () => {}, getVersion: () => 0, ...over });

function setupGlobals(over = {}) {
  globalThis.ScreenLayout = ({ children }) => <div data-testid="layout">{children}</div>;
  globalThis.LibraryNav = () => null;
  globalThis.onIdle = onIdle;
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
  // Listening Library — absent unless a test asks, so its ABSENCE stays the
  // guard path the zero-data hero assertions above depend on.
  if (over.listening) {
    globalThis.AudioLibraryStore = mkStore({
      getPlays: () => over.listening.plays || 0,
      getCompletions: () => over.listening.completions || 0,
      saved: () => new Array(over.listening.saved || 0).fill({}),
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

/* The redesign (2026-09-25): the grid of stat boxes became one summary sentence and label / value
   rows (.prg-fact) in the section each fact belongs to. `fact` reads a row's value by its label. */
const fact = (container, label) => {
  const row = [...container.querySelectorAll('.prg-fact')].find((r) => r.querySelector('dt').textContent === label);
  return row ? row.querySelector('dd').textContent : null;
};
const summaryOf = (container) => container.querySelector('.prg-summary').textContent;

describe('MyProgressScreen — summary + empty states (brand-new user)', () => {
  it('renders zero-data as intentional: a plain sentence, 0-value rows, the annotate hint', () => {
    setupGlobals();
    const { container } = renderScreen();
    expect(summaryOf(container)).toBe('Nothing read yet. The chapters and letters you read are counted here.');
    expect(fact(container, 'Chapters & letters read')).toBe('0');
    expect(fact(container, 'Reading streak')).toBe('0 days');
    expect(fact(container, 'Entries')).toBe('0');
    expect(fact(container, 'Journal streak')).toBe('0 days');
    expect(container.textContent).toContain('Nothing marked yet');
    expect(container.textContent).toContain('Loading your library…'); // corpora not loaded
  });

  it('fills the sentence and the rows from readItems + reading streak + journal stats + journal count', () => {
    setupGlobals({ streak: 6, journal: 4, readStreak: 12 });
    const { container } = renderScreen({ readItems: { 'v1:mark:1': 1, 'v1:mark:2': 1 } });
    expect(summaryOf(container)).toBe('2 chapters and letters read, a 12-day reading streak and 4 journal entries.');
    expect(fact(container, 'Chapters & letters read')).toBe('2');
    expect(fact(container, 'Reading streak')).toBe('12 days');
    expect(fact(container, 'Journal streak')).toBe('6 days');
    expect(fact(container, 'Entries')).toBe('4');
  });

  /* Sweep v054: the article was hard-coded 'a ', so a streak read aloud as "eight", "eleven",
     "eighteen" or "eighty-..." printed "a 8-day reading streak". The article follows the spoken number. */
  it.each([
    [8, 'an'], [11, 'an'], [18, 'an'], [80, 'an'], [84, 'an'], [89, 'an'], [800, 'an'], [8000, 'an'], [11000, 'an'],
    [2, 'a'], [7, 'a'], [12, 'a'], [19, 'a'], [28, 'a'], [100, 'a'], [111, 'a'], [180, 'a'], [1100, 'a'], [1800, 'a'],
  ])('says "%s-day" with the article its spoken number takes (%s)', (n, article) => {
    setupGlobals({ readStreak: n });
    const { container } = renderScreen();
    const lead = article.charAt(0).toUpperCase() + article.slice(1);
    expect(summaryOf(container)).toBe(lead + ' ' + n + '-day reading streak.');
  });

  it('says only what is true: one reading, no one-day "streak", no entries', () => {
    setupGlobals({ readStreak: 1 });
    const { container } = renderScreen({ readItems: { 'v1:mark:1': 1 } });
    expect(summaryOf(container)).toBe('1 chapter or letter read.');
    expect(fact(container, 'Reading streak')).toBe('1 day');
  });

  it('a day that counted with nothing finished says the 1-day streak, never "Nothing read yet" (U01.2)', () => {
    setupGlobals({ readStreak: 1 });
    const { container } = renderScreen();
    expect(summaryOf(container)).toBe('A 1-day reading streak.');
  });

  it('draws no gold-outlined stat boxes any more', () => {
    setupGlobals({ stats: { words: 100, wpm: 214 } });
    const { container } = renderScreen();
    expect(container.querySelector('.prg-hero, .prg-stat, .settings-card')).toBeNull();
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
    // Sweep low (mw9): 999,950-999,999 rounded to "1000k".
    expect(_fmtWords(999949)).toBe('999.9k');
    expect(_fmtWords(999950)).toBe('1M');
    expect(_fmtWords(999999)).toBe('1M');
  });
});

describe('MyProgressScreen — reading measurement rows', () => {
  it('shows Words read compactly and hides Reading pace while measuredWpm is null', () => {
    setupGlobals({ stats: { words: 12440, wpm: null } });
    const { container } = renderScreen();
    expect(fact(container, 'Words read')).toBe('12.4k');
    expect(fact(container, 'Reading pace')).toBeNull();
  });

  it('shows the measured pace once a pace exists', () => {
    setupGlobals({ stats: { words: 100, wpm: 214 } });
    const { container } = renderScreen();
    expect(fact(container, 'Reading pace')).toBe('214 words a minute');
  });

  it('hides every measured row, never shows a 0, when ReadingStatsStore is absent', () => {
    setupGlobals();
    const { container } = renderScreen();
    expect(fact(container, 'Words read')).toBeNull();
    expect(fact(container, 'Reading pace')).toBeNull();
    expect(fact(container, 'Time spent reading')).toBeNull();
    expect(fact(container, 'Re-reads')).toBeNull();
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
    expect(fact(container, 'Words written')).toBe('6');
  });

  it('shows voice-memo minutes from audio durations, ignoring images', async () => {
    setupGlobals({ entries: [], media: [
      { type: 'audio', duration: 150 },
      { type: 'audio', duration: 90 },
      { type: 'image' },
    ] });
    const { container } = renderScreen();
    await flush();
    expect(fact(container, 'Voice memos')).toBe('4 min');
  });

  it('omits the voice-memo row entirely at 0 minutes', async () => {
    setupGlobals({ entries: [], media: [{ type: 'image' }] });
    const { container } = renderScreen();
    await flush();
    expect(container.textContent).toContain('Words written');
    expect(container.textContent).not.toContain('Voice memos');
  });

  it('hides the written-words row (not the section) when the word counter and media store are absent', () => {
    setupGlobals();
    const { container } = renderScreen();
    expect(container.textContent).not.toContain('Words written');
    expect(fact(container, 'Entries')).toBe('0');   // entries and streak always answer
  });
});

describe('MyProgressScreen — reading section', () => {
  it('renders one bar row per group with the tally and a clamped width', () => {
    setupGlobals({ groups: [GROUP] });
    const { container } = renderScreen({ readItems: { 'v1:mark:1': 1, 'v1:mark:2': 1, 'v1:mark:3': 1, 'v1:mark:4': 1 } });
    const row = container.querySelector('.prg-row');
    expect(row.textContent).toContain('New Testament');
    expect(row.textContent).toContain('4 of 16');
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
    const labels = [...container.querySelectorAll('.prg-row .prg-row-label')].map((n) => n.textContent);
    expect(labels).toEqual(['New Testament']);
  });

  // Sweep low (mw9): a failed corpus load left "Loading your library…" up for good, with no retry.
  it('a failed corpus load says so and offers Try again, which re-runs only the failed loader', () => {
    setupGlobals();
    const corpus = (error) => ({ error, loaded: false, subscribe: () => () => {}, getVersion: () => 1 });
    const loadVot = vi.fn(() => Promise.resolve());
    const loadBible = vi.fn(() => Promise.resolve());
    Object.assign(window, { __votCorpus: corpus(true), __bibleCorpus: corpus(false), __loadVotCorpus: loadVot, __loadBibleCorpus: loadBible });
    try {
      const { container, getByRole } = renderScreen();
      expect(container.textContent).not.toContain('Loading your library…');
      expect(container.textContent).toContain('Couldn’t load your library.');
      const votBefore = loadVot.mock.calls.length, bibleBefore = loadBible.mock.calls.length;
      fireEvent.click(getByRole('button', { name: 'Try again' }));
      expect(loadVot.mock.calls.length).toBe(votBefore + 1);
      expect(loadBible.mock.calls.length).toBe(bibleBefore);
    } finally {
      ['__votCorpus', '__bibleCorpus', '__loadVotCorpus', '__loadBibleCorpus'].forEach((k) => { delete window[k]; });
    }
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
    const rows = [...container.querySelectorAll('[aria-labelledby="prg-h-library"] .prg-fact')].map((r) => r.textContent);
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

/* Listening (2026-08-09). The dashboard subscribed to eight stores and not
   the Listening Library, so hours of listening reported nothing. Three
   different acts, three cells — and no cell may invent a number. */
describe('MyProgressScreen — listening block', () => {
  const listenRows = (container) => {
    const block = container.querySelector('.prg-listening');
    if (!block) return null;
    return [...block.querySelectorAll('.prg-fact')].map((r) => ({
      label: r.querySelector('dt').textContent,
      value: r.querySelector('dd').textContent,
    }));
  };

  it('reports plays, completions and saves from the library store', () => {
    setupGlobals({ listening: { plays: 12, completions: 5, saved: 3 } });
    const { container } = renderScreen();
    expect(listenRows(container)).toEqual([
      { label: 'Recordings played', value: '12' },
      { label: 'Heard to the end', value: '5' },
      { label: 'Saved', value: '3' },
    ]);
  });

  it('counts finished recordings separately from started ones', () => {
    // Twenty starts, one finish: the block must not conflate the two.
    setupGlobals({ listening: { plays: 20, completions: 1, saved: 0 } });
    const { container } = renderScreen();
    const rows = listenRows(container);
    expect(rows[0]).toEqual({ label: 'Recordings played', value: '20' });
    expect(rows[1]).toEqual({ label: 'Heard to the end', value: '1' });
  });

  it('hides the whole block for a reader who has never played anything', () => {
    setupGlobals({ listening: { plays: 0, completions: 0, saved: 0 } });
    const { container } = renderScreen();
    expect(listenRows(container)).toBeNull();
  });

  it('hides the block entirely when the library store is absent', () => {
    setupGlobals();
    const { container } = renderScreen();
    expect(listenRows(container)).toBeNull();
    // …and the reading rows are untouched by its absence.
    expect(fact(container, 'Chapters & letters read')).toBe('0');
  });

  it('omits a single row whose reader the store cannot answer', () => {
    setupGlobals();
    globalThis.AudioLibraryStore = mkStore({ getPlays: () => 4 });   // no saved(), no getCompletions()
    const { container } = renderScreen();
    expect(listenRows(container)).toEqual([{ label: 'Recordings played', value: '4' }]);
  });
});

/* ── Milestones removed 2026-10-05 ("Gut milestones for now") ──────────────
   The strip, its "Next" row and the "View all milestones" link are gone. The
   streaks and counts are plain progress and stay. */
describe('MyProgressScreen — no milestones', () => {
  it('renders no milestone section, row or link, and keeps the reading facts', () => {
    setupGlobals();
    globalThis.ReadingStatsStore = mkStore({
      get: () => ({ totalWordsRead: 120000, totalCompletions: 12, rereads: 1, milestonesUnlocked: ['read-first'] }),
      measuredWpm: () => null,
      wordsForDays: (n) => Array.from({ length: n }, (_, i) => ({ date: 'd' + i, words: 0 })),
    });
    const { container } = renderScreen();
    expect(container.querySelector('#prg-h-milestones')).toBeNull();
    expect(container.querySelector('.prg-milestones, .prg-milestone, .prg-next, .prg-milestones-all')).toBeNull();
    expect(container.textContent).not.toMatch(/milestone/i);
    expect(container.textContent).toMatch(/Reading/);
  });
});

/* Sweep W69: the mark count, the most-annotated list and the journal word count walked the whole
   library in render, and the screen renders several times on open (voice minutes, word stats) and
   on every bump of the eight stores it watches. Each is computed once per version of its stores. */
describe('MyProgressScreen — large libraries', () => {
  it('walks the annotations and the journal once per store version, not on every render', () => {
    setupGlobals({
      ann: { 'bible:psalms:23:1': [{ id: 'a', groupId: 'a', kind: 'highlight' }] },
      entries: [{ blocks: [{ type: 'p', text: 'one two three' }] }],
    });
    let annWalks = 0, jrnWalks = 0;
    const annAll = globalThis.AnnotationStore.all, jrnAll = globalThis.JournalStore.all;
    globalThis.AnnotationStore.all = () => { annWalks++; return annAll(); };
    globalThis.JournalStore.all = () => { jrnWalks++; return jrnAll(); };
    const at = (n) => (
      <MyProgressScreen onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop}
        settings={{ markAsRead: true }} readItems={{}} historyCount={n} historyEnabled={true} />
    );
    const { container, rerender } = render(at(0));
    for (let n = 1; n <= 3; n++) rerender(at(n));
    expect(annWalks).toBe(1);
    expect(jrnWalks).toBe(1);
    expect(fact(container, 'Highlights & Underlines')).toBe('1');
    expect(fact(container, 'Words written')).toBe(_fmtWords(3));
    expect(container.querySelectorAll('.prg-src-row').length).toBe(1);
  });
});

/* ds5 s11.1 (idea sweep 2026-10-22): only the reading streak was re-checked on open, so an app
   left running past midnight showed a broken journal streak as unbroken until a reload. */
describe('MyProgressScreen — both streaks are re-checked on open (ds5 s11.1)', () => {
  it('recomputes the journal streak beside the reading streak', () => {
    setupGlobals();
    const journal = vi.fn();
    const reading = vi.fn();
    /** @type {any} */ (globalThis).JournalStatsStore.recomputeFromLoad = journal;
    /** @type {any} */ (globalThis).ReadingStreakStore.recomputeFromLoad = reading;
    renderScreen();
    expect(reading).toHaveBeenCalledTimes(1);
    expect(journal).toHaveBeenCalledTimes(1);
  });
});

// mw18 S7: plans in My Progress: a line per running plan, the plans finished, and coverage with an item in two
// plans counted once.
describe('MyProgressScreen — reading plans', () => {
  afterEach(() => { delete globalThis.ReadingPlanStore; });

  it('a line per plan with its day and counts, finished plans with their dates, coverage counted once', async () => {
    const { ReadingPlanStore } = await import('../../stores/reading-plan-store.js');
    const { startCatalogPlan } = await import('../../data/plan-catalog.js');
    const { tickItem, todayKey } = await import('../../data/plan-engine.js');
    localStorage.clear();
    ReadingPlanStore._resetForTests({ forceLoaded: true });
    globalThis.ReadingPlanStore = ReadingPlanStore;
    const today = todayKey(new Date());
    ReadingPlanStore.put(tickItem(startCatalogPlan('bible-year', null, new Date()), 'proverbs:1', today, 1));
    ReadingPlanStore.put({ ...tickItem(startCatalogPlan('proverbs', null, new Date()), 'proverbs:1', today, 1), status: 'finished', finished: today });
    setupGlobals();
    const { container } = renderScreen({ historyEnabled: false });
    const sec = container.querySelector('[aria-labelledby="prg-h-plans"]');
    expect(sec.textContent).toContain('Bible in a Year');
    expect(sec.textContent).toMatch(/Day 1 of 365 · 1 of 1,189 chapters/);
    expect(sec.querySelector('.prg-history-row').textContent).toMatch(/Proverbs in 31 days.*Started .* · finished .* · 1 day/);
    // Proverbs 1-31 sit in both plans: 1,189 chapters in all, proverbs:1 read once.
    expect(sec.querySelector('.prg-section-meta').textContent).toBe('1 of 1,189 read');
  });
});
