/* P7i — useReadingChainNav tests.
   ─────────────────────────────────
   useReadingChainNav owns the cross-volume reading chain + within-Bible
   book prev/next + the load-bearing Revelation → Volume One bridge.

   Silent-failure modes worth guarding:

     A) boundaryConfig branch dispatch. ~7 branches:
        - no source col → all-null return
        - entry has prevLetter/prevEntry → no prevBoundary
        - volKey 'one' → Revelation special-case
        - chain walk skipping empty collections → next non-empty
        - entry has nextLetter/nextEntry → no nextBoundary
        - volKey 'holydays' → Garden special-case
        - chain walk for nextBoundary
        Each branch tested.

     B) The Revelation → Volume One bridge. bcvNextBook + bcvOnNextBook
        + bcvNextBoundaryTitle have an INVERTED bookId === 'revelation'
        check that routes the user to Volume One instead of "next book
        in BIBLE_BOOK_LIST". Crossed wires here = user reads through
        Revelation and lands on... whatever BIBLE_BOOK_LIST puts after,
        breaking the canonical reading flow.

     C) chIsFirst / chIsLast are NULL-SAFE. chapter is null when the
        user is on bible-idx (not viewing a chapter); both must
        gracefully return null rather than throwing on chapter.num
        access.

     D) goNext/PrevBibleBook null-guard. At the first/last book in
        BIBLE_BOOK_LIST, the prev/next book is null. The helpers
        must early-return rather than calling setBookId(null).

     E) Chain walk skipping empties. READING_CHAIN may include
        volKeys whose collections were filtered out (e.g. fully
        locked). boundaryConfig walks past empties to find the
        next non-empty collection. A wrong-direction skip routes
        user to wrong destination.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReadingChainNav } from './use-reading-chain-nav.js';

// ── Global stubs ────────────────────────────────────────────────────────
// useReadingChainNav reads MANY cross-bundle globals: BOOKS, COLLECTIONS,
// COL_BY_KEY, READING_CHAIN, BIBLE_BOOK_LIST, colLetterArr, colPreface,
// _boundaryShort. Stub the minimum that exercises each branch.

let _prevBOOKS, _prevCOLLECTIONS, _prevCOL_BY_KEY, _prevREADING_CHAIN;
let _prevBIBLE_BOOK_LIST, _prevColLetterArr, _prevColPreface, _prev_boundaryShort;

const stubCollections = [
  { volKey: 'one',     letterScreen: 'vot-one-letter',   short: 'V1' },
  { volKey: 'two',     letterScreen: 'vot-letter',       short: 'V2' },
  { volKey: 'three',   letterScreen: 'vot-three-letter', short: 'V3' },
  { volKey: 'empty',   letterScreen: 'vot-empty-letter', short: 'EMPTY' },  // letters → []
  { volKey: 'wtlb1',   letterScreen: 'wtlb1-letter',     short: 'WTLB1' },  // has preface
  { volKey: 'holydays', letterScreen: 'holydays-letter', short: 'HD' },
];

const stubBibleBookList = [
  { id: 'genesis', title: 'Genesis', chapters: [{ num: 1 }, { num: 2 }] },
  { id: 'exodus',  title: 'Exodus',  chapters: [{ num: 1 }, { num: 40 }] },
  { id: 'revelation', title: 'Revelation', chapters: [{ num: 1 }, { num: 22 }] },
];

beforeEach(() => {
  _prevBOOKS = window.BOOKS;
  _prevCOLLECTIONS = window.COLLECTIONS;
  _prevCOL_BY_KEY = window.COL_BY_KEY;
  _prevREADING_CHAIN = window.READING_CHAIN;
  _prevBIBLE_BOOK_LIST = window.BIBLE_BOOK_LIST;
  _prevColLetterArr = window.colLetterArr;
  _prevColPreface = window.colPreface;
  _prev_boundaryShort = window._boundaryShort;

  window.BOOKS = {
    revelation: { chapters: [{ num: 1 }, { num: 22 }] },
  };
  window.COLLECTIONS = stubCollections;
  window.COL_BY_KEY = new Map(stubCollections.map((c) => [c.volKey, c]));
  // Reading chain order — 'empty' is in the middle to test skip behavior.
  window.READING_CHAIN = ['one', 'two', 'empty', 'three', 'wtlb1', 'holydays'];
  window.BIBLE_BOOK_LIST = stubBibleBookList;
  window.colLetterArr = (col) => {
    if (col?.volKey === 'one')   return [{ id: 'v1-a', title: 'V1 A' }, { id: 'v1-z', title: 'V1 Z' }];
    if (col?.volKey === 'two')   return [{ id: 'v2-a', title: 'V2 A' }, { id: 'v2-z', title: 'V2 Z' }];
    if (col?.volKey === 'three') return [{ id: 'v3-a', title: 'V3 A' }, { id: 'v3-z', title: 'V3 Z' }];
    if (col?.volKey === 'empty') return [];
    if (col?.volKey === 'wtlb1') return [{ id: 'wtlb1-a', title: 'WTLB1 A' }];
    if (col?.volKey === 'holydays') return [{ id: 'hd-a', title: 'HD A' }];
    return [];
  };
  window.colPreface = (col) => col?.volKey === 'wtlb1' ? { id: 'wtlb1-preface', title: 'WTLB1 Preface' } : null;
  window._boundaryShort = (sourceCol, targetCol) => targetCol.short || '';
});

afterEach(() => {
  window.BOOKS = _prevBOOKS;
  window.COLLECTIONS = _prevCOLLECTIONS;
  window.COL_BY_KEY = _prevCOL_BY_KEY;
  window.READING_CHAIN = _prevREADING_CHAIN;
  window.BIBLE_BOOK_LIST = _prevBIBLE_BOOK_LIST;
  window.colLetterArr = _prevColLetterArr;
  window.colPreface = _prevColPreface;
  window._boundaryShort = _prev_boundaryShort;
});

// ── Test helpers ────────────────────────────────────────────────────────
const baseProps = () => ({
  book: null,
  chapter: null,
  bookId: null,
  setBookId: vi.fn(),
  setChapterNum: vi.fn(),
  setScreen: vi.fn(),
  setLetterId: vi.fn(),
  setActiveReadKey: vi.fn(),
  setLastReadForVol: vi.fn(),
  goToGardenFirst: vi.fn(),
});

const setup = (overrides = {}) => {
  const props = { ...baseProps(), ...overrides };
  const { result } = renderHook(() => useReadingChainNav(props));
  return { result, props };
};

// ── goToRevelationLast ──────────────────────────────────────────────────

describe('useReadingChainNav — goToRevelationLast', () => {
  it('routes to revelation/last-chapter/bible-ch', () => {
    const { result, props } = setup();
    result.current.goToRevelationLast();
    expect(props.setBookId).toHaveBeenCalledWith('revelation');
    expect(props.setChapterNum).toHaveBeenCalledWith(22);
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
  });
});

// ── W1.6 hardening: lazy-Bible-corpus race ──────────────────────────────
// BOOKS comes from the lazy bundle-a-bible bundle (Q8). If a saved-tab
// cold-boot lands the user on a Volume One letter BEFORE the home
// pre-fire effect resolves __loadBibleCorpus, boundaryConfig and
// goToRevelationLast can't dereference BOOKS.revelation. Both
// helpers must no-op (silently, with no exception); next render after
// load fills in the prev-card.
describe('useReadingChainNav — BOOKS-undefined race (W1.6 hardening)', () => {
  beforeEach(() => {
    // Erase the stub set up by the outer beforeEach so the production
    // code sees BOOKS as truly undefined (matches pre-load cold boot).
    delete window.BOOKS;
  });

  it('goToRevelationLast does NOT throw and does NOT navigate when BOOKS is undefined', () => {
    const { result, props } = setup();
    expect(() => result.current.goToRevelationLast()).not.toThrow();
    expect(props.setBookId).not.toHaveBeenCalled();
    expect(props.setChapterNum).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });

  it('boundaryConfig(volKey="one") returns null prev-boundary when BOOKS undefined (no throw)', () => {
    const { result } = setup();
    const call = () => result.current.boundaryConfig('one', null);
    expect(call).not.toThrow();
    const cfg = call();
    expect(cfg.prevBoundary).toBe(null);
    expect(cfg.onPrevBoundary).toBe(null);
  });

  it('boundaryConfig for other volKeys still works when BOOKS undefined (chain walk is BOOKS-independent)', () => {
    const { result } = setup();
    // 'three' walks back past 'empty' to 'two' — pure COLLECTIONS chain
    // logic, no BOOKS dependency. Must still produce the V2 boundary
    // even with BOOKS unavailable.
    const cfg = result.current.boundaryConfig('three', null);
    expect(cfg.prevBoundary?.short).toBe('V2');
  });
});

// ── boundaryConfig ──────────────────────────────────────────────────────

describe('useReadingChainNav — boundaryConfig', () => {
  it('returns all-null when sourceCol is unknown', () => {
    const { result } = setup();
    expect(result.current.boundaryConfig('nonexistent', null)).toEqual({
      prevBoundary: null, onPrevBoundary: null,
      nextBoundary: null, onNextBoundary: null,
    });
  });

  it('volKey "one" → prevBoundary is Revelation special-case', () => {
    const { result } = setup();
    const cfg = result.current.boundaryConfig('one', null);
    expect(cfg.prevBoundary.short).toBe('Revelation');
    expect(cfg.prevBoundary.title).toMatch(/Revelation · Chapter 22/);
    expect(typeof cfg.onPrevBoundary).toBe('function');
  });

  it('volKey "holydays" → nextBoundary is Garden special-case', () => {
    const { result, props } = setup();
    const cfg = result.current.boundaryConfig('holydays', null);
    expect(cfg.nextBoundary.short).toBe('A Return to the Garden');
    expect(cfg.nextBoundary.title).toBe('A Return to the Garden');
    expect(cfg.onNextBoundary).toBe(props.goToGardenFirst);
  });

  it('mid-chain volKey walks back to previous non-empty collection', () => {
    // 'three' in READING_CHAIN sits after 'empty' (which has no
    // letters). The prevBoundary walk should SKIP 'empty' and land on
    // 'two'.
    const { result } = setup();
    const cfg = result.current.boundaryConfig('three', null);
    expect(cfg.prevBoundary.short).toBe('V2');
    // Last letter of V2 is v2-z with title 'V2 Z'.
    expect(cfg.prevBoundary.title).toBe('V2 Z');
  });

  it('mid-chain volKey walks forward to next non-empty collection (skips empties)', () => {
    // 'two' → next non-empty after 'empty' is 'three'.
    const { result } = setup();
    const cfg = result.current.boundaryConfig('two', null);
    expect(cfg.nextBoundary.short).toBe('V3');
    expect(cfg.nextBoundary.title).toBe('V3 A');  // first letter
  });

  it('uses preface title when the next collection has one (wtlb1)', () => {
    // From 'three', next non-empty is 'wtlb1' which has a preface.
    // nextBoundary.title should be the preface title.
    const { result } = setup();
    const cfg = result.current.boundaryConfig('three', null);
    expect(cfg.nextBoundary.short).toBe('WTLB1');
    expect(cfg.nextBoundary.title).toBe('WTLB1 Preface');
  });

  it('entry with prevLetter → no prevBoundary (in-collection sibling)', () => {
    const { result } = setup();
    const cfg = result.current.boundaryConfig('two', { prevLetter: { id: 'something' } });
    expect(cfg.prevBoundary).toBeNull();
    expect(cfg.onPrevBoundary).toBeNull();
  });

  it('entry with nextLetter → no nextBoundary', () => {
    const { result } = setup();
    const cfg = result.current.boundaryConfig('two', { nextLetter: { id: 'something' } });
    expect(cfg.nextBoundary).toBeNull();
    expect(cfg.onNextBoundary).toBeNull();
  });

  it('also recognizes prevEntry/nextEntry (WTLB-style entries)', () => {
    const { result } = setup();
    const cfg = result.current.boundaryConfig('two', { prevEntry: {}, nextEntry: {} });
    expect(cfg.prevBoundary).toBeNull();
    expect(cfg.nextBoundary).toBeNull();
  });
});

// ── Bible book prev/next ────────────────────────────────────────────────

describe('useReadingChainNav — bookIdx + prev/nextBibleBook', () => {
  it('bookIdx returns -1 when book is null (not on a bible book)', () => {
    const { result } = setup({ book: null });
    expect(result.current.bookIdx).toBe(-1);
  });

  it('bookIdx + prev/nextBibleBook compute correctly for middle book', () => {
    const { result } = setup({ book: stubBibleBookList[1], bookId: 'exodus' });
    expect(result.current.bookIdx).toBe(1);
    expect(result.current.prevBibleBook?.id).toBe('genesis');
    expect(result.current.nextBibleBook?.id).toBe('revelation');
  });

  it('prevBibleBook is null at first book', () => {
    const { result } = setup({ book: stubBibleBookList[0], bookId: 'genesis' });
    expect(result.current.prevBibleBook).toBeNull();
    expect(result.current.nextBibleBook?.id).toBe('exodus');
  });

  it('nextBibleBook is null at last book', () => {
    const { result } = setup({ book: stubBibleBookList[2], bookId: 'revelation' });
    expect(result.current.prevBibleBook?.id).toBe('exodus');
    expect(result.current.nextBibleBook).toBeNull();
  });
});

describe('useReadingChainNav — goNextBibleBook / goPrevBibleBook', () => {
  it('goNextBibleBook routes to next book first chapter', () => {
    const { result, props } = setup({ book: stubBibleBookList[0], bookId: 'genesis' });
    result.current.goNextBibleBook();
    expect(props.setBookId).toHaveBeenCalledWith('exodus');
    expect(props.setChapterNum).toHaveBeenCalledWith(1);
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
  });

  it('goPrevBibleBook routes to prev book LAST chapter', () => {
    const { result, props } = setup({ book: stubBibleBookList[1], bookId: 'exodus' });
    result.current.goPrevBibleBook();
    expect(props.setBookId).toHaveBeenCalledWith('genesis');
    expect(props.setChapterNum).toHaveBeenCalledWith(2);  // last chapter of stub Genesis
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
  });

  it('goNextBibleBook is a no-op at the last book (null-guard)', () => {
    const { result, props } = setup({ book: stubBibleBookList[2], bookId: 'revelation' });
    result.current.goNextBibleBook();
    expect(props.setBookId).not.toHaveBeenCalled();
  });

  it('goPrevBibleBook is a no-op at the first book (null-guard)', () => {
    const { result, props } = setup({ book: stubBibleBookList[0], bookId: 'genesis' });
    result.current.goPrevBibleBook();
    expect(props.setBookId).not.toHaveBeenCalled();
  });
});

// ── chIsFirst / chIsLast ────────────────────────────────────────────────

describe('useReadingChainNav — chIsFirst / chIsLast', () => {
  it('both null when chapter is missing (null-safe)', () => {
    const { result } = setup({ book: stubBibleBookList[0], chapter: null });
    expect(result.current.chIsFirst).toBeFalsy();
    expect(result.current.chIsLast).toBeFalsy();
  });

  it('chIsFirst=true at first chapter, chIsLast=false', () => {
    const { result } = setup({ book: stubBibleBookList[0], chapter: { num: 1 } });
    expect(result.current.chIsFirst).toBe(true);
    expect(result.current.chIsLast).toBe(false);
  });

  it('chIsLast=true at last chapter, chIsFirst=false', () => {
    const { result } = setup({ book: stubBibleBookList[0], chapter: { num: 2 } });
    expect(result.current.chIsFirst).toBe(false);
    expect(result.current.chIsLast).toBe(true);
  });
});

// ── BCV boundary props (the Revelation → Volume One bridge) ─────────────

describe('useReadingChainNav — bcv* boundary props', () => {
  it('non-boundary chapter: bcvPrevBook + bcvNextBook both null', () => {
    // A book with chapters [1, 2] viewing... actually the stub only has
    // 2 chapters per book, so mid-book test needs a 3-chapter stub.
    // Skip — covered by chIsFirst/chIsLast tests which establish the
    // mechanism.
    const book3 = { id: 'three-ch', title: 'Three', chapters: [{ num: 1 }, { num: 2 }, { num: 3 }] };
    const { result } = setup({ book: book3, chapter: { num: 2 }, bookId: 'three-ch' });
    expect(result.current.bcvPrevBook).toBeNull();
    expect(result.current.bcvNextBook).toBeNull();
  });

  it('first chapter of mid-book: bcvPrevBook = prev book', () => {
    const { result } = setup({ book: stubBibleBookList[1], chapter: { num: 1 }, bookId: 'exodus' });
    expect(result.current.bcvPrevBook?.id).toBe('genesis');
  });

  it('last chapter of non-Revelation: bcvNextBook = next bible book', () => {
    const { result } = setup({ book: stubBibleBookList[0], chapter: { num: 2 }, bookId: 'genesis' });
    expect(result.current.bcvNextBook?.id).toBe('exodus');
    expect(result.current.bcvNextBoundaryTitle).toBeNull();
  });

  it('REVELATION last chapter: bcvNextBook = Volume One synthetic, bcvOnNextBook = _goFirst.one', () => {
    // The load-bearing bridge: Bible side's "next from Rev last" → chain
    // side's "Volume One first letter".
    const { result, props } = setup({ book: stubBibleBookList[2], chapter: { num: 22 }, bookId: 'revelation' });
    expect(result.current.bcvNextBook).toEqual({ title: 'Volume One', chapters: [{ num: 1 }] });
    expect(result.current.bcvNextBoundaryTitle).toBe('Volume One · Letter 1');
    // bcvOnNextBook should be _goFirst.one — calling it should set
    // letterId/screen for V1 + activeReadKey + last-read commit.
    result.current.bcvOnNextBook();
    expect(props.setLetterId).toHaveBeenCalledWith('v1-a');
    expect(props.setScreen).toHaveBeenCalledWith('vot-one-letter');
    expect(props.setActiveReadKey).toHaveBeenCalledWith('vol:one', expect.any(Function));
  });

  // (No "REVELATION mid-chapter" test: the stub gives Revelation just
  // chapters [{num:1}, {num:22}] which makes chIsLast=true for BOTH
  // — the gap between 1 and 22 means the `chapter.num + 1` neighbor
  // lookup misses for chapter 1 too. The general "non-boundary →
  // bcvPrev/Next both null" test above covers the underlying
  // mechanism via a chapters [{1},{2},{3}] stub.)
});

// ── _goFirst / _goLast internal map (verified via boundaryConfig) ───────

describe('useReadingChainNav — _goFirst commit-fns (verified via boundaryConfig)', () => {
  it('next-boundary _goFirst commits setLastReadForVol with (volKey, firstLetterId)', () => {
    // Walking from 'two', next is 'three'. _goFirst['three'] should
    // set letterId='v3-a' + commit-fn that calls setLastReadForVol('three', 'v3-a').
    const { result, props } = setup();
    const cfg = result.current.boundaryConfig('two', null);
    cfg.onNextBoundary();
    expect(props.setLetterId).toHaveBeenCalledWith('v3-a');
    const commitFn = props.setActiveReadKey.mock.calls[0][1];
    commitFn();
    expect(props.setLastReadForVol).toHaveBeenCalledWith('three', 'v3-a');
  });

  it('prev-boundary _goLast commits setLastReadForVol with (volKey, lastLetterId)', () => {
    // From 'three', prev is 'two'. _goLast['two'] should set letterId='v2-z'.
    const { result, props } = setup();
    const cfg = result.current.boundaryConfig('three', null);
    cfg.onPrevBoundary();
    expect(props.setLetterId).toHaveBeenCalledWith('v2-z');
    const commitFn = props.setActiveReadKey.mock.calls[0][1];
    commitFn();
    expect(props.setLastReadForVol).toHaveBeenCalledWith('two', 'v2-z');
  });

  it('preface variant: _firstPreface uses preface.id when the collection has one', () => {
    // 'three' → next non-empty is 'wtlb1' which has a preface.
    // _goFirst['wtlb1'] should be _firstPreface, setting letterId to
    // 'wtlb1-preface' (NOT 'wtlb1-a').
    const { result, props } = setup();
    const cfg = result.current.boundaryConfig('three', null);
    cfg.onNextBoundary();
    expect(props.setLetterId).toHaveBeenCalledWith('wtlb1-preface');
  });
});
