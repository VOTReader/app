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
import { DataSafety, summarize, score, looksDamaged, mergeForRestore, HEALTH_SKIP_KEY, SKIP_CLEAR_ALL, PROGRESS_RESET_KEY, WEEKLY_OFF_KEY, weeklyCopyJson } from './data-safety.js';
import { validateImportEnvelope } from './import-validators.js';
import { applyImportPayload } from './backup.js';
import { pruneSnapshotNames, snapshotName, snapshotTime, KEEP_DAYS, KEEP_WEEKS } from './snapshot-sink.js';
import { announceLibraryChange, heldByOtherTab } from './other-tabs.js';
import { createBackupFlow } from './backup-flow.js';

// W8: what this page tells the other open tabs (the channel itself: other-tabs.test.js).
vi.mock('./other-tabs.js', async (importOriginal) => ({ ...(/** @type {any} */ (await importOriginal())), announceLibraryChange: vi.fn(), heldByOtherTab: vi.fn(() => false) }));

const ANN = { 'bible:john:3:16': [{ id: 'a1', groupId: 'a1', kind: 'highlight', start: 0, end: 5, color: 'yellow', created: 1, updated: 1 }],
  'letter:x:1': [{ id: 'a2', groupId: 'a2', kind: 'highlight', start: 0, end: 5, color: 'gold', created: 2, updated: 2 }] };
const NOTES = { a1: { groupId: 'a1', body: 'n1', keys: ['bible:john:3:16'], created: 1, updated: 1 },
  a2: { groupId: 'a2', body: 'n2', keys: ['letter:x:1'], created: 2, updated: 2 } };
const LINKS = [{ id: 'l1', source: { key: 'a' }, target: { key: 'b' }, created: 1 }];
const STATE = { theme: 'dark', readItems: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['k' + i, 1])), tabs: [{ id: 't' }] };

/** A sink held in memory, the same shape snapshot-sink returns (the phone app's, unless `kind` says the web's). */
function memorySink(kind = 'android') {
  const files = new Map();
  return {
    kind,
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
  // An ordinary boot: the database was there. (Each case's fake database is created afresh,
  // which would otherwise read as a database the browser threw away - W9.)
  vi.spyOn(IDBAdapter, 'openInfo').mockReturnValue(null);
  _resetStoreRegistry();
  stores = ['vot-annotations', 'vot-notes', 'vot-links', 'vot-state', 'vot-history'].map((n) => {
    const s = CachedStore(n, n === 'vot-links' || n === 'vot-history' ? [] : {}, { idb: true });
    s._resetForTests({ forceLoaded: true });
    return s;
  });
  StorageHealth.setDataMissing(null);
  DataSafety._resetForTests();
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
    // The WebView comes back nearly empty (one read mark: a TOTAL wipe restores on its
    // own since 2026-10-11, see 'wipe-proof' below; anything less asks).
    for (const n of ['vot-annotations', 'vot-notes', 'vot-links']) await IDBAdapter.put(n, 'v', n === 'vot-links' ? [] : {});
    await IDBAdapter.put('vot-state', 'v', { theme: 'dark', readItems: { k0: 1 } });
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

  it('an audio position restore keeps the newer place, not the one further into the recording (sweep v084)', () => {
    // The store's records are { t: seconds into the recording, d, at: last touch }.
    // The snapshot holds minute 40 from yesterday; the reader restarted and is at minute 5 now.
    const live = { v: 1, positions: { x: { t: 300, d: 3600, at: 2000 } } };
    const snap = { v: 1, positions: { x: { t: 2400, d: 3600, at: 1000 }, y: { t: 60, d: 900, at: 500 } } };
    expect(mergeForRestore('vot-audio-positions', live, snap).positions)
      .toEqual({ x: { t: 300, d: 3600, at: 2000 }, y: { t: 60, d: 900, at: 500 } });
    // And the other way: a snapshot touched later than the live row wins, even at an earlier second.
    const newerSnap = { v: 1, positions: { x: { t: 120, d: 3600, at: 3000 } } };
    expect(mergeForRestore('vot-audio-positions', live, newerSnap).positions.x).toEqual({ t: 120, d: 3600, at: 3000 });
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
    await IDBAdapter.put('vot-state', 'v', { theme: 'dark', readItems: { k0: 1 } });
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
    expect(DataSafety.clearWeeklyCopies({ bridge })).toBe(true);
    expect(DataSafety.weeklyStatus({ bridge }).count).toBe(0);
    // Clear All lands while the day's snapshot is still saving.
    DataSafety._resetForTests();
    const sink = memorySink();
    const save = sink.save;
    sink.save = vi.fn(async (json) => { DataSafety.clearWeeklyCopies({ bridge }); return save(json); });
    await runOn(30, sink, bridge);
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

describe('wipe-proof (2026-10-11: the owner phone lost its database again, and Restore left settings and tabs reset)', () => {
  const SNAP_STATE = {
    theme: 'dark', settings: { translation: 'rnkjv', fontScale: '0.9' }, activeTabIdx: 1, activeReadKey: 'mark',
    tabs: [{ screen: 'bible-idx', bookId: 'mark' }, { screen: 'home' }],
    readItems: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['k' + i, 1])),
  };
  const WIPED_STATE = { theme: 'light', settings: { translation: 'nkjv' }, tabs: [{ screen: 'home' }], activeTabIdx: 0, activeReadKey: null, readItems: {} };
  const LIBRARY = { 'vot-annotations': ANN, 'vot-notes': NOTES, 'vot-links': LINKS, 'vot-state': SNAP_STATE, 'vot-history': [{ key: 'h1', ts: 1 }] };
  const byName = (n) => stores.find((s) => s._idbStoreName === n);

  /** Yesterday's healthy boot: a snapshot of `library`. */
  async function snapshotYesterday(sink, library = LIBRARY) {
    await seed(library);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 86400000);
    try { expect(await DataSafety.run({ sink })).toBe('snapshotted'); } finally { vi.useRealTimers(); }
    DataSafety._resetForTests();                       // a new boot
  }
  /** The WebView threw the database away: every store back to its default. */
  async function wipe() {
    for (const n of ['vot-annotations', 'vot-notes']) await IDBAdapter.put(n, 'v', {});
    for (const n of ['vot-links', 'vot-history']) await IDBAdapter.put(n, 'v', []);
    await IDBAdapter.put('vot-state', 'v', WIPED_STATE);
  }
  /** Today's healthy boot with LIBRARY in memory (the stores loaded it). */
  async function healthyBoot(sink) {
    await seed(LIBRARY);
    for (const [n, v] of Object.entries(LIBRARY)) byName(n)._cache = JSON.parse(JSON.stringify(v));
    expect(['snapshotted', 'fresh']).toContain(await DataSafety.run({ sink }));
  }

  it("Restore after a total wipe takes the snapshot's settings, theme and tabs; a partial loss keeps the live ones", () => {
    const st = mergeForRestore('vot-state', WIPED_STATE, SNAP_STATE, { wiped: true });
    expect(st).toMatchObject({ theme: 'dark', settings: SNAP_STATE.settings, tabs: SNAP_STATE.tabs, activeTabIdx: 1, activeReadKey: 'mark' });
    expect(Object.keys(st.readItems)).toHaveLength(30);
    expect(mergeForRestore('vot-state', { ...WIPED_STATE, readItems: { x: 1 } }, SNAP_STATE).theme).toBe('light');
  });

  it('counters keep the higher value, id lists union, and a list of samples is never emptied', () => {
    const lib = mergeForRestore('vot-audio-library', { v: 3, recent: [], saved: [], plays: 71, completions: 2, rate: 1 },
      { v: 3, recent: [], saved: [], plays: 416, completions: 765, rate: 1.25 }, { wiped: true });
    expect(lib).toMatchObject({ plays: 416, completions: 765, rate: 1.25 });
    expect(mergeForRestore('vot-audio-library', { plays: 1, rate: 1 }, { plays: 5, rate: 1.25 }).rate).toBe(1);
    const stats = mergeForRestore('vot-reading-stats', { milestonesUnlocked: ['read-first'], wpmSamples: [] },
      { milestonesUnlocked: ['read-first', 'read-200'], wpmSamples: [210, 230] });
    expect(stats.milestonesUnlocked).toEqual(['read-first', 'read-200']);
    expect(stats.wpmSamples).toEqual([210, 230]);
  });

  it('a total wipe at boot restores on its own, settings and tabs included, and the next boot says from when', async () => {
    const sink = memorySink();
    byName('vot-state')._idbLsShim = (v) => ({ theme: v.theme });     // the boot script's copy
    await snapshotYesterday(sink);
    await wipe();
    localStorage.setItem('vot-state', JSON.stringify({ theme: 'light' }));
    const reload = vi.fn();
    expect(await DataSafety.run({ sink, reload })).toBe('restored');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('vot-state')).theme).toBe('dark');   // no light first paint
    const st = await IDBAdapter.get('vot-state', 'v');
    expect(st).toMatchObject({ theme: 'dark', tabs: SNAP_STATE.tabs, settings: SNAP_STATE.settings });
    expect(Object.keys(st.readItems)).toHaveLength(30);
    expect(Object.keys(await IDBAdapter.get('vot-annotations', 'v')).sort()).toEqual(['bible:john:3:16', 'letter:x:1']);
    expect(await IDBAdapter.get('vot-history', 'v')).toHaveLength(1);
    DataSafety._resetForTests();                       // the reload
    setStoreWriteFence(false);
    expect(['snapshotted', 'fresh']).toContain(await DataSafety.run({ sink }));
    expect(document.getElementById('vot-toast-restored').textContent).toMatch(/restored from the copy saved/i);
    expect(localStorage.getItem('vot-restored-note')).toBeNull();
  });

  it('restores on its own once per snapshot an hour; if the loss comes back, the banner asks', async () => {
    const sink = memorySink();
    await snapshotYesterday(sink);
    await wipe();
    expect(await DataSafety.run({ sink, reload: vi.fn() })).toBe('restored');
    DataSafety._resetForTests(); setStoreWriteFence(false);
    await wipe();
    const reload = vi.fn();
    expect(await DataSafety.run({ sink, reload })).toBe('damaged');
    expect(reload).not.toHaveBeenCalled();
    expect(StorageHealth.getReport().dataMissing).not.toBeNull();
  });

  // Refuter 10-11: an empty library the reader chose (a progress reset, Clear All whose
  // snapshot delete failed, Keep as is) must be recorded, or the boot after next compares
  // it with an older full snapshot and restores over the reader's choice.
  it('a library the reader emptied on purpose (the skip token) is snapshotted, so no later boot restores over it', async () => {
    const sink = memorySink();
    await snapshotYesterday(sink);
    await wipe();                                      // what a reset of everything leaves
    localStorage.setItem(HEALTH_SKIP_KEY, '1');
    expect(await DataSafety.run({ sink })).toBe('snapshotted');
    DataSafety._resetForTests();
    const reload = vi.fn();
    expect(await DataSafety.run({ sink, reload })).toBe('fresh');      // the boot after next
    expect(reload).not.toHaveBeenCalled();
    expect(StorageHealth.getReport().dataMissing).toBeNull();
  });

  it('Keep as is on an empty library is recorded too', async () => {
    const sink = memorySink();
    await snapshotYesterday(sink);
    await wipe();
    StorageHealth.setDataMissing({ name: 'x', at: 0, then: {}, now: {} });
    expect(await DataSafety.acceptCurrent({ sink })).toBe('snapshotted');
    DataSafety._resetForTests();
    expect(await DataSafety.run({ sink, reload: vi.fn() })).toBe('fresh');
  });

  it('the data-health line names a browser reset with its reason, and leaves an ordinary upgrade alone', async () => {
    const { DiagnosticLog } = await import('./diagnostic-log.js');
    const six = Object.fromEntries(Array.from({ length: 6 }, (_, i) => ['bible:ps:2:' + i, [{ id: 'q' + i, groupId: 'q' + i, kind: 'highlight', start: 0, end: 2, created: i, updated: i }]]));
    const sink = memorySink();
    await snapshotYesterday(sink, { ...LIBRARY, 'vot-annotations': six });
    await IDBAdapter.put('vot-annotations', 'v', {});
    const warn = vi.spyOn(DiagnosticLog, 'warn');
    const info = vi.spyOn(IDBAdapter, 'openInfo').mockReturnValue({ oldVersion: 12, newVersion: 13, dataLoss: 'none', dataLossMessage: '', at: 1 });
    expect(await DataSafety.run({ sink, reload: vi.fn() })).toBe('damaged');
    const upgradeLine = warn.mock.calls.find((c) => /library looks smaller/.test(c[1]))[1];
    expect(upgradeLine).not.toMatch(/database|reset/);
    warn.mockClear();
    DataSafety._resetForTests();
    info.mockReturnValue({ oldVersion: 0, newVersion: 13, dataLoss: 'total', dataLossMessage: 'IndexedDB (database was corrupt): Unknown corruption', at: 1 });
    await DataSafety.run({ sink, reload: vi.fn() });
    expect(warn.mock.calls.find((c) => /library looks smaller/.test(c[1]))[1]).toMatch(/database created this boot, dataLoss total \(IndexedDB \(database was corrupt\): Unknown corruption\)/);
  });

  it('a partial loss still asks (the banner); it never restores on its own', async () => {
    const sink = memorySink();
    const six = Object.fromEntries(Array.from({ length: 6 }, (_, i) => ['bible:ps:1:' + i, [{ id: 'p' + i, groupId: 'p' + i, kind: 'highlight', start: 0, end: 2, created: i, updated: i }]]));
    await snapshotYesterday(sink, { ...LIBRARY, 'vot-annotations': six });
    await IDBAdapter.put('vot-annotations', 'v', {});  // every highlight gone, notes and read marks intact
    const reload = vi.fn();
    expect(await DataSafety.run({ sink, reload })).toBe('damaged');
    expect(reload).not.toHaveBeenCalled();
  });

  describe('saveLatest: a snapshot every time the reader leaves the app', () => {
    it("does nothing before this boot's health pass found the library healthy", async () => {
      expect(await DataSafety.saveLatest({ sink: memorySink() })).toBe('off');
    });

    it('saves what the stores hold in memory, a save still in flight included', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      const before = sink.save.mock.calls.length;
      byName('vot-annotations')._cache = { ...ANN, 'bible:gen:1:1': [{ id: 'a9', groupId: 'a9', kind: 'highlight', start: 0, end: 3, created: 9, updated: 9 }] };
      expect(await DataSafety.saveLatest({ sink })).toBe('snapshotted');
      expect(sink.save.mock.calls.length).toBe(before + 1);
      const snap = JSON.parse(sink.save.mock.calls.at(-1)[0]);
      expect(Object.keys(snap.stores['vot-annotations'])).toContain('bible:gen:1:1');
      expect(snap.summary.highlights).toBe(3);
      expect(await DataSafety.saveLatest({ sink })).toBe('unchanged');
    });

    it('a library in memory under half of the last snapshot raises the finding and is not saved', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      const before = sink.save.mock.calls.length;
      byName('vot-annotations')._cache = {};
      byName('vot-notes')._cache = {};
      byName('vot-state')._cache = { ...SNAP_STATE, readItems: {} };
      expect(await DataSafety.saveLatest({ sink })).toBe('damaged');
      expect(sink.save.mock.calls.length).toBe(before);
      expect(StorageHealth.getReport().dataMissing).not.toBeNull();
      expect(await DataSafety.saveLatest({ sink })).toBe('off');       // nothing more until the reader chooses
    });

    it('a progress reset the reader asked for (its token) is saved, not flagged', async () => {
      const { allowProgressClear } = await import('../stores/store-merge.js');
      const sink = memorySink();
      await healthyBoot(sink);
      byName('vot-state')._cache = { ...SNAP_STATE, readItems: {} };
      allowProgressClear();
      expect(await DataSafety.saveLatest({ sink })).toBe('snapshotted');
      expect(StorageHealth.getReport().dataMissing).toBeNull();
    });

    it('never while a restore, an import or Clear All has fenced the stores', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      byName('vot-notes')._cache = { ...NOTES, a3: { groupId: 'a3', body: 'n3', created: 3, updated: 3 } };
      setStoreWriteFence(true, { storesOnly: true });
      expect(await DataSafety.saveLatest({ sink })).toBe('off');
    });

    it('leaving the app (the page goes hidden) takes one', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      const before = sink.save.mock.calls.length;
      byName('vot-notes')._cache = { ...NOTES, a3: { groupId: 'a3', body: 'n3', created: 3, updated: 3 } };
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      try {
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.waitFor(() => expect(sink.save.mock.calls.length).toBe(before + 1));
      } finally {
        delete document.visibilityState;
      }
    });

    it('a leave while a save is in flight saves again once it lands', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      const before = sink.save.mock.calls.length;
      byName('vot-notes')._cache = { ...NOTES, a5: { groupId: 'a5', body: 'n5', created: 5, updated: 5 } };
      const first = DataSafety.saveLatest({ sink });
      byName('vot-notes')._cache = { ...NOTES, a5: { groupId: 'a5', body: 'n5', created: 5, updated: 5 }, a6: { groupId: 'a6', body: 'n6', created: 6, updated: 6 } };
      await DataSafety.saveLatest({ sink });           // the second leave, during the first save
      await first;
      await vi.waitFor(() => expect(sink.save.mock.calls.length).toBe(before + 2));
      expect(Object.keys(JSON.parse(sink.save.mock.calls.at(-1)[0]).stores['vot-notes'])).toContain('a6');
    });

    it('on the web it snapshots the database, not this tab\'s possibly stale memory', async () => {
      const sink = memorySink('opfs');
      await healthyBoot(sink);
      const before = sink.save.mock.calls.length;
      // Another tab added a note: it is in the database, not in this tab's memory.
      await IDBAdapter.put('vot-notes', 'v', { ...NOTES, b1: { groupId: 'b1', body: 'other tab', created: 7, updated: 7 } });
      expect(await DataSafety.saveLatest({ sink })).toBe('snapshotted');
      expect(sink.save.mock.calls.length).toBe(before + 1);
      expect(Object.keys(JSON.parse(sink.save.mock.calls.at(-1)[0]).stores['vot-notes'])).toContain('b1');
    });

    it('a page whose database another tab deleted or upgraded (versionchange) saves nothing more', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      byName('vot-notes')._cache = { ...NOTES, a7: { groupId: 'a7', body: 'n7', created: 7, updated: 7 } };
      const db = await IDBAdapter.open();
      db.onversionchange(new Event('versionchange'));  // Clear All in another tab deletes the database
      expect(await DataSafety.saveLatest({ sink })).toBe('off');
    });

    it('the browser closing the database mid-session takes one from memory at once', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      const before = sink.save.mock.calls.length;
      byName('vot-notes')._cache = { ...NOTES, a4: { groupId: 'a4', body: 'n4', created: 4, updated: 4 } };
      const db = await IDBAdapter.open();
      db.onclose();                                    // what Chromium does when it finds the store corrupt
      await vi.waitFor(() => expect(sink.save.mock.calls.length).toBe(before + 1));
      expect(Object.keys(JSON.parse(sink.save.mock.calls.at(-1)[0]).stores['vot-notes'])).toContain('a4');
    });
  });

  // W9 (sweep 2026-10-13): one book's progress reset switched the whole check off for the next
  // boot, and an unreadable newest snapshot meant no check at all, so a wipe or a damaged
  // library became the newest snapshot and the good copies rotated out.
  describe('W9: wipe detection is never switched off, nor anchored to a broken snapshot', () => {
    const MANY_READ = { ...SNAP_STATE, readItems: Object.fromEntries(Array.from({ length: 300 }, (_, i) => ['k' + i, 1])) };
    const SIX = Object.fromEntries(Array.from({ length: 6 }, (_, i) => ['bible:ps:3:' + i, [{ id: 'w' + i, groupId: 'w' + i, kind: 'highlight', start: 0, end: 2, created: i, updated: i }]]));
    const FRESH = { oldVersion: 0, newVersion: 13, dataLoss: 'total', dataLossMessage: 'IndexedDB (database was corrupt): Unknown corruption', at: 1 };
    const progressReset = async () => (await import('../stores/store-merge.js')).allowProgressClear();

    it("after one book's progress reset, a wipe at the next cold start still restores on its own", async () => {
      const sink = memorySink();
      await snapshotYesterday(sink);
      await progressReset();                             // then the app is closed
      await wipe();                                      // and the WebView throws the database away
      const reload = vi.fn();
      expect(await DataSafety.run({ sink, reload })).toBe('restored');
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('a progress reset is still the reader\'s own: the smaller ledger is recorded, and no later boot restores over it', async () => {
      const sink = memorySink();
      await snapshotYesterday(sink, { ...LIBRARY, 'vot-state': MANY_READ });
      await IDBAdapter.put('vot-state', 'v', { ...MANY_READ, readItems: {} });   // Clear all progress
      await progressReset();
      const reload = vi.fn();
      expect(await DataSafety.run({ sink, reload })).toBe('snapshotted');
      expect(StorageHealth.getReport().dataMissing).toBeNull();
      DataSafety._resetForTests();
      expect(await DataSafety.run({ sink, reload })).toBe('fresh');
      expect(reload).not.toHaveBeenCalled();
    });

    it('a progress reset never hides the loss of anything else when the reader leaves', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      await progressReset();
      byName('vot-annotations')._cache = {};
      byName('vot-notes')._cache = {};
      byName('vot-links')._cache = [];
      byName('vot-state')._cache = { ...SNAP_STATE, readItems: {} };
      const saves = sink.save.mock.calls.length;
      expect(await DataSafety.saveLatest({ sink })).toBe('damaged');
      expect(sink.save.mock.calls.length).toBe(saves);
    });

    it('a database created or reset this boot is a loss whatever the token: an import\'s or a progress reset\'s', async () => {
      const readsOnly = { 'vot-state': MANY_READ, 'vot-history': [{ key: 'h1', ts: 1 }] };   // mostly read marks
      for (const token of ['import', 'progress']) {
        const sink = memorySink();
        await snapshotYesterday(sink, readsOnly);
        if (token === 'import') localStorage.setItem(HEALTH_SKIP_KEY, '1'); else await progressReset();
        await wipe();
        vi.mocked(IDBAdapter.openInfo).mockReturnValue(FRESH);
        const reload = vi.fn();
        expect(await DataSafety.run({ sink, reload }), token).toBe('restored');
        expect(Object.keys((await IDBAdapter.get('vot-state', 'v')).readItems), token).toHaveLength(300);
        vi.mocked(IDBAdapter.openInfo).mockReturnValue(null);
        localStorage.clear(); DataSafety._resetForTests(); setStoreWriteFence(false); StorageHealth.setDataMissing(null);
      }
    });

    it("Clear All's own token holds on the fresh database Clear All made (when its snapshot delete failed)", async () => {
      const sink = memorySink();
      await snapshotYesterday(sink);
      await wipe();
      localStorage.setItem(HEALTH_SKIP_KEY, SKIP_CLEAR_ALL);
      vi.mocked(IDBAdapter.openInfo).mockReturnValue({ oldVersion: 0, newVersion: 13, dataLoss: 'none', dataLossMessage: '', at: 1 });
      const reload = vi.fn();
      expect(await DataSafety.run({ sink, reload })).toBe('snapshotted');
      expect(reload).not.toHaveBeenCalled();
      expect(StorageHealth.getReport().dataMissing).toBeNull();
    });

    it('a newest snapshot cut short (a power cut) is walked past: the library is judged against the newest that reads', async () => {
      const sink = memorySink();
      await snapshotYesterday(sink, { ...LIBRARY, 'vot-annotations': SIX });
      const good = [...sink.files.keys()][0];
      sink.files.set(snapshotName(snapshotTime(good) + 3600000), sink.files.get(good).slice(0, 300));
      await IDBAdapter.put('vot-annotations', 'v', {});  // every highlight gone, the rest intact
      const saves = sink.save.mock.calls.length;
      expect(await DataSafety.run({ sink, reload: vi.fn() })).toBe('damaged');
      expect(StorageHealth.getReport().dataMissing.name).toBe(good);
      expect(sink.save.mock.calls.length).toBe(saves);  // the damaged library never becomes the baseline
    });

    it('a newest snapshot whose stores is no object is walked past, as SnapshotStore.kt judges it (refuter round 3)', async () => {
      const sink = memorySink();
      await snapshotYesterday(sink, { ...LIBRARY, 'vot-annotations': SIX });
      const good = [...sink.files.keys()][0];
      sink.files.set(snapshotName(snapshotTime(good) + 3600000), '{"app":"VOTReader","stores":[1]}');
      await IDBAdapter.put('vot-annotations', 'v', {});
      expect(await DataSafety.run({ sink, reload: vi.fn() })).toBe('damaged');
      expect(StorageHealth.getReport().dataMissing.name).toBe(good);
    });

    it('an empty newest file (a web save killed before it wrote) is walked past too', async () => {
      const sink = memorySink('opfs');
      await snapshotYesterday(sink, { ...LIBRARY, 'vot-annotations': SIX });
      const good = [...sink.files.keys()][0];
      sink.files.set(snapshotName(snapshotTime(good) + 3600000), '');
      await IDBAdapter.put('vot-annotations', 'v', {});
      expect(await DataSafety.run({ sink, reload: vi.fn() })).toBe('damaged');
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

    it('every snapshot broken for good beside an empty library: the empty library is saved as the good copy (refuter round 2)', async () => {
      const sink = memorySink();
      sink.files.set(snapshotName(Date.now() - 86400000), '{"app":"VOTReader","stores":{"vot-no');
      expect(await DataSafety.run({ sink })).toBe('snapshotted');
      expect(sink.save).toHaveBeenCalledTimes(1);
    });

    it('the leave check offers the newest snapshot that reads', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      const good = [...sink.files.keys()].sort().reverse()[0];
      sink.files.set(snapshotName(snapshotTime(good) + 60000), '{"app":"VOTReader","stor');
      byName('vot-annotations')._cache = {};
      byName('vot-notes')._cache = {};
      byName('vot-links')._cache = [];
      expect(await DataSafety.saveLatest({ sink })).toBe('damaged');
      expect(StorageHealth.getReport().dataMissing.name).toBe(good);
    });
  });

  // sweep v034: Clear All deleted the safety copies before its database deletes and left this
  // page marked cleared, so one whose library delete failed left the library on the device with
  // no copy of it, and none taken again until a reload.
  describe('sweep v034: Clear All is marked before its deletes, and one that fails is not', () => {
    const NOTE8 = { ...NOTES, a8: { groupId: 'a8', body: 'n8', created: 8, updated: 8 } };
    /** A delete's versionchange (newVersion null), or an upgrade's. @param {number | null} newVersion */
    const versionChange = (newVersion) => Object.assign(new Event('versionchange'), { newVersion });

    it('nothing is saved while Clear All runs; once it fails, the session saves again', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      byName('vot-notes')._cache = NOTE8;
      DataSafety.beginClear();
      expect(await DataSafety.saveLatest({ sink })).toBe('off');
      // Its own deleteDatabase told this page's connection to close before it failed.
      (await IDBAdapter.open()).onversionchange(versionChange(null));
      DataSafety.abortClear();
      expect(await DataSafety.saveLatest({ sink })).toBe('snapshotted');
    });

    it('a boot pass already reading when Clear All begins saves nothing', async () => {
      await seed(LIBRARY);
      const sink = memorySink();
      const list = sink.list;
      sink.list = async () => { DataSafety.beginClear(); return list(); };
      expect(await DataSafety.run({ sink })).toBe('empty');
      expect(sink.save).not.toHaveBeenCalled();
    });

    it('a newer version upgrading the database meanwhile still stops the saves', async () => {
      const sink = memorySink();
      await healthyBoot(sink);
      byName('vot-notes')._cache = NOTE8;
      DataSafety.beginClear();
      (await IDBAdapter.open()).onversionchange(versionChange(IDBAdapter.DB_VERSION + 1));
      DataSafety.abortClear();
      expect(await DataSafety.saveLatest({ sink })).toBe('off');
    });

    describe('end to end, through the Clear All flow on the phone app', () => {
      /** SnapshotStore.kt and DownloadsCopy.kt in memory, behind the AndroidBridge methods the sinks call. */
      function phoneBridge() {
        const snaps = new Map();
        const weekly = [];
        return {
          snaps, weekly,
          snapshotSave: (json) => { snaps.set(snapshotName(Date.now() + snaps.size * 1000), json); return true; },
          snapshotList: () => JSON.stringify([...snaps.keys()].sort().reverse().map((name) => ({ name, at: snapshotTime(name), size: snaps.get(name).length }))),
          snapshotRead: (name) => snaps.get(name) || '',
          snapshotClear: () => { snaps.clear(); return true; },
          weeklyCopySave: (json) => { weekly.push({ json, at: Date.now() }); return true; },
          weeklyCopyStatus: () => JSON.stringify({ supported: true, count: weekly.length, newestAt: weekly.length ? weekly[weekly.length - 1].at : 0 }),
          weeklyCopyClear: () => { weekly.length = 0; return true; },
        };
      }
      const GLOBALS = ['AndroidBridge', 'DataSafety', 'showToast', 'setStoreWriteFence'];
      afterEach(() => { for (const g of GLOBALS) delete globalThis[g]; });

      it('a library delete that fails leaves the library, its snapshots and its weekly copy, and the next leave snapshots it', async () => {
        const bridge = phoneBridge();
        Object.assign(globalThis, { AndroidBridge: bridge, DataSafety, showToast: vi.fn(), setStoreWriteFence });
        await healthyBoot(undefined);                  // the phone app's own sinks
        expect(bridge.snaps.size).toBe(1);
        expect(bridge.weekly.length).toBe(1);
        // The library's delete closes this page's own connection (versionchange), then fails.
        const db = await IDBAdapter.open();
        vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((name) => {
          const req = {};
          queueMicrotask(() => {
            if (name !== 'votreader') { req.onsuccess(); return; }
            db.onversionchange(versionChange(null));
            req.onerror();
          });
          return req;
        });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const flow = createBackupFlow({
          busyRef: { current: false }, reloadPendingRef: { current: false }, reloadTimerRef: { current: 0 },
          setBusy: () => {}, setVerifyReport: () => {}, confirmImport: async () => true, diagnosticLog: [],
        });
        await flow.clearAllPersonalData();
        expect(globalThis.showToast).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Clear did not finish. Please try again.' }));
        expect(bridge.snaps.size).toBe(1);
        expect(bridge.weekly.length).toBe(1);
        byName('vot-notes')._cache = NOTE8;
        expect(await DataSafety.saveLatest()).toBe('snapshotted');
        expect(bridge.snaps.size).toBe(2);
      });
    });
  });
});
