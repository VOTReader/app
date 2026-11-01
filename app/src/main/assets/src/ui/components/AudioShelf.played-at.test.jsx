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

  /* #61 found it, in the audio player it kept out of: "N days ago" counted 24-hour blocks, so it disagreed with
     History's day headers and the other labels (utils/dates.js). Local wall-clock instants, so each case lands on
     the boundary in any zone (and on the DST day itself under TZ=America/Denver). */
  it('counts days by the calendar, as History and the other labels do', () => {
    vi.useFakeTimers();
    const at = (y, m, d, h, min = 0) => new Date(y, m, d, h, min).getTime();
    // Wednesday 08:00; Monday 23:00 is 33 hours back but two calendar days
    vi.setSystemTime(at(2026, 10, 4, 8));
    expect(relativePlayedAt(at(2026, 10, 2, 23))).toBe('2 days ago');
    // yesterday 07:00 from 08:00 today is 25 hours: one day
    expect(relativePlayedAt(at(2026, 10, 3, 7))).toBe('1 day ago');
    // the day clocks went back (2026-11-01): 00:15 the day before is 48 h 15 min in Denver, one calendar day
    vi.setSystemTime(at(2026, 10, 1, 23, 30));
    expect(relativePlayedAt(at(2026, 9, 31, 0, 15))).toBe('1 day ago');
    // across a month and a year
    vi.setSystemTime(at(2027, 0, 1, 0, 30));
    expect(relativePlayedAt(at(2026, 11, 30, 23, 0))).toBe('2 days ago');
  });

  it('says nothing for a play time it cannot trust', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    for (const bad of [undefined, null, 0, NaN, 'yesterday', 2026, -5]) {
      expect(relativePlayedAt(bad)).toBe('');
    }
  });
});
