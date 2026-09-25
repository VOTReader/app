// @ts-nocheck — free-var globals stubbed per test; the routes are built with the same props stub as screen-routes.studyaudio.test.jsx
/* W-03 (Songs walk 2026-09-25): a letter opened from a Songs screen ("From the letter", or the desk's "Open the
   letter") raised a back pill reading "BACK TO Listening Library", and the listener was sent somewhere else. The pill
   now names where it returns (the Songs screen's top frame, or the page the desk was opened over) and carries that
   page's own place, so label and destination agree. Also the desk's "Song page ›": on the Songs screen it goes on
   top of the stack (Back returns to the list), elsewhere it opens the Songs screen with that page as the way back. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';
import { COL_BY_KEY } from '../data/scripture-resolution.js';
import { SONGS_SCREEN, encodeSongsRoute, decodeSongsRoute } from '../utils/songs-route.js';

function makeRoutes(over = {}) {
  const props = {
    screen: 'audio-library', book: null, chapter: null, bookId: null, chapterNum: 1,
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

beforeEach(() => {
  globalThis.COL_BY_KEY = COL_BY_KEY;
  globalThis.songsFrameTitle = (frame) => (frame.k === 'song' ? 'Come, Love Awaits You' : 'Songs of the Letters');
});
afterEach(() => {
  delete globalThis.COL_BY_KEY;
  delete globalThis.songsFrameTitle;
  delete window.__openAudioText;
  delete window.__openSongs;
  document.title = '';
});

describe('W-03: the back pill over a letter opened from songs', () => {
  it('from a song page it names the song and returns to the Songs screen', () => {
    const p = makeRoutes({ screen: SONGS_SCREEN, audioColKey: encodeSongsRoute([{ k: 'hub' }, { k: 'song', v: 'come-love-awaits-you' }]) });
    window.__openAudioText({ key: 'wtlb1:come-love-awaits-you', title: 'Come, Love Awaits You' });
    expect(p.pushFromLetter).toHaveBeenCalledTimes(1);
    const entry = p.pushFromLetter.mock.calls[0][0];
    expect(entry.sourceScreen).toBe(SONGS_SCREEN);
    expect(entry.sourceLetterTitle).toBe('Come, Love Awaits You');
    expect(entry.sourceLetterTitle).not.toBe('Listening Library');
  });

  it('from the desk over another letter it names that letter and returns to it, not only to its screen', () => {
    document.title = 'Be Born Again — VOTReader';
    const p = makeRoutes({ screen: 'wtlb-entry', letterId: 'be-born-again' });
    window.__openAudioText({ key: 'wtlb2:a-continual-washing', title: 'A Continual Washing' });
    const entry = p.pushFromLetter.mock.calls[0][0];
    expect(entry.sourceScreen).toBe('wtlb-entry');
    expect(entry.sourceLetterId).toBe('be-born-again');
    expect(entry.sourceLetterTitle).toBe('Be Born Again');
  });

  it('the Listening Library still says Listening Library', () => {
    const p = makeRoutes({ screen: 'audio-library' });
    window.__openAudioText({ key: 'two:the-letter', title: 'x' });
    expect(p.pushFromLetter.mock.calls[0][0].sourceLetterTitle).toBe('Listening Library');
  });
});

describe('the desk’s Song page link', () => {
  it('on the Songs screen the song goes on top of the stack', () => {
    const key = encodeSongsRoute([{ k: 'hub' }, { k: 'list', v: 'col:wtlb1' }]);
    const p = makeRoutes({ screen: SONGS_SCREEN, audioColKey: key });
    window.__openSongs([{ k: 'song', v: 'fam-a' }], '');
    expect(decodeSongsRoute(p.setAudioColKey.mock.calls[0][0])).toEqual([{ k: 'hub' }, { k: 'list', v: 'col:wtlb1' }, { k: 'song', v: 'fam-a' }]);
    expect(p.setScreen).not.toHaveBeenCalled();
  });

  it('from a letter it opens the Songs screen, the way back named for that letter', () => {
    document.title = 'Be Born Again — VOTReader';
    const p = makeRoutes({ screen: 'wtlb-entry', letterId: 'be-born-again' });
    window.__openSongs([{ k: 'song', v: 'fam-a' }], '');
    expect(p.setScreen).toHaveBeenCalledWith(SONGS_SCREEN);
    expect(p.setNavOrigin).toHaveBeenCalledWith(expect.objectContaining({ screen: 'wtlb-entry', letterId: 'be-born-again', label: 'Be Born Again' }));
  });
});
