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
import { modalRegistry } from './use-modal-registry.js';

beforeEach(() => {
  modalRegistry._reset(); // module-level singleton — clear between runs (NAV1)
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
  delete window.__screenBack;
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

describe('useAndroidBack — UX3 index-screen origin + safe fallthrough', () => {
  for (const idx of ['notes-index', 'links-index', 'bookmarks-index', 'highlights-index', 'journal-home']) {
    it(`back from ${idx} restores navOrigin (not a hardcoded Library)`, () => {
      const props = baseProps({ screen: idx });
      renderHook(() => useAndroidBack(props));
      const res = window.handleAndroidBack();
      expect(res).toBe('true');
      expect(props.goNavOrigin).toHaveBeenCalledTimes(1);
      expect(props.setScreen).not.toHaveBeenCalledWith('library');
    });
  }

  it('a registered window.__screenBack consumes the press (drilled-in level) — no parent skip', () => {
    const props = baseProps({ screen: 'notes-index' });
    renderHook(() => useAndroidBack(props));
    const interceptor = vi.fn(() => true);
    window.__screenBack = interceptor;
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(interceptor).toHaveBeenCalledTimes(1);
    expect(props.goNavOrigin).not.toHaveBeenCalled();   // did NOT skip out to the parent
    expect(props.setScreen).not.toHaveBeenCalledWith('library');
  });

  it('a window.__screenBack that returns false lets the normal route proceed', () => {
    const props = baseProps({ screen: 'notes-index' });
    renderHook(() => useAndroidBack(props));
    window.__screenBack = vi.fn(() => false);   // not drilled in — nothing to unwind
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.goNavOrigin).toHaveBeenCalledTimes(1);   // fell through to notes-index → origin
  });

  it('at the root (home), Back returns "false" so the platform exits / shows the root toast', () => {
    const props = baseProps({ screen: 'home' });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('false');
    expect(props.goHome).not.toHaveBeenCalled();
  });

  it('an unlisted (non-home) screen falls back to Home instead of exiting the app', () => {
    const props = baseProps({ screen: 'some-future-screen' });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.goHome).toHaveBeenCalledTimes(1);
  });
});

describe('useAndroidBack — NAV1 modal registry consumes hardware-back', () => {
  it('an open registered modal is dismissed by Back and does NOT navigate the screen underneath', () => {
    // bible-ch WOULD route to bible-idx — prove the registered modal wins first.
    const props = baseProps({ screen: 'bible-ch', bookId: 'genesis' });
    renderHook(() => useAndroidBack(props));
    const dismiss = vi.fn();
    modalRegistry.register({ id: 'note-sheet', dismiss });
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(props.setScreen).not.toHaveBeenCalled();   // did NOT dismiss-AND-navigate
    expect(props.goHome).not.toHaveBeenCalled();
  });

  it('with no modal open, Back routes normally (empty registry falls through)', () => {
    const props = baseProps({ screen: 'bible-ch', bookId: 'genesis' });
    renderHook(() => useAndroidBack(props));
    const res = window.handleAndroidBack();
    expect(res).toBe('true');
    expect(props.setScreen).toHaveBeenCalledWith('bible-idx');   // normal route
  });

  it('dismisses the TOPMOST modal when several are registered (z-order)', () => {
    const props = baseProps({ screen: 'home' });
    renderHook(() => useAndroidBack(props));
    const lower = vi.fn(), upper = vi.fn();
    modalRegistry.register({ id: 'a', dismiss: lower });
    modalRegistry.register({ id: 'b', dismiss: upper });   // b registered last = topmost
    window.handleAndroidBack();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });
});
