/* P7j — useSurprise tests. Verify branch dispatch + pool composition +
   lazy-load race + the unbiased _randomIndex selector. The random source
   is stubbed via crypto.getRandomValues (preferred path); a Math.random
   stub is also set as belt-and-suspenders for the crypto-unavailable
   fallback branch. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSurprise } from './use-surprise.js';

let _prevMATTHEW, _prevBBL, _prev_studies, _prevCOLLECTIONS, _prevCOL_BY_KEY, _prevColLetterArr, _prevColPreface;
let _prevRandom, _prevGetRandomValues;

beforeEach(() => {
  _prevMATTHEW = window.MATTHEW;
  _prevBBL = window.BIBLE_BOOK_LIST;
  _prev_studies = window._studies;
  _prevCOLLECTIONS = window.COLLECTIONS;
  _prevCOL_BY_KEY = window.COL_BY_KEY;
  _prevColLetterArr = window.colLetterArr;
  _prevColPreface = window.colPreface;
  _prevRandom = Math.random;
  _prevGetRandomValues = window.crypto && window.crypto.getRandomValues;
  window.MATTHEW = { chapters: [{ num: 1 }, { num: 5 }] };
  window.BIBLE_BOOK_LIST = [{ id: 'genesis', chapters: [{ num: 1 }] }];
  window._studies = () => [
    { id: 's-ok', chapters: [{ id: 'ok-1' }] },
    { id: 's-locked', locked: true, chapters: [{ id: 'x' }] },
    { id: 's-empty', chapters: [] },
  ];
  window.COLLECTIONS = [
    { volKey: 'two', surpriseType: 'letter', letterScreen: 'vot-letter' },
    { volKey: 'no-surprise' /* no surpriseType — filtered */ },
  ];
  window.COL_BY_KEY = new Map([['two', { volKey: 'two', letterScreen: 'vot-letter' }]]);
  window.colLetterArr = (col) => col?.volKey === 'two' ? [{ id: 'wide' }] : [];
  window.colPreface = () => null; // no preface in baseline; specific tests opt in.
});

afterEach(() => {
  window.MATTHEW = _prevMATTHEW;
  window.BIBLE_BOOK_LIST = _prevBBL;
  window._studies = _prev_studies;
  window.COLLECTIONS = _prevCOLLECTIONS;
  window.COL_BY_KEY = _prevCOL_BY_KEY;
  window.colLetterArr = _prevColLetterArr;
  window.colPreface = _prevColPreface;
  Math.random = _prevRandom;
  if (window.crypto && _prevGetRandomValues) {
    window.crypto.getRandomValues = _prevGetRandomValues;
  }
});

const baseProps = () => ({
  setSurpriseAnchor: vi.fn(),
  setFromSurprise: vi.fn(),
  setBookId: vi.fn(),
  setChapterNum: vi.fn(),
  setScreen: vi.fn(),
  setLetterId: vi.fn(),
  setActiveReadKey: vi.fn(),
  setLastReadForVol: vi.fn(),
  selectStudyChapter: vi.fn(),
});

// Force _randomIndex to deterministically return `idx` for any pool. Stubs
// both crypto.getRandomValues (the production path) AND Math.random (the
// fallback) so the test passes regardless of which branch runs.
//
// Pool order for baseline setup: [matthew × 2, bible × 1, study × 1, col × 1] = 5
// items (locked + empty studies filtered, no-surprise collection filtered).
const setRandomIndex = (idx, poolLen) => {
  // crypto path: rejection-sample acceptCeiling for the given pool size;
  // idx is < poolLen ≤ acceptCeiling, so idx is always in the accept zone.
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
    window.crypto.getRandomValues = (buf) => { buf[0] = idx; return buf; };
  }
  // Math.random fallback: floor(idx/poolLen * poolLen) === idx.
  Math.random = () => idx / poolLen;
};

describe('useSurprise — branch dispatch', () => {
  it('matthew branch: setBookId(matthew) + chapter + screen=matthew-ch', () => {
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(0, 5);  // first item: matthew ch 1
    act(() => { result.current.handleSurprise(); });
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
    expect(props.setFromSurprise).toHaveBeenCalledWith(true); // UX1: flag the jump for back→Home
    expect(props.setBookId).toHaveBeenCalledWith('matthew');
    expect(props.setChapterNum).toHaveBeenCalledWith(1);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-ch');
  });

  it('bible branch: setBookId(bookId) + chapter + screen=bible-ch', () => {
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(2, 5);  // 3rd item: bible genesis ch 1
    act(() => { result.current.handleSurprise(); });
    expect(props.setBookId).toHaveBeenCalledWith('genesis');
    expect(props.setChapterNum).toHaveBeenCalledWith(1);
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
  });

  it('study branch: delegates to selectStudyChapter', () => {
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(3, 5);  // 4th item: study s-ok / ok-1
    act(() => { result.current.handleSurprise(); });
    expect(props.selectStudyChapter).toHaveBeenCalledWith('s-ok', 'ok-1');
  });

  it('col-letter branch: setLetterId + activeReadKey w/ commit + setScreen', () => {
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(4, 5);  // 5th item: col two / wide
    act(() => { result.current.handleSurprise(); });
    expect(props.setLetterId).toHaveBeenCalledWith('wide');
    expect(props.setFromSurprise).toHaveBeenCalledWith(true); // UX1: flagged on every branch
    expect(props.setScreen).toHaveBeenCalledWith('vot-letter');
    expect(props.setActiveReadKey).toHaveBeenCalledWith('vol:two', expect.any(Function));
    const commitFn = props.setActiveReadKey.mock.calls[0][1];
    commitFn();
    expect(props.setLastReadForVol).toHaveBeenCalledWith('two', 'wide');
  });
});

describe('useSurprise — pool filtering', () => {
  it('locked + empty studies are filtered from the pool', () => {
    // s-locked + s-empty are excluded; only s-ok shows up. With 5 items
    // total, the study slot is exactly index 3 — if filter were broken,
    // index 3 would be a locked/empty entry and call selectStudyChapter
    // with wrong ids.
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(3, 5);
    act(() => { result.current.handleSurprise(); });
    expect(props.selectStudyChapter).toHaveBeenCalledWith('s-ok', 'ok-1');
  });

  it('collections without surpriseType are filtered (no-surprise excluded)', () => {
    // 'no-surprise' collection has no surpriseType → not in pool. Index
    // 4 is the 'two' collection's letter, NOT 'no-surprise'.
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(4, 5);
    act(() => { result.current.handleSurprise(); });
    expect(props.setLetterId).toHaveBeenCalledWith('wide');
  });

  it('collection prefaces are included in the pool', () => {
    // Pool grows from 5 → 6: matthew × 2, bible × 1, study × 1, two-preface, two-wide.
    // Index 4 is now the preface (inserted before the letters).
    window.colPreface = (col) => col?.volKey === 'two' ? { id: 'two-warning' } : null;
    window.COL_BY_KEY = new Map([['two', { volKey: 'two', letterScreen: 'vot-letter' }]]);
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(4, 6);
    act(() => { result.current.handleSurprise(); });
    expect(props.setLetterId).toHaveBeenCalledWith('two-warning');
    expect(props.setScreen).toHaveBeenCalledWith('vot-letter');
  });

  it('Holy Days entries appear in the pool when COLLECTIONS includes them', () => {
    // Regression: Holy Days surpriseType was null pre-2026-05-26, filtered
    // from the dice. Now flipped to 'holydays' in scripture-resolution.js,
    // its entries must reach the pool.
    window.COLLECTIONS = [
      { volKey: 'holydays', surpriseType: 'holydays', letterScreen: 'holy-days-entry' },
    ];
    window.COL_BY_KEY = new Map([['holydays', { volKey: 'holydays', letterScreen: 'holy-days-entry' }]]);
    window.colLetterArr = (col) => col?.volKey === 'holydays' ? [{ id: 'passover' }] : [];
    // Pool: matthew × 2, bible × 1, study × 1, holydays-passover = 5
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(4, 5);
    act(() => { result.current.handleSurprise(); });
    expect(props.setLetterId).toHaveBeenCalledWith('passover');
    expect(props.setScreen).toHaveBeenCalledWith('holy-days-entry');
    expect(props.setActiveReadKey).toHaveBeenCalledWith('vol:holydays', expect.any(Function));
  });

  it('Hidden Manna stays excluded (surpriseType: null is honored)', () => {
    // Policy: Hidden Manna is reachable only via the Matthew study chain.
    // The COLLECTIONS row keeps surpriseType: null so the dice never lands
    // on it. Verify by including an HM-shaped row and confirming the pool
    // does NOT route to its letterScreen.
    window.COLLECTIONS = [
      { volKey: 'two', surpriseType: 'letter', letterScreen: 'vot-letter' },
      { volKey: 'hm', surpriseType: null, letterScreen: 'hm-letter' },
    ];
    window.COL_BY_KEY = new Map([
      ['two', { volKey: 'two', letterScreen: 'vot-letter' }],
      ['hm', { volKey: 'hm', letterScreen: 'hm-letter' }],
    ]);
    window.colLetterArr = (col) => {
      if (col?.volKey === 'two') return [{ id: 'wide' }];
      if (col?.volKey === 'hm') return [{ id: 'woe-to-dallas' }];
      return [];
    };
    // Pool is still 5 (HM filtered out): matthew × 2, bible × 1, study × 1, two-wide.
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(4, 5);  // last entry must be 'wide', NOT 'woe-to-dallas'
    act(() => { result.current.handleSurprise(); });
    expect(props.setLetterId).toHaveBeenCalledWith('wide');
    expect(props.setScreen).toHaveBeenCalledWith('vot-letter');
    expect(props.setScreen).not.toHaveBeenCalledWith('hm-letter');
  });

  it('col-letter branch is a no-op when COL_BY_KEY misses (defensive)', () => {
    // Edge case: pool has a col entry but COL_BY_KEY has been wiped
    // (cold-boot race). Should early-return rather than crash.
    window.COL_BY_KEY = new Map();
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(4, 5);
    act(() => { result.current.handleSurprise(); });
    expect(props.setLetterId).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });

  it('lazy-load race: MATTHEW + BIBLE_BOOK_LIST undefined → no-op + triggers loaders', () => {
    // Regression: Q8 lazy-load made MATTHEW + BIBLE_BOOK_LIST undefined
    // before their loaders resolve. Tapping dice on Home pre-load used to
    // ReferenceError (bare-identifier MATTHEW). Now: pool builds empty
    // from those two sources, _studies + COLLECTIONS still empty in this
    // setup, handler kicks off the loaders and bails without crashing.
    window.MATTHEW = undefined;
    window.BIBLE_BOOK_LIST = undefined;
    window._studies = () => [];
    window.COLLECTIONS = [];
    const bibleLoad = vi.fn();
    const matthewLoad = vi.fn();
    const votLoad = vi.fn();
    window.__loadBibleCorpus = bibleLoad;
    window.__loadMatthewCorpus = matthewLoad;
    window.__loadVotCorpus = votLoad;
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    act(() => { result.current.handleSurprise(); });
    expect(props.setBookId).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
    expect(props.selectStudyChapter).not.toHaveBeenCalled();
    expect(bibleLoad).toHaveBeenCalledTimes(1);
    expect(matthewLoad).toHaveBeenCalledTimes(1);
    expect(votLoad).toHaveBeenCalledTimes(1);
    delete window.__loadBibleCorpus;
    delete window.__loadMatthewCorpus;
    delete window.__loadVotCorpus;
  });
});

describe('useSurprise — randomness', () => {
  it('uses crypto.getRandomValues when available (unbiased path)', () => {
    // Spy on crypto to confirm it's the entropy source. Stub it to a
    // deterministic value (idx 1 of a 5-item pool → bible-genesis-ch1).
    const spy = vi.fn((buf) => { buf[0] = 1; return buf; });
    if (window.crypto) window.crypto.getRandomValues = spy;
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    act(() => { result.current.handleSurprise(); });
    expect(spy).toHaveBeenCalled();
    // Index 1 with current pool (matthew × 2, bible × 1, study × 1, col × 1) = matthew ch 5
    expect(props.setBookId).toHaveBeenCalledWith('matthew');
    expect(props.setChapterNum).toHaveBeenCalledWith(5);
  });
});
