/* P7h — useReadingPositionNav tests.
   ────────────────────────────────────
   useReadingPositionNav owns the reading-cursor coordination helpers:
   setLastReadForVol / selectMatthewCh / selectBibleCh / goToLastRead +
   the prophecy-card-state persistence (ref + saveProphecyCardStates).

   Silent-failure modes worth guarding:

     A) goToLastRead's branch dispatch. Three branches (vol: / bible-study- /
        bare) based on activeReadKey's prefix. A wrong branch routes the
        user to the wrong screen — invisible because each branch
        individually "works" on its own; the prefix discrimination is
        the load-bearing part.

     B) The activeReadKey null/falsy guard. Reading dot button triggers
        goToLastRead unconditionally; without the early return, a null
        activeReadKey would throw on `.startsWith()`.

     C) Prophecy-card lazy-init. The useRef is created with a factory
        function, then the if-check on first render resolves it to
        actual state. If the if-check is removed or the factory throws
        unguarded, the ref permanently holds the function (and every
        prophecy card card spreads `{...somethingNotAnObject}` →
        crashes the chapter render).

     D) saveProphecyCardStates localStorage failures. The try/catch
        swallows quota/access errors silently — non-fatal by design
        (privacy mode, disabled storage). If the catch is removed,
        users in private browsing crash the chapter view.

     E) selectMatthewCh vs selectBibleCh: nearly-identical shape but
        DIFFERENT activeReadKey values ('matthew' vs the current
        bookId) and DIFFERENT screens. Crossed wires here would route
        Matthew chapter clicks to bible-ch (wrong renderer).
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadingPositionNav } from './use-reading-position-nav.js';
import { ProphecyCardsStore } from '../stores/prophecy-cards-store.js';

// ── Global stubs ────────────────────────────────────────────────────────
let _prevCOL_BY_KEY;

beforeEach(() => {
  _prevCOL_BY_KEY = window.COL_BY_KEY;
  window.COL_BY_KEY = new Map([
    ['two', { volKey: 'two', letterScreen: 'vot-letter' }],
    ['one', { volKey: 'one', letterScreen: 'vot-one-letter' }],
  ]);
  // W2.3b: prophecy card state lives in ProphecyCardsStore (IDB-backed).
  // Reset its state machine; forceLoaded skips async hydration.
  ProphecyCardsStore._resetForTests({ forceLoaded: true });
  localStorage.removeItem('vot-prophecy-cards');
});

afterEach(() => {
  window.COL_BY_KEY = _prevCOL_BY_KEY;
  localStorage.removeItem('vot-prophecy-cards');
});

// ── Test helpers ────────────────────────────────────────────────────────
const baseProps = () => ({
  bookId: null,
  activeReadKey: null,
  lastReadLetterMap: {},
  lastReadChapters: {},
  setLetterId: vi.fn(),
  setBookId: vi.fn(),
  setChapterNum: vi.fn(),
  setScreen: vi.fn(),
  setActiveReadKey: vi.fn(),
  setLastReadLetterMap: vi.fn(),
  setLastReadChapters: vi.fn(),
  getStudyById: vi.fn(() => null),
  selectStudy: vi.fn(),
  selectStudyChapter: vi.fn(),
});

const setup = (overrides = {}) => {
  const props = { ...baseProps(), ...overrides };
  const { result } = renderHook(() => useReadingPositionNav(props));
  return { result, props };
};

// ── prophecyCardStatesRef + saveProphecyCardStates ──────────────────────

describe('useReadingPositionNav — prophecy card state', () => {
  it('lazy-init: ref.current resolves the factory to an empty object on first render', () => {
    const { result } = setup();
    // After first render, .current is the resolved value (object),
    // NOT the factory function.
    expect(typeof result.current.prophecyCardStatesRef.current).toBe('object');
    expect(result.current.prophecyCardStatesRef.current).toEqual({});
  });

  it('hydrates from ProphecyCardsStore on init', () => {
    // Pre-populate the store directly (in IDB-mode 'loaded' state,
    // setOne is a normal write-through; ProphecyCardsStore.setAll
    // filters falsy so we set only the truthy keys).
    ProphecyCardsStore.setAll({ 'chap-1:0:prophecy': true });
    const { result } = setup();
    expect(result.current.prophecyCardStatesRef.current).toEqual({ 'chap-1:0:prophecy': true });
  });

  it('handles empty/corrupt store gracefully — defaults to {}', () => {
    // ProphecyCardsStore's CachedStore handles JSON parse failure via
    // legacy-LS-fallback; here we just verify the empty default case.
    ProphecyCardsStore._cache = /** @type {any} */ ({});
    const { result } = setup();
    expect(result.current.prophecyCardStatesRef.current).toEqual({});
  });

  it('saveProphecyCardStates writes the ref to ProphecyCardsStore', () => {
    const { result } = setup();
    result.current.prophecyCardStatesRef.current['chap-1:0:prophecy'] = true;
    act(() => { result.current.saveProphecyCardStates(); });
    expect(ProphecyCardsStore.getAll()).toEqual({ 'chap-1:0:prophecy': true });
  });

  it('saveProphecyCardStates is identity-stable across renders (useCallback)', () => {
    // Bridge consumers may dep on this — stable identity protects
    // against unnecessary re-bindings.
    const { result, rerender } = renderHook(
      (p) => useReadingPositionNav(p),
      { initialProps: baseProps() }
    );
    const first = result.current.saveProphecyCardStates;
    rerender({ ...baseProps(), bookId: 'changed' });
    expect(result.current.saveProphecyCardStates).toBe(first);
  });
});

// ── setLastReadForVol ───────────────────────────────────────────────────

describe('useReadingPositionNav — setLastReadForVol', () => {
  it('merges (volKey → id) into lastReadLetterMap via setter updater', () => {
    const { result, props } = setup();
    act(() => { result.current.setLastReadForVol('two', 'the-wide-path'); });
    expect(props.setLastReadLetterMap).toHaveBeenCalledTimes(1);
    const updater = props.setLastReadLetterMap.mock.calls[0][0];
    expect(updater({})).toEqual({ two: 'the-wide-path' });
    // Preserves existing keys.
    expect(updater({ one: 'preface' })).toEqual({ one: 'preface', two: 'the-wide-path' });
  });
});

// ── selectMatthewCh ─────────────────────────────────────────────────────

describe('useReadingPositionNav — selectMatthewCh', () => {
  it('sets chapter + screen + activeReadKey with commit-fn', () => {
    const { result, props } = setup();
    act(() => { result.current.selectMatthewCh(5); });
    expect(props.setChapterNum).toHaveBeenCalledWith(5);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-ch');
    expect(props.setActiveReadKey).toHaveBeenCalledWith('matthew', expect.any(Function));
  });

  it("activeReadKey commit-fn writes 'matthew' key into lastReadChapters", () => {
    const { result, props } = setup();
    act(() => { result.current.selectMatthewCh(22); });
    const commitFn = props.setActiveReadKey.mock.calls[0][1];
    commitFn();
    const updater = props.setLastReadChapters.mock.calls[0][0];
    expect(updater({})).toEqual({ matthew: 22 });
    expect(updater({ genesis: 1 })).toEqual({ genesis: 1, matthew: 22 });
  });

  it('does NOT touch setBookId (Matthew screen owns bookId implicitly)', () => {
    const { result, props } = setup();
    act(() => { result.current.selectMatthewCh(5); });
    expect(props.setBookId).not.toHaveBeenCalled();
  });
});

// ── selectBibleCh ───────────────────────────────────────────────────────

describe('useReadingPositionNav — selectBibleCh', () => {
  it('routes to bible-ch using current bookId as activeReadKey', () => {
    const { result, props } = setup({ bookId: 'genesis' });
    act(() => { result.current.selectBibleCh(1); });
    expect(props.setChapterNum).toHaveBeenCalledWith(1);
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
    expect(props.setActiveReadKey).toHaveBeenCalledWith('genesis', expect.any(Function));
  });

  it("activeReadKey commit-fn writes the [bookId] key into lastReadChapters", () => {
    const { result, props } = setup({ bookId: 'revelation' });
    act(() => { result.current.selectBibleCh(22); });
    const commitFn = props.setActiveReadKey.mock.calls[0][1];
    commitFn();
    const updater = props.setLastReadChapters.mock.calls[0][0];
    expect(updater({})).toEqual({ revelation: 22 });
  });

  it('reads the LATEST bookId on each call (closure-stale guard)', () => {
    // If selectBibleCh closed over a stale bookId, a rerender wouldn't
    // reflect the user's current book selection. Verify via direct
    // rerender — invoke selectBibleCh AFTER the prop change and assert
    // the latest bookId reached the setActiveReadKey call.
    const props = { ...baseProps(), bookId: 'genesis' };
    const { result, rerender } = renderHook(
      (p) => useReadingPositionNav(p),
      { initialProps: props }
    );
    const propsB = { ...baseProps(), bookId: 'exodus' };
    rerender(propsB);
    act(() => { result.current.selectBibleCh(3); });
    expect(propsB.setActiveReadKey).toHaveBeenCalledWith('exodus', expect.any(Function));
  });
});

// ── goToLastRead ────────────────────────────────────────────────────────

describe('useReadingPositionNav — goToLastRead (branch dispatch)', () => {
  it('null/falsy activeReadKey → no-op (early return guard)', () => {
    const { result, props } = setup({ activeReadKey: null });
    act(() => { result.current.goToLastRead(); });
    expect(props.setLetterId).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
    expect(props.selectStudy).not.toHaveBeenCalled();
  });

  it('vol:<volKey> branch → setLetterId(lid) + setScreen(col.letterScreen)', () => {
    const { result, props } = setup({
      activeReadKey: 'vol:two',
      lastReadLetterMap: { two: 'the-wide-path' },
    });
    act(() => { result.current.goToLastRead(); });
    expect(props.setLetterId).toHaveBeenCalledWith('the-wide-path');
    expect(props.setScreen).toHaveBeenCalledWith('vot-letter');
  });

  it('vol: branch is no-op when lastReadLetterMap missing the volKey', () => {
    const { result, props } = setup({
      activeReadKey: 'vol:two',
      lastReadLetterMap: {},
    });
    act(() => { result.current.goToLastRead(); });
    expect(props.setLetterId).not.toHaveBeenCalled();
  });

  it('vol: branch is no-op when COL_BY_KEY misses (stale volKey defensive)', () => {
    const { result, props } = setup({
      activeReadKey: 'vol:nonexistent',
      lastReadLetterMap: { nonexistent: 'x' },
    });
    act(() => { result.current.goToLastRead(); });
    expect(props.setLetterId).not.toHaveBeenCalled();
  });

  it('bible-study-<slug> branch with study + chId → delegates to selectStudyChapter', () => {
    const study = { id: 'purity', slug: 'purity', chapters: [{ id: 'p1' }] };
    const { result, props } = setup({
      activeReadKey: 'bible-study-purity',
      lastReadChapters: { 'bible-study-purity': 'p1' },
      getStudyById: vi.fn(() => study),
    });
    act(() => { result.current.goToLastRead(); });
    expect(props.getStudyById).toHaveBeenCalledWith('purity');
    expect(props.selectStudyChapter).toHaveBeenCalledWith('purity', 'p1');
    expect(props.selectStudy).not.toHaveBeenCalled();
  });

  it('bible-study- branch with study but NO chId → falls back to selectStudy (open at index)', () => {
    const study = { id: 'purity', slug: 'purity', chapters: [{ id: 'p1' }] };
    const { result, props } = setup({
      activeReadKey: 'bible-study-purity',
      lastReadChapters: {},  // no chapter cursor yet
      getStudyById: vi.fn(() => study),
    });
    act(() => { result.current.goToLastRead(); });
    expect(props.selectStudy).toHaveBeenCalledWith('purity');
    expect(props.selectStudyChapter).not.toHaveBeenCalled();
  });

  it('bible-study- branch is no-op when getStudyById returns null', () => {
    const { result, props } = setup({
      activeReadKey: 'bible-study-unknown',
      getStudyById: vi.fn(() => null),
    });
    act(() => { result.current.goToLastRead(); });
    expect(props.selectStudy).not.toHaveBeenCalled();
    expect(props.selectStudyChapter).not.toHaveBeenCalled();
  });

  it('bare key (e.g. "genesis") → bible-ch with chapter from lastReadChapters', () => {
    const { result, props } = setup({
      activeReadKey: 'genesis',
      lastReadChapters: { genesis: 3 },
    });
    act(() => { result.current.goToLastRead(); });
    expect(props.setBookId).toHaveBeenCalledWith('genesis');
    expect(props.setChapterNum).toHaveBeenCalledWith(3);
    expect(props.setScreen).toHaveBeenCalledWith('bible-ch');
  });

  it('bare key "matthew" → matthew-ch (NOT bible-ch — uses study renderer)', () => {
    // Crossed-wires regression target: Matthew bookId routes to
    // matthew-ch (study Bible) NOT bible-ch.
    const { result, props } = setup({
      activeReadKey: 'matthew',
      lastReadChapters: { matthew: 5 },
    });
    act(() => { result.current.goToLastRead(); });
    expect(props.setBookId).toHaveBeenCalledWith('matthew');
    expect(props.setChapterNum).toHaveBeenCalledWith(5);
    expect(props.setScreen).toHaveBeenCalledWith('matthew-ch');
  });

  it('bare-key branch is no-op when lastReadChapters missing the key', () => {
    const { result, props } = setup({
      activeReadKey: 'genesis',
      lastReadChapters: {},
    });
    act(() => { result.current.goToLastRead(); });
    expect(props.setBookId).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });
});
