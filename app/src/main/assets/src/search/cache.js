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
   doc-shape / search-config change. CORPUS_CONTENT_VERSION (below) busts it
   on a content-only corpus edit (a reworded verse of the same length is
   structurally invisible): the pre-commit/CI corpus gate
   (tools/check-corpus-version.js, SRCH1) fails closed unless it equals the
   service worker's CORPUS_VERSION, so the corpus-edit → CORPUS_VERSION bump
   also rebuilds the search index. (This invariant lived in the retired
   Classic engine's assets/search.js; it moved here 2026-07-02 with the
   Classic retirement.)

   NOTE (verify gotcha): to test a fresh build in preview you must wipe this DB
   too — indexedDB.deleteDatabase('vot-minisearch-cache') — or it warm-restores.
   ═══════════════════════════════════════════════════════════════════════ */

const DB_NAME = 'vot-minisearch-cache';
const STORE = 'idx';
const KEY = 'index';

/** Bump on any index-builder doc-shape OR search-config change (busts all caches). */
/* m2 (2026-08-04): the Matthew Study Bible's 1,071 verses now reach the
   index — the builder had been looping over a `sections` key matthew.js
   never had, so every cached index built before this is missing them and
   MUST be discarded rather than reused.
   m3 (2026-09-03): Hidden Manna left the index (owner policy — Matthew study
   chain only). Every index cached before this still CONTAINS its titles and
   bodies, so the builder change alone would keep serving the leak to every
   installed client forever; the bump is what discards them. */
export const MS_INDEX_VERSION = 'm10';  // m10: segmentRenderText no longer puts a seam space after an opening quote or before a closing one, so 187 Bible Study passages index as '"I will' not '" I will' (sweep-2 v14-corpus-01, 2026-09-26); an m9 index holds the old text. PREVIOUS m9: nothing indexed changes. segment-dom-text.js (fingerprinted) gained segmentsDomPieces for the link excerpt picker; the text index-builder reads is the same (2026-09-25)
// m8: WTLB, The Blessed, Holy Days and Answers bodies without their **bold** / _italic_ markers (2026-09-25)
// m7: letter and study bodies in the reader's text: no footnote numbers, letter-link labels, the renderer's spacing (2026-09-25)
// m6: KJV-R verses from the KJV base, block-shaped Holy Days bodies, studies always in (REPORT #8, 2026-09-24)
// m5: Answers Only God Can Give joins the index as its own kind (2026-09-22)

/** MUST equal service-worker.js CORPUS_VERSION — gate-enforced (SRCH1, see
 *  header). Busts the cached index on content-only corpus edits. */
export const CORPUS_CONTENT_VERSION = 'c65';

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
 * A sparse overlay's base edition (KJV-R -> KJV) fills every verse the overlay
 * does not carry, so whether it was in memory shapes the index as much as the
 * overlay does (v07-04). '' for an edition with no non-NKJV base.
 * @param {string} translation
 * @returns {string}
 */
function baseFlag(translation) {
  const opts = g('TRANSLATION_OPTIONS');
  const opt = Array.isArray(opts) ? opts.find((o) => o && o.id === translation) : null;
  const base = opt && opt.base;
  if (!base || base === 'nkjv') return '';
  return '+' + (g('BIBLE_' + String(base).toUpperCase()) ? '1' : '0');
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
    'cv:' + CORPUS_CONTENT_VERSION,
    'tr:' + (translation || 'nkjv'),
    // Whether the alt-translation DATA was actually in memory when the index
    // was built. buildDocs reads window['BIBLE_<CODE>'] once and builds with no
    // alt text at all when it is absent — silently, because an absent global and
    // a translation with nothing to add are the same value to it. Without this
    // component that partial index caches under the SAME key as a complete one
    // and is served for the life of the corpus version. NKJV is baked into BOOKS
    // and has no global, so it is 'n' rather than a flapping 0.
    'alt:' + (!translation || translation === 'nkjv'
      ? 'n'
      : (g('BIBLE_' + translation.toUpperCase()) ? '1' : '0') + baseFlag(translation)),
    'bk:' + kc(g('BOOKS')) + '.' + bookChapterCount(),
    'mt:' + (MATTHEW && MATTHEW.chapters ? MATTHEW.chapters.length : 0),
    'v1:' + ln(g('LETTERS_V1')), 'v2:' + ln(g('LETTERS')), 'v3:' + ln(g('LETTERS_V3')),
    'v4:' + ln(g('LETTERS_V4')), 'v5:' + ln(g('LETTERS_V5')), 'v6:' + ln(g('LETTERS_V6')), 'v7:' + ln(g('LETTERS_V7')),
    'tm:' + ln(g('LETTERS_TIMOTHY')), 'fl:' + ln(g('LETTERS_FLOCK')), 'rb:' + ln(g('LETTERS_REBUKE')),
    'w1:' + ln(g('WTLB_ONE')), 'w2:' + ln(g('WTLB_TWO')), 'bl:' + ln(g('THE_BLESSED')),
    // No 'hm:' component — Hidden Manna is not indexed, so its length can no
    // longer shape the index and must not invalidate the cache.
    'hd:' + ln(g('HOLY_DAYS')), 'bs:' + ln(g('BIBLE_STUDIES')),
    // Answers is its own lazy file: an index built while it could not load
    // (offline, first visit) must not be served once it can.
    'an:' + ln(g('ANSWERS')),
  ].join('|');
}

/**
 * Open a fresh connection to the MiniSearch cache DB. Not cached at module
 * scope — every caller below closes its connection as soon as its own
 * transaction completes, unlike thumb-store.js/idb-adapter.js/journal-
 * media-store.js, which hold one connection open for the page's life. That
 * keeps the exposure window narrow, but not zero: a call still in flight
 * when Settings -> Clear All My Data runs
 * indexedDB.deleteDatabase('vot-minisearch-cache') would otherwise fire
 * onblocked with no recovery until reload (storage-backup-4's exact defect,
 * just on a shorter fuse). Exported so the contract is directly testable,
 * same as thumb-store.js's openThumbDB.
 * @returns {Promise<IDBDatabase>}
 */
export function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-indexeddb')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { try { db.close(); } catch (_e) { /* best-effort close */ } };
      resolve(db);
    };
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
