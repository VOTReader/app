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
