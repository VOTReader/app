/* W7.1a coverage recovery — utils/dates.js (relativeDate + timeAgo).
   ─────────────────────────────────────────────────────────────────
   These relative-time formatters back the "5 min ago" / "3 weeks ago" labels (whole words since U07.8: "1m" in capitals read as a month) in
   the journal + history UI but were previously 0%-covered. Retiring the
   legacy migrations (W7.1a) removed well-covered dead code, dipping the
   global coverage average a hair below the floor; rather than lower the
   floor (the config's rule is "never lower"), we cover real untested
   logic. Time is pinned with fake timers so every if-ladder branch is
   deterministic. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { relativeDate, timeAgo, calendarDaysAgo } from './dates.js';

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

  it('"N min ago" for 1..59 minutes', () => {
    expect(relativeDate(NOW - 5 * MIN)).toBe('5 min ago');
    expect(relativeDate(NOW - 59 * MIN)).toBe('59 min ago');
  });

  it('"N hr ago" for 1..23 hours', () => {
    expect(relativeDate(NOW - 1 * HR)).toBe('1 hr ago');
    expect(relativeDate(NOW - 23 * HR)).toBe('23 hr ago');
  });

  it('"N days ago" for 1..6 days', () => {
    expect(relativeDate(NOW - 1 * DAY)).toBe('1 day ago');
    expect(relativeDate(NOW - 6 * DAY)).toBe('6 days ago');
  });

  it('"N weeks ago" for 7..29 days', () => {
    expect(relativeDate(NOW - 7 * DAY)).toBe('1 week ago');
    expect(relativeDate(NOW - 29 * DAY)).toBe('4 weeks ago');
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

// s34.4 (n93): a date from an earlier calendar year carries its year; this year's stay Month-Day.
describe('relativeDate across a year', () => {
  it('names the year for an earlier year, not for this one', () => {
    expect(relativeDate(NOW - 400 * DAY)).toMatch(/2022/);
    expect(relativeDate(NOW - 40 * DAY)).not.toMatch(/2023/);
  });
});

describe('timeAgo', () => {
  it('"just now" under a minute', () => {
    expect(timeAgo(NOW - 30_000)).toBe('just now');
  });

  it('"N min ago" for 1..59 minutes', () => {
    expect(timeAgo(NOW - 5 * MIN)).toBe('5 min ago');
  });

  it('"N hr ago" for 1..23 hours', () => {
    expect(timeAgo(NOW - 3 * HR)).toBe('3 hr ago');
  });

  it('"N days ago" for 1..6 days', () => {
    expect(timeAgo(NOW - 3 * DAY)).toBe('3 days ago');
  });

  it('"N weeks ago" for 7..34 days (weeks < 5)', () => {
    expect(timeAgo(NOW - 7 * DAY)).toBe('1 week ago');
    expect(timeAgo(NOW - 28 * DAY)).toBe('4 weeks ago');
  });

  it('"N months ago" at >= 5 weeks', () => {
    expect(timeAgo(NOW - 60 * DAY)).toBe('2 months ago');
  });
});

/* The date-boundary hunt (2026-11-01). Instants are local wall-clock times (new Date(y, m, d, h, min)), so each case
   means the same in every zone; run under TZ=America/Denver they sit on the DST, month and year boundaries themselves.
   Elapsed hours / 24 called a visit at 23:00 the day before yesterday "1 day ago" at 08:00, under History's header
   naming that day; a day or more is now counted in calendar days. Under a day stays in hours. */
describe('a day or more ago counts calendar days, not 24-hour blocks', () => {
  const at = (/** @type {number} */ y, /** @type {number} */ mo, /** @type {number} */ d, h = 0, mi = 0) => new Date(y, mo, d, h, mi).getTime();
  const both = (/** @type {number} */ ts, /** @type {string} */ want) => {
    expect(timeAgo(ts)).toBe(want);
    expect(relativeDate(ts)).toBe(want);
  };

  it('23:00 the day before yesterday is "2 days ago" at 08:00; yesterday is "1 day ago"; under a day is hours', () => {
    vi.setSystemTime(at(2026, 10, 4, 8, 0));          // Wednesday 08:00
    both(at(2026, 10, 2, 23, 0), '2 days ago');         // Monday 23:00, 33 hours
    both(at(2026, 10, 3, 7, 0), '1 day ago');           // Tuesday 07:00, 25 hours
    both(at(2026, 10, 3, 23, 0), '9 hr ago');
  });

  it('the day DST ended, 2026-11-01: 00:30, 01:30 and 23:30', () => {
    vi.setSystemTime(at(2026, 10, 1, 0, 30));
    both(at(2026, 9, 30, 23, 30), '2 days ago');        // Friday 23:30: 25 hours, two midnights
    vi.setSystemTime(at(2026, 10, 1, 1, 30));
    both(at(2026, 9, 31, 1, 0), '1 day ago');
    // 23:30: Saturday 00:15 is 48 h 15 min back (the repeated hour), which 24-hour blocks called "2 days ago".
    vi.setSystemTime(at(2026, 10, 1, 23, 30));
    both(at(2026, 9, 31, 0, 15), '1 day ago');
    expect(calendarDaysAgo(at(2026, 9, 31, 0, 15), Date.now())).toBe(1);
  });

  it('the spring gap, 2027-03-14: 01:59 and 03:00', () => {
    vi.setSystemTime(at(2027, 2, 14, 1, 59));
    both(at(2027, 2, 13, 1, 0), '1 day ago');
    vi.setSystemTime(at(2027, 2, 14, 3, 0));
    both(at(2027, 2, 12, 3, 30), '2 days ago');         // 46 h 30 min in Denver (the lost hour): still two days
    expect(calendarDaysAgo(at(2027, 2, 13, 0, 0), Date.now())).toBe(1);
  });

  it('New Year: 2026-12-31 23:30 and 2027-01-01 00:30', () => {
    vi.setSystemTime(at(2026, 11, 31, 23, 30));
    both(at(2026, 11, 30, 22, 0), '1 day ago');
    vi.setSystemTime(at(2027, 0, 1, 0, 30));
    both(at(2026, 11, 30, 23, 30), '2 days ago');
    both(at(2026, 11, 25, 12, 0), '1 week ago');        // 7 calendar days, last year: still relative
  });

  it('a leap day counts: 2028-02-29 and the day after', () => {
    vi.setSystemTime(at(2028, 1, 29, 12, 0));
    both(at(2028, 1, 28, 9, 0), '1 day ago');
    vi.setSystemTime(at(2028, 2, 1, 8, 0));
    both(at(2028, 1, 28, 20, 0), '2 days ago');         // 36 hours, Feb 29 between
  });

  it('00:05 on the 1st and an evening (18:00-23:59, the UTC date already tomorrow in the Americas)', () => {
    vi.setSystemTime(at(2026, 11, 1, 0, 5));
    both(at(2026, 10, 29, 23, 0), '2 days ago');
    vi.setSystemTime(at(2026, 10, 4, 18, 30));
    both(at(2026, 10, 2, 19, 0), '2 days ago');         // 47 h 30 min
    both(at(2026, 10, 3, 23, 50), '18 hr ago');
  });
});
