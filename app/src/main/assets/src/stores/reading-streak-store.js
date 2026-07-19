/* ═══════════════════════════════════════════════════════════════
   READING STREAK STORE — consecutive days of reading
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore.

   Tracks the "days reading" streak shown on the My Progress
   dashboard. A "reading day" is any calendar day on which at least
   one dwell commit fired (use-reading-dwell.js — the user actually
   sat on a reading screen past the dwell threshold). Manual
   mark-as-read toggles do NOT count; only real reading time does.

   Tracks:
     - currentStreak: consecutive days with at least 1 reading dwell
     - longestStreak: best streak ever achieved
     - lastReadDate: ISO local-timezone date (YYYY-MM-DD) of the most
                     recent reading day
     - totalDays: cumulative count of distinct reading days ever

   Streak semantics (mirrors JournalStatsStore):
     - "Day" = local-timezone calendar date (YYYY-MM-DD)
     - Streak +1 when the new reading day is exactly one calendar day
       after lastReadDate. Same-day commits are no-ops.
     - Streak resets to 1 when a day was skipped.
     - On app load (recomputeFromLoad), if today is 2+ days past
       lastReadDate the streak is broken (set to 0) — reading today
       restarts it at 1.
═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';
import { _jrnDateStr, _jrnDaysBetween } from './journal-stats-store.js';

/**
 * On-disk shape.
 *
 * @typedef {{
 *   currentStreak: number,
 *   longestStreak: number,
 *   lastReadDate: string | null,
 *   totalDays: number
 * }} ReadingStreakData
 */

export var ReadingStreakStore = extendStore(
  CachedStore('vot-reading-streak', /** @type {ReadingStreakData} */ ({
    currentStreak: 0,
    longestStreak: 0,
    lastReadDate: null,
    totalDays: 0
  }), { idb: true }),
  {
    /**
     * Read the full streak object.
     * @returns {ReadingStreakData}
     */
    get() { return this._load(); },

    /**
     * Record that reading happened now. Same-day calls after the first
     * are no-ops (no write). Advances the streak on a consecutive day,
     * resets it to 1 after a gap.
     *
     * @param {number} [ts]  epoch ms (defaults to Date.now())
     * @returns {void}
     */
    recordReadingDay(ts) {
      if (this._shouldDefer('recordReadingDay', ts)) return;
      var data = this._load();
      var today = _jrnDateStr(ts);
      if (data.lastReadDate === today) return; // same-day — nothing to do
      if (!data.lastReadDate) {
        data.currentStreak = 1;
      } else {
        var delta = _jrnDaysBetween(data.lastReadDate, today);
        if (delta === 1) {
          data.currentStreak = (data.currentStreak || 0) + 1;
        } else {
          data.currentStreak = 1;
        }
      }
      data.lastReadDate = today;
      data.totalDays = (data.totalDays || 0) + 1;
      if (data.currentStreak > (data.longestStreak || 0)) {
        data.longestStreak = data.currentStreak;
      }
      this._save();
      this._bump();
    },

    /**
     * Called on app load (and on Progress-screen mount). Breaks the
     * streak if the user missed a full day (today - lastReadDate >= 2).
     * Pure read otherwise; only writes when the streak actually breaks.
     *
     * @returns {ReadingStreakData}
     */
    recomputeFromLoad() {
      var data = this._load();
      if (!data.lastReadDate) return data;
      var today = _jrnDateStr();
      var delta = _jrnDaysBetween(data.lastReadDate, today);
      if (delta >= 2 && data.currentStreak > 0) {
        data.currentStreak = 0;
        this._save();
        this._bump();
      }
      return data;
    },

    /**
     * Replace the entire streak object (import path). Defaults fill in
     * any missing fields so a partial payload doesn't break readers.
     * @param {Partial<ReadingStreakData> | null | undefined} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      var d = (data && typeof data === 'object' && !Array.isArray(data)) ? data : /** @type {any} */ ({});
      this._cache = /** @type {any} */ ({
        currentStreak: d.currentStreak || 0,
        longestStreak: d.longestStreak || 0,
        lastReadDate: d.lastReadDate || null,
        totalDays: d.totalDays || 0
      });
      this._save();
      this._bump();
    }
  }
);

/* Run once on page load: break the streak if the user skipped a day.
   Same IDB-mode caveat + one-shot re-run wiring as JournalStatsStore:
   at module-load the store is 'pending' (empty defaults, early exit);
   the subscriber re-runs the recompute once real data hydrates. */
ReadingStreakStore.recomputeFromLoad();
(function () {
  if (!ReadingStreakStore._idb) return;
  var unsub = ReadingStreakStore.subscribe(function () {
    if (ReadingStreakStore.getState() === 'loaded') {
      ReadingStreakStore.recomputeFromLoad();
      try { unsub(); } catch (_e) { /* idempotent */ }
    }
  });
})();
