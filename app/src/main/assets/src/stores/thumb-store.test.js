import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  THUMB_DB, THUMB_STORE, openThumbDB, idbPut, idbDelete, idbReadAll, idbAllKeys,
} from './thumb-store.js';

beforeEach(async () => {
  const db = await openThumbDB();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(THUMB_STORE, 'readwrite');
    tx.objectStore(THUMB_STORE).clear();
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => resolve(undefined);
  });
});

describe('ThumbStore — openThumbDB', () => {
  it('returns an IDBDatabase instance', async () => {
    const db = await openThumbDB();
    expect(db).not.toBeNull();
    expect(db.name).toBe(THUMB_DB);
  });

  it('caches the connection (returns same promise on second call)', async () => {
    const p1 = openThumbDB();
    const p2 = openThumbDB();
    expect(p1).toBe(p2);
    const [db1, db2] = await Promise.all([p1, p2]);
    expect(db1).toBe(db2);
  });

  it('creates the thumbs object store on first open', async () => {
    const db = await openThumbDB();
    expect(db.objectStoreNames.contains(THUMB_STORE)).toBe(true);
  });
});

describe('ThumbStore — idbPut + idbReadAll', () => {
  it('stores and reads a single entry', async () => {
    await idbPut('tab-1', 'data:image/png;base64,abc');
    const all = await idbReadAll();
    expect(all['tab-1']).toBe('data:image/png;base64,abc');
  });

  it('stores multiple entries', async () => {
    await idbPut('tab-1', 'thumb-1');
    await idbPut('tab-2', 'thumb-2');
    await idbPut('tab-3', 'thumb-3');
    const all = await idbReadAll();
    expect(Object.keys(all).sort()).toEqual(['tab-1', 'tab-2', 'tab-3']);
    expect(all['tab-2']).toBe('thumb-2');
  });

  it('overwrites existing key on re-put', async () => {
    await idbPut('tab-1', 'old');
    await idbPut('tab-1', 'new');
    const all = await idbReadAll();
    expect(all['tab-1']).toBe('new');
  });

  it('idbReadAll returns {} when store is empty', async () => {
    const all = await idbReadAll();
    expect(all).toEqual({});
  });

  it('stores non-string values (objects)', async () => {
    await idbPut('tab-1', { url: 'data:...', ts: 12345 });
    const all = await idbReadAll();
    expect(all['tab-1']).toEqual({ url: 'data:...', ts: 12345 });
  });
});

describe('ThumbStore — idbDelete', () => {
  it('removes an existing entry', async () => {
    await idbPut('tab-1', 'thumb-1');
    await idbPut('tab-2', 'thumb-2');
    await idbDelete('tab-1');
    const all = await idbReadAll();
    expect(all['tab-1']).toBeUndefined();
    expect(all['tab-2']).toBe('thumb-2');
  });

  it('no-ops on a non-existent key (no error)', async () => {
    await idbDelete('does-not-exist');
    const all = await idbReadAll();
    expect(all).toEqual({});
  });
});

describe('ThumbStore — error resilience', () => {
  it('idbPut resolves (not rejects) on best-effort contract', async () => {
    await expect(idbPut('k', 'v')).resolves.toBeUndefined();
  });

  it('idbDelete resolves (not rejects) on best-effort contract', async () => {
    await expect(idbDelete('k')).resolves.toBeUndefined();
  });

  it('idbReadAll resolves to {} on empty store', async () => {
    await expect(idbReadAll()).resolves.toEqual({});
  });
});


/* boot-performance-5 follow-up (Verifier, 2026-09-04). The live-key filter was
   deleting every non-matching row inline, in a readwrite cursor pass, on the
   MOUNT path. `liveKeys` is derived from `tabs`, which comes from the persisted
   `vot-state` — and storage-backup-3 proves that store can mount on boot
   defaults: a 3 s hydration timeout drops it to 'degraded' and the app renders
   a single synthetic tab. On that path the filter's key set is one key and the
   pass deletes every real thumbnail, committed, before the true state arrives.
   Thumbnails regenerate, so it is not data loss in the .votbak sense, but it is
   silent, it is on the boot path, and nothing about `tabsEnabled` prevents it.

   The filter is now a READ filter: non-live rows are skipped, never deleted.
   Deleting dead rows stays the debounced GC effect's job — it depends on
   `[tabs, tabThumbnails]`, so it re-runs once the real tabs hydrate, which is
   exactly the correctness the mount pass could not have. */
describe('ThumbStore — idbReadAll(liveKeys) filters without deleting (boot-performance-5)', () => {
  it('skips a non-live row from the result but leaves it in the store', async () => {
    await idbPut('tab:live', 'x'.repeat(1200));
    await idbPut('tab:other', 'y'.repeat(1200));

    const filtered = await idbReadAll(['tab:live']);
    expect(Object.keys(filtered)).toEqual(['tab:live']);

    // The row the filter passed over must still be there — a later read with a
    // wider key set (the real tabs, once hydrated) has to find it.
    const all = await idbReadAll();
    expect(Object.keys(all).sort()).toEqual(['tab:live', 'tab:other']);
  });

  it('a one-key filter on a full store deletes nothing (the degraded-boot shape)', async () => {
    for (const k of ['tab:a', 'tab:b', 'tab:c', 'tab:d']) await idbPut(k, 'z'.repeat(1200));

    // vot-state came back degraded, so the app is rendering one synthetic tab.
    await idbReadAll(['tab:default-tab']);

    const all = await idbReadAll();
    expect(Object.keys(all).sort()).toEqual(['tab:a', 'tab:b', 'tab:c', 'tab:d']);
  });
});

/** Settings -> Clear All My Data's exact call, isolated from the screen. */
function deleteThumbDatabase() {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(THUMB_DB);
    req.onsuccess = () => resolve('success');
    req.onblocked = () => resolve('blocked');
    req.onerror = () => resolve('error');
  });
}

describe('ThumbStore — storage-backup-4: Clear All My Data must actually delete vot-thumbs', () => {
  it('REPRO: deleteDatabase succeeds (not blocked) while a connection from openThumbDB is still live', async () => {
    const db = await openThumbDB();
    expect(db).not.toBeNull();
    // Without an onversionchange handler, this open connection blocks the
    // delete exactly the way SettingsScreen's Clear All does in production —
    // openThumbDB's promise is cached for the life of the page, so by the
    // time the owner taps Clear All a connection is always still open.
    expect(await deleteThumbDatabase()).toBe('success');
  });

  it('a later openThumbDB() call reopens a fresh, working connection after the database was deleted', async () => {
    await openThumbDB();
    await deleteThumbDatabase();
    // The cached promise must have been dropped by onversionchange, or this
    // resolves the STALE (now-closed) connection instead of a live one.
    const db2 = await openThumbDB();
    expect(db2).not.toBeNull();
    expect(db2.name).toBe(THUMB_DB);
    await idbPut('proof', 'alive');
    const all = await idbReadAll();
    expect(all.proof).toBe('alive');
  });
});

describe('ThumbStore — idbAllKeys (the GC sweep names what is ON DISK)', () => {
  it('lists every stored key as a string, without needing the values', async () => {
    await idbPut('tab:a', 'x');
    await idbPut('tab:b', 'y');
    expect((await idbAllKeys()).sort()).toEqual(['tab:a', 'tab:b']);
  });

  it('is empty on an empty store', async () => {
    expect(await idbAllKeys()).toEqual([]);
  });
});

/* Best-effort contract, failure side: every helper resolves (never rejects) when
   IDB misbehaves — a blank tab card beats a crashed Tabs overview. The live
   connection is real (fake-indexeddb); only its transaction() is made to fail. */
describe('ThumbStore — transaction failures resolve quietly', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  /** A transaction stand-in whose request / tx fires the named failure. */
  function failingTx(kind) {
    const req = {};
    const tx = {
      objectStore: () => ({
        put: () => req, delete: () => req,
        getAllKeys: () => req, openCursor: () => req,
      }),
    };
    queueMicrotask(() => {
      if (kind === 'tx-error') tx.onerror && tx.onerror();
      if (kind === 'tx-abort') tx.onabort && tx.onabort();
      if (kind === 'req-error') req.onerror && req.onerror();
    });
    return /** @type {any} */ (tx);
  }

  it('a throwing transaction() resolves every helper to its empty value', async () => {
    const db = await openThumbDB();
    vi.spyOn(db, 'transaction').mockImplementation(() => { throw new Error('InvalidStateError'); });
    await expect(idbPut('k', 'v')).resolves.toBeUndefined();
    await expect(idbDelete('k')).resolves.toBeUndefined();
    await expect(idbAllKeys()).resolves.toEqual([]);
    await expect(idbReadAll()).resolves.toEqual({});
  });

  it('idbPut resolves on a transaction error or abort (quota)', async () => {
    const db = await openThumbDB();
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => failingTx('tx-error'))
      .mockImplementationOnce(() => failingTx('tx-abort'));
    await expect(idbPut('k', 'v')).resolves.toBeUndefined();
    await expect(idbPut('k', 'v')).resolves.toBeUndefined();
  });

  it('idbDelete resolves on a transaction error', async () => {
    const db = await openThumbDB();
    vi.spyOn(db, 'transaction').mockImplementation(() => failingTx('tx-error'));
    await expect(idbDelete('k')).resolves.toBeUndefined();
  });

  it('idbAllKeys resolves [] on a request error', async () => {
    const db = await openThumbDB();
    vi.spyOn(db, 'transaction').mockImplementation(() => failingTx('req-error'));
    await expect(idbAllKeys()).resolves.toEqual([]);
  });

  it('idbReadAll resolves what it has so far on a cursor error', async () => {
    const db = await openThumbDB();
    vi.spyOn(db, 'transaction').mockImplementation(() => failingTx('req-error'));
    await expect(idbReadAll()).resolves.toEqual({});
  });
});

/* No IDB at all (private mode, a blocked origin): the singleton resolves null and
   every helper degrades to its empty value. Needs a FRESH module instance, since
   the connection promise is cached for the life of the module. */
describe('ThumbStore — IDB unavailable', () => {
  const realIDB = globalThis.indexedDB;
  afterEach(() => { globalThis.indexedDB = realIDB; vi.resetModules(); });

  async function freshModuleWith(idb) {
    vi.resetModules();
    globalThis.indexedDB = idb;
    return import('./thumb-store.js');
  }

  it('indexedDB.open throwing resolves null, and the helpers resolve empty', async () => {
    const m = await freshModuleWith({ open: () => { throw new Error('SecurityError'); } });
    await expect(m.openThumbDB()).resolves.toBeNull();
    await expect(m.idbPut('k', 'v')).resolves.toBeUndefined();
    await expect(m.idbDelete('k')).resolves.toBeUndefined();
    await expect(m.idbAllKeys()).resolves.toEqual([]);
    await expect(m.idbReadAll(['k'])).resolves.toEqual({});
  });

  it('an open request that errors resolves null', async () => {
    const m = await freshModuleWith({
      open: () => { const req = {}; queueMicrotask(() => req.onerror()); return req; },
    });
    await expect(m.openThumbDB()).resolves.toBeNull();
  });
});
