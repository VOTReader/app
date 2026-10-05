// @ts-nocheck
/* datasafe 2026-10-05 — automatic snapshots + the data-health check.
   The owner's phone lost its whole library on 10-02 and the only surviving copy
   was a manual export. These pin: a snapshot is taken once a day only after
   every store has loaded; a library much smaller than the newest snapshot
   raises the data-missing finding and is NOT snapshotted (a loss can't roll the
   good copies out); an import's reload is not a loss; Restore MERGES. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBAdapter } from '../stores/idb-adapter.js';
import { CachedStore, _resetStoreRegistry, setStoreWriteFence } from '../stores/cached-store.js';
import { StorageHealth } from './storage-health.js';
import { DataSafety, summarize, score, looksDamaged, mergeForRestore, HEALTH_SKIP_KEY } from './data-safety.js';
import { pruneSnapshotNames, snapshotName, snapshotTime, KEEP_DAYS, KEEP_WEEKS } from './snapshot-sink.js';

const ANN = { 'bible:john:3:16': [{ id: 'a1', groupId: 'a1', kind: 'highlight', start: 0, end: 5, color: 'yellow', created: 1, updated: 1 }],
  'letter:x:1': [{ id: 'a2', groupId: 'a2', kind: 'highlight', start: 0, end: 5, color: 'gold', created: 2, updated: 2 }] };
const NOTES = { a1: { groupId: 'a1', body: 'n1', keys: ['bible:john:3:16'], created: 1, updated: 1 },
  a2: { groupId: 'a2', body: 'n2', keys: ['letter:x:1'], created: 2, updated: 2 } };
const LINKS = [{ id: 'l1', source: { key: 'a' }, target: { key: 'b' }, created: 1 }];
const STATE = { theme: 'dark', readItems: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['k' + i, 1])), tabs: [{ id: 't' }] };

/** A sink held in memory, the same shape snapshot-sink returns. */
function memorySink() {
  const files = new Map();
  return {
    files,
    save: vi.fn(async (json) => { files.set(snapshotName(Date.now() + files.size * 1000), json); return true; }),
    list: async () => [...files.keys()].sort().reverse().map((name) => ({ name, at: snapshotTime(name), size: files.get(name).length })),
    read: async (name) => files.get(name) || '',
    clear: async () => { files.clear(); return true; },
  };
}

let stores;
async function seed(data) {
  for (const [name, v] of Object.entries(data)) await IDBAdapter.put(name, 'v', v);
}

beforeEach(async () => {
  localStorage.clear();
  IDBAdapter._resetForTests();
  await new Promise((r) => { const q = indexedDB.deleteDatabase('votreader'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  _resetStoreRegistry();
  stores = ['vot-annotations', 'vot-notes', 'vot-links', 'vot-state', 'vot-history'].map((n) => {
    const s = CachedStore(n, n === 'vot-links' || n === 'vot-history' ? [] : {}, { idb: true });
    s._resetForTests({ forceLoaded: true });
    return s;
  });
  StorageHealth.setDataMissing(null);
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); setStoreWriteFence(false); });

describe('summarize / score / looksDamaged', () => {
  it('counts what a reader would', () => {
    const m = summarize({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE, 'vot-journal': { list: [{ id: 'j' }] } });
    expect(m).toMatchObject({ highlights: 2, notes: 2, links: 1, journal: 1, readMarks: 30 });
    expect(score(m)).toBe(2 + 2 + 1 + 3 + 3);
  });

  it('10-02 on the owner phone (55 highlights, 6 notes ... -> 0) is damage; a small library is never judged', () => {
    const then = { highlights: 55, notes: 6, links: 3, bookmarks: 0, journal: 0, notebooks: 1, readMarks: 627, history: 1755 };
    const now = { highlights: 0, notes: 0, links: 0, bookmarks: 0, journal: 0, notebooks: 0, readMarks: 96, history: 172 };
    expect(looksDamaged(then, now)).toBe(true);
    expect(looksDamaged({ ...now, highlights: 2 }, now)).toBe(false);          // under MIN_SCORE
    expect(looksDamaged(then, { ...then, highlights: 40 })).toBe(false);        // a few deletions
  });
});

describe('run(): the boot pass', () => {
  it('snapshots once a day after every store loaded, with a summary', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    expect(await DataSafety.run({ sink })).toBe('snapshotted');
    expect(await DataSafety.run({ sink })).toBe('fresh');
    expect(sink.files.size).toBe(1);
    const snap = JSON.parse([...sink.files.values()][0]);
    expect(snap.stores['vot-annotations']).toEqual(ANN);
    expect(snap.summary.highlights).toBe(2);
  });

  it('waits while any store is not loaded', async () => {
    stores[0]._resetForTests();                   // pending
    expect(await DataSafety.run({ sink: memorySink() })).toBe('not-loaded');
  });

  it('a library much smaller than the newest snapshot raises data-missing and is NOT snapshotted', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    const yesterday = Date.now() - 86400000;
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(yesterday);
    await DataSafety.run({ sink });
    vi.useRealTimers();
    // The WebView comes back empty.
    for (const n of ['vot-annotations', 'vot-notes', 'vot-links']) await IDBAdapter.put(n, 'v', n === 'vot-links' ? [] : {});
    await IDBAdapter.put('vot-state', 'v', { theme: 'dark', readItems: {} });
    expect(await DataSafety.run({ sink })).toBe('damaged');
    expect(sink.files.size).toBe(1);
    const missing = StorageHealth.getReport().dataMissing;
    expect(missing.then.highlights).toBe(2);
    expect(missing.now.highlights).toBe(0);
  });

  it('an import or Clear All reload (HEALTH_SKIP_KEY) is not a loss, and the token is used once', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 86400000);
    await DataSafety.run({ sink });
    vi.useRealTimers();
    await IDBAdapter.put('vot-annotations', 'v', {});
    await IDBAdapter.put('vot-notes', 'v', {});
    await IDBAdapter.put('vot-state', 'v', {});
    localStorage.setItem(HEALTH_SKIP_KEY, '1');
    expect(await DataSafety.run({ sink })).not.toBe('damaged');
    expect(localStorage.getItem(HEALTH_SKIP_KEY)).toBeNull();
    expect(StorageHealth.getReport().dataMissing).toBeNull();
  });
});

describe('restoreMissing(): a merge, never a replace', () => {
  it('adds back what the snapshot has and keeps what was made since', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 86400000);
    await DataSafety.run({ sink });
    vi.useRealTimers();
    // The loss, then one new highlight and one new read mark made since.
    const fresh = { 'bible:gen:1:1': [{ id: 'a9', groupId: 'a9', kind: 'highlight', start: 0, end: 3, color: 'blue', created: 9, updated: 9 }] };
    await IDBAdapter.put('vot-annotations', 'v', fresh);
    await IDBAdapter.put('vot-notes', 'v', {});
    await IDBAdapter.put('vot-links', 'v', []);
    await IDBAdapter.put('vot-state', 'v', { theme: 'light', readItems: { new1: 1 }, tabs: [{ id: 'now' }] });
    expect(await DataSafety.run({ sink })).toBe('damaged');
    const reload = vi.fn();
    expect(await DataSafety.restoreMissing({ sink, reload })).toBe(true);
    expect(reload).toHaveBeenCalled();
    const ann = await IDBAdapter.get('vot-annotations', 'v');
    expect(Object.keys(ann).sort()).toEqual(['bible:gen:1:1', 'bible:john:3:16', 'letter:x:1']);
    expect(Object.keys(await IDBAdapter.get('vot-notes', 'v')).sort()).toEqual(['a1', 'a2']);
    const st = await IDBAdapter.get('vot-state', 'v');
    expect(Object.keys(st.readItems)).toHaveLength(31);
    expect(st.theme).toBe('light');                    // the live session fields win
    expect(st.tabs).toEqual([{ id: 'now' }]);
    // No skip token: the next boot checks the restored library like any other.
    expect(localStorage.getItem(HEALTH_SKIP_KEY)).toBeNull();
  });

  it('does nothing without a finding', async () => {
    expect(await DataSafety.restoreMissing({ sink: memorySink(), reload: vi.fn() })).toBe(false);
  });

  it('mergeForRestore keeps flags set on either side and history from both', () => {
    expect(mergeForRestore('vot-tour-done', false, true)).toBe(true);
    const h = mergeForRestore('vot-history', [{ key: 'a', ts: 2 }], [{ key: 'b', ts: 1 }, { key: 'a', ts: 2 }]);
    expect(h.map((e) => e.key)).toEqual(['a', 'b']);
  });
});

describe('pruneSnapshotNames (the web copy of SnapshotStore.prune)', () => {
  it('keeps one per day for 7 days, then one per week for 4 weeks', () => {
    const names = [];
    const d = new Date(2026, 7, 1, 9);
    for (let i = 0; i < 60; i++) {
      names.push(snapshotName(d.getTime()), snapshotName(d.getTime() + 8 * 3600000));
      d.setDate(d.getDate() + 1);
    }
    const keep = names.filter((n) => !pruneSnapshotNames(names).includes(n)).sort().reverse();
    expect(keep).toHaveLength(KEEP_DAYS + KEEP_WEEKS);
    expect(new Set(keep.slice(0, 7).map((n) => n.slice(5, 13))).size).toBe(7);
    expect(keep.slice(0, 7).every((n) => n.endsWith('170000.json'))).toBe(true);   // the later save of each day
  });

  it('round-trips a name to its time', () => {
    const t = new Date(2026, 9, 5, 3, 4, 5).getTime();
    expect(snapshotTime(snapshotName(t))).toBe(t);
  });
});

describe('refuter findings (datasafe 10-05 second pass)', () => {
  it('one store lost on its own is damage even when the total holds up', () => {
    const then = { highlights: 55, notes: 0, links: 0, bookmarks: 0, journal: 0, notebooks: 0, readMarks: 700, history: 0 };
    const now = { ...then, highlights: 0 };
    expect(looksDamaged(then, now)).toBe(true);
  });

  it('streak, stats and audio merge field by field, not live-wins', () => {
    const streak = mergeForRestore('vot-reading-streak',
      { currentStreak: 1, longestStreak: 1, lastReadDate: '2026-10-05', totalDays: 1 },
      { currentStreak: 48, longestStreak: 48, lastReadDate: '2026-09-24', totalDays: 48 });
    expect(streak).toEqual({ currentStreak: 1, longestStreak: 48, lastReadDate: '2026-10-05', totalDays: 48 });
    const stats = mergeForRestore('vot-reading-stats',
      { totalWordsRead: 10, wordsByDay: { '2026-10-05': 10 }, progress: { a: { t: 5, w: 1 } } },
      { totalWordsRead: 300000, wordsByDay: { '2026-09-24': 900 }, progress: { a: { t: 1, w: 9 }, b: { t: 2, w: 3 } } });
    expect(stats.totalWordsRead).toBe(300000);
    expect(stats.wordsByDay).toEqual({ '2026-10-05': 10, '2026-09-24': 900 });
    expect(stats.progress).toEqual({ a: { t: 5, w: 1 }, b: { t: 2, w: 3 } });
    const pos = mergeForRestore('vot-audio-positions', { v: 1, positions: { x: { t: 9 } } }, { v: 1, positions: { x: { t: 1 }, y: { t: 2 } } });
    expect(pos.positions).toEqual({ x: { t: 9 }, y: { t: 2 } });
  });

  it('Keep as is clears the finding and snapshots the smaller library at once', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    StorageHealth.setDataMissing({ name: 'x', at: 0, then: {}, now: {} });
    expect(await DataSafety.acceptCurrent({ sink })).toBe('snapshotted');
    expect(StorageHealth.getReport().dataMissing).toBeNull();
    expect(sink.files.size).toBe(1);
  });

  it('a restore whose write fails lifts the fence, changes nothing and keeps the finding', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 86400000);
    await DataSafety.run({ sink });
    vi.useRealTimers();
    await IDBAdapter.put('vot-annotations', 'v', {});
    await IDBAdapter.put('vot-notes', 'v', {});
    await IDBAdapter.put('vot-state', 'v', {});
    expect(await DataSafety.run({ sink })).toBe('damaged');
    const { isStoreWriteFenced } = await import('../stores/cached-store.js');
    vi.spyOn(IDBAdapter, 'put').mockRejectedValue(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
    const reload = vi.fn();
    expect(await DataSafety.restoreMissing({ sink, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(isStoreWriteFenced()).toBe(false);
    expect(StorageHealth.getReport().dataMissing).not.toBeNull();
  });

  it('a progress reset tells the next boot the smaller ledger is the reader\'s own', async () => {
    const { allowProgressClear } = await import('../stores/store-merge.js');
    allowProgressClear();
    expect(localStorage.getItem(HEALTH_SKIP_KEY)).toBe('1');
  });
});
