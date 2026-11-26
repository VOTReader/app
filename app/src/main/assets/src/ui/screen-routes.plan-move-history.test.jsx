// @ts-nocheck — free-var globals stubbed per test; the routes are built with the same props stub as screen-routes.begin-reading.test.jsx
/* arch-1 (audit 2026-11-23, item 15): a move inside a plan sitting (Next, chevron, segment, swipe, arrow key) must
   suppress the history push in the instance useHistorySync reads. screen-routes.jsx sits in bundle-d; an import of
   use-history-sync there bundled d its own copy, whose flag nothing read, so every move pushed an entry (history.length
   6 -> 10 over four Nexts). The routes now call bundle-b's global, which this test stands in for. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';
import { planSessionHost, _resetPlanSessionForTests } from '../utils/plan-session.js';
import { COL_BY_KEY, COLLECTIONS } from '../data/scripture-resolution.js';

function makeProps(over = {}) {
  return {
    screen: 'bible-chapter', book: null, chapter: null, bookId: 'genesis', chapterNum: 1,
    settings: { bibleAudio: 'brm-kjv' }, activeVolKey: null, activeLetter: null,
    boundaryConfig: vi.fn(() => ({})), readHistory: [],
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(), goHome: vi.fn(),
    getStudyById: vi.fn(() => null), studyReadKey: vi.fn((slug) => 'bible-study-' + slug),
    setActiveReadKey: vi.fn(), setLastReadChapters: vi.fn(), setLastReadForVol: vi.fn(),
    setGenreId: vi.fn(), navigateToLink: vi.fn(), clearHistory: vi.fn(), pruneHistoryDay: vi.fn(),
    theme: 'dark', setTheme: vi.fn(),
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    setNavOrigin: vi.fn(), navOrigin: null, pushFromLetter: vi.fn(),
    fromSearch: false, setFromSearch: vi.fn(), fromStudies: false, setFromStudies: vi.fn(),
    genreId: null, setSurpriseAnchor: vi.fn(), audioColKey: null, setAudioColKey: vi.fn(),
    goStudiesHome: vi.fn(), goScripturesHome: vi.fn(), goBibleIdx: vi.fn(),
    selectMatthewCh: vi.fn(), selectBibleCh: vi.fn(), selectStudy: vi.fn(), selectStudyChapter: vi.fn(),
    activeReadKey: null, lastReadChapters: {}, getReadKey: vi.fn(() => 'k'), readKeyFor: vi.fn(() => 'k'),
    isRead: vi.fn(() => false), setFromWtlb: vi.fn(), gardenPage: 1, setGardenPage: vi.fn(),
    toggleSetting: vi.fn(), updateSetting: vi.fn(),
    titleFocusHidden: false, setTitleFocusHidden: vi.fn(), headingsFocusHidden: false, setHeadingsFocusHidden: vi.fn(),
    mode: 'read', setMode: vi.fn(), showStudy: false, setShowStudy: vi.fn(), surpriseAnchor: null,
    ...over,
  };
}

beforeEach(() => {
  _resetPlanSessionForTests();
  globalThis.COL_BY_KEY = COL_BY_KEY; globalThis.COLLECTIONS = COLLECTIONS;
  globalThis.suppressNextHistoryPush = vi.fn();
});
afterEach(() => {
  _resetPlanSessionForTests();
  delete globalThis.COL_BY_KEY; delete globalThis.COLLECTIONS; delete globalThis.suppressNextHistoryPush;
});

describe('arch-1: an in-sitting plan move suppresses the history push in bundle-b\'s instance', () => {
  it('a Bible move calls the global suppressNextHistoryPush (the flag useHistorySync reads) before it moves', () => {
    const props = makeProps();
    buildScreenRoutes(props);
    const host = planSessionHost();
    expect(host && typeof host.move).toBe('function');
    host.move({ bid: 'exodus', cid: 2 });
    expect(globalThis.suppressNextHistoryPush).toHaveBeenCalledTimes(1);
    expect(props.setBookId).toHaveBeenCalledWith('exodus');
    expect(props.setChapterNum).toHaveBeenCalledWith(2);
  });

  it('with no bundle-b global (a bare test host), the move still happens', () => {
    delete globalThis.suppressNextHistoryPush;
    const props = makeProps();
    buildScreenRoutes(props);
    planSessionHost().move({ bid: 'exodus', cid: 3 });
    expect(props.setChapterNum).toHaveBeenCalledWith(3);
  });
});
