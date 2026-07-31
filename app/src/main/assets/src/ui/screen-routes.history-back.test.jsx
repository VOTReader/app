/* Wave 0 — screen-routes navigation/back tests.
   ──────────────────────────────────────────────
   P1-12 (History return path): History's onSelect was the only content
   entry point that set nav state directly with no origin capture, so
   Back from the entry never returned to History. It now routes through
   navigateToLink (the same fromLetter-stack origin capture the Library
   index screens use) with sourceLetterTitle 'History', keeping the
   setActiveReadKey dwell-gate bookkeeping navigateToLink doesn't do.

   Phase 3 (back-pill sweep): History is the ONE link surface that must NOT
   raise a "‹ Back to …" pill, so the meta now carries `silent: true`. The
   back-stack entry is still pushed and Back still unwinds to History —
   only the visible pill is suppressed (useFromLetterStack's backHint
   returns null for a silent top, while backActive stays true). Removing
   the entry outright would resurrect the filed P1-12 bug.

   Sticky-genre fix: entering content from History or selecting a search
   result is a non-genre entry — genreId must be cleared so a later
   index-level Back can't misroute into a genre visited in an earlier
   session leg.

   matthew-idx back parity: matthew-idx's Back skipped its parent hub
   (went Home while bible-idx goes to genre/scriptures) and neither index
   consumed fromSearch. Both ChapterIndex onBack props + their backLabel
   tooltips now mirror the hardware-back branches in use-android-back.js.

   The ROUTES factory only closes over the prop bag, so these tests build
   real routes with a stub bag and invoke the route fns — element creation
   is enough (no DOM render): onSelect/onBack/backLabel are plain props.
   Cross-bundle globals the touched routes reference (HistoryScreen,
   ChapterIndex, MATTHEW, COL_BY_KEY, COL_BY_INDEX_SC) are stubbed here.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

beforeEach(() => {
  /** @type {any} */ (globalThis).HistoryScreen = () => null;
  /** @type {any} */ (globalThis).ChapterIndex = () => null;
  /** @type {any} */ (globalThis).MATTHEW = { title: 'Matthew', chapters: [{ num: 1 }] };
  /** @type {any} */ (globalThis).COL_BY_INDEX_SC = new Map([
    ['vot-one-index', { volKey: 'one', letterScreen: 'vot-one-letter' }],
  ]);
  /** @type {any} */ (globalThis).COL_BY_KEY = new Map([
    ['one', { volKey: 'one', letterScreen: 'vot-one-letter' }],
    ['two', { volKey: 'two', letterScreen: 'vot-letter' }],
  ]);
  // SCRIPTURE_GENRES deliberately left undefined — the routes guard it
  // with typeof, so backLabel falls back to 'Scriptures' here.
});
afterEach(() => {
  delete /** @type {any} */ (globalThis).HistoryScreen;
  delete /** @type {any} */ (globalThis).ChapterIndex;
  delete /** @type {any} */ (globalThis).MATTHEW;
  delete /** @type {any} */ (globalThis).COL_BY_INDEX_SC;
  delete /** @type {any} */ (globalThis).COL_BY_KEY;
  vi.restoreAllMocks();
});

/** Stub prop bag — only what the history / matthew-idx / bible-idx routes touch. */
function makeRoutes(overrides = {}) {
  // Partial stub cast: buildScreenRoutes' inferred prop type demands the
  // full 100+-key bag; the routes under test touch only these keys.
  const props = /** @type {any} */ ({
    // history route
    readHistory: [],
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(),
    getStudyById: vi.fn(() => ({ slug: 'purity' })),
    studyReadKey: (slug) => 'study:' + slug,
    setActiveReadKey: vi.fn(),
    setLastReadChapters: vi.fn(), setLastReadForVol: vi.fn(),
    setGenreId: vi.fn(),
    navigateToLink: vi.fn(),
    clearHistory: vi.fn(), pruneHistoryDay: vi.fn(),
    theme: 'dark', setTheme: vi.fn(),
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    // index routes
    fromSearch: false, setFromSearch: vi.fn(),
    fromStudies: false, setFromStudies: vi.fn(),
    genreId: null, setSurpriseAnchor: vi.fn(),
    goStudiesHome: vi.fn(), goScripturesHome: vi.fn(), goHome: vi.fn(),
    selectMatthewCh: vi.fn(), selectBibleCh: vi.fn(),
    activeReadKey: null, lastReadChapters: {},
    isRead: vi.fn(() => false),
    settings: {},
    ...overrides,
  });
  return { routes: buildScreenRoutes(props), props };
}

describe('screen-routes — P1-12 History onSelect routes through navigateToLink', () => {
  it('chapter entry → { type: "bible" } endpoint with the History back-pill title', () => {
    const { routes, props } = makeRoutes();
    routes.history().props.onSelect({ type: 'chapter', bookId: 'john', chapterNum: 3 });
    expect(props.navigateToLink).toHaveBeenCalledWith(
      { type: 'bible', bookId: 'john', chapter: 3 },
      { sourceLetterTitle: 'History', silent: true },
    );
    // The dwell-gate / last-read bookkeeping stays (navigateToLink doesn't do it).
    expect(props.setActiveReadKey).toHaveBeenCalledWith('john', expect.any(Function));
    // Routing is delegated — the route no longer setScreens directly.
    expect(props.setScreen).not.toHaveBeenCalled();
  });

  it('matthew chapter entry → { type: "bible", bookId: "matthew" } endpoint', () => {
    const { routes, props } = makeRoutes();
    routes.history().props.onSelect({ type: 'chapter', bookId: 'matthew', chapterNum: 5 });
    expect(props.navigateToLink).toHaveBeenCalledWith(
      { type: 'bible', bookId: 'matthew', chapter: 5 },
      { sourceLetterTitle: 'History', silent: true },
    );
  });

  it('letter entry → generic-screen endpoint resolved from the volume fallback', () => {
    const { routes, props } = makeRoutes();
    routes.history().props.onSelect({ type: 'letter', letterId: 'wide-path', volume: 1 });
    expect(props.navigateToLink).toHaveBeenCalledWith(
      { screen: 'vot-one-letter', letterId: 'wide-path' },
      { sourceLetterTitle: 'History', silent: true },
    );
    expect(props.setActiveReadKey).toHaveBeenCalledWith('vol:one', expect.any(Function));
  });

  it('letter entry prefers volumeScreen over the volume-number fallback', () => {
    const { routes, props } = makeRoutes();
    routes.history().props.onSelect({ type: 'letter', letterId: 'wide-path', volumeScreen: 'vot-one-index', volume: 2 });
    expect(props.navigateToLink).toHaveBeenCalledWith(
      { screen: 'vot-one-letter', letterId: 'wide-path' },
      { sourceLetterTitle: 'History', silent: true },
    );
  });

  it('study-chapter entry → { type: "study-letter" } endpoint', () => {
    const { routes, props } = makeRoutes();
    routes.history().props.onSelect({ type: 'study-chapter', studyId: 'purity', studyChapterId: 'ch1' });
    expect(props.navigateToLink).toHaveBeenCalledWith(
      { type: 'study-letter', studyId: 'purity', studyChapterId: 'ch1' },
      { sourceLetterTitle: 'History', silent: true },
    );
    expect(props.setActiveReadKey).toHaveBeenCalledWith('study:purity', expect.any(Function));
  });

  it('study-chapter entry with an unknown study no-ops (guard preserved)', () => {
    const { routes, props } = makeRoutes({ getStudyById: vi.fn(() => null) });
    routes.history().props.onSelect({ type: 'study-chapter', studyId: 'gone', studyChapterId: 'ch1' });
    expect(props.navigateToLink).not.toHaveBeenCalled();
    expect(props.setGenreId).not.toHaveBeenCalled();
  });

  it('every entry clears genreId (History is a non-genre entry)', () => {
    const { routes, props } = makeRoutes();
    routes.history().props.onSelect({ type: 'chapter', bookId: 'john', chapterNum: 3 });
    expect(props.setGenreId).toHaveBeenCalledWith(null);
  });
});

describe('screen-routes — matthew-idx onBack mirrors hardware-back (hub parity + fromSearch)', () => {
  const idxProps = (overrides) => {
    const { routes, props } = makeRoutes(overrides);
    const el = routes['matthew-idx']();
    return { el, props };
  };

  it('plain back goes to Scriptures (its parent hub), not Home', () => {
    const { el, props } = idxProps();
    el.props.onBack();
    expect(props.goScripturesHome).toHaveBeenCalledTimes(1);
    expect(props.goHome).not.toHaveBeenCalled();
    expect(el.props.backLabel).toBe('Scriptures');
  });

  it('back with an active genre returns to scripture-genre', () => {
    const { el, props } = idxProps({ genreId: 'gospels' });
    el.props.onBack();
    expect(props.setScreen).toHaveBeenCalledWith('scripture-genre');
    expect(props.goScripturesHome).not.toHaveBeenCalled();
  });

  it('back from a study still goes to Studies (regression guard)', () => {
    const { el, props } = idxProps({ fromStudies: true });
    el.props.onBack();
    expect(props.setFromStudies).toHaveBeenCalledWith(false);
    expect(props.goStudiesHome).toHaveBeenCalledTimes(1);
    expect(el.props.backLabel).toBe('Studies');
  });

  it('back with fromSearch armed returns to search and consumes the flag', () => {
    const { el, props } = idxProps({ fromSearch: true, genreId: 'gospels' });
    el.props.onBack();
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('search');
    expect(props.setScreen).not.toHaveBeenCalledWith('scripture-genre');
    expect(el.props.backLabel).toBe('Search');
  });
});

describe('screen-routes — bible-idx onBack consumes fromSearch', () => {
  const idxProps = (overrides) => {
    const { routes, props } = makeRoutes({ book: { title: 'John', chapters: [{ num: 1 }] }, ...overrides });
    const el = routes['bible-idx']();
    return { el, props };
  };

  it('back with fromSearch armed returns to search (not the genre hub)', () => {
    const { el, props } = idxProps({ fromSearch: true, genreId: 'the-law' });
    el.props.onBack();
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('search');
    expect(props.setScreen).not.toHaveBeenCalledWith('scripture-genre');
    expect(el.props.backLabel).toBe('Search');
  });

  it('back with an active genre (no fromSearch) still returns to scripture-genre', () => {
    const { el, props } = idxProps({ genreId: 'the-law' });
    el.props.onBack();
    expect(props.setScreen).toHaveBeenCalledWith('scripture-genre');
    // SCRIPTURE_GENRES is undefined in this harness → generic label fallback.
    expect(el.props.backLabel).toBe('Scriptures');
  });

  it('plain back goes to Scriptures (regression guard)', () => {
    const { el, props } = idxProps();
    el.props.onBack();
    expect(props.goScripturesHome).toHaveBeenCalledTimes(1);
    expect(el.props.backLabel).toBe('Scriptures');
  });
});
