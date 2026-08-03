/* ReadingStatsStore — the durable ledger the read detector writes into.
   ────────────────────────────────────────────────────────────────────
   Mirrors reading-streak-store.test.js conventions: `_resetForTests(
   { forceLoaded: true })` bypasses the IDB state machine.

   Silent-failure modes guarded:
     - zero-word completions polluting totals/samples.
     - implausible-pace completions (parked autoscroll) becoming wpm
       evidence.
     - wordsByDay growing unbounded / progress map growing unbounded.
     - a completed item keeping a stale frontier.
     - a re-render with a different segment count resurrecting stale
       frontier indices.
     - measuredWpm reporting before it has honest sample support.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { ReadingStatsStore } from './reading-stats-store.js';

beforeEach(() => {
  localStorage.clear();
  ReadingStatsStore._resetForTests({ forceLoaded: true });
});

describe('recordCompletion', () => {
  it('accumulates words, time, completions, and the day bucket', () => {
    ReadingStatsStore.recordCompletion({ key: 'k1', words: 900, activeMs: 240000 });
    ReadingStatsStore.recordCompletion({ key: 'k2', words: 100, activeMs: 30000 });
    const s = ReadingStatsStore.get();
    expect(s.totalWordsRead).toBe(1000);
    expect(s.totalActiveMs).toBe(270000);
    expect(s.totalCompletions).toBe(2);
    const days = ReadingStatsStore.wordsForDays(1);
    expect(days).toHaveLength(1);
    expect(days[0].words).toBe(1000);
  });

  it('zero-word completions are ignored entirely', () => {
    ReadingStatsStore.recordCompletion({ key: 'k', words: 0, activeMs: 60000 });
    expect(ReadingStatsStore.get().totalCompletions).toBe(0);
  });

  it('counts rereads only when flagged', () => {
    ReadingStatsStore.recordCompletion({ key: 'k', words: 10, activeMs: 9000 });
    ReadingStatsStore.recordCompletion({ key: 'k', words: 10, activeMs: 9000, wasReadBefore: true });
    expect(ReadingStatsStore.get().rereads).toBe(1);
  });

  it('clears the item frontier on completion', () => {
    ReadingStatsStore.recordProgress('k', 10, [0, 1, 2]);
    expect(ReadingStatsStore.getProgress('k')).not.toBeNull();
    ReadingStatsStore.recordCompletion({ key: 'k', words: 500, activeMs: 120000 });
    expect(ReadingStatsStore.getProgress('k')).toBeNull();
  });

  it('prunes wordsByDay past 400 day keys (oldest first)', () => {
    const data = ReadingStatsStore.get();
    for (let i = 0; i < 405; i++) {
      const d = new Date(2020, 0, 1 + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      data.wordsByDay[key] = 1;
    }
    ReadingStatsStore.recordCompletion({ key: 'k', words: 5, activeMs: 2000 });
    const keys = Object.keys(ReadingStatsStore.get().wordsByDay);
    expect(keys.length).toBeLessThanOrEqual(400);
    expect(keys).not.toContain('2020-01-01');  // oldest pruned
  });
});

describe('pace samples (recordPaceSample) + measuredWpm', () => {
  // Visit-end sampling (review 2026-08-03): completion-time sampling was
  // biased toward exactly 600 wpm on every fits-viewport page, because
  // completion fires the instant activeMs crosses the required floor.
  const sample = (words, activeMs, requiredMs = 0) =>
    ReadingStatsStore.recordPaceSample({ words, activeMs, requiredMs });

  it('recordCompletion NEVER samples pace (the biased instant)', () => {
    ReadingStatsStore.recordCompletion({ key: 'k', words: 400, activeMs: 40000 });
    expect(ReadingStatsStore.get().wpmSamples || []).toHaveLength(0);
  });

  it('stays null until 5 plausible samples exist', () => {
    for (let i = 0; i < 4; i++) sample(400, 120000);
    expect(ReadingStatsStore.measuredWpm()).toBeNull();
    sample(400, 120000);
    expect(ReadingStatsStore.measuredWpm()).toBe(200);  // 400w / 2min
  });

  it('rejects implausible paces as evidence (flick, parked overnight)', () => {
    sample(1000, 6000);     // 10,000 wpm
    sample(10, 120000);     // 5 wpm
    expect(ReadingStatsStore.get().wpmSamples || []).toHaveLength(0);
  });

  it('BOUNDARY GUARD: a session that ended at the required minimum is walk-away noise, not pace', () => {
    // 90 words, required 9000ms, ended at 9400ms — exactly the fits-viewport
    // walk-away signature (would read as ~600 wpm). Must not sample.
    sample(90, 9400, 9000);
    expect(ReadingStatsStore.get().wpmSamples || []).toHaveLength(0);
    // The same words with genuine continued reading DOES sample.
    sample(90, 24000, 9000);
    expect(ReadingStatsStore.get().wpmSamples).toHaveLength(1);
  });

  it('is a median — one weird-but-plausible sample cannot drag the pace', () => {
    for (let i = 0; i < 6; i++) sample(230, 60000);
    sample(1400, 60000);
    expect(ReadingStatsStore.measuredWpm()).toBe(230);
  });

  it('caps the rolling window at 50 samples', () => {
    for (let i = 0; i < 60; i++) sample(200, 60000);
    expect(ReadingStatsStore.get().wpmSamples).toHaveLength(50);
  });
});

describe('replaceAll (backup restore path)', () => {
  it('fills defaults from a partial payload so old backups cannot break readers', () => {
    ReadingStatsStore.replaceAll({ totalWordsRead: 1234 });
    const s = ReadingStatsStore.get();
    expect(s.totalWordsRead).toBe(1234);
    expect(s.totalActiveMs).toBe(0);
    expect(s.wordsByDay).toEqual({});
    expect(s.wpmSamples).toEqual([]);
    expect(s.progress).toEqual({});
    expect(ReadingStatsStore.measuredWpm()).toBeNull();   // readers all survive
    expect(ReadingStatsStore.wordsForDays(3)).toHaveLength(3);
  });

  it('survives garbage payloads (null, arrays, wrong types)', () => {
    ReadingStatsStore.replaceAll(null);
    expect(ReadingStatsStore.get().totalWordsRead).toBe(0);
    ReadingStatsStore.replaceAll(/** @type {any} */ ([1, 2, 3]));
    expect(ReadingStatsStore.get().progress).toEqual({});
  });
});

describe('progress frontiers', () => {
  it('unions credited indices across sessions of the same render shape', () => {
    ReadingStatsStore.recordProgress('k', 10, [0, 1, 4]);
    ReadingStatsStore.recordProgress('k', 10, [2, 4, 5]);
    expect(ReadingStatsStore.getProgress('k').c).toEqual([0, 1, 2, 4, 5]);
  });

  it('resets credits when the segment count changes (stale indices are useless)', () => {
    ReadingStatsStore.recordProgress('k', 10, [0, 1, 2]);
    ReadingStatsStore.recordProgress('k', 12, [3]);
    expect(ReadingStatsStore.getProgress('k')).toMatchObject({ b: 12, c: [3] });
  });

  it('firstUnreadIndex finds the frontier; null when useless', () => {
    ReadingStatsStore.recordProgress('k', 6, [0, 1, 2, 4]);
    expect(ReadingStatsStore.firstUnreadIndex('k', 6)).toBe(3);
    // count mismatch with the live DOM → no frontier
    expect(ReadingStatsStore.firstUnreadIndex('k', 8)).toBeNull();
    // nothing read → the top IS the frontier → null (no special scroll)
    ReadingStatsStore.recordProgress('j', 6, []);
    expect(ReadingStatsStore.firstUnreadIndex('j', 6)).toBeNull();
    // first segment unread → resume at top → null, not 0
    ReadingStatsStore.recordProgress('m', 6, [1, 2]);
    expect(ReadingStatsStore.firstUnreadIndex('m', 6)).toBeNull();
    // everything credited → no frontier
    ReadingStatsStore.recordProgress('z', 3, [0, 1, 2]);
    expect(ReadingStatsStore.firstUnreadIndex('z', 3)).toBeNull();
    expect(ReadingStatsStore.firstUnreadIndex('missing', 6)).toBeNull();
  });

  it('LRU-prunes to 50 in-progress items by last touch', () => {
    for (let i = 0; i < 55; i++) ReadingStatsStore.recordProgress('p' + i, 5, [0], 1000 + i);
    const map = ReadingStatsStore.get().progress;
    expect(Object.keys(map)).toHaveLength(50);
    expect(map['p0']).toBeUndefined();   // oldest touch pruned
    expect(map['p54']).toBeDefined();
  });
});
