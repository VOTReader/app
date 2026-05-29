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
