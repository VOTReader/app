/* P6k — useTabs tests: CRITICAL INVARIANT 1 (cached per-key setter identity).
   ─────────────────────────────────────────────────────────────────────────
   useTabs' tabField('X')[1] MUST return the SAME function instance for key X
   on every render, for the component's whole lifetime. A fresh setter each
   render churns prop identity in every tab-state-consuming child → React
   tears down and rebuilds those subtrees (cascading re-mounts). Until now
   the ONLY guard was the runtime console.error probe (~line 180 of
   use-tabs.js) watched by the smoke harness — nothing pinned the invariant
   in vitest. This suite does.

   What each block guards against:

     A) Plain rerender must not churn setter identity. If a future refactor
        drops the _tabSetters ref-cache and returns fresh closures, these
        toBe() identity assertions fail in vitest — before smoke ever runs.

     B) STATE updates must not churn it either — including the active-tab
        switch, which legitimately changes updateActiveTab's identity (the
        useCallback([activeTabIdx]) layer). The _uatRef mirror exists
        precisely so the cached setters can survive that switch; the test
        flips activeTabIdx and asserts tabField setters are untouched.

     C) The probe stays silent in normal operation. A console.error spy
        wraps the whole lifecycle (mount → rerenders → updates → tab
        switch) so we know the smoke harness's tripwire is not misfiring
        in the passing configuration.

     D) Behavioral correctness — the setter actually updates ONLY the
        active tab's key, supports the fn-updater form, and updateActiveTab
        takes both patch-object and patch-fn. Identity stability would be
        meaningless if the setters wrote the wrong fields.

   React is a global in this harness (proven by use-ref-mirror.test.js);
   useTabs reads React.useState/useRef/useCallback/useEffect off it. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabs, DEFAULT_TAB } from './use-tabs.js';

// Two-tab seed so "only the active tab is written" is observable. Distinct
// sentinel screens per tab so a cross-tab write shows up immediately.
const twoTabSaved = () => ({
  saved: {
    tabs: [
      { screen: 'tab-zero-screen', bookId: 'genesis' },
      { screen: 'tab-one-screen', bookId: 'exodus' },
    ],
    activeTabIdx: 0,
  },
});

describe('useTabs — INVARIANT 1: setter identity stability', () => {
  it('tabField(key)[1] returns the SAME function instance across plain rerenders', () => {
    const { result, rerender } = renderHook(() => useTabs({ saved: {} }));
    const setter1 = result.current.tabField('screen')[1];
    const setter2 = result.current.tabField('bookId')[1];
    rerender();
    rerender();
    rerender();
    expect(result.current.tabField('screen')[1]).toBe(setter1);
    expect(result.current.tabField('bookId')[1]).toBe(setter2);
  });

  it('caches per key — distinct keys get distinct setters, repeated calls hit the cache', () => {
    const { result } = renderHook(() => useTabs({ saved: {} }));
    const screenSetter = result.current.tabField('screen')[1];
    const bookIdSetter = result.current.tabField('bookId')[1];
    expect(screenSetter).not.toBe(bookIdSetter);
    // Second call for the same key must return the cached instance, not a new one.
    expect(result.current.tabField('screen')[1]).toBe(screenSetter);
  });

  it('setter identity survives STATE updates driven by the setter itself', () => {
    const { result } = renderHook(() => useTabs(twoTabSaved()));
    const before = result.current.tabField('screen')[1];
    // The update re-renders the hook; a naive fresh-closure implementation
    // would return a new setter instance on that re-render.
    act(() => { result.current.tabField('screen')[1]('updated-screen'); });
    expect(result.current.tabField('screen')[0]).toBe('updated-screen');
    expect(result.current.tabField('screen')[1]).toBe(before);
  });

  it('setter identity survives an ACTIVE-TAB SWITCH (updateActiveTab identity legitimately changes)', () => {
    // This is the whole point of the _uatRef mirror layer: updateActiveTab's
    // useCallback([activeTabIdx]) identity DOES change on a tab switch, but
    // the cached tabField setters close over the stable ref, not the callback.
    const { result } = renderHook(() => useTabs(twoTabSaved()));
    const screenSetter = result.current.tabField('screen')[1];
    const bookIdSetter = result.current.tabField('bookId')[1];
    const uatBefore = result.current.updateActiveTab;

    act(() => { result.current.setActiveTabIdx(1); });

    // Sanity: the switch actually happened, and layer-1 identity did change
    // (documented behavior — if a refactor makes updateActiveTab stable too,
    // delete this line; the tabField assertions are the invariant).
    expect(result.current.activeTabIdx).toBe(1);
    expect(result.current.updateActiveTab).not.toBe(uatBefore);
    // The invariant: tabField setters are untouched by the switch.
    expect(result.current.tabField('screen')[1]).toBe(screenSetter);
    expect(result.current.tabField('bookId')[1]).toBe(bookIdSetter);
  });

  it('the same cached setter still writes to the CURRENTLY ACTIVE tab after a switch', () => {
    // Identity stability is worthless if the stable closure is stale — via
    // _uatRef.current it must reach the new active tab, not the old one.
    const { result } = renderHook(() => useTabs(twoTabSaved()));
    const screenSetter = result.current.tabField('screen')[1];
    act(() => { result.current.setActiveTabIdx(1); });
    act(() => { screenSetter('written-to-tab-one'); });
    expect(result.current.tabs[1].screen).toBe('written-to-tab-one');
    expect(result.current.tabs[0].screen).toBe('tab-zero-screen');
  });
});

describe('useTabs — stability probe stays silent in normal operation', () => {
  let errSpy;
  beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { errSpy.mockRestore(); });

  it('console.error is NEVER called across mount, rerenders, updates, and a tab switch', () => {
    const { result, rerender } = renderHook(() => useTabs(twoTabSaved()));
    // Prime the cache for several keys, then exercise everything that
    // re-renders the hook — the dep-less probe effect re-runs each time.
    result.current.tabField('screen');
    result.current.tabField('bookId');
    result.current.tabField('gardenPage');
    rerender();
    act(() => { result.current.tabField('screen')[1]('probe-screen'); });
    act(() => { result.current.setActiveTabIdx(1); });
    rerender();
    act(() => { result.current.tabField('bookId')[1]('probe-book'); });

    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe('useTabs — behavioral correctness', () => {
  it('tabField returns [activeTab[key], setter] — value reflects the active tab', () => {
    const { result } = renderHook(() => useTabs(twoTabSaved()));
    expect(result.current.tabField('screen')[0]).toBe('tab-zero-screen');
    expect(result.current.tabField('bookId')[0]).toBe('genesis');
    act(() => { result.current.setActiveTabIdx(1); });
    expect(result.current.tabField('screen')[0]).toBe('tab-one-screen');
    expect(result.current.tabField('bookId')[0]).toBe('exodus');
  });

  it('tabField setter writes ONLY the active tab (other tabs untouched)', () => {
    const { result } = renderHook(() => useTabs(twoTabSaved()));
    act(() => { result.current.tabField('bookId')[1]('leviticus'); });
    expect(result.current.tabs[0].bookId).toBe('leviticus');
    expect(result.current.tabs[1].bookId).toBe('exodus');
  });

  it('tabField setter supports the function-updater form, reading the CURRENT field value', () => {
    const { result } = renderHook(() => useTabs(twoTabSaved())); // gardenPage defaults to 1
    act(() => { result.current.tabField('gardenPage')[1]((p) => p + 1); });
    act(() => { result.current.tabField('gardenPage')[1]((p) => p + 1); });
    expect(result.current.tabField('gardenPage')[0]).toBe(3);
  });

  it('updateActiveTab accepts a patch OBJECT and merges it into the active tab', () => {
    const { result } = renderHook(() => useTabs(twoTabSaved()));
    act(() => { result.current.updateActiveTab({ bookId: 'numbers', chapterNum: 4 }); });
    expect(result.current.tabs[0].bookId).toBe('numbers');
    expect(result.current.tabs[0].chapterNum).toBe(4);
    expect(result.current.tabs[1].bookId).toBe('exodus'); // untouched
  });

  it('updateActiveTab accepts a patch FUNCTION receiving the current active tab', () => {
    const { result } = renderHook(() => useTabs(twoTabSaved()));
    act(() => {
      result.current.updateActiveTab((cur) => ({ bookId: cur.bookId + '-patched' }));
    });
    expect(result.current.tabs[0].bookId).toBe('genesis-patched');
  });

  it('activeTab is the SOLE derived accessor: tabs[activeTabIdx], falling back to tabs[0]', () => {
    const { result } = renderHook(() => useTabs(twoTabSaved()));
    expect(result.current.activeTab).toBe(result.current.tabs[0]);
    act(() => { result.current.setActiveTabIdx(1); });
    expect(result.current.activeTab).toBe(result.current.tabs[1]);
  });

  it('seeds tab 0 from legacy single-screen saved state when saved.tabs is absent', () => {
    const { result } = renderHook(() =>
      useTabs({ saved: { screen: 'legacy-screen', bookId: 'ruth', chapterNum: 2 } }));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].screen).toBe('legacy-screen');
    expect(result.current.tabs[0].bookId).toBe('ruth');
    expect(result.current.tabs[0].chapterNum).toBe(2);
    // Unspecified fields fall back to the DEFAULT_TAB shape.
    expect(result.current.tabs[0].mode).toBe(DEFAULT_TAB.mode);
    expect(result.current.tabs[0].scrollPositions).toEqual({});
  });

  it('merges saved.tabs entries over DEFAULT_TAB (missing fields defaulted, extras kept)', () => {
    const { result } = renderHook(() => useTabs(twoTabSaved()));
    expect(result.current.tabs[0].screen).toBe('tab-zero-screen');
    expect(result.current.tabs[0].mode).toBe(DEFAULT_TAB.mode); // defaulted
    expect(result.current.tabs[1].bookId).toBe('exodus');
  });
});
