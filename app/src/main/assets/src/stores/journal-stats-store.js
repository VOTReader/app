/* ═══════════════════════════════════════════════════════════════
   JOURNAL STATS STORE — streaks + milestones
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (defined earlier in main script block).

   Tracks:
     - totalEntries: cumulative count of entries ever created
     - currentStreak: consecutive days with at least 1 entry created
     - longestStreak: best streak ever achieved
     - lastEntryDate: ISO date string (timezone-local) of most recent entry
     - milestonesUnlocked: list of unlocked milestone keys

   Streak semantics:
     - "Day" = local-timezone calendar date (YYYY-MM-DD)
     - Streak +1 if the new entry's date is exactly one calendar day after
       lastEntryDate. Same-day entries don't advance the streak.
     - Streak resets to 1 if a day was skipped.
     - On app load (recomputeFromLoad), if today is later than
       lastEntryDate + 1 day, streak is broken (set to 0) — so the hub
       shows "Streak broken, journal today to restart" honestly.

   Milestones (v1 set):
     first      — first entry ever
     entries-10 — 10 total entries
     entries-30 — 30 total
     entries-100 — 100 total
     streak-7   — 7-day streak
     streak-30  — 30-day streak
     streak-100 — 100-day streak
═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';
import { showToast } from '../utils/toast.js';

/**
 * On-disk shape.
 *
 * @typedef {{
 *   totalEntries: number,
 *   currentStreak: number,
 *   longestStreak: number,
 *   lastEntryDate: string | null,
 *   milestonesUnlocked: string[]
 * }} JournalStatsData
 */

/**
 * @typedef {{
 *   key: string,
 *   type: 'entries' | 'streak',
 *   threshold: number,
 *   label: string
 * }} MilestoneDef
 */

/**
 * Format a timestamp (or now) as a local-timezone date string
 * (YYYY-MM-DD). Used by the streak logic to compare calendar days
 * regardless of clock time within a day.
 *
 * @param {number | undefined} [ts]  defaults to Date.now()
 * @returns {string}
 */
export function _jrnDateStr(ts) {
  var d = ts ? new Date(ts) : new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * Whole-day delta between two YYYY-MM-DD dates (d2 - d1). Negative
 * when d2 precedes d1. Uses local-midnight anchors so timezone DST
 * shifts don't off-by-one the result.
 *
 * @param {string} d1
 * @param {string} d2
 * @returns {number}
 */
export function _jrnDaysBetween(d1, d2) {
  var a = new Date(d1 + 'T00:00:00');
  var b = new Date(d2 + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Milestone definitions, evaluated in order. @type {MilestoneDef[]} */
export var MILESTONE_DEFS = [
  { key: 'first',        type: 'entries', threshold: 1,    label: 'First entry' },
  { key: 'entries-10',   type: 'entries', threshold: 10,   label: '10 entries' },
  { key: 'entries-30',   type: 'entries', threshold: 30,   label: '30 entries' },
  { key: 'entries-100',  type: 'entries', threshold: 100,  label: '100 entries' },
  { key: 'streak-7',     type: 'streak',  threshold: 7,    label: '7-day streak' },
  { key: 'streak-30',    type: 'streak',  threshold: 30,   label: '30-day streak' },
  { key: 'streak-100',   type: 'streak',  threshold: 100,  label: '100-day streak' }
];

export var JournalStatsStore = extendStore(
  CachedStore('vot-journal-stats', /** @type {JournalStatsData} */ ({
    totalEntries: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastEntryDate: null,
    milestonesUnlocked: []
  }), { idb: true }),
  {
    /**
     * Read the full stats object.
     * @returns {JournalStatsData}
     */
    get() { return this._load(); },

    /**
     * Milestone defs paired with their unlocked flag, in MILESTONE_DEFS order.
     * @returns {{ key: string, label: string, unlocked: boolean }[]}
     */
    milestones() {
      var data = this._load();
      var u = data.milestonesUnlocked || [];
      return MILESTONE_DEFS.map(function(m) {
        return { key: m.key, label: m.label, unlocked: u.indexOf(m.key) >= 0 };
      });
    },

    /**
     * Only milestones the user has unlocked.
     * @returns {{ key: string, label: string, unlocked: boolean }[]}
     */
    unlockedMilestones() {
      return this.milestones().filter(function(m) { return m.unlocked; });
    },

    /**
     * Record a NEW entry (not edits). Increments total, advances streak
     * if it's a new calendar day, checks milestones, returns the newly-
     * unlocked milestones so the caller can fire a toast.
     *
     * @param {number} ts  epoch ms (typically Date.now())
     * @returns {MilestoneDef[]}  newly-unlocked milestones (may be empty)
     */
    recordNewEntry(ts) {
      if (this._shouldDefer('recordNewEntry', ts)) return [];
      var data = this._load();
      var today = _jrnDateStr(ts);
      data.totalEntries = (data.totalEntries || 0) + 1;
      if (!data.lastEntryDate) {
        data.currentStreak = 1;
      } else {
        var delta = _jrnDaysBetween(data.lastEntryDate, today);
        if (delta === 0) {
          // Same-day entry — streak unchanged.
        } else if (delta === 1) {
          data.currentStreak = (data.currentStreak || 0) + 1;
        } else {
          data.currentStreak = 1;
        }
      }
      data.lastEntryDate = today;
      if (data.currentStreak > (data.longestStreak || 0)) {
        data.longestStreak = data.currentStreak;
      }
      var newlyUnlocked = this._checkMilestones(data);
      this._save();
      return newlyUnlocked;
    },

    /**
     * Called on app load. Breaks the streak if the user missed a day
     * (today - lastEntryDate >= 2). Pure read otherwise; only writes
     * when the streak state actually changes.
     *
     * @returns {JournalStatsData}
     */
    recomputeFromLoad() {
      var data = this._load();
      if (!data.lastEntryDate) return data;
      var today = _jrnDateStr();
      var delta = _jrnDaysBetween(data.lastEntryDate, today);
      if (delta >= 2 && data.currentStreak > 0) {
        data.currentStreak = 0;
        this._save();
      }
      return data;
    },

    /**
     * Decrement total on entry deletion. Does NOT recompute streak
     * history (that would require walking every entry); the streak
     * field stays as-is and self-heals on the next recordNewEntry().
     *
     * @returns {void}
     */
    recordDeletion() {
      if (this._shouldDefer('recordDeletion')) return;
      var data = this._load();
      data.totalEntries = Math.max(0, (data.totalEntries || 0) - 1);
      // J5: deleting your LAST entry must clear the live streak — otherwise the
      // hub shows a phantom "N-day streak" with zero entries. A full recompute
      // on every delete would walk all entries; resetting only at the zero
      // boundary is the cheap, correct fix. longestStreak is history — kept.
      if (data.totalEntries === 0) data.currentStreak = 0;
      this._save();
    },

    /**
     * Replace the entire stats object (W2.6 import path). Defaults
     * fill in any missing fields so a partial payload doesn't break
     * downstream readers that expect every field present.
     * @param {Partial<JournalStatsData> | null | undefined} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      var d = (data && typeof data === 'object' && !Array.isArray(data)) ? data : /** @type {any} */ ({});
      this._cache = /** @type {any} */ ({
        totalEntries: d.totalEntries || 0,
        currentStreak: d.currentStreak || 0,
        longestStreak: d.longestStreak || 0,
        lastEntryDate: d.lastEntryDate || null,
        milestonesUnlocked: Array.isArray(d.milestonesUnlocked) ? d.milestonesUnlocked : []
      });
      this._save();
      this._bump();
    },

    /**
     * Check every milestone def against the current stats; add newly-
     * met ones to unlocked. Returns the just-added defs (caller fires
     * toasts).
     *
     * @param {JournalStatsData} data
     * @returns {MilestoneDef[]}
     */
    _checkMilestones(data) {
      var u = data.milestonesUnlocked || (data.milestonesUnlocked = []);
      /** @type {MilestoneDef[]} */
      var newly = [];
      MILESTONE_DEFS.forEach(function(m) {
        if (u.indexOf(m.key) >= 0) return;
        var n = (m.type === 'entries') ? data.totalEntries : data.currentStreak;
        if (n >= m.threshold) {
          u.push(m.key);
          newly.push(m);
        }
      });
      return newly;
    }
  }
);

/* Run once on page load: break the streak if the user skipped a day.
   IDB-mode caveat: at module-load this fires while state is 'pending',
   so _load() returns empty defaults and the function exits early (no
   lastEntryDate, no streak to break). Re-run is wired via a one-shot
   subscriber that fires on the first 'pending' → 'loaded' transition
   so the streak gets recomputed against the real IDB-loaded state. */
JournalStatsStore.recomputeFromLoad();
(function () {
  if (!JournalStatsStore._idb) return;
  var unsub = JournalStatsStore.subscribe(function () {
    if (JournalStatsStore.getState() === 'loaded') {
      JournalStatsStore.recomputeFromLoad();
      try { unsub(); } catch (_e) { /* idempotent */ }
    }
  });
})();

/**
 * Pop a small in-app toast at the top of the screen when a milestone
 * unlocks. Delegates DOM lifecycle to the generic `showToast` utility
 * (W2.6 consolidation); milestone-specific concern is just the HTML
 * payload + the existing `.jrn-milestone-toast` CSS class.
 *
 * @param {MilestoneDef | { label?: string, key?: string } | null | undefined} milestone
 * @returns {void}
 */
export function jrnShowMilestoneToast(milestone) {
  if (!milestone) return;
  showToast({
    id: 'jrn-milestone-toast',
    className: 'jrn-milestone-toast',
    html: '<span style="font-size:14px">✦</span><span>Milestone: ' + (milestone.label || milestone.key) + '</span>',
    durationMs: 3000,
  });
}
