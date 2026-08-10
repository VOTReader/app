/* achievements — the pure builder + the guarded live-snapshot collector. */

import { describe, it, expect, afterEach } from 'vitest';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_TOTAL,
  FEATURED_ACHIEVEMENTS,
  FEATURED_UNLOCK_DEFS,
  buildAchievements,
  collectAchievementSnapshot,
} from './achievements.js';

afterEach(() => {
  delete window.ReadingStatsStore;
  delete window.ReadingStreakStore;
  delete window.AnnotationStore;
  delete window.NoteStore;
  delete window.BookmarkStore;
  delete window.LinkStore;
  delete window.JournalStore;
  delete window.JournalStatsStore;
  delete window.AudioLibraryStore;
  delete window.COL_BY_READ_KEY;
});

describe('achievements — definitions', () => {
  it('is a genuinely fleshed-out table: many categories, many achievements', () => {
    expect(ACHIEVEMENT_CATEGORIES.length).toBeGreaterThanOrEqual(15);
    expect(ACHIEVEMENT_TOTAL).toBeGreaterThanOrEqual(70);
  });

  it('keys are unique and every def names a real snapshot metric', () => {
    const keys = new Set();
    for (const cat of ACHIEVEMENT_CATEGORIES) {
      for (const def of cat.defs) {
        expect(keys.has(def.key)).toBe(false);
        keys.add(def.key);
        expect(def.threshold).toBeGreaterThan(0);
        expect(typeof def.metric).toBe('string');
      }
    }
  });

  it('thresholds ascend within each category', () => {
    for (const cat of ACHIEVEMENT_CATEGORIES) {
      const ts = cat.defs.map((d) => d.threshold);
      expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    }
  });
});

describe('achievements — buildAchievements (pure)', () => {
  it('starts at zero earned on an empty snapshot', () => {
    const built = buildAchievements({});
    expect(built.earned).toBe(0);
    expect(built.total).toBe(ACHIEVEMENT_TOTAL);
    expect(built.categories.every((c) => c.earned === 0)).toBe(true);
  });

  it('marks earned + clamps progress fractions', () => {
    const built = buildAchievements({ words: 60000, chapterReads: 25, streakBest: 7 });
    const words = built.categories.find((c) => c.id === 'words');
    expect(words.items.find((i) => i.key === 'words-10000').earned).toBe(true);
    expect(words.items.find((i) => i.key === 'words-50000').earned).toBe(true);
    const w100k = words.items.find((i) => i.key === 'words-100000');
    expect(w100k.earned).toBe(false);
    expect(w100k.fraction).toBeCloseTo(0.6);

    const chapters = built.categories.find((c) => c.id === 'chapters');
    expect(chapters.earned).toBe(3);   // 1, 10, 25

    const streak = built.categories.find((c) => c.id === 'streak');
    expect(streak.items.find((i) => i.key === 'streak-7').earned).toBe(true);
    expect(streak.items.find((i) => i.key === 'streak-14').fraction).toBe(0.5);
  });

  it('counts overall earned across categories', () => {
    const built = buildAchievements({ notes: 12, audioPlays: 1 });
    // notes: 1 + 10 earned; listening: first play earned.
    expect(built.earned).toBe(3);
  });

  /* A9 (2026-08-10). Finishing a recording is a different act from starting
     one, and the store has counted both since 2026-08-09 — but only `plays`
     had a tier, so the completions counter reached no achievement at all. */
  it('gives finished recordings their own tier, separate from starts', () => {
    const built = buildAchievements({ audioPlays: 3, audioCompletions: 12 });
    const heard = built.categories.find((c) => c.id === 'completed-audio');
    expect(heard.label).toBe('Heard to the End');
    expect(heard.items.map((i) => i.threshold)).toEqual([1, 10, 50, 250, 1000]);
    expect(heard.earned).toBe(2);                                   // 1 and 10
    expect(heard.items.find((i) => i.key === 'completed-audio-50').fraction).toBeCloseTo(0.24);
    // Starting three recordings has earned nothing beyond the first-play tier.
    expect(built.categories.find((c) => c.id === 'listening').earned).toBe(1);
  });
});

describe('achievements — collectAchievementSnapshot (live, guarded)', () => {
  it('yields all-zeros when no store exists', () => {
    const s = collectAchievementSnapshot(null);
    expect(s.words).toBe(0);
    expect(s.chapterReads).toBe(0);
    expect(s.audioPlays).toBe(0);
  });

  it('splits readItems into Scripture chapters (numeric cid) vs letters (slug cid)', () => {
    window.COL_BY_READ_KEY = new Map([
      ['volume-two', { cardId: 'volume-two' }],
      ['wtlb-one', { cardId: 'words-to-live-by-1' }],
    ]);
    const s = collectAchievementSnapshot({
      'v1:genesis:1': 1,
      'v1:genesis:2': 2,          // count > 1 still ONE distinct chapter
      'v1:matthew:5': 1,
      'v1:volume-two:the-seventh-day': 4,
      'v1:wtlb-one:matters-of-the-heart': true,   // legacy boolean read
      'v1:volume-one:never-read': 0,              // falsy = not read
    });
    expect(s.chapterReads).toBe(3);
    expect(s.letterReads).toBe(2);
  });

  it('does not count Bible Study or Hidden Manna slugs toward public letters', () => {
    window.COL_BY_READ_KEY = new Map([
      ['volume-two', { cardId: 'volume-two' }],
      ['hidden-manna', { cardId: null }],
    ]);
    const s = collectAchievementSnapshot({
      'v1:volume-two:the-seventh-day': 1,
      'v1:bible-study-matthew:the-sabbath': 1,
      'v1:hidden-manna:the-hidden-word': 1,
    });
    expect(s.letterReads).toBe(1);
  });

  it('reads the ledger, streak, and listening stores when present', () => {
    window.ReadingStatsStore = {
      get: () => ({
        totalWordsRead: 12345, totalCompletions: 9, rereads: 2,
        // 3 heavy days inside one week + an isolated day WEEKS earlier,
        // which no 7-day window can reach.
        wordsByDay: { '2026-07-20': 1000, '2026-08-05': 2000, '2026-08-06': 2500, '2026-08-07': 3000 },
      }),
    };
    window.ReadingStreakStore = { get: () => ({ currentStreak: 3, longestStreak: 11, totalDays: 40 }) };
    window.AudioLibraryStore = { getPlays: () => 7, saved: () => [{}, {}], getCompletions: () => 4 };

    const s = collectAchievementSnapshot({});
    expect(s.words).toBe(12345);
    expect(s.completions).toBe(9);
    expect(s.bestDayWords).toBe(3000);
    expect(s.bestWeekWords).toBe(7500);   // 08-05..08-07 window; 08-01 outside
    expect(s.streakBest).toBe(11);
    expect(s.activeDays).toBe(40);
    expect(s.audioPlays).toBe(7);
    expect(s.audioCompletions).toBe(4);
    expect(s.audioSaved).toBe(2);
  });

  /* A9 (2026-08-10): the store has counted finished recordings since the
     day the counter shipped, and nothing in the milestones table read it —
     the one listening tier counted STARTS. */
  it('a library with no completions counter reads zero rather than throwing', () => {
    window.AudioLibraryStore = { getPlays: () => 3, saved: () => [] };
    expect(collectAchievementSnapshot({}).audioCompletions).toBe(0);
  });

  it('tallies annotation GROUPS, not per-verse fragments', () => {
    window.AnnotationStore = {
      all: () => ({
        'bible:john:3': [
          { id: 'a1', kind: 'highlight', groupId: 'g1' },
          { id: 'a2', kind: 'highlight', groupId: 'g1' },   // same group
          { id: 'a3', kind: 'underline' },                   // own id
          { id: 'a4', kind: 'note-only' },                   // not a mark
        ],
      }),
    };
    expect(collectAchievementSnapshot({}).marks).toBe(2);
  });
});

/* ── ONE ENGINE (owner decision 2026-08-10) ───────────────────────────────
   My Progress used to render its ten-row strip from a SECOND milestone table
   in reading-stats-store, against a persisted once-ever unlock ledger, while
   this screen recomputes earned-ness from the data — so the two surfaces could
   disagree about what the reader had earned. The strip is now a VIEW of this
   engine. These tests pin the three things that make divergence impossible:
   the mapping resolves, the items are literally shared, and featuring an item
   never adds it to a total. */
describe('achievements — the FEATURED subset My Progress renders', () => {
  it('every featured key names a real achievement — all ten of them', () => {
    expect(FEATURED_ACHIEVEMENTS.length).toBe(10);
    // The resolver DROPS an unresolvable key rather than throwing at import
    // time (a milestone table must not be able to black-screen the app), so
    // this length equality is what actually catches a typo.
    expect(FEATURED_UNLOCK_DEFS.length).toBe(FEATURED_ACHIEVEMENTS.length);
    const keys = new Set();
    for (const cat of ACHIEVEMENT_CATEGORIES) for (const def of cat.defs) keys.add(def.key);
    for (const f of FEATURED_ACHIEVEMENTS) expect(keys.has(f.key)).toBe(true);
  });

  it('the strip and the full screen SHARE their item objects, not copies', () => {
    const built = buildAchievements({ completions: 12, words: 120000, rereads: 3 });
    expect(built.featured.length).toBe(10);
    const all = built.categories.flatMap((c) => c.items);
    for (const item of built.featured) {
      // Identity, not equality: there is no second computation to drift.
      expect(all.indexOf(item)).toBeGreaterThanOrEqual(0);
      expect(item.featured).toBe(true);
    }
    // …and the counts the two surfaces print come from that one computation.
    const featuredEarned = built.featured.filter((i) => i.earned).length;
    const sameItemsInCategories = all.filter((i) => i.featured && i.earned).length;
    expect(featuredEarned).toBe(sameItemsInCategories);
  });

  it('featuring adds nothing to the totals — it is a view, never a row', () => {
    const built = buildAchievements({ completions: 1000, words: 2000000, rereads: 1000 });
    expect(built.total).toBe(ACHIEVEMENT_TOTAL);
    expect(built.categories.reduce((n, c) => n + c.items.length, 0)).toBe(ACHIEVEMENT_TOTAL);
    // Everything is earned at these numbers except tiers on OTHER metrics, so
    // the sum of category counts is still the one earned figure.
    expect(built.categories.reduce((n, c) => n + c.earned, 0)).toBe(built.earned);
  });

  it('keeps the strip in strip order, and every item earns from live data', () => {
    expect(FEATURED_ACHIEVEMENTS.map((f) => f.key)).toEqual([
      'readings-1', 'readings-10', 'readings-50', 'readings-200',
      'words-10000', 'words-100000', 'words-500000', 'words-1000000',
      'returns-1', 'returns-25',
    ]);
    const none = buildAchievements({});
    expect(none.featured.every((i) => !i.earned)).toBe(true);
    const some = buildAchievements({ completions: 10, words: 10000, rereads: 1 });
    expect(some.featured.filter((i) => i.earned).map((i) => i.key))
      .toEqual(['readings-1', 'readings-10', 'words-10000', 'returns-1']);
  });

  it('carries the legacy unlock key beside each achievement, resolved from it', () => {
    // The ledger's key space cannot move — those keys are already persisted —
    // so it is declared beside the achievement rather than in a second table.
    const byAchievement = new Map(FEATURED_UNLOCK_DEFS.map((d) => [d.achievementKey, d]));
    expect(byAchievement.get('readings-1').key).toBe('read-first');
    expect(byAchievement.get('words-1000000').key).toBe('words-1m');
    expect(byAchievement.get('returns-25').key).toBe('reread-25');
    // Labels come from the achievement, so the toast and the strip agree.
    expect(byAchievement.get('words-1000000').label).toBe('One million words read');
    expect(new Set(FEATURED_UNLOCK_DEFS.map((d) => d.key)).size).toBe(10);
  });
});
