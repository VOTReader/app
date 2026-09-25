// @ts-nocheck — a stub prop bag and stub cross-bundle globals, as screen-routes.history-back.test.jsx
/* Browsing starts a new trail: stale "came from" flags no longer steer Back (v01-04, v01-05).
   ──────────────────────────────────────────────────────────────────
   Improvement sweep 2026-09-22, findings v01-reading-04 and -05. The letter screens' Back
   branch reads fromSurprise first and fromSearch next. Both were cleared only by the Back that
   consumed them (and fromSurprise not even by Home), so:
     - Search -> open a letter -> Library / Volumes -> a volume -> a different letter -> Back
       went to the SEARCH screen, not the volume index (v01-05);
     - Surprise -> a letter -> its index button -> another letter -> Back went HOME (v01-04).
   A letter picked from a volume index, a volume opened from the Volumes screen, a book or study
   opened from the Scriptures / genre / Studies screens and a chapter picked from a study index
   are a new trail: both flags are cleared there (search lands on none of those screens, so no
   search chain is cut short). A chapter picked from a Bible or Matthew index leaves the
   Surprise but keeps fromSearch: a book-level search result lands on those two indexes, and
   their Back still returns to the search. Home and a search result clear fromSurprise too -
   use-nav.test.js and use-search.test.js pin those. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

const G = /** @type {any} */ (globalThis);
const STUBS = {
  ScreenLayout: ({ children }) => children,
  VolumeLetterIndex: () => null,
  VolumesHome: () => null,
  ScripturesHome: () => null,
  ScriptureGenre: () => null,
  StudiesHome: () => null,
  ChapterIndex: () => null,
  BibleStudyIndex: () => null,
  MATTHEW: { id: 'matthew', chapters: [] },
  LibraryNav: () => null,
  HomeBtn: () => null,
  NavButtons: () => null,
  colLetterArr: () => [],
  colPreface: () => null,
  COL_BY_KEY: new Map([['two', { volKey: 'two', readKey: 'v2', letterScreen: 'vot-letter', label: 'Volume Two' }]]),
  AudioPlayer: { collectionHasAudio: () => false, sectionsFor: () => null, hasAudio: () => false },
};

beforeEach(() => {
  for (const [k, v] of Object.entries(STUBS)) G[k] = v;
  window.__votCorpus = { loaded: true, subscribe: () => () => {}, getVersion: () => 1 };
});
afterEach(() => {
  for (const k of Object.keys(STUBS)) delete G[k];
  delete window.__votCorpus;
  vi.restoreAllMocks();
});

function makeRoutes(overrides = {}) {
  const props = {
    setScreen: vi.fn(), setLetterId: vi.fn(), setActiveReadKey: vi.fn(), setLastReadForVol: vi.fn(),
    fromSearch: true, setFromSearch: vi.fn(),
    setFromSurprise: vi.fn(),
    settings: {}, activeReadKey: null, lastReadLetterMap: {}, readItems: {},
    isRead: () => false, getReadKey: (rk, id) => `${rk}:${id}`,
    handleVolumeSelect: vi.fn(),
    goHome: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(), goNavOrigin: vi.fn(),
    goVolumesHome: vi.fn(), goColIdx: vi.fn(),
    theme: 'dark', setTheme: vi.fn(),
    ...overrides,
  };
  return { routes: buildScreenRoutes(props), props };
}

/** The first element in a (possibly nested) element tree whose type is `type`. */
function find(el, type) {
  if (!el || typeof el !== 'object') return null;
  if (el.type === type) return el;
  const kids = el.props && el.props.children;
  for (const c of Array.isArray(kids) ? kids : [kids]) {
    const hit = find(c, type);
    if (hit) return hit;
  }
  return null;
}

describe('a letter picked from a volume index starts a new trail (v01-05, v01-04)', () => {
  it('clears fromSearch and fromSurprise before opening the letter', () => {
    const { routes, props } = makeRoutes();
    const index = find(routes['vot-index'](), G.VolumeLetterIndex);
    expect(index, 'the Volume Two index did not render - this measured nothing').toBeTruthy();
    index.props.onSelect('the-last-trump');
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setLetterId).toHaveBeenCalledWith('the-last-trump');
    expect(props.setScreen).toHaveBeenCalledWith('vot-letter');
  });
});

describe('a volume opened from the Volumes screen starts a new trail (v01-05, v01-04)', () => {
  it('clears both flags, then opens the volume', () => {
    const { routes, props } = makeRoutes();
    const home = find(routes['volumes-home'](), G.VolumesHome);
    expect(home, 'the Volumes screen did not render - this measured nothing').toBeTruthy();
    home.props.onSelect('two');
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.handleVolumeSelect).toHaveBeenCalledWith('two');
  });
});

// Surprise -> Genesis 5 -> Library -> Scriptures -> Jude (one chapter, opened straight from the
// hub) -> Back went HOME; Search -> a hit -> Library -> Scriptures -> a book's index -> Back went
// to the old SEARCH. The same for the genre screen, the Studies screen and a study's index.
describe('a book or a study opened from the Scriptures, genre or Studies screens starts a new trail (v01-04, v01-05)', () => {
  it('Scriptures: a book clears both flags, then opens with the same arguments', () => {
    const { routes, props } = makeRoutes({ handleScriptureSelect: vi.fn() });
    const hub = find(routes['scriptures-home'](), G.ScripturesHome);
    expect(hub, 'the Scriptures screen did not render - this measured nothing').toBeTruthy();
    hub.props.onSelect('jude', true);
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.handleScriptureSelect).toHaveBeenCalledWith('jude', true);
  });

  it('Scriptures: the Matthew Study Bible tile clears both flags, then opens its index', () => {
    const { routes, props } = makeRoutes({ setBookId: vi.fn(), setChapterNum: vi.fn() });
    find(routes['scriptures-home'](), G.ScripturesHome).props.onMatthewStudy();
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-idx');
  });

  it('a genre screen: a book clears both flags, then opens', () => {
    const { routes, props } = makeRoutes({ genreId: 'gospels', handleScriptureSelect: vi.fn() });
    const genre = find(routes['scripture-genre'](), G.ScriptureGenre);
    expect(genre, 'the genre screen did not render - this measured nothing').toBeTruthy();
    genre.props.onSelect('mark');
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.handleScriptureSelect).toHaveBeenCalledWith('mark');
  });

  it('Studies: a letter study and the Matthew study both clear both flags', () => {
    const { routes, props } = makeRoutes({
      UNIFIED_CHAIN: [], selectStudy: vi.fn(), setFromStudies: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(),
    });
    const studies = find(routes['studies-home'](), G.StudiesHome);
    expect(studies, 'the Studies screen did not render - this measured nothing').toBeTruthy();
    studies.props.onSelectStudy('purity');
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.selectStudy).toHaveBeenCalledWith('purity');
    props.setFromSearch.mockClear(); props.setFromSurprise.mockClear();
    studies.props.onSelectStudy('matthew-study');
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setFromStudies).toHaveBeenCalledWith(true);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-idx');
  });
});

describe('a chapter picked from a study index starts a new trail (v01-04, v01-05)', () => {
  it('clears both flags, then opens the chapter (search lands on a study chapter, never its index)', () => {
    const { routes, props } = makeRoutes({
      studyId: 'purity', lastReadChapters: {},
      getStudyById: () => ({ id: 'purity', slug: 'purity', chapters: [] }),
      studyReadKey: (slug) => 'bible-study-' + slug,
      selectStudyChapter: vi.fn(),
    });
    const index = find(routes['bible-study-index'](), G.BibleStudyIndex);
    expect(index, 'the study index did not render - this measured nothing').toBeTruthy();
    index.props.onSelect('ch-2');
    expect(props.setFromSearch).toHaveBeenCalledWith(false);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.selectStudyChapter).toHaveBeenCalledWith('purity', 'ch-2');
  });
});

// Surprise -> Genesis 5 -> its index -> chapter 9 -> Back went HOME, not to the index. A Surprise
// never lands on an index, so a chapter picked from one has left it. fromSearch stays: a
// book-level search result ('Romans') lands on these indexes, and Back from its chapter returns
// to the search.
describe('a chapter picked from a Bible or Matthew index leaves the Surprise and keeps a search trail (v01-04)', () => {
  it('bible-idx', () => {
    const { routes, props } = makeRoutes({
      bookId: 'genesis', book: { id: 'genesis', chapters: [] }, lastReadChapters: {}, selectBibleCh: vi.fn(),
    });
    const index = find(routes['bible-idx'](), G.ChapterIndex);
    expect(index, 'the Bible chapter index did not render - this measured nothing').toBeTruthy();
    index.props.onSelect(9);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setFromSearch).not.toHaveBeenCalled();
    expect(props.selectBibleCh).toHaveBeenCalledWith(9);
  });

  it('matthew-idx', () => {
    const { routes, props } = makeRoutes({ lastReadChapters: {}, selectMatthewCh: vi.fn() });
    const index = find(routes['matthew-idx'](), G.ChapterIndex);
    expect(index, 'the Matthew chapter index did not render - this measured nothing').toBeTruthy();
    index.props.onSelect(5);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setFromSearch).not.toHaveBeenCalled();
    expect(props.selectMatthewCh).toHaveBeenCalledWith(5);
  });
});
