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
