/* useFromLetterStack tests — the "‹ Back to …" back-stack state machine.
   ──────────────────────────────────────────────────────────────────────
   This hook is the ONE place the cross-screen back pill exists, and until
   now it had no test file of its own. Every other pill test asserts a
   CALLER's behaviour (use-tap-through's push shape, use-android-back's
   step-3b parity), so the machine itself — the 50-cap, the source restore,
   the prune effect, `_destMatches`' nullish don't-care semantics, and the
   backHint/backActive split — was unguarded.

   Silent-failure modes worth guarding:

     A) The 50-entry cap. An uncapped stack grows forever inside a
        PERSISTED tabField (use-tabs.js:83), so a runaway push path bloats
        every saved tab.

     B) tapThroughBack's source restore. It restores SEVEN nav fields, each
        guarded on `!== undefined`. A missed field lands the user on the
        right screen with the wrong content loaded.

     C) The prune effect. It evicts the top entry once the user has
        navigated away from the recorded destination (single-shot pill).
        Too eager → the pill vanishes on arrival; too lax → a stale pill
        offers a jump the user never asked for. Entries with NO destSnapshot
        are exempt (the multi-level letter→letter chain depends on it).

     D) `_destMatches` treats BOTH null and undefined as "don't care". A
        strict `=== undefined` check once silently pruned the Notes-index
        flow. Old persisted tabs deserialize WITHOUT journalEntryId (the
        7th field), so that leniency is load-bearing again.

     E) backHint vs backActive. History pushes `silent` entries: no pill,
        but back must still return to History. Collapsing the two would
        either resurrect a filed bug or show the pill the owner asked us to
        remove.

     F) retargetTop (sweep v041). The audio follower moves the pane in
        place; without the carry the prune evicted the entry and the pill
        and hardware Back's target went with it. It must carry only a LIVE
        top, never revive a stale one.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFromLetterStack } from './use-from-letter-stack.js';
import { navHandoff } from '../utils/nav-handoff.js';

let _prevHandoff;
beforeEach(() => {
  // Production hooks call window.navHandoff.* — _entry-b globalizes it in
  // the app; mirror that here (tapThroughBack clears 'pendingHighlight').
  _prevHandoff = window.navHandoff;
  window.navHandoff = navHandoff;
  navHandoff._resetForTests();
});
afterEach(() => {
  window.navHandoff = _prevHandoff;
  navHandoff._resetForTests();
});

/** The 7 tracked nav fields, all at their "nowhere" value. */
const NAV = {
  screen: 'home', bookId: null, chapterNum: null, letterId: null,
  studyId: null, studyChapterId: null, journalEntryId: null,
};

/**
 * Render the hook with a real (useState-backed) tabField so pushes and pops
 * actually round-trip, and spy setters so the source-restore is observable.
 * `rerender(navOverrides)` moves the app's nav position — which is what the
 * prune effect and backHint react to.
 */
function setup(nav = {}) {
  const setters = {
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(),
    setLetterId: vi.fn(), setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    setJournalEntryId: vi.fn(),
  };
  const { result, rerender } = renderHook(
    (navProps) => {
      const [stack, setStack] = React.useState([]);
      // searchOrigin (useSearch's) and navOrigin (App's) are tabFields, read-only
      // here: a rerender's `searchOrigin` / `navOrigin` stands for them (null
      // when no detour is open).
      const { searchOrigin = null, navOrigin = null, ...nav } = navProps;
      const tabField = (key) => {
        if (key === 'searchOrigin') return [searchOrigin, () => {}];
        if (key === 'navOrigin') return [navOrigin, () => {}];
        if (key !== 'fromLetterStack') throw new Error('unexpected tabField: ' + key);
        return [stack, setStack];
      };
      return useFromLetterStack({ tabField, ...NAV, ...nav, ...setters });
    },
    { initialProps: nav },
  );
  return { result, rerender: (n = {}) => rerender(n), setters };
}

/** A full source-context entry, as the push paths build it. */
const entry = (over = {}) => ({
  sourceScreen: 'notes-index', sourceBookId: null, sourceChapterNum: null,
  sourceLetterId: null, sourceStudyId: null, sourceStudyChapterId: null,
  sourceJournalEntryId: null, sourceLetterTitle: 'My Notes',
  sourceVolumeLabel: null, destSnapshot: null, ...over,
});

// ── A) the 50-entry cap ─────────────────────────────────────────────────

describe('useFromLetterStack — pushFromLetter', () => {
  it('caps the stack at 50, keeping the MOST RECENT entries', () => {
    const { result } = setup();
    act(() => {
      for (let i = 0; i < 55; i++) {
        result.current.pushFromLetter(entry({ sourceLetterTitle: 'L' + i, sourceScreen: 'vot-letter' }));
      }
    });
    expect(result.current.fromLetterStack).toHaveLength(50);
    // The 5 oldest were dropped, not the 5 newest.
    expect(result.current.fromLetterStack[0].sourceLetterTitle).toBe('L5');
    expect(result.current.fromLetterStack[49].sourceLetterTitle).toBe('L54');
  });

  it('under the cap it just appends', () => {
    const { result } = setup();
    act(() => { result.current.pushFromLetter(entry({ sourceLetterTitle: 'A' })); });
    act(() => { result.current.pushFromLetter(entry({ sourceLetterTitle: 'B' })); });
    expect(result.current.fromLetterStack.map((e) => e.sourceLetterTitle)).toEqual(['A', 'B']);
  });
});

// ── B) tapThroughBack's source restore ──────────────────────────────────

describe('useFromLetterStack — tapThroughBack', () => {
  it('pops the top and restores all SEVEN captured nav fields', () => {
    const { result, setters } = setup();
    act(() => {
      result.current.pushFromLetter(entry({
        sourceScreen: 'bible-study-chapter',
        sourceBookId: 'john', sourceChapterNum: 3, sourceLetterId: 'wide-path',
        sourceStudyId: 'purity', sourceStudyChapterId: 'ch1',
        sourceJournalEntryId: 'e7',
      }));
    });
    act(() => { result.current.tapThroughBack(); });

    expect(setters.setBookId).toHaveBeenCalledWith('john');
    expect(setters.setChapterNum).toHaveBeenCalledWith(3);
    expect(setters.setLetterId).toHaveBeenCalledWith('wide-path');
    expect(setters.setStudyId).toHaveBeenCalledWith('purity');
    expect(setters.setStudyChapterId).toHaveBeenCalledWith('ch1');
    expect(setters.setJournalEntryId).toHaveBeenCalledWith('e7');
    expect(setters.setScreen).toHaveBeenCalledWith('bible-study-chapter');
    expect(result.current.fromLetterStack).toHaveLength(0);
  });

  it('skips a field the entry never captured (undefined ≠ "restore null")', () => {
    const { result, setters } = setup();
    // A legacy persisted entry: no journal field at all.
    act(() => { result.current.pushFromLetter({ sourceScreen: 'vot-letter', sourceLetterId: 'x' }); });
    act(() => { result.current.tapThroughBack(); });
    expect(setters.setLetterId).toHaveBeenCalledWith('x');
    expect(setters.setJournalEntryId).not.toHaveBeenCalled();
    expect(setters.setBookId).not.toHaveBeenCalled();
  });

  it('clears the one-shot pendingHighlight slot', () => {
    const { result } = setup();
    navHandoff.set('pendingHighlight', { excerpt: 'stale' });
    act(() => { result.current.pushFromLetter(entry()); });
    act(() => { result.current.tapThroughBack(); });
    expect(navHandoff.peek('pendingHighlight')).toBeNull();
  });

  it('an empty stack is a no-op (no setter fires)', () => {
    const { result, setters } = setup();
    act(() => { result.current.tapThroughBack(); });
    expect(setters.setScreen).not.toHaveBeenCalled();
  });
});

// ── C) the prune effect ─────────────────────────────────────────────────

describe('useFromLetterStack — prune effect', () => {
  const bibleDest = { screen: 'bible-ch', bookId: 'john', chapterNum: 3, letterId: null, studyId: null, studyChapterId: null };

  it('keeps the entry while the recorded destination still matches', () => {
    const { result, rerender } = setup({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    act(() => { result.current.pushFromLetter(entry({ destSnapshot: bibleDest })); });
    rerender({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    expect(result.current.fromLetterStack).toHaveLength(1);
    expect(result.current.backHint).toEqual({ title: 'My Notes', volumeLabel: null });
  });

  it('pops the entry once the user navigates off the recorded destination', () => {
    const { result, rerender } = setup({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    act(() => { result.current.pushFromLetter(entry({ destSnapshot: bibleDest })); });
    rerender({ screen: 'bible-ch', bookId: 'john', chapterNum: 4 });  // next chapter
    expect(result.current.fromLetterStack).toHaveLength(0);
    expect(result.current.backHint).toBeNull();
    expect(result.current.backActive).toBe(false);
  });

  // The hub's seam walk, F5 (2026-10-22): the web's Open in reader, then Search
  // from the verse, then a hit. The entry used to go the moment Search opened.
  it('a search detour from the destination keeps the entry; back at the destination it is live again', () => {
    const at = { screen: 'bible-ch', bookId: 'john', chapterNum: 3 };
    const origin = { ...at, letterId: null, studyId: null, studyChapterId: null };
    const { result, rerender } = setup(at);
    act(() => { result.current.pushFromLetter(entry({ destSnapshot: bibleDest, sourceLetterTitle: 'The Scripture Web' })); });
    rerender({ screen: 'search', searchOrigin: origin });
    expect(result.current.fromLetterStack, 'Search open').toHaveLength(1);
    expect(result.current.backActive, 'Back on Search goes by its own origin').toBe(false);
    rerender({ screen: 'vot-two-letter', letterId: 'letter-5', searchOrigin: origin });
    expect(result.current.fromLetterStack, 'a hit open').toHaveLength(1);
    expect(result.current.backHint, 'no pill on the hit').toBeNull();
    rerender({ screen: 'search', searchOrigin: origin });
    rerender(at);  // goSearchOrigin: back where Search was opened, its origin cleared
    expect(result.current.fromLetterStack).toHaveLength(1);
    expect(result.current.backHint).toEqual({ title: 'The Scripture Web', volumeLabel: null });
    expect(result.current.backActive).toBe(true);
  });

  it('a letter that opens the web keeps its entry (navOrigin), down its returnOrigin chain too', () => {
    const letterDest = { screen: 'vot-seven-letter', bookId: null, chapterNum: null, letterId: 'punishment', studyId: null, studyChapterId: null };
    const at = { screen: 'vot-seven-letter', letterId: 'punishment' };
    const origin = { ...at, bookId: null, chapterNum: null, studyId: null, studyChapterId: null, returnOrigin: null };
    const { result, rerender } = setup(at);
    act(() => { result.current.pushFromLetter(entry({ destSnapshot: letterDest, sourceLetterTitle: 'Answers' })); });
    rerender({ screen: 'scripture-web', navOrigin: origin });
    expect(result.current.fromLetterStack, 'the web open').toHaveLength(1);
    rerender({ screen: 'audio-library', navOrigin: { screen: 'scripture-web', returnOrigin: origin } });
    expect(result.current.fromLetterStack, 'a detour from the detour').toHaveLength(1);
    rerender(at);  // goNavOrigin, twice
    expect(result.current.backHint).toEqual({ title: 'Answers', volumeLabel: null });
  });

  it('a search opened somewhere else does not hold the entry', () => {
    const { result, rerender } = setup({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    act(() => { result.current.pushFromLetter(entry({ destSnapshot: bibleDest })); });
    const elsewhere = { screen: 'bible-ch', bookId: 'john', chapterNum: 4, letterId: null, studyId: null, studyChapterId: null };
    rerender({ screen: 'search', searchOrigin: elsewhere });
    expect(result.current.fromLetterStack).toHaveLength(0);
  });

  it('NEVER prunes an entry without a destSnapshot (the letter→letter chain)', () => {
    const { result, rerender } = setup({ screen: 'vot-letter', letterId: 'a' });
    act(() => { result.current.pushFromLetter(entry({ destSnapshot: null })); });
    rerender({ screen: 'matthew-ch', bookId: 'matthew', chapterNum: 9 });
    expect(result.current.fromLetterStack).toHaveLength(1);
    expect(result.current.backHint).not.toBeNull();
  });
});

// ── D) _destMatches nullish semantics ───────────────────────────────────

describe('useFromLetterStack — _destMatches null-vs-undefined don’t-care', () => {
  it('an explicitly null field is "don’t care", not "must be null"', () => {
    // destSnapshot nulls bookId while the user IS on a book — must still match.
    const { result, rerender } = setup({ screen: 'vot-letter', letterId: 'wide-path', bookId: 'john' });
    act(() => {
      result.current.pushFromLetter(entry({
        destSnapshot: { screen: 'vot-letter', bookId: null, chapterNum: null, letterId: 'wide-path', studyId: null, studyChapterId: null },
      }));
    });
    rerender({ screen: 'vot-letter', letterId: 'wide-path', bookId: 'john' });
    expect(result.current.backHint).not.toBeNull();
  });

  it('a MISSING field is "don’t care" too — old tabs have no journalEntryId', () => {
    // Exactly the shape a tab persisted before the 7th field landed.
    const { result, rerender } = setup({ screen: 'journal-viewer', journalEntryId: 'e9' });
    act(() => {
      result.current.pushFromLetter(entry({
        destSnapshot: { screen: 'journal-viewer', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null },
      }));
    });
    rerender({ screen: 'journal-viewer', journalEntryId: 'e9' });
    expect(result.current.fromLetterStack).toHaveLength(1);
    expect(result.current.backHint).not.toBeNull();
  });

  it('a field with a REAL value still has to match', () => {
    const { result, rerender } = setup({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    act(() => {
      result.current.pushFromLetter(entry({
        destSnapshot: { screen: 'bible-ch', bookId: 'genesis', chapterNum: 3, letterId: null, studyId: null, studyChapterId: null },
      }));
    });
    rerender({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    expect(result.current.fromLetterStack).toHaveLength(0);
  });
});

// ── E) backHint / backActive + the journal round-trip ───────────────────

describe('useFromLetterStack — backHint vs backActive', () => {
  it('a silent entry renders NO pill but stays a live back target', () => {
    const { result, rerender } = setup({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    act(() => {
      result.current.pushFromLetter(entry({
        sourceScreen: 'history', sourceLetterTitle: 'History', silent: true,
        destSnapshot: { screen: 'bible-ch', bookId: 'john', chapterNum: 3, letterId: null, studyId: null, studyChapterId: null },
      }));
    });
    rerender({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    expect(result.current.backHint).toBeNull();      // no pill — the History exception
    expect(result.current.backActive).toBe(true);    // …but Back still returns there
  });

  it('a non-silent entry renders the pill and reports the volume label', () => {
    const { result } = setup({ screen: 'vot-letter' });
    act(() => { result.current.pushFromLetter(entry({ sourceLetterTitle: 'Faith', sourceVolumeLabel: 'Volume Two' })); });
    expect(result.current.backHint).toEqual({ title: 'Faith', volumeLabel: 'Volume Two' });
    expect(result.current.backActive).toBe(true);
  });

  it('falls back to the literal "previous" when no title was captured', () => {
    const { result } = setup({ screen: 'vot-letter' });
    act(() => { result.current.pushFromLetter(entry({ sourceLetterTitle: null })); });
    expect(result.current.backHint.title).toBe('previous');
  });
});

describe('useFromLetterStack — journal destSnapshot round-trip', () => {
  // The owner's report: tapping a journal-sourced note in a notebook opened
  // the entry with no way back. The snapshot recorded letterId = entryId
  // while the nav branch nulled letterId, so the prune effect popped the
  // entry on the very next render. journalEntryId being TRACKED is what
  // makes this survive.
  const journalDest = { screen: 'journal-viewer', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null, journalEntryId: 'e9' };

  // navigateToLink pushes AND sets the nav in one batch, so the prune effect
  // first runs with the app already at the destination. The harness renders
  // the push separately, so it starts nav at journal-viewer/e9 — the state
  // the effect actually sees in production.
  it('push → land on the entry → pill shows → tap restores the notebook', () => {
    const { result, rerender, setters } = setup({ screen: 'journal-viewer', journalEntryId: 'e9' });
    act(() => {
      result.current.pushFromLetter(entry({
        sourceScreen: 'notes-index', sourceLetterTitle: 'Devotional',
        sourceJournalEntryId: null, destSnapshot: journalDest,
      }));
    });
    expect(result.current.fromLetterStack).toHaveLength(1);   // NOT pruned
    expect(result.current.backHint).toEqual({ title: 'Devotional', volumeLabel: null });

    act(() => { result.current.tapThroughBack(); });
    expect(setters.setScreen).toHaveBeenCalledWith('notes-index');
    expect(setters.setJournalEntryId).toHaveBeenCalledWith(null);
    expect(setters.setLetterId).toHaveBeenCalledWith(null);
    rerender({ screen: 'notes-index' });
    expect(result.current.backHint).toBeNull();               // single-shot
  });

  it('opening a DIFFERENT journal entry prunes the pill', () => {
    const { result, rerender } = setup({ screen: 'journal-viewer', journalEntryId: 'e9' });
    act(() => { result.current.pushFromLetter(entry({ destSnapshot: journalDest })); });
    expect(result.current.fromLetterStack).toHaveLength(1);
    rerender({ screen: 'journal-viewer', journalEntryId: 'other-entry' });
    expect(result.current.fromLetterStack).toHaveLength(0);
    expect(result.current.backHint).toBeNull();
  });
});

// ── F) retargetTop: a move that carries the way back (sweep v041) ───────

describe('useFromLetterStack — retargetTop', () => {
  // The audio follower ("Turn the Page with the Audio") moves the pane in
  // place and hands the new reading to retargetTop in the same batch. Only a
  // LIVE top (its destSnapshot names where the pane is now) is carried; a
  // stale or legacy top is never rewritten, so a carry can't resurrect a
  // pill the reader already walked away from.
  const letter5 = { screen: 'vot-two-letter', bookId: null, chapterNum: null, letterId: 'letter-5', studyId: null, studyChapterId: null };

  it('a live top moves with the pane: the prune keeps it and the pill stays', () => {
    const { result, rerender } = setup({ screen: 'vot-two-letter', letterId: 'letter-5' });
    act(() => { result.current.pushFromLetter(entry({ destSnapshot: letter5 })); });
    expect(result.current.backHint).toEqual({ title: 'My Notes', volumeLabel: null });
    act(() => {
      result.current.retargetTop({ screen: 'vot-two-letter', letterId: 'letter-6' });
      rerender({ screen: 'vot-two-letter', letterId: 'letter-6' });
    });
    expect(result.current.fromLetterStack).toHaveLength(1);
    expect(result.current.fromLetterStack[0].destSnapshot).toEqual({ screen: 'vot-two-letter', letterId: 'letter-6' });
    expect(result.current.fromLetterStack[0].sourceScreen).toBe('notes-index');
    expect(result.current.backHint).toEqual({ title: 'My Notes', volumeLabel: null });
  });

  it('a top that does not name the current pane is not rewritten (the prune still evicts it)', () => {
    const { result } = setup({ screen: 'bible-ch', bookId: 'jonah', chapterNum: 4 });
    act(() => {
      result.current.pushFromLetter(entry({ destSnapshot: letter5 }));
      result.current.retargetTop({ screen: 'bible-ch', bookId: 'jonah', chapterNum: 4 });
    });
    expect(result.current.fromLetterStack).toHaveLength(0);
    expect(result.current.backHint).toBeNull();
  });

  it('an empty stack and a legacy top (no destSnapshot) are left exactly as they were', () => {
    const { result } = setup({ screen: 'vot-one-letter', letterId: 'a' });
    act(() => { result.current.retargetTop({ screen: 'vot-one-letter', letterId: 'b' }); });
    expect(result.current.fromLetterStack).toEqual([]);
    const legacy = entry({ sourceScreen: 'vot-one-letter', sourceLetterId: 'z', sourceLetterTitle: 'Z' });
    act(() => { result.current.pushFromLetter(legacy); });
    act(() => { result.current.retargetTop({ screen: 'vot-one-letter', letterId: 'b' }); });
    expect(result.current.fromLetterStack).toEqual([legacy]);
  });
});
