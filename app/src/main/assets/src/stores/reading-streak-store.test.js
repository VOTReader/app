/* ReadingStreakStore — days-reading streak regression tests.
   ────────────────────────────────────────────────────────────────────
   Mirrors journal-stats-store.test.js conventions: `_resetForTests(
   { forceLoaded: true })` bypasses the IDB state machine, and streak
   seeds use timestamps RELATIVE to today (`_tsRelative`) so the
   module-level recomputeFromLoad subscriber (which compares against
   the REAL today) never clobbers a seeded streak mid-test.

   Silent-failure modes guarded:
     - Same-day repeat commits advancing the streak (dwell fires once
       per screen visit — many per day).
     - A skipped day not resetting the streak.
     - longestStreak shrinking on reset.
     - recomputeFromLoad breaking a still-alive streak (lastReadDate
       is yesterday → delta 1 → intact).
     - replaceAll (import path) not defaulting missing fields.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { ReadingStreakStore } from './reading-streak-store.js';

beforeEach(() => {
  localStorage.clear();
  ReadingStreakStore._resetForTests({ forceLoaded: true });
});

/** Timestamp `dayOffset` days from today, local noon. */
function _tsRelative(dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

describe('ReadingStreakStore — recordReadingDay', () => {
  it('first reading day sets streak=1, totalDays=1', () => {
    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    const s = ReadingStreakStore.get();
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(1);
    expect(s.totalDays).toBe(1);
    expect(typeof s.lastReadDate).toBe('string');
  });

  it('same-day repeat commits are no-ops (streak and totalDays unchanged)', () => {
    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    const v = ReadingStreakStore.getVersion();
    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    const s = ReadingStreakStore.get();
    expect(s.currentStreak).toBe(1);
    expect(s.totalDays).toBe(1);
    // no write, no version bump — subscribers aren't spammed per commit
    expect(ReadingStreakStore.getVersion()).toBe(v);
  });

  it('consecutive day advances the streak', () => {
    ReadingStreakStore.recordReadingDay(_tsRelative(-1));
    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    const s = ReadingStreakStore.get();
    expect(s.currentStreak).toBe(2);
    expect(s.longestStreak).toBe(2);
    expect(s.totalDays).toBe(2);
  });

  it('a skipped day resets the streak to 1', () => {
    // -3 then 0 = 3-day gap. (The module-level recompute subscriber may
    // break the streak to 0 between the calls — either way the second
    // record sees delta=3 and lands at 1.)
    ReadingStreakStore.recordReadingDay(_tsRelative(-3));
    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    const s = ReadingStreakStore.get();
    expect(s.currentStreak).toBe(1);
    expect(s.totalDays).toBe(2);
  });

  it('longestStreak only grows — preserved across a reset', () => {
    // Build a 2-day streak ending today, then poke lastReadDate back
    // 5 days (journal-stats test idiom — a relative seed with a big
    // delta would be clobbered by the recompute subscriber) and record
    // again: gap of 5 → current resets to 1, longest keeps 2.
    ReadingStreakStore.recordReadingDay(_tsRelative(-1));
    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    expect(ReadingStreakStore.get().longestStreak).toBe(2);

    const data = ReadingStreakStore._load();
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    data.lastReadDate = fiveDaysAgo.getFullYear() + '-' +
      String(fiveDaysAgo.getMonth() + 1).padStart(2, '0') + '-' +
      String(fiveDaysAgo.getDate()).padStart(2, '0');
    ReadingStreakStore._save();

    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    const s = ReadingStreakStore.get();
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(2);
  });
});

describe('ReadingStreakStore — recomputeFromLoad', () => {
  it('keeps a streak alive when lastReadDate is yesterday', () => {
    ReadingStreakStore.recordReadingDay(_tsRelative(-2));
    ReadingStreakStore.recordReadingDay(_tsRelative(-1));
    ReadingStreakStore.recomputeFromLoad();
    expect(ReadingStreakStore.get().currentStreak).toBe(2);
  });

  it('breaks the streak after a missed full day (delta >= 2)', () => {
    ReadingStreakStore.recordReadingDay(_tsRelative(-3));
    // Seed lastReadDate 3 days back by directly recording then recomputing.
    ReadingStreakStore.recomputeFromLoad();
    const s = ReadingStreakStore.get();
    expect(s.currentStreak).toBe(0);
    expect(s.longestStreak).toBe(1); // history kept
  });

  it('is a pure read when nothing was ever recorded', () => {
    const before = ReadingStreakStore.getVersion();
    const s = ReadingStreakStore.recomputeFromLoad();
    expect(s.currentStreak).toBe(0);
    expect(ReadingStreakStore.getVersion()).toBe(before);
  });
});

describe('ReadingStreakStore — replaceAll (import path)', () => {
  it('replaces wholesale and defaults missing fields', () => {
    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    ReadingStreakStore.replaceAll({ currentStreak: 7 });
    const s = ReadingStreakStore.get();
    expect(s.currentStreak).toBe(7);
    expect(s.longestStreak).toBe(0);
    expect(s.lastReadDate).toBe(null);
    expect(s.totalDays).toBe(0);
  });

  it('tolerates null / non-object payloads', () => {
    ReadingStreakStore.recordReadingDay(_tsRelative(0));
    ReadingStreakStore.replaceAll(null);
    expect(ReadingStreakStore.get().currentStreak).toBe(0);
  });
});
