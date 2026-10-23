/* ===================================================================
   Tab thumbnail store — IndexedDB-backed dataURL cache
   ===================================================================
   ES module (G.2.3). Module-private state — moved out of index.html as
   part of the strict-mode conversion (esbuild ES modules are strict, so
   the in-function `_thumbDbPromise = ...` assignment would throw if the
   binding wasn't declared at module scope).

   This module does NOT extend CachedStore — it's a thin IDB wrapper for
   the tab-thumbnail data URLs (150-400 KB each since the 1440 px / q90
   captures, two per tab; too big for localStorage).
   Promise-based to swallow IDB errors as no-ops (we'd rather show a
   blank tab card than crash the overview).

   Writes go through idb-chunks.js (2026-10-11): an entry over the inline
   line is stored in small pieces across small, explicitly committed
   transactions, one write at a time - never as a blob file, never as an
   open transaction a frozen page could leave behind (the shape that made
   the WebView destroy this origin's whole IndexedDB, idb-chunks.js header).
   Pieces never show to a caller: idbReadAll joins them, idbAllKeys hides
   them from the GC sweep, idbDelete takes them with the key. THUMB_DB_VERSION
   2 keeps a pre-pieces build (which would read a manifest as a thumbnail)
   out: its open fails and it shows blank cards.

   Bundled helpers (P5e):
   - openThumbDB
   - idbPut
   - idbDelete
   - idbReadAll
   =================================================================== */

import { writeValue, deleteValue, getValue, foldRows, isChunkKey, chunkOwner, writeQueue } from './idb-chunks.js';

/** IDB database name. */
export const THUMB_DB = 'vot-thumbs';

/** 2: entries may be stored in pieces (header). */
export const THUMB_DB_VERSION = 2;

/** One write at a time on this database. */
const _queue = writeQueue();

/** Object-store name inside THUMB_DB. */
export const THUMB_STORE = 'thumbs';

/** Module-private singleton promise; cached so re-opens reuse the same
 *  connection. Dropped on versionchange, and when an open fails or is blocked
 *  (ds5 s12.2), so the next call opens again. */
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
  let settled = false;
  /** @type {Promise<IDBDatabase | null> | null} */
  let self = null;
  /** ds5 s12.2: a failed or blocked open resolves null and is not kept, so one
   *  transient failure no longer turns thumbnails off until a reload. */
  const fail = () => {
    if (settled) return;
    settled = true;
    if (self && _thumbDbPromise === self) _thumbDbPromise = null;
    resolve(null);
  };
  /** @type {(v: IDBDatabase | null) => void} */
  let resolve = () => {};
  const p = new Promise((res) => {
    resolve = res;
    try {
      const req = indexedDB.open(THUMB_DB, THUMB_DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = /** @type {IDBOpenDBRequest} */ (e.target).result;
        if (!db.objectStoreNames.contains(THUMB_STORE)) db.createObjectStore(THUMB_STORE);
      };
      req.onsuccess = (e) => {
        const db = /** @type {IDBOpenDBRequest} */ (e.target).result;
        // A blocked open already settled null; the connection that arrives once
        // the blocker closes is unused, and left open it would block the next
        // upgrade or Clear All's delete in turn.
        if (settled) { try { db.close(); } catch (_e) { /* best-effort close */ } return; }
        settled = true;
        // storage-backup-4: without this, the connection stays open for the
        // life of the page and indexedDB.deleteDatabase('vot-thumbs')
        // (Settings → Clear All My Data) fires onblocked instead of
        // onsuccess — the delete never runs and every tab thumbnail
        // silently survives the wipe. Mirrors idb-adapter.js / journal-
        // media-store.js: close on versionchange so the delete can proceed,
        // and drop the cached promise so the next openThumbDB() reopens.
        db.onversionchange = () => {
          try { db.close(); } catch (_e) { /* best-effort close */ }
          if (_thumbDbPromise === self) _thumbDbPromise = null;
        };
        resolve(db);
      };
      req.onerror = fail;
      // An old connection holding the upgrade fires blocked and may never let go:
      // without this the promise never settled and every queued write waited on it.
      req.onblocked = fail;
    } catch (_e) { fail(); }
  });
  self = p;
  // an open that threw has already failed: cache nothing, the next call tries again
  if (!settled) _thumbDbPromise = p;
  return p;
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
  return _queue(() => openThumbDB().then((db) => {
    if (!db) return undefined;
    return writeValue(db, THUMB_STORE, key, value).then(() => undefined, () => undefined);
  }));
}

/**
 * Delete a key from the thumbs store. Resolves to undefined regardless
 * (no-error contract, same as idbPut).
 *
 * @param {string} key
 * @returns {Promise<void>}
 */
export function idbDelete(key) {
  return _queue(() => openThumbDB().then((db) => {
    if (!db) return undefined;
    return deleteValue(db, THUMB_STORE, key).then(() => undefined, () => undefined);
  }));
}

/**
 * Read entries from the thumbs store into a plain object. With no
 * `liveKeys` argument, reads every entry (the full-dump contract —
 * ThumbStore's own tests rely on this). Given `liveKeys` (boot-
 * performance-5: an iterable of the currently-open tabs' content keys),
 * reads ONLY those rows, so a caller that already knows its live key set
 * never materializes rows for tabs that no longer exist.
 *
 * **It DELETES NOTHING, and callers must not assume otherwise.** An earlier
 * version dropped the non-matching rows inline in the same cursor pass; that
 * cannot be right here, because every caller's key set derives from `tabs`,
 * `tabs` derives from the persisted vot-state, and that store mounts on
 * synthetic boot defaults when hydration times out (storage-backup-3) — so
 * the pass deleted the whole store on a degraded boot. Dead rows are
 * collected by useThumbnails' debounced GC, which sweeps `idbAllKeys()` and
 * runs only once StateStore reports 'loaded'. Do not "optimize" that sweep
 * away as redundant with this read; it is the only thing that deletes.
 *
 * Returns {} when IDB is unavailable or the read fails — partial
 * reads (some entries succeed, then an error) still return whatever was
 * collected up to that point.
 *
 * @param {Iterable<string>} [liveKeys]
 * @returns {Promise<Record<string, any>>}
 */
/**
 * Every key in the thumbs store, without reading a single value. The GC needs
 * to know what is ON DISK, not what reached React state — after
 * boot-performance-5 the mount read only loads live rows, so a row whose tab
 * closed in a previous session never enters state and a state-derived sweep
 * cannot see it. `getAllKeys` keeps that cheap: the values are base64 JPEGs
 * and there is no reason to pull them just to name them.
 * @returns {Promise<string[]>} empty on any failure (IDB is best-effort)
 */
export function idbAllKeys() {
  return openThumbDB().then((db) => {
    if (!db) return /** @type {string[]} */ ([]);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(THUMB_STORE, 'readonly');
        const req = tx.objectStore(THUMB_STORE).getAllKeys();
        // Tab keys only: a piece is named by the tab it belongs to, so the GC sweeps
        // a dead tab's pieces with it - even pieces a kill left with no entry at all.
        req.onsuccess = () => {
          const keys = new Set();
          for (const k of (req.result || [])) keys.add(isChunkKey(k) ? chunkOwner(String(k)) : String(k));
          resolve(Array.from(keys));
        };
        req.onerror = () => resolve([]);
      } catch (_e) { resolve([]); }
    });
  });
}

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
        if (keep) {
          // Only the live rows, each put back together from its pieces when it has
          // them; one whose pieces do not add up is left out (a blank card that the
          // next capture heals), never thrown at the overview.
          const keys = Array.from(keep);
          Promise.all(keys.map((k) => getValue(store, k).then((v) => { if (v !== undefined) out[k] = v; }, () => {})))
            .then(() => resolve(out), () => resolve(out));
          return;
        }
        /** @type {Array<[IDBValidKey, any]>} */
        const rows = [];
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const c = /** @type {IDBRequest<IDBCursorWithValue | null>} */ (e.target).result;
          if (!c) { resolve(Object.assign(out, foldRows(rows, () => {}))); return; }
          rows.push([c.key, c.value]);
          c.continue();
        };
        req.onerror = () => {
          try { resolve(Object.assign(out, foldRows(rows, () => {}))); } catch (_e) { resolve(out); }
        };
      } catch (_e) {resolve(/** @type {Record<string, any>} */ ({}));}
    });
  });
}
