const THUMB_DB = 'vot-thumbs';
const THUMB_STORE = 'thumbs';
let _thumbDbPromise = null;

function openThumbDB() {
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
    } catch (e) {resolve(null);}
  });
  return _thumbDbPromise;
}

function idbPut(key, value) {
  return openThumbDB().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(THUMB_STORE, 'readwrite');
        tx.objectStore(THUMB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch (e) {resolve();}
    });
  });
}

function idbDelete(key) {
  return openThumbDB().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(THUMB_STORE, 'readwrite');
        tx.objectStore(THUMB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {resolve();}
    });
  });
}

function idbReadAll() {
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
      } catch (e) {resolve({});}
    });
  });
}
