/* ═══════════════════════════════════════════════════════════════
   IDB ADAPTER — generic IndexedDB CRUD for structured data stores
   ═══════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.
   Uses only browser IndexedDB, plus DiagnosticLog for the two events below.

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
     IDBAdapter.commitMigration(store,data,ver) → Promise<void>  (W7.1b, atomic)
     IDBAdapter.setWriteFence(on)               → void  (v04-02: Clear All; via setStoreWriteFence)
     IDBAdapter.setHoldCheck(fn)                → void  (W8: another tab's change; writes refused while fn() is true)
     IDBAdapter.isQuotaError(err)               → boolean
     IDBAdapter.isVersionError(err)             → boolean  (v04-03: a newer app's database)
     IDBAdapter.openInfo()                      → { oldVersion, newVersion, dataLoss, dataLossMessage, at } | null
     IDBAdapter.onBrowserClose(fn)              → unsubscribe  (2026-10-11, below)
     IDBAdapter.onVersionChange(fn)             → unsubscribe  (another connection deleted or upgraded it)
     IDBAdapter.describeUpgrade(event)          → string ('' for an ordinary schema step)
     IDBAdapter.STORE_NAMES                     → readonly string[]
     IDBAdapter.DB_NAME, IDBAdapter.DB_VERSION  → constants

   A database the browser threw away (2026-10-11). Twice the owner's WebView
   came up with this database gone: Chromium found its LevelDB corrupt at open,
   destroyed it and made a new empty one, and nothing on the device said so.
   Chromium does say, on the upgradeneeded of the open that recreated it
   (dataLoss 'total', dataLossMessage "IndexedDB (database was corrupt): ...",
   non-standard). Every fresh or reset database is now written to the persisted
   data-health ring with that reason and the engine version, and openInfo()
   tells utils/data-safety.js this boot met a new database. A store Chromium
   finds corrupt mid-session is force-closed (the IDBDatabase close event): that
   is logged and handed to onBrowserClose listeners (data-safety snapshots the
   library from memory at once). The connection is NOT reopened: a reopen would
   meet an empty database, and a store's 3-way merge would read every record
   missing there as a delete. Saves fail until the app restarts, the restart
   finds the empty database, and data-safety restores the snapshot.

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

import { DiagnosticLog } from '../utils/diagnostic-log.js';
import { writeValue, deleteValue, getValue, foldRows, writeQueue } from './idb-chunks.js';

/** @typedef {string} StoreName */

export const IDBAdapter = (function () {
  const DB_NAME = 'votreader';
  // Schema versions:
  //   1 — initial W2.1 schema (17 vot-* stores + meta).
  //   2 — W2.3b.4 added vot-home-order. New installs get all stores at
  //       once; existing v1 installs get vot-home-order added via the
  //       onupgradeneeded guard (objectStoreNames.contains skips already-
  //       created stores, so the bump is additive only).
  //   3 — added vot-note-default (the last-used note style+color default).
  //       Same additive pattern: the onupgradeneeded guard creates only the
  //       new store on existing v2 installs; all other data is untouched.
  //   4 — added vot-library-order (library-screen tile drag-to-reorder).
  //       Same additive pattern.
  //   5 — added vot-reading-streak (days-reading streak on My Progress).
  //       Same additive pattern.
  //   6 — added vot-garden-pos (durable last-Garden-page memory).
  //       Same additive pattern.
  //   7 — added vot-ann-hint-dismissed (Wave-0 P1-1: the AnnotationHint
  //       coach-mark ✕ dismissal, previously a session-only window flag).
  //       Same additive pattern.
  //   8 — added vot-reading-stats (the reading-measurement ledger: words
  //       read, wpm samples, per-item frontiers — 2026-08-03). Same
  //       additive pattern. (Found LIVE, not by tests: a CachedStore whose
  //       name is missing here hydrates into 'degraded' and silently
  //       queues every write — if you add a store, add it HERE + bump.)
  // W7.1 dropped 'vot-ann-migrated' from STORE_NAMES (its only consumer,
  // the pre-W2 annotation bootstrap migration, was deleted). Deliberately
  // NOT a version bump: fresh installs simply skip it; a pre-existing empty
  // store on older installs is orphaned + harmless (never accessed, since
  // STORE_SET no longer lists it).
  // 9 — added vot-audio-library (saved recordings, recent listening, and
  // playback-rate preference). The onupgradeneeded guard keeps this additive.
  // 10 — added vot-audio-positions (durable per-recording resume points: a
  // bounded URL → {t,d,at} map, LRU-capped at 200). Same additive pattern.
  //  11 — added vot-tour-done (review-tutorial: the "Show me around" flag)
  //  12 — added offline-songs (Songs of the Letters kept on this phone, K1:
  //       id → { blob, bytes, sha256, keptAt }). The one store holding BYTES
  //       the reader can fetch again, so it is deliberately OUTSIDE the backup
  //       (only the list of kept ids travels, as songKept in vot-audio-library)
  //       and outside the "Your Data" size; user-data-parity.test.js exempts it
  //       by name, like meta. Same additive pattern.
  //  13 — no new store: a value too big to be inline is now stored in pieces
  //       (idb-chunks.js, 2026-10-11). A v12 build would read the manifest as the
  //       store's value, so the bump makes it meet a VersionError instead (the
  //       "saved by a newer version" banner, nothing written, nothing lost).
  const DB_VERSION = 13;

  /**
   * The persistent `vot-*` stores, plus the `meta` store for migration
   * bookkeeping (W2.4's "migrated-v1" flag and any future schema state).
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
    'vot-note-default',
    'vot-library-order',
    'vot-reading-streak',
    'vot-reading-stats',
    'vot-garden-pos',
    'vot-ann-hint-dismissed',
    'vot-audio-library',
    'vot-audio-positions',
    'vot-tour-done',
    'offline-songs',
    'meta',
  ]);
  const STORE_SET = new Set(STORE_NAMES);

  /** @type {Promise<IDBDatabase> | null} */
  let _dbPromise = null;

  /* v04-02 (2026-09-24, the rs23 refutation): Clear All's write fence, at the one door every
     'votreader' write goes through. CachedStore's fence skips a store's whole save; this one also
     stops the writers that call the adapter directly - the Settings storage-size sample, the audio
     player's boot snapshot, a migration commit - any of which reopened the database Clear All had
     just deleted, recreated every store and put its value back. While it is up, put / delete /
     commitMigration resolve without opening anything. Raised and lowered only through
     CachedStore's setStoreWriteFence, so the two can never disagree. */
  let _writeFence = false;

  /** @param {boolean} on */
  function setWriteFence(on) { _writeFence = !!on; }

  /* W8 (sweep 2026-10-13): ANOTHER tab's Clear All, Import or Restore holds this page's writes
     (utils/other-tabs.js, through CachedStore). Unlike the wipe's door above, a held write is
     REFUSED (WriteFenced), never resolved unwritten: the library is not being wiped, so a caller
     that writes directly (offline songs, size samples) must hear it did not land, and a store
     saves it again when the hold lifts. A check that throws holds nothing. */
  /** @type {(() => boolean) | null} */
  let _holdCheck = null;

  /** @param {(() => boolean) | null} fn */
  function setHoldCheck(fn) { _holdCheck = typeof fn === 'function' ? fn : null; }

  /** @returns {boolean} */
  function _held() {
    if (!_holdCheck) return false;
    try { return !!_holdCheck(); } catch (_e) { return false; }
  }

  /** Either fence is up: the write must not land. Checked again right before each transaction
   *  (W8 refuter): a write can pass the queue's check and then wait on open() while one rises. */
  function _blocked() { return _writeFence || _held(); }

  /** What this page's open met when it had to create or reset the database (header); null otherwise.
   *  @type {{ oldVersion: number, newVersion: number | null, dataLoss: string | null, dataLossMessage: string, at: number } | null} */
  let _openInfo = null;
  /** @type {Set<() => void>} */
  const _closeListeners = new Set();
  /** Told when another connection deletes or upgrades the database (versionchange). @type {Set<(ev: any) => void>} */
  const _versionListeners = new Set();

  /**
   * The data-health line for an upgradeneeded event: '' for an ordinary schema step, else
   * what the browser said (header). Exported for tests.
   * @param {any} ev
   * @returns {string}
   */
  function describeUpgrade(ev) {
    const e = ev || {};
    const lost = !!e.dataLoss && e.dataLoss !== 'none';
    if (e.oldVersion !== 0 && !lost) return '';
    return (e.oldVersion === 0 ? 'database created fresh' : 'database reset by the browser') +
      ' (v' + e.oldVersion + ' -> v' + e.newVersion + '); dataLoss ' + (e.dataLoss || 'unreported') +
      (e.dataLossMessage ? ': ' + e.dataLossMessage : '');
  }

  /** The engine, for the data-health line: a Chromium version or the bare user agent's first word. */
  function _engine() {
    try {
      const ua = String(navigator.userAgent || '');
      const m = /Chrome\/[\d.]+/.exec(ua);
      return m ? m[0] : ua.split(' ')[0] || 'unknown engine';
    } catch (_e) { return 'unknown engine'; }
  }

  /** @returns {typeof _openInfo} */
  function openInfo() { return _openInfo; }

  /**
   * Called when the browser force-closes the connection (header). Returns the unsubscribe.
   * @param {() => void} fn
   */
  function onBrowserClose(fn) {
    _closeListeners.add(fn);
    return function () { _closeListeners.delete(fn); };
  }

  /**
   * Called when another connection deletes or upgrades the database (Clear All, a newer
   * tab): this page's copy of the data is no longer the library. Returns the unsubscribe.
   * The listener gets the event: `newVersion` is null for a delete, else the version a
   * newer build is upgrading to (utils/other-tabs.js tells the two apart).
   * @param {(ev: { newVersion?: number | null }) => void} fn
   */
  function onVersionChange(fn) {
    _versionListeners.add(fn);
    return function () { _versionListeners.delete(fn); };
  }

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
        const ev = /** @type {any} */ (e);
        _openInfo = { oldVersion: ev.oldVersion, newVersion: ev.newVersion, dataLoss: ev.dataLoss || null, dataLossMessage: ev.dataLossMessage || '', at: Date.now() };
        const said = describeUpgrade(ev);
        if (said) { try { DiagnosticLog.warn('data-health', said + ' [' + _engine() + ']'); } catch (_e) { /* logging never breaks an open */ } }
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      };
      req.onsuccess = function (e) {
        const db = /** @type {IDBOpenDBRequest} */ (e.target).result;
        db.onversionchange = function (ev) {
          try { db.close(); } catch (_e) { /* best-effort close */ }
          if (_dbPromise === p) _dbPromise = null;
          for (const fn of Array.from(_versionListeners)) { try { fn(ev || {}); } catch (_e) { /* one listener never stops the next */ } }
        };
        // The browser's forced close (header): logged and reported, never reopened.
        db.onclose = function () {
          try { DiagnosticLog.warn('data-health', 'the browser closed the database (it found it corrupt, or its storage was cleared); saves fail until the app restarts [' + _engine() + ']'); } catch (_e) { /* logging never breaks a close */ }
          for (const fn of Array.from(_closeListeners)) { try { fn(); } catch (_e) { /* one listener never stops the next */ } }
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
      return getValue(ctx.store, key);              // put back together when stored in pieces
    });
  }

  /** One write at a time on this database (idb-chunks.js header, 4). */
  const _queue = writeQueue();

  /**
   * A write that was waiting in the queue when Clear All's fence went up: it did
   * not land. Its caller was told it was in flight, so it must hear that it was
   * not saved - CachedStore puts the store back on its fenced-dirty list and saves
   * it again if the fence comes down without a reload (refuter, 10-11).
   */
  function _fencedError() {
    const e = new Error('write held back by the Clear All fence');
    e.name = 'WriteFenced';
    return e;
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
    if (_writeFence) return Promise.resolve();   // v04-02: nothing reopens a wiped database
    if (_held()) return Promise.reject(_fencedError());   // W8: another tab's change holds this page
    if (value === undefined) return _self.delete(storeName, key);
    return _queue(function () {
      if (_blocked()) return Promise.reject(_fencedError());   // a fence went up while this waited
      return _self._putOnce(storeName, key, value).catch(function (err) {
        if (err && err.name === 'AbortError') {
          return _self._putOnce(storeName, key, value);
        }
        throw err;
      });
    });
  }

  /**
   * Single put attempt — the retry wrapper above calls this. The value goes
   * through idb-chunks.js: inline when small, in pieces across small, explicitly
   * committed transactions when not.
   *
   * @param {StoreName} storeName
   * @param {IDBValidKey} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  function _putOnce(storeName, key, value) {
    if (!STORE_SET.has(storeName)) {
      return Promise.reject(new Error('Unknown IDB store: ' + storeName));
    }
    return open().then(function (db) {
      if (_blocked()) throw _fencedError();   // W8: a fence rose while the open was pending
      return writeValue(db, storeName, key, value);
    });
  }

  /**
   * Delete one key and any pieces of its value. Idempotent (resolves even if
   * the key was absent).
   *
   * @param {StoreName} storeName
   * @param {IDBValidKey} key
   * @returns {Promise<void>}
   */
  function del(storeName, key) {
    if (_writeFence) return Promise.resolve();   // v04-02: nothing reopens a wiped database
    if (_held()) return Promise.reject(_fencedError());   // W8
    if (!STORE_SET.has(storeName)) {
      return Promise.reject(new Error('Unknown IDB store: ' + storeName));
    }
    return _queue(function () {
      if (_blocked()) return Promise.reject(_fencedError());
      return open().then(function (db) {
        if (_blocked()) throw _fencedError();
        return deleteValue(db, storeName, key);
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
        /** @type {Array<[IDBValidKey, any]>} */
        const rows = [];
        const req = ctx.store.openCursor();
        req.onsuccess = function (e) {
          const cursor = /** @type {IDBRequest<IDBCursorWithValue | null>} */ (e.target).result;
          if (cursor) {
            rows.push([cursor.key, cursor.value]);
            cursor.continue();
          } else {
            // Pieces join their value and never show as keys; a value whose pieces
            // do not add up rejects (DataError), never reads as missing.
            try { resolve(foldRows(rows)); } catch (err) { reject(err); }
          }
        };
        req.onerror = function () { reject(req.error || new Error('cursor failed')); };
        ctx.tx.onabort = function () {
          reject(ctx.tx.error || req.error || _makeAbortError());
        };
      });
    });
  }

  /**
   * Atomically write a store's migrated data blob AND its new schema version
   * in ONE transaction spanning the data store + the `meta` store. Either both
   * commit or neither — so a crash mid-commit can never leave data advanced
   * past its recorded version (which would re-run a non-idempotent migration
   * on already-migrated data) nor the inverse (version advanced past stale
   * data). The data blob lives under key 'v'; the version under meta key
   * 'schema:<storeName>'. Used by CachedStore's versioned-migration framework
   * (W7.1b).
   *
   * @param {StoreName} storeName
   * @param {any} dataValue   the migrated data blob
   * @param {number} version  the new schema version
   * @returns {Promise<void>}
   */
  function commitMigration(storeName, dataValue, version) {
    if (!STORE_SET.has(storeName)) {
      return Promise.reject(new Error('Unknown IDB store: ' + storeName));
    }
    if (_writeFence) return Promise.resolve();   // v04-02: nothing reopens a wiped database
    if (_held()) return Promise.reject(_fencedError());   // W8
    return _queue(function () {
      if (_blocked()) return Promise.reject(_fencedError());
      return open().then(function (db) {
        if (_blocked()) throw _fencedError();
        // The schema version rides the transaction that makes the data current:
        // with a big value in pieces, the last of its transactions.
        return writeValue(db, storeName, 'v', dataValue, {
          extraStores: ['meta'],
          inFinal: function (tx) { tx.objectStore('meta').put(version, 'schema:' + storeName); },
        });
      });
    });
  }

  /**
   * True iff the error is IndexedDB's VersionError: the database on disk was
   * upgraded by a NEWER VOTReader (DB_VERSION is lower than its version), so this
   * build can never open it - retrying cannot help (v04-03). The open request's
   * error is a DOMException whose name says so.
   *
   * @param {unknown} err
   * @returns {boolean}
   */
  function isVersionError(err) {
    return !!err && /** @type {any} */ (err).name === 'VersionError';
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
    _openInfo = null;
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
    commitMigration: commitMigration,
    setWriteFence: setWriteFence,
    setHoldCheck: setHoldCheck,
    isQuotaError: isQuotaError,
    isVersionError: isVersionError,
    openInfo: openInfo,
    onBrowserClose: onBrowserClose,
    onVersionChange: onVersionChange,
    describeUpgrade: describeUpgrade,
    _putOnce: _putOnce,
    _wrapRequest: wrapRequest,
    _resetForTests: _resetForTests,
  };
  return _self;
})();
