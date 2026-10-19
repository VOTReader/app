/* The search visit (search200 UX B1): the reader's own back from a search hit.
   ──────────────────────────────────────────────────────────────────────────
   From a search hit, the reader's ‹ went to the parent index: a letter could
   never get back to its results by the arrows, and a Bible chapter took two
   taps. The system back (Android back / Escape, use-android-back.js) already
   returned to the results. searchBackActive() says when the on-screen ‹ and
   the "Back to results" pill must do the same, so it has to agree with the
   handler on every state: the consistency block below drives the REAL
   handler across the whole matrix of breadcrumbs and compares. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readingPlaceKey, searchBackActive, isSearchLook, SEARCH_LOOK_MS, RESULTS_LABEL } from './search-visit.js';
import { useAndroidBack } from '../hooks/use-android-back.js';
import { modalRegistry } from '../hooks/use-modal-registry.js';

describe('readingPlaceKey — one key per reading place', () => {
  it('a Bible chapter is its book and chapter', () => {
    expect(readingPlaceKey({ screen: 'bible-ch', bookId: 'psalms', chapterNum: 23 })).toBe('bible-ch:psalms:23');
  });
  it('a Matthew study chapter is its chapter (the screen fixes the book)', () => {
    expect(readingPlaceKey({ screen: 'matthew-ch', bookId: 'matthew', chapterNum: 5 })).toBe('matthew-ch:5');
    expect(readingPlaceKey({ screen: 'matthew-ch', bookId: null, chapterNum: 5 })).toBe('matthew-ch:5');
  });
  it('a study chapter is its study and chapter', () => {
    expect(readingPlaceKey({ screen: 'bible-study-chapter', studyId: 'purity', studyChapterId: 'purity-ch1' })).toBe('bible-study-chapter:purity:purity-ch1');
  });
  it('a letter, entry or topic is its screen and id', () => {
    expect(readingPlaceKey({ screen: 'vot-letter', letterId: 'the-wide-path' })).toBe('vot-letter:the-wide-path');
    expect(readingPlaceKey({ screen: 'wtlb-one-entry', letterId: 'faith-and-works' })).toBe('wtlb-one-entry:faith-and-works');
    expect(readingPlaceKey({ screen: 'answers-entry', letterId: 'tithing' })).toBe('answers-entry:tithing');
  });
  it('a half-populated place or a screen that is not for reading has none', () => {
    expect(readingPlaceKey({ screen: 'bible-ch', bookId: 'psalms', chapterNum: null })).toBe(null);
    expect(readingPlaceKey({ screen: 'vot-letter', letterId: null })).toBe(null);
    expect(readingPlaceKey({ screen: 'bible-study-chapter', studyId: 'purity', studyChapterId: null })).toBe(null);
    expect(readingPlaceKey({ screen: 'search' })).toBe(null);
    expect(readingPlaceKey({ screen: 'bible-idx', bookId: 'psalms' })).toBe(null);
  });
});

/* One answer for the arm (use-reading-position-nav.js) and the routes' read tracker
   gate (screen-routes.jsx): the reader is on the place a hit opened, with the search
   breadcrumb live, and has not read it yet (the landing is retired once they do). */
describe('isSearchLook — the place a hit opened, before the reader reads it', () => {
  const letter = { screen: 'vot-letter', letterId: 'the-wide-path' };
  it('is the landing itself, with the breadcrumb live', () => {
    expect(isSearchLook({ ...letter, fromSearch: true, searchLanding: 'vot-letter:the-wide-path' })).toBe(true);
  });
  it('is not a neighbour, a spent breadcrumb, a retired landing or a screen that is not for reading', () => {
    expect(isSearchLook({ ...letter, letterId: 'the-narrow-way', fromSearch: true, searchLanding: 'vot-letter:the-wide-path' })).toBe(false);
    expect(isSearchLook({ ...letter, fromSearch: false, searchLanding: 'vot-letter:the-wide-path' })).toBe(false);
    expect(isSearchLook({ ...letter, fromSearch: true, searchLanding: null })).toBe(false);
    expect(isSearchLook({ screen: 'search', fromSearch: true, searchLanding: 'vot-letter:the-wide-path' })).toBe(false);
  });
  it('a stay that ends the look outlasts a brief look and no more than the shortest read the tracker credits', () => {
    expect(SEARCH_LOOK_MS).toBeGreaterThanOrEqual(3000);   // the walk's looks: one or two seconds
    expect(SEARCH_LOOK_MS).toBeLessThanOrEqual(8000);      // use-read-tracker.js REQUIRED_FLOOR_MS
  });
});

describe('searchBackActive — when the reader backs to the results', () => {
  const base = { fromSearch: true, fromSurprise: false, fromWtlb: null, fromMatthewCh: null, stackLength: 0, backActive: false };
  it('is on for every reading screen a hit opens', () => {
    for (const screen of ['bible-ch', 'matthew-ch', 'bible-study-chapter', 'vot-letter', 'vot-one-letter',
      'wtlb-one-entry', 'blessed-entry', 'holy-days-entry', 'answers-entry']) {
      expect(searchBackActive({ ...base, screen }), screen).toBe(true);
    }
  });
  it('is off without a search, or when a later breadcrumb owns the back', () => {
    expect(searchBackActive({ ...base, screen: 'vot-letter', fromSearch: false })).toBe(false);
    expect(searchBackActive({ ...base, screen: 'vot-letter', fromSurprise: true })).toBe(false);
    expect(searchBackActive({ ...base, screen: 'vot-letter', stackLength: 1 })).toBe(false);
    expect(searchBackActive({ ...base, screen: 'vot-letter', fromMatthewCh: { chapterNum: 5 } })).toBe(false);
    expect(searchBackActive({ ...base, screen: 'bible-ch', backActive: true })).toBe(false);
    expect(searchBackActive({ ...base, screen: 'bible-ch', fromWtlb: 'wtlb-one-entry' })).toBe(false);
  });
  it('is off on a chapter picked from the index a search opened: its back is that index (Track D 1)', () => {
    expect(searchBackActive({ ...base, screen: 'bible-ch', fromSearchIndex: true })).toBe(false);
    expect(searchBackActive({ ...base, screen: 'matthew-ch', fromSearchIndex: true })).toBe(false);
  });
  it('is off on screens that are not for reading (the index screens keep their own back)', () => {
    for (const screen of ['search', 'home', 'bible-idx', 'matthew-idx', 'vot-index']) {
      expect(searchBackActive({ ...base, screen }), screen).toBe(false);
    }
  });
  it('names the destination for the label: "Back to results"', () => {
    expect('Back to ' + RESULTS_LABEL).toBe('Back to results');
  });
});

describe('searchBackActive agrees with the system back on every state', () => {
  beforeEach(() => {
    modalRegistry._reset();
    /** @type {any} */ (window).navHandoff = { clear: vi.fn() };
    /** @type {any} */ (window).__closeSheet = null;
  });
  afterEach(() => {
    delete window.handleAndroidBack;
    vi.restoreAllMocks();
  });

  const SCREENS = ['bible-ch', 'matthew-ch', 'bible-study-chapter', 'vot-letter', 'wtlb-one-entry',
    'blessed-entry', 'holy-days-entry', 'answers-entry'];
  const states = [];
  for (const screen of SCREENS) {
    for (let bits = 0; bits < 128; bits++) {
      states.push({
        screen,
        fromSearch: !!(bits & 1), fromSurprise: !!(bits & 2),
        fromWtlb: (bits & 4) ? 'wtlb-one-entry' : null,
        fromMatthewCh: (bits & 8) ? { chapterNum: 5 } : null,
        stackLength: (bits & 16) ? 1 : 0, backActive: !!(bits & 32),
        fromSearchIndex: !!(bits & 64),
      });
    }
  }

  it('across ' + states.length + ' states, the handler goes to the results exactly when the predicate says so', () => {
    const disagree = [];
    for (const s of states) {
      const setScreen = vi.fn();
      const props = {
        screen: s.screen, bookId: 'genesis', genreId: null,
        fromSearch: s.fromSearch, fromStudies: false, fromMatthewCh: s.fromMatthewCh, studyId: null,
        fromWtlb: s.fromWtlb, fromSurprise: s.fromSurprise, fromSearchIndex: s.fromSearchIndex,
        tabsOverviewOpen: false, journalEntryId: null,
        fromLetterRef: { current: s.stackLength ? [{ sourceScreen: 'home', destSnapshot: {} }] : [] },
        tapThroughBack: vi.fn(), backActive: s.backActive,
        setScreen, setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
        setStudyId: vi.fn(), setStudyChapterId: vi.fn(), setJournalEntryId: vi.fn(),
        setFromLetterStack: vi.fn(), setFromSearch: vi.fn(), setFromStudies: vi.fn(),
        setFromWtlb: vi.fn(), setFromMatthewCh: vi.fn(), setFromSurprise: vi.fn(),
        setTabsOverviewOpen: vi.fn(), setSurpriseAnchor: vi.fn(), setFromSearchIndex: vi.fn(),
        cancelDwell: vi.fn(), goNavOrigin: vi.fn(), goHome: vi.fn(), goSearchOrigin: vi.fn(),
        goScripturesHome: vi.fn(), goStudiesHome: vi.fn(), goVolumesHome: vi.fn(), goJournalViewer: vi.fn(),
        getStudyById: vi.fn(),
      };
      const { unmount } = renderHook(() => useAndroidBack(props));
      window.handleAndroidBack();
      unmount();
      const wentToResults = setScreen.mock.calls.some((c) => c[0] === 'search');
      if (wentToResults !== searchBackActive(s)) disagree.push({ ...s, handler: wentToResults });
    }
    expect(disagree).toEqual([]);
  });
});

/* Track D (1): round 1's "Back to results" skipped the index. A book-level hit
   ("Open book index") lands on the book's chapter index, whose back goes to the
   results; a chapter picked there went straight back to the results too, past the
   index the reader had just used. The reader's back retraces the path instead:
   chapter -> that index -> results. (fromSearchIndex: the chapter was picked from
   an index during the search trail; useSearch resets it on every hit.) */
describe('a chapter picked from the index a search opened backs to that index first', () => {
  beforeEach(() => {
    modalRegistry._reset();
    /** @type {any} */ (window).navHandoff = { clear: vi.fn() };
    /** @type {any} */ (window).__closeSheet = null;
  });
  afterEach(() => {
    delete window.handleAndroidBack;
    delete /** @type {any} */ (globalThis).BOOKS;
    vi.restoreAllMocks();
  });

  const back = (over) => {
    const props = {
      screen: 'bible-ch', bookId: 'romans', genreId: null,
      fromSearch: true, fromStudies: false, fromMatthewCh: null, studyId: null,
      fromWtlb: null, fromSurprise: false, fromSearchIndex: true,
      tabsOverviewOpen: false, journalEntryId: null,
      fromLetterRef: { current: [] }, tapThroughBack: vi.fn(), backActive: false,
      setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
      setStudyId: vi.fn(), setStudyChapterId: vi.fn(), setJournalEntryId: vi.fn(),
      setFromLetterStack: vi.fn(), setFromSearch: vi.fn(), setFromStudies: vi.fn(),
      setFromWtlb: vi.fn(), setFromMatthewCh: vi.fn(), setFromSurprise: vi.fn(),
      setTabsOverviewOpen: vi.fn(), setSurpriseAnchor: vi.fn(), setFromSearchIndex: vi.fn(),
      cancelDwell: vi.fn(), goNavOrigin: vi.fn(), goHome: vi.fn(), goSearchOrigin: vi.fn(),
      goScripturesHome: vi.fn(), goStudiesHome: vi.fn(), goVolumesHome: vi.fn(), goJournalViewer: vi.fn(),
      getStudyById: vi.fn(),
      ...over,
    };
    const { unmount } = renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    unmount();
    return props;
  };

  it('a Bible chapter: back goes to its book index, keeping the search for the back from the index', () => {
    const p = back({});
    expect(p.setScreen).toHaveBeenCalledWith('bible-idx');
    expect(p.setScreen).not.toHaveBeenCalledWith('search');
    expect(p.setChapterNum).toHaveBeenCalledWith(null);
    expect(p.setFromSearchIndex).toHaveBeenCalledWith(false);
    expect(p.setFromSearch).not.toHaveBeenCalledWith(false);
  });

  it('a one-chapter book too: back goes to the index the reader picked it from, not the genre', () => {
    /** @type {any} */ (globalThis).BOOKS = { jude: { id: 'jude', chapters: [{ num: 1 }] } };
    const p = back({ bookId: 'jude', genreId: 'general-epistles' });
    expect(p.setScreen).toHaveBeenCalledWith('bible-idx');
    expect(p.goScripturesHome).not.toHaveBeenCalled();
  });

  it('a Matthew study chapter: back goes to the Matthew index', () => {
    const p = back({ screen: 'matthew-ch', bookId: 'matthew' });
    expect(p.setScreen).toHaveBeenCalledWith('matthew-idx');
    expect(p.setScreen).not.toHaveBeenCalledWith('search');
    expect(p.setFromSearchIndex).toHaveBeenCalledWith(false);
  });

  it('then the index backs to the results', () => {
    for (const screen of ['bible-idx', 'matthew-idx']) {
      const p = back({ screen, fromSearchIndex: false });
      expect(p.setScreen, screen).toHaveBeenCalledWith('search');
    }
  });

  it('a chapter a hit opened (no index on the way) still backs to the results', () => {
    const p = back({ fromSearchIndex: false });
    expect(p.setScreen).toHaveBeenCalledWith('search');
  });
});
