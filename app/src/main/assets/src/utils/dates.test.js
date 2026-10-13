/* W7.1a coverage recovery — utils/dates.js (relativeDate + timeAgo).
   ─────────────────────────────────────────────────────────────────
   These relative-time formatters back the "5m ago" / "3w ago" labels in
   the journal + history UI but were previously 0%-covered. Retiring the
   legacy migrations (W7.1a) removed well-covered dead code, dipping the
   global coverage average a hair below the floor; rather than lower the
   floor (the config's rule is "never lower"), we cover real untested
   logic. Time is pinned with fake timers so every if-ladder branch is
   deterministic. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { relativeDate, timeAgo } from './dates.js';

const NOW = 1_700_000_000_000;  // fixed reference epoch (ms)
const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe('relativeDate', () => {
  it('returns "" for falsy timestamps (no anchor)', () => {
    expect(relativeDate(0)).toBe('');
    expect(relativeDate(null)).toBe('');
    expect(relativeDate(undefined)).toBe('');
  });

  it('"Just now" under a minute', () => {
    expect(relativeDate(NOW - 30_000)).toBe('Just now');
    expect(relativeDate(NOW)).toBe('Just now');
  });

  it('"Nm ago" for 1..59 minutes', () => {
    expect(relativeDate(NOW - 5 * MIN)).toBe('5m ago');
    expect(relativeDate(NOW - 59 * MIN)).toBe('59m ago');
  });

  it('"Nh ago" for 1..23 hours', () => {
    expect(relativeDate(NOW - 1 * HR)).toBe('1h ago');
    expect(relativeDate(NOW - 23 * HR)).toBe('23h ago');
  });

  it('"Nd ago" for 1..6 days', () => {
    expect(relativeDate(NOW - 1 * DAY)).toBe('1d ago');
    expect(relativeDate(NOW - 6 * DAY)).toBe('6d ago');
  });

  it('"Nw ago" for 7..29 days', () => {
    expect(relativeDate(NOW - 7 * DAY)).toBe('1w ago');
    expect(relativeDate(NOW - 29 * DAY)).toBe('4w ago');
  });

  it('falls back to a Month-Day locale date at >= 30 days', () => {
    const out = relativeDate(NOW - 60 * DAY);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/ago|Just now/);  // not a relative string
  });

  // Sweep W69: toLocaleDateString with options builds a new ICU formatter per call, and the Library
  // lists call this once per row on every search keystroke (thousands of old rows on a phone).
  it('formats old dates with one shared Month-Day formatter, not one per row', () => {
    const Real = Intl.DateTimeFormat;
    let built = 0;
    const ctor = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (...a) { built++; return new Real(...a); });
    const perCall = vi.spyOn(Date.prototype, 'toLocaleDateString');
    try {
      const outs = [];
      for (let i = 0; i < 50; i++) outs.push(relativeDate(NOW - (40 + i) * DAY));
      expect(perCall).not.toHaveBeenCalled();
      expect(built).toBeLessThanOrEqual(1);
      expect(outs[0]).toBe(new Real(undefined, { month: 'short', day: 'numeric' }).format(NOW - 40 * DAY));
    } finally { ctor.mockRestore(); perCall.mockRestore(); }
  });
});

describe('timeAgo', () => {
  it('"just now" under a minute', () => {
    expect(timeAgo(NOW - 30_000)).toBe('just now');
  });

  it('"Nm ago" for 1..59 minutes', () => {
    expect(timeAgo(NOW - 5 * MIN)).toBe('5m ago');
  });

  it('"Nh ago" for 1..23 hours', () => {
    expect(timeAgo(NOW - 3 * HR)).toBe('3h ago');
  });

  it('"Nd ago" for 1..6 days', () => {
    expect(timeAgo(NOW - 3 * DAY)).toBe('3d ago');
  });

  it('"Nw ago" for 7..34 days (weeks < 5)', () => {
    expect(timeAgo(NOW - 7 * DAY)).toBe('1w ago');
    expect(timeAgo(NOW - 28 * DAY)).toBe('4w ago');
  });

  it('"Nmo ago" at >= 5 weeks', () => {
    expect(timeAgo(NOW - 60 * DAY)).toBe('2mo ago');
  });
});
