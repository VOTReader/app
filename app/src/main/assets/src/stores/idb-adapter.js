/* ═══════════════════════════════════════════════════════════════
   IDB ADAPTER — generic IndexedDB CRUD for structured data stores
   ═══════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.
   No dependencies — uses only browser IndexedDB.

   Purpose: W2.1 of the W2 storage-hardening phase. Provides a single
   IndexedDB database "votreader" with one object store per legacy
   localStorage key. CachedStore (W2.2) layers write-through + hydration
   semantics on top.

   Public API (Promises throughout):
     IDBAdapter.open()                          → Promise<IDBDatabase>
     IDBAdapter.get(storeName, key)             → Promise<any | undefined>
     IDBAdapter.put(storeName, key, value)      → Promise<void>
     IDBAdapter.delete(storeName, key)          → Promise<void>
     IDBAdapter.getAll(storeName)               → Promise<Record<string, any>>
     IDBAdapter.isQuotaError(err)               → boolean
     IDBAdapter.STORE_NAMES                     → readonly string[]
     IDBAdapter.DB_NAME, IDBAdapter.DB_VERSION  → constants

   Design notes:
   - SEPARATE from vot-journal-media (binary blobs) and vot-thumbs
     (best-effort tab thumbs). Each owns its own IDB database.
   - Rejects (not resolves-null like thumb-store) on fundamental failure
     so CachedStore W2.2 can route to its 'degraded' state machine. User
     data correctness requires the adapter NEVER to silently swallow
     errors; that's CachedStore's policy decision, not ours.
   - Per-operation failures (QuotaExceededError, AbortError) reject;
     CachedStore catches per-write and forwards to StorageHealth (W2.7).
   - Transaction abort on put() is retried ONCE before rejecting
     (PLAN.txt W2.1 §"Error handling"). QuotaExceededError is NOT
     retried (quota does not improve with retry).
   - db.onversionchange closes the cached connection so a sibling tab
     opening with a higher schema version isn't blocked indefinitely.
   - getAll() uses openCursor() for portable key+value walking. IDB's
     native getAll() returns values only; getAllKeys() isn't available
     on every WebView build.
   - onupgradeneeded guards every createObjectStore with
     objectStoreNames.contains() so future schema bumps (W7.1) are
     additive — no thrown errors on stores that already exist.
═══════════════════════════════════════════════════════════════ */

/** @typedef {string} StoreName */

export const IDBAdapter = (function () {
  const DB_NAME = 'votreader';
  // Schema versions:
  //   1 — initial W2.1 schema (17 vot-* stores + meta).
  //   2 — W2.3b.4 added vot-home-order. New installs get all 19
  //       stores at once; existing v1 installs get vot-home-order
  //       added via the onupgradeneeded guard (the existing
  //       objectStoreNames.contains check skips already-created
  //       stores, so the bump is additive only).
  const DB_VERSION = 2;

  /**
   * The 17 vot-* localStorage keys that migrate into IDB, plus the
   * `meta` store for migration bookkeeping (W2.4's "migrated-v1" flag
   * and any future schema state).
   *
   * vot-state is included even though it ALSO keeps a reduced
   * localStorage shim — the LS shim is for the synchronous boot-script
   * theme read at index.html:73; full state lives in IDB for durability
   * and GB-scale tab payloads. The dual-residency policy is enforced
   * by CachedStore (W2.2), not by this adapter.
   */
  const STORE_NAMES = Object.freeze([
    'vot-welcomed',
    'vot-about-seen',
    'vot-garden-warning-acked',
    'vot-ann-migrated',
    'vot-recent-nav',
    'vot-prophecy-cards',
    'vot-journal',
    'vot-journal-notebooks',
    'vot-journal-index',
    'vot-journal-stats',
    'vot-bookmarks',
    'vot-notebooks',
    'vot-history',
    'vot-state',
    'vot-annotations',
    'vot-notes',
    'vot-links',
    'vot-home-order',
    'meta',
  ]);
  const STORE_SET = new Set(STORE_NAMES);

  /** @type {Promise<IDBDatabase> | null} */
  let _dbPromise = null;

  /**
   * Wrap an IDBRequest in a Promise that resolves with `req.result` or
   * rejects with `req.error`. Centralizes the onsuccess/onerror
   * boilerplate.
   *
   * @template T
   * @param {IDBRequest<T>} req
   * @returns {Promise<T>}
   */
  function wrapRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IDB request failed')); };
    });
  }

  /**
   * Open (or reuse) the IDB connection. Rejects on fundamental failure
   * (IDB unavailable, blocked, upgrade-aborted); resolves with the
   * live database otherwise. The cached promise is invalidated on
   * versionchange so a sibling tab's upgrade isn't blocked.
   *
   * @returns {Promise<IDBDatabase>}
   */
  function open() {
    if (_dbPromise) return _dbPromise;
    const p = new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function (e) {
        const db = /** @type {IDBOpenDBRequest} */ (e.target).result;
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      };
      req.onsuccess = function (e) {
        const db = /** @type {IDBOpenDBRequest} */ (e.target).result;
        db.onversionchange = function () {
          try { db.close(); } catch (_e) { /* best-effort close */ }
          if (_dbPromise === p) _dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = function (e) {
        const err = /** @type {IDBOpenDBRequest} */ (e.target).error;
        reject(err || new Error('IDB open failed'));
      };
      req.onblocked = function () {
        reject(new Error('IDB open blocked (another connection holds an older version)'));
      };
    });
    // Clear the cache on rejection so a subsequent open() can retry
    // (e.g. after a transient private-mode block clears). The identity
    // guard avoids clobbering a newer promise if open() was already
    // re-called between rejection and this microtask running.
    p.catch(function () { if (_dbPromise === p) _dbPromise = null; });
    _dbPromise = p;
    return p;
  }

  /**
   * Acquire a transaction-scoped object store at the requested mode.
   * Validates the store name to catch caller typos early.
   *
   * @param {StoreName} storeName
   * @param {IDBTransactionMode} mode
   * @returns {Promise<{ store: IDBObjectStore, tx: IDBTransaction }>}
   */
  function txStore(storeName, mode) {
    if (!STORE_SET.has(storeName)) {
      return Promise.reject(new Error('Unknown IDB store: ' + storeName));
    }
    return open().then(function (db) {
      const tx = db.transaction([storeName], mode);
      const store = tx.objectStore(storeName);
      return { store: store, tx: tx };
    });
  }

  /**
   * Read one value by key. Resolves undefined when the key is absent.
   *
   * @param {StoreName} storeName
   * @param {IDBValidKey} key
   * @returns {Promise<any>}
   */
  function get(storeName, key) {
    return txStore(storeName, 'readonly').then(function (ctx) {
      return wrapRequest(ctx.store.get(key));
    });
  }

  /**
   * Write a single key/value. `value === undefined` routes to delete()
   * (IDB's native handling of undefined values is implementation-
   * inconsistent — normalizing to absence is safer for CachedStore's
   * cold-cache writes during boot).
   *
   * AbortError → retry once. QuotaExceededError → reject (no retry).
   *
   * NB: dispatches through `_self._putOnce` / `_self.delete` (not
   * lexical references) so test spies on those properties intercept
   * correctly. Production behavior is identical — `_self` is the
   * exported object — but `vi.spyOn(IDBAdapter, '_putOnce')` is
   * actually load-bearing under the hood.
   *
   * @param {StoreName} storeName
   * @param {IDBValidKey} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  function put(storeName, key, value) {
    if (value === undefined) return _self.delete(storeName, key);
    return _self._putOnce(storeName, key, value).catch(function (err) {
      if (err && err.name === 'AbortError') {
        return _self._putOnce(storeName, key, value);
      }
      throw err;
    });
  }

  /**
   * Single put attempt — the retry wrapper above calls this.
   *
   * @param {StoreName} storeName
   * @param {IDBValidKey} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  function _putOnce(storeName, key, value) {
    return txStore(storeName, 'readwrite').then(function (ctx) {
      return new Promise(function (resolve, reject) {
        let settled = false;
        const settle = function (action) { if (!settled) { settled = true; action(); } };
        let req;
        try {
          req = ctx.store.put(value, key);
        } catch (e) {
          settle(function () { reject(e); });
          return;
        }
        req.onerror = function () {
          settle(function () { reject(req.error || _makeAbortError()); });
        };
        ctx.tx.oncomplete = function () { settle(function () { resolve(undefined); }); };
        ctx.tx.onerror = function () {
          settle(function () { reject(ctx.tx.error || (req && req.error) || _makeAbortError()); });
        };
        ctx.tx.onabort = function () {
          settle(function () { reject(ctx.tx.error || (req && req.error) || _makeAbortError()); });
        };
      });
    });
  }

  /**
   * Delete one key. Idempotent (resolves even if the key was absent).
   *
   * @param {StoreName} storeName
   * @param {IDBValidKey} key
   * @returns {Promise<void>}
   */
  function del(storeName, key) {
    return txStore(storeName, 'readwrite').then(function (ctx) {
      return new Promise(function (resolve, reject) {
        let settled = false;
        const settle = function (action) { if (!settled) { settled = true; action(); } };
        let req;
        try {
          req = ctx.store.delete(key);
        } catch (e) {
          settle(function () { reject(e); });
          return;
        }
        req.onerror = function () { settle(function () { reject(req.error || _makeAbortError()); }); };
        ctx.tx.oncomplete = function () { settle(function () { resolve(undefined); }); };
        ctx.tx.onabort = function () {
          settle(function () { reject(ctx.tx.error || (req && req.error) || _makeAbortError()); });
        };
      });
    });
  }

  /**
   * Every key/value pair in a store, as a Record<string, any>. Uses
   * openCursor() so both keys and values are walked — IDB's native
   * getAll() returns values only; getAllKeys() isn't on every WebView.
   *
   * @param {StoreName} storeName
   * @returns {Promise<Record<string, any>>}
   */
  function getAll(storeName) {
    return txStore(storeName, 'readonly').then(function (ctx) {
      return new Promise(function (resolve, reject) {
        /** @type {Record<string, any>} */
        const out = {};
        const req = ctx.store.openCursor();
        req.onsuccess = function (e) {
          const cursor = /** @type {IDBRequest<IDBCursorWithValue | null>} */ (e.target).result;
          if (cursor) {
            out[String(cursor.key)] = cursor.value;
            cursor.continue();
          } else {
            resolve(out);
          }
        };
        req.onerror = function () { reject(req.error || new Error('cursor failed')); };
      });
    });
  }

  /**
   * True iff the error is a quota-exceeded error. Checks both `name`
   * (DOM-spec standard) and legacy numeric `code` for older WebViews.
   *
   * @param {unknown} err
   * @returns {boolean}
   */
  function isQuotaError(err) {
    if (!err) return false;
    const e = /** @type {any} */ (err);
    if (e.name === 'QuotaExceededError') return true;
    if (e.code === 22) return true;
    return false;
  }

  /** Build a synthetic AbortError for hosts whose tx.onabort fires
   *  without a populated tx.error. */
  function _makeAbortError() {
    if (typeof DOMException === 'function') {
      try { return new DOMException('Transaction aborted', 'AbortError'); }
      catch (_e) { /* fall through */ }
    }
    const e = new Error('Transaction aborted');
    /** @type {any} */ (e).name = 'AbortError';
    return e;
  }

  /**
   * TEST-ONLY: clear the cached connection promise. Used by tests that
   * simulate versionchange, re-open, or open-failure scenarios. Do NOT
   * call from production code.
   */
  function _resetForTests() {
    _dbPromise = null;
  }

  const _self = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORE_NAMES: STORE_NAMES,
    open: open,
    get: get,
    put: put,
    delete: del,
    getAll: getAll,
    isQuotaError: isQuotaError,
    _putOnce: _putOnce,
    _wrapRequest: wrapRequest,
    _resetForTests: _resetForTests,
  };
  return _self;
})();
