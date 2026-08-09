/* useReadProgress — the listen-completion bridge (owner directive 2026-08-09).

   A finished audio letter increments the same count-valued readItems entry a
   detector-verified read increments, so "times through" reflects reads AND
   listens. The bridge maps the player's manifest volKey to the registry's
   readKey via COL_BY_KEY, respects the markAsRead gate, and records a streak
   day (a full listen proves presence as well as a full read does). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadProgress } from './useMarkAsRead.js';

beforeEach(() => {
  window.COL_BY_KEY = new Map([['one', { volKey: 'one', readKey: 'vol-one' }]]);
  window.ReadingStreakStore = { recordReadingDay: vi.fn() };
});

afterEach(() => {
  delete window.COL_BY_KEY;
  delete window.ReadingStreakStore;
  delete window.__votAudioListened;
});

describe('useReadProgress — audio listen bridge', () => {
  it('increments the item count on every completed listen', () => {
    const { result } = renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: true }));
    expect(typeof window.__votAudioListened).toBe('function');

    act(() => window.__votAudioListened('one', 'the-wide-path'));
    expect(result.current.readItems['v1:vol-one:the-wide-path']).toBe(1);
    expect(result.current.isRead('vol-one', 'the-wide-path')).toBe(true);

    act(() => window.__votAudioListened('one', 'the-wide-path'));
    expect(result.current.readItems['v1:vol-one:the-wide-path']).toBe(2);
    expect(window.ReadingStreakStore.recordReadingDay).toHaveBeenCalledTimes(2);
  });

  it('adds on top of an existing read count (read + listen share one ledger)', () => {
    const { result } = renderHook(() => useReadProgress({
      savedReadItems: { 'v1:vol-one:the-wide-path': 3 },
      markAsReadEnabled: true,
    }));
    act(() => window.__votAudioListened('one', 'the-wide-path'));
    expect(result.current.readItems['v1:vol-one:the-wide-path']).toBe(4);
  });

  it('respects the markAsRead gate and unknown collections', () => {
    const { result } = renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: false }));
    act(() => window.__votAudioListened('one', 'the-wide-path'));
    expect(result.current.readItems).toEqual({});

    const on = renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: true }));
    act(() => window.__votAudioListened('nope', 'the-wide-path'));
    expect(on.result.current.readItems).toEqual({});
  });

  it('clears the bridge on unmount', () => {
    const { unmount } = renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: true }));
    unmount();
    expect(window.__votAudioListened).toBe(null);
  });
});
