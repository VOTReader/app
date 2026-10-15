// @ts-nocheck
/* A Bible route whose book does not resolve renders a way out, never nothing
   (sweep 2026-10-14, v109). The tab persists bookId, and _validateTabState only
   checks that it is truthy: it cannot check it against the books, because the
   Bible corpus is lazy and does not exist at boot. So a stale or renamed bookId
   (or a deep link to one) reached bible-idx / bible-ch with the corpus loaded and
   `book` undefined, and both routes returned null: no header, no nav, nothing to
   tap, and a reload landed on the same blank screen. They now say so and go back
   to the Scriptures. Same shape as _deadLetter and _missingChapter. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { buildScreenRoutes } from './screen-routes.jsx';

let navProps;
beforeEach(() => {
  navProps = null;
  globalThis.ScreenLayout = ({ navChildren, children }) => <div>{navChildren}{children}</div>;
  globalThis.LibraryNav = (p) => { navProps = p; return null; };
});
afterEach(() => {
  cleanup();
  delete globalThis.ScreenLayout;
  delete globalThis.LibraryNav;
  delete window.__bibleCorpus;
  delete window.__loadBibleCorpus;
  vi.restoreAllMocks();
});

function makeRoutes(extra) {
  const props = {
    settings: {},
    boundaryConfig: vi.fn(() => ({})),
    readHistory: [],
    readItems: {},
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(),
    getStudyById: vi.fn(() => null),
    studyReadKey: (slug) => 'study:' + slug,
    clearHistory: vi.fn(), pruneHistoryDay: vi.fn(),
    theme: 'dark', setTheme: vi.fn(),
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    setNavOrigin: vi.fn(), navOrigin: null, pushFromLetter: vi.fn(),
    fromSearch: false, setFromSearch: vi.fn(),
    fromStudies: false, setFromStudies: vi.fn(),
    genreId: null, setSurpriseAnchor: vi.fn(),
    audioColKey: null, setAudioColKey: vi.fn(),
    goStudiesHome: vi.fn(), goScripturesHome: vi.fn(), goHome: vi.fn(), goBibleIdx: vi.fn(),
    selectMatthewCh: vi.fn(), selectBibleCh: vi.fn(),
    activeReadKey: null, lastReadChapters: {},
    isRead: vi.fn(() => false),
    setFromWtlb: vi.fn(),
    gardenPage: 1, setGardenPage: vi.fn(),
    ...extra,
  };
  return { routes: buildScreenRoutes(props), props };
}

describe.each(['bible-idx', 'bible-ch'])('%s: a persisted bookId that no longer resolves (v109)', (route) => {
  it('with the corpus loaded, renders a message and a way back to the Scriptures, not null', () => {
    window.__bibleCorpus = { loaded: true, error: false };
    const { routes, props } = makeRoutes({ bookId: 'notabook', book: undefined, chapterNum: 1, chapter: null });
    const el = routes[route]();
    expect(el).not.toBeNull();
    render(el);
    expect(screen.getByText(/This book is no longer available/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Back to Scriptures/ }));
    expect(props.goScripturesHome).toHaveBeenCalledTimes(1);
  });

  it('the header back arrow goes to the Scriptures too', () => {
    window.__bibleCorpus = { loaded: true, error: false };
    const { routes, props } = makeRoutes({ bookId: 'notabook', book: undefined, chapterNum: 1, chapter: null });
    render(routes[route]());
    expect(navProps).not.toBeNull();
    expect(navProps.backLabel).toBe('Scriptures');
    navProps.onBack();
    expect(props.goScripturesHome).toHaveBeenCalledTimes(1);
  });

  it('cannot fail: with no ScreenLayout or LibraryNav global it still renders the way back', () => {
    delete globalThis.ScreenLayout;
    delete globalThis.LibraryNav;
    window.__bibleCorpus = { loaded: true, error: false };
    const { routes, props } = makeRoutes({ bookId: 'notabook', book: undefined, chapterNum: 1, chapter: null });
    render(routes[route]());
    fireEvent.click(screen.getByRole('button', { name: /Back to Scriptures/ }));
    expect(props.goScripturesHome).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: while the Bible corpus is still loading, the loading view shows, not the message', () => {
    window.__bibleCorpus = { loaded: false, error: false };
    window.__loadBibleCorpus = vi.fn();
    const { routes } = makeRoutes({ bookId: 'john', book: undefined, chapterNum: 1, chapter: null });
    render(routes[route]());
    expect(screen.queryByText(/no longer available/)).toBeNull();
    expect(screen.getByText(/Loading Bible/)).toBeTruthy();
  });
});
