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

   navigation-tabs-1 (link-outs must not overwrite navOrigin): six index /
   viewer / web routes captured a self-referential navOrigin
   (`{ screen: <own screen> }`, no returnOrigin) immediately before handing
   off to navigateToLink. The index screens' own Back IS goNavOrigin, and
   goNotesIndex & friends had already snapshotted the reading position into
   navOrigin when the index opened — so the link-out silently destroyed the
   UX3 return-to-reading path and left Back pointing at the screen already
   showing (one dead press, then Home). navigateToLink owns the return path
   through its fromLetter entry, so the write was pure loss; the tests below
   pin its absence, and pin that journal-viewer's onOpenNotebook — a real
   cross-screen origin consumed by notes-index's Back — still writes one.

   The ROUTES factory only closes over the prop bag, so these tests build
   real routes with a stub bag and invoke the route fns — element creation
   is enough (no DOM render): onSelect/onBack/backLabel are plain props.
   Cross-bundle globals the touched routes reference (HistoryScreen,
   ChapterIndex, MATTHEW, COL_BY_KEY, COL_BY_INDEX_SC, and the link-out
   screens) are stubbed here.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_INDEX_SC() { return /** @type {any} */ (globalThis).COL_BY_INDEX_SC; } }; });

beforeEach(() => {
  /** @type {any} */ (globalThis).HistoryScreen = () => null;
  /** @type {any} */ (globalThis).ChapterIndex = () => null;
  /** @type {any} */ (globalThis).LibraryScreen = () => null;
  /** @type {any} */ (globalThis).HomeScreen = () => null;
  /** @type {any} */ (globalThis).MyProgressScreen = () => null;
  // The Listening Library went lazy in landing 24 — its routes render behind a
  // typeof guard, so the origin chain these cases walk needs them defined.
  /** @type {any} */ (globalThis).ListenRoot = () => null;
  /** @type {any} */ (globalThis).ListenSource = () => null;
  /** @type {any} */ (globalThis).ListenBible = () => null;
  /** @type {any} */ (globalThis).AudioSavedScreen = () => null;
  // The link-out surfaces under navigation-tabs-1. notes/links/bookmarks are
  // rendered unguarded by their routes, so they must exist as real globals.
  /** @type {any} */ (globalThis).NotesIndexScreen = () => null;
  /** @type {any} */ (globalThis).LinksScreen = () => null;
  /** @type {any} */ (globalThis).BookmarksScreen = () => null;
  /** @type {any} */ (globalThis).HighlightsScreen = () => null;
  /** @type {any} */ (globalThis).JournalViewerScreen = () => null;
  /** @type {any} */ (globalThis).ScriptureWebScreen = () => null;
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
  delete /** @type {any} */ (globalThis).LibraryScreen;
  delete /** @type {any} */ (globalThis).HomeScreen;
  delete /** @type {any} */ (globalThis).MyProgressScreen;
  delete /** @type {any} */ (globalThis).ListenRoot;
  delete /** @type {any} */ (globalThis).ListenSource;
  delete /** @type {any} */ (globalThis).ListenBible;
  delete /** @type {any} */ (globalThis).AudioSavedScreen;
  delete /** @type {any} */ (globalThis).NotesIndexScreen;
  delete /** @type {any} */ (globalThis).LinksScreen;
  delete /** @type {any} */ (globalThis).BookmarksScreen;
  delete /** @type {any} */ (globalThis).HighlightsScreen;
  delete /** @type {any} */ (globalThis).JournalViewerScreen;
  delete /** @type {any} */ (globalThis).ScriptureWebScreen;
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
    setNavOrigin: vi.fn(), navOrigin: null, pushFromLetter: vi.fn(),
    // index routes
    fromSearch: false, setFromSearch: vi.fn(),
    fromStudies: false, setFromStudies: vi.fn(),
    genreId: null, setSurpriseAnchor: vi.fn(),
    audioColKey: null, setAudioColKey: vi.fn(),
    goStudiesHome: vi.fn(), goScripturesHome: vi.fn(), goHome: vi.fn(),
    selectMatthewCh: vi.fn(), selectBibleCh: vi.fn(),
    activeReadKey: null, lastReadChapters: {},
    isRead: vi.fn(() => false),
    settings: {},
    // link-out routes (navigation-tabs-1)
    setNoteSheetTarget: vi.fn(),
    journalEntryId: 'j1', goJournalViewer: vi.fn(),
    backHint: null, tapThroughBack: vi.fn(),
    updateSetting: vi.fn(),
    ...overrides,
  });
  return { routes: buildScreenRoutes(props), props };
}

describe('Scripture Web is offered from Home again, and still reached by drilling', () => {
  /* Corbin, 2026-09-11: "add the scripture web button back to the home screen like it was
     before, as seen in the trailer." This is the case b3e3625a replaced (2026-09-05, "make
     users drill for it"), put back: Home opens it and captures its origin, so back from the
     web returns to Home. The Library entry and the deep link were never touched and stay. */
  it('the Home route opens Scripture Web from Home and back returns through the captured origin', () => {
    const { routes, props } = makeRoutes();
    // The entry warms bundle-f on the tap, as the Library's does — witnessed, because a warm call
    // that quietly stopped firing would only show as a "Loading…" frame nobody measures.
    window.__loadScreensF = vi.fn();
    try {
      routes.home().props.onScriptureWeb();
      expect(window.__loadScreensF).toHaveBeenCalledTimes(1);
    } finally { delete window.__loadScreensF; }
    expect(props.setNavOrigin).toHaveBeenCalledWith({ screen: 'home', returnOrigin: null });
    expect(props.setScreen).toHaveBeenCalledWith('scripture-web');

    const next = makeRoutes({ navOrigin: { screen: 'home', returnOrigin: null } });
    next.routes['scripture-web']().props.onBack();
    expect(next.props.goNavOrigin).toHaveBeenCalledTimes(1);
    expect(next.props.setScreen).not.toHaveBeenCalled();
  });

  it('the Library entry still opens it, and back returns through the origin', () => {
    const { routes, props } = makeRoutes();
    window.__loadScreensF = vi.fn();
    try {
      routes.library().props.onOpenScriptureWeb();
      expect(window.__loadScreensF).toHaveBeenCalledTimes(1);
    } finally { delete window.__loadScreensF; }
    expect(props.setNavOrigin).toHaveBeenCalledWith({ screen: 'library', returnOrigin: null });
    expect(props.setScreen).toHaveBeenCalledWith('scripture-web');

    const next = makeRoutes({ navOrigin: { screen: 'library', returnOrigin: null } });
    next.routes['scripture-web']().props.onBack();
    expect(next.props.goNavOrigin).toHaveBeenCalledTimes(1);
    expect(next.props.setScreen).not.toHaveBeenCalled();
  });

  it('the route itself still resolves, so deep links keep working', () => {
    const { routes } = makeRoutes();
    expect(typeof routes['scripture-web']).toBe('function');
    expect(routes['scripture-web']()).toBeTruthy();
  });
});

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

  it('study-chapter entry routes even before the lazy study corpus resolves', () => {
    const { routes, props } = makeRoutes({ getStudyById: vi.fn(() => null) });
    routes.history().props.onSelect({ type: 'study-chapter', studyId: 'gone', studyChapterId: 'ch1' });
    expect(props.navigateToLink).toHaveBeenCalledWith(
      { type: 'study-letter', studyId: 'gone', studyChapterId: 'ch1' },
      { sourceLetterTitle: 'History', silent: true },
    );
    expect(props.setGenreId).toHaveBeenCalledWith(null);
    expect(props.setActiveReadKey).toHaveBeenCalledWith('study:gone', expect.any(Function));
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

describe('screen-routes — the Listening Library returns to its actual origin', () => {
  it('Home → Listening Library carries Home as the visible and hardware-back origin', () => {
    const { routes, props } = makeRoutes();
    routes.home().props.onOpenAudio();
    expect(props.setNavOrigin).toHaveBeenCalledWith({ screen: 'home', returnOrigin: null });
    expect(props.setScreen).toHaveBeenCalledWith('audio-library');

    // The state update causes App to rebuild this factory on the next render;
    // label parity is asserted with that rebuilt nav state below.
    const audio = routes['audio-library']();
    expect(audio.props.onBack).toBe(props.goNavOrigin);
    expect(audio.props.backLabel).toBe('Home');
  });

  it('keeps origin-true back labels for legacy Library/Volumes origins', () => {
    const { routes, props } = makeRoutes({ navOrigin: { screen: 'library' } });
    const audio = routes['audio-library']();
    expect(audio.props.onBack).toBe(props.goNavOrigin);
    expect(audio.props.backLabel).toBe('Library');
    expect(makeRoutes({ navOrigin: { screen: 'volumes-home' } }).routes['audio-library']().props.backLabel).toBe('Volumes');
  });

  it('has no Milestones route, and neither Library nor My Progress offers one (removed 2026-10-05)', () => {
    const { routes } = makeRoutes({ navOrigin: { screen: 'library' } });
    expect(routes.milestones).toBeUndefined();
    expect(routes.library().props.onOpenMilestones).toBeUndefined();
    expect(routes['my-progress']().props.onOpenMilestones).toBeUndefined();
  });

  it('Listening Library Text opens with a silent one-shot return to the shelf (no pill, Back still returns)', () => {
    const { routes, props } = makeRoutes();
    routes['audio-library-saved']().props.onOpenTrack({ key: 'one:wide-path' });
    expect(props.pushFromLetter).toHaveBeenCalledWith({
      sourceScreen: 'audio-library-saved',
      sourceLetterTitle: 'Listening Library',
      destSnapshot: { screen: 'vot-one-letter', letterId: 'wide-path' },
      silent: true,
    });
    expect(props.setScreen).toHaveBeenCalledWith('vot-one-letter');
  });

  it('a Bible-edition track jumps to the PLAYING chapter through navigateToLink (2026-08-09 desk-title jump)', () => {
    const { routes, props } = makeRoutes();
    routes['audio-library-saved']().props.onOpenTrack({ key: 'bible-brm-kjv:jeremiah', partLabel: 'Chapter 46' });
    expect(props.navigateToLink).toHaveBeenCalledWith(
      { type: 'bible', bookId: 'jeremiah', chapter: 46 },
      { sourceLetterTitle: 'Listening Library', silent: true }
    );
    // The letter machinery must not fire for a Bible destination.
    expect(props.pushFromLetter).not.toHaveBeenCalled();
    expect(props.setLetterId).not.toHaveBeenCalled();
  });

  it('an unlabeled Bible part lands on chapter 1', () => {
    const { routes, props } = makeRoutes();
    routes['audio-library-saved']().props.onOpenTrack({ key: 'bible-wop-nkjv:matthew', partLabel: null });
    expect(props.navigateToLink).toHaveBeenCalledWith(
      { type: 'bible', bookId: 'matthew', chapter: 1 },
      { sourceLetterTitle: 'Listening Library', silent: true }
    );
  });

  it('Listen root → a source chains the root (and ITS origin) so back unwinds level by level (rv1)', () => {
    const rootOrigin = { screen: 'library', returnOrigin: null };
    const { routes, props } = makeRoutes({ navOrigin: rootOrigin });
    routes['audio-library']().props.onOpenSource('one');
    expect(props.setAudioColKey).toHaveBeenCalledWith('one');
    expect(props.setNavOrigin).toHaveBeenCalledWith({ screen: 'audio-library', returnOrigin: rootOrigin });
    expect(props.setScreen).toHaveBeenCalledWith('audio-library-collection');

    const { routes: nextRoutes, props: nextProps } = makeRoutes({ audioColKey: 'one', navOrigin: { screen: 'audio-library', returnOrigin: rootOrigin } });
    const source = nextRoutes['audio-library-collection']();
    expect(source.props.sourceKey).toBe('one');
    expect(source.props.onBack).toBe(nextProps.goNavOrigin);
    expect(source.props.backLabel).toBe('Listen');
  });

  it('a voice and a study open the same Source screen; a Bible edition keeps the collection screen (rv1)', () => {
    const { routes, props } = makeRoutes();
    routes['audio-library']().props.onOpenSource('voice:B');
    expect(props.setAudioColKey).toHaveBeenCalledWith('voice:B');
    expect(makeRoutes({ audioColKey: 'study:purity' }).routes['audio-library-collection']().props.sourceKey).toBe('study:purity');
    expect(makeRoutes({ audioColKey: 'bible-web' }).routes['audio-library-collection']().props.volKey).toBe('bible-web');
  });

  it('a Bible edition opens ListenBible once bundle-h has it (rv1)', () => {
    /** @type {any} */ (globalThis).ListenBible = () => null;
    try {
      const view = makeRoutes({ audioColKey: 'bible-web' }).routes['audio-library-collection']();
      expect(view.type).toBe(/** @type {any} */ (globalThis).ListenBible);
      expect(view.props.volKey).toBe('bible-web');
    } finally { delete /** @type {any} */ (globalThis).ListenBible; }
  });

  it('a stale tab on The Volumes lands on the Listen root (rv1)', () => {
    const { routes } = makeRoutes();
    expect(typeof routes['audio-library-volumes']().props.onOpenSource).toBe('function');
  });

  it('hub → saved shelf takes the same chain, and its Text taps name their own screen', () => {
    const { routes, props } = makeRoutes({ navOrigin: { screen: 'volumes-home' } });
    routes['audio-library']().props.onOpenSaved();
    expect(props.setNavOrigin).toHaveBeenCalledWith({ screen: 'audio-library', returnOrigin: { screen: 'volumes-home' } });
    expect(props.setScreen).toHaveBeenCalledWith('audio-library-saved');

    const { routes: nextRoutes, props: nextProps } = makeRoutes();
    const saved = nextRoutes['audio-library-saved']();
    expect(saved.props.onBack).toBe(nextProps.goNavOrigin);
    expect(saved.props.backLabel).toBe('Listening Library');
    saved.props.onOpenTrack({ key: 'one:wide-path' });
    expect(nextProps.pushFromLetter).toHaveBeenCalledWith({
      sourceScreen: 'audio-library-saved',
      sourceLetterTitle: 'Listening Library',
      destSnapshot: { screen: 'vot-one-letter', letterId: 'wide-path' },
      silent: true,
    });

  });
});

describe('screen-routes — link-outs never overwrite the captured navOrigin (navigation-tabs-1)', () => {
  // The origin goNotesIndex & friends snapshotted when the index opened: the
  // reading screen the user must land back on after the destination's Back.
  const READING_ORIGIN = { screen: 'vot-one-letter', letterId: 'wide-path' };
  const ENDPOINT = { screen: 'vot-letter', letterId: 'the-narrow-way' };

  /** @type {Array<[string, string, string]>} screen, link-out prop, default pill title */
  const LINK_OUTS = [
    ['highlights-index', 'onNavigateToSource', 'My Highlights'],
    ['notes-index', 'onNavigateToSource', 'My Notes'],
    ['links-index', 'onNavigateToSource', 'My Links'],
    ['links-index', 'onNavigateToTarget', 'My Links'],
    ['bookmarks-index', 'onNavigateToSource', 'My Bookmarks'],
    ['journal-viewer', 'onNavigateToLink', 'My Journal'],
    ['scripture-web', 'navigateToLink', 'The Scripture Web'],
  ];

  for (const [screenName, propName, title] of LINK_OUTS) {
    it(`${screenName} ${propName} delegates to navigateToLink and leaves navOrigin alone`, () => {
      const { routes, props } = makeRoutes({ navOrigin: READING_ORIGIN });
      routes[screenName]().props[propName](ENDPOINT);
      expect(props.navigateToLink).toHaveBeenCalledWith(ENDPOINT, { sourceLetterTitle: title });
      // navigateToLink's fromLetter entry owns the return path; writing a
      // self-referential origin here only destroys the reading snapshot.
      expect(props.setNavOrigin).not.toHaveBeenCalled();
    });

    it(`${screenName} ${propName} forwards an explicit meta unchanged`, () => {
      const { routes, props } = makeRoutes({ navOrigin: READING_ORIGIN });
      const meta = { sourceLetterTitle: 'Some Letter', silent: true };
      routes[screenName]().props[propName](ENDPOINT, meta);
      expect(props.navigateToLink).toHaveBeenCalledWith(ENDPOINT, meta);
      expect(props.setNavOrigin).not.toHaveBeenCalled();
    });

    it(`${screenName} ${propName} is a no-op for a missing endpoint`, () => {
      const { routes, props } = makeRoutes({ navOrigin: READING_ORIGIN });
      routes[screenName]().props[propName](null);
      expect(props.navigateToLink).not.toHaveBeenCalled();
      expect(props.setNavOrigin).not.toHaveBeenCalled();
    });
  }

  it('journal-viewer → notebook STILL captures its origin (a real cross-screen hop)', () => {
    // The keeper: notes-index's own Back IS goNavOrigin, so this write is the
    // thing that gets consumed. Deleting it would strand the user in Notes.
    const handoff = { set: vi.fn(), clear: vi.fn(), get: vi.fn() };
    const prev = /** @type {any} */ (window).navHandoff;
    /** @type {any} */ (window).navHandoff = handoff;
    try {
      const { routes, props } = makeRoutes({ navOrigin: READING_ORIGIN });
      routes['journal-viewer']().props.onOpenNotebook('nb1', 'Morning Pages');
      expect(handoff.set).toHaveBeenCalledWith('notesReturnCtx', {
        tab: 'notebooks', drilledNbId: 'nb1', backPill: { title: 'Morning Pages' },
      });
      expect(props.setNavOrigin).toHaveBeenCalledWith({ screen: 'journal-viewer' });
      expect(props.setScreen).toHaveBeenCalledWith('notes-index');
    } finally {
      /** @type {any} */ (window).navHandoff = prev;
    }
  });
});
