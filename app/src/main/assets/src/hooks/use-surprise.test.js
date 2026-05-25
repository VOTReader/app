/* P7j — useSurprise tests. Single-helper concern; verify the 4 branches
   (matthew / bible / study / col-letter) all wire correctly + the
   pool-build includes only surpriseType-tagged collections + locked/
   empty studies are filtered. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSurprise } from './use-surprise.js';

let _prevMATTHEW, _prevBBL, _prev_studies, _prevCOLLECTIONS, _prevCOL_BY_KEY, _prevColLetterArr;
let _prevRandom;

beforeEach(() => {
  _prevMATTHEW = window.MATTHEW;
  _prevBBL = window.BIBLE_BOOK_LIST;
  _prev_studies = window._studies;
  _prevCOLLECTIONS = window.COLLECTIONS;
  _prevCOL_BY_KEY = window.COL_BY_KEY;
  _prevColLetterArr = window.colLetterArr;
  _prevRandom = Math.random;
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
});

afterEach(() => {
  window.MATTHEW = _prevMATTHEW;
  window.BIBLE_BOOK_LIST = _prevBBL;
  window._studies = _prev_studies;
  window.COLLECTIONS = _prevCOLLECTIONS;
  window.COL_BY_KEY = _prevCOL_BY_KEY;
  window.colLetterArr = _prevColLetterArr;
  Math.random = _prevRandom;
});

const baseProps = () => ({
  setSurpriseAnchor: vi.fn(),
  setBookId: vi.fn(),
  setChapterNum: vi.fn(),
  setScreen: vi.fn(),
  setLetterId: vi.fn(),
  setActiveReadKey: vi.fn(),
  setLastReadForVol: vi.fn(),
  selectStudyChapter: vi.fn(),
});

// Force Math.random to deterministically pick a specific pool index
// (0..n-1). Pool order: [matthew × 2, bible × 1, study × 1, col × 1] = 5
// items (locked + empty studies filtered, no-surprise collection filtered).
const setRandomIndex = (idx, poolLen) => { Math.random = () => idx / poolLen; };

describe('useSurprise — branch dispatch', () => {
  it('matthew branch: setBookId(matthew) + chapter + screen=matthew-ch', () => {
    const props = baseProps();
    const { result } = renderHook(() => useSurprise(props));
    setRandomIndex(0, 5);  // first item: matthew ch 1
    act(() => { result.current.handleSurprise(); });
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
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
});
