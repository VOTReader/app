// @ts-nocheck — free-var globals stubbed per test; the routes are built with the same props stub as screen-routes.songs-back.test.jsx
/* n114 (A08.1): ten fresh installs pressed Begin Reading and all ten landed on Home, three taps from any reading.
   First run's Begin Reading now opens Volume One, Letter 1; About opened later (from (i), with a way back) still
   returns where it came from, and a reader who has seen About before goes back too. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';
import { COL_BY_KEY } from '../data/scripture-resolution.js';
import { FIRST_LETTER } from '../utils/tour-steps.js';

let seen = false;
function makeRoutes(over = {}) {
  const props = {
    screen: 'about', book: null, chapter: null, bookId: null, chapterNum: 1,
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
  const routes = buildScreenRoutes(props);
  return { props, about: routes.about() };
}

beforeEach(() => {
  seen = false;
  globalThis.COL_BY_KEY = COL_BY_KEY;
  globalThis.AboutSeenFlagStore = { is: () => seen, set: vi.fn(() => { seen = true; }) };
  globalThis.TourController = { firstLetter: () => FIRST_LETTER };
  globalThis.AboutScreen = () => null;
});
afterEach(() => {
  delete globalThis.COL_BY_KEY; delete globalThis.AboutSeenFlagStore; delete globalThis.TourController; delete globalThis.AboutScreen;
  delete window.__openAudioText; delete window.__setBibleAudioEdition;
});

describe('n114: Begin Reading on first run opens Volume One, Letter 1', () => {
  it('first run (About never seen, nowhere to go back to): the first letter, counted as reading', () => {
    const { props, about } = makeRoutes();
    about.props.onContinue();
    expect(globalThis.AboutSeenFlagStore.set).toHaveBeenCalled();
    expect(props.goNavOrigin).not.toHaveBeenCalled();
    expect(props.setLetterId).toHaveBeenCalledWith('chosen-by-god');
    expect(props.setScreen).toHaveBeenLastCalledWith('vot-one-letter');
    expect(props.setActiveReadKey).toHaveBeenCalledWith('vol:one', expect.any(Function));
  });

  it('About opened from (i) goes back where it came from', () => {
    const { props, about } = makeRoutes({ navOrigin: { screen: 'home' } });
    about.props.onContinue();
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalledWith('vot-one-letter');
  });

  it('a reader who has seen About before goes back too', () => {
    seen = true;
    const { props, about } = makeRoutes();
    about.props.onContinue();
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
    expect(props.setLetterId).not.toHaveBeenCalled();
  });
});
