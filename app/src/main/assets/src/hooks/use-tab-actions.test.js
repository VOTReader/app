/* UX7 — useTabActions tab-close undo (the one instant/irreversible delete now
   recoverable). Drives closeTab + restoreClosedTab via the captured functional
   setTabs updater (the spy doesn't auto-apply it), and asserts the undo toast. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../utils/toast.js', () => ({ showToast: vi.fn(), hideToast: vi.fn() }));
import { showToast, hideToast } from '../utils/toast.js';
import { useTabActions } from './use-tab-actions.js';

const tab = (id) => ({ id });
const makeTabState = (initial) => ({
  tabs: initial, activeTabIdx: 0, setTabs: vi.fn(), setActiveTabIdx: vi.fn(),
});
const mount = (ts) => renderHook(() =>
  useTabActions({ tabState: ts, cancelDwell: vi.fn(), setTabThumbnails: vi.fn() }));

describe('useTabActions — UX7 tab-close undo', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('closeTab removes the tab + snapshots it; restoreClosedTab re-inserts at the same index', () => {
    const ts = makeTabState([tab('a'), tab('b'), tab('c')]);
    const { result } = mount(ts);

    act(() => { result.current.closeTab(1); });
    // Apply the captured functional updater — this both proves the close AND
    // populates the internal undo snapshot (the ref is set inside the updater).
    const closeUpdater = ts.setTabs.mock.calls[0][0];
    expect(closeUpdater([tab('a'), tab('b'), tab('c')]).map((t) => t.id)).toEqual(['a', 'c']);

    // The undo toast fires on the next macrotask, AFTER the snapshot is populated.
    act(() => { vi.advanceTimersByTime(0); });
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vot-toast-undo', html: expect.stringContaining('Undo') }),
    );

    // Undo: restoreClosedTab re-inserts the closed tab at its original index.
    ts.setTabs.mockClear();
    act(() => { result.current.restoreClosedTab(); });
    const restoreUpdater = ts.setTabs.mock.calls[0][0];
    expect(restoreUpdater([tab('a'), tab('c')]).map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(hideToast).toHaveBeenCalledWith('vot-toast-undo');
  });

  it('does NOT offer undo when closing the last tab (resets to home, no toast)', () => {
    const ts = makeTabState([tab('only')]);
    const { result } = mount(ts);
    act(() => { result.current.closeTab(0); });
    ts.setTabs.mock.calls[0][0]([tab('only')]); // apply updater → last-tab path nulls the snapshot
    act(() => { vi.advanceTimersByTime(0); });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('restoreClosedTab is a no-op when there is nothing to restore', () => {
    const ts = makeTabState([tab('a')]);
    const { result } = mount(ts);
    act(() => { result.current.restoreClosedTab(); });
    expect(ts.setTabs).not.toHaveBeenCalled();
  });
});

/* Drag-to-reorder: reorderTabs splices from->to and remaps activeTabIdx so the
   previously-active tab stays active. The spy setters don't auto-apply, so we
   capture the functional updaters and assert their output directly. */
describe('useTabActions — reorderTabs (drag-to-reorder)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('moves a tab from -> to, preserving the rest of the order', () => {
    const ts = makeTabState([tab('a'), tab('b'), tab('c')]);
    const { result } = mount(ts);
    act(() => { result.current.reorderTabs(0, 2); });
    const upd = ts.setTabs.mock.calls[0][0];
    expect(upd([tab('a'), tab('b'), tab('c')]).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the moved tab active (active index follows the move)', () => {
    const ts = makeTabState([tab('a'), tab('b'), tab('c')]); // active = 0 (a)
    const { result } = mount(ts);
    act(() => { result.current.reorderTabs(0, 2); });
    // Applying the setTabs updater triggers the inner setActiveTabIdx.
    ts.setTabs.mock.calls[0][0]([tab('a'), tab('b'), tab('c')]);
    expect(ts.setActiveTabIdx.mock.calls[0][0](0)).toBe(2);
  });

  it('remaps every index correctly for an upward (right->left) move', () => {
    const ts = makeTabState([tab('a'), tab('b'), tab('c')]);
    const { result } = mount(ts);
    act(() => { result.current.reorderTabs(2, 0); });   // [c, a, b]
    expect(ts.setTabs.mock.calls[0][0]([tab('a'), tab('b'), tab('c')]).map((t) => t.id))
      .toEqual(['c', 'a', 'b']);
    const remap = ts.setActiveTabIdx.mock.calls[0][0];
    expect(remap(2)).toBe(0); // c (the moved one)
    expect(remap(0)).toBe(1); // a shifts right
    expect(remap(1)).toBe(2); // b shifts right
  });

  it('remaps every index correctly for a downward (left->right) move', () => {
    const ts = makeTabState([tab('a'), tab('b'), tab('c'), tab('d')]);
    const { result } = mount(ts);
    act(() => { result.current.reorderTabs(0, 2); });   // [b, c, a, d]
    const next = ts.setTabs.mock.calls[0][0]([tab('a'), tab('b'), tab('c'), tab('d')]);
    const remap = ts.setActiveTabIdx.mock.calls[0][0];
    expect(next[remap(1)].id).toBe('b'); // shifts left
    expect(next[remap(2)].id).toBe('c'); // shifts left
    expect(next[remap(3)].id).toBe('d'); // beyond the move, unchanged
  });

  it('is a no-op when from === to', () => {
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.reorderTabs(1, 1); });
    expect(ts.setTabs).not.toHaveBeenCalled();
  });

  it('guards out-of-range indices (returns prev unchanged, no active remap)', () => {
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.reorderTabs(0, 5); });
    const prev = [tab('a'), tab('b')];
    expect(ts.setTabs.mock.calls[0][0](prev)).toBe(prev);
    expect(ts.setActiveTabIdx).not.toHaveBeenCalled();
  });
});

/* Wave 0 tab cap: a HUMANE cap (50, was 999) with EXPLICIT toast feedback at
   the cap instead of the silent no-op (`return prev`). At 999 the failure was
   invisible — the user tapped "new tab", nothing happened, no explanation. */
describe('useTabActions — tab cap + feedback (Wave 0)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const fiftyTabs = () => Array.from({ length: 50 }, (_, i) => tab('t' + i));

  it('the cap is humane (50), not the old 999', () => {
    const ts = makeTabState([tab('a')]);
    const { result } = mount(ts);
    expect(result.current.MAX_TABS).toBe(50);
  });

  it('openNewTab at the cap leaves the array unchanged AND tells the user (toast)', () => {
    const ts = makeTabState(fiftyTabs());
    const { result } = mount(ts);
    act(() => { result.current.openNewTab(); });
    const updater = ts.setTabs.mock.calls[0][0];
    const prev = fiftyTabs();
    expect(updater(prev)).toBe(prev); // still a no-op on the state…
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vot-toast-tab-cap', text: expect.stringContaining('50') }),
    ); // …but no longer a SILENT one
  });

  it('openNewTab below the cap adds a tab with NO cap toast', () => {
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.openNewTab(); });
    const next = ts.setTabs.mock.calls[0][0]([tab('a'), tab('b')]);
    expect(next.length).toBe(3);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('restoreClosedTab at the cap also surfaces the cap toast', () => {
    // Seed the undo snapshot via a real close below the cap, then grow the
    // array to the cap before undoing (e.g. closed one, opened others).
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.closeTab(0); });
    ts.setTabs.mock.calls[0][0]([tab('a'), tab('b')]); // apply close → snapshot {a, 0}
    vi.clearAllMocks();
    act(() => { result.current.restoreClosedTab(); });
    const prev = fiftyTabs();
    expect(ts.setTabs.mock.calls[0][0](prev)).toBe(prev);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vot-toast-tab-cap' }),
    );
  });
});

/* FABLE5 [7] — rename + pin. Same captured-updater technique: apply the
   functional setTabs updater to a known array and assert the output. */
describe('useTabActions — [7] rename + pin', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const apply = (ts, arr, call = 0) => ts.setTabs.mock.calls[call][0](arr);

  it('renameTab sets customTitle; empty/whitespace clears it', () => {
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.renameTab(1, '  My Study  '); });
    expect(apply(ts, [tab('a'), tab('b')])[1].customTitle).toBe('My Study');
    ts.setTabs.mockClear();
    act(() => { result.current.renameTab(1, '   '); });
    expect('customTitle' in apply(ts, [tab('a'), { ...tab('b'), customTitle: 'My Study' }])[1]).toBe(false);
  });

  it('togglePinTab pins + moves the tab to the end of the pinned prefix', () => {
    const ts = makeTabState([{ ...tab('p1'), pinned: true }, tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.togglePinTab(2); });
    const next = apply(ts, [{ ...tab('p1'), pinned: true }, tab('a'), tab('b')]);
    expect(next.map((t) => t.id)).toEqual(['p1', 'b', 'a']);
    expect(next[1].pinned).toBe(true);
  });

  it('togglePinTab on a pinned tab unpins in place', () => {
    const ts = makeTabState([{ ...tab('p1'), pinned: true }, tab('a')]);
    const { result } = mount(ts);
    act(() => { result.current.togglePinTab(0); });
    const next = apply(ts, [{ ...tab('p1'), pinned: true }, tab('a')]);
    expect(next.map((t) => t.id)).toEqual(['p1', 'a']);
    expect(next[0].pinned).toBe(false);
  });

  it('closeOtherTabs keeps the kept tab AND every pinned tab', () => {
    const ts = makeTabState([{ ...tab('p1'), pinned: true }, tab('a'), tab('b'), { ...tab('p2'), pinned: true }]);
    const { result } = mount(ts);
    act(() => { result.current.closeOtherTabs(2); });
    const next = apply(ts, [{ ...tab('p1'), pinned: true }, tab('a'), tab('b'), { ...tab('p2'), pinned: true }]);
    expect(next.map((t) => t.id)).toEqual(['p1', 'b', 'p2']);
  });

  it('closeTabsToTheRight spares pinned tabs to the right', () => {
    const ts = makeTabState([tab('a'), tab('b'), { ...tab('p1'), pinned: true }, tab('c')]);
    const { result } = mount(ts);
    act(() => { result.current.closeTabsToTheRight(0); });
    const next = apply(ts, [tab('a'), tab('b'), { ...tab('p1'), pinned: true }, tab('c')]);
    expect(next.map((t) => t.id)).toEqual(['a', 'p1']);
  });

  it('closeAllTabs keeps only pinned tabs; full reset when none are pinned', () => {
    const ts = makeTabState([tab('a'), { ...tab('p1'), pinned: true }]);
    const { result } = mount(ts);
    act(() => { result.current.closeAllTabs(); });
    const next = apply(ts, [tab('a'), { ...tab('p1'), pinned: true }]);
    expect(next.map((t) => t.id)).toEqual(['p1']);

    const ts2 = makeTabState([tab('a'), tab('b')]);
    const { result: r2 } = mount(ts2);
    act(() => { r2.current.closeAllTabs(); });
    const reset = ts2.setTabs.mock.calls[0][0]([tab('a'), tab('b')]);
    expect(reset.length).toBe(1);
    expect(reset[0].screen).toBeDefined(); // DEFAULT_TAB shape
  });

  it('closeAllTabs wipes the thumbnails only on the true full reset', () => {
    const setTabThumbnails = vi.fn();
    const ts = makeTabState([tab('a'), { ...tab('p1'), pinned: true }]);
    const { result } = renderHook(() => useTabActions({ tabState: ts, cancelDwell: vi.fn(), setTabThumbnails }));
    act(() => { result.current.closeAllTabs(); });
    apply(ts, [tab('a'), { ...tab('p1'), pinned: true }]);
    expect(setTabThumbnails).not.toHaveBeenCalled();
    expect(ts.setActiveTabIdx).toHaveBeenCalledWith(0);
    apply(ts, [tab('a'), tab('b')]);
    expect(setTabThumbnails).toHaveBeenCalledWith({});
  });

  it('renameTab on a missing index returns the array unchanged', () => {
    const ts = makeTabState([tab('a')]);
    const { result } = mount(ts);
    act(() => { result.current.renameTab(4, 'x'); });
    const prev = [tab('a')];
    expect(apply(ts, prev)).toBe(prev);
  });

  it('renameTab with a null title clears the custom title', () => {
    const ts = makeTabState([tab('a')]);
    const { result } = mount(ts);
    act(() => { result.current.renameTab(0, null); });
    expect('customTitle' in apply(ts, [{ ...tab('a'), customTitle: 'Old' }])[0]).toBe(false);
  });

  it('togglePinTab on a missing index returns the array unchanged', () => {
    const ts = makeTabState([tab('a')]);
    const { result } = mount(ts);
    act(() => { result.current.togglePinTab(3); });
    const prev = [tab('a')];
    expect(apply(ts, prev)).toBe(prev);
    expect(ts.setActiveTabIdx).not.toHaveBeenCalled();
  });

  it('togglePinTab keeps the same tab active across the pin move', () => {
    // [p1, a, b, c] — pinning c (idx 3) moves it to idx 1: [p1, c, a, b]
    const arr = () => [{ ...tab('p1'), pinned: true }, tab('a'), tab('b'), tab('c')];
    const ts = makeTabState(arr());
    const { result } = mount(ts);
    act(() => { result.current.togglePinTab(3); });
    const next = apply(ts, arr());
    expect(next.map((t) => t.id)).toEqual(['p1', 'c', 'a', 'b']);
    const remap = ts.setActiveTabIdx.mock.calls[0][0];
    expect(next[remap(3)].id).toBe('c'); // the pinned tab itself
    expect(remap(0)).toBe(0);            // p1, before the insert point
    expect(next[remap(1)].id).toBe('a'); // shifted right
    expect(next[remap(2)].id).toBe('b'); // shifted right
  });

  it('togglePinTab with the active tab to the right of the moved one', () => {
    // [a, b] — pinning a (idx 0) inserts at 0: order unchanged, b stays active
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.togglePinTab(0); });
    const next = apply(ts, [tab('a'), tab('b')]);
    const remap = ts.setActiveTabIdx.mock.calls[0][0];
    expect(next[remap(1)].id).toBe('b');
  });
});

describe('useTabActions — switch, close and bulk-close edges', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  const apply = (ts, arr, call = 0) => ts.setTabs.mock.calls[call][0](arr);

  it('switchToTab cancels the dwell timer first and clamps the index', () => {
    const cancelDwell = vi.fn();
    const ts = makeTabState([tab('a'), tab('b'), tab('c')]);
    const { result } = renderHook(() => useTabActions({ tabState: ts, cancelDwell, setTabThumbnails: vi.fn() }));
    act(() => { result.current.switchToTab(1); });
    expect(cancelDwell).toHaveBeenCalledTimes(1);
    expect(ts.setActiveTabIdx.mock.calls[0][0](0)).toBe(1);
    act(() => { result.current.switchToTab(-2); });
    expect(ts.setActiveTabIdx.mock.calls[1][0](2)).toBe(0);
    act(() => { result.current.switchToTab(99); });
    expect(ts.setActiveTabIdx.mock.calls[2][0](0)).toBe(2);
  });

  it('closing the last tab three times opens the disable-tabs prompt, then resets the count', () => {
    const ts = makeTabState([tab('only')]);
    const { result } = mount(ts);
    for (let i = 1; i <= 3; i++) {
      act(() => { result.current.closeTab(0); });
      act(() => { apply(ts, [tab('only')], i - 1); });
      if (i < 3) {
        expect(result.current.lastTabCloseStrikes.current).toBe(i);
        expect(result.current.disableTabsPromptOpen).toBe(false);
      }
    }
    expect(result.current.disableTabsPromptOpen).toBe(true);
    expect(result.current.lastTabCloseStrikes.current).toBe(0);
  });

  it('the last-tab close resets it to the default tab rather than removing it', () => {
    const ts = makeTabState([{ ...tab('only'), screen: 'letter' }]);
    const { result } = mount(ts);
    act(() => { result.current.closeTab(0); });
    const next = apply(ts, [{ ...tab('only'), screen: 'letter' }]);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBeUndefined();
    expect(ts.setActiveTabIdx).toHaveBeenCalledWith(0);
  });

  it('a normal close resets the strike count', () => {
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    result.current.lastTabCloseStrikes.current = 2;
    act(() => { result.current.closeTab(1); });
    apply(ts, [tab('a'), tab('b')]);
    expect(result.current.lastTabCloseStrikes.current).toBe(0);
  });

  it('closeTab keeps the active index on the same tab (left, same, right)', () => {
    const ts = makeTabState([tab('a'), tab('b'), tab('c')]);
    const { result } = mount(ts);
    act(() => { result.current.closeTab(1); });
    apply(ts, [tab('a'), tab('b'), tab('c')]);
    const remap = ts.setActiveTabIdx.mock.calls[0][0];
    expect(remap(2)).toBe(1); // c shifted left
    expect(remap(0)).toBe(0); // a to the left of the close
    expect(remap(1)).toBe(1); // the closed tab's slot → the next tab (c)
  });

  it('closing the active LAST tab in the strip moves to the new last', () => {
    const ts = makeTabState([tab('a'), tab('b'), tab('c')]);
    const { result } = mount(ts);
    act(() => { result.current.closeTab(2); });
    apply(ts, [tab('a'), tab('b'), tab('c')]);
    expect(ts.setActiveTabIdx.mock.calls[0][0](2)).toBe(1);
  });

  it('the undo toast button restores the closed tab once', () => {
    /** @type {any} */ (showToast).mockImplementation(({ id, html }) => {
      const el = document.createElement('div');
      el.id = id; el.innerHTML = html;
      document.body.appendChild(el);
    });
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.closeTab(0); });
    apply(ts, [tab('a'), tab('b')]);
    act(() => { vi.advanceTimersByTime(0); });
    const btn = /** @type {HTMLElement} */ (document.querySelector('#vot-toast-undo .vot-undo-btn'));
    expect(btn).not.toBeNull();
    act(() => { btn.click(); });
    expect(hideToast).toHaveBeenCalledWith('vot-toast-undo');
    const restored = ts.setTabs.mock.calls[1][0]([tab('b')]);
    expect(restored.map((t) => t.id)).toEqual(['a', 'b']);
    expect(ts.setActiveTabIdx).toHaveBeenLastCalledWith(0);
    act(() => { btn.click(); }); // { once: true } — a second tap does nothing
    expect(ts.setTabs).toHaveBeenCalledTimes(2);
  });

  it('the undo toast is harmless when its element never rendered', () => {
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.closeTab(0); });
    apply(ts, [tab('a'), tab('b')]);
    expect(() => act(() => { vi.advanceTimersByTime(0); })).not.toThrow();
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('restore clamps a stale index to the end of a shorter strip', () => {
    const ts = makeTabState([tab('a'), tab('b'), tab('c')]);
    const { result } = mount(ts);
    act(() => { result.current.closeTab(2); });
    apply(ts, [tab('a'), tab('b'), tab('c')]);
    act(() => { result.current.restoreClosedTab(); });
    const restored = ts.setTabs.mock.calls[1][0]([tab('a')]);
    expect(restored.map((t) => t.id)).toEqual(['a', 'c']);
    expect(ts.setActiveTabIdx).toHaveBeenLastCalledWith(1);
  });

  it('closeOtherTabs is a no-op for one tab, a missing keep index, or nothing to close', () => {
    const ts = makeTabState([tab('a')]);
    const { result } = mount(ts);
    act(() => { result.current.closeOtherTabs(0); });
    const one = [tab('a')];
    expect(apply(ts, one)).toBe(one);
    act(() => { result.current.closeOtherTabs(7); });
    const two = [tab('a'), tab('b')];
    expect(apply(ts, two, 1)).toBe(two);
    act(() => { result.current.closeOtherTabs(0); });
    const allPinned = [tab('a'), { ...tab('p'), pinned: true }];
    expect(apply(ts, allPinned, 2)).toBe(allPinned);
    expect(ts.setActiveTabIdx).not.toHaveBeenCalled();
  });

  it('closeOtherTabs makes the kept tab active', () => {
    const ts = makeTabState([{ ...tab('p'), pinned: true }, tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.closeOtherTabs(2); });
    apply(ts, [{ ...tab('p'), pinned: true }, tab('a'), tab('b')]);
    expect(ts.setActiveTabIdx).toHaveBeenCalledWith(1);
  });

  it('closeTabsToTheRight is a no-op at the last tab or when all to the right are pinned', () => {
    const ts = makeTabState([tab('a'), tab('b')]);
    const { result } = mount(ts);
    act(() => { result.current.closeTabsToTheRight(1); });
    const two = [tab('a'), tab('b')];
    expect(apply(ts, two)).toBe(two);
    act(() => { result.current.closeTabsToTheRight(0); });
    const pinnedRight = [tab('a'), { ...tab('p'), pinned: true }];
    expect(apply(ts, pinnedRight, 1)).toBe(pinnedRight);
  });

  it('closeTabsToTheRight keeps a surviving active tab active, else lands on the kept edge', () => {
    const arr = () => [tab('a'), tab('b'), tab('c'), { ...tab('p'), pinned: true }];
    const ts = makeTabState(arr());
    const { result } = mount(ts);
    act(() => { result.current.closeTabsToTheRight(0); });
    const prev = arr();
    const next = ts.setTabs.mock.calls[0][0](prev);
    expect(next.map((t) => t.id)).toEqual(['a', 'p']);
    const remap = ts.setActiveTabIdx.mock.calls[0][0];
    expect(remap(3)).toBe(1); // the pinned tab survived and moved to idx 1
    expect(remap(2)).toBe(0); // c was closed → the kept edge
  });
});

describe('useTabActions — deduplicateTabs', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { tabContentKey } = await import('../utils/tabs.js');
    /** @type {any} */ (globalThis).tabContentKey = tabContentKey; // a window global in production (_entry-d)
  });
  afterEach(() => { delete /** @type {any} */ (globalThis).tabContentKey; });

  const at = (screen, letterId) => ({ screen, letterId });
  const mountActive = (arr, activeTabIdx) => {
    const ts = { ...makeTabState(arr), activeTabIdx };
    return { ts, ...mount(ts) };
  };

  it('is a no-op on a single tab', () => {
    const { ts, result } = mountActive([at('home')], 0);
    act(() => { result.current.deduplicateTabs(); });
    const one = [at('home')];
    expect(ts.setTabs.mock.calls[0][0](one)).toBe(one);
  });

  it('drops later duplicates and keeps the active tab when it is the first instance', () => {
    const arr = [at('letter', 'x'), at('home'), at('letter', 'x'), at('letter', 'y')];
    const { ts, result } = mountActive(arr, 3);
    act(() => { result.current.deduplicateTabs(); });
    const kept = ts.setTabs.mock.calls[0][0](arr);
    expect(kept.map((t) => t.letterId || t.screen)).toEqual(['x', 'home', 'y']);
    expect(ts.setActiveTabIdx).toHaveBeenCalledWith(2);
  });

  it('an active duplicate points at the first kept instance of the same content', () => {
    const arr = [at('home'), at('letter', 'x'), at('letter', 'x')];
    const { ts, result } = mountActive(arr, 2);
    act(() => { result.current.deduplicateTabs(); });
    const kept = ts.setTabs.mock.calls[0][0](arr);
    expect(kept).toHaveLength(2);
    expect(ts.setActiveTabIdx).toHaveBeenCalledWith(1);
  });
});
