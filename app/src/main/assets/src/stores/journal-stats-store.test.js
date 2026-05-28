/* W2 Tier 2 — JournalStatsStore streak + milestones regression tests.
   ────────────────────────────────────────────────────────────────────
   JournalStatsStore tracks totalEntries + currentStreak + longestStreak
   + lastEntryDate + milestonesUnlocked. The streak math is calendar-
   day-based (local timezone, YYYY-MM-DD), and the milestone unlock
   flow is fire-once-per-key.

   Silent-failure modes this suite guards:
     - Same-day double entry advancing the streak (would inflate longest).
     - Two-day gap not breaking the streak (would lie to the user).
     - longestStreak shrinking when currentStreak resets (would lose history).
     - Duplicate milestone firings (would spam toasts on every save).
     - recomputeFromLoad breaking a streak that's still alive (today vs
       yesterday — delta is 0 or 1, not >=2).
     - recordDeletion underflowing totalEntries below 0.

   All cases use `_resetForTests({ forceLoaded: true })` so the IDB
   state machine is bypassed — the store behaves exactly as the LS-only
   path with `_load()` reading via localStorage. This matches the
   conventions established in note-store.test.js / link-store.test.js.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import {
  JournalStatsStore,
  MILESTONE_DEFS,
  _jrnDateStr,
  _jrnDaysBetween,
} from './journal-stats-store.js';

beforeEach(() => {
  localStorage.clear();
  JournalStatsStore._resetForTests({ forceLoaded: true });
});

/** Build a Date at local noon for (year, month, day) — month is
 *  the 1-based calendar month (Jan=1) so the test reads naturally.
 *  Returns the epoch ms. */
function _ts(year, calMonth, day, hour = 12) {
  return new Date(year, calMonth - 1, day, hour, 0, 0, 0).getTime();
}

/** Build a timestamp `dayOffset` days from today, at local noon. Used
 *  to anchor streak tests to "today" so the module-level
 *  recomputeFromLoad subscriber (which fires on every _bump and uses
 *  the REAL today date) doesn't clobber the streak by interpreting
 *  the seeded lastEntryDate as ancient history. dayOffset=0 → today,
 *  dayOffset=-1 → yesterday, dayOffset=-3 → three days ago, etc. */
function _tsRelative(dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

describe('JournalStatsStore — date helpers', () => {
  it('_jrnDateStr formats an epoch as YYYY-MM-DD (local)', () => {
    const ts = _ts(2026, 3, 7, 10);
    expect(_jrnDateStr(ts)).toBe('2026-03-07');
  });

  it('_jrnDateStr pads single-digit month/day', () => {
    expect(_jrnDateStr(_ts(2026, 1, 5))).toBe('2026-01-05');
    expect(_jrnDateStr(_ts(2026, 12, 31))).toBe('2026-12-31');
  });

  it('_jrnDaysBetween returns positive for forward delta', () => {
    expect(_jrnDaysBetween('2026-03-07', '2026-03-08')).toBe(1);
    expect(_jrnDaysBetween('2026-03-07', '2026-03-10')).toBe(3);
  });

  it('_jrnDaysBetween returns 0 for same day', () => {
    expect(_jrnDaysBetween('2026-03-07', '2026-03-07')).toBe(0);
  });

  it('_jrnDaysBetween returns negative for backward delta', () => {
    expect(_jrnDaysBetween('2026-03-10', '2026-03-07')).toBe(-3);
  });
});

describe('JournalStatsStore — recordNewEntry (streak math)', () => {
  // ── Module-level recomputeFromLoad subscriber caveat ──
  // journal-stats-store.js registers a module-level subscriber that
  // fires on every _bump() and calls recomputeFromLoad() — which
  // compares lastEntryDate against the REAL today's date. If we seed
  // a stale historical date (e.g. _ts(2026, 3, 7) when today is May
  // 27, 2026), the subscriber immediately clobbers the streak to 0.
  //
  // The fix: use timestamps RELATIVE to today via `_tsRelative(offset)`.
  // dayOffset=0 → today; dayOffset=-1 → yesterday. recomputeFromLoad
  // sees delta ∈ {0,1} → no-op, streak survives. This matches
  // production behavior: the recompute subscriber's job is to break
  // the streak when the user skipped a day in real time, NOT to
  // contradict in-progress writes from the current session.

  it('first entry sets total=1, currentStreak=1, longestStreak=1', () => {
    JournalStatsStore.recordNewEntry(_tsRelative(0));

    const stats = JournalStatsStore.get();
    expect(stats.totalEntries).toBe(1);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(1);
    expect(typeof stats.lastEntryDate).toBe('string');
  });

  it('same-day double entry keeps streak at 1, total at 2', () => {
    // Same calendar day — both calls map to _jrnDateStr() of today.
    JournalStatsStore.recordNewEntry(_tsRelative(0));
    JournalStatsStore.recordNewEntry(_tsRelative(0));

    const stats = JournalStatsStore.get();
    expect(stats.totalEntries).toBe(2);
    expect(stats.currentStreak).toBe(1);     // streak NOT advanced
    expect(stats.longestStreak).toBe(1);
  });

  it('consecutive day increments streak (delta=1 path)', () => {
    // Yesterday → today: delta=1, streak advances.
    JournalStatsStore.recordNewEntry(_tsRelative(-1));
    JournalStatsStore.recordNewEntry(_tsRelative(0));

    const stats = JournalStatsStore.get();
    expect(stats.totalEntries).toBe(2);
    expect(stats.currentStreak).toBe(2);
    expect(stats.longestStreak).toBe(2);
  });

  it('three consecutive days → streak=3 (-2, -1, 0)', () => {
    JournalStatsStore.recordNewEntry(_tsRelative(-2));
    JournalStatsStore.recordNewEntry(_tsRelative(-1));
    JournalStatsStore.recordNewEntry(_tsRelative(0));

    const stats = JournalStatsStore.get();
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
  });

  it('gap of 2+ days resets streak to 1, total still increments', () => {
    // -3 then 0 = 3-day gap (skipped -2 and -1) → reset to 1.
    JournalStatsStore.recordNewEntry(_tsRelative(-3));
    // The first recordNewEntry's _bump triggers the module-level
    // recomputeFromLoad, which sees delta=3 (lastEntryDate=-3 vs
    // today=0) and breaks the streak to 0. Then we record the second
    // entry. recordNewEntry sees lastEntryDate=-3, delta=3 → reset
    // currentStreak=1. Total=2.
    JournalStatsStore.recordNewEntry(_tsRelative(0));

    const stats = JournalStatsStore.get();
    expect(stats.totalEntries).toBe(2);
    expect(stats.currentStreak).toBe(1);   // reset
    expect(stats.longestStreak).toBe(1);   // never went higher
  });

  it('longestStreak only grows — never shrinks when currentStreak resets', () => {
    // Build a 3-day streak ending today.
    JournalStatsStore.recordNewEntry(_tsRelative(-2));
    JournalStatsStore.recordNewEntry(_tsRelative(-1));
    JournalStatsStore.recordNewEntry(_tsRelative(0));
    expect(JournalStatsStore.get().longestStreak).toBe(3);

    // Direct cache poke to simulate a future re-entry that skipped
    // multiple days. (Going via _tsRelative with a positive offset
    // would land "tomorrow" — recompute would treat that as the
    // future, fine, but we want to also assert the streak-RESET
    // path which only fires when lastEntryDate has a delta >=2 from
    // the entry ts. Easiest: manipulate the stored lastEntryDate
    // to be "today" then record a new entry 3 days from now.)
    //
    // Simpler equivalent: poke lastEntryDate to be 5 days ago, then
    // call recordNewEntry today → gap=5 → reset to 1.
    const data = JournalStatsStore._load();
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    data.lastEntryDate = _jrnDateStr(fiveDaysAgo.getTime());
    JournalStatsStore._save();

    JournalStatsStore.recordNewEntry(_tsRelative(0));
    const stats = JournalStatsStore.get();
    expect(stats.currentStreak).toBe(1);    // reset (5-day gap)
    expect(stats.longestStreak).toBe(3);    // preserved
  });

  it('longestStreak advances when a new streak exceeds it', () => {
    // Build a 2-day streak via direct manipulation, then add a new
    // entry that takes the streak to 3.
    const data = JournalStatsStore._load();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    data.totalEntries = 2;
    data.currentStreak = 2;
    data.longestStreak = 2;
    data.lastEntryDate = _jrnDateStr(yesterday.getTime());
    JournalStatsStore._save();

    // Today: delta=1 → currentStreak advances to 3, longestStreak
    // advances to 3.
    JournalStatsStore.recordNewEntry(_tsRelative(0));
    const stats = JournalStatsStore.get();
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);    // advanced
  });
});

describe('JournalStatsStore — recordNewEntry (milestone flow)', () => {
  it('returns the "first" milestone def on the first entry', () => {
    const unlocked = JournalStatsStore.recordNewEntry(_tsRelative(0));
    expect(unlocked.length).toBe(1);
    expect(unlocked[0].key).toBe('first');
  });

  it('does NOT re-fire the "first" milestone on the second entry', () => {
    JournalStatsStore.recordNewEntry(_tsRelative(-1));
    const unlocked2 = JournalStatsStore.recordNewEntry(_tsRelative(0));
    // Second call: streak=2, total=2 — no milestone (entries-10 needs
    // 10 total, streak-7 needs 7).
    expect(unlocked2).toEqual([]);
  });

  it('persists milestonesUnlocked across calls (no duplicate keys)', () => {
    JournalStatsStore.recordNewEntry(_tsRelative(-1));
    JournalStatsStore.recordNewEntry(_tsRelative(0));
    const stats = JournalStatsStore.get();
    expect(stats.milestonesUnlocked).toEqual(['first']);  // only once
  });

  it('fires entries-10 milestone at total=10', () => {
    // Seed totalEntries=9 and streak state so the next record bumps
    // total to 10 without also incidentally hitting streak-7. (The
    // 10-call loop would consume 10 days of real-time offsets, but
    // we can short-circuit by direct manipulation.)
    const data = JournalStatsStore._load();
    data.totalEntries = 9;
    data.currentStreak = 1;       // below streak-7 threshold
    data.longestStreak = 1;
    data.lastEntryDate = _jrnDateStr(_tsRelative(-1));
    data.milestonesUnlocked = ['first'];
    JournalStatsStore._save();

    // Today: total=10, streak=2 → only entries-10 unlocks.
    const unlocked = JournalStatsStore.recordNewEntry(_tsRelative(0));
    const keys = unlocked.map(m => m.key);
    expect(keys).toContain('entries-10');
    expect(keys).not.toContain('streak-7');
  });

  it('fires streak-7 milestone at currentStreak=7', () => {
    // Seed currentStreak=6 with lastEntryDate yesterday so today's
    // entry advances streak to 7.
    const data = JournalStatsStore._load();
    data.totalEntries = 6;
    data.currentStreak = 6;
    data.longestStreak = 6;
    data.lastEntryDate = _jrnDateStr(_tsRelative(-1));
    data.milestonesUnlocked = ['first'];
    JournalStatsStore._save();

    const unlocked = JournalStatsStore.recordNewEntry(_tsRelative(0));
    const keys = unlocked.map(m => m.key);
    expect(keys).toContain('streak-7');
  });

  it('returned milestone defs match MILESTONE_DEFS shape', () => {
    const unlocked = JournalStatsStore.recordNewEntry(_tsRelative(0));
    expect(unlocked[0].key).toBe('first');
    expect(unlocked[0].type).toBe('entries');
    expect(unlocked[0].threshold).toBe(1);
    expect(unlocked[0].label).toBe('First entry');
  });
});

describe('JournalStatsStore — milestones() and unlockedMilestones()', () => {
  it('milestones() returns every def with unlocked=false on fresh state', () => {
    const list = JournalStatsStore.milestones();
    expect(list.length).toBe(MILESTONE_DEFS.length);
    for (const m of list) {
      expect(m.unlocked).toBe(false);
    }
  });

  it('milestones() reflects unlocked state after entries', () => {
    JournalStatsStore.recordNewEntry(_tsRelative(0));
    const list = JournalStatsStore.milestones();
    const first = list.find(m => m.key === 'first');
    expect(first.unlocked).toBe(true);
    const ten = list.find(m => m.key === 'entries-10');
    expect(ten.unlocked).toBe(false);
  });

  it('unlockedMilestones() returns only the unlocked ones', () => {
    expect(JournalStatsStore.unlockedMilestones()).toEqual([]);
    JournalStatsStore.recordNewEntry(_tsRelative(0));
    const unlocked = JournalStatsStore.unlockedMilestones();
    expect(unlocked.length).toBe(1);
    expect(unlocked[0].key).toBe('first');
    expect(unlocked[0].unlocked).toBe(true);
  });
});

describe('JournalStatsStore — recomputeFromLoad', () => {
  it('is a no-op when lastEntryDate is null (fresh state)', () => {
    const before = JournalStatsStore.get();
    JournalStatsStore.recomputeFromLoad();
    const after = JournalStatsStore.get();
    expect(after.currentStreak).toBe(before.currentStreak);
    expect(after.lastEntryDate).toBe(null);
  });

  it('does NOT touch streak when last entry was today (delta=0)', () => {
    // Seed: pretend the user journaled today.
    const data = JournalStatsStore._load();
    data.totalEntries = 5;
    data.currentStreak = 5;
    data.longestStreak = 5;
    data.lastEntryDate = _jrnDateStr();  // today
    JournalStatsStore._save();

    JournalStatsStore.recomputeFromLoad();

    const after = JournalStatsStore.get();
    expect(after.currentStreak).toBe(5);  // untouched
  });

  it('does NOT touch streak when last entry was yesterday (delta=1)', () => {
    // Build "yesterday" by subtracting 1 day from today.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = _jrnDateStr(yesterday.getTime());

    const data = JournalStatsStore._load();
    data.totalEntries = 5;
    data.currentStreak = 5;
    data.longestStreak = 5;
    data.lastEntryDate = yStr;
    JournalStatsStore._save();

    JournalStatsStore.recomputeFromLoad();

    const after = JournalStatsStore.get();
    expect(after.currentStreak).toBe(5);
    expect(after.lastEntryDate).toBe(yStr);
  });

  it('breaks streak (sets to 0) when delta >= 2 days', () => {
    // Seed last entry as 3 days ago.
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const stale = _jrnDateStr(threeDaysAgo.getTime());

    const data = JournalStatsStore._load();
    data.totalEntries = 5;
    data.currentStreak = 5;
    data.longestStreak = 5;
    data.lastEntryDate = stale;
    JournalStatsStore._save();

    JournalStatsStore.recomputeFromLoad();

    const after = JournalStatsStore.get();
    expect(after.currentStreak).toBe(0);    // broken
    expect(after.longestStreak).toBe(5);    // preserved
    expect(after.totalEntries).toBe(5);     // preserved
    expect(after.lastEntryDate).toBe(stale); // unchanged
  });

  it('is a no-op when currentStreak is already 0 (no double-write)', () => {
    // Seed an already-broken streak >2 days ago. recomputeFromLoad's
    // gate is `delta >= 2 && currentStreak > 0`, so this should NOT
    // touch the store.
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const stale = _jrnDateStr(fiveDaysAgo.getTime());

    const data = JournalStatsStore._load();
    data.totalEntries = 5;
    data.currentStreak = 0;  // already broken
    data.longestStreak = 5;
    data.lastEntryDate = stale;
    JournalStatsStore._save();

    JournalStatsStore.recomputeFromLoad();

    const after = JournalStatsStore.get();
    expect(after.currentStreak).toBe(0);
    expect(after.longestStreak).toBe(5);
  });
});

describe('JournalStatsStore — recordDeletion', () => {
  it('decrements totalEntries', () => {
    JournalStatsStore.recordNewEntry(_tsRelative(-1));
    JournalStatsStore.recordNewEntry(_tsRelative(0));
    expect(JournalStatsStore.get().totalEntries).toBe(2);

    JournalStatsStore.recordDeletion();
    expect(JournalStatsStore.get().totalEntries).toBe(1);
  });

  it('never goes below 0 (Math.max guard)', () => {
    // Fresh state — totalEntries already 0.
    JournalStatsStore.recordDeletion();
    expect(JournalStatsStore.get().totalEntries).toBe(0);

    JournalStatsStore.recordDeletion();
    expect(JournalStatsStore.get().totalEntries).toBe(0);
  });

  it('does NOT touch streak fields (deletion is total-only)', () => {
    JournalStatsStore.recordNewEntry(_tsRelative(-1));
    JournalStatsStore.recordNewEntry(_tsRelative(0));
    const beforeStreak = JournalStatsStore.get().currentStreak;
    const beforeLast = JournalStatsStore.get().lastEntryDate;

    JournalStatsStore.recordDeletion();

    const after = JournalStatsStore.get();
    expect(after.currentStreak).toBe(beforeStreak);
    expect(after.lastEntryDate).toBe(beforeLast);
  });
});

describe('JournalStatsStore — replaceAll (import path)', () => {
  it('replaces the whole stats object', () => {
    // Use today's date for lastEntryDate so the module-level
    // recomputeFromLoad subscriber doesn't immediately clobber the
    // streak (it fires on the _bump from replaceAll's _save). A stale
    // date would trigger delta >= 2 → currentStreak = 0.
    const today = _jrnDateStr(_tsRelative(0));
    JournalStatsStore.replaceAll({
      totalEntries: 42,
      currentStreak: 7,
      longestStreak: 100,
      lastEntryDate: today,
      milestonesUnlocked: ['first', 'entries-10'],
    });

    const after = JournalStatsStore.get();
    expect(after.totalEntries).toBe(42);
    expect(after.currentStreak).toBe(7);
    expect(after.longestStreak).toBe(100);
    expect(after.lastEntryDate).toBe(today);
    expect(after.milestonesUnlocked).toEqual(['first', 'entries-10']);
  });

  it('fills missing fields with defaults from a partial payload', () => {
    JournalStatsStore.replaceAll({ totalEntries: 5 });

    const after = JournalStatsStore.get();
    expect(after.totalEntries).toBe(5);
    expect(after.currentStreak).toBe(0);
    expect(after.longestStreak).toBe(0);
    expect(after.lastEntryDate).toBe(null);
    expect(after.milestonesUnlocked).toEqual([]);
  });

  it('handles null gracefully (resets to defaults)', () => {
    // First populate.
    JournalStatsStore.recordNewEntry(_tsRelative(0));
    expect(JournalStatsStore.get().totalEntries).toBe(1);

    // Now replace with null — defaults take over.
    JournalStatsStore.replaceAll(null);

    const after = JournalStatsStore.get();
    expect(after.totalEntries).toBe(0);
    expect(after.currentStreak).toBe(0);
    expect(after.lastEntryDate).toBe(null);
  });

  it('rejects an array (treats as malformed → defaults)', () => {
    JournalStatsStore.replaceAll(/** @type {any} */ ([1, 2, 3]));

    const after = JournalStatsStore.get();
    expect(after.totalEntries).toBe(0);
    expect(after.milestonesUnlocked).toEqual([]);
  });
});
