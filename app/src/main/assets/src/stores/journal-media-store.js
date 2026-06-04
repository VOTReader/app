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
     JournalMediaStore.objectUrl(id)  → Promise<string | null>   (cached Blob URLs)

   Record shape:
     { id, type:'image'|'audio', blob:Blob, mime, size,
       width?, height?, duration?, created }

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
 *   created?: number
 * }} MediaRecord
 */

/**
 * Metadata-only shape returned by list() — same as MediaRecord minus the
 * heavy `blob` field. Used by the journal hub to render media counts and
 * thumbnails without loading every blob into memory.
 *
 * @typedef {Omit<MediaRecord, 'blob'>} MediaMetadata
 */

export var JournalMediaStore = (function() {
  var DB_NAME = 'vot-journal-media';
  var DB_VERSION = 1;
  var STORE = 'media';
  /** @type {Promise<IDBDatabase> | null} */
  var _dbPromise = null;
  /** @type {Record<string, string>} */
  var _urlCache = {};

  /**
   * Open (or reuse) the IDB connection. Rejects when IndexedDB is
   * unavailable; resolves with the database otherwise.
   * @returns {Promise<IDBDatabase>}
   */
  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function(resolve, reject) {
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
      };
      req.onsuccess = function(e) { resolve(/** @type {IDBOpenDBRequest} */ (e.target).result); };
      req.onerror = function(e) { reject(/** @type {IDBOpenDBRequest} */ (e.target).error); };
    });
    return _dbPromise;
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

  return {
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
            try { _urlCache[record.id] = URL.createObjectURL(record.blob); } catch (_e) { /* best-effort; degrade silently if unsupported or quota hit */ }
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
      if (_urlCache[id]) {
        try { URL.revokeObjectURL(_urlCache[id]); } catch (_e) { /* IndexedDB op — best-effort; degrade silently if unsupported or quota hit */ }
        delete _urlCache[id];
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
      if (_urlCache[id]) return Promise.resolve(_urlCache[id]);
      return this.get(id).then(function(rec) {
        if (!rec || !rec.blob) return null;
        try {
          var url = URL.createObjectURL(rec.blob);
          _urlCache[id] = url;
          return url;
        } catch (_e) { return null; }
      });
    },

    /**
     * Remove every blob NOT referenced by `referencedIds`. Returns the
     * count of removed records (for diagnostic logging). Used by the
     * orphan-cleanup pass on app start.
     * @param {string[]} referencedIds
     * @returns {Promise<number>}
     */
    pruneOrphans: function(referencedIds) {
      /** @type {Record<string, boolean>} */
      var set = {};
      (referencedIds || []).forEach(function(id) { set[id] = true; });
      var self = this;
      return this.allIds().then(function(ids) {
        var toRemove = ids.filter(function(id) { return !set[id]; });
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
          if (!w || !h) { cleanup && cleanup(); reject(new Error('Image has zero dimensions')); return; }
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var nw = Math.max(1, Math.round(w * scale));
          var nh = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = nw; canvas.height = nh;
          var ctx = canvas.getContext('2d');
          if (!ctx) { cleanup && cleanup(); reject(new Error('Canvas 2D unavailable')); return; }
          try { ctx.drawImage(source, 0, 0, nw, nh); }
          catch (_e) { cleanup && cleanup(); reject(new Error('Image draw failed')); return; }
          if (!canvas.toBlob) {
            // Pre-toBlob WebView fallback: dataURL → Blob.
            cleanup && cleanup();
            try {
              var durl = canvas.toDataURL('image/jpeg', quality);
              var bin = atob(durl.split(',')[1]);
              var arr = new Uint8Array(bin.length);
              for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              resolve({ blob: new Blob([arr], { type: 'image/jpeg' }), width: nw, height: nh });
            } catch (_e2) { reject(new Error('Image encoding failed')); }
            return;
          }
          canvas.toBlob(function(blob) {
            cleanup && cleanup();
            if (!blob || !blob.size) { reject(new Error('Image encoding failed')); return; }
            resolve({ blob: blob, width: nw, height: nh });
          }, 'image/jpeg', quality);
        });
      }

      // Reject obviously-empty input early (0-byte file).
      if (fileOrBlob && typeof fileOrBlob.size === 'number' && fileOrBlob.size === 0) {
        return Promise.reject(new Error('Image file is empty'));
      }

      var canBitmap = (typeof createImageBitmap === 'function');
      if (canBitmap) {
        return createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' })
          .then(function(bmp) {
            return encodeFrom(bmp, bmp.width, bmp.height, function() {
              try { bmp.close && bmp.close(); } catch (_e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
            });
          })
          .catch(function() {
            // imageOrientation option unsupported or decode failed — retry
            // without the option, then fall back to the <img> path.
            return createImageBitmap(fileOrBlob).then(function(bmp) {
              return encodeFrom(bmp, bmp.width, bmp.height, function() {
                try { bmp.close && bmp.close(); } catch (_e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
              });
            }).catch(function() { return imgPath(); });
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
