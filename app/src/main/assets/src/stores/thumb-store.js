/* ===================================================================
   Tab thumbnail store — IndexedDB-backed dataURL cache
   ===================================================================
   ES module (G.2.3). Module-private state — moved out of index.html as
   part of the strict-mode conversion (esbuild ES modules are strict, so
   the in-function `_thumbDbPromise = ...` assignment would throw if the
   binding wasn't declared at module scope).

   This module does NOT extend CachedStore — it's a thin IDB wrapper for
   the tab-thumbnail data URLs (each ~30-100 KB; too big for localStorage).
   Promise-based to swallow IDB errors as no-ops (we'd rather show a
   blank tab card than crash the overview).

   Bundled helpers (P5e):
   - openThumbDB
   - idbPut
   - idbDelete
   - idbReadAll
   =================================================================== */

/** IDB database name. */
export const THUMB_DB = 'vot-thumbs';

/** Object-store name inside THUMB_DB. */
export const THUMB_STORE = 'thumbs';

/** Module-private singleton promise; cached so re-opens reuse the same
 *  connection. Reset only by explicit IDB invalidation (currently never). */
export let _thumbDbPromise = /** @type {Promise<IDBDatabase | null> | null} */ (null);

/**
 * Open (or return the cached) IDB connection. Returns null on any error
 * — IDB is best-effort and the app degrades gracefully when it's
 * unavailable (private mode, quota, etc).
 *
 * @returns {Promise<IDBDatabase | null>}
 */
export function openThumbDB() {
  if (_thumbDbPromise) return _thumbDbPromise;
  _thumbDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(THUMB_DB, 1);
      req.onupgradeneeded = (e) => {
        const db = /** @type {IDBOpenDBRequest} */ (e.target).result;
        if (!db.objectStoreNames.contains(THUMB_STORE)) db.createObjectStore(THUMB_STORE);
      };
      req.onsuccess = (e) => resolve(/** @type {IDBOpenDBRequest} */ (e.target).result);
      req.onerror = () => resolve(null);
    } catch (_e) {resolve(null);}
  });
  return _thumbDbPromise;
}

/**
 * Put a single key/value into the thumbs store. Resolves to undefined
 * regardless of outcome (no error propagation — IDB failures are best-
 * effort).
 *
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export function idbPut(key, value) {
  return openThumbDB().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(THUMB_STORE, 'readwrite');
        tx.objectStore(THUMB_STORE).put(value, key);
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
      } catch (_e) {resolve(undefined);}
    });
  });
}

/**
 * Delete a key from the thumbs store. Resolves to undefined regardless
 * (no-error contract, same as idbPut).
 *
 * @param {string} key
 * @returns {Promise<void>}
 */
export function idbDelete(key) {
  return openThumbDB().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(THUMB_STORE, 'readwrite');
        tx.objectStore(THUMB_STORE).delete(key);
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => resolve(undefined);
      } catch (_e) {resolve(undefined);}
    });
  });
}

/**
 * Read entries from the thumbs store into a plain object. With no
 * `liveKeys` argument, reads every entry (today's full-dump contract —
 * ThumbStore's own tests rely on this). Given `liveKeys` (boot-
 * performance-5: an iterable of the currently-open tabs' content keys),
 * reads ONLY those rows and DELETES every other row in the same cursor
 * pass, so a caller that already knows its live key set never
 * materializes (or leaves lying around) rows for tabs that no longer
 * exist. Returns {} when IDB is unavailable or the read fails — partial
 * reads (some entries succeed, then an error) still return whatever was
 * collected up to that point.
 *
 * @param {Iterable<string>} [liveKeys]
 * @returns {Promise<Record<string, any>>}
 */
export function idbReadAll(liveKeys) {
  const keep = liveKeys ? new Set(liveKeys) : null;
  return openThumbDB().then((db) => {
    if (!db) return /** @type {Record<string, any>} */ ({});
    return new Promise((resolve) => {
      try {
        // boot-performance-5 follow-up: the live-key filter USED to delete every
        // non-matching row inline, which needed readwrite. It cannot: `liveKeys`
        // comes from `tabs`, `tabs` comes from the persisted vot-state, and that
        // store can mount on boot DEFAULTS — storage-backup-3 proves a 3 s
        // hydration timeout drops it to 'degraded' and the app renders one
        // synthetic tab. The pass would then commit a delete of every real
        // thumbnail before the true state arrived. Nothing about `tabsEnabled`
        // prevents that; it gates whether the pass runs, not whether `tabs` is
        // real. So this is a READ filter now — readonly, always. Deleting dead
        // rows stays with the debounced GC effect in use-thumbnails.js, which
        // depends on [tabs, tabThumbnails] and so re-runs once the real tabs
        // hydrate. (Verifier, 2026-09-04.)
        const tx = db.transaction(THUMB_STORE, 'readonly');
        const store = tx.objectStore(THUMB_STORE);
        /** @type {Record<string, any>} */
        const out = {};
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const c = /** @type {IDBRequest<IDBCursorWithValue | null>} */ (e.target).result;
          if (!c) { resolve(out); return; }
          const key = String(c.key);
          if (!keep || keep.has(key)) out[key] = c.value;
          c.continue();
        };
        req.onerror = () => resolve(out);
      } catch (_e) {resolve(/** @type {Record<string, any>} */ ({}));}
    });
  });
}
