/* P11 — useDomAnnotationSync tests. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDomAnnotationSync } from './use-dom-annotation-sync.js';

const APPLY = ['applyDOMHighlights', 'applyDOMLinks', 'applyDOMBookmarks', 'applyNoteIcons', 'applyActiveNoteState'];
// The four that only run inside the deferred setTimeout(0) pass. The fifth,
// applyActiveNoteState, is ALSO called synchronously by the active-note
// effect on mount, so it's excluded from "not yet called" assertions.
const DEFERRED_ONLY = ['applyDOMHighlights', 'applyDOMLinks', 'applyDOMBookmarks', 'applyNoteIcons'];

const baseProps = (over) => ({
  hlTick: 0, screen: 'home', letterId: null,
  noteSheetTarget: null, setNoteSheetTarget: vi.fn(),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  APPLY.forEach((n) => { window[n] = vi.fn(); });
  window.NoteStore = { get: vi.fn(() => ({ groupId: 'g1' })) };
  window.__pendingOpenNote = null;
  window.__pendingScrollHlKey = null;
  window.__activeNoteGroup = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  APPLY.forEach((n) => { delete window[n]; });
  delete window.NoteStore;
  delete window.__pendingOpenNote;
  delete window.__pendingScrollHlKey;
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

  it('drains __pendingOpenNote and opens the NoteSheet for the stashed group', () => {
    window.__pendingOpenNote = 'g1';
    const props = baseProps();
    renderHook(() => useDomAnnotationSync(props));
    act(() => { vi.advanceTimersByTime(0); });
    expect(window.__pendingOpenNote).toBe(null); // consumed
    act(() => { vi.advanceTimersByTime(60); });  // inner defer
    expect(props.setNoteSheetTarget).toHaveBeenCalledWith({ groupId: 'g1', startInEditMode: false });
  });

  it('does not open a NoteSheet when the stashed group no longer exists', () => {
    window.NoteStore = { get: vi.fn(() => null) };
    window.__pendingOpenNote = 'gone';
    const props = baseProps();
    renderHook(() => useDomAnnotationSync(props));
    act(() => { vi.advanceTimersByTime(0); });
    act(() => { vi.advanceTimersByTime(60); });
    expect(props.setNoteSheetTarget).not.toHaveBeenCalled();
  });

  it('drains __pendingScrollHlKey and scrolls the matching mark into view', () => {
    const el = document.createElement('div');
    el.setAttribute('data-hl-key', 'k1');
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);
    window.__pendingScrollHlKey = 'k1';
    renderHook(() => useDomAnnotationSync(baseProps()));
    act(() => { vi.advanceTimersByTime(0); });
    expect(window.__pendingScrollHlKey).toBe(null);
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
