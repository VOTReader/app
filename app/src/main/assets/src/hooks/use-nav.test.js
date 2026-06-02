/* P7b — useNav tests.
   ─────────────────────
   useNav exposes 20 simple nav-chrome helpers. Each is a thin
   "call setters in the right order" function — tests verify the
   call shape (which setters, what values, what order matters).

   Silent-failure modes worth guarding:

     A) The navOrigin snapshot. 8 helpers share `_captureOrigin()` which
        snapshots all 6 nav-state fields. If one field is dropped, the
        Back affordance from that destination would restore an
        incomplete position (e.g., return to home with the book stuck
        on Genesis). Tests assert all 6 fields are in the snapshot.

     B) goHome's cleanup. It clears 5 state fields PLUS 2 window
        data-slot writes. Missing one would leak source-context across
        navigation (e.g. a stale fromSearch flag making the back arrow
        return to a search screen the user no longer wanted). Tested
        as a single integration shape.

     C) Falsy-guard correctness. goJournalViewer/Editor early-return on
        a falsy eid; goColIdx early-returns when the COL_BY_KEY lookup
        misses or the match has no indexScreen. The contract is "no
        setter calls happen" — tested as zero invocations.

     D) navOrigin field-by-field. Tests build props with distinct,
        identifiable values per field so a swapped pair (bookId ↔
        letterId) shows up as a wrong-field-in-snapshot, not as
        "tests pass but production breaks."

   All setters are vi.fn() — useNav's contract is the call shape, not
   end-to-end persistence. The setters' real implementations live in
   useTabs (tabField) / useState, both covered by their own tests.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNav } from './use-nav.js';
import { navHandoff } from '../utils/nav-handoff.js';

// ── Global stubs ────────────────────────────────────────────────────────
// useNav reads COL_BY_KEY (cross-bundle Map, populated by _entry-b in
// production). Same window-vs-globalThis pattern as P7a's tests — the
// Window index signature in globals.generated.d.ts makes window.X
// typecheck-clean while globalThis.X does not.
let _prevCOL_BY_KEY;

beforeEach(() => {
  _prevCOL_BY_KEY = window.COL_BY_KEY;
  window.COL_BY_KEY = new Map([
    ['two', { volKey: 'two', indexScreen: 'vol-two-idx' }],
    ['wtlb1', { volKey: 'wtlb1', indexScreen: 'wtlb1-idx' }],
    ['empty', { volKey: 'empty' }],  // matches lookup but has no indexScreen
  ]);
  // navHandoff slots that goHome clears — set sentinels so the test can
  // assert they were cleared (not just left untouched). navHandoff is
  // globalized by _entry-b in production; mirror that here.
  window.navHandoff = navHandoff;
  navHandoff._resetForTests();
  navHandoff.set('pendingHighlight', { sentinel: true });
  navHandoff.set('pendingScrollHlKey', 'sentinel');
});

afterEach(() => {
  window.COL_BY_KEY = _prevCOL_BY_KEY;
});

// ── Test helpers ────────────────────────────────────────────────────────
// Distinct sentinel values per nav-state field so a swapped/misordered
// snapshot field is immediately obvious in the assertion diff (not
// "expected 'a' got 'a'" but "expected 'screen-sentinel' got
// 'bookId-sentinel'"). Captures common build-snapshot bugs that uniform
// 'a'/'b' values would miss.
const navStateProps = () => ({
  screen: 'screen-sentinel',
  bookId: 'bookId-sentinel',
  chapterNum: 5,
  letterId: 'letterId-sentinel',
  studyId: 'studyId-sentinel',
  studyChapterId: 'studyChapterId-sentinel',
});

const makeSetters = () => ({
  setScreen: vi.fn(),
  setBookId: vi.fn(),
  setChapterNum: vi.fn(),
  setLetterId: vi.fn(),
  setGenreId: vi.fn(),
  setNavOrigin: vi.fn(),
  setFromSearch: vi.fn(),
  setFromWtlb: vi.fn(),
  setFromLetterStack: vi.fn(),
  setJournalEntryId: vi.fn(),
  setGardenPage: vi.fn(),
});

const setup = (overrides = {}) => {
  const setters = makeSetters();
  const props = { ...navStateProps(), ...setters, ...overrides };
  const { result } = renderHook(() => useNav(props));
  return { result, setters, props };
};

// ── Pure screen-switchers ───────────────────────────────────────────────

describe('useNav — pure screen-switchers (no navOrigin capture)', () => {
  it('goVolumesHome → setScreen("volumes-home"), nothing else', () => {
    const { result, setters } = setup();
    result.current.goVolumesHome();
    expect(setters.setScreen).toHaveBeenCalledWith('volumes-home');
    expect(setters.setNavOrigin).not.toHaveBeenCalled();
    expect(setters.setBookId).not.toHaveBeenCalled();
  });

  it('goScripturesHome → setScreen + clears bookId, chapterNum, genreId', () => {
    const { result, setters } = setup();
    result.current.goScripturesHome();
    expect(setters.setScreen).toHaveBeenCalledWith('scriptures-home');
    expect(setters.setBookId).toHaveBeenCalledWith(null);
    expect(setters.setChapterNum).toHaveBeenCalledWith(null);
    expect(setters.setGenreId).toHaveBeenCalledWith(null);
    expect(setters.setNavOrigin).not.toHaveBeenCalled();
  });

  it('goScriptureGenre → setGenreId(arg) + setScreen("scripture-genre")', () => {
    const { result, setters } = setup();
    result.current.goScriptureGenre('the-law');
    expect(setters.setGenreId).toHaveBeenCalledWith('the-law');
    expect(setters.setScreen).toHaveBeenCalledWith('scripture-genre');
  });

  it('goMatthewIdx → clear chapterNum + setScreen("matthew-idx")', () => {
    const { result, setters } = setup();
    result.current.goMatthewIdx();
    expect(setters.setChapterNum).toHaveBeenCalledWith(null);
    expect(setters.setScreen).toHaveBeenCalledWith('matthew-idx');
  });

  it('goStudiesHome → setScreen("studies-home"), nothing else', () => {
    const { result, setters } = setup();
    result.current.goStudiesHome();
    expect(setters.setScreen).toHaveBeenCalledWith('studies-home');
    expect(setters.setBookId).not.toHaveBeenCalled();
    expect(setters.setChapterNum).not.toHaveBeenCalled();
  });

  it('goBibleIdx → clear chapterNum + setScreen("bible-idx")', () => {
    const { result, setters } = setup();
    result.current.goBibleIdx();
    expect(setters.setChapterNum).toHaveBeenCalledWith(null);
    expect(setters.setScreen).toHaveBeenCalledWith('bible-idx');
  });

  it('goToGardenFirst → setGardenPage(1) + setScreen("garden-view")', () => {
    const { result, setters } = setup();
    result.current.goToGardenFirst();
    expect(setters.setGardenPage).toHaveBeenCalledWith(1);
    expect(setters.setScreen).toHaveBeenCalledWith('garden-view');
  });
});

// ── goHome ──────────────────────────────────────────────────────────────

describe('useNav — goHome (multi-state reset)', () => {
  it('clears the 3 source-context state fields', () => {
    const { result, setters } = setup();
    result.current.goHome();
    expect(setters.setFromSearch).toHaveBeenCalledWith(false);
    expect(setters.setFromWtlb).toHaveBeenCalledWith(null);
    expect(setters.setFromLetterStack).toHaveBeenCalledWith([]);
  });

  it('clears the 2 navHandoff slots (pendingHighlight, pendingScrollHlKey)', () => {
    // Slots are set to non-null sentinels in beforeEach so we can verify
    // they were CLEARED (not just "still null because nothing touched them").
    const { result } = setup();
    expect(navHandoff.peek('pendingHighlight')).toEqual({ sentinel: true });
    expect(navHandoff.peek('pendingScrollHlKey')).toBe('sentinel');
    result.current.goHome();
    expect(navHandoff.peek('pendingHighlight')).toBeNull();
    expect(navHandoff.peek('pendingScrollHlKey')).toBeNull();
  });

  it('routes to home + clears bookId + chapterNum', () => {
    const { result, setters } = setup();
    result.current.goHome();
    expect(setters.setScreen).toHaveBeenCalledWith('home');
    expect(setters.setBookId).toHaveBeenCalledWith(null);
    expect(setters.setChapterNum).toHaveBeenCalledWith(null);
  });

  it('does NOT touch navOrigin (goHome means "really home", not "snapshot for back")', () => {
    const { result, setters } = setup();
    result.current.goHome();
    expect(setters.setNavOrigin).not.toHaveBeenCalled();
  });
});

// ── navOrigin-pattern helpers (8 of them, all identical shape) ─────────

describe('useNav — navOrigin-pattern helpers', () => {
  // Each name → expected destination screen. The capture-then-switch
  // contract is identical across all 8; tested in one parameterized loop
  // so a regression in `_captureOrigin` shows up in every row, not just
  // the first.
  const cases = [
    ['goSettings',        'settings'],
    ['goHistory',         'history'],
    ['goAbout',           'about'],
    ['goLibrary',         'library'],
    ['goJournalHub',      'journal-home'],
    ['goNotesIndex',      'notes-index'],
    ['goLinksIndex',      'links-index'],
    ['goBookmarksIndex',  'bookmarks-index'],
    ['goHighlightsIndex', 'highlights-index'],
  ];

  for (const [helper, destScreen] of cases) {
    it(`${helper} captures origin snapshot + setScreen("${destScreen}")`, () => {
      const { result, setters } = setup();
      result.current[helper]();
      // Snapshot must contain ALL 6 nav fields with the CURRENT props
      // (the distinct '*-sentinel' values from navStateProps).
      expect(setters.setNavOrigin).toHaveBeenCalledWith({
        screen: 'screen-sentinel',
        bookId: 'bookId-sentinel',
        chapterNum: 5,
        letterId: 'letterId-sentinel',
        studyId: 'studyId-sentinel',
        studyChapterId: 'studyChapterId-sentinel',
      });
      expect(setters.setScreen).toHaveBeenCalledWith(destScreen);
    });
  }

  it('navOrigin snapshot reflects PROP values, not stale captured values (rerender)', () => {
    // If _captureOrigin's closure stales out (e.g., useCallback with
    // wrong deps in a future refactor), the snapshot would record
    // outdated nav state. Rerender with new nav state, then invoke a
    // capturing helper — the snapshot must use the LATEST values.
    const setters = makeSetters();
    const { result, rerender } = renderHook(
      (p) => useNav({ ...p, ...setters }),
      { initialProps: navStateProps() }
    );

    // Rerender with a completely different position.
    rerender({
      screen: 'rerendered-screen',
      bookId: 'rerendered-book',
      chapterNum: 99,
      letterId: 'rerendered-letter',
      studyId: 'rerendered-study',
      studyChapterId: 'rerendered-ch',
    });

    result.current.goSettings();
    expect(setters.setNavOrigin).toHaveBeenCalledWith({
      screen: 'rerendered-screen',
      bookId: 'rerendered-book',
      chapterNum: 99,
      letterId: 'rerendered-letter',
      studyId: 'rerendered-study',
      studyChapterId: 'rerendered-ch',
    });
  });
});

// ── Journal nav ─────────────────────────────────────────────────────────

describe('useNav — journal nav (no navOrigin)', () => {
  it('goJournalViewer(eid) → setJournalEntryId(eid) + setScreen("journal-viewer")', () => {
    const { result, setters } = setup();
    result.current.goJournalViewer('entry-123');
    expect(setters.setJournalEntryId).toHaveBeenCalledWith('entry-123');
    expect(setters.setScreen).toHaveBeenCalledWith('journal-viewer');
    expect(setters.setNavOrigin).not.toHaveBeenCalled();
  });

  it('goJournalViewer(null) → no setter calls (falsy-guard)', () => {
    const { result, setters } = setup();
    result.current.goJournalViewer(null);
    expect(setters.setJournalEntryId).not.toHaveBeenCalled();
    expect(setters.setScreen).not.toHaveBeenCalled();
  });

  it('goJournalViewer(undefined) → no setter calls (falsy-guard)', () => {
    const { result, setters } = setup();
    result.current.goJournalViewer(undefined);
    expect(setters.setJournalEntryId).not.toHaveBeenCalled();
    expect(setters.setScreen).not.toHaveBeenCalled();
  });

  it('goJournalViewer("") → no setter calls (empty-string is falsy)', () => {
    const { result, setters } = setup();
    result.current.goJournalViewer('');
    expect(setters.setJournalEntryId).not.toHaveBeenCalled();
    expect(setters.setScreen).not.toHaveBeenCalled();
  });

  it('goJournalEditor(eid) → setJournalEntryId(eid) + setScreen("journal-editor")', () => {
    const { result, setters } = setup();
    result.current.goJournalEditor('entry-456');
    expect(setters.setJournalEntryId).toHaveBeenCalledWith('entry-456');
    expect(setters.setScreen).toHaveBeenCalledWith('journal-editor');
  });

  it('goJournalEditor(null) → no setter calls (falsy-guard)', () => {
    const { result, setters } = setup();
    result.current.goJournalEditor(null);
    expect(setters.setJournalEntryId).not.toHaveBeenCalled();
    expect(setters.setScreen).not.toHaveBeenCalled();
  });
});

// ── goColIdx ────────────────────────────────────────────────────────────

describe('useNav — goColIdx (COL_BY_KEY-driven nav)', () => {
  it('navigates to the indexScreen when volKey hits in COL_BY_KEY', () => {
    const { result, setters } = setup();
    result.current.goColIdx('two');
    expect(setters.setScreen).toHaveBeenCalledWith('vol-two-idx');
  });

  it('is a no-op when volKey misses in COL_BY_KEY (unknown volume)', () => {
    // Guards against stale volKeys from old vot-state payloads — they
    // shouldn't blow up; just silently skip.
    const { result, setters } = setup();
    result.current.goColIdx('nonexistent');
    expect(setters.setScreen).not.toHaveBeenCalled();
  });

  it('is a no-op when the matched collection has no indexScreen', () => {
    // The "empty" entry in beforeEach matches the lookup but has no
    // indexScreen — covers the second half of the if-guard.
    const { result, setters } = setup();
    result.current.goColIdx('empty');
    expect(setters.setScreen).not.toHaveBeenCalled();
  });
});

// ── Cross-cutting: no-extra-setter-firings ──────────────────────────────

describe('useNav — minimality (helpers only call their documented setters)', () => {
  // Verifies that simple helpers don't ALSO call unrelated setters
  // (e.g., a regression where goSettings starts touching gardenPage).
  // The pure-switcher tests above check this per-helper; this is the
  // umbrella sanity check that everything is properly isolated.

  it('goVolumesHome only touches setScreen', () => {
    const { result, setters } = setup();
    result.current.goVolumesHome();
    const fired = Object.entries(setters).filter(([, fn]) => fn.mock.calls.length > 0);
    expect(fired.map(([k]) => k).sort()).toEqual(['setScreen']);
  });

  it('goStudiesHome only touches setScreen', () => {
    const { result, setters } = setup();
    result.current.goStudiesHome();
    const fired = Object.entries(setters).filter(([, fn]) => fn.mock.calls.length > 0);
    expect(fired.map(([k]) => k).sort()).toEqual(['setScreen']);
  });

  it('goSettings only touches setNavOrigin + setScreen', () => {
    const { result, setters } = setup();
    result.current.goSettings();
    const fired = Object.entries(setters).filter(([, fn]) => fn.mock.calls.length > 0);
    expect(fired.map(([k]) => k).sort()).toEqual(['setNavOrigin', 'setScreen']);
  });

  it('goToGardenFirst only touches setGardenPage + setScreen', () => {
    const { result, setters } = setup();
    result.current.goToGardenFirst();
    const fired = Object.entries(setters).filter(([, fn]) => fn.mock.calls.length > 0);
    expect(fired.map(([k]) => k).sort()).toEqual(['setGardenPage', 'setScreen']);
  });
});
