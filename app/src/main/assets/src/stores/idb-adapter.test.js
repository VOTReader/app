/* W2.1 — IDB adapter vitest.
   ────────────────────────────
   Covers the generic CRUD surface + error semantics that CachedStore
   (W2.2) layers write-through + hydration semantics on top of. Three
   test groups:

     1. Happy-path CRUD with real IDB (fake-indexeddb backs it).
     2. Schema + versionchange + concurrency invariants.
     3. Error injection (QuotaExceededError preserved, AbortError
        retried) using hand-rolled IDBRequest stubs — fake-indexeddb
        doesn't simulate quota.

   fake-indexeddb is scoped to THIS file (local 'fake-indexeddb/auto'
   import) so unrelated tests don't pick up a global indexedDB.
*/

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBAdapter } from './idb-adapter.js';

// Reset module-private state + delete the test DB between every test
// so each spec sees a clean schema.
async function resetIdb() {
  IDBAdapter._resetForTests();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(IDBAdapter.DB_NAME);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => resolve(undefined);
    req.onblocked = () => resolve(undefined);
  });
}

beforeEach(async () => {
  await resetIdb();
});

afterEach(async () => {
  await resetIdb();
});

describe('IDBAdapter — open + schema', () => {
  it('open() resolves to an IDBDatabase', async () => {
    const db = await IDBAdapter.open();
    expect(db).toBeDefined();
    expect(typeof db.transaction).toBe('function');
  });

  it('open() is cached — second call returns the same promise', async () => {
    const p1 = IDBAdapter.open();
    const p2 = IDBAdapter.open();
    expect(p1).toBe(p2);
    await p1;
  });

  it('schema v1 creates every store from STORE_NAMES', async () => {
    const db = await IDBAdapter.open();
    for (const name of IDBAdapter.STORE_NAMES) {
      expect(db.objectStoreNames.contains(name)).toBe(true);
    }
  });

  it('STORE_NAMES is frozen', () => {
    expect(Object.isFrozen(IDBAdapter.STORE_NAMES)).toBe(true);
  });

  it('STORE_NAMES contains the 17 vot-* keys plus meta', () => {
    const expected = new Set([
      'vot-welcomed', 'vot-about-seen', 'vot-garden-warning-acked',
      'vot-ann-migrated', 'vot-recent-nav', 'vot-prophecy-cards',
      'vot-journal', 'vot-journal-notebooks', 'vot-journal-index',
      'vot-journal-stats', 'vot-bookmarks', 'vot-notebooks',
      'vot-history', 'vot-state', 'vot-annotations', 'vot-notes',
      'vot-links', 'meta',
    ]);
    expect(new Set(IDBAdapter.STORE_NAMES)).toEqual(expected);
    expect(IDBAdapter.STORE_NAMES.length).toBe(18);
  });

  it('DB_NAME is "votreader" — separate from vot-journal-media and vot-thumbs', () => {
    expect(IDBAdapter.DB_NAME).toBe('votreader');
    expect(IDBAdapter.DB_NAME).not.toBe('vot-journal-media');
    expect(IDBAdapter.DB_NAME).not.toBe('vot-thumbs');
  });

  it('DB_VERSION is 1', () => {
    expect(IDBAdapter.DB_VERSION).toBe(1);
  });

  it('reopening after _resetForTests creates a fresh promise', async () => {
    const db1 = await IDBAdapter.open();
    IDBAdapter._resetForTests();
    const db2 = await IDBAdapter.open();
    expect(db2).toBeDefined();
    expect(db1).not.toBe(db2);
  });
});

describe('IDBAdapter — get/put/delete round-trips', () => {
  it('put + get round-trips a string', async () => {
    await IDBAdapter.put('vot-welcomed', 'v', 'true');
    const v = await IDBAdapter.get('vot-welcomed', 'v');
    expect(v).toBe('true');
  });

  it('put + get round-trips an array of objects', async () => {
    const bookmarks = [
      { id: 'bkm_1', hlKey: 'letter:wide-path:2', label: 'Wide Path' },
      { id: 'bkm_2', hlKey: 'bible:genesis:1:1', label: 'Genesis 1:1' },
    ];
    await IDBAdapter.put('vot-bookmarks', 'v', bookmarks);
    const got = await IDBAdapter.get('vot-bookmarks', 'v');
    expect(got).toEqual(bookmarks);
  });

  it('put + get round-trips a nested object (vot-state shape)', async () => {
    const state = {
      theme: 'light',
      settings: { fontStyle: 'modern', showSurpriseButton: true },
      tabs: [{ id: 't1', screen: 'home' }],
    };
    await IDBAdapter.put('vot-state', 'v', state);
    const got = await IDBAdapter.get('vot-state', 'v');
    expect(got).toEqual(state);
  });

  it('get on a missing key resolves to undefined', async () => {
    const v = await IDBAdapter.get('vot-bookmarks', 'never-existed');
    expect(v).toBeUndefined();
  });

  it('delete removes a value', async () => {
    await IDBAdapter.put('vot-welcomed', 'v', '1');
    await IDBAdapter.delete('vot-welcomed', 'v');
    const v = await IDBAdapter.get('vot-welcomed', 'v');
    expect(v).toBeUndefined();
  });

  it('delete is idempotent for missing keys', async () => {
    await expect(IDBAdapter.delete('vot-welcomed', 'never-existed')).resolves.toBeUndefined();
  });

  it('put(undefined) routes to delete (treats undefined as absence)', async () => {
    await IDBAdapter.put('vot-welcomed', 'v', '1');
    await IDBAdapter.put('vot-welcomed', 'v', undefined);
    const v = await IDBAdapter.get('vot-welcomed', 'v');
    expect(v).toBeUndefined();
  });

  it('put(null) stores null (distinguishable from undefined)', async () => {
    await IDBAdapter.put('vot-state', 'v', null);
    const v = await IDBAdapter.get('vot-state', 'v');
    expect(v).toBeNull();
  });

  it('put overwrites a previous value at the same key', async () => {
    await IDBAdapter.put('vot-bookmarks', 'v', [{ id: 'first' }]);
    await IDBAdapter.put('vot-bookmarks', 'v', [{ id: 'second' }]);
    const v = await IDBAdapter.get('vot-bookmarks', 'v');
    expect(v).toEqual([{ id: 'second' }]);
  });

  it('large value (~1 MB JSON-equivalent) round-trips correctly', async () => {
    const big = { items: [] };
    for (let i = 0; i < 5000; i++) {
      big.items.push({ id: 'item_' + i, text: 'x'.repeat(200) });
    }
    await IDBAdapter.put('vot-annotations', 'v', big);
    const got = await IDBAdapter.get('vot-annotations', 'v');
    expect(got.items.length).toBe(5000);
    expect(got.items[4999].id).toBe('item_4999');
  });

  it('special characters in keys round-trip', async () => {
    const cases = ['simple', 'with:colon', 'with/slash', 'unicode-‣-chip', 'emoji-🔑'];
    for (const k of cases) {
      await IDBAdapter.put('vot-notes', k, { tag: k });
    }
    for (const k of cases) {
      const v = await IDBAdapter.get('vot-notes', k);
      expect(v).toEqual({ tag: k });
    }
  });

  it('rejects writes to an unknown store', async () => {
    await expect(IDBAdapter.put('not-a-store', 'v', 'x')).rejects.toThrow(/Unknown IDB store/);
  });

  it('rejects reads from an unknown store', async () => {
    await expect(IDBAdapter.get('not-a-store', 'v')).rejects.toThrow(/Unknown IDB store/);
  });
});

describe('IDBAdapter — getAll', () => {
  it('returns {} for an empty store', async () => {
    const all = await IDBAdapter.getAll('vot-bookmarks');
    expect(all).toEqual({});
  });

  it('returns the full key→value map for a populated store', async () => {
    await IDBAdapter.put('vot-notes', 'k1', { v: 1 });
    await IDBAdapter.put('vot-notes', 'k2', { v: 2 });
    await IDBAdapter.put('vot-notes', 'k3', { v: 3 });
    const all = await IDBAdapter.getAll('vot-notes');
    expect(all).toEqual({ k1: { v: 1 }, k2: { v: 2 }, k3: { v: 3 } });
  });

  it('returns keys as strings (cursor.key stringification)', async () => {
    await IDBAdapter.put('vot-notes', 'string-key', { v: 1 });
    const all = await IDBAdapter.getAll('vot-notes');
    expect(Object.keys(all)).toEqual(['string-key']);
  });

  it('does not include deleted entries', async () => {
    await IDBAdapter.put('vot-notes', 'keep', { v: 'k' });
    await IDBAdapter.put('vot-notes', 'drop', { v: 'd' });
    await IDBAdapter.delete('vot-notes', 'drop');
    const all = await IDBAdapter.getAll('vot-notes');
    expect(all).toEqual({ keep: { v: 'k' } });
  });
});

describe('IDBAdapter — concurrency', () => {
  it('10 concurrent puts to same store all resolve, last write wins', async () => {
    const writes = [];
    for (let i = 0; i < 10; i++) {
      writes.push(IDBAdapter.put('vot-notes', 'shared', { i: i }));
    }
    await Promise.all(writes);
    const got = await IDBAdapter.get('vot-notes', 'shared');
    expect(got.i).toBe(9);
  });

  it('cross-store concurrent operations do not deadlock', async () => {
    const ops = [
      IDBAdapter.put('vot-bookmarks', 'v', [{ id: 'b1' }]),
      IDBAdapter.put('vot-notes', 'v', [{ id: 'n1' }]),
      IDBAdapter.put('vot-annotations', 'v', [{ id: 'a1' }]),
      IDBAdapter.put('vot-links', 'v', [{ id: 'l1' }]),
    ];
    await expect(Promise.all(ops)).resolves.toBeDefined();
    expect(await IDBAdapter.get('vot-bookmarks', 'v')).toEqual([{ id: 'b1' }]);
    expect(await IDBAdapter.get('vot-notes', 'v')).toEqual([{ id: 'n1' }]);
    expect(await IDBAdapter.get('vot-annotations', 'v')).toEqual([{ id: 'a1' }]);
    expect(await IDBAdapter.get('vot-links', 'v')).toEqual([{ id: 'l1' }]);
  });

  it('open() called concurrently from multiple awaiters returns same DB', async () => {
    const promises = [IDBAdapter.open(), IDBAdapter.open(), IDBAdapter.open()];
    const dbs = await Promise.all(promises);
    expect(dbs[0]).toBe(dbs[1]);
    expect(dbs[1]).toBe(dbs[2]);
  });
});

describe('IDBAdapter — versionchange handling', () => {
  it('versionchange handler closes the connection and invalidates the cached promise', async () => {
    const db = await IDBAdapter.open();
    expect(typeof db.onversionchange).toBe('function');

    // Simulate a sibling tab opening with a higher version: the IDB
    // implementation would dispatch 'versionchange' on this connection.
    // Invoke the handler directly (the spec-event has no other state we
    // depend on).
    db.onversionchange(/** @type {any} */ ({ oldVersion: 1, newVersion: 2 }));

    // After versionchange, the next open() must produce a fresh promise.
    const db2 = await IDBAdapter.open();
    expect(db2).toBeDefined();
    // db is closed; db2 is a fresh connection. Both are IDBDatabase
    // instances but not the same object.
    expect(db2).not.toBe(db);
  });

  it('versionchange handler tolerates db.close() throwing (best-effort)', async () => {
    const db = await IDBAdapter.open();
    // Replace close with one that throws.
    const origClose = db.close.bind(db);
    db.close = function () { throw new Error('close blocked'); };

    // Must not throw — the handler is best-effort.
    expect(() => db.onversionchange(/** @type {any} */ ({}))).not.toThrow();

    // Restore for cleanup.
    db.close = origClose;
  });
});

describe('IDBAdapter — open failure', () => {
  it('rejects when indexedDB is unavailable', async () => {
    IDBAdapter._resetForTests();
    const original = globalThis.indexedDB;
    /** @type {any} */ (globalThis).indexedDB = undefined;
    try {
      await expect(IDBAdapter.open()).rejects.toThrow(/IndexedDB is not available/);
    } finally {
      /** @type {any} */ (globalThis).indexedDB = original;
      IDBAdapter._resetForTests();
    }
  });

  it('open failure does NOT leave the cached promise in a rejected state', async () => {
    // After a rejected open(), the next open() must retry — not return
    // the already-rejected promise forever.
    IDBAdapter._resetForTests();
    const original = globalThis.indexedDB;
    /** @type {any} */ (globalThis).indexedDB = undefined;
    await expect(IDBAdapter.open()).rejects.toThrow();
    /** @type {any} */ (globalThis).indexedDB = original;
    // Now it should succeed.
    await expect(IDBAdapter.open()).resolves.toBeDefined();
  });
});

describe('IDBAdapter — isQuotaError', () => {
  it('true for an error with name=QuotaExceededError', () => {
    const e = new Error('quota'); /** @type {any} */ (e).name = 'QuotaExceededError';
    expect(IDBAdapter.isQuotaError(e)).toBe(true);
  });

  it('true for legacy DOMException code 22', () => {
    expect(IDBAdapter.isQuotaError({ code: 22 })).toBe(true);
  });

  it('false for AbortError', () => {
    const e = new Error('abort'); /** @type {any} */ (e).name = 'AbortError';
    expect(IDBAdapter.isQuotaError(e)).toBe(false);
  });

  it('false for plain Error', () => {
    expect(IDBAdapter.isQuotaError(new Error('random'))).toBe(false);
  });

  it('false for null / undefined', () => {
    expect(IDBAdapter.isQuotaError(null)).toBe(false);
    expect(IDBAdapter.isQuotaError(undefined)).toBe(false);
  });
});

describe('IDBAdapter — _wrapRequest error preservation', () => {
  it('resolves with req.result on success', async () => {
    /** @type {any} */
    const fakeReq = { result: 'value-out', onsuccess: null, onerror: null };
    const p = IDBAdapter._wrapRequest(fakeReq);
    fakeReq.onsuccess();
    await expect(p).resolves.toBe('value-out');
  });

  it('rejects with req.error (preserves QuotaExceededError name)', async () => {
    const quotaErr = (() => {
      if (typeof DOMException === 'function') {
        try { return new DOMException('quota', 'QuotaExceededError'); } catch (_e) { /* fall through */ }
      }
      const e = new Error('quota'); /** @type {any} */ (e).name = 'QuotaExceededError'; return e;
    })();
    /** @type {any} */
    const fakeReq = { error: quotaErr, onsuccess: null, onerror: null };
    const p = IDBAdapter._wrapRequest(fakeReq);
    fakeReq.onerror();
    await expect(p).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });

  it('rejects with a synthesized Error when req.error is null', async () => {
    /** @type {any} */
    const fakeReq = { error: null, onsuccess: null, onerror: null };
    const p = IDBAdapter._wrapRequest(fakeReq);
    fakeReq.onerror();
    await expect(p).rejects.toThrow(/IDB request failed/);
  });
});

describe('IDBAdapter — put retry on AbortError', () => {
  it('AbortError on first attempt → put retries and succeeds on second', async () => {
    // Spy on _putOnce: first call rejects with AbortError, second
    // delegates to the real implementation (which uses fake-indexeddb).
    const realPutOnce = IDBAdapter._putOnce.bind(IDBAdapter);
    let calls = 0;
    const spy = vi.spyOn(IDBAdapter, '_putOnce').mockImplementation(function (storeName, key, value) {
      calls += 1;
      if (calls === 1) {
        const e = new Error('Transaction aborted');
        /** @type {any} */ (e).name = 'AbortError';
        return Promise.reject(e);
      }
      return realPutOnce(storeName, key, value);
    });
    try {
      await IDBAdapter.put('vot-notes', 'k', { v: 'retry-ok' });
      expect(calls).toBe(2);
      const got = await IDBAdapter.get('vot-notes', 'k');
      expect(got).toEqual({ v: 'retry-ok' });
    } finally {
      spy.mockRestore();
    }
  });

  it('AbortError on both attempts → put rejects with AbortError', async () => {
    let calls = 0;
    const spy = vi.spyOn(IDBAdapter, '_putOnce').mockImplementation(function () {
      calls += 1;
      const e = new Error('Transaction aborted');
      /** @type {any} */ (e).name = 'AbortError';
      return Promise.reject(e);
    });
    try {
      await expect(IDBAdapter.put('vot-notes', 'k', { v: 'fail' })).rejects.toMatchObject({ name: 'AbortError' });
      expect(calls).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('QuotaExceededError is NOT retried (quota does not improve)', async () => {
    let calls = 0;
    const spy = vi.spyOn(IDBAdapter, '_putOnce').mockImplementation(function () {
      calls += 1;
      const e = (() => {
        if (typeof DOMException === 'function') {
          try { return new DOMException('quota', 'QuotaExceededError'); } catch (_e) { /* fall through */ }
        }
        const x = new Error('quota'); /** @type {any} */ (x).name = 'QuotaExceededError'; return x;
      })();
      return Promise.reject(e);
    });
    try {
      await expect(IDBAdapter.put('vot-notes', 'k', { v: 'q' })).rejects.toMatchObject({ name: 'QuotaExceededError' });
      expect(calls).toBe(1); // no retry
    } finally {
      spy.mockRestore();
    }
  });

  it('non-Abort, non-Quota error → put rejects without retry', async () => {
    let calls = 0;
    const spy = vi.spyOn(IDBAdapter, '_putOnce').mockImplementation(function () {
      calls += 1;
      const e = new Error('Some other error');
      /** @type {any} */ (e).name = 'DataError';
      return Promise.reject(e);
    });
    try {
      await expect(IDBAdapter.put('vot-notes', 'k', { v: 'x' })).rejects.toMatchObject({ name: 'DataError' });
      expect(calls).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
