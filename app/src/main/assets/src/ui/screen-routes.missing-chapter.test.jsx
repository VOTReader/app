// @ts-nocheck
/* A Bible chapter the book does not have renders a way out, never nothing
   (improvement sweep 2026-09-22 REPORT #8, v07-01). "John 30:1" in Search -
   and "Jude 3" before the parser read it as a verse - set a chapter the book
   does not have, and with the corpus loaded the bible-ch route returned null:
   no header, no nav, nothing to tap but the system Back. It now says what the
   book holds and opens it: the chapter list, or the one chapter of a
   one-chapter book. Same shape as _deadLetter (screen-routes.dead-letter.test). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { buildScreenRoutes } from './screen-routes.jsx';

const JOHN = { id: 'john', title: 'John', chapters: Array.from({ length: 21 }, (_, i) => ({ num: i + 1, sections: [] })) };
const JUDE = { id: 'jude', title: 'Jude', chapters: [{ num: 1, sections: [] }] };

beforeEach(() => {
  globalThis.ScreenLayout = ({ children }) => <div>{children}</div>;
  globalThis.LibraryNav = () => null;
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

describe('bible-ch: a chapter the book does not have (v07-01)', () => {
  it('"John 30": says the book has 21 chapters and opens its chapter list', () => {
    window.__bibleCorpus = { loaded: true, error: false };
    const { routes, props } = makeRoutes({ bookId: 'john', book: JOHN, chapterNum: 30, chapter: undefined });
    const el = routes['bible-ch']();
    expect(el).not.toBeNull();
    render(el);
    expect(screen.getByText(/John has 21 chapters/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open John/ }));
    expect(props.goBibleIdx).toHaveBeenCalled();
  });

  it('a one-chapter book opens its one chapter', () => {
    window.__bibleCorpus = { loaded: true, error: false };
    const { routes, props } = makeRoutes({ bookId: 'jude', book: JUDE, chapterNum: 3, chapter: undefined });
    render(routes['bible-ch']());
    expect(screen.getByText(/Jude has one chapter/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open Jude/ }));
    expect(props.selectBibleCh).toHaveBeenCalledWith(1);
  });

  it('CONTROL: while the Bible corpus is still loading, the loading view shows, not the message', () => {
    window.__bibleCorpus = { loaded: false, error: false };
    window.__loadBibleCorpus = vi.fn();
    const { routes } = makeRoutes({ bookId: 'john', book: null, chapterNum: 30, chapter: undefined });
    render(routes['bible-ch']());
    expect(screen.queryByText(/has 21 chapters/)).toBeNull();
    expect(screen.getByText(/Loading Bible/)).toBeTruthy();
  });
});

describe('matthew-ch: a chapter Matthew does not have (mw17 s17.1)', () => {
  afterEach(() => { delete globalThis.MATTHEW; });
  it('a stale tab on "Matthew 40" gets chrome and a way into Matthew, never a blank screen', () => {
    globalThis.MATTHEW = { id: 'matthew', title: 'Matthew', chapters: Array.from({ length: 28 }, (_, i) => ({ num: i + 1 })) };
    const goMatthewIdx = vi.fn();
    const { routes } = makeRoutes({ bookId: 'matthew', book: globalThis.MATTHEW, chapterNum: 40, chapter: undefined, goMatthewIdx });
    const el = routes['matthew-ch']();
    expect(el).not.toBeNull();
    render(el);
    expect(screen.getByText(/Matthew has 28 chapters, so there is no chapter 40/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open Matthew/ }));
    expect(goMatthewIdx).toHaveBeenCalled();
  });
});

describe('corpus loading and error views (mw17 s17.2)', () => {
  it('loading has chrome and is a polite status; a failed load is an alert with Try again, inside chrome', () => {
    const nav = vi.fn(() => <span data-testid="nav" />);
    globalThis.LibraryNav = nav;
    globalThis.ScreenLayout = ({ children, navChildren }) => <div data-testid="layout">{navChildren}{children}</div>;
    window.__bibleCorpus = { loaded: false, error: false };
    window.__loadBibleCorpus = vi.fn();
    const { routes } = makeRoutes({ bookId: 'john', book: null, chapterNum: 3, chapter: undefined });
    render(routes['bible-ch']());
    expect(screen.getByTestId('layout')).toBeTruthy();
    expect(screen.getByTestId('nav')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Loading Bible/);
    cleanup();
    window.__bibleCorpus = { loaded: false, error: true };
    render(makeRoutes({ bookId: 'john', book: null, chapterNum: 3, chapter: undefined }).routes['bible-ch']());
    expect(screen.getByTestId('nav')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn’t load this section/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(window.__loadBibleCorpus).toHaveBeenCalled();
  });
});
