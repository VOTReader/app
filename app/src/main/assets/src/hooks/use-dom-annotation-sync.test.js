/* P11 — useDomAnnotationSync tests. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDomAnnotationSync } from './use-dom-annotation-sync.js';
import { navHandoff } from '../utils/nav-handoff.js';

const APPLY = ['applyDOMHighlights', 'applyDOMLinks', 'applyDOMBookmarks', 'applyNoteIcons', 'applyActiveNoteState'];
// The four that only run inside the deferred setTimeout(0) pass. The fifth,
// applyActiveNoteState, is ALSO called synchronously by the active-note
// effect on mount, so it's excluded from "not yet called" assertions.
const DEFERRED_ONLY = ['applyDOMHighlights', 'applyDOMLinks', 'applyDOMBookmarks', 'applyNoteIcons'];

const baseProps = (over) => ({
  screen: 'home', letterId: null,
  noteSheetTarget: null, setNoteSheetTarget: vi.fn(),
  ...over,
});

/** A useSyncExternalStore-shaped store whose version can be bumped, firing
    subscribers — used to simulate a lazy corpus loader resolving. */
function makeMutableStore() {
  let v = 0;
  const subs = new Set();
  return {
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    getVersion: () => v,
    bump: () => { v += 1; subs.forEach((cb) => cb()); },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  APPLY.forEach((n) => { window[n] = vi.fn(); });
  // The hook subscribes to four stores via useSyncExternalStore (W7.3); stub
  // each with the subscribe/getVersion contract. NoteStore also needs get().
  const sub = () => () => {};
  const ver = () => 0;
  window.AnnotationStore = { subscribe: sub, getVersion: ver };
  window.LinkStore = { subscribe: sub, getVersion: ver };
  window.BookmarkStore = { subscribe: sub, getVersion: ver };
  window.NoteStore = { get: vi.fn(() => ({ groupId: 'g1' })), subscribe: sub, getVersion: ver };
  // Lazy-corpus loaders (bundle-a-bible/matthew/vot). The hook subscribes to
  // each via useSyncExternalStore so a corpus load re-runs the apply pass —
  // bumpable mutable stores let a test fire that load deterministically.
  window.__bibleCorpus = makeMutableStore();
  window.__matthewCorpus = makeMutableStore();
  window.__votCorpus = makeMutableStore();
  // navHandoff (globalized by _entry-b in production) backs the two slots the
  // hook takes; start each case empty.
  window.navHandoff = navHandoff;
  navHandoff._resetForTests();
  window.__activeNoteGroup = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  APPLY.forEach((n) => { delete window[n]; });
  delete window.AnnotationStore;
  delete window.LinkStore;
  delete window.BookmarkStore;
  delete window.NoteStore;
  delete window.__bibleCorpus;
  delete window.__matthewCorpus;
  delete window.__votCorpus;
  navHandoff._resetForTests();
  delete window.__activeNoteGroup;
});

describe('useDomAnnotationSync — apply pass', () => {
  it('defers the apply* passes to a 0ms tick, then runs all five', () => {
    renderHook(() => useDomAnnotationSync(baseProps()));
    DEFERRED_ONLY.forEach((n) => expect(window[n]).not.toHaveBeenCalled());
    act(() => { vi.advanceTimersByTime(0); });
    APPLY.forEach((n) => expect(window[n]).toHaveBeenCalled());
  });

  it('isolates a failing layer so the others still run (guarded)', () => {
    window.applyDOMLinks = vi.fn(() => { throw new Error('boom'); });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHook(() => useDomAnnotationSync(baseProps()));
    act(() => { vi.advanceTimersByTime(0); });
    expect(window.applyDOMBookmarks).toHaveBeenCalledTimes(1);
    expect(window.applyNoteIcons).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('takes pendingOpenNote and opens the NoteSheet for the stashed group', () => {
    navHandoff.set('pendingOpenNote', 'g1');
    const props = baseProps();
    renderHook(() => useDomAnnotationSync(props));
    act(() => { vi.advanceTimersByTime(0); });
    expect(navHandoff.peek('pendingOpenNote')).toBe(null); // consumed
    act(() => { vi.advanceTimersByTime(60); });  // inner defer
    expect(props.setNoteSheetTarget).toHaveBeenCalledWith({ groupId: 'g1', startInEditMode: false });
  });

  it('does not open a NoteSheet when the stashed group no longer exists', () => {
    window.NoteStore.get = vi.fn(() => null);
    navHandoff.set('pendingOpenNote', 'gone');
    const props = baseProps();
    renderHook(() => useDomAnnotationSync(props));
    act(() => { vi.advanceTimersByTime(0); });
    act(() => { vi.advanceTimersByTime(60); });
    expect(props.setNoteSheetTarget).not.toHaveBeenCalled();
  });

  it('re-runs the apply pass when a lazy corpus finishes loading (cold-load race)', () => {
    // Repro of the reported bug: on a DIRECT entry to a chapter (cold-boot
    // resume / History / a Library tap) the corpus loads AFTER the initial
    // store-driven apply ran over the "Loading…" placeholder, with no store
    // mutation to re-trigger it — so marks/notes/icons never paint until the
    // user flips the page. The corpus version is now an apply dep, so a load
    // re-runs the pass. (Pre-fix this asserts 1 === 2 and FAILS — a true
    // RED→GREEN guard.)
    renderHook(() => useDomAnnotationSync(baseProps({ screen: 'bible-ch', letterId: 'genesis' })));
    act(() => { vi.advanceTimersByTime(0); });
    expect(window.applyDOMHighlights).toHaveBeenCalledTimes(1); // initial pass (placeholder DOM)
    act(() => { window.__bibleCorpus.bump(); });                // corpus resolves → verses mount
    act(() => { vi.advanceTimersByTime(0); });
    expect(window.applyDOMHighlights).toHaveBeenCalledTimes(2); // re-paints over the real verse DOM
    expect(window.applyNoteIcons).toHaveBeenCalledTimes(2);
  });

  it('re-applies on the matthew and vot corpus loads too', () => {
    renderHook(() => useDomAnnotationSync(baseProps()));
    act(() => { vi.advanceTimersByTime(0); });
    const base = window.applyDOMHighlights.mock.calls.length;
    act(() => { window.__matthewCorpus.bump(); });
    act(() => { vi.advanceTimersByTime(0); });
    act(() => { window.__votCorpus.bump(); });
    act(() => { vi.advanceTimersByTime(0); });
    expect(window.applyDOMHighlights).toHaveBeenCalledTimes(base + 2);
  });

  it('takes pendingScrollHlKey and scrolls the matching mark into view', () => {
    const el = document.createElement('div');
    el.setAttribute('data-hl-key', 'k1');
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);
    navHandoff.set('pendingScrollHlKey', 'k1');
    renderHook(() => useDomAnnotationSync(baseProps()));
    act(() => { vi.advanceTimersByTime(0); });
    expect(navHandoff.peek('pendingScrollHlKey')).toBe(null);
    act(() => { vi.advanceTimersByTime(70); });
    expect(el.scrollIntoView).toHaveBeenCalled();
    document.body.removeChild(el);
  });
});

describe('useDomAnnotationSync — active-note toggle', () => {
  it('sets __activeNoteGroup to the open note group and re-applies', () => {
    renderHook(() => useDomAnnotationSync(baseProps({ noteSheetTarget: { groupId: 'gX' } })));
    expect(window.__activeNoteGroup).toBe('gX');
    expect(window.applyActiveNoteState).toHaveBeenCalled();
  });

  it('clears __activeNoteGroup to null when no note is open', () => {
    renderHook(() => useDomAnnotationSync(baseProps({ noteSheetTarget: null })));
    expect(window.__activeNoteGroup).toBe(null);
  });
});
