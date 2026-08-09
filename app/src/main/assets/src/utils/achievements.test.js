/* achievements — the pure builder + the guarded live-snapshot collector. */

import { describe, it, expect, afterEach } from 'vitest';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_TOTAL,
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
    window.AudioLibraryStore = { getPlays: () => 7, saved: () => [{}, {}] };

    const s = collectAchievementSnapshot({});
    expect(s.words).toBe(12345);
    expect(s.completions).toBe(9);
    expect(s.bestDayWords).toBe(3000);
    expect(s.bestWeekWords).toBe(7500);   // 08-05..08-07 window; 08-01 outside
    expect(s.streakBest).toBe(11);
    expect(s.activeDays).toBe(40);
    expect(s.audioPlays).toBe(7);
    expect(s.audioSaved).toBe(2);
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
