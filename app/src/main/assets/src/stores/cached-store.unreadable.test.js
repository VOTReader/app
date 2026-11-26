// @ts-nocheck
/* data-3 (audit 11-23): a record whose chunk pieces are gone throws a DataError on every
   read. That store is not slow, it is unreadable: it says so (isUnreadable, storesUnreadable,
   StorageHealth.getStoresUnreadable for the banner), and a later good load clears it. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBAdapter } from './idb-adapter.js';
import { CachedStore, _resetStoreRegistry, storesUnreadable } from './cached-store.js';
import { StorageHealth } from '../utils/storage-health.js';

/** The audit's scen3 record: a manifest whose two pieces were never written. */
const BROKEN = { __votChunks: 1, gen: 'auditgone', n: 2, len: 20000 };

beforeEach(async () => {
  globalThis.StorageHealth = StorageHealth;
  StorageHealth._resetForTests && StorageHealth._resetForTests();
  IDBAdapter._resetForTests();
  await new Promise((r) => { const q = indexedDB.deleteDatabase('votreader'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  _resetStoreRegistry();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('data-3: an unreadable store says so', () => {
  it('REPRO: a manifest with no pieces leaves the store unreadable, named to StorageHealth', async () => {
    await IDBAdapter.put('vot-history', 'v', BROKEN);
    await expect(IDBAdapter.get('vot-history', 'v')).rejects.toMatchObject({ name: 'DataError' });
    const s = CachedStore('vot-history', [], { idb: true });
    s._backgroundRetryDelays = [];
    await s._hydrate();
    expect(s.getState()).toBe('degraded');
    expect(s.isUnreadable()).toBe(true);
    expect(storesUnreadable()).toEqual([s]);
    expect(StorageHealth.getStoresUnreadable()).toEqual(['vot-history']);
  });

  it('a slow or failing store that is not broken is not unreadable', async () => {
    vi.spyOn(IDBAdapter, 'get').mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    const s = CachedStore('vot-notes', {}, { idb: true });
    s._backgroundRetryDelays = [];
    await s._hydrate();
    expect(s.getState()).toBe('degraded');
    expect(s.isUnreadable()).toBe(false);
    expect(storesUnreadable()).toEqual([]);
  });

  it('a retry that finally reads clears it', async () => {
    await IDBAdapter.put('vot-history', 'v', BROKEN);
    const s = CachedStore('vot-history', [], { idb: true });
    s._backgroundRetryDelays = [30];
    await s._hydrate();
    expect(s.isUnreadable()).toBe(true);
    await IDBAdapter.put('vot-history', 'v', [{ key: 'a', at: 1 }]);
    await vi.waitFor(() => expect(s.getState()).toBe('loaded'), { timeout: 2000 });
    expect(s.isUnreadable()).toBe(false);
    expect(StorageHealth.getStoresUnreadable()).toEqual([]);
  });
});
