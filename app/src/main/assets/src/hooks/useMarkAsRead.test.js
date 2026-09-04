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
  delete window.ReadingStatsStore;
  delete window.__votAudioListened;
});

/** A minimal real ReadingStatsStore stand-in: seeded frontiers actually
 *  clear, so the test proves the END STATE (getProgress → null), not just
 *  that clearProgress was called. */
function fakeStatsStore(seedProgress) {
  const progress = { ...seedProgress };
  return {
    clearProgress: (key) => { delete progress[key]; },
    getProgress: (key) => (Object.prototype.hasOwnProperty.call(progress, key) ? progress[key] : null),
  };
}

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

  // gap-reading-measurement-and-achievements-4: an audio-credited read never
  // cleared the item's frontier, so an index card could show a read check
  // AND "62% left" at the same time — markRead's manual branch already
  // clears the frontier on a claim; the listen-credit path did not.
  it('clears a stored frontier when an audio listen credits the same key', () => {
    window.ReadingStatsStore = fakeStatsStore({ 'v1:vol-one:the-wide-path': { b: 10, c: [0, 1], t: 1 } });
    renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: true }));
    expect(window.ReadingStatsStore.getProgress('v1:vol-one:the-wide-path')).not.toBeNull();

    act(() => window.__votAudioListened('one', 'the-wide-path'));

    expect(window.ReadingStatsStore.getProgress('v1:vol-one:the-wide-path')).toBeNull();
  });
});

/* A Bible edition has no COL_BY_KEY entry and never will — its volKeys name a
   RECORDING, not a collection — so a listened chapter used to resolve nothing
   at all. It lands in the same chapter key space BibleChapterView's own
   mark-as-read writes, which is what makes it show a check on the chapter
   index and count toward the Scripture-chapter milestones. */
describe('useReadProgress — audio listen bridge: Bible chapters', () => {
  it('credits the CHAPTER key space and feeds the streak', () => {
    const { result } = renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: true }));

    act(() => window.__votAudioListened('bible-brm-kjv', 'jonah', 3));
    expect(result.current.readItems['v1:jonah:3']).toBe(1);
    expect(result.current.isRead('jonah', 3)).toBe(true);
    expect(window.ReadingStreakStore.recordReadingDay).toHaveBeenCalledTimes(1);

    // A second listen increments, exactly as a re-read does.
    act(() => window.__votAudioListened('bible-brm-kjv', 'jonah', 3));
    expect(result.current.readItems['v1:jonah:3']).toBe(2);
  });

  it('adds on top of a chapter already read in the reader — one ledger', () => {
    const { result } = renderHook(() => useReadProgress({
      savedReadItems: { 'v1:matthew:5': 2 }, markAsReadEnabled: true,
    }));
    act(() => window.__votAudioListened('bible-wop-nkjv', 'matthew', 5));
    expect(result.current.readItems['v1:matthew:5']).toBe(3);
  });

  it('claims nothing when no chapter is named (a whole-book recording)', () => {
    const { result } = renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: true }));
    act(() => window.__votAudioListened('bible-brm-kjv', 'jonah', 0));
    expect(result.current.readItems).toEqual({});
    expect(window.ReadingStreakStore.recordReadingDay).not.toHaveBeenCalled();
  });

  it('respects the markAsRead gate like any other new mark', () => {
    const { result } = renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: false }));
    act(() => window.__votAudioListened('bible-brm-kjv', 'jonah', 1));
    expect(result.current.readItems).toEqual({});
  });

  // gap-reading-measurement-and-achievements-4, bible-* leg: the credit path
  // is shared between the volume/letter key space and the chapter key
  // space — the frontier clear must reach both, not just the first one
  // exercised above.
  it('clears a stored frontier for the bible-* chapter key space too', () => {
    window.ReadingStatsStore = fakeStatsStore({ 'v1:jonah:3': { b: 4, c: [0], t: 1 } });
    renderHook(() => useReadProgress({ savedReadItems: {}, markAsReadEnabled: true }));

    act(() => window.__votAudioListened('bible-brm-kjv', 'jonah', 3));

    expect(window.ReadingStatsStore.getProgress('v1:jonah:3')).toBeNull();
  });
});
