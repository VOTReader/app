import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabs } from './use-tabs.js';

describe('REPRO navigation-tabs-5: stale restored activeTabIdx', () => {
  it('writes through the visible fallback tab when the persisted index is out of range', () => {
    const { result } = renderHook(() => useTabs({
      saved: {
        tabs: [
          { id: 'tab-0', screen: 'home' },
          { id: 'tab-1', screen: 'settings' },
        ],
        activeTabIdx: 998,
      },
    }));

    expect(result.current.activeTab).toBe(result.current.tabs[0]);

    act(() => { result.current.tabField('screen')[1]('search'); });

    // The rendered fallback is tab 0, so its setter must not silently no-op.
    expect(result.current.tabs[0].screen).toBe('search');
  });
});
