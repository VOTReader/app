// @ts-nocheck — the routes are built with a stub prop bag, as the screen-routes tests do
/* app-sections: every screen has a place at the bottom (the layout pass, 2026-11-10). */
import { describe, it, expect, vi } from 'vitest';
import { SECTIONS, TABS, TAB_ROOTS, sectionOf, barShown, tabTap, litTab } from './app-sections.js';
import { buildScreenRoutes } from '../ui/screen-routes.jsx';

function routeKeys() {
  const props = {
    screen: 'home', book: null, chapter: null, bookId: null, chapterNum: 1,
    settings: { bibleAudio: 'brm-kjv' }, activeVolKey: null, activeLetter: null,
    boundaryConfig: vi.fn(() => ({})), readHistory: [],
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(),
    getStudyById: vi.fn(() => null), studyReadKey: vi.fn((s) => 'bible-study-' + s),
    setActiveReadKey: vi.fn(), setLastReadChapters: vi.fn(), setLastReadForVol: vi.fn(),
    setGenreId: vi.fn(), navigateToLink: vi.fn(), clearHistory: vi.fn(), pruneHistoryDay: vi.fn(),
    theme: 'dark', setTheme: vi.fn(), setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(), setNavOrigin: vi.fn(), navOrigin: null, pushFromLetter: vi.fn(),
    fromSearch: false, setFromSearch: vi.fn(), fromStudies: false, setFromStudies: vi.fn(),
    genreId: null, setSurpriseAnchor: vi.fn(), audioColKey: null, setAudioColKey: vi.fn(),
    goStudiesHome: vi.fn(), goScripturesHome: vi.fn(), goHome: vi.fn(), goBibleIdx: vi.fn(),
    selectMatthewCh: vi.fn(), selectBibleCh: vi.fn(), selectStudy: vi.fn(), selectStudyChapter: vi.fn(),
    activeReadKey: null, lastReadChapters: {}, getReadKey: vi.fn(() => 'k'), readKeyFor: vi.fn(() => 'k'),
    isRead: vi.fn(() => false), setFromWtlb: vi.fn(), gardenPage: 1, setGardenPage: vi.fn(),
    toggleSetting: vi.fn(), updateSetting: vi.fn(), titleFocusHidden: false, setTitleFocusHidden: vi.fn(),
    headingsFocusHidden: false, setHeadingsFocusHidden: vi.fn(), mode: 'read', setMode: vi.fn(),
    showStudy: false, setShowStudy: vi.fn(), surpriseAnchor: null,
  };
  return Object.keys(buildScreenRoutes(props));
}

describe('app-sections', () => {
  it('every screen key in screen-routes has a place, and the map names no screen that does not exist', () => {
    const keys = routeKeys();
    expect(keys.length).toBeGreaterThan(60);
    const missing = keys.filter((k) => !Object.prototype.hasOwnProperty.call(SECTIONS, k));
    expect(missing, 'screens with no entry in SECTIONS').toEqual([]);
    const extra = Object.keys(SECTIONS).filter((k) => !keys.includes(k));
    expect(extra, 'SECTIONS entries with no route').toEqual([]);
    // Each one belongs to exactly one tab, keeps the tab you came from, or is a full-height page (no bar).
    for (const k of keys) {
      const s = SECTIONS[k];
      expect(s.bar ? ['read', 'listen', 'library', 'keep'].includes(s.tab) : s.tab === null, k).toBe(true);
    }
  });

  it('puts the three roots on their own tabs, with the bar', () => {
    expect(TABS).toEqual(['read', 'listen', 'library']);
    for (const tab of TABS) expect(sectionOf(TAB_ROOTS[tab])).toEqual({ tab, bar: true });
  });

  it('places the brief\'s screens', () => {
    for (const k of ['volumes-home', 'vot-rebuke-index', 'holy-days-index', 'scripture-genre', 'bible-idx', 'matthew-idx', 'bible-study-index', 'answers-group', 'answers-media', 'answers-saved']) {
      expect(sectionOf(k)).toEqual({ tab: 'read', bar: true });
    }
    for (const k of ['audio-library-volumes', 'audio-library-offline', 'audio-library-collection', 'audio-library-songs', 'audio-library-saved', 'audio-library-studies']) {
      expect(sectionOf(k)).toEqual({ tab: 'listen', bar: true });
    }
    for (const k of ['reading-plans', 'my-progress', 'notes-index', 'highlights-index', 'bookmarks-index', 'links-index', 'journal-home', 'history']) {
      expect(sectionOf(k)).toEqual({ tab: 'library', bar: true });
    }
    for (const k of ['search', 'settings', 'about']) expect(sectionOf(k)).toEqual({ tab: 'keep', bar: true });
  });

  it('Search, Settings and About keep the tab you came from lit (Read when there was none)', () => {
    expect(litTab('settings', 'library')).toBe('library');
    expect(litTab('search', 'listen')).toBe('listen');
    expect(litTab('about', null)).toBe('read');
    expect(litTab('notes-index', 'listen')).toBe('library');
    expect(litTab('bible-ch', 'read')).toBeNull();
  });

  it('hides the bar on every reader and full-height page', () => {
    const readers = Object.keys(SECTIONS).filter((k) => /-(letter|entry)$/.test(k));
    expect(readers.length).toBeGreaterThan(14);
    for (const k of [...readers, 'bible-ch', 'matthew-ch', 'bible-study-chapter', 'garden-view', 'scripture-web', 'journal-viewer', 'journal-editor']) {
      expect(sectionOf(k).bar, k).toBe(false);
    }
  });

  it('steps aside for the first-run About, the tabs overview, the tour and the keyboard', () => {
    expect(barShown({ screen: 'home' })).toBe(true);
    expect(barShown({ screen: 'about' })).toBe(true);
    expect(barShown({ screen: 'about', firstRunAbout: true })).toBe(false);
    expect(barShown({ screen: 'home', overviewOpen: true })).toBe(false);
    expect(barShown({ screen: 'library', tourOn: true })).toBe(false);
    expect(barShown({ screen: 'search', keyboardUp: true })).toBe(false);
    expect(barShown({ screen: 'bible-ch' })).toBe(false);
  });

  it('an unknown screen falls back to Home\'s place', () => {
    expect(sectionOf('no-such-screen')).toEqual({ tab: 'read', bar: true });
  });

  it('a tap on the lit tab at its root scrolls to the top; anywhere else it opens the root', () => {
    expect(tabTap('read', 'home')).toBe('top');
    expect(tabTap('read', 'volumes-home')).toBe('root');
    expect(tabTap('listen', 'audio-library')).toBe('top');
    expect(tabTap('listen', 'home')).toBe('root');
    expect(tabTap('library', 'notes-index')).toBe('root');
    expect(tabTap('library', 'library')).toBe('top');
  });
});
