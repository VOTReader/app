import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  THUMB_DB, THUMB_STORE, openThumbDB, idbPut, idbDelete, idbReadAll,
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
