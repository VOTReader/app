// @ts-nocheck -- Q4.1 placeholder; will be removed when this file gets proper JSDoc in Q4.2 (utils) or Q4.3 (stores).
/* ===================================================================
   Tab thumbnail store — IndexedDB-backed dataURL cache
   ===================================================================
   ES module (G.2.3). Module-private state — moved out of index.html as
   part of the strict-mode conversion (esbuild ES modules are strict, so
   the in-function `_thumbDbPromise = ...` assignment would throw if the
   binding wasn't declared at module scope).
   Bundled helpers (P5e):
   - openThumbDB
   - idbPut
   - idbDelete
   - idbReadAll
   =================================================================== */

export const THUMB_DB = 'vot-thumbs';
export const THUMB_STORE = 'thumbs';
export let _thumbDbPromise = null;

export function openThumbDB() {
  if (_thumbDbPromise) return _thumbDbPromise;
  _thumbDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(THUMB_DB, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(THUMB_STORE)) db.createObjectStore(THUMB_STORE);
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch (_e) {resolve(null);}
  });
  return _thumbDbPromise;
}

export function idbPut(key, value) {
  return openThumbDB().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(THUMB_STORE, 'readwrite');
        tx.objectStore(THUMB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch (_e) {resolve();}
    });
  });
}

export function idbDelete(key) {
  return openThumbDB().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(THUMB_STORE, 'readwrite');
        tx.objectStore(THUMB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (_e) {resolve();}
    });
  });
}

export function idbReadAll() {
  return openThumbDB().then((db) => {
    if (!db) return {};
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(THUMB_STORE, 'readonly');
        const store = tx.objectStore(THUMB_STORE);
        const out = {};
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const c = e.target.result;
          if (c) {out[c.key] = c.value;c.continue();} else
          resolve(out);
        };
        req.onerror = () => resolve(out);
      } catch (_e) {resolve({});}
    });
  });
}

