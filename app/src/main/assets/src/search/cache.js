/* ═══════════════════════════════════════════════════════════════════════
   search/cache.js — MiniSearch warm-index cache (IndexedDB)
   ═══════════════════════════════════════════════════════════════════════
   MEASURED (real corpus, 31,832 docs): a fresh build is ~10s (MiniSearch's
   addAll over ~1M tokens from the long VOT letter bodies — buildDocs itself is
   ~55ms), but JSON.stringify is ~0.5s and MiniSearch.loadJSON restores the whole
   index in ~0.3s. So the index is built ONCE (behind the progress bar), cached as
   one ~21 MB JSON blob, and warm-opened in ~0.3s every time after — a 30× win.
   Far simpler than the Classic engine's FlexSearch export/import callback dance:
   one key, one blob, restore via the static MiniSearch.loadJSON.

   Invalidation: a structural signature (corpus array lengths + book/chapter
   counts) busts the cache on any add/remove. MS_INDEX_VERSION busts it on a
   doc-shape / search-config change. A content-only edit that preserves every
   length is NOT auto-detected — bump MS_INDEX_VERSION (or run "/rebuild index")
   in that case. (The Classic engine carries the same caveat via its
   CORPUS_CONTENT_VERSION.)

   NOTE (verify gotcha): to test a fresh build in preview you must wipe this DB
   too — indexedDB.deleteDatabase('vot-minisearch-cache') — or it warm-restores.
   ═══════════════════════════════════════════════════════════════════════ */

const DB_NAME = 'vot-minisearch-cache';
const STORE = 'idx';
const KEY = 'index';

/** Bump on any index-builder doc-shape OR search-config change (busts all caches). */
export const MS_INDEX_VERSION = 'm1';

function ln(v) { return (v && typeof v.length === 'number') ? v.length : 0; }
function kc(v) { return (v && typeof v === 'object') ? Object.keys(v).length : 0; }
function g(name) { return (typeof window !== 'undefined' && typeof window[name] !== 'undefined') ? window[name] : undefined; }

function bookChapterCount() {
  const BOOKS = g('BOOKS');
  if (!BOOKS) return 0;
  let n = 0;
  const keys = Object.keys(BOOKS);
  for (let i = 0; i < keys.length; i++) {
    const b = BOOKS[keys[i]];
    if (b && Array.isArray(b.chapters)) n += b.chapters.length;
  }
  return n;
}

/**
 * Structural cache signature for the current corpus + translation.
 * @param {string} translation
 * @returns {string}
 */
export function dataSignature(translation) {
  const MATTHEW = g('MATTHEW');
  return [
    'v:' + MS_INDEX_VERSION,
    'tr:' + (translation || 'nkjv'),
    'bk:' + kc(g('BOOKS')) + '.' + bookChapterCount(),
    'mt:' + (MATTHEW && MATTHEW.chapters ? MATTHEW.chapters.length : 0),
    'v1:' + ln(g('LETTERS_V1')), 'v2:' + ln(g('LETTERS')), 'v3:' + ln(g('LETTERS_V3')),
    'v4:' + ln(g('LETTERS_V4')), 'v5:' + ln(g('LETTERS_V5')), 'v6:' + ln(g('LETTERS_V6')), 'v7:' + ln(g('LETTERS_V7')),
    'tm:' + ln(g('LETTERS_TIMOTHY')), 'fl:' + ln(g('LETTERS_FLOCK')), 'rb:' + ln(g('LETTERS_REBUKE')),
    'w1:' + ln(g('WTLB_ONE')), 'w2:' + ln(g('WTLB_TWO')), 'bl:' + ln(g('THE_BLESSED')),
    'hd:' + ln(g('HOLY_DAYS')), 'hm:' + ln(g('HIDDEN_MANNA')), 'bs:' + ln(g('BIBLE_STUDIES')),
  ].join('|');
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-indexeddb')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Return the cached serialized index IFF its signature matches, else null.
 * @param {string} sig
 * @returns {Promise<string|null>}
 */
export async function loadCached(sig) {
  try {
    const db = await openDb();
    const entry = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(KEY);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    db.close();
    return (entry && entry.sig === sig && entry.json) ? entry.json : null;
  } catch {
    return null; // unavailable / blocked — fall back to a fresh build
  }
}

/**
 * Persist the serialized index under the current signature (single entry).
 * @param {string} sig
 * @param {string} json
 * @returns {Promise<boolean>}
 */
export async function saveCached(sig, json) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ sig, json, savedAt: Date.now() }, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false; // quota / unavailable — search still works, just rebuilds next time
  }
}

/** Clear the cache (used by "/rebuild index"). @returns {Promise<boolean>} */
export async function clearCached() {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}
