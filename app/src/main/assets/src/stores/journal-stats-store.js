/* ═══════════════════════════════════════════════════════════════
   JOURNAL STATS STORE — streaks + milestones
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
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

function _jrnDateStr(ts) {
  var d = ts ? new Date(ts) : new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function _jrnDaysBetween(d1, d2) {
  // d1, d2 are 'YYYY-MM-DD'. Returns whole-day delta (d2 - d1).
  var a = new Date(d1 + 'T00:00:00');
  var b = new Date(d2 + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

var MILESTONE_DEFS = [
  { key: 'first',        type: 'entries', threshold: 1,    label: 'First entry' },
  { key: 'entries-10',   type: 'entries', threshold: 10,   label: '10 entries' },
  { key: 'entries-30',   type: 'entries', threshold: 30,   label: '30 entries' },
  { key: 'entries-100',  type: 'entries', threshold: 100,  label: '100 entries' },
  { key: 'streak-7',     type: 'streak',  threshold: 7,    label: '7-day streak' },
  { key: 'streak-30',    type: 'streak',  threshold: 30,   label: '30-day streak' },
  { key: 'streak-100',   type: 'streak',  threshold: 100,  label: '100-day streak' }
];

var JournalStatsStore = Object.assign(CachedStore('vot-journal-stats', {
  totalEntries: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastEntryDate: null,
  milestonesUnlocked: []
}), {
  get() { return this._load(); },

  /* Returns the milestone defs in a fixed order, with `unlocked` flag. */
  milestones() {
    var data = this._load();
    var u = data.milestonesUnlocked || [];
    return MILESTONE_DEFS.map(function(m) {
      return { key: m.key, label: m.label, unlocked: u.indexOf(m.key) >= 0 };
    });
  },

  unlockedMilestones() {
    return this.milestones().filter(function(m) { return m.unlocked; });
  },

  /* Called when a new entry is created (NOT on edits). Increments total,
     updates streak if it's a new calendar day, checks milestones, and
     returns the list of newly-unlocked milestones (for toast display). */
  recordNewEntry(ts) {
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

  /* Called on app load. If the user has missed a day, breaks the streak.
     Pure read; only writes when the streak state actually changes. */
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

  /* Decrement total + check if the user's last entry was on a different
     day — used when an entry is deleted. We don't try to recompute the
     streak history exactly (that would need walking every entry); we
     just bump total down. The streak field stays as-is. */
  recordDeletion() {
    var data = this._load();
    data.totalEntries = Math.max(0, (data.totalEntries || 0) - 1);
    this._save();
  },

  _checkMilestones(data) {
    var u = data.milestonesUnlocked || (data.milestonesUnlocked = []);
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
});

/* Run once on page load: break the streak if the user skipped a day. */
JournalStatsStore.recomputeFromLoad();

/* Toast helper — pop a small in-app toast at the top of the screen when
   a milestone unlocks. The element is auto-created on first use. */
function jrnShowMilestoneToast(milestone) {
  if (!milestone) return;
  var toast = document.getElementById('jrn-milestone-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'jrn-milestone-toast';
    toast.className = 'jrn-milestone-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = '<span style="font-size:14px">✦</span><span>Milestone: ' + (milestone.label || milestone.key) + '</span>';
  toast.classList.add('show');
  clearTimeout(jrnShowMilestoneToast._t);
  jrnShowMilestoneToast._t = setTimeout(function() { toast.classList.remove('show'); }, 3000);
}
