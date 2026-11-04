// @ts-nocheck — tests build partial records
/* dl2 (2026-11-04) — two PWA tabs adding to the reading history and the tallies.
   ─────────────────────────────────────────────────────────────────────────────
   vot-history, vot-reading-stats, vot-reading-streak and vot-journal-stats saved
   their whole value blind. Each tab loads it once, at boot, and never reads it
   again, so the second tab's next save wrote the copy IT had loaded over every
   visit, word count, reading day and journal count the first tab had saved since:
   with two tabs open, the reading history kept only the last-writing tab's visits,
   and a tab left open overnight broke the reading streak the other tab had kept up.

   Two "tabs" here are two copies of the real store modules (vi.resetModules), each
   with its own IndexedDB connection, over one fake-indexeddb: the same topology as
   two browser tabs. A third copy, opened last, is the next launch reading the disk. */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const DAY = 86400000;
const D0 = new Date(2026, 10, 2, 12, 0, 0).getTime();   // local noon, so a day step never crosses a DST edge into another date

/** @param {number} t */
function dateKey(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Every tab a test opened: its saves land before the next test deletes the database. */
const opened = [];

/** One tab: fresh copies of the modules, loaded from the shared database. */
async function openTab() {
  vi.resetModules();
  const [h, rs, rk, js, ad] = await Promise.all([
    import('./history-store.js'),
    import('./reading-stats-store.js'),
    import('./reading-streak-store.js'),
    import('./journal-stats-store.js'),
    import('./idb-adapter.js'),
  ]);
  const tab = {
    History: h.HistoryStore, Stats: rs.ReadingStatsStore, Streak: rk.ReadingStreakStore,
    JStats: js.JournalStatsStore, IDBAdapter: ad.IDBAdapter,
  };
  await Promise.all([tab.History._hydrate(), tab.Stats._hydrate(), tab.Streak._hydrate(), tab.JStats._hydrate()]);
  opened.push(tab);
  return tab;
}

/** Let a tab's saves land. */
async function settle(tab) {
  await Promise.all([tab.History.whenSaved(), tab.Stats.whenSaved(), tab.Streak.whenSaved(), tab.JStats.whenSaved()]);
}

const deleteDb = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('votreader');
  req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined);
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(D0);
  localStorage.clear();
  await deleteDb();
});

afterEach(async () => {
  // A tab's load ends in a save (cached-store.js _rebaseAndPromote): let every one land, or it
  // reopens the database the next test deletes and writes this test's figures into it.
  await Promise.all(opened.map(settle));
  opened.length = 0;
  vi.useRealTimers();
});

describe('dl2 — reading history from two tabs', () => {
  it("both tabs' visits are kept, newest first", async () => {
    const A = await openTab();
    const B = await openTab();
    A.History.add({ type: 'chapter', bookId: 'john', chapterNum: 3 }, D0 + 1000);
    await settle(A);
    B.History.add({ type: 'letter', letterId: 'wide-path' }, D0 + 2000);
    await settle(B);
    A.History.add({ type: 'chapter', bookId: 'john', chapterNum: 4 }, D0 + 3000);
    await settle(A);

    const next = await openTab();
    expect(next.History.list().map((e) => e.key)).toEqual(['ch:john:4', 'lt:wide-path', 'ch:john:3']);
  });

  it('a clear in one tab is kept; a visit the other tab makes after it is kept too', async () => {
    const A = await openTab();
    A.History.add({ type: 'chapter', bookId: 'john', chapterNum: 3 }, D0 + 1000);
    await settle(A);
    const B = await openTab();                 // B opens on the visit A saved
    B.History.clear();
    await settle(B);
    A.History.add({ type: 'chapter', bookId: 'john', chapterNum: 4 }, D0 + 3000);
    await settle(A);

    const next = await openTab();
    expect(next.History.list().map((e) => e.key)).toEqual(['ch:john:4']);
  });

  it('one tab alone keeps exactly what it wrote (the 2000 cap included)', async () => {
    const A = await openTab();
    for (let i = 0; i < 2003; i++) A.History.add({ type: 'chapter', bookId: 'psalms', chapterNum: (i % 150) + 1 }, D0 + i);
    await settle(A);
    const next = await openTab();
    expect(next.History.list().length).toBe(2000);
    expect(next.History.list()[0].ts).toBe(D0 + 2002);
    expect(next.History.list()).toEqual(A.History.list());
  });
});

describe('dl2 — words read from two tabs', () => {
  it("both tabs' completions add up", async () => {
    const A = await openTab();
    const B = await openTab();
    A.Stats.recordCompletion({ key: 'v1:john:3', words: 300, activeMs: 60000 });
    await settle(A);
    B.Stats.recordCompletion({ key: 'v1:john:4', words: 200, activeMs: 40000, wasReadBefore: true });
    await settle(B);
    A.Stats.recordCompletion({ key: 'v1:john:5', words: 100, activeMs: 20000 });
    await settle(A);

    const s = (await openTab()).Stats.get();
    expect(s.totalWordsRead).toBe(600);
    expect(s.totalActiveMs).toBe(120000);
    expect(s.totalCompletions).toBe(3);
    expect(s.rereads).toBe(1);
    expect(s.wordsByDay[dateKey(D0)]).toBe(600);
  });

  it("both tabs' pace samples and in-progress places are kept", async () => {
    const A = await openTab();
    const B = await openTab();
    A.Stats.recordPaceSample({ words: 500, activeMs: 120000, requiredMs: 60000 });
    A.Stats.recordProgress('v1:romans:8', 10, [0, 1, 2]);
    await settle(A);
    B.Stats.recordPaceSample({ words: 400, activeMs: 100000, requiredMs: 50000 });
    B.Stats.recordProgress('v1:romans:9', 8, [0]);
    await settle(B);

    const s = (await openTab()).Stats.get();
    expect(s.wpmSamples).toEqual([{ w: 500, ms: 120000 }, { w: 400, ms: 100000 }]);
    expect(Object.keys(s.progress).sort()).toEqual(['v1:romans:8', 'v1:romans:9']);
  });
});

describe('dl3 — a merge save writes the copy its ancestor records (cached-store.js _saveMerged)', () => {
  it('a reading credited while the previous save waits in the write queue is counted once', async () => {
    const A = await openTab();
    await settle(A);
    const realPut = A.IDBAdapter.put;
    let release;
    const gate = new Promise((r) => { release = r; });
    let waiting = false;
    const spy = vi.spyOn(A.IDBAdapter, 'put').mockImplementation(function (store, key, value) {
      waiting = true;
      return gate.then(() => realPut.call(A.IDBAdapter, store, key, value));
    });
    A.Stats.recordCompletion({ key: 'v1:john:3', words: 100, activeMs: 30000 });   // its merge runs; the put waits
    await vi.waitFor(() => expect(waiting).toBe(true));
    A.Stats.recordCompletion({ key: 'v1:john:4', words: 50, activeMs: 15000 });    // edits the cache in place meanwhile
    release();
    await settle(A);
    spy.mockRestore();

    const s = (await openTab()).Stats.get();
    expect(s.totalWordsRead).toBe(150);
    expect(s.totalCompletions).toBe(2);
  });
});

describe('dl2 — the reading streak with a tab left open overnight', () => {
  it("a stale tab's reading day continues the streak the other tab kept up", async () => {
    const A = await openTab();
    const B = await openTab();                  // opened on day 0, then left alone
    A.Streak.recordReadingDay();                 // day 0
    await settle(A);
    vi.setSystemTime(D0 + DAY);
    A.Streak.recordReadingDay();                 // day 1
    await settle(A);
    vi.setSystemTime(D0 + 2 * DAY);
    B.Streak.recordReadingDay();                 // day 2, in the tab that never saw days 0-1
    await settle(B);

    const s = (await openTab()).Streak.get();
    expect(s.lastReadDate).toBe(dateKey(D0 + 2 * DAY));
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
    expect(s.totalDays).toBe(3);
  });

  it('two tabs reading the same day count it once', async () => {
    const A = await openTab();
    const B = await openTab();
    A.Streak.recordReadingDay();
    await settle(A);
    B.Streak.recordReadingDay();
    await settle(B);
    const s = (await openTab()).Streak.get();
    expect(s).toEqual({ currentStreak: 1, longestStreak: 1, lastReadDate: dateKey(D0), totalDays: 1 });
  });
});

describe('dl2 — journal counts from two tabs', () => {
  it("both tabs' new entries are counted, and a delete in one is taken off", async () => {
    const A = await openTab();
    const B = await openTab();
    A.JStats.recordNewEntry(D0);
    await settle(A);
    B.JStats.recordNewEntry(D0 + 1000);
    await settle(B);
    A.JStats.recordNewEntry(D0 + 2000);
    await settle(A);
    B.JStats.recordDeletion();
    await settle(B);

    const s = (await openTab()).JStats.get();
    expect(s.totalEntries).toBe(2);
    expect(s.currentStreak).toBe(1);
    expect(s.lastEntryDate).toBe(dateKey(D0));
  });
});
