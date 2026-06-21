/* useTabTitleMemo — sticky Tabs-overview card labels.
   ─────────────────────────────────────────────────────────────────────
   Captures the active tab's resolved describeTab label onto the tab so the
   overview never reverts a viewed tab to a generic "Reading"/"Entry" when its
   lazy corpus isn't loaded. describeTab is read as a free-var global; the
   tests stub window.describeTab (matches use-document-title.test.js). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTabTitleMemo } from './use-tab-title-memo.js';

let _orig;
beforeEach(() => { _orig = window.describeTab; });
afterEach(() => { window.describeTab = _orig; });

describe('useTabTitleMemo', () => {
  it('stores the resolved label onto the active tab', () => {
    window.describeTab = vi.fn(() => ({ title: 'The Wide Path', subtitle: 'Volume Two', resolved: true }));
    const updateActiveTab = vi.fn();
    renderHook(() => useTabTitleMemo({
      activeTab: { screen: 'vot-letter', letterId: 'x', title: null, subtitle: null },
      updateActiveTab,
    }));
    expect(updateActiveTab).toHaveBeenCalledWith({ title: 'The Wide Path', subtitle: 'Volume Two' });
  });

  it('does NOT overwrite a stored label when the live lookup is unresolved (corpus not loaded)', () => {
    window.describeTab = vi.fn(() => ({ title: 'Reading', subtitle: 'Scripture', resolved: false }));
    const updateActiveTab = vi.fn();
    renderHook(() => useTabTitleMemo({
      activeTab: { screen: 'bible-ch', title: 'Psalms · Ch. 23', subtitle: 'Old Testament' },
      updateActiveTab,
    }));
    expect(updateActiveTab).not.toHaveBeenCalled();
  });

  it('is idempotent — no write when the resolved label already matches the stored one', () => {
    window.describeTab = vi.fn(() => ({ title: 'Matthew · Ch. 5', subtitle: 'New Testament · Gospels', resolved: true }));
    const updateActiveTab = vi.fn();
    renderHook(() => useTabTitleMemo({
      activeTab: { screen: 'matthew-ch', title: 'Matthew · Ch. 5', subtitle: 'New Testament · Gospels' },
      updateActiveTab,
    }));
    expect(updateActiveTab).not.toHaveBeenCalled();
  });

  it('does not throw (and does not write) when describeTab throws (lazy globals)', () => {
    window.describeTab = vi.fn(() => { throw new Error('corpus not ready'); });
    const updateActiveTab = vi.fn();
    expect(() => renderHook(() => useTabTitleMemo({ activeTab: { screen: 'bible-ch' }, updateActiveTab }))).not.toThrow();
    expect(updateActiveTab).not.toHaveBeenCalled();
  });
});
