// @ts-nocheck — free-var globals stubbed per test; the routes are built with the same props stub as screen-routes.songs-back.test.jsx
/* The doors into the Scripture Web (the navigation stream, w3; the digest's A2 "doors in from
   reading"; CONTRACTS.md section 8). The reader's menus call window.__openScriptureWeb(start): the
   page they were opened from becomes the way back (navOrigin, so the web's Back returns to it), the
   start rides the navHandoff slot 'webStart' into the web's route, and the route hands it to the
   screen as its start prop for as long as the web is up. Anywhere else the slot is spent, so the
   web opened later from the Library opens where it was, not at an old door's place. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';

/* Which modes the panel opens (use-web-selection.js PANEL_MODES), held here so a case can say
   "once letter mode exists"; each case starts from the panel's own answer. */
const modes = vi.hoisted(() => ({ real: /** @type {any} */ (null), now: /** @type {any} */ ({}) }));
vi.mock('./scripture-web/use-web-selection.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  modes.real = real.PANEL_MODES;
  return { ...real, PANEL_MODES: modes.now };
});
import { COL_BY_KEY } from '../data/scripture-resolution.js';
import { navHandoff } from '../utils/nav-handoff.js';

function makeRoutes(over = {}) {
  const props = {
    screen: 'bible-ch', book: null, chapter: null, bookId: 'john', chapterNum: 3,
    settings: { bibleAudio: 'brm-kjv' },
    activeVolKey: null, activeLetter: null, letterId: null, studyId: null, studyChapterId: null,
    boundaryConfig: vi.fn(() => ({})),
    readHistory: [],
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(),
    getStudyById: vi.fn(() => null),
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
  const routes = buildScreenRoutes(props);
  return { props, routes };
}

const JOHN_3_16 = { verse: { bookId: 'john', chapter: 3, verse: 16 } };

beforeEach(() => {
  for (const k of Object.keys(modes.now)) delete modes.now[k];
  Object.assign(modes.now, modes.real);
  globalThis.COL_BY_KEY = COL_BY_KEY;
  globalThis.ScriptureWebScreen = function ScriptureWebScreen() { return null; };
  window.navHandoff = navHandoff;
  navHandoff._resetForTests();
});
afterEach(() => {
  delete globalThis.COL_BY_KEY;
  delete globalThis.ScriptureWebScreen;
  delete window.__openScriptureWeb;
  delete window.__openAudioText;
  delete window.__openSongs;
  navHandoff._resetForTests();
});

describe('window.__openScriptureWeb: a door from the reader', () => {
  it('from a Bible chapter: the chapter is the way back, the web opens with the verse as its start', () => {
    const { props } = makeRoutes();
    expect(window.__openScriptureWeb(JOHN_3_16)).toBe(true);
    expect(props.setNavOrigin).toHaveBeenCalledWith(expect.objectContaining({ screen: 'bible-ch', bookId: 'john', chapterNum: 3, returnOrigin: null }));
    expect(props.setScreen).toHaveBeenCalledWith('scripture-web');
    expect(navHandoff.peek('webStart')).toEqual(JOHN_3_16);
  });

  it('an origin already there is chained, so the reader\'s own Back still goes where it went', () => {
    const was = { screen: 'library' };
    const { props } = makeRoutes({ navOrigin: was });
    window.__openScriptureWeb(JOHN_3_16);
    expect(props.setNavOrigin.mock.calls[0][0].returnOrigin).toBe(was);
  });

  it('"this letter": the page\'s own letter, entry or study chapter, as the web keys them (once the panel has letter mode)', () => {
    modes.now.letter = true;
    makeRoutes({ screen: 'vot-letter', activeVolKey: 'two', activeLetter: { id: 'the-wide-path' }, letterId: 'the-wide-path' });
    expect(window.__openScriptureWeb('this-letter')).toBe(true);
    expect(navHandoff.peek('webStart')).toEqual({ letterKey: 'two/the-wide-path' });
    makeRoutes({ screen: 'wtlb-one-entry', activeVolKey: 'wtlb1', activeLetter: { id: 'devotion' }, letterId: 'devotion' });
    window.__openScriptureWeb('this-letter');
    expect(navHandoff.peek('webStart')).toEqual({ letterKey: 'wtlb1/devotion' });
    makeRoutes({ screen: 'bible-study-chapter', studyId: 'more-than-a-man', studyChapterId: 'mtm-ch5' });
    window.__openScriptureWeb('this-letter');
    expect(navHandoff.peek('webStart')).toEqual({ letterKey: 'study:more-than-a-man/mtm-ch5' });
  });

  it('no letter door until the panel has letter mode: the web would open at its old place, naming nothing of the letter', () => {
    modes.now.letter = false;
    const { props } = makeRoutes({ screen: 'vot-letter', activeVolKey: 'two', activeLetter: { id: 'the-wide-path' }, letterId: 'the-wide-path' });
    expect(window.__openScriptureWeb('this-letter', { check: true }), 'the toolbar asks, and hides the door').toBe(false);
    expect(window.__openScriptureWeb('this-letter')).toBe(false);
    expect(window.__openScriptureWeb({ letterKey: 'two/the-wide-path' })).toBe(false);
    expect(props.setScreen).not.toHaveBeenCalled();
    expect(navHandoff.has('webStart')).toBe(false);
    expect(window.__openScriptureWeb(JOHN_3_16, { check: true }), 'a verse still has its door').toBe(true);
  });

  it('nothing to open is no door: no letter on a Bible chapter, no start at all', () => {
    const { props } = makeRoutes();
    expect(window.__openScriptureWeb('this-letter')).toBe(false);
    expect(window.__openScriptureWeb(null)).toBe(false);
    expect(props.setScreen).not.toHaveBeenCalled();
    expect(props.setNavOrigin).not.toHaveBeenCalled();
  });
});

describe("the web's route", () => {
  it('hands the door\'s start to the screen while the web is up, and Back returns to the page', () => {
    makeRoutes();
    window.__openScriptureWeb(JOHN_3_16);
    const { props, routes } = makeRoutes({ screen: 'scripture-web', navOrigin: { screen: 'bible-ch', bookId: 'john', chapterNum: 3 } });
    const el = routes['scripture-web']();
    expect(el.props.start).toEqual(JOHN_3_16);
    // a re-render (the web's own setting changes) keeps it: the screen takes it once per mount
    expect(makeRoutes({ screen: 'scripture-web' }).routes['scripture-web']().props.start).toEqual(JOHN_3_16);
    el.props.onBack();
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
  });

  it('anywhere else the start is spent: the web opened later opens where it was', () => {
    makeRoutes();
    window.__openScriptureWeb(JOHN_3_16);
    makeRoutes({ screen: 'scripture-web' });
    makeRoutes({ screen: 'bible-ch' });
    expect(navHandoff.has('webStart')).toBe(false);
    const { routes } = makeRoutes({ screen: 'scripture-web' });
    expect(routes['scripture-web']().props.start).toBeUndefined();
  });
});
