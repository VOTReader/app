// @ts-nocheck
/* RED — navigation-tabs-4 (Verifier reproduction, 2026-09-03)
   ─────────────────────────────────────────────────────────────────────────
   A restored tab whose letterId no longer resolves renders NOTHING: every
   VOT letter / entry route is `_wrapVot(actL(volKey) && <View/>)`, and the
   two block-bodied routes `return null` explicitly. With the VOT corpus
   loaded (_votReady true) and the letter unresolvable (actL null) the route
   returns null — no header, no nav, no back affordance — and because the tab
   is persisted, a reload lands on the same blank screen.

   _validateTabState only checks that letterId is TRUTHY (it cannot know the
   corpus at boot; the corpus is lazy), so the guard has to live in the route.

   CONTRACT PINNED HERE: with the corpus loaded and the active letter
   unresolvable, a letter/entry route must render SOMETHING (the collection's
   index, home, anything with chrome) — never null.

   Moved here from tools/repro/ with the fix, as its own header directed. The
   fix is `_deadLetter(volKey)` — chrome plus a route back to the collection's
   index — reached from `_wrapVot` when the corpus is ready and the letter is
   not, so the rule lives in ONE place rather than at fifteen call sites. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

// screen → volKey, exactly as screen-routes.jsx pairs them (lines 530-547,
// 1170-1195 at 517f85b2).
const DEAD_LETTER_ROUTES = [
  ['vot-one-letter', 'one'],
  ['vot-letter', 'two'],
  ['vot-three-letter', 'three'],
  ['vot-four-letter', 'four'],
  ['vot-five-letter', 'five'],
  ['vot-six-letter', 'six'],
  ['vot-seven-letter', 'seven'],
  ['vot-timothy-letter', 'timothy'],
  ['vot-flock-letter', 'flock'],
  ['vot-rebuke-letter', 'rebuke'],
  ['wtlb-one-entry', 'wtlb1'],
  ['wtlb-two-entry', 'wtlb2'],
  ['blessed-entry', 'blessed'],
  ['holy-days-entry', 'holydays'],
  ['hm-letter', 'hm'],
];

beforeEach(() => {
  globalThis.HistoryScreen = () => null;
  globalThis.ChapterIndex = () => null;
  globalThis.LibraryScreen = () => null;
  globalThis.HomeScreen = () => null;
  globalThis.MyProgressScreen = () => null;
  globalThis.MATTHEW = { title: 'Matthew', chapters: [{ num: 1 }] };
  globalThis.COL_BY_INDEX_SC = new Map();
  globalThis.COL_BY_KEY = new Map(DEAD_LETTER_ROUTES.map(([screen, volKey]) => [
    volKey, { volKey, letterScreen: screen, indexScreen: 'volumes-home', letters: [] },
  ]));
});
afterEach(() => {
  for (const k of ['HistoryScreen', 'ChapterIndex', 'LibraryScreen', 'HomeScreen', 'MyProgressScreen', 'MATTHEW', 'COL_BY_INDEX_SC', 'COL_BY_KEY']) delete globalThis[k];
  delete window.__votCorpus;
  delete window.__loadVotCorpus;
  vi.restoreAllMocks();
});

/** The prop bag App() hands buildScreenRoutes, reduced to what these routes
    touch at build time plus the F3 pair that decides what a letter route
    renders: activeVolKey (from the screen) and activeLetter (the resolved
    entry — null when the persisted letterId is no longer in the corpus). */
function makeRoutes(activeVolKey, activeLetter) {
  const props = {
    activeVolKey, activeLetter,
    settings: {},
    boundaryConfig: vi.fn(() => ({})),
    readHistory: [],
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(),
    getStudyById: vi.fn(() => null),
    studyReadKey: (slug) => 'study:' + slug,
    setActiveReadKey: vi.fn(),
    setLastReadChapters: vi.fn(), setLastReadForVol: vi.fn(),
    setGenreId: vi.fn(), navigateToLink: vi.fn(),
    clearHistory: vi.fn(), pruneHistoryDay: vi.fn(),
    theme: 'dark', setTheme: vi.fn(),
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    setNavOrigin: vi.fn(), navOrigin: null, pushFromLetter: vi.fn(),
    fromSearch: false, setFromSearch: vi.fn(),
    fromStudies: false, setFromStudies: vi.fn(),
    genreId: null, setSurpriseAnchor: vi.fn(),
    audioColKey: null, setAudioColKey: vi.fn(),
    goStudiesHome: vi.fn(), goScripturesHome: vi.fn(), goHome: vi.fn(),
    selectMatthewCh: vi.fn(), selectBibleCh: vi.fn(),
    activeReadKey: null, lastReadChapters: {},
    isRead: vi.fn(() => false),
    setFromWtlb: vi.fn(),
    gardenPage: 1, setGardenPage: vi.fn(),
  };
  return { routes: buildScreenRoutes(props), props };
}

describe('navigation-tabs-4 — a persisted letterId the corpus no longer resolves', () => {
  it('CONTROL: while the VOT corpus is still loading, every letter route renders the placeholder (never null)', () => {
    window.__votCorpus = { loaded: false, error: false };
    window.__loadVotCorpus = vi.fn();
    for (const [screen, volKey] of DEAD_LETTER_ROUTES) {
      const { routes } = makeRoutes(volKey, null);
      expect(routes[screen](), screen + ' while loading').not.toBeNull();
    }
  });

  for (const [screen, volKey] of DEAD_LETTER_ROUTES) {
    it(`${screen}: corpus loaded, letter unresolvable → the route must still render chrome, not null`, () => {
      window.__votCorpus = { loaded: true, error: false };
      window.__loadVotCorpus = vi.fn();
      const { routes } = makeRoutes(volKey, null);
      // The persisted tab is {screen, letterId:'<dead id>'}; App resolves it
      // to activeLetter === null and hands the route exactly this pair.
      const rendered = routes[screen]();
      expect(rendered, screen + ' rendered nothing for a dead letterId').not.toBeNull();
    });
  }
});
