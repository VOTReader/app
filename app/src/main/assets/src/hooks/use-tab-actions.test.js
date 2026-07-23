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
