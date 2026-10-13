// @ts-nocheck
/* Sweep 2026-10-13 (readalong low): a History row with no usable playedAt (a malformed import: missing, 0, a string,
   a year) read "20734 days ago" - the time since 1970. An unknown play time now says nothing. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { relativePlayedAt } from './AudioShelf.jsx';

afterEach(() => { vi.useRealTimers(); });

describe('relativePlayedAt', () => {
  it('names real play times as before', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    const now = Date.now();
    expect(relativePlayedAt(now - 10 * 1000)).toBe('Just now');
    expect(relativePlayedAt(now - 5 * 60000)).toBe('5 min ago');
    expect(relativePlayedAt(now - 3 * 3600000)).toBe('3 hours ago');
    expect(relativePlayedAt(now - 2 * 86400000)).toBe('2 days ago');
  });

  it('says nothing for a play time it cannot trust', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    for (const bad of [undefined, null, 0, NaN, 'yesterday', 2026, -5]) {
      expect(relativePlayedAt(bad)).toBe('');
    }
  });
});
