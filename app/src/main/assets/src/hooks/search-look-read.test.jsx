// @ts-nocheck — stub cross-bundle globals, as use-reading-position-nav.test.js
/* A letter found by search and then read counts (search200 UX B1 review).
   ──────────────────────────────────────────────────────────────────────
   B1 made the place a search hit opens a look: no resume point, and the routes
   switch its read tracker off (markAsReadEnabled false, so useMarkAsRead never
   binds window.__onReadingComplete, the bridge the tracker fires on completion).
   That held for the whole visit: a reader who found a letter by search and read
   all of it got no completion mark, no frontier and no Continue-reading point,
   while the same read reached from the library counted.

   The look now ends when the reader reads: their own scroll, or a stay. Then the
   tracker and the arm run as they do for any other read. This drives the real
   pieces together: useReadingPositionNav (the landing, the arm), isSearchLook
   (the routes' gate, screen-routes.jsx) and useMarkAsRead (the bridge). The
   tracker's completion is the bridge call it makes (use-read-tracker.js). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { useReadingPositionNav } from './use-reading-position-nav.js';
import { useMarkAsRead } from './useMarkAsRead.js';
import { isSearchLook, SEARCH_LOOK_MS } from '../utils/search-visit.js';

vi.mock('../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_KEY() { return /** @type {any} */ (globalThis).COL_BY_KEY; }, get COL_BY_LETTER_SC() { return /** @type {any} */ (globalThis).COL_BY_LETTER_SC; } }; });

const PLACE = { screen: 'vot-letter', bookId: null, chapterNum: null, letterId: 'grafted-in', studyId: null, studyChapterId: null };
const DONE = { words: 900, activeMs: 95000, coverage: 0.96 };

let prev;
beforeEach(() => {
  prev = { COL_BY_KEY: window.COL_BY_KEY, COL_BY_LETTER_SC: window.COL_BY_LETTER_SC };
  window.COL_BY_KEY = new Map([['two', { volKey: 'two', letterScreen: 'vot-letter' }]]);
  window.COL_BY_LETTER_SC = new Map([['vot-letter', { volKey: 'two', letterScreen: 'vot-letter' }]]);
  window.__onReadingComplete = null;
});
afterEach(() => {
  window.COL_BY_KEY = prev.COL_BY_KEY;
  window.COL_BY_LETTER_SC = prev.COL_BY_LETTER_SC;
  window.__onReadingComplete = null;
  vi.useRealTimers();
});

/** The letter a hit opened: App's landing and arm, the routes' tracker gate, the view's bridge. */
function Reader({ app, onMarkRead }) {
  const field = React.useState('vot-letter:grafted-in');
  const { searchLanding } = useReadingPositionNav({
    ...app, ...PLACE, fromSearch: true,
    tabField: (key) => (key === 'searchLanding' ? field : [null, null]),
  });
  const look = isSearchLook({ ...PLACE, fromSearch: true, searchLanding });
  useMarkAsRead(look ? false : true, onMarkRead, 'v1:volume-two:grafted-in');
  return <div className="screen-scroll" data-testid="page" />;
}

const mount = () => {
  const app = {
    activeReadKey: null, lastReadLetterMap: {}, lastReadChapters: {},
    setLetterId: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setScreen: vi.fn(), setGenreId: vi.fn(),
    setActiveReadKey: vi.fn(), setLastReadLetterMap: vi.fn(), setLastReadChapters: vi.fn(),
    getStudyById: () => null, selectStudy: vi.fn(), selectStudyChapter: vi.fn(),
  };
  const onMarkRead = vi.fn();
  const view = render(<Reader app={app} onMarkRead={onMarkRead} />);
  return { ...view, app, onMarkRead, page: view.getByTestId('page') };
};
/** The tracker's completion: it fires the bridge if a reading view holds it. */
const complete = () => act(() => { if (window.__onReadingComplete) window.__onReadingComplete(DONE); });

describe('a letter found by search and then read counts', () => {
  it('scrolled by the reader, then finished: a read and the resume point', () => {
    const { app, onMarkRead, page } = mount();
    expect(window.__onReadingComplete, 'the look: the tracker is off').toBe(null);
    act(() => { fireEvent.touchMove(page); fireEvent.scroll(page); });
    complete();
    expect(onMarkRead).toHaveBeenCalledWith(DONE);
    expect(app.setActiveReadKey.mock.calls.map((c) => c[0])).toEqual(['vol:two']);
  });

  it('a page that fits the screen is read without a scroll: the stay, then finished', () => {
    vi.useFakeTimers();
    const { app, onMarkRead } = mount();
    act(() => { vi.advanceTimersByTime(SEARCH_LOOK_MS); });
    complete();
    expect(onMarkRead).toHaveBeenCalledWith(DONE);
    expect(app.setActiveReadKey).toHaveBeenCalledTimes(1);
  });

  it('a tap in and out still records nothing', () => {
    vi.useFakeTimers();
    const { app, onMarkRead, page, unmount } = mount();
    act(() => { fireEvent.scroll(page); });                         // the jump to the hit
    act(() => { vi.advanceTimersByTime(SEARCH_LOOK_MS - 2000); });
    complete();
    unmount();
    expect(onMarkRead).not.toHaveBeenCalled();
    expect(app.setActiveReadKey).not.toHaveBeenCalled();
  });
});
