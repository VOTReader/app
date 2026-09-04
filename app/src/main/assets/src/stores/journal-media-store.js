/* ═══════════════════════════════════════════════════════════════
   JOURNAL MEDIA STORE — IndexedDB wrapper for images + audio blobs
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   No dependencies — uses only browser IndexedDB.

   Why IndexedDB: a single audio recording is ~200-400 KB and an image
   ~150 KB after compression. localStorage caps at ~5 MB across the
   ENTIRE app. Even modest journal use would exhaust that quota fast.
   IndexedDB on Android WebView has effectively unlimited quota.

   Public API (all methods return Promises):
     JournalMediaStore.put(record)    → Promise<id>
     JournalMediaStore.get(id)        → Promise<record | null>
     JournalMediaStore.delete(id)     → Promise<void>
     JournalMediaStore.list()         → Promise<Array<record-without-blob>>
     JournalMediaStore.allIds()       → Promise<Array<id>>
     JournalMediaStore.unclaimed(ids) → Promise<Array<record-without-blob>>
     JournalMediaStore.markLinked(id) → Promise<void>
     JournalMediaStore.objectUrl(id)  → Promise<string | null>   (cached Blob URLs)
     JournalMediaStore.beginImportReplace() / stageImportRecord(record) /
       commitImportReplace() / commitImportMerge() / abortImportReplace()
       (atomic restore: replace = exact, merge = salvage-without-delete)

   Record shape:
     { id, type:'image'|'audio', blob:Blob, mime, size,
       width?, height?, duration?, created, unlinked? }

   THE `unlinked` MARKER (journal-3, clause (b)). A record is written with
   `unlinked: true` the moment its bytes are durable and BEFORE any journal
   entry references it; `markLinked(id)` drops the field once the entry that
   owns it has been saved. It exists to answer one question the sweep cannot
   otherwise answer: an unreferenced record is either an owner the user
   deleted (prune it) or a link that never landed (a crash between `put` and
   the entry autosave — surface it, never prune it). `pruneOrphans` skips
   marked records for exactly that reason.

   The authoritative test for "unclaimed" is `marker AND unreferenced`, never
   the marker alone. The marker is written in one transaction and cleared in
   another, so it can go stale; AND-ing it with the referenced set the sweep
   already computes makes a failed `markLinked` cost nothing worse than one
   spurious banner row.

   Absent on every record written before journal-3, so `!rec.unlinked` is true
   for all of them and the sweep behaves exactly as it always has. No
   DB_VERSION bump, no migration.

   Object-URL cache: created Blob URLs are cached per-id so repeated
   reads inside the same session don't create duplicate URLs. Caller
   should NOT revokeObjectURL on these — the cache handles cleanup
   on store delete.

   Pattern note: this store does NOT extend CachedStore (it's IDB-backed,
   not localStorage-backed), so the extendStore helper doesn't apply.
   The IIFE that follows constructs the store directly with module-
   private state in closure.
═══════════════════════════════════════════════════════════════ */

/**
 * @typedef {{
 *   id: string,
 *   type: 'image' | 'audio',
 *   blob: Blob,
 *   mime?: string,
 *   size?: number,
 *   width?: number,
 *   height?: number,
 *   duration?: number,
 *   created?: number,
 *   unlinked?: boolean
 * }} MediaRecord
 */

/**
 * Metadata-only shape returned by list() — same as MediaRecord minus the
 * heavy `blob` field. Used by the journal hub to render media counts and
 * thumbnails without loading every blob into memory.
 *
 * @typedef {Omit<MediaRecord, 'blob'>} MediaMetadata
 */

/* How many leading bytes are read to size an image. A JPEG can carry a large
   EXIF block (and an embedded thumbnail) before its SOF marker; 64 KB clears
   every real one. Past that the size is simply unknown, which is a supported
   answer here -- see sourcePixelSize. */
var HEADER_PROBE_BYTES = 64 * 1024;

/**
 * The intrinsic pixel size an image declares in its own header, or null.
 *
 * journal-5 follow-up: `createImageBitmap`'s `resizeWidth` SETS the decode
 * width, it does not cap it -- per spec the decoder produces exactly that
 * width, upscaling a narrower source. So the hint can only be applied once
 * the source's real size is known, and this is the cheap way to know it:
 * the header states it, no decode required.
 *
 * Four formats are read. Anything else (HEIC, AVIF, TIFF, BMP, a file whose
 * header is damaged) returns null, and the caller then decodes with no hint
 * at all -- correct output at the cost of a full-size decode. Guessing is
 * what produced the upscale; declining to guess is the fix.
 *
 * @param {Uint8Array} b  the first bytes of the file
 * @returns {{ width: number, height: number } | null}
 */
function headerPixelSize(b) {
  if (!b || b.length < 10) return null;
  var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);

  // PNG: 8-byte signature, then an IHDR chunk carrying w,h as big-endian u32.
  if (b.length >= 24 && dv.getUint32(0) === 0x89504E47 && dv.getUint32(12) === 0x49484452) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // GIF: "GIF" then the logical screen size as little-endian u16.
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }
  // WebP: RIFF....WEBP, then one of three chunk layouts.
  if (b.length >= 30 && dv.getUint32(0) === 0x52494646 && dv.getUint32(8) === 0x57454250) {
    var fourcc = dv.getUint32(12);
    if (fourcc === 0x56503820) {          // "VP8 " lossy: 14-bit dims after the start code
      return { width: dv.getUint16(26, true) & 0x3FFF, height: dv.getUint16(28, true) & 0x3FFF };
    }
    if (fourcc === 0x5650384C) {          // "VP8L" lossless: 14-bit (w-1),(h-1) packed
      var bits = dv.getUint32(21, true);
      return { width: (bits & 0x3FFF) + 1, height: ((bits >>> 14) & 0x3FFF) + 1 };
    }
    if (fourcc === 0x56503858) {          // "VP8X" extended: 24-bit canvas (w-1),(h-1)
      return {
        width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
        height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1,
      };
    }
    return null;
  }
  // JPEG: walk the marker segments to the first frame header (SOF0..SOF15,
  // minus DHT/JPG/DAC, which share that range without carrying dimensions).
  if (b[0] === 0xFF && b[1] === 0xD8) {
    var i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }                    // resync
      var marker = b[i + 1];
      if (marker === 0xFF) { i++; continue; }                  // fill byte
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
      var len = dv.getUint16(i + 2);
      if (len < 2) return null;
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * headerPixelSize over the first HEADER_PROBE_BYTES of a Blob. Never
 * rejects: an unreadable header is the same answer as an unknown format.
 *
 * @param {File | Blob} blob
 * @returns {Promise<{ width: number, height: number } | null>}
 */
function sourcePixelSize(blob) {
  if (!blob || typeof blob.slice !== 'function') return Promise.resolve(null);
  var head = blob.slice(0, HEADER_PROBE_BYTES);
  if (!head || typeof head.arrayBuffer !== 'function') return Promise.resolve(null);
  return head.arrayBuffer().then(function(buf) {
    try { return headerPixelSize(new Uint8Array(buf)); } catch (_e) { return null; }
  }, function() { return null; });
}

export var JournalMediaStore = (function() {
  var DB_NAME = 'vot-journal-media';
  var DB_VERSION = 2;
  var STORE = 'media';
  var IMPORT_STORE = 'import-staging';
  /** @type {Promise<IDBDatabase> | null} */
  var _dbPromise = null;
  // PERF2: an LRU of live object URLs (id -> blob: URL). Each entry pins its blob in
  // heap until revoked, so this was an UNBOUNDED leak — browsing years of photos /
  // voice-memos accreted hundreds of MB of decoded blobs (only an explicit delete()
  // ever freed one). The Map's insertion order IS the LRU order (oldest first):
  // _cacheUrl evicts + revokes the oldest past the cap; _touchUrl moves a hit to the
  // MRU end. objectUrl() transparently re-creates a URL on a later miss, so eviction
  // is invisible to callers.
  /** @type {Map<string, string>} */
  var _urlCache = new Map();
  var URL_CACHE_MAX = 24;
  function _cacheUrl(id, url) {
    _urlCache.set(id, url);
    while (_urlCache.size > URL_CACHE_MAX) {
      var lruId = _urlCache.keys().next().value;   // first inserted = least-recently-used
      var victim = _urlCache.get(lruId);
      _urlCache.delete(lruId);
      try { URL.revokeObjectURL(victim); } catch (_e) { /* best-effort */ }
    }
  }
  function _touchUrl(id) {
    var url = _urlCache.get(id);
    _urlCache.delete(id);
    _urlCache.set(id, url);
  }

  /**
   * Open (or reuse) the IDB connection. Rejects when IndexedDB is
   * unavailable; resolves with the database otherwise.
   * @returns {Promise<IDBDatabase>}
   */
  function openDb() {
    if (_dbPromise) return _dbPromise;
    var p = new Promise(function(resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not available'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = /** @type {IDBOpenDBRequest} */ (e.target).result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(IMPORT_STORE)) {
          db.createObjectStore(IMPORT_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function(e) {
        var db = /** @type {IDBOpenDBRequest} */ (e.target).result;
        db.onversionchange = function() {
          try { db.close(); } catch (_e) { /* best-effort close */ }
          if (_dbPromise === p) _dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = function(e) { reject(/** @type {IDBOpenDBRequest} */ (e.target).error); };
      req.onblocked = function() { reject(new Error('Journal media database open blocked')); };
    });
    p.catch(function() { if (_dbPromise === p) _dbPromise = null; });
    _dbPromise = p;
    return p;
  }

  /**
   * Resolve to the IDB object store at the requested mode.
   * @param {IDBTransactionMode} mode
   * @returns {Promise<IDBObjectStore>}
   */
  function tx(mode) {
    return openDb().then(function(db) {
      return db.transaction([STORE], mode).objectStore(STORE);
    });
  }

  /**
   * Generate a fresh media-record id (timestamp + random suffix).
   * @returns {string}
   */
  function mediaId() {
    return 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * S2 — settle on the TRANSACTION's abort/error, not just the request. A
   * request's onsuccess can fire BEFORE the tx commits; if the tx then aborts
   * (QuotaExceeded at commit, or a concurrent versionchange forcing db.close()),
   * neither req.onsuccess nor req.onerror re-fires — so a promise that waits only
   * on the request would hang FOREVER. The import awaits each media put with no
   * timeout, so one such hang freezes the whole import (the only backup). Reject.
   * @param {IDBObjectStore} store
   * @param {(reason?: any) => void} reject
   */
  function guardTx(store, reject) {
    var t = store.transaction;
    t.addEventListener('abort', function() { reject(t.error || new Error('media transaction aborted')); });
    t.addEventListener('error', function() { reject(t.error || new Error('media transaction error')); });
  }

  /**
   * One transaction that lands every staged record into the live store —
   * clearing live first for an exact REPLACE, or leaving it intact for a
   * salvage MERGE — then empties staging. All-or-nothing either way: any
   * request failure aborts the transaction and live media rolls back.
   * @param {boolean} clearLive
   * @returns {Promise<void>}
   */
  function commitStaged(clearLive) {
    return openDb().then(function(db) {
      return new Promise(function(resolve, reject) {
        var transaction = db.transaction([STORE, IMPORT_STORE], 'readwrite');
        var live = transaction.objectStore(STORE);
        var staged = transaction.objectStore(IMPORT_STORE);
        if (clearLive) {
          var clearReq = live.clear();
          clearReq.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
        }
        var cursorReq = staged.openCursor();
        cursorReq.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
        cursorReq.onsuccess = function(e) {
          var cursor = /** @type {IDBRequest<IDBCursorWithValue | null>} */ (e.target).result;
          if (!cursor) {
            staged.clear();
            return;
          }
          live.put(cursor.value);
          cursor.continue();
        };
        transaction.addEventListener('complete', function() {
          _urlCache.forEach(function(url) {
            try { URL.revokeObjectURL(url); } catch (_e) { /* best-effort */ }
          });
          _urlCache.clear();
          resolve();
        });
        guardTx(live, reject);
      });
    });
  }

  /**
   * Clear one object store and settle only after its transaction commits.
   * @param {string} storeName
   * @returns {Promise<void>}
   */
  function clearStore(storeName) {
    return openDb().then(function(db) {
      return new Promise(function(resolve, reject) {
        var transaction = db.transaction([storeName], 'readwrite');
        var store = transaction.objectStore(storeName);
        var req = store.clear();
        req.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
        transaction.addEventListener('complete', function() { resolve(); });
        guardTx(store, reject);
      });
    });
  }

  return {
    /**
     * Start a fail-safe restore. Incoming records live in a separate IDB store,
     * so a truncated stream or quota failure cannot overwrite current media.
     * @returns {Promise<void>}
     */
    beginImportReplace: function() {
      return clearStore(IMPORT_STORE);
    },

    /**
     * Durably stage one incoming media record without touching the live store.
     * Awaiting each transaction preserves the one-Blob-at-a-time stream bound.
     * @param {MediaRecord} record
     * @returns {Promise<string>}
     */
    stageImportRecord: function(record) {
      if (!record || !record.id || !record.blob || !record.type) {
        return Promise.reject(new Error('Invalid staged media record'));
      }
      return openDb().then(function(db) {
        return new Promise(function(resolve, reject) {
          var transaction = db.transaction([IMPORT_STORE], 'readwrite');
          var store = transaction.objectStore(IMPORT_STORE);
          var req = store.put(record);
          req.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
          transaction.addEventListener('complete', function() { resolve(record.id); });
          guardTx(store, reject);
        });
      });
    },

    /**
     * Atomically replace the live media set with the fully staged import. IDB
     * transactions roll back the clear + every put together if any request or
     * the commit itself fails; the old user media therefore remains intact.
     * @returns {Promise<void>}
     */
    commitImportReplace: function() {
      return commitStaged(true);
    },

    /**
     * Salvage commit: land the staged records into the live store BY ID without
     * clearing or pruning anything. Used when the import stream or manifest was
     * damaged — a partial restore merges what it could read and can never
     * delete existing media.
     * @returns {Promise<void>}
     */
    commitImportMerge: function() {
      return commitStaged(false);
    },

    /** Discard a failed/incomplete import without touching live media. */
    abortImportReplace: function() {
      return clearStore(IMPORT_STORE);
    },

    /**
     * Insert a media record. Auto-generates id/created/size/mime when
     * absent. Pre-warms the URL cache on success so the next render is
     * instant. Rejects when blob/type is missing.
     * @param {MediaRecord} record
     * @returns {Promise<string>}  the (possibly auto-generated) id
     */
    put: function(record) {
      if (!record || !record.blob || !record.type) {
        return Promise.reject(new Error('Invalid media record: requires blob + type'));
      }
      if (!record.id) record.id = mediaId();
      if (!record.created) record.created = Date.now();
      if (!record.size && record.blob.size) record.size = record.blob.size;
      if (!record.mime && record.blob.type) record.mime = record.blob.type;
      return tx('readwrite').then(function(store) {
        return new Promise(function(resolve, reject) {
          var req = store.put(record);
          req.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
          // STORE-3: cache the object URL AND resolve only once the tx COMMITS, so a
          // put the caller awaits (e.g. the import) is genuinely durable. req.onsuccess
          // fires BEFORE commit; caching the URL there left a live URL pointing at a
          // blob that a commit-time abort (e.g. quota) actually rolled back — masking
          // the failure for the rest of the session.
          store.transaction.addEventListener('complete', function() {
            try { _cacheUrl(record.id, URL.createObjectURL(record.blob)); } catch (_e) { /* best-effort; degrade silently if unsupported or quota hit */ }
            resolve(record.id);
          });
          guardTx(store, reject);
        });
      });
    },

    /**
     * Read one record by id (full record including blob). Resolves null
     * when id is falsy or unknown.
     * @param {string | null | undefined} id
     * @returns {Promise<MediaRecord | null>}
     */
    get: function(id) {
      if (!id) return Promise.resolve(null);
      return tx('readonly').then(function(store) {
        return new Promise(function(resolve, reject) {
          var req = store.get(id);
          req.onsuccess = function(e) { resolve(/** @type {IDBRequest} */ (e.target).result || null); };
          req.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
          guardTx(store, reject);
        });
      });
    },

    /**
     * Delete a record AND revoke its cached object URL. Idempotent.
     * @param {string | null | undefined} id
     * @returns {Promise<void>}
     */
    delete: function(id) {
      if (!id) return Promise.resolve();
      if (_urlCache.has(id)) {
        try { URL.revokeObjectURL(_urlCache.get(id)); } catch (_e) { /* IndexedDB op — best-effort; degrade silently if unsupported or quota hit */ }
        _urlCache.delete(id);
      }
      return tx('readwrite').then(function(store) {
        return new Promise(function(resolve, reject) {
          var req = store.delete(id);
          req.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
          store.transaction.addEventListener('complete', function() { resolve(); });
          guardTx(store, reject);
        });
      });
    },

    /**
     * Metadata for every record (no blobs). Cheap enough to call on
     * hub renders; expensive blobs load lazily via objectUrl().
     * @returns {Promise<MediaMetadata[]>}
     */
    list: function() {
      return tx('readonly').then(function(store) {
        return new Promise(function(resolve, reject) {
          /** @type {MediaMetadata[]} */
          var out = [];
          var req = store.openCursor();
          req.onsuccess = function(e) {
            var cursor = /** @type {IDBRequest<IDBCursorWithValue | null>} */ (e.target).result;
            if (cursor) {
              var v = cursor.value;
              out.push({ id: v.id, type: v.type, mime: v.mime, size: v.size, width: v.width, height: v.height, duration: v.duration, created: v.created });
              cursor.continue();
            } else {
              resolve(out);
            }
          };
          req.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
          guardTx(store, reject);
        });
      });
    },

    /**
     * Media that is durable, marked, and referenced by no journal entry —
     * "unclaimed" in the journal-3 sense: bytes the user recorded and has
     * never been shown, because the entry that would have owned them never
     * saved. The Journal Hub offers each one back with Recover / Discard.
     *
     * Cursors the object store directly rather than filtering `list()`:
     * `list()` builds an explicit field projection and would silently drop
     * `unlinked`, so a filter over its output can only ever return nothing.
     *
     * Metadata only — no blobs. The banner needs `duration` and `created` to
     * render a row the user can tell apart, and nothing heavier.
     *
     * @param {string[]} referencedIds every mediaId any entry currently
     *   references. The marker alone is NOT authoritative (it can go stale if
     *   markLinked failed); marker AND unreferenced is.
     * @returns {Promise<MediaMetadata[]>}
     */
    unclaimed: function(referencedIds) {
      /** @type {Record<string, boolean>} */
      var set = {};
      (referencedIds || []).forEach(function(id) { set[id] = true; });
      return tx('readonly').then(function(store) {
        return new Promise(function(resolve, reject) {
          /** @type {MediaMetadata[]} */
          var out = [];
          var req = store.openCursor();
          req.onsuccess = function(e) {
            var cursor = /** @type {IDBRequest<IDBCursorWithValue | null>} */ (e.target).result;
            if (!cursor) { resolve(out); return; }
            var v = cursor.value || {};
            if (v.unlinked === true && !set[v.id]) {
              out.push({ id: v.id, type: v.type, mime: v.mime, size: v.size, width: v.width, height: v.height, duration: v.duration, created: v.created, unlinked: true });
            }
            cursor.continue();
          };
          req.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
          guardTx(store, reject);
        });
      });
    },

    /**
     * Drop the `unlinked` marker — the entry that owns this media has saved.
     *
     * BEST-EFFORT BY DESIGN, and it is worth knowing why that is safe: a
     * failed markLinked cannot lose data. The record keeps a stale marker, and
     * the only consequence is one spurious "unclaimed" banner row if that
     * entry is later deleted — because the authoritative test AND-s the marker
     * with the referenced set. Erring the other way (clearing the marker
     * before the entry is saved) would hand the record back to the sweep with
     * nothing standing between it and deletion.
     *
     * A record that no longer exists resolves quietly: the caller's job is
     * done either way.
     *
     * @param {string} id
     * @returns {Promise<void>}
     */
    markLinked: function(id) {
      if (!id) return Promise.resolve();
      var self = this;
      return self.get(id).then(function(rec) {
        if (!rec || !rec.unlinked) return undefined;
        delete rec.unlinked;
        return self.put(rec).then(function() { return undefined; });
      });
    },

    /**
     * Every id in the store. Uses openKeyCursor when available (cheaper
     * — no value materialization).
     * @returns {Promise<string[]>}
     */
    allIds: function() {
      return tx('readonly').then(function(store) {
        return new Promise(function(resolve, reject) {
          /** @type {string[]} */
          var out = [];
          var req = store.openKeyCursor ? store.openKeyCursor() : store.openCursor();
          req.onsuccess = function(e) {
            var cursor = /** @type {IDBRequest<IDBCursor | null>} */ (e.target).result;
            if (cursor) {
              out.push(String(cursor.key !== undefined ? cursor.key : /** @type {any} */ (cursor).value.id));
              cursor.continue();
            } else {
              resolve(out);
            }
          };
          req.onerror = function(e) { reject(/** @type {IDBRequest} */ (e.target).error); };
          guardTx(store, reject);
        });
      });
    },

    /**
     * Cached object URL for a media id. First call creates + caches the
     * URL; subsequent calls return the cached value. Resolves null when
     * id is unknown or createObjectURL throws.
     * @param {string | null | undefined} id
     * @returns {Promise<string | null>}
     */
    objectUrl: function(id) {
      if (!id) return Promise.resolve(null);
      if (_urlCache.has(id)) { _touchUrl(id); return Promise.resolve(_urlCache.get(id)); }
      return this.get(id).then(function(rec) {
        if (!rec || !rec.blob) return null;
        try {
          var url = URL.createObjectURL(rec.blob);
          _cacheUrl(id, url);
          return url;
        } catch (_e) { return null; }
      });
    },

    /**
     * TRIM: revoke every cached object URL and empty the LRU. Each entry pins
     * its decoded blob in heap, so this frees that memory on an OS memory-
     * pressure signal (Android MainActivity.onTrimMemory → window.__onTrimMemory).
     * Safe by construction — objectUrl() transparently re-creates a URL from IDB
     * on the next miss, so this is a CACHE DROP, not data loss. Returns the count
     * released (diagnostics). Never throws.
     * @returns {number}
     */
    releaseObjectUrls: function() {
      var n = _urlCache.size;
      _urlCache.forEach(function(url) {
        try { URL.revokeObjectURL(url); } catch (_e) { /* best-effort */ }
      });
      _urlCache.clear();
      return n;
    },

    /**
     * Remove every blob NOT referenced by `referencedIds`. Returns the
     * count of removed records (for diagnostic logging). Used by the
     * orphan-cleanup pass on app start.
     *
     * STORE-2: the boot sweep snapshots `referencedIds` SYNCHRONOUSLY, but this
     * prune reads IDB asynchronously — a photo captured in that window is durable
     * in IDB yet absent from the snapshot, so deleting "ids not in the set" would
     * reclaim a just-taken photo (TOCTOU data loss). When `cutoffMs` is given (the
     * sweep start time), a record created AT/AFTER it is NEVER pruned: it is too
     * new to be a real orphan (it may be referenced by an entry that post-dates the
     * snapshot). We read id+`created` in ONE cursor pass, then delete via delete()
     * (which keeps the object-URL cache clean). Omitting cutoffMs keeps the legacy
     * "prune every unreferenced id" behavior.
     * @param {string[]} referencedIds
     * @param {number} [cutoffMs]  sweep-start timestamp; records `created` >= this survive
     * @returns {Promise<number>}
     */
    pruneOrphans: function(referencedIds, cutoffMs) {
      /** @type {Record<string, boolean>} */
      var set = {};
      (referencedIds || []).forEach(function(id) { set[id] = true; });
      var cutoff = (typeof cutoffMs === 'number') ? cutoffMs : Infinity;
      var self = this;
      return tx('readonly').then(function(store) {
        return new Promise(function(resolve, reject) {
          /** @type {string[]} */
          var toRemove = [];
          var req = store.openCursor();
          req.onsuccess = function(e) {
            var cursor = /** @type {IDBCursorWithValue | null} */ (/** @type {IDBRequest} */ (e.target).result);
            if (!cursor) { resolve(toRemove); return; }
            var rec = cursor.value || {};
            var created = (typeof rec.created === 'number') ? rec.created : 0;
            // `rec.unlinked` is the link-never-landed marker (see the header).
            // An unreferenced record carrying it is UNCLAIMED, not orphaned:
            // the bytes are real and the user has never been shown them, so it
            // is surfaced by the Hub banner rather than deleted here.
            if (!set[rec.id] && !rec.unlinked && created < cutoff) toRemove.push(rec.id);
            cursor.continue();
          };
          req.onerror = function() { reject(req.error); };
          guardTx(store, reject);
        });
      }).then(function(toRemove) {
        return Promise.all(toRemove.map(function(id) { return self.delete(id); })).then(function() { return toRemove.length; });
      });
    },

    /**
     * Compress an image File/Blob to a smaller JPEG suitable for storage.
     * Returns the compressed blob + computed dimensions. Caller `put`s
     * the result with type:'image'.
     *
     * EXIF: older Android WebViews do NOT auto-apply EXIF orientation
     * to `<img>`, so phone photos (orientation 6/8) would store sideways.
     * When createImageBitmap supports `imageOrientation:'from-image'`
     * we use it so the baked pixels are upright. Falls back to the
     * <img> path otherwise.
     *
     * journal-5: createImageBitmap used to be called with NO size hint, so
     * the decoder built the FULL-RESOLUTION bitmap before encodeFrom ever
     * got a chance to downscale it — a 50 MP phone shot (8160x6120,
     * ordinary for a current flagship) is 8160*6120*4 = ~191 MB of RGBA
     * momentarily alive in the renderer heap, on top of whatever the
     * journal editor + loaded corpora + object-URL cache already hold.
     * `resizeWidth` tells the decoder to build the SMALL bitmap directly
     * — giving only ONE of resizeWidth/resizeHeight is what keeps this
     * aspect-ratio-correct: per spec, the browser computes the other
     * dimension from the SOURCE's own aspect ratio (which it already knows
     * from the file header), not from anything this function guesses.
     * Passing BOTH would stretch/distort every non-square photo instead.
     *
     * journal-5 follow-up: that same spec sentence is why the hint SETS the
     * decode width rather than capping it. Handed a source narrower than
     * `maxDim`, the decoder UPSCALES to exactly `maxDim`, and encodeFrom
     * then reads the inflated bitmap as if it were the source: an 800x600
     * photo was stored 1600x1200 at ~3.1x its own bytes, all interpolated,
     * and a 1080x6000 stitched screenshot (6.5 Mpx, under the ceiling) was
     * inflated to 14.2 Mpx and then rejected by the ceiling below — a
     * backstop firing on an image the hint itself made oversized, with no
     * fallback because the failure is `terminal`.
     *
     * So the hint is applied only when the source's own header says it
     * cannot upscale: BOTH source dimensions at or above `maxDim`. That one
     * comparison is deliberately conservative about EXIF. With
     * `imageOrientation:'from-image'` an orientation 6/8 photo decodes with
     * its axes SWAPPED relative to the header, so a rule that picked an axis
     * ("hint the long edge") could hand `resizeWidth` a value larger than
     * the decoded width and upscale again. When both dimensions clear
     * `maxDim`, no swap can make `resizeWidth: maxDim` an upscale.
     *
     * The cost of being conservative is that an extreme aspect ratio whose
     * SHORT edge is under `maxDim` (a panorama, a long screenshot) decodes
     * un-hinted at its full size, then downscales on the canvas exactly as
     * it did before journal-5. Slower, never lossy, and never refused.
     *
     * THERE IS DELIBERATELY NO SIZE CEILING HERE (Architect, 2026-09-04).
     * journal-5 added one after the decode, and a post-decode ceiling cannot
     * prevent the allocation it exists to prevent — by the time
     * createImageBitmap resolves the RGBA is already spent, so rejecting
     * costs the reader their image and buys nothing. Pre-journal-5 this
     * function had no ceiling and accepted anything decodable, because the
     * draw below already scales by min(1, maxDim / max(w, h)): a bitmap that
     * decoded is a bitmap this can handle. A guard that actually prevents an
     * OOM has to run BEFORE the decode, off the header — which also makes
     * the EXIF orientation tag nearly free and removes the conservatism
     * above. That is journal-8, its own change, not folded in here.
     *
     * @param {File | Blob} fileOrBlob
     * @param {{ maxDim?: number, quality?: number }} [opts]
     *   maxDim defaults to 1600; quality defaults to 0.8.
     * @returns {Promise<{ blob: Blob, width: number, height: number }>}
     */
    compressImage: function(fileOrBlob, opts) {
      opts = opts || {};
      var maxDim = opts.maxDim || 1600;
      var quality = opts.quality || 0.8;

      /**
       * @param {CanvasImageSource & {width: number, height: number}} source
       * @param {number} w
       * @param {number} h
       * @param {(() => void) | null} [cleanup]
       * @returns {Promise<{ blob: Blob, width: number, height: number }>}
       */
      function encodeFrom(source, w, h, cleanup) {
        return new Promise(function(resolve, reject) {
          // journal-5: every failure below is about the DECODED bitmap or the
          // canvas/encode step, never about which createImageBitmap options
          // were used — retrying the decode with different options cannot
          // fix a zero-dimension bitmap or a missing 2D context any more than
          // the first attempt could. `terminal` tells
          // the two .catch() handlers downstream (the imageOrientation retry
          // and the <img>-fallback) to propagate these instead of treating
          // them like a decode failure worth retrying: a bitmap that decoded
          // and then failed the canvas step will fail imgPath()'s <img> decode
          // the same way, having paid for a second full-resolution decode
          // first.
          function fail(message) {
            cleanup && cleanup();
            var err = /** @type {any} */ (new Error(message));
            err.terminal = true;
            reject(err);
          }
          if (!w || !h) { fail('Image has zero dimensions'); return; }
          // journal-5 rejected here when w*h exceeded 4x a maxDim square. What
          // that line did was refuse an image AFTER its bitmap was already
          // allocated, so it never prevented the memory it named — and with
          // `terminal` set there was no fallback, so the attach was simply
          // dropped. The scale below handles any decodable bitmap. See the
          // doc comment: the real guard is pre-decode, filed as journal-8.
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var nw = Math.max(1, Math.round(w * scale));
          var nh = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = nw; canvas.height = nh;
          var ctx = canvas.getContext('2d');
          if (!ctx) { fail('Canvas 2D unavailable'); return; }
          try { ctx.drawImage(source, 0, 0, nw, nh); }
          catch (_e) { fail('Image draw failed'); return; }
          if (!canvas.toBlob) {
            // Pre-toBlob WebView fallback: dataURL → Blob.
            cleanup && cleanup();
            try {
              var durl = canvas.toDataURL('image/jpeg', quality);
              var bin = atob(durl.split(',')[1]);
              var arr = new Uint8Array(bin.length);
              for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              resolve({ blob: new Blob([arr], { type: 'image/jpeg' }), width: nw, height: nh });
            } catch (_e2) { fail('Image encoding failed'); }
            return;
          }
          canvas.toBlob(function(blob) {
            cleanup && cleanup();
            if (!blob || !blob.size) { var err = /** @type {any} */ (new Error('Image encoding failed')); err.terminal = true; reject(err); return; }
            resolve({ blob: blob, width: nw, height: nh });
          }, 'image/jpeg', quality);
        });
      }

      // Reject obviously-empty input early (0-byte file).
      if (fileOrBlob && typeof fileOrBlob.size === 'number' && fileOrBlob.size === 0) {
        return Promise.reject(new Error('Image file is empty'));
      }

      // journal-5: resizeQuality 'high' is supported far below the chrome108
      // floor (native since Chromium 51) — no compat concern raising it from
      // the implicit default ('low').
      var canBitmap = (typeof createImageBitmap === 'function');
      if (canBitmap) {
        return sourcePixelSize(fileOrBlob).then(function(src) {
          // The one comparison the hint hangs on — see the doc comment.
          var canHint = !!src && Math.min(src.width, src.height) >= maxDim;
          /** @type {ImageBitmapOptions} */
          var hint = canHint ? { resizeWidth: maxDim, resizeQuality: 'high' } : {};
          /** @type {ImageBitmapOptions} */
          var primary = { imageOrientation: 'from-image' };
          if (canHint) { primary.resizeWidth = maxDim; primary.resizeQuality = 'high'; }

          return createImageBitmap(fileOrBlob, primary)
            .then(function(bmp) {
              return encodeFrom(bmp, bmp.width, bmp.height, function() {
                try { bmp.close && bmp.close(); } catch (_e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
              });
            })
            .catch(function(err) {
              if (err && err.terminal) throw err;   // journal-5: encodeFrom's own failure — not retryable
              // imageOrientation option unsupported or decode failed — retry
              // without it, then fall back to the <img> path. The hint
              // DECISION carries over unchanged rather than being re-guessed:
              // it is what prevents the full-resolution decode, and losing
              // correct EXIF orientation on this rare fallback is a far
              // smaller cost than a 191 MB decode on the (likely still
              // orientation-capable) host that only balked at one option.
              return createImageBitmap(fileOrBlob, hint).then(function(bmp) {
                return encodeFrom(bmp, bmp.width, bmp.height, function() {
                  try { bmp.close && bmp.close(); } catch (_e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
                });
              }).catch(function(err2) {
                if (err2 && err2.terminal) throw err2;   // journal-5: same — never fall through to a full <img> decode
                return imgPath();
              });
            });
        });
      }
      return imgPath();

      /** @returns {Promise<{ blob: Blob, width: number, height: number }>} */
      function imgPath() {
        return new Promise(function(resolve, reject) {
          var url = URL.createObjectURL(fileOrBlob);
          var img = new Image();
          img.onload = function() {
            encodeFrom(img, img.naturalWidth, img.naturalHeight, function() {
              URL.revokeObjectURL(url);
            }).then(resolve, reject);
          };
          img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
          img.src = url;
        });
      }
    },

    /** Exposed for callers that need to generate ids ahead of put(). */
    mediaId: mediaId
  };
})();
