// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* ChapterIndex tests — Wave 0 MISC-SCREENS items (1) + (2).
   ──────────────────────────────────────
   (1) Back affordance mislabeled "← Books": when the index was reached
       from a scripture genre (or Studies / Home for Matthew), the tooltip
       + TalkBack label must name the REAL destination. The destination
       NAME arrives as the backLabel prop; the component only owns honest
       rendering of it.
   (2) Current-chapter marker was silently coupled to the unrelated
       reading-dot setting (settings.showReadingDot gates the resume dot
       in the top nav — nothing else). The route-level selection logic is
       extracted to the pure helper chapterIndexCurrentChapter so the
       decoupling is pinned here.
*/

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ChapterIndex } from './ChapterIndex.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import * as routes from '../screen-routes.jsx';
import { countItemWords, readingMinutes } from '../../utils/word-count.js';

const GLOBALS = ['ScreenLayout', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'countItemWords', 'readingMinutes', 'ReadingStatsStore'];

function setupGlobals() {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  // The REAL shared nav — the back-button assertions below are the contract
  // ChapterIndex delegates to it, so stubbing it would test nothing.
  globalThis.LibraryNav = LibraryNav;
  // jsdom lacks scrollIntoView; the mount effect scrolls the current card
  // into view on a timer.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const BOOK = {
  id: 'psalms',
  title: 'Psalms',
  subtitle: '150 Chapters',
  chapters: [
    { num: 1, title: 'Blessed Is the Man' },
    { num: 2, title: 'The Reign of the Anointed' },
    { num: 3, title: 'A Psalm of David' },
  ],
};

const renderIndex = (props = {}) => render(
  <ChapterIndex
    book={BOOK}
    onSelect={() => {}}
    onBack={() => {}}
    currentChapter={null}
    isRead={() => false}
    markAsReadEnabled={false}
    theme="dark"
    onThemeChange={() => {}}
    {...props}
  />
);

const backBtn = () => document.querySelector('.nav-back-icon');

describe('ChapterIndex — back affordance names the real destination', () => {
  it('falls back to "Back to Books" when no backLabel is given (legacy call sites)', () => {
    setupGlobals();
    renderIndex();
    expect(backBtn().getAttribute('aria-label')).toBe('Back to Books');
    expect(backBtn().getAttribute('title')).toBe('← Books');
  });

  it('names the genre destination in tooltip + TalkBack label when backLabel is passed', () => {
    setupGlobals();
    renderIndex({ backLabel: 'Poetry & Wisdom' });
    expect(backBtn().getAttribute('aria-label')).toBe('Back to Poetry & Wisdom');
    expect(backBtn().getAttribute('title')).toBe('← Poetry & Wisdom');
  });
});

describe('ChapterIndex — current-chapter marker', () => {
  it('marks only the current chapter card with is-current', () => {
    setupGlobals();
    renderIndex({ currentChapter: 2 });
    const cards = document.querySelectorAll('.chapter-card-btn');
    expect(cards).toHaveLength(3);
    expect(cards[1].className).toContain('is-current');
    expect(cards[0].className).not.toContain('is-current');
    expect(cards[2].className).not.toContain('is-current');
  });

  it('cancels the delayed current-card scroll when navigation unmounts the index', () => {
    vi.useFakeTimers();
    setupGlobals();
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const view = renderIndex({ currentChapter: 2 });
    view.unmount();
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });
});

describe('ChapterIndex — "~N min" reading-time chip', () => {
  // 460 words at the 230-wpm default → 2 min; at a measured 100 wpm → 5 min.
  const words = (n) => Array.from({ length: n }, () => 'w').join(' ');
  const WORDY_BOOK = {
    ...BOOK,
    chapters: [{ num: 1, title: 'One', sections: [{ verses: [{ n: 1, text: words(460) }] }] }],
  };

  it('renders the chip from the chapter word count at the default pace', () => {
    setupGlobals();
    globalThis.countItemWords = countItemWords;
    globalThis.readingMinutes = readingMinutes;
    renderIndex({ book: WORDY_BOOK });
    expect(document.querySelector('.idx-min-chip').textContent).toBe('~2 min');
  });

  it('uses the measured pace when ReadingStatsStore has one', () => {
    setupGlobals();
    globalThis.countItemWords = countItemWords;
    globalThis.readingMinutes = readingMinutes;
    globalThis.ReadingStatsStore = { measuredWpm: () => 100 };
    renderIndex({ book: WORDY_BOOK });
    expect(document.querySelector('.idx-min-chip').textContent).toBe('~5 min');
  });

  it('renders no chip when the word counters are absent (guard path)', () => {
    setupGlobals();
    renderIndex({ book: WORDY_BOOK });
    expect(document.querySelector('.idx-min-chip')).toBeNull();
  });

  it('uses word-weighted frontier progress for percent and time left', () => {
    setupGlobals();
    globalThis.countItemWords = countItemWords;
    globalThis.readingMinutes = readingMinutes;
    globalThis.ReadingStatsStore = {
      measuredWpm: () => null,
      getProgress: () => ({ b: 4, c: [0, 1], w: 100, tw: 1000, t: 1 }),
    };
    renderIndex({ book: WORDY_BOOK, progressKeyFor: () => 'v1:psalms:1' });
    expect(document.querySelector('.idx-min-chip').textContent).toBe('10% · ~4 min left');
  });
});

/* C2-C [C7] / BACKLOG [29a] — the commentary-weight badge. The minute chip is
   contractually blind to study panels (word-count.js counts verse text only,
   by design), so a chapter carrying several times its own length in letter
   excerpts reads as an ordinary chapter from the index. This is the SECOND
   chip that says so, and only the study index passes the measured table. */
describe('ChapterIndex — commentary-weight chip', () => {
  const noteChips = () => [...document.querySelectorAll('.idx-note-chip')].map((c) => c.textContent);

  it('renders nothing when no table is passed (every Bible book index)', () => {
    setupGlobals();
    renderIndex();
    expect(noteChips()).toEqual([]);
  });

  it('states the measured ratio per chapter', () => {
    setupGlobals();
    renderIndex({ noteWeights: { 1: 0.49, 2: 0, 3: 8.43 } });
    // Chapter 2 carries no notes at all → silence, not "0.0× notes".
    expect(noteChips()).toEqual(['0.5× notes', '8.4× notes']);
  });

  it('explains itself in the tooltip rather than leaving a bare number', () => {
    setupGlobals();
    renderIndex({ noteWeights: { 1: 2.14 } });
    expect(document.querySelector('.idx-note-chip').getAttribute('title'))
      .toBe("Study commentary runs 2.1× the length of this chapter's verse text");
  });

  it('sits alongside the minute chip without displacing it', () => {
    setupGlobals();
    globalThis.countItemWords = countItemWords;
    globalThis.readingMinutes = readingMinutes;
    const WORDY = { ...BOOK, chapters: [{ num: 1, title: 'One', sections: [{ verses: [{ n: 1, text: Array.from({ length: 460 }, () => 'w').join(' ') }] }] }] };
    renderIndex({ book: WORDY, noteWeights: { 1: 3.58 } });
    const card = document.querySelector('.chapter-card-btn');
    expect(card.querySelector('.idx-min-chip').textContent).toBe('~2 min');
    expect(card.querySelector('.idx-note-chip').textContent).toBe('3.6× notes');
  });
});

describe('MATTHEW_NOTE_RATIO — the measured table', () => {
  it('covers all 28 chapters and reproduces the two extremes [29a] recorded', async () => {
    const { MATTHEW_NOTE_RATIO } = await import('../../utils/matthew-note-weight.js');
    expect(Object.keys(MATTHEW_NOTE_RATIO)).toHaveLength(28);
    expect(MATTHEW_NOTE_RATIO[2]).toBe(0);        // no votNotes at all
    expect(MATTHEW_NOTE_RATIO[24]).toBe(8.43);    // the heaviest chapter
    for (let n = 1; n <= 28; n++) expect(typeof MATTHEW_NOTE_RATIO[n]).toBe('number');
  });
});

describe('chapterIndexCurrentChapter — reading-dot decouple (route helper)', () => {
  it('returns the last-read chapter whenever the book is the active read', () => {
    // The reading-dot toggle (settings.showReadingDot) is deliberately NOT
    // an input: the index marker answers "where was I in this book", which
    // the nav-dot setting has no business hiding.
    expect(routes.chapterIndexCurrentChapter('psalms', 'psalms', { psalms: 23 })).toBe(23);
  });
  it('returns null for a book that is not the active read', () => {
    expect(routes.chapterIndexCurrentChapter('psalms', 'genesis', { psalms: 23 })).toBe(null);
  });
  it('returns null when nothing was read in the active book', () => {
    expect(routes.chapterIndexCurrentChapter('psalms', 'psalms', {})).toBe(null);
  });
});
