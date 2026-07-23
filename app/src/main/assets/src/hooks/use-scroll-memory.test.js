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

  it('retries the restore until lazy content renders tall enough (cold-boot race)', () => {
    // Cold boot: the saved position exists but the chapter content hasn't
    // rendered yet (lazy corpus still loading), so the container is too short
    // and `scrollTop = target` clamps to ~0. The effect must keep re-applying
    // until the page is tall enough — otherwise the chapter reopens at the top.
    tab.scrollPositions['letter-beta'] = { y: 1234, pct: 0.5 };
    // Start SHORT (content not rendered): maxScroll = 700 - 600 = 100 < 1234.
    Object.defineProperty(el, 'scrollHeight', { value: 700, configurable: true });
    // jsdom doesn't clamp scrollTop to the scrollable range — emulate the
    // browser clamp so the "clamped while short" assertion is meaningful.
    let _top = 0;
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get() { return _top; },
      set(v) { _top = Math.min(v, Math.max(0, el.scrollHeight - el.clientHeight)); },
    });
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    rerender(baseProps({ letterId: 'beta' }));
    // Content not rendered → clamped short, force still held, retry pending.
    expect(el.scrollTop).toBeLessThan(1234);
    expect(document.body.classList.contains('scroll-restoring')).toBe(true);
    act(() => { vi.advanceTimersByTime(100); }); // several frames, still short
    expect(el.scrollTop).toBeLessThan(1234);
    // Lazy corpus renders → the container becomes tall enough.
    Object.defineProperty(el, 'scrollHeight', { value: 2000, configurable: true });
    act(() => { vi.advanceTimersByTime(200); }); // a retry frame now lands it
    expect(el.scrollTop).toBe(1234);             // EXACTLY the saved position
    expect(document.body.classList.contains('scroll-restoring')).toBe(false); // force released
  });

  it('retries the restore until the scroll container mounts (cold-boot: __scrollEl null)', () => {
    // The real cold-boot failure: the restore runs while the lazy-corpus loading
    // view is up, so the chapter's scroll container (__scrollEl) hasn't mounted
    // yet. The saved position IS known — the effect must keep retrying until the
    // container appears, not give up (Hebrews reopened at the top otherwise).
    tab.scrollPositions['letter-beta'] = { y: 1234, pct: 0.5 };
    /** @type {any} */ (globalThis).__scrollEl = null; // container not mounted yet
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    rerender(baseProps({ letterId: 'beta' }));
    // No container → can't restore yet, but the force is held and a retry pends.
    expect(document.body.classList.contains('scroll-restoring')).toBe(true);
    act(() => { vi.advanceTimersByTime(100); }); // frames pass, still no container
    // The chapter mounts → its ScreenLayout ref sets __scrollEl (tall enough).
    /** @type {any} */ (globalThis).__scrollEl = el;
    act(() => { vi.advanceTimersByTime(100); });
    expect(el.scrollTop).toBe(1234);            // retry lands it once the container appears
    expect(document.body.classList.contains('scroll-restoring')).toBe(false); // released
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

describe('useScrollMemory — content anchor (reflow-proof restore)', () => {
  // jsdom has no layout engine, so getBoundingClientRect / elementFromPoint are
  // stubbed. Rects are made SCROLL-AWARE (top shifts with el.scrollTop) so the
  // content-coordinate math behaves like a real browser.
  function stubContainerRect(top = 0) {
    Object.defineProperty(el, 'getBoundingClientRect', {
      configurable: true,
      value: () => /** @type {any} */ ({ top, left: 0, width: 400, height: 600, bottom: top + 600, right: 400 }),
    });
  }
  function addAnchor(key, contentY) {
    const a = document.createElement('div');
    a.setAttribute('data-hl-key', key);
    el.appendChild(a);
    // Sits at content-Y `contentY`: its viewport top = contentY - scrollTop.
    a.getBoundingClientRect = () => /** @type {any} */ ({ top: contentY - el.scrollTop, left: 0, width: 400, height: 40, bottom: contentY - el.scrollTop + 40, right: 400 });
    return a;
  }

  it('restores to the content ANCHOR, not the drifted pixel y, when the element is present', () => {
    stubContainerRect(0);
    addAnchor('v', 500);
    // Saved: a drifted pixel y (9999) but a precise anchor 10px into verse "v".
    tab.scrollPositions['letter-beta'] = { y: 9999, pct: 1, anchorKey: 'v', anchorOff: 10 };
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    rerender(baseProps({ letterId: 'beta' }));
    expect(el.scrollTop).toBe(510); // anchorContentTop(500) + anchorOff(10) — ignores y=9999
  });

  it('adapts when the anchor has REFLOWED to a new position (the whole point)', () => {
    stubContainerRect(0);
    addAnchor('v', 800); // same verse now sits lower (e.g. larger font above it)
    tab.scrollPositions['letter-beta'] = { y: 500, pct: 0.3, anchorKey: 'v', anchorOff: 10 };
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    rerender(baseProps({ letterId: 'beta' }));
    expect(el.scrollTop).toBe(810); // follows the verse to 800 (+10), NOT the stale 500
  });

  it('falls back to the saved pixel y when the anchor element is absent', () => {
    tab.scrollPositions['letter-beta'] = { y: 1234, pct: 0.5, anchorKey: 'gone', anchorOff: 0 };
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    rerender(baseProps({ letterId: 'beta' }));
    expect(el.scrollTop).toBe(1234); // pixel fallback applied immediately
    act(() => { vi.advanceTimersByTime(2000); }); // past the retry deadline
    expect(document.body.classList.contains('scroll-restoring')).toBe(false); // force released
  });

  it('captures the topmost visible verse via binary search (skips notes/sticky chrome)', () => {
    stubContainerRect(0); // container top 0, height 600
    addAnchor('v1', 0);      // scrolled above the viewport
    addAnchor('v2', 1000);   // the upcoming verse (a tall study note fills 40..1000)
    addAnchor('v3', 2000);
    renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    // Viewport top at content-Y 970 — v1 is fully above; v2 starts 30px below.
    act(() => { scrollTo(970); vi.advanceTimersByTime(150); }); // scroll → debounced flush
    const saved = tab.scrollPositions['letter-alpha'];
    expect(saved.anchorKey).toBe('v2');     // nearest verse, not the note at the exact top
    expect(saved.anchorOff).toBe(-30);      // v2 starts 30px below the viewport top
  });
});

describe('useScrollMemory — journal viewer/editor keys are PER-ENTRY', () => {
  // The bare screen-name key made every journal entry share ONE scroll slot:
  // opening entry B force-restored entry A's offset (a nonsense position the
  // restore loop then re-applied against the user's finger — the Android
  // "scroll keeps jerking me back" report, 2026-07-14).
  it('saves under journal-viewer-<entryId>, not one shared journal-viewer slot', () => {
    renderHook((p) => useScrollMemory(p), {
      initialProps: baseProps({ screen: 'journal-viewer', letterId: null, journalEntryId: 'e1' }),
    });
    settleRestoreRaf();
    act(() => { scrollTo(700); vi.advanceTimersByTime(150); });
    expect(tab.scrollPositions['journal-viewer-e1']).toMatchObject({ y: 700 });
    expect(tab.scrollPositions['journal-viewer']).toBeUndefined();
  });

  it('entry→entry nav restores EACH entry to its own offset (re-fires on journalEntryId)', () => {
    const { rerender } = renderHook((p) => useScrollMemory(p), {
      initialProps: baseProps({ screen: 'journal-viewer', letterId: null, journalEntryId: 'e1' }),
    });
    settleRestoreRaf();
    act(() => { scrollTo(700); vi.advanceTimersByTime(150); });

    // Open a DIFFERENT entry (screen unchanged — only the entry id moves).
    rerender(baseProps({ screen: 'journal-viewer', letterId: null, journalEntryId: 'e2' }));
    settleRestoreRaf();
    expect(el.scrollTop).toBe(0); // e2 was never scrolled — starts at top, NOT e1's 700

    act(() => { scrollTo(300); vi.advanceTimersByTime(150); });
    rerender(baseProps({ screen: 'journal-viewer', letterId: null, journalEntryId: 'e1' }));
    settleRestoreRaf();
    act(() => { vi.advanceTimersByTime(100); });
    expect(el.scrollTop).toBe(700); // back on e1 → e1's own offset
    expect(tab.scrollPositions['journal-viewer-e2']).toMatchObject({ y: 300 });
  });

  it('the editor key is per-entry too', () => {
    renderHook((p) => useScrollMemory(p), {
      initialProps: baseProps({ screen: 'journal-editor', letterId: null, journalEntryId: 'e9' }),
    });
    settleRestoreRaf();
    act(() => { scrollTo(450); vi.advanceTimersByTime(150); });
    expect(tab.scrollPositions['journal-editor-e9']).toMatchObject({ y: 450 });
  });
});

describe('useScrollMemory — scrollPositions LRU bound (Wave 0)', () => {
  // The map grew MONOTONICALLY forever: every screen ever scrolled added a
  // key, and the whole tabs array (scrollPositions included) is persisted to
  // localStorage on every nav by usePersistedState — an unbounded vot-state
  // blob. The bound keeps the N most-recently-touched keys; keys are strings
  // ('letter-x', 'genesis-3'), never integer-like, so JS object insertion
  // order IS the LRU order. The restore READ path is untouched (protect-list
  // invariant) — pruning only ever drops the coldest keys.

  it('prunes to the most recent keys when the map overflows (coldest dropped)', async () => {
    const { SCROLL_POSITIONS_MAX } = await import('./use-scroll-memory.js');
    for (let i = 0; i < SCROLL_POSITIONS_MAX; i++) tab.scrollPositions['cold-' + i] = { y: i, pct: 0, anchorKey: null, anchorOff: 0 };
    renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    act(() => { scrollTo(500); vi.advanceTimersByTime(150); }); // flush adds key #101
    const keys = Object.keys(tab.scrollPositions);
    expect(keys.length).toBe(SCROLL_POSITIONS_MAX);
    expect(keys).toContain('letter-alpha');          // the fresh write survives
    expect(keys).not.toContain('cold-0');            // the coldest is dropped
    expect(keys).toContain('cold-' + (SCROLL_POSITIONS_MAX - 1)); // hottest cold key kept
  });

  it('re-touching an existing key refreshes its recency (LRU, not FIFO)', async () => {
    const { SCROLL_POSITIONS_MAX } = await import('./use-scroll-memory.js');
    // letter-alpha inserted FIRST (coldest), then MAX cold keys on top — the
    // map is one OVER the bound, so the flush's re-touch of alpha must evict
    // cold-0 (now coldest) instead of alpha.
    tab.scrollPositions['letter-alpha'] = { y: 1, pct: 0, anchorKey: null, anchorOff: 0 };
    for (let i = 0; i < SCROLL_POSITIONS_MAX; i++) tab.scrollPositions['cold-' + i] = { y: i, pct: 0, anchorKey: null, anchorOff: 0 };
    renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    act(() => { scrollTo(500); vi.advanceTimersByTime(150); }); // re-touches alpha
    const keys = Object.keys(tab.scrollPositions);
    expect(keys.length).toBe(SCROLL_POSITIONS_MAX);
    expect(keys).toContain('letter-alpha');          // refreshed, NOT evicted
    expect(tab.scrollPositions['letter-alpha']).toMatchObject({ y: 500 });
    expect(keys).not.toContain('cold-0');            // eviction falls to the next-coldest
  });

  it('the nav-time commit prunes too, and the pruned record keeps the anchor shape (restore invariant)', async () => {
    const { SCROLL_POSITIONS_MAX } = await import('./use-scroll-memory.js');
    for (let i = 0; i < SCROLL_POSITIONS_MAX; i++) tab.scrollPositions['cold-' + i] = { y: i, pct: 0, anchorKey: null, anchorOff: 0 };
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    act(() => { scrollTo(1500); });            // pending stash for letter-alpha
    rerender(baseProps({ letterId: 'beta' })); // nav-time commit writes alpha → overflow
    const keys = Object.keys(tab.scrollPositions);
    expect(keys.length).toBe(SCROLL_POSITIONS_MAX);
    // The committed record carries the full { y, pct, anchorKey, anchorOff }
    // shape — the content-anchor restore contract survives pruning intact.
    expect(tab.scrollPositions['letter-alpha']).toMatchObject({ y: 1500 });
    expect(tab.scrollPositions['letter-alpha']).toHaveProperty('anchorKey');
    expect(tab.scrollPositions['letter-alpha']).toHaveProperty('anchorOff');
    expect(keys).not.toContain('cold-0');
  });

  it('a RETAINED key still restores exactly after pruning (read path untouched)', async () => {
    const { SCROLL_POSITIONS_MAX } = await import('./use-scroll-memory.js');
    tab.scrollPositions['letter-beta'] = { y: 1234, pct: 0.5, anchorKey: null, anchorOff: 0 };
    for (let i = 0; i < SCROLL_POSITIONS_MAX - 1; i++) tab.scrollPositions['cold-' + i] = { y: i, pct: 0, anchorKey: null, anchorOff: 0 };
    const { rerender } = renderHook((p) => useScrollMemory(p), { initialProps: baseProps() });
    settleRestoreRaf();
    rerender(baseProps({ letterId: 'beta' }));
    expect(el.scrollTop).toBe(1234); // exact restore, unchanged by the LRU layer
  });
});
