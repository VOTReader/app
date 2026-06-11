/* useScrollMemory tests — exact-position capture across navigation.
   ─────────────────────────────────────────────────────────────────
   The scroll-memory contract: every screen restores EXACTLY where the
   user left it. The silent-failure mode this file guards:

     The steady-state capture is a 120 ms idle-debounced scroll listener.
     Nothing used to flush at NAVIGATION time, so leaving a screen within
     the debounce window (tap "next letter" mid-momentum-scroll, or right
     after stopping) lost the final position — the pending timeout fired
     AFTER scrollKeyRef had moved to the new screen, so the old screen's
     saved position stayed at the last COMPLETED capture (drifts either
     direction depending on the un-captured scrolling).

   The fix under test: a live per-scroll-event position stash
   (liveScrollRef — ref write, no re-render) committed for the OLD key by
   the restore layout effect at nav time, before the new screen restores.

   Harness notes: the hook reads the bare lexical global __scrollEl and
   (for letter screens) COL_BY_LETTER_SC — both seeded on globalThis here.
   jsdom dispatches real 'scroll' Events; el dims are defineProperty'd
   (jsdom has no layout). updateActiveTab mutates a shared tab object
   (identity-stable across rerenders per the hook's HARD INVARIANT).
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollMemory } from './use-scroll-memory.js';

/** @type {any} */ let el;
/** @type {any} */ let tab;
/** @type {any} */ let tab2;
/** @type {any[]} */ let tabsArr;
let activeIdxForUpdater = 0;

// Identity-stable across rerenders (HARD INVARIANT: flushScrollToActiveTab
// is useCallback([updateActiveTab])). Mirrors useTabs' updateActiveTab:
// applies the patch to the tab the harness considers active.
const updateActiveTab = (patchOrFn) => {
  const t = tabsArr[activeIdxForUpdater];
  const patch = typeof patchOrFn === 'function' ? patchOrFn(t) : patchOrFn;
  Object.assign(t, patch);
};

function makeScrollEl() {
  const e = document.createElement('div');
  Object.defineProperty(e, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(e, 'clientHeight', { value: 600, configurable: true });
  return e;
}

/** Scroll the container to y and fire the real scroll event. */
function scrollTo(y) {
  el.scrollTop = y;
  el.dispatchEvent(new Event('scroll'));
}

/** Fire the mount/nav restore's one-frame rAF re-apply (fake timers defer
    it past our simulated scrolls; in a real browser it lands ~16 ms after
    the nav, before any human scroll). Call before scrolling whenever the
    test later advances timers. */
function settleRestoreRaf() {
  act(() => { vi.advanceTimersByTime(20); });
}

const baseProps = (over = {}) => ({
  screen: 'test-letter', bookId: null, chapterNum: null,
  letterId: 'alpha', studyId: null, studyChapterId: null,
  activeTab: tab, activeTabIdx: 0, updateActiveTab,
  surpriseAnchor: null, tabsOverviewOpen: false,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  el = makeScrollEl();
  /** @type {any} */ (globalThis).__scrollEl = el;
  // Letter screens resolve their key prefix through COL_BY_LETTER_SC.
  /** @type {any} */ (globalThis).COL_BY_LETTER_SC = new Map([['test-letter', { kind: 'letter' }]]);
  tab = { scrollPositions: {} };
  tab2 = { scrollPositions: {} };
  tabsArr = [tab, tab2];
  activeIdxForUpdater = 0;
});

afterEach(() => {
  vi.useRealTimers();
  delete (/** @type {any} */ (globalThis).__scrollEl);
  delete (/** @type {any} */ (globalThis).COL_BY_LETTER_SC);
});

describe('useScrollMemory — steady-state debounced capture', () => {
  it('captures position 120 ms after scrolling stops', () => {
    renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    act(() => { scrollTo(900); vi.advanceTimersByTime(150); });
    expect(tab.scrollPositions['letter-alpha']).toMatchObject({ y: 900 });
  });
});

describe('useScrollMemory — exact capture at navigation (the next-letter drift bug)', () => {
  it('commits the EXACT last-scrolled position when navigating inside the debounce window', () => {
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });

    // Settle once at 900 so a STALE capture exists (the pre-fix value).
    settleRestoreRaf();
    act(() => { scrollTo(900); vi.advanceTimersByTime(150); });
    // Keep scrolling to 1500, then navigate BEFORE the 120 ms debounce fires —
    // the tap-next-mid-scroll race.
    act(() => { scrollTo(1500); });
    rerender(baseProps({ letterId: 'beta' }));

    // The position must be the exact 1500 the user left, not the stale 900.
    expect(tab.scrollPositions['letter-alpha']).toMatchObject({ y: 1500 });
  });

  it('round-trips next-letter-then-back to the exact pixel', () => {
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });

    act(() => { scrollTo(1500); });          // reading alpha at 1500, still settling
    rerender(baseProps({ letterId: 'beta' })); // tap "next letter"
    expect(el.scrollTop).toBe(0);             // beta: no saved position → top

    act(() => { scrollTo(333); });            // glance at beta
    rerender(baseProps({ letterId: 'alpha' })); // back to alpha

    expect(el.scrollTop).toBe(1500);          // EXACTLY as left
    expect(tab.scrollPositions['letter-beta']).toMatchObject({ y: 333 });

    // The orphaned pending debounce + restore rAF must not corrupt either key.
    act(() => { vi.advanceTimersByTime(300); });
    expect(tab.scrollPositions['letter-alpha']).toMatchObject({ y: 1500 });
    expect(tab.scrollPositions['letter-beta']).toMatchObject({ y: 333 });
  });

  it('does not write a stale stash under a screen the user never scrolled', () => {
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });

    act(() => { scrollTo(1500); });
    rerender(baseProps({ letterId: 'beta' }));  // alpha committed via stash
    // No scroll on beta (jsdom's programmatic restore fires no scroll event,
    // so the stash still says letter-alpha). Navigate again:
    rerender(baseProps({ letterId: 'gamma' }));

    // beta was never scrolled — alpha's stashed 1500 must NOT leak onto it.
    expect(tab.scrollPositions['letter-beta']).toBeUndefined();
    expect(tab.scrollPositions['letter-alpha']).toMatchObject({ y: 1500 });
  });

  it('skips the nav-time commit on a tab SWITCH (tab paths flush explicitly)', () => {
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });

    act(() => { scrollTo(700); });             // pending, un-captured
    activeIdxForUpdater = 1;                   // harness: tab 2 becomes active
    rerender(baseProps({ letterId: 'delta', activeTab: tab2, activeTabIdx: 1 }));

    // The old tab's position must not be written into the NEW tab.
    expect(tab2.scrollPositions['letter-alpha']).toBeUndefined();
  });
});

describe('useScrollMemory — restore', () => {
  it('restores a saved position synchronously on nav-key change', () => {
    tab.scrollPositions['letter-beta'] = { y: 1234, pct: 0.5 };
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    rerender(baseProps({ letterId: 'beta' }));
    expect(el.scrollTop).toBe(1234);
  });

  it('scrolls to top when no position is saved', () => {
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    act(() => { scrollTo(800); vi.advanceTimersByTime(150); });
    rerender(baseProps({ letterId: 'beta' }));
    expect(el.scrollTop).toBe(0);
  });

  it('supports the legacy plain-number saved shape', () => {
    tab.scrollPositions['letter-beta'] = 555;
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    rerender(baseProps({ letterId: 'beta' }));
    expect(el.scrollTop).toBe(555);
  });

  it('lifts content-visibility (body.scroll-restoring) across one PAINTED frame on a non-top restore', () => {
    tab.scrollPositions['letter-beta'] = { y: 1234, pct: 0.5 };
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf(); // clear the mount-time rAF first
    rerender(baseProps({ letterId: 'beta' }));
    // Synchronously during the restore: real-geometry force is ON.
    expect(document.body.classList.contains('scroll-restoring')).toBe(true);
    // Still held after the FIRST frame — the force must survive a painted
    // frame so contain-intrinsic-size:auto memoizes the real sizes.
    settleRestoreRaf();
    expect(document.body.classList.contains('scroll-restoring')).toBe(true);
    // Released on the second frame.
    settleRestoreRaf();
    expect(document.body.classList.contains('scroll-restoring')).toBe(false);
    expect(el.scrollTop).toBe(1234);
  });

  it('does not force real geometry for a to-top restore (no saved position)', () => {
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    rerender(baseProps({ letterId: 'beta' }));
    expect(document.body.classList.contains('scroll-restoring')).toBe(false);
  });

  it('clears the restore force on cleanup when a rapid re-nav cancels the rAF', () => {
    tab.scrollPositions['letter-beta'] = { y: 1234, pct: 0.5 };
    const { rerender, unmount } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    rerender(baseProps({ letterId: 'beta' }));
    expect(document.body.classList.contains('scroll-restoring')).toBe(true);
    unmount(); // cleanup path — must not strand the body class
    expect(document.body.classList.contains('scroll-restoring')).toBe(false);
  });
});
