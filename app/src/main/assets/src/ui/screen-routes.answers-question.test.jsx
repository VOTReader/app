// @ts-nocheck — the routes are built with the same props stub as screen-routes.songs-back.test.jsx
/* The Today card's question of the day opens its Answers topic the normal way: through the tap-through
   stack with Home as the source, so system Back returns to Today. */
import { describe, it, expect, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

function makeRoutes(over = {}) {
  const props = {
    screen: 'home', book: null, chapter: null, bookId: null, chapterNum: 1,
    settings: { bibleAudio: 'brm-kjv' },
    activeVolKey: null, activeLetter: null,
    boundaryConfig: vi.fn(() => ({})),
    readHistory: [],
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(),
    getStudyById: vi.fn(() => null),          // the corpus is NOT resident — the case that matters
    studyReadKey: vi.fn((slug) => 'bible-study-' + slug),
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
    goBibleIdx: vi.fn(),
    selectMatthewCh: vi.fn(), selectBibleCh: vi.fn(), selectStudy: vi.fn(), selectStudyChapter: vi.fn(),
    activeReadKey: null, lastReadChapters: {},
    getReadKey: vi.fn(() => 'k'), readKeyFor: vi.fn(() => 'k'),
    isRead: vi.fn(() => false),
    setFromWtlb: vi.fn(),
    gardenPage: 1, setGardenPage: vi.fn(),
    toggleSetting: vi.fn(), updateSetting: vi.fn(),
    titleFocusHidden: false, setTitleFocusHidden: vi.fn(),
    headingsFocusHidden: false, setHeadingsFocusHidden: vi.fn(),
    mode: 'read', setMode: vi.fn(), showStudy: false, setShowStudy: vi.fn(),
    surpriseAnchor: null,
    ...over,
  };
  buildScreenRoutes(props);
  return props;
}

describe('the question of the day, from Home', () => {
  it('opens the topic on the answers-entry screen with Home as the way back', () => {
    const p = makeRoutes();
    globalThis.HomeScreen = () => null;
    let home;
    try { home = buildScreenRoutes(p).home(); } finally { delete globalThis.HomeScreen; }
    expect(typeof home.props.onOpenAnswersTopic).toBe('function');
    const prev = window.navHandoff;
    window.navHandoff = { clear: vi.fn(), set: vi.fn(), take: vi.fn() };
    try { home.props.onOpenAnswersTopic('regarding-faith'); } finally { window.navHandoff = prev; }
    expect(p.pushFromLetter).toHaveBeenCalledTimes(1);
    const entry = p.pushFromLetter.mock.calls[0][0];
    expect(entry.sourceScreen).toBe('home');
    expect(entry.sourceLetterTitle).toBe('Home');
    expect(entry.destSnapshot).toEqual(expect.objectContaining({ screen: 'answers-entry', letterId: 'regarding-faith' }));
    expect(p.setLetterId).toHaveBeenCalledWith('regarding-faith');
    expect(p.setScreen).toHaveBeenLastCalledWith('answers-entry');
  });
});
