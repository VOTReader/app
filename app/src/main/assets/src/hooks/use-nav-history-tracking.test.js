/* P7a — useNavHistoryTracking tests.
   ───────────────────────────────────
   useNavHistoryTracking is the policy hook that decides WHEN to call
   addToHistory based on the current nav state. It has 4 distinct
   branches (one per screen-type the app records into history) plus an
   intentional fall-through (nothing matches → no call), plus a
   nav-change re-fire contract.

   The silent-failure modes worth guarding:

     A) Branch dispatch errors. If the wrong branch fires for a given
        screen, history records the wrong entry shape — the user sees
        a "chapter" listing on a screen that was actually a letter.
        Each branch has a positive test that asserts the correct
        addToHistory call shape.

     B) Closure-stale reads. The 4 helper callbacks (addToHistory,
        _findLetter, getStudyById, getStudyChapter) are excluded from
        deps by design. If a future refactor accidentally CACHES one
        (e.g. wraps addToHistory in useCallback with wrong deps), the
        effect would call a stale closure on subsequent renders. The
        re-fire test rerenders with new nav state + new addToHistory
        and asserts the LATEST closure fires.

     C) Lookup-miss silent drop. If COL_BY_LETTER_SC.get(screen) misses
        or _findLetter returns null, the letter branch is supposed to
        SKIP the addToHistory call (no garbage entry). Same for the
        study branch when getStudyById/getStudyChapter return null.
        These are guard tests — assert that no call happens, not just
        the wrong shape.

   The hook reads cross-bundle globals (MATTHEW, BOOKS, COL_BY_LETTER_SC).
   In production those are populated by _entry-b's Object.assign(window).
   Tests stub them on globalThis in beforeEach + restore in afterEach so
   the suite is self-contained (no test leaks state into the next).

   Tests use renderHook + a vi.fn() for addToHistory. The other 3 helpers
   are stubbed as vi.fn()s with controlled return values so we can assert
   on call-shape without standing up a real COLLECTIONS / STUDIES graph.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNavHistoryTracking } from './use-nav-history-tracking.js';

// ── Global stubs ────────────────────────────────────────────────────────
// The hook reads MATTHEW / BOOKS / COL_BY_LETTER_SC as bare-name globals
// (cross-bundle pattern documented in the hook header). In jsdom,
// `window === globalThis`, so writing to `window.X` exposes the value as
// a bare name AND keeps the typecheck clean (globals.generated.d.ts has
// a `Window { [key: string]: any }` index signature but no parallel
// augmentation on `globalThis`). vitest.setup.js's bridge stubs use the
// same pattern for the same reason.
let _prevMATTHEW, _prevBOOKS, _prevCOL_BY_LETTER_SC;

beforeEach(() => {
  _prevMATTHEW = window.MATTHEW;
  _prevBOOKS = window.BOOKS;
  _prevCOL_BY_LETTER_SC = window.COL_BY_LETTER_SC;

  window.MATTHEW = {
    chapters: [
      { num: 1, title: 'Matthew Ch 1' },
      { num: 5, title: 'The Sermon on the Mount' },
      { num: 22, title: 'The Greatest Commandment' },
    ],
  };
  window.BOOKS = {
    genesis: {
      title: 'Genesis',
      chapters: [
        { num: 1, title: 'In the Beginning' },
        { num: 2, title: 'The Garden' },
      ],
    },
    psalms: {
      title: 'Psalms',
      chapters: [
        { num: 23, title: 'The Lord is my Shepherd' },
      ],
    },
  };
  // Map<letterScreen, { volKey, indexScreen }>
  window.COL_BY_LETTER_SC = new Map([
    ['vol-two-letter', { volKey: 'two', indexScreen: 'vol-two-idx' }],
    ['wtlb1-letter', { volKey: 'wtlb1', indexScreen: 'wtlb1-idx' }],
  ]);
});

afterEach(() => {
  window.MATTHEW = _prevMATTHEW;
  window.BOOKS = _prevBOOKS;
  window.COL_BY_LETTER_SC = _prevCOL_BY_LETTER_SC;
});

// ── Helpers ─────────────────────────────────────────────────────────────
// Sane defaults so each test only needs to override the props it cares
// about. addToHistory is always a fresh vi.fn() per test (created at
// renderHook time below).
const baseProps = () => ({
  screen: 'home',
  bookId: null,
  chapterNum: null,
  letterId: null,
  studyId: null,
  studyChapterId: null,
  addToHistory: vi.fn(),
  _findLetter: vi.fn(() => null),
  getStudyById: vi.fn(() => null),
  getStudyChapter: vi.fn(() => null),
});

describe('useNavHistoryTracking — matthew-ch branch', () => {
  it('records a chapter entry with the matched MATTHEW chapter title', () => {
    const props = { ...baseProps(), screen: 'matthew-ch', chapterNum: 5 };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).toHaveBeenCalledTimes(1);
    expect(props.addToHistory).toHaveBeenCalledWith({
      type: 'chapter',
      bookId: 'matthew',
      bookTitle: 'Matthew',
      chapterNum: 5,
      chapterTitle: 'The Sermon on the Mount',
    });
  });

  it('records chapterTitle: null when the chapter number is not in MATTHEW.chapters', () => {
    // Guards the `ch?.title || null` fallback. If the renderer assumed a
    // string title here, this would crash; the spec is "null is OK, the
    // history surface tolerates missing titles".
    const props = { ...baseProps(), screen: 'matthew-ch', chapterNum: 999 };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chapter', bookId: 'matthew', chapterNum: 999, chapterTitle: null })
    );
  });

  it('does NOT record when chapterNum is falsy (no chapter selected yet)', () => {
    // Screen is matthew-ch but chapterNum hasn't been set — the screen
    // is in transition. Recording an entry without a chapterNum would
    // create a broken history row the user can never re-open.
    const props = { ...baseProps(), screen: 'matthew-ch', chapterNum: null };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).not.toHaveBeenCalled();
  });
});

describe('useNavHistoryTracking — bible-ch branch', () => {
  it('records a chapter entry with the book title + chapter title from BOOKS', () => {
    const props = { ...baseProps(), screen: 'bible-ch', bookId: 'genesis', chapterNum: 2 };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).toHaveBeenCalledTimes(1);
    expect(props.addToHistory).toHaveBeenCalledWith({
      type: 'chapter',
      bookId: 'genesis',
      bookTitle: 'Genesis',
      chapterNum: 2,
      chapterTitle: 'The Garden',
    });
  });

  it('falls back to bookId as bookTitle when the book is missing from BOOKS', () => {
    // The `book?.title || bookId` fallback — if BOOKS hasn't been
    // populated yet (early boot) or an unknown bookId slipped through,
    // we still want a recognizable label.
    const props = { ...baseProps(), screen: 'bible-ch', bookId: 'unknown', chapterNum: 1 };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chapter', bookId: 'unknown', bookTitle: 'unknown', chapterTitle: null })
    );
  });

  it('does NOT record when bookId is missing', () => {
    const props = { ...baseProps(), screen: 'bible-ch', bookId: null, chapterNum: 1 };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).not.toHaveBeenCalled();
  });

  it('does NOT record when chapterNum is missing', () => {
    const props = { ...baseProps(), screen: 'bible-ch', bookId: 'genesis', chapterNum: null };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).not.toHaveBeenCalled();
  });
});

describe('useNavHistoryTracking — letter branch', () => {
  it('records a letter entry when COL_BY_LETTER_SC + _findLetter both hit', () => {
    const _findLetter = vi.fn((volKey) => {
      if (volKey === 'two') return { id: 'the-wide-path', title: 'The Wide Path', num: 1 };
      return null;
    });
    const props = {
      ...baseProps(),
      screen: 'vol-two-letter',
      letterId: 'the-wide-path',
      _findLetter,
    };
    renderHook(() => useNavHistoryTracking(props));

    expect(_findLetter).toHaveBeenCalledWith('two');
    expect(props.addToHistory).toHaveBeenCalledTimes(1);
    expect(props.addToHistory).toHaveBeenCalledWith({
      type: 'letter',
      letterId: 'the-wide-path',
      letterTitle: 'The Wide Path',
      letterNum: 1,
      volumeScreen: 'vol-two-idx',
    });
  });

  it('records letterNum: null when _findLetter returns an entry without num (preface case)', () => {
    // Prefaces have id+title but no num — the `_he.num || null` fallback
    // protects history rendering from rendering "undefined" as a label.
    const _findLetter = vi.fn(() => ({ id: 'preface', title: 'A Warning' }));
    const props = {
      ...baseProps(),
      screen: 'vol-two-letter',
      letterId: 'preface',
      _findLetter,
    };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'letter', letterTitle: 'A Warning', letterNum: null })
    );
  });

  it('does NOT record when COL_BY_LETTER_SC misses (screen not registered as letter)', () => {
    // letterId is set but the screen isn't a known letter screen. The
    // guard prevents recording phantom entries for transitional nav
    // states (e.g. stale letterId from a different tab).
    const _findLetter = vi.fn(() => ({ id: 'x', title: 'X', num: 1 }));
    const props = {
      ...baseProps(),
      screen: 'home',
      letterId: 'the-wide-path',
      _findLetter,
    };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).not.toHaveBeenCalled();
    // _findLetter should also NOT have been called — the COL_BY_LETTER_SC
    // miss short-circuits before the lookup.
    expect(_findLetter).not.toHaveBeenCalled();
  });

  it('does NOT record when _findLetter returns null (letter not in collection)', () => {
    // The screen IS a registered letter screen and the letterId is set,
    // but _findLetter can't find it (e.g. an orphaned letterId from a
    // collection that's since been edited). Don't record an entry with
    // a null title — the user wouldn't recognize it later.
    const _findLetter = vi.fn(() => null);
    const props = {
      ...baseProps(),
      screen: 'vol-two-letter',
      letterId: 'nonexistent',
      _findLetter,
    };
    renderHook(() => useNavHistoryTracking(props));

    expect(_findLetter).toHaveBeenCalledWith('two');
    expect(props.addToHistory).not.toHaveBeenCalled();
  });
});

describe('useNavHistoryTracking — bible-study-chapter branch', () => {
  it('records a study-chapter entry when both lookups hit', () => {
    const study = { id: 'purity', slug: 'purity', title: 'Purity', chapters: [] };
    const chapter = { id: 'ch1', num: 1, title: 'Chapter One' };
    const getStudyById = vi.fn(() => study);
    const getStudyChapter = vi.fn(() => chapter);

    const props = {
      ...baseProps(),
      screen: 'bible-study-chapter',
      studyId: 'purity',
      studyChapterId: 'ch1',
      getStudyById,
      getStudyChapter,
    };
    renderHook(() => useNavHistoryTracking(props));

    expect(getStudyById).toHaveBeenCalledWith('purity');
    expect(getStudyChapter).toHaveBeenCalledWith(study, 'ch1');
    expect(props.addToHistory).toHaveBeenCalledTimes(1);
    expect(props.addToHistory).toHaveBeenCalledWith({
      type: 'study-chapter',
      studyId: 'purity',
      studyChapterId: 'ch1',
      studyTitle: 'Purity',
      studySlug: 'purity',
      chapterTitle: 'Chapter One',
      chapterNum: 1,
    });
  });

  it('does NOT record when getStudyById returns null', () => {
    const props = {
      ...baseProps(),
      screen: 'bible-study-chapter',
      studyId: 'unknown',
      studyChapterId: 'ch1',
      getStudyById: vi.fn(() => null),
    };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).not.toHaveBeenCalled();
  });

  it('does NOT record when getStudyChapter returns null (study exists, chapter does not)', () => {
    const study = { id: 'purity', slug: 'purity', title: 'Purity', chapters: [] };
    const props = {
      ...baseProps(),
      screen: 'bible-study-chapter',
      studyId: 'purity',
      studyChapterId: 'ch999',
      getStudyById: vi.fn(() => study),
      getStudyChapter: vi.fn(() => null),
    };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).not.toHaveBeenCalled();
  });

  it('does NOT record when studyId is missing', () => {
    const props = {
      ...baseProps(),
      screen: 'bible-study-chapter',
      studyChapterId: 'ch1',
    };
    renderHook(() => useNavHistoryTracking(props));
    expect(props.addToHistory).not.toHaveBeenCalled();
  });

  it('does NOT record when studyChapterId is missing', () => {
    const props = {
      ...baseProps(),
      screen: 'bible-study-chapter',
      studyId: 'purity',
    };
    renderHook(() => useNavHistoryTracking(props));
    expect(props.addToHistory).not.toHaveBeenCalled();
  });
});

describe('useNavHistoryTracking — fall-through (no branch matches)', () => {
  it('is a no-op for the home screen', () => {
    const props = baseProps();  // screen: 'home', all ids null
    renderHook(() => useNavHistoryTracking(props));
    expect(props.addToHistory).not.toHaveBeenCalled();
  });

  it('is a no-op for an unrecognized screen with no letterId', () => {
    const props = { ...baseProps(), screen: 'settings' };
    renderHook(() => useNavHistoryTracking(props));
    expect(props.addToHistory).not.toHaveBeenCalled();
  });
});

describe('useNavHistoryTracking — nav-change re-fire contract', () => {
  it('re-fires on each distinct nav-state change', () => {
    const addToHistory = vi.fn();
    const _findLetter = vi.fn();
    const getStudyById = vi.fn();
    const getStudyChapter = vi.fn();

    // Helper that builds props from a partial. The 4 callbacks stay
    // the SAME function identities across rerenders — this isolates
    // "nav change triggers re-fire" from "helper identity change
    // doesn't trigger re-fire" (the deps-array contract).
    const propsFor = (overrides) => ({
      ...baseProps(),
      addToHistory, _findLetter, getStudyById, getStudyChapter,
      ...overrides,
    });

    const { rerender } = renderHook(
      (p) => useNavHistoryTracking(p),
      { initialProps: propsFor({ screen: 'matthew-ch', chapterNum: 1 }) }
    );

    expect(addToHistory).toHaveBeenCalledTimes(1);
    expect(addToHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ chapterNum: 1 })
    );

    // chapterNum changes → effect re-fires
    rerender(propsFor({ screen: 'matthew-ch', chapterNum: 5 }));
    expect(addToHistory).toHaveBeenCalledTimes(2);
    expect(addToHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ chapterNum: 5 })
    );

    // screen changes (matthew-ch → bible-ch) → effect re-fires
    rerender(propsFor({ screen: 'bible-ch', bookId: 'genesis', chapterNum: 1 }));
    expect(addToHistory).toHaveBeenCalledTimes(3);
    expect(addToHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ bookId: 'genesis', chapterNum: 1 })
    );
  });

  it('does NOT re-fire when only helper identities change (deps-array contract)', () => {
    // The 4 helpers are intentionally excluded from the deps array.
    // If a future refactor adds them by mistake, the effect would fire
    // on every render — both blowing up history with duplicates and
    // breaking the "nav-change is the trigger" invariant.
    const navProps = { screen: 'matthew-ch', chapterNum: 5 };

    const addToHistory1 = vi.fn();
    const { rerender } = renderHook(
      (p) => useNavHistoryTracking(p),
      { initialProps: { ...baseProps(), ...navProps, addToHistory: addToHistory1 } }
    );
    expect(addToHistory1).toHaveBeenCalledTimes(1);

    // Same nav state, but a NEW addToHistory function identity.
    const addToHistory2 = vi.fn();
    rerender({ ...baseProps(), ...navProps, addToHistory: addToHistory2 });

    // addToHistory1 not called again; addToHistory2 never called.
    expect(addToHistory1).toHaveBeenCalledTimes(1);
    expect(addToHistory2).not.toHaveBeenCalled();
  });

  it('calls the LATEST addToHistory closure when nav DOES change', () => {
    // The flip side of the previous test: even though helpers are NOT
    // in deps, when the effect DOES re-fire (because nav changed), it
    // should call the LATEST closure — not a stale captured one. This
    // works because each render rebuilds the effect's callback with
    // the current props in scope.
    const addToHistory1 = vi.fn();
    const { rerender } = renderHook(
      (p) => useNavHistoryTracking(p),
      { initialProps: { ...baseProps(), screen: 'matthew-ch', chapterNum: 1, addToHistory: addToHistory1 } }
    );
    expect(addToHistory1).toHaveBeenCalledTimes(1);

    // Different nav AND different addToHistory — the LATEST one must fire.
    const addToHistory2 = vi.fn();
    rerender({ ...baseProps(), screen: 'matthew-ch', chapterNum: 5, addToHistory: addToHistory2 });

    expect(addToHistory1).toHaveBeenCalledTimes(1);  // unchanged
    expect(addToHistory2).toHaveBeenCalledTimes(1);  // newest closure fired
    expect(addToHistory2).toHaveBeenCalledWith(
      expect.objectContaining({ chapterNum: 5 })
    );
  });
});

describe('useNavHistoryTracking — branch precedence (only one branch fires per render)', () => {
  it('matthew-ch wins over letterId when both are set (matthew-ch branch is first)', () => {
    // Defensive: the screen is matthew-ch but a stale letterId is also
    // set. The if/else-if chain means matthew-ch fires and letterId is
    // ignored — assert that exactly ONE add happens with the matthew
    // shape (not two adds, not the letter shape).
    const props = {
      ...baseProps(),
      screen: 'matthew-ch',
      chapterNum: 5,
      letterId: 'some-stale-letter',
    };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).toHaveBeenCalledTimes(1);
    expect(props.addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chapter', bookId: 'matthew' })
    );
  });

  it('letterId branch fires when screen is a letter screen even with study ids stale', () => {
    // letterId branch is the 3rd in the chain — it should still win
    // against stale studyId/studyChapterId that come AFTER it.
    const _findLetter = vi.fn(() => ({ id: 'x', title: 'X Letter', num: 7 }));
    const props = {
      ...baseProps(),
      screen: 'vol-two-letter',
      letterId: 'x',
      studyId: 'stale-study',
      studyChapterId: 'stale-ch',
      _findLetter,
    };
    renderHook(() => useNavHistoryTracking(props));

    expect(props.addToHistory).toHaveBeenCalledTimes(1);
    expect(props.addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'letter', letterId: 'x' })
    );
  });
});
