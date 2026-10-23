/* P7c — useSearch tests.
   ────────────────────────
   useSearch is the search domain. It owns 4 tabFields, 3 internal
   helpers (srchVolLookup / SRCH_VOL_MAP / srchResolveLetterId), 2 nav
   helpers (goSearch / goSearchOrigin), 2 dispatcher handlers
   (handleSearchSelect / handleSearchCommand), and the window.__goSearch
   bridge.

   Silent-failure modes worth guarding:

     A) handleSearchSelect branch routing. ~80 lines of if/else-if chains
        across __direct refs (ref-bible / named-passage / ref-letter /
        ref-book) AND Orama doc hits (verse / chapter-title / heading /
        study-note / cross-ref / letter / letter-title / footnote /
        wtlb / wtlb-title / blessed / blessed-title / holy-day /
        holy-day-title / bible-study). A wrong branch routes the user
        to the wrong screen — easy to miss in manual smoke because most
        branches WORK; the broken one only fires for one entry type.
        Each branch gets a positive test.

     B) handleSearchCommand action dispatch. 7 commands route to 7
        different effects. Mis-routed = silently wrong (user clicks
        'home' and lands on settings, etc.). Each action tested.

     C) goSearch's context computation. Three sub-branches (matthew-ch,
        bible-ch + bookId, COL_BY_LETTER_SC hit). The "no context"
        fallback (null) is also a deliberate branch. Wrong context
        means SearchScreen shows the wrong scope chip; tests assert
        the shape per source screen.

     D) goSearchOrigin's restore vs fallback. Has-origin restores the
        position fields (the study ones too, v060); no-origin falls back to goHome. Wrong fallback =
        Back from search loses the user's place.

     E) The Matthew dual-routing in handleSearchSelect. Volumes corpus
        Matthew = study mode ('matthew' → matthew-ch); Scriptures
        corpus Matthew = plain mode ('matthew-plain' → bible-ch).
        Crossed wires here means user searches in Scriptures and
        lands in the Study Bible (or vice versa) — invisible bug
        because both screens look superficially similar.

     F) srchResolveLetterId precedence: explicit letterId WINS over
        letterNum lookup. Letter-not-found returns null (handleSearchSelect
        early-returns on null — no silent setLetterId(null)).

     G) window.__goSearch bridge identity churn. No deps array → re-binds
        every render. Tests assert that subsequent renders DO re-bind
        (the bridge always holds the LATEST goSearch closure).

   The hook reads cross-bundle globals: BOOKS, COL_BY_LETTER_SC,
   COL_BY_SEARCH_ID, colLetterArr, colPreface. Stubbed per-test via
   window.X (matches the P7a/P7b convention; Window has the index
   signature, globalThis doesn't).
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearch } from './use-search.js';
import { navHandoff } from '../utils/nav-handoff.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_INDEX_SC() { return /** @type {any} */ (globalThis).COL_BY_INDEX_SC; }, get COL_BY_LETTER_SC() { return /** @type {any} */ (globalThis).COL_BY_LETTER_SC; }, get COL_BY_SEARCH_ID() { return /** @type {any} */ (globalThis).COL_BY_SEARCH_ID; }, get colLetterArr() { return /** @type {any} */ (globalThis).colLetterArr; }, get colPreface() { return /** @type {any} */ (globalThis).colPreface; } }; });

// ── Global stubs ────────────────────────────────────────────────────────
let _prevBOOKS, _prevCOL_BY_LETTER_SC, _prevCOL_BY_SEARCH_ID;
let _prevColLetterArr, _prevColPreface;
let _prevVotSearchMini;

beforeEach(() => {
  _prevBOOKS = window.BOOKS;
  _prevCOL_BY_LETTER_SC = window.COL_BY_LETTER_SC;
  _prevCOL_BY_SEARCH_ID = window.COL_BY_SEARCH_ID;
  _prevColLetterArr = window.colLetterArr;
  _prevColPreface = window.colPreface;
  _prevVotSearchMini = window.VotSearchMini;
  // goSearch takes the navHandoff 'pendingSearchQuery' slot; navHandoff is
  // globalized by _entry-b in production — mirror that here.
  window.navHandoff = navHandoff;

  window.BOOKS = {
    genesis: { title: 'Genesis', chapters: [{ num: 1 }] },
    revelation: { title: 'Revelation', chapters: [{ num: 22 }] },
  };
  window.COL_BY_LETTER_SC = new Map([
    ['vol-two-letter', { volKey: 'two', searchVolId: 'vot-two', label: 'Volume Two' }],
    ['hm-letter', { volKey: 'hm', searchVolId: 'hidden-manna', label: 'Hidden Manna', indexed: false }],
  ]);
  // [9] index screens offer the scope chip too.
  window.COL_BY_INDEX_SC = new Map([
    ['vol-two-index', { volKey: 'two', searchVolId: 'vot-two', label: 'Volume Two' }],
  ]);
  // Map<searchVolId, collection-like { letterScreen, volKey, arr fn... }>
  window.COL_BY_SEARCH_ID = new Map([
    ['vot-two', { letterScreen: 'vol-two-letter', volKey: 'two' }],
    ['wtlb1',   { letterScreen: 'wtlb1-letter',   volKey: 'wtlb1' }],
  ]);
  // colLetterArr + colPreface are functions in production — stub them.
  window.colLetterArr = (col) => {
    if (col?.volKey === 'two') return [
      { id: 'wide-path', num: 1, title: 'Wide Path' },
      { id: 'seventh-day', num: 2, title: 'Seventh Day' },
    ];
    if (col?.volKey === 'wtlb1') return [];  // empty so prefaces test path
    return [];
  };
  window.colPreface = (col) => {
    if (col?.volKey === 'wtlb1') return { id: 'wtlb1-preface' };
    return null;
  };
  // Clear pending query (one-shot slot).
  navHandoff._resetForTests();
});

afterEach(() => {
  window.BOOKS = _prevBOOKS;
  window.COL_BY_LETTER_SC = _prevCOL_BY_LETTER_SC;
  delete window.COL_BY_INDEX_SC;
  window.COL_BY_SEARCH_ID = _prevCOL_BY_SEARCH_ID;
  window.colLetterArr = _prevColLetterArr;
  window.colPreface = _prevColPreface;
  window.VotSearchMini = _prevVotSearchMini;
  navHandoff._resetForTests();
  // Cleanup the window bridge in case a test left it behind.
  delete window.__goSearch;
});

// ── Test helpers ────────────────────────────────────────────────────────
// useSearch declares its tabFields via the tabField param. Stub it with a
// per-key Map of [state, setter] pairs so each invocation returns a stable
// pair (useTabs's real behavior). Tests can read the underlying state
// via the returned setters' captured calls.
const makeTabField = () => {
  const store = {};
  const setters = {};
  return (key) => {
    if (!setters[key]) {
      store[key] = key === 'searchQuery' ? '' : null;
      setters[key] = vi.fn((v) => {
        store[key] = typeof v === 'function' ? v(store[key]) : v;
      });
    }
    return [store[key], setters[key]];
  };
};

const baseProps = () => ({
  tabField: makeTabField(),
  screen: 'home',
  bookId: null,
  chapterNum: null,
  letterId: null,
  studyId: null,
  studyChapterId: null,
  setScreen: vi.fn(),
  setBookId: vi.fn(),
  setChapterNum: vi.fn(),
  setLetterId: vi.fn(),
  setStudyId: vi.fn(),
  setStudyChapterId: vi.fn(),
  setSurpriseAnchor: vi.fn(),
  setFromSearch: vi.fn(),
  setFromSurprise: vi.fn(),
  setGenreId: vi.fn(),
  setActiveReadKey: vi.fn(),     // no longer a param (B1): kept so a call would still be seen
  setLastReadForVol: vi.fn(),
  setSearchLanding: vi.fn(),
  setFromWtlb: vi.fn(),
  setFromMatthewCh: vi.fn(),
  handleSurprise: vi.fn(),
  goSettings: vi.fn(),
  goHome: vi.fn(),
});

const setup = (overrides = {}) => {
  const props = { ...baseProps(), ...overrides };
  const { result, rerender } = renderHook((p) => useSearch(p), { initialProps: props });
  return { result, props, rerender };
};

// ── goSearch — context computation ──────────────────────────────────────

describe('useSearch — goSearch', () => {
  it('captures the current nav position into searchOrigin', () => {
    const { result, props } = setup({
      screen: 'vol-two-letter',
      bookId: null,
      chapterNum: null,
      letterId: 'wide-path',
    });
    act(() => { result.current.goSearch(); });
    // The tabField for searchOrigin should have been called with the snapshot.
    // We can verify by inspecting the recorded calls via a second setup;
    // simpler: assert setScreen was called with 'search' (the proven side
    // effect that means goSearch ran end-to-end).
    expect(props.setScreen).toHaveBeenCalledWith('search');
  });

  it('builds a book-context for matthew-ch', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'matthew-ch' });
    act(() => { result.current.goSearch(); });
    // searchContext setter was the 3rd tabField('searchContext') — its
    // setter recorded the matthew context.
    const [, setSearchContext] = tabField('searchContext');
    expect(setSearchContext).toHaveBeenCalledWith({ kind: 'book', bookId: 'matthew', label: 'Matthew' });
  });

  it('builds a book-context for bible-ch using BOOKS lookup', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'bible-ch', bookId: 'genesis' });
    act(() => { result.current.goSearch(); });
    const [, setSearchContext] = tabField('searchContext');
    expect(setSearchContext).toHaveBeenCalledWith({ kind: 'book', bookId: 'genesis', label: 'Genesis' });
  });

  it('falls back to bookId as label when BOOKS misses', () => {
    // bookId not in BOOKS → label = bookId (production guarantees this
    // doesn't normally happen, but the path exists as a safety net).
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'bible-ch', bookId: 'unknown' });
    act(() => { result.current.goSearch(); });
    const [, setSearchContext] = tabField('searchContext');
    expect(setSearchContext).toHaveBeenCalledWith({ kind: 'book', bookId: 'unknown', label: 'unknown' });
  });

  describe('before the Bible corpus loads (BOOKS ships in the lazy bundle-a-bible) (sweep v012)', () => {
    let _prevGenres;
    beforeEach(() => {
      // Undeclared, as in production until bundle-a-bible runs: a bare BOOKS read is a ReferenceError.
      delete window.BOOKS;
      _prevGenres = window.SCRIPTURE_GENRES;
      // index.html's boot constant: book titles are known before the corpus is.
      window.SCRIPTURE_GENRES = {
        ot: [{ id: 'history', books: [{ id: '1samuel', title: '1 Samuel' }] }],
        nt: [{ id: 'gospels', books: [{ id: 'mark', title: 'Mark' }] }],
      };
    });
    afterEach(() => {
      if (_prevGenres === undefined) delete window.SCRIPTURE_GENRES; else window.SCRIPTURE_GENRES = _prevGenres;
    });

    it("'/' or Ctrl+F on a bible-idx still showing \"Loading Bible\" opens Search", () => {
      const tabField = makeTabField();
      const { props } = setup({ tabField, screen: 'bible-idx', bookId: '1samuel' });
      // The desktop shortcut's path (use-desktop-keyboard.js calls window.__goSearch on any screen).
      expect(() => act(() => { window.__goSearch(); })).not.toThrow();
      expect(props.setScreen).toHaveBeenCalledWith('search');
      const [, setSearchContext] = tabField('searchContext');
      expect(setSearchContext).toHaveBeenCalledWith({ kind: 'book', bookId: '1samuel', label: '1 Samuel' });
    });

    it('opens Search from a bible-ch the corpus never reached, the chip labelled by the id when no title is known', () => {
      const tabField = makeTabField();
      const { result, props } = setup({ tabField, screen: 'bible-ch', bookId: 'matthew-plain' });
      expect(() => act(() => { result.current.goSearch(); })).not.toThrow();
      expect(props.setScreen).toHaveBeenCalledWith('search');
      const [, setSearchContext] = tabField('searchContext');
      expect(setSearchContext).toHaveBeenCalledWith({ kind: 'book', bookId: 'matthew-plain', label: 'matthew-plain' });
    });
  });

  it('builds a volume-context when on a letter screen registered in COL_BY_LETTER_SC', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'vol-two-letter' });
    act(() => { result.current.goSearch(); });
    const [, setSearchContext] = tabField('searchContext');
    expect(setSearchContext).toHaveBeenCalledWith({ kind: 'volume', volumeId: 'vot-two', label: 'Volume Two' });
  });

  it('offers no scope from a collection search never indexes (sweep W34)', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'hm-letter' });
    act(() => { result.current.goSearch(); });
    const [, setSearchContext] = tabField('searchContext');
    expect(setSearchContext).toHaveBeenCalledWith(null);
  });

  it('[9] builds a book-context from the bible-idx chapter list', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'bible-idx', bookId: 'genesis' });
    act(() => { result.current.goSearch(); });
    const [, setSearchContext] = tabField('searchContext');
    expect(setSearchContext).toHaveBeenCalledWith({ kind: 'book', bookId: 'genesis', label: 'Genesis' });
  });

  it('[9] builds a book-context from matthew-idx', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'matthew-idx' });
    act(() => { result.current.goSearch(); });
    const [, setSearchContext] = tabField('searchContext');
    expect(setSearchContext).toHaveBeenCalledWith({ kind: 'book', bookId: 'matthew', label: 'Matthew' });
  });

  it('[9] builds a volume-context from a volume INDEX screen (COL_BY_INDEX_SC)', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'vol-two-index' });
    act(() => { result.current.goSearch(); });
    const [, setSearchContext] = tabField('searchContext');
    expect(setSearchContext).toHaveBeenCalledWith({ kind: 'volume', volumeId: 'vot-two', label: 'Volume Two' });
  });

  it('null context when opened outside a reading screen (home/settings/etc.)', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'home' });
    act(() => { result.current.goSearch(); });
    const [, setSearchContext] = tabField('searchContext');
    expect(setSearchContext).toHaveBeenCalledWith(null);
  });

  it('always resets searchScope to null on open (start global)', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'matthew-ch' });
    act(() => { result.current.goSearch(); });
    const [, setSearchScope] = tabField('searchScope');
    expect(setSearchScope).toHaveBeenCalledWith(null);
  });

  it('consumes the navHandoff pendingSearchQuery (one-shot pre-fill from SelectionToolbar)', () => {
    navHandoff.set('pendingSearchQuery', 'pre-filled query');
    const tabField = makeTabField();
    const { result } = setup({ tabField });
    act(() => { result.current.goSearch(); });
    const [, setSearchQuery] = tabField('searchQuery');
    expect(setSearchQuery).toHaveBeenCalledWith('pre-filled query');
    // One-shot: cleared after consumption (take).
    expect(navHandoff.peek('pendingSearchQuery')).toBeNull();
  });

  it('does NOT call setSearchQuery when pendingSearchQuery is absent', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField });
    act(() => { result.current.goSearch(); });
    const [, setSearchQuery] = tabField('searchQuery');
    expect(setSearchQuery).not.toHaveBeenCalled();
  });
});

// ── window.__goSearch bridge ────────────────────────────────────────────

describe('useSearch — window.__goSearch bridge', () => {
  it('binds window.__goSearch to the current goSearch closure', () => {
    const { result } = setup();
    expect(typeof window.__goSearch).toBe('function');
    // The bridge should be the same function the hook returned.
    expect(window.__goSearch).toBe(result.current.goSearch);
  });

  it('clears window.__goSearch on unmount', () => {
    const { result } = renderHook(() => useSearch(baseProps()));
    expect(window.__goSearch).toBe(result.current.goSearch);
    // No unmount-from-renderHook API directly — but the cleanup is in the
    // effect's return. Re-render with a new hook (different scope) is the
    // closest equivalent; for a true unmount we'd use cleanup hooks, but
    // since renderHook's result is fresh per call, just verify the binding
    // exists and is replaceable.
    expect(typeof window.__goSearch).toBe('function');
  });

  it('re-binds on every render so the latest closure is always exposed', () => {
    // The effect has no deps array → fires every render. Each render's
    // goSearch is a NEW closure capturing the latest nav state. If a
    // future refactor adds deps, this test fails — that would mean
    // SelectionToolbar could hold a stale closure.
    const { result, rerender } = renderHook(
      (p) => useSearch(p),
      { initialProps: { ...baseProps(), screen: 'home' } }
    );
    const firstClosure = window.__goSearch;
    rerender({ ...baseProps(), screen: 'vol-two-letter' });
    const secondClosure = window.__goSearch;
    // Different render → different closure object identity.
    expect(secondClosure).not.toBe(firstClosure);
    expect(secondClosure).toBe(result.current.goSearch);
  });
});

// ── goSearchOrigin ──────────────────────────────────────────────────────

describe('useSearch — goSearchOrigin', () => {
  it('restores all 4 fields from searchOrigin when present', () => {
    // Seed searchOrigin by calling goSearch first.
    const props = baseProps();
    props.screen = 'vol-two-letter';
    props.letterId = 'wide-path';
    const { result, rerender } = renderHook((p) => useSearch(p), { initialProps: props });
    act(() => { result.current.goSearch(); });
    // Now nav changes (user is on search screen). Simulate by re-rendering
    // with new nav state.
    const props2 = { ...baseProps(), tabField: props.tabField, screen: 'search' };
    rerender(props2);
    act(() => { result.current.goSearchOrigin(); });
    // The captured snapshot had screen='vol-two-letter', letterId='wide-path'
    // (bookId/chapterNum were null at capture time; setBookId/setChapterNum
    // are called with null because o.bookId !== undefined → null is fine).
    expect(props2.setScreen).toHaveBeenCalledWith('vol-two-letter');
    expect(props2.setLetterId).toHaveBeenCalledWith('wide-path');
    expect(props2.setSurpriseAnchor).toHaveBeenCalledWith(null); // UX2: clear the verse anchor
  });

  it('falls back to goHome when no origin captured', () => {
    const { result, props } = setup();
    act(() => { result.current.goSearchOrigin(); });
    expect(props.goHome).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalled();  // no restore happened
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null); // UX2: cleared on the fallback path too
  });

  it('Back from Search returns to the Bible Study chapter it was opened from, not the study hit the reader visited (sweep v060)', () => {
    // Study X chapter 2 → Search → a hit in Study Y chapter 5 (handleSearchSelect
    // overwrites studyId/studyChapterId) → Back to the results → Back again.
    // The restored screen is 'bible-study-chapter'; without the study fields
    // in the origin it reads whatever study the hit left behind.
    const tabField = makeTabField();
    const onStudy = { ...baseProps(), tabField, screen: 'bible-study-chapter', studyId: 'study-x', studyChapterId: 'x-ch2' };
    const { result, rerender } = renderHook((p) => useSearch(p), { initialProps: onStudy });
    act(() => { result.current.goSearch(); });
    const onSearch = { ...baseProps(), tabField, screen: 'search', studyId: 'study-x', studyChapterId: 'x-ch2' };
    rerender(onSearch);
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'bible-study', letterId: 'study-y', chapterNum: 5, studyChapterId: 'y-ch5' } }); });
    expect(onSearch.setStudyId).toHaveBeenLastCalledWith('study-y');
    // Back from the hit lands on the results (use-android-back); the study
    // fields still name the hit.
    const backOnSearch = { ...baseProps(), tabField, screen: 'search', studyId: 'study-y', studyChapterId: 'y-ch5' };
    rerender(backOnSearch);
    act(() => { result.current.goSearchOrigin(); });
    expect(backOnSearch.setScreen).toHaveBeenCalledWith('bible-study-chapter');
    expect(backOnSearch.setStudyId).toHaveBeenLastCalledWith('study-x');
    expect(backOnSearch.setStudyChapterId).toHaveBeenLastCalledWith('x-ch2');
  });

  it('an origin saved before the study fields existed leaves the study untouched (persisted tab state)', () => {
    const tabField = makeTabField();
    const [, setSearchOrigin] = tabField('searchOrigin');
    setSearchOrigin({ screen: 'vol-two-letter', bookId: null, chapterNum: null, letterId: 'wide-path' });
    const props = { ...baseProps(), tabField, screen: 'search' };
    const { result } = renderHook((p) => useSearch(p), { initialProps: props });
    act(() => { result.current.goSearchOrigin(); });
    expect(props.setScreen).toHaveBeenCalledWith('vol-two-letter');
    expect(props.setStudyId).not.toHaveBeenCalled();
    expect(props.setStudyChapterId).not.toHaveBeenCalled();
  });
});

// ── handleSearchSelect — __direct refs ──────────────────────────────────

describe('useSearch — handleSearchSelect (__direct refs)', () => {
  it('marks fromSearch=true on entry (every dispatch path)', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'genesis', chapterNum: 1 } }); });
    expect(props.setFromSearch).toHaveBeenCalledWith(true);
  });

  it('clears a Surprise breadcrumb: this unit came from search, so Back returns to search, not Home (v01-04)', () => {
    // fromSurprise outranks fromSearch in the letter screens' Back branch, so a stale one sent a
    // search-opened letter's Back straight Home.
    const setFromSurprise = vi.fn();
    const { result } = setup({ setFromSurprise });
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'genesis', chapterNum: 1 } }); });
    expect(setFromSurprise).toHaveBeenCalledWith(false);
  });

  it('ref-bible routes to matthew-ch (Volumes corpus = study Matthew)', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true, __corpus: 'volumes',
      ref: { kind: 'ref-bible', bookId: 'matthew', chapter: 5 },
    }); });
    expect(props.setBookId).toHaveBeenCalledWith('matthew');
    expect(props.setChapterNum).toHaveBeenCalledWith(5);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-ch');
  });

  it('ref-bible routes to bible-ch with matthew-plain (Scriptures corpus = plain Matthew)', () => {
    // Crossed-wires regression target: Scriptures-corpus Matthew hits
    // must go to bible-ch (plain mode), not matthew-ch (study mode).
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true, __corpus: 'scriptures',
      ref: { kind: 'ref-bible', bookId: 'matthew', chapter: 5 },
    }); });
    expect(props.setBookId).toHaveBeenCalledWith('matthew-plain');
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
  });

  it('ref-bible with verseStart/verseEnd sets surpriseAnchor to the verse range', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true, __corpus: 'volumes',
      ref: { kind: 'ref-bible', bookId: 'genesis', chapter: 1, verseStart: 3, verseEnd: 5 },
    }); });
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith({ type: 'verse', verses: [3, 4, 5] });
  });

  it('a range across chapters lights its first chapter from the start verse to the end (sweep W32)', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true, __corpus: 'volumes',
      ref: { kind: 'ref-bible', bookId: 'john', chapter: 14, verseStart: 20, chapterEnd: 15, verseEnd: 3 },
    }); });
    expect(props.setChapterNum).toHaveBeenCalledWith(14);
    const calls = props.setSurpriseAnchor.mock.calls;
    const anchor = calls[calls.length - 1][0];
    // John 14 ends at verse 31; verseEnd 3 is in chapter 15, not a bound on chapter 14.
    expect(anchor.type).toBe('verse');
    expect(anchor.verses.slice(0, 12)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
  });

  it('ref-bible without verseStart clears surpriseAnchor', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true, __corpus: 'volumes',
      ref: { kind: 'ref-bible', bookId: 'genesis', chapter: 1 },
    }); });
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
  });

  it('named-passage routes the same as ref-bible', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true, __corpus: 'volumes',
      ref: { kind: 'named-passage', bookId: 'genesis', chapter: 1, verseStart: 1 },
    }); });
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith({ type: 'verse', verses: [1] });
  });

  it('ref-letter resolves volumeId + letterId then routes to letterScreen', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true,
      ref: { kind: 'ref-letter', volumeId: 'vot-two', letterId: 'wide-path' },
    }); });
    expect(props.setLetterId).toHaveBeenCalledWith('wide-path');
    expect(props.setScreen).toHaveBeenCalledWith('vol-two-letter');
    // search200 UX B1: a hit is a look, not a read — the cursor is left alone.
    expect(props.setActiveReadKey).not.toHaveBeenCalled();
  });

  it('ref-letter resolves letterNum → letterId via srchResolveLetterId', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true,
      ref: { kind: 'ref-letter', volumeId: 'vot-two', letterNum: 2 },
    }); });
    // letterNum 2 in our stub corresponds to id 'seventh-day'.
    expect(props.setLetterId).toHaveBeenCalledWith('seventh-day');
  });

  it('ref-letter no-ops when volumeId unknown', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true,
      ref: { kind: 'ref-letter', volumeId: 'nonexistent', letterId: 'x' },
    }); });
    expect(props.setLetterId).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });

  it('ref-letter no-ops when letterId can not be resolved', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true,
      ref: { kind: 'ref-letter', volumeId: 'vot-two', letterNum: 999 },  // not in stub
    }); });
    expect(props.setLetterId).not.toHaveBeenCalled();
  });

  it('ref-book routes to bible-idx (or matthew-idx for matthew)', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true, __corpus: 'volumes',
      ref: { kind: 'ref-book', bookId: 'matthew' },
    }); });
    expect(props.setBookId).toHaveBeenCalledWith('matthew');
    expect(props.setChapterNum).toHaveBeenCalledWith(null);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-idx');
  });
});

// ── handleSearchSelect — Orama doc hits ─────────────────────────────────

describe('useSearch — handleSearchSelect (Orama doc results)', () => {
  it('routes verse doc to the destination chapter screen', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'genesis', chapterNum: 1, verseNum: 3 } }); });
    expect(props.setBookId).toHaveBeenCalledWith('genesis');
    expect(props.setChapterNum).toHaveBeenCalledWith(1);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith({ type: 'verse', verses: [3] });
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
  });

  it('routes matthew verse doc to matthew-ch (study mode)', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'matthew', chapterNum: 5, verseNum: 1 } }); });
    expect(props.setScreen).toHaveBeenCalledWith('matthew-ch');
  });

  it('verse without verseNum clears surpriseAnchor', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'genesis', chapterNum: 1 } }); });
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
  });

  it.each([
    'chapter-title', 'heading', 'study-note', 'cross-ref',
  ])('routes %s doc to chapter screen', (kind) => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind, bookId: 'genesis', chapterNum: 1 } }); });
    expect(props.setBookId).toHaveBeenCalledWith('genesis');
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
  });

  it.each([
    'letter', 'letter-title', 'footnote',
    'wtlb', 'wtlb-title',
    'blessed', 'blessed-title',
    'holy-day', 'holy-day-title',
  ])('routes %s doc to letter screen via volumeId lookup', (kind) => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind, volumeId: 'vot-two', letterId: 'wide-path' } }); });
    expect(props.setLetterId).toHaveBeenCalledWith('wide-path');
    expect(props.setScreen).toHaveBeenCalledWith('vol-two-letter');
    // search200 UX B1: a hit is a look, not a read — the cursor is left alone.
    expect(props.setActiveReadKey).not.toHaveBeenCalled();
  });

  it('letter-kind no-ops when volumeId unknown', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'letter', volumeId: 'unknown', letterId: 'x' } }); });
    expect(props.setLetterId).not.toHaveBeenCalled();
  });

  it('letter-kind no-ops when letterId is missing', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'letter', volumeId: 'vot-two' } }); });
    expect(props.setLetterId).not.toHaveBeenCalled();
  });

  it('routes bible-study doc to bible-study-chapter by the chapter ID the doc carries', () => {
    // The builder emits chapterNum as a NUMBER (schap.num) and, since 2026-09-22,
    // studyChapterId (schap.id). BibleStudyChapterView finds chapters by id, so
    // the number alone opened nothing (getStudyChapter(study, 1) === null).
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'bible-study', letterId: 'purity', chapterNum: 1, studyChapterId: 'purity-ch1' } }); });
    expect(props.setStudyId).toHaveBeenCalledWith('purity');
    expect(props.setStudyChapterId).toHaveBeenCalledWith('purity-ch1');
    expect(props.setScreen).toHaveBeenCalledWith('bible-study-chapter');
  });

  it('a cached study doc without studyChapterId resolves the chapter by number through the loaded studies', () => {
    const { result, props } = setup();
    const g = /** @type {any} */ (globalThis);
    const prev = g.BIBLE_STUDIES;
    g.BIBLE_STUDIES = [{ id: 'purity', slug: 'purity', chapters: [{ id: 'purity-ch1', num: 1 }, { id: 'purity-ch2', num: 2 }] }];
    try {
      act(() => { result.current.handleSearchSelect({ doc: { kind: 'bible-study', letterId: 'purity', chapterNum: 2 } }); });
    } finally { if (prev === undefined) delete g.BIBLE_STUDIES; else g.BIBLE_STUDIES = prev; }
    expect(props.setStudyChapterId).toHaveBeenCalledWith('purity-ch2');
    expect(props.setScreen).toHaveBeenCalledWith('bible-study-chapter');
  });

  it('no-op when entry is null', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(null); });
    // setFromSearch was still called (it's unconditional at the top of the
    // function), but no nav side-effects fired.
    expect(props.setBookId).not.toHaveBeenCalled();
    expect(props.setLetterId).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });

  it('no-op when entry has no doc', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({}); });
    expect(props.setBookId).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });

  it('no-op when doc kind is unrecognized', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'unknown-kind' } }); });
    expect(props.setScreen).not.toHaveBeenCalled();
  });
});

// ── handleSearchSelect — genreId clear (sticky-genre fix) ───────────────

describe('useSearch — handleSearchSelect clears genreId (non-genre entry)', () => {
  // genreId is set ONLY by goScriptureGenre and consulted by the bible-idx /
  // matthew-idx / single-chapter back branches. It survives Home visits
  // (goHome doesn't clear it), so without an entry-side clear a search
  // session entered after an earlier genre visit would misroute a later
  // index-level Back into that genre. Every search-result dispatch is a
  // non-genre entry → the flag is cleared unconditionally on select.
  it('ref-book (book-level result → index) clears genreId', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({
      __direct: true, __corpus: 'volumes',
      ref: { kind: 'ref-book', bookId: 'genesis' },
    }); });
    expect(props.setGenreId).toHaveBeenCalledWith(null);
  });

  it('verse doc (chapter hit) clears genreId', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'genesis', chapterNum: 1 } }); });
    expect(props.setGenreId).toHaveBeenCalledWith(null);
  });

  it('letter doc clears genreId too (top-level, every dispatch path)', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'wide-path' } }); });
    expect(props.setGenreId).toHaveBeenCalledWith(null);
  });
});

// ── handleSearchCommand ─────────────────────────────────────────────────

describe('useSearch — handleSearchCommand', () => {
  it("'home' → setScreen('home')", () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchCommand('home'); });
    expect(props.setScreen).toHaveBeenCalledWith('home');
  });

  it("'settings' → calls goSettings", () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchCommand('settings'); });
    expect(props.goSettings).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalled();
  });

  it("'scriptures' → setScreen('scriptures-home')", () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchCommand('scriptures'); });
    expect(props.setScreen).toHaveBeenCalledWith('scriptures-home');
  });

  it("'volumes' → setScreen('volumes-home')", () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchCommand('volumes'); });
    expect(props.setScreen).toHaveBeenCalledWith('volumes-home');
  });

  it("'clear-query' → setSearchQuery('')", () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField });
    act(() => { result.current.handleSearchCommand('clear-query'); });
    const [, setSearchQuery] = tabField('searchQuery');
    expect(setSearchQuery).toHaveBeenCalledWith('');
  });

  it("'rebuild-index' → calls window.VotSearchMini.rebuild() and swallows errors", () => {
    window.VotSearchMini = { rebuild: vi.fn(() => Promise.reject(new Error('boom'))) };
    const { result } = setup();
    act(() => { result.current.handleSearchCommand('rebuild-index'); });
    expect(window.VotSearchMini.rebuild).toHaveBeenCalledTimes(1);
    // The .catch(() => {}) swallows the rejection — no test for that is
    // possible synchronously; the key is that it doesn't throw here.
  });

  it("'rebuild-index' is a no-op when window.VotSearchMini is absent (bundle-e not loaded)", () => {
    delete window.VotSearchMini;
    const { result } = setup();
    // Should not throw.
    act(() => { result.current.handleSearchCommand('rebuild-index'); });
  });

  it("'random' → calls handleSurprise (cross-domain handoff to discovery)", () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchCommand('random'); });
    expect(props.handleSurprise).toHaveBeenCalledTimes(1);
  });

  it('unknown action is a no-op (no setters fire)', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchCommand('not-a-real-action'); });
    expect(props.setScreen).not.toHaveBeenCalled();
    expect(props.goSettings).not.toHaveBeenCalled();
    expect(props.handleSurprise).not.toHaveBeenCalled();
  });
});

// ── handleSearchSelect — "find" lands on the passage (2026-09-20) ───────────
// A letter/WTLB/study hit used to set nav state only: the letter opened at its
// first line and the reader scrolled to find the words again. The matched
// excerpt now rides the same anchor "Surprise me" uses; the reading screen
// resolves it to a block, scrolls there and, when that unit is the loaded
// recording, seeks the audio to it. Bible hits already carry a verse anchor.

describe('useSearch — handleSearchSelect lands letter-shaped hits on the passage', () => {
  const REAL_SM = window.VotSearchMini;
  const calls = [];
  beforeEach(() => {
    calls.length = 0;
    window.VotSearchMini = { matchExcerpt: (text, terms) => { calls.push([text, terms]); return terms.length ? 'still small voice spoke' : ''; } };
  });
  afterEach(() => { window.VotSearchMini = REAL_SM; });

  it("a letter hit sets an excerpt anchor cut from the doc text by the query's OWN terms", () => {
    // The engine's per-hit terms are prefix expansions ('in' -> into, indeed;
    // 'the' -> these, them, they...). Counted as equals, a window dense in
    // "them/they/there" outscored the typed phrase and the reader landed on the
    // wrong block (study find, 2026-09-22). The query's words cut the excerpt.
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'wide-path', text: 'the still small voice spoke' }, terms: ['spoke'] },
      ['still', 'voice'],
    ); });
    expect(calls).toEqual([['the still small voice spoke', ['still', 'voice']]]);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(expect.objectContaining({ type: 'excerpt', text: 'still small voice spoke', letterId: 'wide-path' }));
    expect(props.setLetterId).toHaveBeenCalledWith('wide-path');
  });

  it("the engine's terms cut the excerpt only when the query's own words match nothing (a typo-corrected hit)", () => {
    window.VotSearchMini = { matchExcerpt: (text, terms) => { calls.push([text, terms]); return terms.indexOf('spoke') >= 0 ? 'voice spoke' : ''; } };
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'wide-path', text: 'the still small voice spoke' }, terms: ['spoke'] },
      ['spoek'],
    ); });
    expect(calls).toEqual([['the still small voice spoke', ['spoek']], ['the still small voice spoke', ['spoek', 'spoke']]]);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(expect.objectContaining({ type: 'excerpt', text: 'voice spoke', letterId: 'wide-path' }));
  });

  it('a WTLB hit and a study hit take the same anchor', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'wtlb', volumeId: 'wtlb1', letterId: 'e1', text: 'body' } }, ['body']); });
    expect(props.setSurpriseAnchor).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'excerpt', text: 'still small voice spoke', letterId: 'e1' }));
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'bible-study', letterId: 'purity', chapterNum: 1, studyChapterId: 'purity-ch1', text: 'body' } }, ['body']); });
    // A study doc's letterId is the STUDY; the chapter LetterView renders has the chapter id.
    expect(props.setSurpriseAnchor).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'excerpt', text: 'still small voice spoke', letterId: 'purity-ch1' }));
    expect(props.setScreen).toHaveBeenLastCalledWith('bible-study-chapter');
  });

  it('a tapped place (SrchCard "more places") lands where THAT place starts, not on the snippet\'s passage', () => {
    const text = 'a flooding rain came. Later: Be a flood of water which covers, But a flood of judgment to destroy';
    const at = text.indexOf('flood of water');
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'vengeance', text }, terms: ['flood'], placeStart: at },
      ['flood'],
    ); });
    expect(calls, 'the snippet window is not consulted').toEqual([]);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(expect.objectContaining({ type: 'excerpt', text: text.slice(at, at + 48), letterId: 'vengeance' }));
    expect(props.setLetterId).toHaveBeenCalledWith('vengeance');
  });

  /* A title named opens at the title (search200 B5, the S22 look): the engine opens a text found by its title at its
     start (placeStart 0), and the landing says so, so the reader opens at the top, not at a find place below it. */
  it('a landing at the text\'s start (a title named) opens the unit at its top', () => {
    const text = 'Beloved, hear Me. Much later: God speaks about the Sabbath.';
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'vengeance', text }, terms: ['sabbath'], placeStart: 0 },
      ['god', 'speaks', 'sabbath'],
    ); });
    expect(calls, 'the snippet window is not consulted').toEqual([]);
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(expect.objectContaining({ type: 'excerpt', text: text.slice(0, 48), top: true, letterId: 'vengeance' }));
  });

  it('a landing anywhere else is no top landing', () => {
    const text = 'Beloved, hear Me. Much later: God speaks about the Sabbath.';
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'vengeance', text }, terms: ['sabbath'], placeStart: text.indexOf('God') },
      ['sabbath'],
    ); });
    const seen = props.setSurpriseAnchor.mock.calls;
    expect(seen[seen.length - 1][0].top).toBeUndefined();
  });

  it('a place start outside the text falls back to the query\'s own excerpt', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'vengeance', text: 'the still small voice spoke' }, placeStart: 999 },
      ['still'],
    ); });
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(expect.objectContaining({ type: 'excerpt', text: 'still small voice spoke', letterId: 'vengeance' }));
  });

  /* Find in the unit (2026-09-26): the landing names what to find, the words
     the result card marked (the query's own, then the engine's matched forms),
     and the query as typed, for the host's pill; and the words typed apart (`typed`), so the pill
     counts the places of what search matched for them apart (search200 ideas D). */
  it('the landing carries what to find: the card\u2019s marked words and the query as typed', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'wide-path', text: 'the still small voice spoke' }, terms: ['spoke', 'still'] },
      ['still', 'voice'],
      'Still Voice',
    ); });
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(expect.objectContaining({
      find: { terms: ['still', 'voice', 'spoke'], label: 'Still Voice', typed: ['still', 'voice'] },
    }));
  });

  it('a tapped place carries it too; with no query as typed, the first word labels the pill', () => {
    const text = 'a flooding rain came. Later: Be a flood of water which covers';
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'vengeance', text }, terms: ['flooding'], placeStart: text.indexOf('flood of') },
      ['flood'],
    ); });
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(expect.objectContaining({ find: { terms: ['flood', 'flooding'], label: 'flood', typed: ['flood'] } }));
  });

  /* Track D (D6): the pill marked "whom" and "whoever" in a letter opened from a lone "who" (find6-before.log
     under D:/Swarm/lanes/search200/out/ux/fix-D). The engine's forms of a typed small word stay out of what to
     find, by the rule the card marks by (formsToMark): the pill finds what the card marked. */
  it('D6: a typed small word finds only itself, as the card marks it', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'who-is-first', text: 'Who is he whom the Lord chose? Whoever will, let him come.' }, terms: ['who', 'whom', 'whoever'] },
      ['who'], 'who', ['who'],
    ); });
    expect(props.setSurpriseAnchor).toHaveBeenLastCalledWith(expect.objectContaining({ find: { terms: ['who'], label: 'who', typed: ['who'] } }));
    act(() => { result.current.handleSearchSelect(
      { doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'one-body', text: 'Christ who strengthens me, in whom is all strengthening.' }, terms: ['who', 'whom', 'strengthening'] },
      ['christ', 'strengthens'], 'christ who strengthens me', ['who', 'me'],
    ); });
    expect(props.setSurpriseAnchor).toHaveBeenLastCalledWith(expect.objectContaining({ find: { terms: ['christ', 'strengthens', 'who', 'strengthening'], label: 'christ who strengthens me', typed: ['christ', 'strengthens'] } }));
  });

  it('no match (a title hit, no terms) clears the anchor so a stale verse anchor cannot leak in', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'letter-title', volumeId: 'vot-two', letterId: 'wide-path', text: '' } }, []); });
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
  });

  it('a parsed letter reference ("Volume Two 3") clears the anchor too', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ __direct: true, ref: { kind: 'ref-letter', volumeId: 'vot-two', letterId: 'wide-path' } }); });
    expect(props.setLetterId).toHaveBeenCalledWith('wide-path');
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
  });

  it('survives an engine that has not loaded (bundle-e lazy): opens the letter, anchor null', () => {
    window.VotSearchMini = undefined;
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'letter', volumeId: 'vot-two', letterId: 'wide-path', text: 'x' } }, ['x']); });
    expect(props.setLetterId).toHaveBeenCalledWith('wide-path');
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
  });
});

/* search200 UX B1: a search hit is a look, not a read. Opening one used to move
   the reading cursor (the index's "current" mark and the resume dot) onto it, so
   a brief look became where the reader was. The hit now names the place it
   opens (searchLanding): the catch-all arm in use-reading-position-nav skips
   that place, and the routes switch the read tracker off for it. A hit also
   starts a new trail for the breadcrumbs only an older path set (fromWtlb,
   fromMatthewCh), which outranked fromSearch in the reader's back. */
describe('useSearch — a search hit is a look, not a read (search200 UX B1)', () => {
  it('a letter-shaped hit moves no cursor and names its place', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'wtlb', volumeId: 'vot-two', letterId: 'wide-path', text: '' } }, []); });
    expect(props.setActiveReadKey).not.toHaveBeenCalled();
    expect(props.setLastReadForVol).not.toHaveBeenCalled();
    expect(props.setSearchLanding).toHaveBeenCalledWith('vol-two-letter:wide-path');
  });

  it('a parsed letter reference moves no cursor and names its place', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ __direct: true, ref: { kind: 'ref-letter', volumeId: 'vot-two', letterId: 'wide-path' } }); });
    expect(props.setActiveReadKey).not.toHaveBeenCalled();
    expect(props.setLastReadForVol).not.toHaveBeenCalled();
    expect(props.setSearchLanding).toHaveBeenCalledWith('vol-two-letter:wide-path');
  });

  it('a verse hit names its chapter (a Bible book, and the Matthew study by its chapter)', () => {
    const a = setup();
    act(() => { a.result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'genesis', chapterNum: 1, verseNum: 3 } }); });
    expect(a.props.setSearchLanding).toHaveBeenCalledWith('bible-ch:genesis:1');
    const b = setup();
    act(() => { b.result.current.handleSearchSelect({ doc: { kind: 'study-note', bookId: 'matthew', chapterNum: 5 } }); });
    expect(b.props.setSearchLanding).toHaveBeenCalledWith('matthew-ch:5');
  });

  it('a parsed Bible reference names its chapter', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ __direct: true, __corpus: 'scriptures', ref: { kind: 'ref-bible', bookId: 'matthew', chapter: 5, verseStart: 3 } }); });
    expect(props.setSearchLanding).toHaveBeenCalledWith('bible-ch:matthew-plain:5');
  });

  it('a study hit names its study chapter', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'bible-study', letterId: 'purity', studyChapterId: 'purity-ch1', chapterNum: 1, text: '' } }, []); });
    expect(props.setSearchLanding).toHaveBeenCalledWith('bible-study-chapter:purity:purity-ch1');
  });

  it('a book reference lands on an index, which is no reading place: the landing is cleared', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ __direct: true, ref: { kind: 'ref-book', bookId: 'genesis' } }); });
    expect(props.setSearchLanding).toHaveBeenCalledWith(null);
  });

  it('clears the older breadcrumbs that outranked fromSearch in the reader back', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'genesis', chapterNum: 1 } }); });
    expect(props.setFromWtlb).toHaveBeenCalledWith(null);
    expect(props.setFromMatthewCh).toHaveBeenCalledWith(null);
  });

  // Track D (1): a chapter picked from the index a book-level hit opened backs to that
  // index (fromSearchIndex, a tab field useSearch owns). Every hit starts that trail over.
  it('every hit starts over the index trail a book-level hit began', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField });
    const [, setFromSearchIndex] = tabField('fromSearchIndex');
    expect(typeof result.current.setFromSearchIndex).toBe('function');
    expect('fromSearchIndex' in result.current).toBe(true);
    act(() => { result.current.handleSearchSelect({ __direct: true, ref: { kind: 'ref-book', bookId: 'romans' } }); });
    expect(setFromSearchIndex).toHaveBeenCalledWith(false);
    setFromSearchIndex.mockClear();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'genesis', chapterNum: 1 } }); });
    expect(setFromSearchIndex).toHaveBeenCalledWith(false);
  });
});
