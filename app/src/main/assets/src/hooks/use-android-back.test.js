/* use-android-back tests — UX1 (surprise-back → Home) + UX2 (search-anchor clear).
   ──────────────────────────────────────────────────────────────────────────
   Renders useAndroidBack with the wide param bag (all setters as spies),
   then drives the installed window.handleAndroidBack() in each scenario. The
   handler reads nav state through useRefMirror refs, so the rendered prop
   values are what it sees. Free globals the handler touches are stubbed.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAndroidBack } from './use-android-back.js';

beforeEach(() => {
  /** @type {any} */ (globalThis).LETTER_SCREEN_SET = new Set(['vot-one-letter', 'vot-letter']);
  /** @type {any} */ (globalThis).COL_BY_LETTER_SC = new Map([
    ['vot-one-letter', { indexScreen: 'vot-one-index', volKey: 'one' }],
  ]);
  /** @type {any} */ (globalThis).COL_BY_INDEX_SC = new Map();
  /** @type {any} */ (globalThis).AboutSeenFlagStore = { set: vi.fn() };
  /** @type {any} */ (window).navHandoff = { clear: vi.fn() };
  // vitest.setup stubs __closeSheet as a no-op FUNCTION, which the handler's
  // first guard would treat as an open sheet and short-circuit. Null it.
  /** @type {any} */ (window).__closeSheet = null;
});
afterEach(() => {
  delete window.handleAndroidBack;
  vi.restoreAllMocks();
});

function baseProps(overrides) {
  return {
    screen: 'home', bookId: null, genreId: null,
    fromSearch: false, fromStudies: false, fromMatthewCh: null, studyId: null, fromWtlb: null, fromSurprise: false,
    tabsOverviewOpen: false, journalEntryId: null, fromLetterRef: { current: [] },
    setScreen: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setLetterId: vi.fn(),
    setStudyId: vi.fn(), setStudyChapterId: vi.fn(),
    setFromLetterStack: vi.fn(), setFromSearch: vi.fn(), setFromStudies: vi.fn(),
    setFromWtlb: vi.fn(), setFromMatthewCh: vi.fn(), setFromSurprise: vi.fn(),
    setTabsOverviewOpen: vi.fn(), setSurpriseAnchor: vi.fn(),
    cancelDwell: vi.fn(), goNavOrigin: vi.fn(), goHome: vi.fn(), goSearchOrigin: vi.fn(),
    goScripturesHome: vi.fn(), goStudiesHome: vi.fn(), goVolumesHome: vi.fn(), goJournalViewer: vi.fn(),
    getStudyById: vi.fn(),
    ...overrides,
  };
}

describe('useAndroidBack — UX1 surprise-back', () => {
  it('back from a surprise bible-ch jump goes Home (not the book index)', () => {
    const props = baseProps({ screen: 'bible-ch', fromSurprise: true });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.goHome).toHaveBeenCalledTimes(1);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setScreen).not.toHaveBeenCalledWith('bible-idx');
  });

  it('back from a surprise matthew-ch jump goes Home', () => {
    const props = baseProps({ screen: 'matthew-ch', fromSurprise: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.goHome).toHaveBeenCalledTimes(1);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setScreen).not.toHaveBeenCalledWith('matthew-idx');
  });

  it('back from a surprise letter jump goes Home', () => {
    const props = baseProps({ screen: 'vot-one-letter', fromSurprise: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.goHome).toHaveBeenCalledTimes(1);
    expect(props.setFromSurprise).toHaveBeenCalledWith(false);
    expect(props.setScreen).not.toHaveBeenCalledWith('vot-one-index');
  });

  it('a NON-surprise bible-ch still backs to the book index', () => {
    const props = baseProps({ screen: 'bible-ch', bookId: 'genesis' });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.goHome).not.toHaveBeenCalled();
    expect(props.setScreen).toHaveBeenCalledWith('bible-idx');
  });
});

describe('useAndroidBack — UX2 search-anchor clear', () => {
  it('back-to-search from a bible-ch verse hit clears the surprise anchor', () => {
    const props = baseProps({ screen: 'bible-ch', fromSearch: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setScreen).toHaveBeenCalledWith('search');
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
    expect(props.goHome).not.toHaveBeenCalled();
  });

  it('back-to-search from a matthew-ch verse hit clears the surprise anchor', () => {
    const props = baseProps({ screen: 'matthew-ch', fromSearch: true });
    renderHook(() => useAndroidBack(props));
    window.handleAndroidBack();
    expect(props.setScreen).toHaveBeenCalledWith('search');
    expect(props.setSurpriseAnchor).toHaveBeenCalledWith(null);
  });
});
