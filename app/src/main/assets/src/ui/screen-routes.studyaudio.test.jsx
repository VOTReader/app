// @ts-nocheck — free-var globals stubbed per test; the routes are built with the same props stub as screen-routes.bibleaudio.test.jsx
/* The Listening Library's "open the text" on a STUDY recording (ruling (4),
   2026-09-11). A study recording's key is study:<chapterId>; its text is the
   study chapter. Pre-fix _openAudioText looked the volKey up in COL_BY_KEY,
   found no collection named 'study' and returned: a tap that did nothing.

   The arm must not wait for the study corpus. bible-studies.js is lazy and
   4.4 MB, and the Library can be a session's first screen, so the destination
   is set at once through navigateToLink({ type: 'study-letter' }) — the same
   door the History restore uses — and the bible-study-chapter route owns the
   corpus kick and its Loading… surface. That means the study id has to come
   from the KEY: every shipped chapter id is `<study.id>-ch<n>`, which the
   last describe pins over the live corpus and manifest, in both directions. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildScreenRoutes } from './screen-routes.jsx';
import { COL_BY_KEY } from '../data/scripture-resolution.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '../data');

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
  globalThis.COL_BY_KEY = COL_BY_KEY;   // the real registry: 'study' is not in it, 'two' is
});
afterEach(() => {
  delete globalThis.COL_BY_KEY;
  delete window.__openAudioText;
});

describe('Library "open the text" on a study recording', () => {
  it('opens the study chapter at once, without the corpus: navigateToLink study-letter + the reading dot', () => {
    const p = makeRoutes();
    window.__openAudioText({ key: 'study:purity-ch1', title: 'Chapter 1', sub: 'Purity - Bible/Letter Study' });
    expect(p.navigateToLink).toHaveBeenCalledTimes(1);
    expect(p.navigateToLink).toHaveBeenCalledWith(
      { type: 'study-letter', studyId: 'purity', studyChapterId: 'purity-ch1' },
      { sourceLetterTitle: 'Listening Library' },
    );
    // Same tracking as selectStudyChapter (an index open) and the History arm:
    // a Library open must not be distinguishable to the reading dot.
    expect(p.setActiveReadKey).toHaveBeenCalledTimes(1);
    expect(p.setActiveReadKey.mock.calls[0][0]).toBe('bible-study-purity');
    // The letter path's setters are not touched: the route owns the study state.
    expect(p.setLetterId).not.toHaveBeenCalled();
    expect(p.setScreen).not.toHaveBeenCalled();
  });

  it('control: a study key with no chapter stem does nothing (a saved recording from another manifest)', () => {
    const p = makeRoutes();
    window.__openAudioText({ key: 'study:not-a-chapter' });
    expect(p.navigateToLink).not.toHaveBeenCalled();
    expect(p.setActiveReadKey).not.toHaveBeenCalled();
  });

  it('control: the Bible arm beside it is unchanged', () => {
    const p = makeRoutes();
    window.__openAudioText({ key: 'bible-brm-kjv:john', partLabel: 'Chapter 3' });
    expect(p.navigateToLink).toHaveBeenCalledWith(
      { type: 'bible', bookId: 'john', chapter: 3 },
      { sourceLetterTitle: 'Listening Library' },
    );
  });
});

/* The data the arm relies on. Evaluated into LOCALS (a gate must own its data:
   a neighbour's afterEach must not be able to switch it off), with every count
   checked against a SECOND, independent reading of the same file. */
describe('the study corpus and the manifest agree with the routing arm', () => {
  const load = (file, name) => {
    const src = readFileSync(resolve(DATA, file), 'utf8');
    const sink = {};
    new Function('sink', src + ';sink.v = ' + name + ';')(sink);
    return { src, v: sink.v };
  };

  it('every chapter id is <study.id>-ch<n>, and slug === id (findEntryContext feeds study.slug into setStudyId)', () => {
    const { src, v: studies } = load('bible-studies.js', 'BIBLE_STUDIES');
    const independent = (src.match(/^ {4}"slug": "/gm) || []).length;   // top-level study objects, second reading
    expect(studies.length).toBe(independent);
    expect(studies.length).toBeGreaterThan(0);
    let chapters = 0;
    for (const s of studies) {
      expect(s.slug, s.id).toBe(s.id);
      for (const c of s.chapters) {
        chapters += 1;
        expect(c.id.replace(/-ch\d+$/, ''), c.id).toBe(s.id);
      }
    }
    const independentChapters = (src.match(/^ {8}"id": "/gm) || []).length;   // chapter objects, second reading
    expect(chapters).toBe(independentChapters);
    expect(chapters).toBeGreaterThan(0);
  });

  it('every study:* manifest key names a shipped study chapter (so the derived destination resolves once the corpus loads)', () => {
    const { v: studies } = load('bible-studies.js', 'BIBLE_STUDIES');
    const { src, v: manifest } = load('audio-manifest.js', 'AUDIO_MANIFEST');
    const keys = Object.keys(manifest).filter((k) => k.indexOf('study:') === 0);
    const independent = (src.match(/"study:[^"]+":/g) || []).length;
    expect(keys.length).toBe(independent);
    expect(keys.length).toBeGreaterThan(0);   // Purity's six today; a manifest with none makes this gate say so
    const byChapter = new Map();
    for (const s of studies) for (const c of s.chapters) byChapter.set(c.id, s.id);
    for (const k of keys) {
      const id = k.slice('study:'.length);
      expect(byChapter.has(id), k).toBe(true);
      expect(id.replace(/-ch\d+$/, ''), k).toBe(byChapter.get(id));
    }
  });
});
