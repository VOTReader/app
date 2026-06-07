/* P7f — useTapThrough tests.
   ────────────────────────────
   useTapThrough owns the 2 inbound-content-link openers.

   Silent-failure modes worth guarding:

     A) pushFromLetter source-context capture. openInAppLetter snapshots
        all 6 nav fields PLUS the destSnapshot for the destination. Wrong
        snapshot → tap-through back returns to the wrong screen, OR the
        back-hint pill survives onward navigation when it shouldn't
        (the destSnapshot is what the prune effect uses).

     B) Study vs non-study branching. Both openers branch on dest.isStudy
        to choose between studyId+studyChapterId+activeReadKey (study)
        OR letterId+activeReadKey(commit-fn for last-read-for-vol)
        (volume). A crossed-wires bug here routes the user to the
        wrong screen with a phantom letterId.

     C) Excerpt → navHandoff 'pendingHighlight'. Excerpt present → wraps
        with letterId so the destination LetterView's mount-time
        highlight finds the right entry. Without excerpt → null (NOT
        leaving a stale value from a previous tap-through).

     D) Defensive null guards. resolveVotLetter returns null for
        unknown letters; both openers must early-return without
        mutating any setter. Same for openInAppLetter's missing
        target / letterTitle.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTapThrough } from './use-tap-through.js';
import { navHandoff } from '../utils/nav-handoff.js';

// ── Global stubs ────────────────────────────────────────────────────────
let _prevResolve;

beforeEach(() => {
  _prevResolve = window.resolveVotLetter;
  // Production hooks call window.navHandoff.* — _entry-b globalizes it in the
  // app; mirror that here, then start each case with empty slots.
  window.navHandoff = navHandoff;
  navHandoff._resetForTests();
  // Default stub: maps a few known (vol, letter) → dest. Tests override
  // per-case for unknowns / study branch / etc.
  window.resolveVotLetter = vi.fn((vol, letter) => {
    if (vol === 'two' && letter === 'The Wide Path') {
      return { id: 'wide-path', screen: 'vot-letter', volKey: 'two', isStudy: false };
    }
    if (vol === 'study-bundle' && letter === 'The Lamb of God') {
      return { id: 'lamb', isStudy: true, studyId: 'lamb-of-god', studyChapterId: 'lamb-1', activeReadKey: 'bible-study-lamb-of-god' };
    }
    return null;
  });
});

afterEach(() => {
  window.resolveVotLetter = _prevResolve;
  navHandoff._resetForTests();
});

// ── Helpers ─────────────────────────────────────────────────────────────
const baseProps = () => ({
  screen: 'home',
  bookId: null,
  chapterNum: null,
  letterId: null,
  studyId: null,
  studyChapterId: null,
  pushFromLetter: vi.fn(),
  setScreen: vi.fn(),
  setLetterId: vi.fn(),
  setStudyId: vi.fn(),
  setStudyChapterId: vi.fn(),
  setFromMatthewCh: vi.fn(),
  setActiveReadKey: vi.fn(),
  setLastReadForVol: vi.fn(),
});

const setup = (overrides = {}) => {
  const props = { ...baseProps(), ...overrides };
  const { result } = renderHook(() => useTapThrough(props));
  return { result, props };
};

// ── goToLetterFromMatthew ───────────────────────────────────────────────

describe('useTapThrough — goToLetterFromMatthew', () => {
  it('non-study dest: pushes Matthew source + setLetterId + activeReadKey w/ commit-fn + setScreen', () => {
    const { result, props } = setup({ chapterNum: 5 });
    act(() => { result.current.goToLetterFromMatthew('two', 'The Wide Path', 'wide path excerpt'); });

    // pushFromLetter source-context entry: source is matthew chapter 5
    expect(props.pushFromLetter).toHaveBeenCalledWith({
      sourceScreen: 'matthew-ch',
      sourceBookId: 'matthew',
      sourceChapterNum: 5,
      sourceLetterId: null,
      sourceStudyId: null,
      sourceStudyChapterId: null,
      sourceLetterTitle: 'Matthew 5',
      sourceVolumeLabel: null,
    });
    expect(props.setFromMatthewCh).toHaveBeenCalledWith({ chapterNum: 5 });
    expect(props.setLetterId).toHaveBeenCalledWith('wide-path');
    expect(props.setActiveReadKey).toHaveBeenCalledWith('vol:two', expect.any(Function));
    expect(props.setScreen).toHaveBeenCalledWith('vot-letter');
    // commit-fn calls setLastReadForVol with (volKey, id)
    const commitFn = props.setActiveReadKey.mock.calls[0][1];
    commitFn();
    expect(props.setLastReadForVol).toHaveBeenCalledWith('two', 'wide-path');
  });

  it('study dest: setStudyId + setStudyChapterId + activeReadKey (no commit-fn)', () => {
    const { result, props } = setup({ chapterNum: 7 });
    act(() => { result.current.goToLetterFromMatthew('study-bundle', 'The Lamb of God'); });

    expect(props.setStudyId).toHaveBeenCalledWith('lamb-of-god');
    expect(props.setStudyChapterId).toHaveBeenCalledWith('lamb-1');
    expect(props.setActiveReadKey).toHaveBeenCalledWith('bible-study-lamb-of-god');
    // Critical: must NOT touch setLetterId on the study branch
    expect(props.setLetterId).not.toHaveBeenCalled();
  });

  it('excerpt set → navHandoff pendingHighlight gets { excerpt, letterId }', () => {
    const { result } = setup({ chapterNum: 5 });
    act(() => { result.current.goToLetterFromMatthew('two', 'The Wide Path', 'find me'); });
    expect(navHandoff.peek('pendingHighlight')).toEqual({ excerpt: 'find me', letterId: 'wide-path' });
  });

  it('no excerpt → navHandoff pendingHighlight cleared', () => {
    navHandoff.set('pendingHighlight', { stale: true });
    const { result } = setup({ chapterNum: 5 });
    act(() => { result.current.goToLetterFromMatthew('two', 'The Wide Path'); });
    expect(navHandoff.peek('pendingHighlight')).toBeNull();
  });

  it('NAV2: a STUDY dest with an excerpt does NOT set pendingHighlight (no reader → no stale-pulse leak)', () => {
    navHandoff.set('pendingHighlight', { stale: true });
    const { result } = setup({ chapterNum: 7 });
    act(() => { result.current.goToLetterFromMatthew('study-bundle', 'The Lamb of God', 'find me'); });
    expect(navHandoff.peek('pendingHighlight')).toBeNull();   // cleared, not left set with the study id
  });

  it('unknown letter → no-op (no setters fire, defensive guard)', () => {
    const { result, props } = setup({ chapterNum: 5 });
    act(() => { result.current.goToLetterFromMatthew('unknown', 'Not A Real Letter'); });
    expect(props.pushFromLetter).not.toHaveBeenCalled();
    expect(props.setLetterId).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });
});

// ── openInAppLetter ─────────────────────────────────────────────────────

describe('useTapThrough — openInAppLetter', () => {
  it('non-study dest: pushes current source + destSnapshot for letterId, sets letter/screen', () => {
    const { result, props } = setup({
      screen: 'vot-three-letter', letterId: 'source-letter',
      bookId: null, chapterNum: null, studyId: null, studyChapterId: null,
    });
    act(() => { result.current.openInAppLetter(
      { collection: 'two', letterTitle: 'The Wide Path', excerpt: 'find me' },
      { sourceLetterTitle: 'Source Letter', sourceVolumeLabel: 'Volume Three' }
    ); });

    const pushedEntry = props.pushFromLetter.mock.calls[0][0];
    // Source snapshot reflects current props (the letter the user is reading)
    expect(pushedEntry.sourceScreen).toBe('vot-three-letter');
    expect(pushedEntry.sourceLetterId).toBe('source-letter');
    expect(pushedEntry.sourceLetterTitle).toBe('Source Letter');
    expect(pushedEntry.sourceVolumeLabel).toBe('Volume Three');
    // destSnapshot for the non-study destination
    expect(pushedEntry.destSnapshot).toEqual({
      screen: 'vot-letter', bookId: null, chapterNum: null,
      letterId: 'wide-path', studyId: null, studyChapterId: null,
    });
    // Side effects: highlight + nav
    expect(navHandoff.peek('pendingHighlight')).toEqual({ excerpt: 'find me', letterId: 'wide-path' });
    expect(props.setLetterId).toHaveBeenCalledWith('wide-path');
    expect(props.setActiveReadKey).toHaveBeenCalledWith('vol:two', expect.any(Function));
    expect(props.setScreen).toHaveBeenCalledWith('vot-letter');
  });

  it('study dest: destSnapshot has bible-study-chapter shape + sets study ids', () => {
    const { result, props } = setup({ screen: 'vot-letter', letterId: 'src' });
    act(() => { result.current.openInAppLetter(
      { collection: 'study-bundle', letterTitle: 'The Lamb of God' }
    ); });

    const pushedEntry = props.pushFromLetter.mock.calls[0][0];
    expect(pushedEntry.destSnapshot).toEqual({
      screen: 'bible-study-chapter', bookId: null, chapterNum: null,
      letterId: null, studyId: 'lamb-of-god', studyChapterId: 'lamb-1',
    });
    expect(props.setStudyId).toHaveBeenCalledWith('lamb-of-god');
    expect(props.setStudyChapterId).toHaveBeenCalledWith('lamb-1');
    expect(props.setLetterId).not.toHaveBeenCalled();  // NOT the non-study branch
  });

  it('NAV2: a STUDY dest with an excerpt does NOT set pendingHighlight', () => {
    navHandoff.set('pendingHighlight', { stale: true });
    const { result } = setup({ screen: 'vot-letter', letterId: 'src' });
    act(() => { result.current.openInAppLetter({ collection: 'study-bundle', letterTitle: 'The Lamb of God', excerpt: 'find me' }); });
    expect(navHandoff.peek('pendingHighlight')).toBeNull();
  });

  it('source snapshot uses current props at call time (re-render captures latest)', () => {
    // If a future refactor cached pushFromLetter's snapshot via stale
    // closure, the source-screen would be wrong. Verify with a
    // re-render between hook init and call.
    const propsA = { ...baseProps(), screen: 'vot-letter', letterId: 'lid-a' };
    const { result, rerender } = renderHook((p) => useTapThrough(p), { initialProps: propsA });
    // Re-render with new nav state.
    const propsB = { ...baseProps(), screen: 'matthew-ch', bookId: 'matthew', chapterNum: 22 };
    rerender(propsB);
    act(() => { result.current.openInAppLetter({ collection: 'two', letterTitle: 'The Wide Path' }); });

    const pushedEntry = propsB.pushFromLetter.mock.calls[0][0];
    expect(pushedEntry.sourceScreen).toBe('matthew-ch');
    expect(pushedEntry.sourceBookId).toBe('matthew');
    expect(pushedEntry.sourceChapterNum).toBe(22);
  });

  it('no excerpt → navHandoff pendingHighlight cleared', () => {
    navHandoff.set('pendingHighlight', { stale: true });
    const { result } = setup({ screen: 'vot-letter' });
    act(() => { result.current.openInAppLetter({ collection: 'two', letterTitle: 'The Wide Path' }); });
    expect(navHandoff.peek('pendingHighlight')).toBeNull();
  });

  it('meta missing → sourceLetterTitle/VolumeLabel default to null (defensive)', () => {
    const { result, props } = setup({ screen: 'vot-letter' });
    act(() => { result.current.openInAppLetter({ collection: 'two', letterTitle: 'The Wide Path' }); });
    const pushed = props.pushFromLetter.mock.calls[0][0];
    expect(pushed.sourceLetterTitle).toBeNull();
    expect(pushed.sourceVolumeLabel).toBeNull();
  });

  it('null target → no-op', () => {
    const { result, props } = setup();
    act(() => { result.current.openInAppLetter(null); });
    expect(props.pushFromLetter).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });

  it('target without letterTitle → no-op', () => {
    const { result, props } = setup();
    act(() => { result.current.openInAppLetter({ collection: 'two' }); });
    expect(props.pushFromLetter).not.toHaveBeenCalled();
  });

  it('unknown letter (resolveVotLetter returns null) → no-op', () => {
    const { result, props } = setup();
    act(() => { result.current.openInAppLetter({ collection: 'unknown', letterTitle: 'Nope' }); });
    expect(props.pushFromLetter).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });
});
