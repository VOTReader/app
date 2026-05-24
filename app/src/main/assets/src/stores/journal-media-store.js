/* ═══════════════════════════════════════════════════════════════
   JOURNAL MEDIA STORE — IndexedDB wrapper for images + audio blobs
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
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
═══════════════════════════════════════════════════════════════ */

export var JournalMediaStore = (function() {
  var DB_NAME = 'vot-journal-media';
  var DB_VERSION = 1;
  var STORE = 'media';
  var _dbPromise = null;
  var _urlCache = {};

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function(resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not available'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(e.target.error); };
    });
    return _dbPromise;
  }

  function tx(mode) {
    return openDb().then(function(db) {
      return db.transaction([STORE], mode).objectStore(STORE);
    });
  }

  function mediaId() {
    return 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  return {
    /* Insert a new media record. If `record.id` is absent, auto-generates one. */
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
          req.onsuccess = function() {
            // Pre-warm the URL cache so the next render is instant.
            try { _urlCache[record.id] = URL.createObjectURL(record.blob); } catch (e) { /* IndexedDB op — best-effort; degrade silently if unsupported or quota hit */ }
            resolve(record.id);
          };
          req.onerror = function(e) { reject(e.target.error); };
        });
      });
    },

    get: function(id) {
      if (!id) return Promise.resolve(null);
      return tx('readonly').then(function(store) {
        return new Promise(function(resolve, reject) {
          var req = store.get(id);
          req.onsuccess = function(e) { resolve(e.target.result || null); };
          req.onerror = function(e) { reject(e.target.error); };
        });
      });
    },

    delete: function(id) {
      if (!id) return Promise.resolve();
      if (_urlCache[id]) {
        try { URL.revokeObjectURL(_urlCache[id]); } catch (e) { /* IndexedDB op — best-effort; degrade silently if unsupported or quota hit */ }
        delete _urlCache[id];
      }
      return tx('readwrite').then(function(store) {
        return new Promise(function(resolve, reject) {
          var req = store.delete(id);
          req.onsuccess = function() { resolve(); };
          req.onerror = function(e) { reject(e.target.error); };
        });
      });
    },

    list: function() {
      return tx('readonly').then(function(store) {
        return new Promise(function(resolve, reject) {
          var out = [];
          var req = store.openCursor();
          req.onsuccess = function(e) {
            var cursor = e.target.result;
            if (cursor) {
              var v = cursor.value;
              // Return metadata only — blob is heavy.
              out.push({ id: v.id, type: v.type, mime: v.mime, size: v.size, width: v.width, height: v.height, duration: v.duration, created: v.created });
              cursor.continue();
            } else {
              resolve(out);
            }
          };
          req.onerror = function(e) { reject(e.target.error); };
        });
      });
    },

    allIds: function() {
      return tx('readonly').then(function(store) {
        return new Promise(function(resolve, reject) {
          var out = [];
          var req = store.openKeyCursor ? store.openKeyCursor() : store.openCursor();
          req.onsuccess = function(e) {
            var cursor = e.target.result;
            if (cursor) {
              out.push(cursor.key !== undefined ? cursor.key : cursor.value.id);
              cursor.continue();
            } else {
              resolve(out);
            }
          };
          req.onerror = function(e) { reject(e.target.error); };
        });
      });
    },

    /* Returns a cached object URL for the given media id, fetching from
       IndexedDB on first call. Null if the record doesn't exist. */
    objectUrl: function(id) {
      if (!id) return Promise.resolve(null);
      if (_urlCache[id]) return Promise.resolve(_urlCache[id]);
      return this.get(id).then(function(rec) {
        if (!rec || !rec.blob) return null;
        try {
          var url = URL.createObjectURL(rec.blob);
          _urlCache[id] = url;
          return url;
        } catch (e) { return null; }
      });
    },

    /* Remove every blob NOT referenced by `referencedIds`. Used by the
       orphan cleanup pass on app start. */
    pruneOrphans: function(referencedIds) {
      var set = {};
      (referencedIds || []).forEach(function(id) { set[id] = true; });
      var self = this;
      return this.allIds().then(function(ids) {
        var toRemove = ids.filter(function(id) { return !set[id]; });
        return Promise.all(toRemove.map(function(id) { return self.delete(id); })).then(function() { return toRemove.length; });
      });
    },

    /* Image compression helper. Pass a File or Blob; returns a compressed
       Blob plus computed dimensions. Caller then `put`s the result.

       EXIF: older Android WebViews do NOT auto-apply EXIF orientation to
       <img>, so phone photos (orientation 6/8) would store sideways. When
       createImageBitmap supports imageOrientation:'from-image' we use it so
       the baked pixels are upright. Falls back to the <img> path otherwise. */
    compressImage: function(fileOrBlob, opts) {
      opts = opts || {};
      var maxDim = opts.maxDim || 1600;
      var quality = opts.quality || 0.8;

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
          catch (e) { cleanup && cleanup(); reject(new Error('Image draw failed')); return; }
          if (!canvas.toBlob) {
            // Pre-toBlob WebView fallback: dataURL → Blob.
            cleanup && cleanup();
            try {
              var durl = canvas.toDataURL('image/jpeg', quality);
              var bin = atob(durl.split(',')[1]);
              var arr = new Uint8Array(bin.length);
              for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              resolve({ blob: new Blob([arr], { type: 'image/jpeg' }), width: nw, height: nh });
            } catch (e2) { reject(new Error('Image encoding failed')); }
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
              try { bmp.close && bmp.close(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
            });
          })
          .catch(function() {
            // imageOrientation option unsupported or decode failed — retry
            // without the option, then fall back to the <img> path.
            return createImageBitmap(fileOrBlob).then(function(bmp) {
              return encodeFrom(bmp, bmp.width, bmp.height, function() {
                try { bmp.close && bmp.close(); } catch (e) { /* recorder cleanup — best-effort; ignore if already stopped / released */ }
              });
            }).catch(function() { return imgPath(); });
          });
      }
      return imgPath();

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

    mediaId: mediaId
  };
})();
