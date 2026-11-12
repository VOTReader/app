// @ts-nocheck
/* An off-screen draw changes nothing in the app (REVIEW2-data item 1, 2026-11-12).
   To draw another tab's card, TabSnapDrawer builds that tab's routes. The build used to tell the plan session what
   "the screen shows" (a Home or Library tab shows none of the day's items, so a running session ended one tick
   later), hand the session a host whose mark-read did nothing, and drop the plan pages' kept place. Routes built
   from bgRouteDeps do none of that. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';
import { bgRouteDeps } from './components/TabSnapDrawer.jsx';
import { ReadingPlanStore } from '../stores/reading-plan-store.js';
import { startCatalogPlan } from '../data/plan-catalog.js';
import { beginPlanSession, planSession, planSessionHost, sessionKeyOf, _resetPlanSessionForTests } from '../utils/plan-session.js';
import { openPlanNav, planNavMounted, planNavStack, _resetPlanNavForTests } from '../utils/plan-nav.js';

const GLOBALS = ['HistoryScreen', 'ChapterIndex', 'LibraryScreen', 'HomeScreen', 'MyProgressScreen', 'MATTHEW',
  'COL_BY_INDEX_SC', 'COL_BY_KEY', 'COL_BY_LETTER_SC', 'READING_SCREENS', 'ReadingPlanStore'];

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  globalThis.ReadingPlanStore = ReadingPlanStore;
  for (const k of ['HistoryScreen', 'ChapterIndex', 'LibraryScreen', 'HomeScreen', 'MyProgressScreen']) globalThis[k] = () => null;
  globalThis.MATTHEW = { title: 'Matthew', chapters: [{ num: 1 }] };
  globalThis.COL_BY_INDEX_SC = new Map();
  globalThis.COL_BY_KEY = new Map();
  globalThis.COL_BY_LETTER_SC = new Map();
  globalThis.READING_SCREENS = new Set(['bible-ch']);
  _resetPlanSessionForTests();
  _resetPlanNavForTests();
});
afterEach(() => {
  _resetPlanSessionForTests();
  _resetPlanNavForTests();
  for (const k of GLOBALS) delete globalThis[k];
  vi.useRealTimers();
});

/** The deps App builds its own routes from, with the reader on Genesis 1 (the plan's first item). */
function appDeps(markRead) {
  return {
    screen: 'bible-ch', bookId: 'genesis', chapterNum: 1, letterId: null,
    activeVolKey: null, activeLetter: null,
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
    markRead, unmarkRead: vi.fn(),
    setFromWtlb: vi.fn(),
    gardenPage: 1, setGardenPage: vi.fn(),
  };
}

const HOME_TAB = { screen: 'home', bookId: null, chapterNum: null, letterId: null };

/** A session on day 1 of a plan, with the reader on its first item, as App's own render leaves it. */
function sessionOnGenesis1() {
  const run = startCatalogPlan('bible-year', null, new Date());
  ReadingPlanStore.put(run);
  beginPlanSession({ runId: run.id, day: 0, name: 'Bible in a Year' });
  const markRead = vi.fn();
  const deps = appDeps(markRead);
  buildScreenRoutes(deps);
  vi.runAllTimers();
  expect(sessionKeyOf('genesis', 1)).not.toBeNull();
  return { deps, markRead };
}

describe('routes built for an off-screen draw', () => {
  it('CONTROL: the app really moving to Home ends the session', () => {
    const { deps } = sessionOnGenesis1();
    buildScreenRoutes({ ...deps, ...HOME_TAB });
    vi.runAllTimers();
    expect(planSession()).toBeNull();
  });

  it('a plan session survives the Tabs screen drawing a Home tab', () => {
    const { deps } = sessionOnGenesis1();
    buildScreenRoutes(bgRouteDeps(deps, HOME_TAB));
    vi.runAllTimers();
    expect(planSession()).not.toBeNull();
    expect(sessionKeyOf('genesis', 1)).not.toBeNull();
  });

  it('the session keeps the app\'s own mark-read, not the drawing\'s do-nothing', () => {
    const { deps, markRead } = sessionOnGenesis1();
    buildScreenRoutes(bgRouteDeps(deps, HOME_TAB));
    planSessionHost().markRead('genesis', 1);
    expect(markRead).toHaveBeenCalledWith('genesis', 1);
  });

  it('the plan pages keep their place', () => {
    const { deps } = sessionOnGenesis1();
    openPlanNav([{ v: 'list' }, { v: 'plan', id: 'x' }]);
    buildScreenRoutes(bgRouteDeps(deps, HOME_TAB));
    planNavMounted();
    expect(planNavStack()).toEqual([{ v: 'list' }, { v: 'plan', id: 'x' }]);
  });
});
