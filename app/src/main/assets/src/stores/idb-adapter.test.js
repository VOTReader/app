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
import { DiagnosticLog } from '../utils/diagnostic-log.js';
import { CHUNK_CHARS, PIECES_PER_TX } from './idb-chunks.js';

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

  it('STORE_NAMES contains the 26 vot-* keys plus offline-songs and meta (v12 kept songs; v11 tour flag; v10 audio positions; v9 audio library)', () => {
    const expected = new Set([
      'vot-welcomed', 'vot-about-seen', 'vot-garden-warning-acked',
      'vot-recent-nav', 'vot-prophecy-cards',
      'vot-journal', 'vot-journal-notebooks', 'vot-journal-index',
      'vot-journal-stats', 'vot-bookmarks', 'vot-notebooks',
      'vot-history', 'vot-state', 'vot-annotations', 'vot-notes',
      'vot-links', 'vot-home-order', 'vot-note-default', 'vot-library-order',
      'vot-reading-streak', 'vot-reading-stats', 'vot-garden-pos',
      'vot-ann-hint-dismissed', 'vot-audio-library', 'vot-audio-positions', 'vot-tour-done', 'offline-songs', 'meta',
    ]);
    expect(new Set(IDBAdapter.STORE_NAMES)).toEqual(expected);
    expect(IDBAdapter.STORE_NAMES.length).toBe(28);
  });

  it('DB_NAME is "votreader" — separate from vot-journal-media and vot-thumbs', () => {
    expect(IDBAdapter.DB_NAME).toBe('votreader');
    expect(IDBAdapter.DB_NAME).not.toBe('vot-journal-media');
    expect(IDBAdapter.DB_NAME).not.toBe('vot-thumbs');
  });

  it('DB_VERSION is 13 (v13 big values in pieces; v12 kept songs; v11 tour flag; v10 audio positions; v9 audio library)', () => {
    expect(IDBAdapter.DB_VERSION).toBe(13);
  });

  it('offline-songs holds a Blob record and hands it back (K1: kept songs)', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' });
    await IDBAdapter.put('offline-songs', 'a1b2c3d4e5f6', { id: 'a1b2c3d4e5f6', blob, bytes: 3, sha256: 'x', keptAt: 1 });
    const rec = await IDBAdapter.get('offline-songs', 'a1b2c3d4e5f6');
    expect(rec.bytes).toBe(3);
    expect(rec.blob).toBeDefined();
    await IDBAdapter.delete('offline-songs', 'a1b2c3d4e5f6');
    expect(await IDBAdapter.get('offline-songs', 'a1b2c3d4e5f6')).toBeUndefined();
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

describe('IDBAdapter - a database saved by a newer VOTReader (v04-03)', () => {
  it('open() rejects with a VersionError that isVersionError names', async () => {
    // What an older build meets after a newer one bumped DB_VERSION: an APK installed
    // over a newer one with adb install -r -d, or a stale PWA tab across a schema bump.
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(IDBAdapter.DB_NAME, IDBAdapter.DB_VERSION + 1);
      req.onsuccess = () => { req.result.close(); resolve(undefined); };
      req.onerror = () => reject(req.error);
    });
    let err = null;
    try { await IDBAdapter.open(); } catch (e) { err = e; }
    expect(err, 'an older app cannot open a newer database').not.toBeNull();
    expect(IDBAdapter.isVersionError(err)).toBe(true);
  });

  it('isVersionError is false for every other failure', () => {
    expect(IDBAdapter.isVersionError(new Error('IDB open failed'))).toBe(false);
    expect(IDBAdapter.isVersionError({ name: 'QuotaExceededError' })).toBe(false);
    expect(IDBAdapter.isVersionError(null)).toBe(false);
    expect(IDBAdapter.isVersionError(undefined)).toBe(false);
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

describe('IDBAdapter — commitMigration (W7.1b: atomic data + version)', () => {
  it('writes the data blob (key "v") and the schema version (meta) together', async () => {
    await IDBAdapter.commitMigration('vot-bookmarks', [{ id: 'b1' }], 2);
    expect(await IDBAdapter.get('vot-bookmarks', 'v')).toEqual([{ id: 'b1' }]);
    expect(await IDBAdapter.get('meta', 'schema:vot-bookmarks')).toBe(2);
  });

  it('overwrites prior data + version on a later migration', async () => {
    await IDBAdapter.commitMigration('vot-bookmarks', [{ id: 'old' }], 2);
    await IDBAdapter.commitMigration('vot-bookmarks', [{ id: 'new' }], 3);
    expect(await IDBAdapter.get('vot-bookmarks', 'v')).toEqual([{ id: 'new' }]);
    expect(await IDBAdapter.get('meta', 'schema:vot-bookmarks')).toBe(3);
  });

  it('rejects an unknown store name (validated before the transaction)', async () => {
    await expect(IDBAdapter.commitMigration('not-a-store', [], 2)).rejects.toThrow(/Unknown IDB store/);
  });
});

/* 2026-10-11: the owner's WebView threw the database away a second time and nothing on the
   device said why. Chromium tells the page on the upgradeneeded of the open that recreated the
   store (dataLoss / dataLossMessage, non-standard); a store it finds corrupt mid-session is
   force-closed (IDBDatabase close event). Both now reach the persisted data-health ring. */
describe('a database the browser created fresh, or closed', () => {
  it('a fresh database is logged to the data-health ring and reported by openInfo()', async () => {
    const warn = vi.spyOn(DiagnosticLog, 'warn');
    await IDBAdapter.get('vot-state', 'v');
    expect(IDBAdapter.openInfo()).toMatchObject({ oldVersion: 0, newVersion: IDBAdapter.DB_VERSION });
    expect(warn).toHaveBeenCalledWith('data-health', expect.stringMatching(/^database created fresh \(v0 -> v\d+\); dataLoss /));
    warn.mockRestore();
  });

  it('an existing database opens quietly', async () => {
    await IDBAdapter.get('vot-state', 'v');
    IDBAdapter._resetForTests();
    const warn = vi.spyOn(DiagnosticLog, 'warn');
    await IDBAdapter.get('vot-state', 'v');
    expect(IDBAdapter.openInfo()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("the browser's own reason is kept word for word", () => {
    expect(IDBAdapter.describeUpgrade({ oldVersion: 0, newVersion: 12, dataLoss: 'total', dataLossMessage: 'IndexedDB (database was corrupt): checksum mismatch' }))
      .toBe('database created fresh (v0 -> v12); dataLoss total: IndexedDB (database was corrupt): checksum mismatch');
    expect(IDBAdapter.describeUpgrade({ oldVersion: 11, newVersion: 12 })).toBe('');
  });

  it('a close the browser forces is logged and handed to the listener; the connection is not reopened', async () => {
    const seen = vi.fn();
    const off = IDBAdapter.onBrowserClose(seen);
    const db = await IDBAdapter.open();
    const warn = vi.spyOn(DiagnosticLog, 'warn');
    db.onclose(new Event('close'));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('data-health', expect.stringMatching(/closed the database/));
    expect(await IDBAdapter.open()).toBe(db);           // a reopen would meet an empty store
    off();
    warn.mockRestore();
  });
});

/* 2026-10-11, the trigger reproduced: two readwrite transactions over LevelDBScopes'
   1 MiB flush line, killed before they commit, make the next open fail "Unknown
   corruption" and Chromium destroys the origin's whole store (vot_api34: 7 wipes in 10
   kills, the owner's exact message). So through the adapter: values in pieces far under
   the 64 KiB wrap threshold, no transaction over PIECES_PER_TX pieces, one write at a
   time, every write committed explicitly (stores/idb-chunks.js). */
describe('IDBAdapter - small values, small transactions, one write at a time (idb-chunks)', () => {
  const history = (n) => Array.from({ length: n }, (_, i) => ({ key: 'bible:john:' + i, ts: 1791749447996 + i, title: 'John ' + i + ' — “In the beginning”' }));

  async function rawRows(store) {
    const db = await IDBAdapter.open();
    return new Promise((res) => {
      const out = [];
      const rq = db.transaction(store).objectStore(store).openCursor();
      rq.onsuccess = () => { const c = rq.result; if (!c) { res(out); return; } out.push([c.key, c.value]); c.continue(); };
    });
  }
  async function rawPut(store, key, value) {
    const db = await IDBAdapter.open();
    await new Promise((res) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); tx.oncomplete = res; });
  }

  it('a big store value round-trips, and every record IndexedDB holds is a small piece or a manifest', async () => {
    const v = history(3000);
    await IDBAdapter.put('vot-history', 'v', v);
    expect(await IDBAdapter.get('vot-history', 'v')).toEqual(v);
    const rows = await rawRows('vot-history');
    expect(rows.length).toBeGreaterThan(PIECES_PER_TX);
    expect(rows[0][1]).toMatchObject({ __votChunks: 1 });
    for (const [, val] of rows.slice(1)) expect(typeof val === 'string' && val.length <= CHUNK_CHARS).toBe(true);
  });

  it('getAll puts pieces back together and never shows them as keys', async () => {
    await IDBAdapter.put('vot-history', 'v', history(3000));
    expect(await IDBAdapter.getAll('vot-history')).toEqual({ v: history(3000) });
  });

  it('delete removes the pieces with the key', async () => {
    await IDBAdapter.put('vot-history', 'v', history(3000));
    await IDBAdapter.delete('vot-history', 'v');
    expect(await rawRows('vot-history')).toEqual([]);
  });

  it('commitMigration makes a big migrated value current together with its schema version', async () => {
    await IDBAdapter.commitMigration('vot-history', history(3000), 4);
    expect(await IDBAdapter.get('vot-history', 'v')).toEqual(history(3000));
    expect(await IDBAdapter.get('meta', 'schema:vot-history')).toBe(4);
  });

  it('a record written before this change (one big value) still reads, and its next write splits it', async () => {
    await rawPut('vot-history', 'v', history(3000));
    expect(await IDBAdapter.get('vot-history', 'v')).toEqual(history(3000));
    await IDBAdapter.put('vot-history', 'v', history(3001));
    const rows = await rawRows('vot-history');
    expect(rows[0][1]).toMatchObject({ __votChunks: 1 });
    expect(await IDBAdapter.get('vot-history', 'v')).toEqual(history(3001));
  });

  it('pieces that do not add up are never read as a value: get rejects with a DataError', async () => {
    await IDBAdapter.put('vot-history', 'v', history(3000));
    const db = await IDBAdapter.open();
    await new Promise((res) => { const tx = db.transaction('vot-history', 'readwrite'); tx.objectStore('vot-history').delete(IDBKeyRange.bound('v#chunk:', 'v#chunk:￿')); tx.oncomplete = res; });
    await expect(IDBAdapter.get('vot-history', 'v')).rejects.toMatchObject({ name: 'DataError' });
  });

  it('runs one readwrite transaction at a time, however many saves arrive together', async () => {
    const db = await IDBAdapter.open();
    const orig = db.transaction.bind(db);
    let active = 0;
    let maxActive = 0;
    vi.spyOn(db, 'transaction').mockImplementation((stores, mode) => {
      const tx = orig(stores, mode);
      if (mode === 'readwrite') {
        active++; maxActive = Math.max(maxActive, active);
        const done = () => { active--; };
        tx.addEventListener('complete', done);
        tx.addEventListener('abort', done);
      }
      return tx;
    });
    await Promise.all([
      IDBAdapter.put('vot-history', 'v', history(3000)),
      IDBAdapter.put('vot-state', 'v', { readItems: { a: 1 } }),
      IDBAdapter.put('vot-notes', 'v', { n1: { body: 'x' } }),
      IDBAdapter.delete('vot-links', 'v'),
      IDBAdapter.commitMigration('vot-bookmarks', [], 3),
    ]);
    vi.restoreAllMocks();
    expect(maxActive).toBe(1);
    expect(await IDBAdapter.get('vot-history', 'v')).toEqual(history(3000));
  });

  it('a write still waiting in the queue when the fence rises says WriteFenced, and lands nothing', async () => {
    const first = IDBAdapter.put('vot-history', 'v', history(3000));     // long: several transactions
    const second = IDBAdapter.put('vot-state', 'v', { readItems: { a: 1 } });
    IDBAdapter.setWriteFence(true);
    try {
      await first.catch(() => {});
      await expect(second).rejects.toMatchObject({ name: 'WriteFenced' });
    } finally { IDBAdapter.setWriteFence(false); }
    expect(await IDBAdapter.get('vot-state', 'v')).toBeUndefined();
  });

  it('a write queued behind Clear All\'s fence never reopens the database', async () => {
    IDBAdapter.setWriteFence(true);
    try {
      await IDBAdapter.put('vot-history', 'v', history(3000));
      await IDBAdapter.put('vot-state', 'v', { a: 1 });
    } finally { IDBAdapter.setWriteFence(false); }
    expect(await IDBAdapter.get('vot-history', 'v')).toBeUndefined();
  });
});

/* W8 refuter round 1 (2026-10-13): a write that passed the queue's fence check could still be
   waiting on open() when a fence rose (another tab's Clear All closed the connection, so the
   next open recreates the deleted database), and then wrote anyway. And under ANOTHER tab's
   hold (setHoldCheck), a write that bypasses the stores (offline songs, size samples) resolved
   as if saved: it must be refused, so its caller knows. */
describe('IDBAdapter W8 - the fences are checked again right before the transaction', () => {
  afterEach(() => { IDBAdapter.setWriteFence(false); if (typeof IDBAdapter.setHoldCheck === 'function') IDBAdapter.setHoldCheck(null); });

  it('a write already waiting on open() when Clear All\'s fence rises lands nothing', async () => {
    IDBAdapter._resetForTests();                       // the connection is gone: open() has to reopen
    const p = IDBAdapter._putOnce('vot-state', 'v', { stale: true });
    IDBAdapter.setWriteFence(true);                    // rises while that open is pending
    await expect(p).rejects.toMatchObject({ name: 'WriteFenced' });
    IDBAdapter.setWriteFence(false);
    expect(await IDBAdapter.get('vot-state', 'v')).toBeUndefined();
  });

  it('the same for another tab\'s hold', async () => {
    let held = false;
    IDBAdapter.setHoldCheck(() => held);
    IDBAdapter._resetForTests();
    const p = IDBAdapter._putOnce('vot-state', 'v', { stale: true });
    held = true;
    await expect(p).rejects.toMatchObject({ name: 'WriteFenced' });
    held = false;
    expect(await IDBAdapter.get('vot-state', 'v')).toBeUndefined();
  });

  it('under another tab\'s hold a direct write, delete or migration commit is refused, not silently dropped', async () => {
    IDBAdapter.setHoldCheck(() => true);
    await expect(IDBAdapter.put('offline-songs', 's1', { id: 's1' })).rejects.toMatchObject({ name: 'WriteFenced' });
    await expect(IDBAdapter.delete('vot-notes', 'v')).rejects.toMatchObject({ name: 'WriteFenced' });
    await expect(IDBAdapter.commitMigration('vot-bookmarks', [], 3)).rejects.toMatchObject({ name: 'WriteFenced' });
    IDBAdapter.setHoldCheck(null);
    expect(await IDBAdapter.get('offline-songs', 's1')).toBeUndefined();
  });

  it('CONTROL: a hold check that throws never blocks a write', async () => {
    IDBAdapter.setHoldCheck(() => { throw new Error('bug'); });
    await IDBAdapter.put('vot-state', 'v', { ok: 1 });
    expect(await IDBAdapter.get('vot-state', 'v')).toEqual({ ok: 1 });
  });
});
