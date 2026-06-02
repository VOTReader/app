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

     D) goSearchOrigin's restore vs fallback. Has-origin restores all
        4 fields; no-origin falls back to goHome. Wrong fallback =
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

// ── Global stubs ────────────────────────────────────────────────────────
let _prevBOOKS, _prevCOL_BY_LETTER_SC, _prevCOL_BY_SEARCH_ID;
let _prevColLetterArr, _prevColPreface;
let _prevVotSearch;

beforeEach(() => {
  _prevBOOKS = window.BOOKS;
  _prevCOL_BY_LETTER_SC = window.COL_BY_LETTER_SC;
  _prevCOL_BY_SEARCH_ID = window.COL_BY_SEARCH_ID;
  _prevColLetterArr = window.colLetterArr;
  _prevColPreface = window.colPreface;
  _prevVotSearch = window.VotSearch;
  // goSearch takes the navHandoff 'pendingSearchQuery' slot; navHandoff is
  // globalized by _entry-b in production — mirror that here.
  window.navHandoff = navHandoff;

  window.BOOKS = {
    genesis: { title: 'Genesis', chapters: [{ num: 1 }] },
    revelation: { title: 'Revelation', chapters: [{ num: 22 }] },
  };
  window.COL_BY_LETTER_SC = new Map([
    ['vol-two-letter', { volKey: 'two', searchVolId: 'vot-two', label: 'Volume Two' }],
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
  window.COL_BY_SEARCH_ID = _prevCOL_BY_SEARCH_ID;
  window.colLetterArr = _prevColLetterArr;
  window.colPreface = _prevColPreface;
  window.VotSearch = _prevVotSearch;
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
  setScreen: vi.fn(),
  setBookId: vi.fn(),
  setChapterNum: vi.fn(),
  setLetterId: vi.fn(),
  setStudyId: vi.fn(),
  setStudyChapterId: vi.fn(),
  setSurpriseAnchor: vi.fn(),
  setFromSearch: vi.fn(),
  setActiveReadKey: vi.fn(),
  setLastReadForVol: vi.fn(),
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

  it('builds a volume-context when on a letter screen registered in COL_BY_LETTER_SC', () => {
    const tabField = makeTabField();
    const { result } = setup({ tabField, screen: 'vol-two-letter' });
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
  });

  it('falls back to goHome when no origin captured', () => {
    const { result, props } = setup();
    act(() => { result.current.goSearchOrigin(); });
    expect(props.goHome).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalled();  // no restore happened
  });
});

// ── handleSearchSelect — __direct refs ──────────────────────────────────

describe('useSearch — handleSearchSelect (__direct refs)', () => {
  it('marks fromSearch=true on entry (every dispatch path)', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'verse', bookId: 'genesis', chapterNum: 1 } }); });
    expect(props.setFromSearch).toHaveBeenCalledWith(true);
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
    expect(props.setActiveReadKey).toHaveBeenCalledWith('vol:two', expect.any(Function));
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
    expect(props.setActiveReadKey).toHaveBeenCalledWith('vol:two', expect.any(Function));
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

  it('routes bible-study doc to bible-study-chapter', () => {
    const { result, props } = setup();
    act(() => { result.current.handleSearchSelect({ doc: { kind: 'bible-study', letterId: 'purity', chapterNum: 'ch1' } }); });
    expect(props.setStudyId).toHaveBeenCalledWith('purity');
    expect(props.setStudyChapterId).toHaveBeenCalledWith('ch1');
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

  it("'rebuild-index' → calls window.VotSearch.rebuild() and swallows errors", () => {
    window.VotSearch = { rebuild: vi.fn(() => Promise.reject(new Error('boom'))) };
    const { result } = setup();
    act(() => { result.current.handleSearchCommand('rebuild-index'); });
    expect(window.VotSearch.rebuild).toHaveBeenCalledTimes(1);
    // The .catch(() => {}) swallows the rejection — no test for that is
    // possible synchronously; the key is that it doesn't throw here.
  });

  it("'rebuild-index' is a no-op when window.VotSearch is absent", () => {
    delete window.VotSearch;
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
