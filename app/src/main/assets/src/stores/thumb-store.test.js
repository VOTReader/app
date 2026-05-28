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
