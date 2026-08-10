// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* HistoryScreen — search + resume chips (2026-08-09).
   ═══════════════════════════════════════════════════════════════════════
   Two gaps this pins:

   (1) History was the ONE index screen with no search box while every
       sibling had one — and it holds the most rows of any of them (2,000
       entries, folded into collapsed day/week/month/year groups). A match
       buried inside a collapsed 2019 is the same as no match, so the
       filter runs BEFORE grouping and a query flips every surviving group
       open.

   (2) BACKLOG [26]'s named remainder: a chapter row carries the same
       "N% · ~M min left" chip its index card shows. Real countItemWords /
       readingMinutes / bookItemsFor are wired in — a stub would let the
       row and the card drift apart, which is the whole point of the
       shared chip helper. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/react';
import { HistoryScreen } from './HistoryScreen.jsx';
import { HistoryEntryCard } from '../components/HistoryEntryCard.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { countItemWords, readingMinutes } from '../../utils/word-count.js';
import { bookItemsFor, READ_VERSION_ID } from '../../utils/progress-stats.js';
import { timeAgo } from '../../utils/dates.js';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'HistoryEntryCard', 'ConfirmStrip',
  'timeAgo', 'WEEKDAY_NAMES', 'MONTH_NAMES', 'MONTH_ABBR', 'COL_BY_INDEX_SC',
  'countItemWords', 'readingMinutes', 'bookItemsFor', 'READ_VERSION_ID',
  'ReadingStatsStore', 'BOOKS', 'LETTERS_V1', 'studyAbbrev'];

/** A 3-chapter book whose chapters have real, countable verse text. */
const BOOK = {
  id: 'psalms', title: 'Psalms',
  chapters: [1, 2, 3].map((num) => ({
    num,
    title: 'Psalm ' + num,
    sections: [{ verses: Array.from({ length: 40 }, (_u, i) => ({ n: i + 1, text: 'a word of the psalm sung in the assembly of the upright ' + i })) }],
  })),
};

/** Volume One's letters — Format A, real countable body text (C2-C [C6]). */
const V1_LETTERS = ['the-wide-path', 'the-seventh-day'].map((id, i) => ({
  id, num: i + 1, title: id === 'the-wide-path' ? 'The Wide Path' : 'The Seventh Day',
  blocks: [{ type: 'para', segments: [{ t: 'text', v: Array.from({ length: 400 }, (_u, n) => 'word' + n).join(' ') }] }],
}));

function setupGlobals(over = {}) {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.LibraryNav = () => null;
  // The REAL row + confirm components: the chip lands inside the card, so a
  // stubbed card would make every chip assertion vacuous.
  globalThis.HistoryEntryCard = HistoryEntryCard;
  globalThis.ConfirmStrip = ConfirmStrip;
  globalThis.timeAgo = timeAgo;
  globalThis.WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  globalThis.MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  globalThis.MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // `readKey` is the letter-row half of the chip's key space: it is the id
  // bookItemsFor resolves the collection under AND the middle segment of the
  // tracker's v1:<source>:<item> key (C2-C [C6]).
  globalThis.COL_BY_INDEX_SC = new Map([['vol-one-idx', { label: 'Volume One', readKey: 'volume-one' }]]);
  // Real counters + real corpus resolver — same ones the index cards use.
  globalThis.countItemWords = countItemWords;
  globalThis.readingMinutes = readingMinutes;
  globalThis.bookItemsFor = over.bookItemsFor || bookItemsFor;
  globalThis.READ_VERSION_ID = READ_VERSION_ID;
  globalThis.BOOKS = { psalms: BOOK };
  globalThis.LETTERS_V1 = V1_LETTERS;
  // index.html's one-liner: the abbrev table, else a shortened title.
  globalThis.studyAbbrev = (_slug, fallback) => fallback || '';
  if (over.progress) {
    globalThis.ReadingStatsStore = {
      subscribe: () => () => {}, getVersion: () => 0,
      measuredWpm: () => over.wpm || null,
      getProgress: (key) => over.progress[key] || null,
    };
  }
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const DAY = 86400000;
const noop = () => {};
/** Timestamps inside today, so every fixture row lands in the current-day group. */
const today = (minutesAgo) => Date.now() - minutesAgo * 60000;

const chapter = (bookId, bookTitle, num, ts, chapterTitle = null) => ({
  type: 'chapter', key: `ch:${bookId}:${num}`, bookId, bookTitle,
  chapterNum: num, chapterTitle, ts,
});
const letter = (id, title, num, ts, over = {}) => ({
  type: 'letter', key: 'lt:' + id, letterId: id, letterTitle: title,
  letterNum: num, volumeScreen: 'vol-one-idx', ts, ...over,
});
const study = (slug, title, num, ts) => ({
  type: 'study-chapter', key: 'st:' + slug + ':' + num, studyId: slug, studySlug: slug,
  studyTitle: title, studyChapterId: 'c' + num, chapterNum: num, chapterTitle: 'Part ' + num, ts,
});

const renderScreen = (history, props = {}) => render(
  <HistoryScreen
    history={history}
    onBack={noop} onSelect={noop} onSearch={noop} onSettings={noop}
    theme="dark" onThemeChange={noop} onPruneDay={noop}
    {...props}
  />,
);

const searchBox = () => document.querySelector('input.notes-index-search');
const cardTitles = () => [...document.querySelectorAll('.chapter-card-title')].map((t) => t.textContent);
const type = (value) => fireEvent.change(searchBox(), { target: { value } });

describe('HistoryScreen — search', () => {
  const HISTORY = [
    chapter('psalms', 'Psalms', 23, today(5), 'The Lord Is My Shepherd'),
    chapter('psalms', 'Psalms', 1, today(30)),
    letter('the-wide-path', 'The Wide Path', 1, today(60)),
  ];

  it('offers the same search box its sibling index screens have', () => {
    setupGlobals();
    renderScreen(HISTORY);
    const box = searchBox();
    expect(box).toBeTruthy();
    expect(box.getAttribute('type')).toBe('search');
    expect(box.getAttribute('placeholder')).toBe('Search history…');
  });

  it('has no search box at all while the scroll is blank', () => {
    setupGlobals();
    renderScreen([]);
    expect(searchBox()).toBeNull();
    expect(document.body.textContent).toContain('The scroll is blank');
  });

  it('filters rows by title, and reports how many matched', () => {
    setupGlobals();
    renderScreen(HISTORY);
    expect(cardTitles()).toHaveLength(3);
    type('shepherd');
    expect(cardTitles()).toEqual(['The Lord Is My Shepherd']);
    expect(document.querySelector('.history-search-count').textContent).toBe('1 visit match');
  });

  it('matches a book-and-number query the way it is displayed', () => {
    setupGlobals();
    renderScreen(HISTORY);
    type('psalms 23');
    expect(cardTitles()).toEqual(['The Lord Is My Shepherd']);
  });

  it('matches letters by their collection label too', () => {
    setupGlobals();
    renderScreen(HISTORY);
    type('volume one');
    expect(cardTitles()).toEqual(['The Wide Path']);
  });

  it('ignores case and surrounding whitespace', () => {
    setupGlobals();
    renderScreen(HISTORY);
    type('   ShEpHeRd  ');
    expect(cardTitles()).toEqual(['The Lord Is My Shepherd']);
  });

  it('says so plainly when nothing matches, instead of rendering a blank screen', () => {
    setupGlobals();
    renderScreen(HISTORY);
    type('habakkuk');
    expect(cardTitles()).toEqual([]);
    expect(document.querySelector('.history-search-count').textContent).toBe('No visits match');
    // The scroll-is-blank empty state belongs to an EMPTY history, not a
    // filtered one — the reader's trail is still there.
    expect(document.body.textContent).not.toContain('The scroll is blank');
  });

  it('restores every row when the query is cleared', () => {
    setupGlobals();
    renderScreen(HISTORY);
    type('shepherd');
    expect(cardTitles()).toHaveLength(1);
    type('');
    expect(cardTitles()).toHaveLength(3);
    expect(document.querySelector('.history-search-count')).toBeNull();
  });
});

describe('HistoryScreen — search reaches inside collapsed groups', () => {
  // Two years back: its year/month/week/day groups are all default-CLOSED.
  const OLD_TS = Date.now() - 730 * DAY;
  const HISTORY = [
    chapter('psalms', 'Psalms', 1, today(5)),
    chapter('psalms', 'Psalms', 23, OLD_TS, 'The Lord Is My Shepherd'),
  ];

  it('leaves the old match hidden while no query is active', () => {
    setupGlobals();
    renderScreen(HISTORY);
    expect(cardTitles()).not.toContain('The Lord Is My Shepherd');
  });

  it('auto-expands the groups holding matches while the query is active', () => {
    setupGlobals();
    renderScreen(HISTORY);
    type('shepherd');
    expect(cardTitles()).toEqual(['The Lord Is My Shepherd']);
    // Every ancestor group is open, not merely mounted.
    for (const head of document.querySelectorAll('.history-year-header, .history-month-header, .history-week-header, .history-day-header')) {
      expect(head.querySelector('.history-chevron.is-open')).toBeTruthy();
    }
  });

  it('drops groups that hold no match rather than showing empty shells', () => {
    setupGlobals();
    renderScreen(HISTORY);
    type('shepherd');
    // The current-month section held only the non-matching Psalm 1.
    expect(document.querySelector('.history-current-section')).toBeNull();
  });

  it('collapses back to the browsing arrangement once the query clears', () => {
    setupGlobals();
    renderScreen(HISTORY);
    type('shepherd');
    expect(cardTitles()).toContain('The Lord Is My Shepherd');
    type('');
    expect(cardTitles()).not.toContain('The Lord Is My Shepherd');
  });

  it('still lets a group be collapsed by hand during a search', () => {
    setupGlobals();
    renderScreen(HISTORY);
    type('shepherd');
    fireEvent.click(document.querySelector('.history-year-header'));
    expect(cardTitles()).toEqual([]);
    // …and that collapse belongs to THIS query only.
    type('psalm');
    expect(cardTitles()).toContain('The Lord Is My Shepherd');
  });
});

describe('HistoryScreen — resume chips on chapter rows', () => {
  const chipText = () => [...document.querySelectorAll('.idx-min-chip')].map((c) => c.textContent);

  it('shows the cold estimate for a chapter with no frontier', () => {
    setupGlobals({ progress: {} });
    renderScreen([chapter('psalms', 'Psalms', 1, today(5))]);
    expect(chipText()).toEqual([expect.stringMatching(/^~\d+ min$/)]);
    expect(document.querySelector('.idx-min-chip.in-progress')).toBeNull();
  });

  it('shows percent-read and time-left for a chapter left part-way', () => {
    setupGlobals({
      progress: { [`${READ_VERSION_ID}:psalms:1`]: { b: 10, c: [1, 2, 3, 4, 5, 6], tw: 500, w: 300 } },
    });
    renderScreen([chapter('psalms', 'Psalms', 1, today(5))]);
    const chip = document.querySelector('.idx-min-chip.in-progress');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('60%');
    expect(chip.textContent).toContain('min left');
  });

  it('reads the frontier under the SAME key the index card uses', () => {
    // Keyed for chapter 2; the row for chapter 1 must not borrow it.
    setupGlobals({
      progress: { [`${READ_VERSION_ID}:psalms:2`]: { b: 10, c: [1, 2, 3, 4, 5], tw: 500, w: 250 } },
    });
    renderScreen([chapter('psalms', 'Psalms', 1, today(5)), chapter('psalms', 'Psalms', 2, today(9))]);
    const cards = [...document.querySelectorAll('.chapter-card-btn')];
    expect(within(cards[0]).queryByText(/min left/)).toBeNull();
    expect(within(cards[1]).getByText(/50% · ~\d+ min left/)).toBeTruthy();
  });

  it('gives an unresolvable book no chip at all', () => {
    setupGlobals({ progress: {} });
    renderScreen([chapter('nowhere', 'Nowhere', 3, today(9))]);
    expect(chipText()).toEqual([]);
  });

  it('renders rows normally when the word counters are absent', () => {
    setupGlobals({ progress: {} });
    delete globalThis.countItemWords;
    renderScreen([chapter('psalms', 'Psalms', 1, today(5))]);
    expect(chipText()).toEqual([]);
    expect(cardTitles()).toHaveLength(1);
  });
});

/* C2-C [C6] — the other half of BACKLOG [26]. Letter rows were the named
   remainder: they live in a different key space (a collection readKey + a
   slug, not a bookId + a number), which is the ONLY reason they had no chip.
   COL_BY_INDEX_SC resolves that key space from the `volumeScreen` every
   letter row already stores. */
describe('HistoryScreen — resume chips on letter rows', () => {
  const chipText = () => [...document.querySelectorAll('.idx-min-chip')].map((c) => c.textContent);

  it('shows the cold estimate on a letter row (it showed nothing before)', () => {
    setupGlobals({ progress: {} });
    renderScreen([letter('the-wide-path', 'The Wide Path', 1, today(5))]);
    expect(chipText()).toEqual([expect.stringMatching(/^~\d+ min$/)]);
  });

  it('shows percent-read and time-left for a letter left part-way', () => {
    setupGlobals({
      progress: { [`${READ_VERSION_ID}:volume-one:the-wide-path`]: { b: 10, c: [1, 2, 3, 4], tw: 400, w: 160 } },
    });
    renderScreen([letter('the-wide-path', 'The Wide Path', 1, today(5))]);
    const chip = document.querySelector('.idx-min-chip.in-progress');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('40%');
    expect(chip.textContent).toContain('min left');
  });

  it('reads the frontier under v1:<collection readKey>:<letterId>, not a neighbor', () => {
    setupGlobals({
      progress: { [`${READ_VERSION_ID}:volume-one:the-seventh-day`]: { b: 10, c: [1, 2, 3, 4, 5], tw: 400, w: 200 } },
    });
    renderScreen([
      letter('the-wide-path', 'The Wide Path', 1, today(5)),
      letter('the-seventh-day', 'The Seventh Day', 2, today(9)),
    ]);
    const cards = [...document.querySelectorAll('.chapter-card-btn')];
    expect(within(cards[0]).queryByText(/min left/)).toBeNull();
    expect(within(cards[1]).getByText(/50% · ~\d+ min left/)).toBeTruthy();
  });

  it('gives a legacy row with no volumeScreen no chip rather than guessing a collection', () => {
    setupGlobals({ progress: {} });
    renderScreen([letter('the-wide-path', 'The Wide Path', 1, today(5), { volumeScreen: undefined })]);
    expect(chipText()).toEqual([]);
    expect(cardTitles()).toEqual(['The Wide Path']);   // the row itself still renders
  });

  it('leaves study-chapter rows chipless — their index has no chip to match', () => {
    setupGlobals({ progress: {} });
    renderScreen([study('the-lamb-of-god', 'The Lamb of God', 3, today(5))]);
    expect(chipText()).toEqual([]);
  });

  it('sweeps each corpus ONCE per render and never for a collapsed group', () => {
    // Auto-expanded day groups must not jank: the item map is built lazily on
    // first touch, per SOURCE, and a group that is not open never asks.
    const calls = [];
    setupGlobals({ progress: {}, bookItemsFor: (id) => { calls.push(id); return bookItemsFor(id); } });
    renderScreen([
      letter('the-wide-path', 'The Wide Path', 1, today(5)),
      letter('the-seventh-day', 'The Seventh Day', 2, today(6)),
      chapter('psalms', 'Psalms', 1, today(7)),
      chapter('psalms', 'Psalms', 2, today(8)),
      // Two years back — its groups are default-CLOSED, so its rows never render.
      chapter('psalms', 'Psalms', 3, Date.now() - 730 * DAY),
    ]);
    expect(calls).toEqual(['volume-one', 'psalms']);
  });
});

/* Deduplicate acts on a whole calendar day, so it may not be offered while a
   query is showing a subset of that day — the count would describe the
   filtered rows and the press would remove more than it named. */
describe('HistoryScreen — deduplicate during a search', () => {
  /* These three must land in ONE day group for the button to appear at all, so
     they are spaced by SECONDS rather than by `today(minutes)`: a fixture that
     reaches 35 minutes back straddles midnight for the first half-hour of every
     day, and the suite failed there (caught 2026-08-10, 00:0x). */
  const DUPES = [
    chapter('psalms', 'Psalms', 1, Date.now() - 1000),
    chapter('psalms', 'Psalms', 1, Date.now() - 2000),
    chapter('psalms', 'Psalms', 23, Date.now() - 3000, 'The Lord Is My Shepherd'),
  ];

  it('offers deduplicate on the unfiltered day', () => {
    setupGlobals();
    renderScreen(DUPES);
    expect(document.querySelector('.history-dedupe-btn').textContent).toBe('Deduplicate (1)');
  });

  it('withdraws it while a query is filtering that day', () => {
    setupGlobals();
    renderScreen(DUPES);
    type('psalms');
    expect(cardTitles()).toHaveLength(3);
    expect(document.querySelector('.history-dedupe-btn')).toBeNull();
    type('');
    expect(document.querySelector('.history-dedupe-btn')).toBeTruthy();
  });
});
