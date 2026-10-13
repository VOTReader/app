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
import { DataSafety, summarize, score, looksDamaged, mergeForRestore, HEALTH_SKIP_KEY, PROGRESS_RESET_KEY, WEEKLY_OFF_KEY, weeklyCopyJson } from './data-safety.js';
import { validateImportEnvelope } from './import-validators.js';
import { applyImportPayload } from './backup.js';
import { pruneSnapshotNames, snapshotName, snapshotTime, KEEP_DAYS, KEEP_WEEKS } from './snapshot-sink.js';
import { announceLibraryChange, heldByOtherTab } from './other-tabs.js';

// W8: what this page tells the other open tabs (the channel itself: other-tabs.test.js).
vi.mock('./other-tabs.js', async (importOriginal) => ({ ...(/** @type {any} */ (await importOriginal())), announceLibraryChange: vi.fn(), heldByOtherTab: vi.fn(() => false) }));

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
    expect(await DataSafety.run({ sink })).toBe('snapshotted');      // the reader's new library, snapshotted now
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

  it('W9: a broken file (a save killed before it wrote) never keeps its day, so the good copy before it stays', () => {
    const names = ['snap-20261001-090000.json', 'snap-20261001-180000.json', 'snap-20261002-090000.json'];
    expect(pruneSnapshotNames(names, new Set(['snap-20261001-180000.json']))).toEqual(['snap-20261001-180000.json']);
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

  /* W8 (sweep 2026-10-13): a Restore writes into the database the other tabs keep open, so they
     get no versionchange; they hear it on the channel, or their next save writes the old copy
     back over the restored stores. */
  it('W8: the other open tabs hear "changing" before the first write and "changed" with the reload', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 86400000);
    await DataSafety.run({ sink });
    vi.useRealTimers();
    await IDBAdapter.put('vot-annotations', 'v', {});
    await IDBAdapter.put('vot-notes', 'v', {});
    await IDBAdapter.put('vot-state', 'v', {});
    expect(await DataSafety.run({ sink })).toBe('damaged');
    const order = [];
    vi.mocked(announceLibraryChange).mockReset().mockImplementation((kind) => { order.push(kind); });
    const realPut = IDBAdapter.put;
    vi.spyOn(IDBAdapter, 'put').mockImplementation((...a) => { order.push('put'); return realPut.apply(IDBAdapter, a); });
    expect(await DataSafety.restoreMissing({ sink, reload: vi.fn() })).toBe(true);
    expect(order[0]).toBe('changing');
    expect(order).toContain('put');
    expect(order.at(-1)).toBe('changed');
  });

  it('W8: a restore whose first write fails tells them "unchanged" (they save again); one that wrote some says "changed"', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 86400000);
    await DataSafety.run({ sink });
    vi.useRealTimers();
    await IDBAdapter.put('vot-annotations', 'v', {});
    await IDBAdapter.put('vot-notes', 'v', {});
    await IDBAdapter.put('vot-state', 'v', {});
    expect(await DataSafety.run({ sink })).toBe('damaged');
    const said = [];
    vi.mocked(announceLibraryChange).mockReset().mockImplementation((kind) => { said.push(kind); });
    const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    const realPut = IDBAdapter.put;
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockRejectedValue(quota);
    expect(await DataSafety.restoreMissing({ sink, reload: vi.fn() })).toBe(false);
    expect(said).toEqual(['changing', 'unchanged']);
    said.length = 0;
    putSpy.mockReset().mockImplementationOnce((...a) => realPut.apply(IDBAdapter, a)).mockRejectedValue(quota);
    expect(await DataSafety.restoreMissing({ sink, reload: vi.fn() })).toBe(false);
    expect(said).toEqual(['changing', 'changed']);
  });

  it('W8: a tab whose library another tab changed restores nothing (its writes would not land)', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 86400000);
    await DataSafety.run({ sink });
    vi.useRealTimers();
    await IDBAdapter.put('vot-annotations', 'v', {});
    await IDBAdapter.put('vot-notes', 'v', {});
    await IDBAdapter.put('vot-state', 'v', {});
    expect(await DataSafety.run({ sink })).toBe('damaged');
    vi.mocked(heldByOtherTab).mockReturnValueOnce(true);
    vi.mocked(announceLibraryChange).mockReset();
    const reload = vi.fn();
    expect(await DataSafety.restoreMissing({ sink, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(announceLibraryChange).not.toHaveBeenCalled();
  });

  /* W8 refuter round 2 (2026-10-13): Import and Clear All hold the backup Web Lock, Restore did not,
     so a Restore in one tab and an Import in another could write the library at once (the Restore's
     stale read landing over the import). Restore now holds the same lock, or does nothing. */
  async function damagedWithSnapshot() {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 86400000);
    await DataSafety.run({ sink });
    vi.useRealTimers();
    await IDBAdapter.put('vot-annotations', 'v', {});
    await IDBAdapter.put('vot-notes', 'v', {});
    await IDBAdapter.put('vot-state', 'v', {});
    expect(await DataSafety.run({ sink })).toBe('damaged');
    return sink;
  }

  it('W8: a Restore while another tab holds the backup lock (its Import) writes nothing and announces nothing', async () => {
    const sink = await damagedWithSnapshot();
    vi.spyOn(navigator.locks, 'request').mockImplementation((name, o, cb) => Promise.resolve().then(() => cb(null)));
    vi.mocked(announceLibraryChange).mockReset();
    const putSpy = vi.spyOn(IDBAdapter, 'put');
    const reload = vi.fn();
    expect(await DataSafety.restoreMissing({ sink, reload })).toBe(false);
    expect(putSpy).not.toHaveBeenCalled();
    expect(announceLibraryChange).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    const { isStoreWriteFenced } = await import('../stores/cached-store.js');
    expect(isStoreWriteFenced(), 'nothing fenced').toBe(false);
    expect(StorageHealth.getReport().dataMissing, 'the finding stays up').not.toBeNull();
  });

  it('W8 refuter round 3: the Restore\'s end names the operation its start returned', async () => {
    const sink = await damagedWithSnapshot();
    const calls = [];
    vi.mocked(announceLibraryChange).mockReset().mockImplementation((kind, op) => { calls.push([kind, op]); return kind === 'changing' ? 'op-r' : undefined; });
    expect(await DataSafety.restoreMissing({ sink, reload: vi.fn() })).toBe(true);
    expect(calls).toEqual([['changing', undefined], ['changed', 'op-r']]);
  });

  it('W8: a Restore writes only while it holds the backup lock', async () => {
    const sink = await damagedWithSnapshot();
    const realRequest = navigator.locks.request.bind(navigator.locks);
    let inside = 0;
    const names = [];
    vi.spyOn(navigator.locks, 'request').mockImplementation((name, o, cb) => {
      names.push(name);
      return realRequest(name, o, async (lock) => { inside++; try { return await cb(lock); } finally { inside--; } });
    });
    const realPut = IDBAdapter.put;
    const putsOutside = [];
    vi.spyOn(IDBAdapter, 'put').mockImplementation((...a) => { if (!inside) putsOutside.push(a[0]); return realPut.apply(IDBAdapter, a); });
    expect(await DataSafety.restoreMissing({ sink, reload: vi.fn() })).toBe(true);
    expect(names).toContain('votreader-backup-import');
    expect(putsOutside).toEqual([]);
  });

  it('a progress reset tells the next boot the smaller read ledger is the reader\'s own, with its own token (W9)', async () => {
    const { allowProgressClear } = await import('../stores/store-merge.js');
    allowProgressClear();
    expect(localStorage.getItem(PROGRESS_RESET_KEY)).toBe('1');
    expect(localStorage.getItem(HEALTH_SKIP_KEY)).toBeNull();      // never the whole-library skip
  });
});

// W9 (sweep 2026-10-13): one book's progress reset switched the whole check off for the next
// boot, and an unreadable newest snapshot meant no check at all, so a damaged library became
// the newest snapshot and the good copies rotated out.
describe('W9: the check is never switched off, nor anchored to a broken snapshot', () => {
  const MANY_READ = { ...STATE, readItems: Object.fromEntries(Array.from({ length: 300 }, (_, i) => ['k' + i, 1])) };
  const SIX = Object.fromEntries(Array.from({ length: 6 }, (_, i) => ['bible:ps:3:' + i, [{ id: 'w' + i, groupId: 'w' + i, kind: 'highlight', start: 0, end: 2, created: i, updated: i }]]));
  const LIBRARY = { 'vot-annotations': SIX, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE };
  const progressReset = async () => (await import('../stores/store-merge.js')).allowProgressClear();
  async function snapshotYesterday(sink, library = LIBRARY) {
    await seed(library);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 86400000);
    try { expect(await DataSafety.run({ sink })).toBe('snapshotted'); } finally { vi.useRealTimers(); }
  }

  it("after one book's progress reset, a loss at the next cold start is still found", async () => {
    const sink = memorySink();
    await snapshotYesterday(sink);
    await progressReset();
    await IDBAdapter.put('vot-annotations', 'v', {});  // every highlight gone
    expect(await DataSafety.run({ sink })).toBe('damaged');
    expect(sink.save).toHaveBeenCalledTimes(1);
  });

  it("a progress reset is still the reader's own: the smaller ledger is recorded, not flagged", async () => {
    const sink = memorySink();
    await snapshotYesterday(sink, { ...LIBRARY, 'vot-state': MANY_READ });
    await IDBAdapter.put('vot-state', 'v', { ...MANY_READ, readItems: {} });
    await progressReset();
    expect(await DataSafety.run({ sink })).toBe('snapshotted');
    expect(StorageHealth.getReport().dataMissing).toBeNull();
    expect(await DataSafety.run({ sink })).toBe('fresh');
  });

  it('a newest snapshot cut short (a power cut) is walked past: the library is judged against the newest that reads', async () => {
    const sink = memorySink();
    await snapshotYesterday(sink);
    const good = [...sink.files.keys()][0];
    sink.files.set(snapshotName(snapshotTime(good) + 3600000), sink.files.get(good).slice(0, 300));
    await IDBAdapter.put('vot-annotations', 'v', {});
    const saves = sink.save.mock.calls.length;
    expect(await DataSafety.run({ sink })).toBe('damaged');
    expect(StorageHealth.getReport().dataMissing.name).toBe(good);
    expect(sink.save.mock.calls.length).toBe(saves);
  });

  it('an empty newest file (a web save killed before it wrote) is walked past too', async () => {
    const sink = memorySink();
    await snapshotYesterday(sink);
    const good = [...sink.files.keys()][0];
    sink.files.set(snapshotName(snapshotTime(good) + 3600000), '');
    await IDBAdapter.put('vot-annotations', 'v', {});
    expect(await DataSafety.run({ sink })).toBe('damaged');
    expect(StorageHealth.getReport().dataMissing.name).toBe(good);
  });

  it('a snapshot that could not be read this boot judges nothing and saves nothing', async () => {
    const sink = memorySink();
    await snapshotYesterday(sink);
    sink.read = async () => '';                        // the read failed (the bridge answers '' on an I/O error)
    await IDBAdapter.put('vot-annotations', 'v', {});
    const saves = sink.save.mock.calls.length;
    expect(await DataSafety.run({ sink })).toBe('failed');
    expect(sink.save.mock.calls.length).toBe(saves);
  });

  it('when every snapshot is broken for good, the library is saved so a good copy exists again', async () => {
    const sink = memorySink();
    sink.files.set(snapshotName(Date.now() - 86400000), '{"app":"VOTReader","stores":{"vot-no');
    await seed(LIBRARY);
    expect(await DataSafety.run({ sink })).toBe('snapshotted');
  });
});

describe('the weekly copy in Downloads/VOTReader (dl-weekly)', () => {
  /** DownloadsCopy.kt in memory: keeps the newest 4, like the real one. */
  function fakeBridge(supported = true) {
    const files = [];
    return {
      files,
      weeklyCopySave: vi.fn((json) => { files.push({ json, at: Date.now() }); files.splice(0, Math.max(0, files.length - 4)); return true; }),
      weeklyCopyStatus: () => JSON.stringify({ supported, count: files.length, newestAt: files.length ? files[files.length - 1].at : 0 }),
      weeklyCopyClear: vi.fn(() => { files.length = 0; return true; }),
    };
  }
  const DAY = 86400000;
  async function runOn(day, sink, bridge) {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.UTC(2026, 9, 1, 15) + day * DAY);
    try { return await DataSafety.run({ sink, weeklyBridge: bridge }); } finally { vi.useRealTimers(); }
  }

  it('is written on the first healthy pass, then once a week', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    const bridge = fakeBridge();
    for (let day = 0; day < 15; day++) await runOn(day, sink, bridge);
    expect(bridge.weeklyCopySave).toHaveBeenCalledTimes(3);          // days 0, 7, 14
    expect(DataSafety.weeklyStatus({ bridge })).toMatchObject({ supported: true, on: true, count: 3 });
  });

  it('is never written from a library that looks damaged or empty', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const sink = memorySink();
    const bridge = fakeBridge();
    await runOn(0, sink, bridge);
    for (const n of ['vot-annotations', 'vot-notes', 'vot-links']) await IDBAdapter.put(n, 'v', n === 'vot-links' ? [] : {});
    await IDBAdapter.put('vot-state', 'v', { theme: 'dark', readItems: {} });
    expect(await runOn(8, sink, bridge)).toBe('damaged');
    expect(bridge.weeklyCopySave).toHaveBeenCalledTimes(1);
  });

  it('the reader can turn it off; off the phone app it is unsupported', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const bridge = fakeBridge();
    DataSafety.setWeeklyOn(false);
    expect(localStorage.getItem(WEEKLY_OFF_KEY)).toBe('1');
    await runOn(0, memorySink(), bridge);
    expect(bridge.weeklyCopySave).not.toHaveBeenCalled();
    expect(DataSafety.weeklyStatus({ bridge }).on).toBe(false);
    DataSafety.setWeeklyOn(true);
    expect(DataSafety.weeklyStatus({ bridge }).on).toBe(true);
    expect(DataSafety.weeklyStatus({ bridge: fakeBridge(false) }).supported).toBe(false);
    expect(DataSafety.weeklyStatus().supported).toBe(false);          // no AndroidBridge (the web app)
  });

  it('Clear All deletes every copy, and a pass already saving writes no new one (vs3)', async () => {
    await seed({ 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': STATE });
    const bridge = fakeBridge();
    for (let day = 0; day < 22; day += 7) await runOn(day, memorySink(), bridge);
    expect(DataSafety.weeklyStatus({ bridge }).count).toBe(4);
    // Clear All lands while the day's snapshot is still saving (this module keeps the
    // cleared mark for the page's life: the wipe reloads it).
    const sink = memorySink();
    const save = sink.save;
    let cleared;
    sink.save = vi.fn(async (json) => { cleared = DataSafety.clearWeeklyCopies({ bridge }); return save(json); });
    await runOn(30, sink, bridge);
    expect(cleared).toBe(true);
    expect(bridge.weeklyCopyClear).toHaveBeenCalledTimes(1);
    expect(DataSafety.weeklyStatus({ bridge }).count).toBe(0);
  });

  it('a copy that will not delete is logged; the web app has none to clear', async () => {
    const { DiagnosticLog } = await import('./diagnostic-log.js');
    const warn = vi.spyOn(DiagnosticLog, 'warn');
    expect(DataSafety.clearWeeklyCopies({ bridge: { ...fakeBridge(), weeklyCopyClear: () => false } })).toBe(false);
    expect(warn).toHaveBeenCalledWith('data-health', 'Clear All could not delete the weekly copies in Downloads');
    expect(DataSafety.clearWeeklyCopies()).toBe(true);                // no AndroidBridge (the web app)
  });

  it('is a backup Import accepts, and importing it never prunes journal photos', async () => {
    localStorage.setItem('vot-state', JSON.stringify(STATE));
    const parsed = JSON.parse(weeklyCopyJson({ 'vot-annotations': ANN, 'vot-notes': NOTES }, Date.UTC(2026, 9, 5)));
    expect(validateImportEnvelope(parsed)).toEqual([]);
    expect(parsed.data['vot-state']).toBe(JSON.stringify(STATE));
    expect('media' in parsed).toBe(false);
    const mediaStore = { allIds: vi.fn(async () => ['photo-1']), delete: vi.fn(async () => {}), put: vi.fn(async () => {}) };
    await applyImportPayload(parsed, {
      storesMap: {}, flagMap: {}, mediaStore,
      validateStorePayload: () => [], validateMediaRecord: () => [],
    });
    expect(mediaStore.delete).not.toHaveBeenCalled();
    // The trap it avoids: the same file with media: {} deletes every photo on the phone.
    await applyImportPayload({ ...parsed, media: {} }, {
      storesMap: {}, flagMap: {}, mediaStore,
      validateStorePayload: () => [], validateMediaRecord: () => [],
    });
    expect(mediaStore.delete).toHaveBeenCalledWith('photo-1');
  });
});
