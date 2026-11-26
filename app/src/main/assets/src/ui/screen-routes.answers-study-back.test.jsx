// @ts-nocheck — free-var globals stubbed per test; the props stub follows screen-routes.songs-back.test.jsx
/* reading2-1 (audit 2026-11-23): a study link in an Answers topic opened the study with no way back recorded, so
   the pill never showed and Back went to Studies. The link now records the topic as a tap-through source, with the
   destination selectStudy really lands on: the single page of a one-part study, or the index of a study in parts. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildScreenRoutes } from './screen-routes.jsx';
import { COL_BY_KEY } from '../data/scripture-resolution.js';

const STUDIES = {
  'in-parts': { id: 'in-parts', slug: 'in-parts', title: 'A Study In Parts', chapters: [{ id: 'p1' }, { id: 'p2' }] },
  'one-page': { id: 'one-page', slug: 'one-page', title: 'One Page', chapters: [{ id: 'only' }] },
  'locked': { id: 'locked', slug: 'locked', title: 'Locked', locked: true, chapters: [{ id: 'x' }] },
};

function topicNav(over = {}) {
  const props = {
    screen: 'answers-entry', letterId: 'the-topic', book: null, chapter: null, bookId: null, chapterNum: null,
    settings: {},
    activeVolKey: 'answers', activeLetter: { id: 'the-topic', title: 'Who Is The Holy Spirit?' },
    boundaryConfig: vi.fn(() => ({})),
    readHistory: [],
    goNavOrigin: vi.fn(), goSearch: vi.fn(), goSettings: vi.fn(), goHistory: vi.fn(),
    getStudyById: vi.fn((id) => STUDIES[id] || null),
    studyReadKey: vi.fn((slug) => 'bible-study-' + slug),
    setActiveReadKey: vi.fn(), setLastReadChapters: vi.fn(), setLastReadForVol: vi.fn(),
    setGenreId: vi.fn(), navigateToLink: vi.fn(),
    theme: 'dark', setTheme: vi.fn(),
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    setNavOrigin: vi.fn(), navOrigin: null, pushFromLetter: vi.fn(),
    fromSearch: false, setFromSearch: vi.fn(), fromStudies: false, setFromStudies: vi.fn(),
    genreId: null, setSurpriseAnchor: vi.fn(),
    goStudiesHome: vi.fn(), goScripturesHome: vi.fn(), goHome: vi.fn(), goBibleIdx: vi.fn(),
    selectMatthewCh: vi.fn(), selectBibleCh: vi.fn(), selectStudy: vi.fn(), selectStudyChapter: vi.fn(),
    activeReadKey: null, lastReadChapters: {},
    markRead: vi.fn(), unmarkRead: vi.fn(),
    getReadKey: vi.fn(() => 'k'), readKeyFor: vi.fn(() => 'k'), isRead: vi.fn(() => false),
    surpriseAnchor: null,
    ...over,
  };
  const el = buildScreenRoutes(props)['answers-entry']();
  return { props, nav: el.props.answers };
}

beforeEach(() => {
  globalThis.COL_BY_KEY = COL_BY_KEY;
  globalThis.ANSWERS = [];
  globalThis.WtlbEntryView = () => null;
  window.__answersCorpus = { loaded: true };
  window.__votCorpus = { loaded: true };
});
afterEach(() => {
  delete globalThis.COL_BY_KEY; delete globalThis.ANSWERS; delete globalThis.WtlbEntryView;
  delete window.__answersCorpus; delete window.__votCorpus;
  vi.restoreAllMocks();
});

describe('reading2-1: a study link in an Answers topic keeps the way back', () => {
  it('a study in parts: the entry names the topic and waits on the study index', () => {
    const { props, nav } = topicNav();
    nav.openStudy('in-parts', 'https://example.invalid/study');
    expect(props.pushFromLetter).toHaveBeenCalledTimes(1);
    const e = props.pushFromLetter.mock.calls[0][0];
    expect(e.sourceScreen).toBe('answers-entry');
    expect(e.sourceLetterId).toBe('the-topic');
    expect(e.sourceLetterTitle).toBe('Who Is The Holy Spirit?');
    expect(e.destSnapshot).toEqual(expect.objectContaining({ screen: 'bible-study-index', studyId: 'in-parts', studyChapterId: null }));
    expect(props.selectStudy).toHaveBeenCalledWith('in-parts');
  });

  it('a one-page study: the entry waits on that page', () => {
    const { props, nav } = topicNav();
    nav.openStudy('one-page');
    const e = props.pushFromLetter.mock.calls[0][0];
    expect(e.destSnapshot).toEqual(expect.objectContaining({ screen: 'bible-study-chapter', studyId: 'one-page', studyChapterId: 'only' }));
  });

  it('a locked study stays in the app, as before: no web page, no back entry', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { props, nav } = topicNav();
    nav.openStudy('locked', 'https://example.invalid/locked');
    expect(open).not.toHaveBeenCalled();
    expect(props.pushFromLetter).not.toHaveBeenCalled();
  });

  it('a study the app does not have opens its web page and records nothing', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { props, nav } = topicNav();
    nav.openStudy('not-here', 'https://example.invalid/missing');
    expect(props.pushFromLetter).not.toHaveBeenCalled();
    expect(props.selectStudy).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
