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

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_KEY() { return /** @type {any} */ (globalThis).COL_BY_KEY; }, get COL_BY_LETTER_SC() { return /** @type {any} */ (globalThis).COL_BY_LETTER_SC; } }; });

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
  screen: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null,
  activeReadKey: null,
  lastReadLetterMap: {},
  lastReadChapters: {},
  setLetterId: vi.fn(),
  setBookId: vi.fn(),
  setChapterNum: vi.fn(),
  setScreen: vi.fn(),
  setGenreId: vi.fn(),
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

// ── selectScriptureBook ────────────────────────────────────────────────
/* 2026-09-24: a book tile tapped before the ~5 MB Bible corpus (BOOKS) landed
   was DROPPED — App's handler only knew how to open a book it could already
   see. The tap now opens the book's index at once (the bible-idx route shows
   "Loading Bible…" until the text lands); a one-chapter book goes on into its
   chapter once loaded, but only if the reader is still waiting on it. */
describe('useReadingPositionNav — selectScriptureBook', () => {
  const GENRES = {
    ot: [{ id: 'law', books: [{ id: 'genesis' }] }, { id: 'minor', books: [{ id: 'obadiah' }] }],
    nt: [{ id: 'gospels', books: [{ id: 'matthew' }, { id: 'john' }] }],
  };
  let load;
  beforeEach(() => {
    window.SCRIPTURE_GENRES = GENRES;
    delete window.BOOKS;
    load = null;
    window.__loadBibleCorpus = vi.fn(() => new Promise((resolve, reject) => { load = { resolve, reject }; }));
  });
  afterEach(() => {
    delete window.SCRIPTURE_GENRES;
    delete window.BOOKS;
    delete window.__loadBibleCorpus;
  });
  const LOADED = { genesis: { chapters: new Array(50) }, obadiah: { chapters: [{}] }, john: { chapters: new Array(21) } };

  it('loaded: a many-chapter book opens its index, a one-chapter book its chapter, Matthew its study index', () => {
    window.BOOKS = LOADED;
    const { result, props } = setup();
    act(() => { result.current.selectScriptureBook('genesis'); });
    expect(props.setBookId).toHaveBeenLastCalledWith('genesis');
    expect(props.setChapterNum).toHaveBeenLastCalledWith(null);
    expect(props.setScreen).toHaveBeenLastCalledWith('bible-idx');
    act(() => { result.current.selectScriptureBook('obadiah', true); });
    expect(props.setGenreId).toHaveBeenCalledWith(null);
    expect(props.setChapterNum).toHaveBeenLastCalledWith(1);
    expect(props.setScreen).toHaveBeenLastCalledWith('bible-ch');
    act(() => { result.current.selectScriptureBook('matthew'); });
    expect(props.setScreen).toHaveBeenLastCalledWith('matthew-idx');
    expect(window.__loadBibleCorpus).not.toHaveBeenCalled();
  });

  it('NOT loaded: the tap is not dropped — the book opens on its loading view at once, and the load starts', () => {
    const { result, props } = setup({ screen: 'scripture-genre' });
    act(() => { result.current.selectScriptureBook('genesis'); });
    expect(props.setBookId).toHaveBeenCalledWith('genesis');
    expect(props.setChapterNum).toHaveBeenCalledWith(null);
    expect(props.setScreen, 'the bible-idx route shows "Loading Bible…" until BOOKS lands').toHaveBeenCalledWith('bible-idx');
    expect(window.__loadBibleCorpus).toHaveBeenCalledTimes(1);
  });

  it('NOT loaded, a one-chapter book: once the text lands, a reader still on the loading view goes on into the chapter', async () => {
    const props = { ...baseProps(), screen: 'scripture-genre' };
    const { result, rerender } = renderHook((p) => useReadingPositionNav(p), { initialProps: props });
    act(() => { result.current.selectScriptureBook('obadiah'); });
    rerender({ ...props, screen: 'bible-idx', bookId: 'obadiah' });      // App re-rendered onto the loading view
    window.BOOKS = LOADED;
    await act(async () => { load.resolve(); });
    expect(props.setChapterNum).toHaveBeenLastCalledWith(1);
    expect(props.setScreen).toHaveBeenLastCalledWith('bible-ch');
  });

  it('NOT loaded, a one-chapter book: a reader who left the loading view is not yanked back when the text lands', async () => {
    const props = { ...baseProps(), screen: 'scripture-genre' };
    const { result, rerender } = renderHook((p) => useReadingPositionNav(p), { initialProps: props });
    act(() => { result.current.selectScriptureBook('obadiah'); });
    rerender({ ...props, screen: 'scripture-genre', bookId: 'obadiah' });   // back out before the load
    window.BOOKS = LOADED;
    await act(async () => { load.resolve(); });
    expect(props.setScreen).toHaveBeenCalledTimes(1);                     // the loading view only
    expect(props.setScreen).not.toHaveBeenCalledWith('bible-ch');
  });

  it('NOT loaded, a failed load leaves the loading view to show its retry, and throws nothing', async () => {
    const props = { ...baseProps(), screen: 'scripture-genre' };
    const { result, rerender } = renderHook((p) => useReadingPositionNav(p), { initialProps: props });
    act(() => { result.current.selectScriptureBook('obadiah'); });
    rerender({ ...props, screen: 'bible-idx', bookId: 'obadiah' });
    await act(async () => { load.reject(new Error('offline')); });
    expect(props.setScreen).toHaveBeenCalledTimes(1);
  });

  it('an id that is not a Bible book opens nothing, loaded or not', () => {
    const { result, props } = setup();
    act(() => { result.current.selectScriptureBook('volume-one'); });
    window.BOOKS = LOADED;
    act(() => { result.current.selectScriptureBook('volume-one'); });
    expect(props.setScreen).not.toHaveBeenCalled();
    expect(window.__loadBibleCorpus).not.toHaveBeenCalled();
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

/* ── Catch-all position arm (owner-reported 2026-07-19) ──────────────────
   BEING on a reading screen must make it the resume target — the gap
   cases were tab-switch onto an already-open reading screen and a
   cold-boot restore (no nav selector ran → the dot pointed somewhere
   older). Non-reading screens (home / journal / settings) must NEVER
   touch the cursor — the owner's detour repro. */
describe('useReadingPositionNav — catch-all position arm', () => {
  let _prevColByLetterSc;
  beforeEach(() => {
    _prevColByLetterSc = window.COL_BY_LETTER_SC;
    window.COL_BY_LETTER_SC = new Map([
      ['vot-letter', { volKey: 'two', letterScreen: 'vot-letter' }],
      ['wtlb-entry', { volKey: 'wtlb-one', letterScreen: 'wtlb-entry' }],
    ]);
  });
  afterEach(() => { window.COL_BY_LETTER_SC = _prevColByLetterSc; });

  it('arms the cursor from a bible chapter the tab is sitting on (tab-switch/restore repro)', () => {
    const { props } = setup({ screen: 'bible-ch', bookId: 'proverbs', chapterNum: 2 });
    expect(props.setActiveReadKey).toHaveBeenCalledTimes(1);
    const [key, commitFn] = props.setActiveReadKey.mock.calls[0];
    expect(key).toBe('proverbs');
    commitFn(); // the commit writes the chapter cursor
    const updater = props.setLastReadChapters.mock.calls[0][0];
    expect(updater({ psalms: 23 })).toEqual({ psalms: 23, proverbs: 2 });
  });

  it('arms matthew under its fixed key', () => {
    const { props } = setup({ screen: 'matthew-ch', chapterNum: 5 });
    expect(props.setActiveReadKey.mock.calls[0][0]).toBe('matthew');
  });

  it('arms a letter screen under its vol: key via COL_BY_LETTER_SC', () => {
    const { props } = setup({ screen: 'vot-letter', letterId: 'grafted-in' });
    const [key, commitFn] = props.setActiveReadKey.mock.calls[0];
    expect(key).toBe('vol:two');
    commitFn();
    const updater = props.setLastReadLetterMap.mock.calls[0][0];
    expect(updater({})).toEqual({ two: 'grafted-in' });
  });

  it('arms a study chapter under the bible-study-<slug> key', () => {
    const { props } = setup({
      screen: 'bible-study-chapter', studyId: 'more-than-a-man', studyChapterId: 'ch-2',
      getStudyById: vi.fn(() => ({ slug: 'more-than-a-man' })),
    });
    const [key, commitFn] = props.setActiveReadKey.mock.calls[0];
    expect(key).toBe('bible-study-more-than-a-man');
    commitFn();
    const updater = props.setLastReadChapters.mock.calls[0][0];
    expect(updater({})).toEqual({ 'bible-study-more-than-a-man': 'ch-2' });
  });

  it('NEVER arms from non-reading screens — a home/journal/settings detour cannot move the dot', () => {
    for (const screen of ['home', 'journal-viewer', 'journal-editor', 'settings', 'library', 'notes-index', 'search']) {
      const { props } = setup({ screen, bookId: 'proverbs', chapterNum: 2, letterId: 'grafted-in' });
      expect(props.setActiveReadKey).not.toHaveBeenCalled();
    }
  });

  it('does not arm from a half-populated place (screen set, chapter missing)', () => {
    const { props } = setup({ screen: 'bible-ch', bookId: 'proverbs', chapterNum: null });
    expect(props.setActiveReadKey).not.toHaveBeenCalled();
  });

  it('arms once per place — an unrelated re-render does not re-arm', () => {
    const props = { ...baseProps(), screen: 'bible-ch', bookId: 'proverbs', chapterNum: 2 };
    const { rerender } = renderHook((p) => useReadingPositionNav(p), { initialProps: props });
    rerender({ ...props, activeReadKey: 'proverbs' }); // unrelated prop churn
    expect(props.setActiveReadKey).toHaveBeenCalledTimes(1);
  });

  it('re-arms when the chapter changes (swipe/arrow within the book)', () => {
    const props = { ...baseProps(), screen: 'bible-ch', bookId: 'proverbs', chapterNum: 2 };
    const { rerender } = renderHook((p) => useReadingPositionNav(p), { initialProps: props });
    rerender({ ...props, chapterNum: 3 });
    expect(props.setActiveReadKey).toHaveBeenCalledTimes(2);
    expect(props.setActiveReadKey.mock.calls[1][0]).toBe('proverbs');
  });
});
