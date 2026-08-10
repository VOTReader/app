// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   achievements — the fleshed-out milestones system (owner directive
   2026-08-09: "lots of different achievements, not just words but chapters
   too and lots of other stuff as well in various ways and timeframes").
   ═══════════════════════════════════════════════════════════════════════
   Two layers, deliberately separated:

     collectAchievementSnapshot(readItems)
        Reads the LIVE stores (all cross-bundle globals, every access
        guarded) into one plain snapshot object. No store is required —
        a missing store simply contributes zeros.

     buildAchievements(snapshot)
        PURE: snapshot in, categorized achievement list out. All
        thresholds live here. Tests exercise this layer with fabricated
        snapshots — no store mocking.

   Everything is computed from data the app ALREADY accrues (the
   reading-stats ledger, streak store, annotation/note/bookmark/link/
   journal stores, the listening library's plays counter). Nothing here
   persists — earned-ness is a fact about the data, recomputed on render.

   ONE ENGINE since 2026-08-10 (owner decision). The ten-row table that used
   to live in reading-stats-store, which My Progress rendered as a strip, is
   now this module's FEATURED subset — see the block above buildAchievements.
   Both surfaces render from one call; the store keeps only the persisted
   ledger that makes a milestone TOAST exactly once, driven from here.

   readItems key space: 'v1:<readKey>:<cid>'. A NUMERIC cid is a Scripture
   chapter (Bible books + Matthew). A slug counts as a public letter/entry
   only when its middle readKey resolves to a public collection; Bible Study
   and Hidden Manna records also use slugs, but are not part of the 729-item
   public recording corpus.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} AchievementSnapshot
 * @property {number} words          - lifetime words read (measured)
 * @property {number} completions   - lifetime finished readings (measured)
 * @property {number} rereads       - lifetime re-readings
 * @property {number} chapterReads  - DISTINCT Scripture chapters marked read
 * @property {number} letterReads   - DISTINCT letters/entries marked read
 * @property {number} streakBest    - best consecutive-day reading streak
 * @property {number} activeDays    - distinct days with reading, lifetime
 * @property {number} bestDayWords  - most words read in one calendar day
 * @property {number} bestWeekWords - most words read in any 7-day window
 * @property {number} marks         - highlight/underline groups
 * @property {number} notes         - notes
 * @property {number} bookmarks     - bookmarks
 * @property {number} links         - links
 * @property {number} journalEntries - journal entries
 * @property {number} journalStreakBest - best journal streak
 * @property {number} audioPlays    - recordings started, lifetime
 * @property {number} audioCompletions - recordings heard to their END, lifetime
 * @property {number} audioSaved    - recordings currently saved
 */

/**
 * @typedef {Object} AchievementDef
 * @property {string} key
 * @property {string} label
 * @property {number} threshold
 * @property {keyof AchievementSnapshot} metric
 */

/**
 * @typedef {Object} AchievementCategory
 * @property {string} id
 * @property {string} label
 * @property {string} eyebrow - short "what counts here" line
 * @property {AchievementDef[]} defs
 */

/** Corpus-scale constants the top thresholds are set against. */
const BIBLE_CHAPTER_TOTAL = 1189;   // every chapter, Genesis to Revelation

/** Every live store that can change an achievement. Shared by the full screen
 * and the Library summary tile so their subscriptions cannot drift apart. */
export const ACHIEVEMENT_STORE_NAMES = Object.freeze([
  'ReadingStatsStore', 'ReadingStreakStore', 'AnnotationStore', 'NoteStore',
  'BookmarkStore', 'LinkStore', 'JournalStore', 'JournalStatsStore', 'AudioLibraryStore',
]);
const LETTER_TOTAL = 729;           // every letter/preface/entry with a recording

/** @param {number} n @returns {string} */
function _num(n) { return n.toLocaleString('en-US'); }

/** @type {AchievementCategory[]} */
export const ACHIEVEMENT_CATEGORIES = [
  {
    id: 'words', label: 'Words Read', eyebrow: 'Measured, completed reading',
    defs: [10000, 50000, 100000, 250000, 500000, 750000, 1000000].map((t) => ({
      key: 'words-' + t, metric: 'words', threshold: t,
      label: t === 1000000 ? 'One million words read' : _num(t) + ' words read',
    })),
  },
  {
    id: 'readings', label: 'Readings Finished', eyebrow: 'Complete read-throughs, first time or fiftieth',
    defs: [1, 5, 10, 25, 50, 100, 200, 365].map((t) => ({
      key: 'readings-' + t, metric: 'completions', threshold: t,
      label: t === 1 ? 'First reading finished' : _num(t) + ' readings finished',
    })),
  },
  {
    id: 'chapters', label: 'Scripture Chapters', eyebrow: 'Distinct chapters of the Scriptures marked read',
    defs: [1, 10, 25, 50, 100, 260, 500, BIBLE_CHAPTER_TOTAL].map((t) => ({
      key: 'chapters-' + t, metric: 'chapterReads', threshold: t,
      label: t === 1 ? 'First chapter read'
        : t === BIBLE_CHAPTER_TOTAL ? 'Every chapter, Genesis to Revelation'
        : _num(t) + ' chapters read',
    })),
  },
  {
    id: 'letters', label: 'Letters & Entries', eyebrow: 'Distinct letters and entries marked read',
    defs: [1, 10, 30, 75, 150, 365, LETTER_TOTAL].map((t) => ({
      key: 'letters-' + t, metric: 'letterReads', threshold: t,
      label: t === 1 ? 'First letter read'
        : t === LETTER_TOTAL ? 'The whole library of letters'
        : _num(t) + ' letters & entries read',
    })),
  },
  {
    id: 'returns', label: 'Returnings', eyebrow: 'Readings you came back to again',
    defs: [1, 5, 25, 100].map((t) => ({
      key: 'returns-' + t, metric: 'rereads', threshold: t,
      label: t === 1 ? 'Returned to a reading' : _num(t) + ' re-readings',
    })),
  },
  {
    id: 'streak', label: 'Reading Streak', eyebrow: 'Consecutive days with reading',
    defs: [2, 7, 14, 30, 90, 365].map((t) => ({
      key: 'streak-' + t, metric: 'streakBest', threshold: t,
      label: t === 365 ? 'A full year, day after day' : t + '-day streak',
    })),
  },
  {
    id: 'days', label: 'Days of Devotion', eyebrow: 'Distinct days with reading, lifetime',
    defs: [3, 10, 30, 100, 365].map((t) => ({
      key: 'days-' + t, metric: 'activeDays', threshold: t,
      label: t + (t === 1 ? ' day' : ' days') + ' of reading',
    })),
  },
  {
    id: 'bigday', label: 'Deep Days', eyebrow: 'Most words read in a single day',
    defs: [2000, 5000, 10000, 20000].map((t) => ({
      key: 'bigday-' + t, metric: 'bestDayWords', threshold: t,
      label: _num(t) + ' words in one day',
    })),
  },
  {
    id: 'bigweek', label: 'Strong Weeks', eyebrow: 'Most words read across any seven days',
    defs: [5000, 15000, 35000].map((t) => ({
      key: 'bigweek-' + t, metric: 'bestWeekWords', threshold: t,
      label: _num(t) + ' words in one week',
    })),
  },
  {
    id: 'marks', label: 'Highlights & Underlines', eyebrow: 'Passages marked to keep',
    defs: [1, 10, 50, 150, 500].map((t) => ({
      key: 'marks-' + t, metric: 'marks', threshold: t,
      label: t === 1 ? 'First passage marked' : _num(t) + ' passages marked',
    })),
  },
  {
    id: 'notes', label: 'Notes', eyebrow: 'Your own words beside the text',
    defs: [1, 10, 50, 150].map((t) => ({
      key: 'notes-' + t, metric: 'notes', threshold: t,
      label: t === 1 ? 'First note written' : _num(t) + ' notes written',
    })),
  },
  {
    id: 'bookmarks', label: 'Bookmarks', eyebrow: 'Places kept to return to',
    defs: [1, 10, 50, 150].map((t) => ({
      key: 'bookmarks-' + t, metric: 'bookmarks', threshold: t,
      label: t === 1 ? 'First bookmark placed' : _num(t) + ' bookmarks placed',
    })),
  },
  {
    id: 'links', label: 'Links', eyebrow: 'Passages connected to passages',
    defs: [1, 10, 50].map((t) => ({
      key: 'links-' + t, metric: 'links', threshold: t,
      label: t === 1 ? 'First link made' : _num(t) + ' links made',
    })),
  },
  {
    id: 'journal', label: 'Journal', eyebrow: 'Entries in your journal',
    defs: [1, 10, 30, 100, 300].map((t) => ({
      key: 'journal-' + t, metric: 'journalEntries', threshold: t,
      label: t === 1 ? 'First journal entry' : _num(t) + ' journal entries',
    })),
  },
  {
    id: 'journal-streak', label: 'Journal Streak', eyebrow: 'Consecutive days journaling',
    defs: [7, 30, 100].map((t) => ({
      key: 'journal-streak-' + t, metric: 'journalStreakBest', threshold: t,
      label: t + '-day journal streak',
    })),
  },
  {
    id: 'listening', label: 'Listening', eyebrow: 'Recordings played from the Listening Library',
    defs: [1, 10, 50, 200, 500].map((t) => ({
      key: 'listening-' + t, metric: 'audioPlays', threshold: t,
      label: t === 1 ? 'First recording played' : _num(t) + ' recordings played',
    })),
  },
  {
    id: 'completed-audio', label: 'Heard to the End', eyebrow: 'Recordings finished, last second included',
    defs: [1, 10, 50, 250, 1000].map((t) => ({
      key: 'completed-audio-' + t, metric: 'audioCompletions', threshold: t,
      label: t === 1 ? 'First recording finished' : _num(t) + ' recordings finished',
    })),
  },
  {
    id: 'saved-audio', label: 'Saved Recordings', eyebrow: 'Recordings kept close',
    defs: [1, 10, 50].map((t) => ({
      key: 'saved-audio-' + t, metric: 'audioSaved', threshold: t,
      label: t === 1 ? 'First recording saved' : _num(t) + ' recordings saved',
    })),
  },
];

/** Total achievement count across every category. */
export const ACHIEVEMENT_TOTAL = ACHIEVEMENT_CATEGORIES.reduce((n, c) => n + c.defs.length, 0);

/** Every def, indexed by key — the resolver the FEATURED subset below uses. */
const _DEF_BY_KEY = (() => {
  /** @type {Map<string, AchievementDef>} */
  const map = new Map();
  for (const cat of ACHIEVEMENT_CATEGORIES) for (const def of cat.defs) map.set(def.key, def);
  return map;
})();

/* ── THE FEATURED SUBSET (one engine, 2026-08-10) ─────────────────────────
   There used to be two milestone systems: this one, and a ten-row table in
   reading-stats-store (READING_MILESTONE_DEFS) that My Progress rendered as a
   compact strip. Two tables of thresholds over the same three numbers meant
   the strip and the full screen could disagree about what the reader had
   earned — and they did, because the strip read a PERSISTED unlock ledger
   while the screen recomputes earned-ness live.

   Owner decision: COMBINE. The ten strip rows were already, item for item, ten
   of the achievements below — same metric, same threshold, same label — so
   folding them is a mapping, not a new table. My Progress renders
   `buildAchievements(...).featured`, which holds the SAME item objects that
   appear in `categories`; an earned-count divergence is not merely unlikely,
   it has nowhere to come from. Nothing is double-counted either: featured is a
   VIEW, never an addition, so ACHIEVEMENT_TOTAL is untouched.

   `unlockKey` is the one thing that did not fold. The store persists a list of
   milestone keys so a threshold toasts exactly ONCE ever, and those keys are
   already written into every reader's data; renaming them would re-fire ten
   toasts on the next completion. So the ledger keeps its key space, declared
   HERE beside the achievement it belongs to rather than in a second table. */

/**
 * The ten achievements My Progress shows in its strip, IN STRIP ORDER, each
 * paired with the legacy key ReadingStatsStore's unlock ledger persists for it.
 *
 * @type {ReadonlyArray<{ key: string, unlockKey: string }>}
 */
export const FEATURED_ACHIEVEMENTS = Object.freeze([
  { key: 'readings-1',    unlockKey: 'read-first' },
  { key: 'readings-10',   unlockKey: 'read-10' },
  { key: 'readings-50',   unlockKey: 'read-50' },
  { key: 'readings-200',  unlockKey: 'read-200' },
  { key: 'words-10000',   unlockKey: 'words-10k' },
  { key: 'words-100000',  unlockKey: 'words-100k' },
  { key: 'words-500000',  unlockKey: 'words-500k' },
  { key: 'words-1000000', unlockKey: 'words-1m' },
  { key: 'returns-1',     unlockKey: 'reread-first' },
  { key: 'returns-25',    unlockKey: 'reread-25' },
].map((entry) => Object.freeze(entry)));

/** Featured keys as a set — what `buildAchievements` flags each item with. */
const _FEATURED_KEYS = new Set(FEATURED_ACHIEVEMENTS.map((f) => f.key));

/**
 * The unlock-ledger rows, RESOLVED from the definitions above so the ledger
 * cannot carry a threshold the display does not. Consumed by
 * ReadingStatsStore._checkMilestones (it lives in bundle-b; this module is
 * pure and import-safe from either side, like utils/audio-track.js).
 *
 * A featured key naming no achievement is dropped rather than thrown — a
 * milestone table must never be able to black-screen the app at import time.
 * `achievements.test.js` pins the length, which is what catches a typo.
 *
 * @type {ReadonlyArray<{ key: string, achievementKey: string, metric: string, threshold: number, label: string }>}
 */
export const FEATURED_UNLOCK_DEFS = Object.freeze(
  FEATURED_ACHIEVEMENTS.map((f) => {
    const def = _DEF_BY_KEY.get(f.key);
    return def ? Object.freeze({
      key: f.unlockKey, achievementKey: def.key,
      metric: String(def.metric), threshold: def.threshold, label: def.label,
    }) : null;
  }).filter(Boolean)
);

/** @param {unknown} v @returns {number} */
function _count(v) { return Math.max(0, Math.floor(Number(v) || 0)); }

/**
 * PURE layer: snapshot → categorized, progress-annotated achievements, plus
 * the FEATURED view My Progress's strip renders.
 *
 * `featured` holds the very same item OBJECTS that appear in `categories` —
 * not copies — so the strip and the full screen cannot disagree about what is
 * earned, and featured items are never counted twice in `earned`/`total`.
 *
 * @param {Partial<AchievementSnapshot>} snapshot
 * @returns {{ earned: number, total: number, categories: Array<{ id: string, label: string, eyebrow: string, earned: number, total: number, items: Array<{ key: string, label: string, threshold: number, value: number, earned: boolean, fraction: number, featured: boolean }> }>, featured: Array<{ key: string, label: string, threshold: number, value: number, earned: boolean, fraction: number, featured: boolean }> }}
 */
export function buildAchievements(snapshot) {
  const s = snapshot || {};
  let earnedTotal = 0;
  /** @type {Map<string, any>} */
  const byKey = new Map();
  const categories = ACHIEVEMENT_CATEGORIES.map((cat) => {
    const items = cat.defs.map((def) => {
      const value = _count(s[def.metric]);
      const earned = value >= def.threshold;
      if (earned) earnedTotal++;
      const item = {
        key: def.key,
        label: def.label,
        threshold: def.threshold,
        value,
        earned,
        fraction: Math.max(0, Math.min(1, value / def.threshold)),
        featured: _FEATURED_KEYS.has(def.key),
      };
      byKey.set(def.key, item);
      return item;
    });
    return {
      id: cat.id, label: cat.label, eyebrow: cat.eyebrow,
      earned: items.filter((i) => i.earned).length,
      total: items.length,
      items,
    };
  });
  const featured = FEATURED_ACHIEVEMENTS.map((f) => byKey.get(f.key)).filter(Boolean);
  return { earned: earnedTotal, total: ACHIEVEMENT_TOTAL, categories, featured };
}

/** Best rolling 7-day words total from a wordsByDay map (keys 'YYYY-MM-DD'). */
/** @param {Record<string, number>} byDay @returns {number} */
function _bestWeek(byDay) {
  const dates = Object.keys(byDay || {}).sort();
  if (!dates.length) return 0;
  let best = 0;
  for (let i = 0; i < dates.length; i++) {
    // Window = the 7 calendar days ending at dates[i]. Day keys are
    // ISO-shaped, so string comparison orders them correctly.
    const end = new Date(dates[i] + 'T00:00:00Z').getTime();
    if (!isFinite(end)) continue;
    const startKey = new Date(end - 6 * 86400000).toISOString().slice(0, 10);
    let sum = 0;
    for (let j = i; j >= 0 && dates[j] >= startKey; j--) sum += _count(byDay[dates[j]]);
    if (sum > best) best = sum;
  }
  return best;
}

/**
 * LIVE layer: read every contributing store (guarded globals — a missing
 * store contributes zeros) plus the App-owned readItems map.
 *
 * @param {Record<string, number | boolean> | null | undefined} readItems
 * @returns {AchievementSnapshot}
 */
export function collectAchievementSnapshot(readItems) {
  const g = /** @type {any} */ (globalThis);
  /** @param {string} name @returns {any} */
  const store = (name) => (typeof g[name] !== 'undefined' && g[name]) ? g[name] : null;

  // Reading ledger
  let words = 0, completions = 0, rereads = 0, bestDayWords = 0, bestWeekWords = 0;
  try {
    const stats = store('ReadingStatsStore');
    const d = stats && typeof stats.get === 'function' ? stats.get() : null;
    if (d) {
      words = _count(d.totalWordsRead);
      completions = _count(d.totalCompletions);
      rereads = _count(d.rereads);
      const byDay = (d.wordsByDay && typeof d.wordsByDay === 'object') ? d.wordsByDay : {};
      for (const k of Object.keys(byDay)) bestDayWords = Math.max(bestDayWords, _count(byDay[k]));
      bestWeekWords = _bestWeek(byDay);
    }
  } catch (_e) { /* ledger optional */ }

  // Distinct chapters vs public letters from the count-valued readItems map.
  // The final cid alone is insufficient: Bible Study chapter IDs and Hidden
  // Manna entries are slugs too, but neither belongs in the 729 public
  // recording-backed letter/entry total.
  let chapterReads = 0, letterReads = 0;
  const items = readItems && typeof readItems === 'object' ? readItems : {};
  const collectionsByReadKey = g.COL_BY_READ_KEY instanceof Map ? g.COL_BY_READ_KEY : null;
  for (const key of Object.keys(items)) {
    if (!items[key]) continue;
    const lastSep = key.lastIndexOf(':');
    if (lastSep < 0) continue;
    const cid = key.slice(lastSep + 1);
    if (/^\d+$/.test(cid)) {
      chapterReads++;
      continue;
    }
    const readKey = key.slice(3, lastSep); // v1:<readKey>:<cid>
    const collection = collectionsByReadKey && collectionsByReadKey.get(readKey);
    if (collection && collection.cardId) letterReads++;
  }

  // Streak
  let streakBest = 0, activeDays = 0;
  try {
    const streak = store('ReadingStreakStore');
    const d = streak && typeof streak.get === 'function' ? streak.get() : null;
    if (d) {
      streakBest = Math.max(_count(d.currentStreak), _count(d.longestStreak));
      activeDays = _count(d.totalDays);
    }
  } catch (_e) { /* streak optional */ }

  // Annotations — highlight/underline GROUPS, same tally the Library tile uses.
  let marks = 0;
  try {
    const ann = store('AnnotationStore');
    const all = ann && typeof ann.all === 'function' ? (ann.all() || {}) : {};
    const seen = new Set();
    for (const k of Object.keys(all)) {
      for (const a of (all[k] || [])) {
        if (a && (a.kind === 'highlight' || a.kind === 'underline')) seen.add(a.groupId || a.id);
      }
    }
    marks = seen.size;
  } catch (_e) { /* annotations optional */ }

  /** @param {string} name @param {string} method @returns {number} */
  const countOf = (name, method) => {
    try {
      const st = store(name);
      if (!st) return 0;
      if (method === 'count' && typeof st.count === 'function') return _count(st.count());
      if (method === 'all-length' && typeof st.all === 'function') return _count((st.all() || []).length);
      return 0;
    } catch (_e) { return 0; }
  };

  let journalStreakBest = 0;
  try {
    const js = store('JournalStatsStore');
    const d = js && typeof js.get === 'function' ? js.get() : (js && typeof js._load === 'function' ? js._load() : null);
    if (d) journalStreakBest = Math.max(_count(d.currentStreak), _count(d.longestStreak));
  } catch (_e) { /* journal stats optional */ }

  let audioPlays = 0, audioSaved = 0, audioCompletions = 0;
  try {
    const lib = store('AudioLibraryStore');
    if (lib && typeof lib.getPlays === 'function') audioPlays = _count(lib.getPlays());
    if (lib && typeof lib.saved === 'function') audioSaved = _count((lib.saved() || []).length);
    // Starting a recording and finishing one are different acts, and the store
    // has counted both since 2026-08-09 — only `plays` had a tier to reach.
    if (lib && typeof lib.getCompletions === 'function') audioCompletions = _count(lib.getCompletions());
  } catch (_e) { /* listening library optional */ }

  return {
    words, completions, rereads,
    chapterReads, letterReads,
    streakBest, activeDays,
    bestDayWords, bestWeekWords,
    marks,
    notes: countOf('NoteStore', 'count'),
    bookmarks: countOf('BookmarkStore', 'count'),
    links: countOf('LinkStore', 'all-length'),
    journalEntries: countOf('JournalStore', 'count'),
    journalStreakBest,
    audioPlays, audioCompletions, audioSaved,
  };
}
