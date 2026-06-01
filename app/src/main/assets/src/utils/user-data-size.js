/* ═══════════════════════════════════════════════════════════════════════
   user-data-size — measure the bytes of the user's OWN data
   ═══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.

   Two storage numbers are surfaced in Settings → Your Data:

     1. TOTAL APP DATA — navigator.storage.estimate().usage (via
        StorageHealth / useStorageInfo). This is what the OS shows under
        the app's storage in Android/PC settings: it counts EVERYTHING the
        origin persists — IndexedDB, the Service Worker corpus cache, the
        search-index cache, tab thumbnails, the WebView HTTP cache, etc.
        Most of that is regenerable APP data, not the user's own content.

     2. YOUR DATA (this module) — the bytes of just the irreplaceable,
        user-authored content that the Export backs up: annotations,
        notes, bookmarks, links, notebooks, journal entries + their media
        (images + voice memos), reading-progress marks, reading history,
        and the saved tab/setting state. This is the number that actually
        matters for "how much would I lose."

   Deliberately EXCLUDED from "your data" (they are app data, regenerable,
   and NOT in the export):
     - Garden images        (re-fetchable from GitHub Releases)
     - vot-search-cache     (rebuildable FlexSearch index)
     - vot-thumbs           (tab-card screenshots, re-captured)
     - the SW corpus cache  (the scripture/volume bundles)

   Garden is app data even though user data is a subSECTION of app data —
   so it counts toward (1) but never toward (2).

   Method: sum each user-data IDB store's serialized JSON byte-length
   (UTF-8) + each JournalMediaStore blob's real byte size. This is an
   approximation of on-disk cost (IDB adds per-record overhead and stores
   structured clones, not JSON), but it's a faithful, stable measure of
   "the size of your content" and it exactly tracks what Export writes.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The IDB stores (in the main `votreader` database) that hold the user's
 * own content. Mirrors SettingsScreen._exportableStores() + _flagStores()
 * keys — i.e. exactly what the backup includes — so "Your Data" size and
 * "Export" cover the same set. If a store is added to the export, add it
 * here too (and vice-versa).
 * @type {string[]}
 */
export const USER_DATA_STORES = [
  'vot-annotations',
  'vot-notes',
  'vot-bookmarks',
  'vot-links',
  'vot-notebooks',
  'vot-journal',
  'vot-journal-notebooks',
  'vot-journal-index',
  'vot-journal-stats',
  'vot-recent-nav',
  'vot-history',
  'vot-prophecy-cards',
  'vot-home-order',
  'vot-state',           // includes readItems (marked-as-read) + tabs + settings
  'vot-welcomed',
  'vot-about-seen',
  'vot-garden-warning-acked',
];

/**
 * UTF-8 byte length of a string, without allocating a full encoded copy
 * when TextEncoder is available. Falls back to a manual code-unit count.
 * @param {string} str
 * @returns {number}
 */
function utf8Bytes(str) {
  if (typeof TextEncoder !== 'undefined') {
    try { return new TextEncoder().encode(str).length; } catch (_e) { /* fall through */ }
  }
  // Fallback: count UTF-8 bytes per code point.
  var bytes = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { bytes += 4; i++; } // surrogate pair
    else bytes += 3;
  }
  return bytes;
}

/**
 * Measure the user's own data, in bytes. Reads each USER_DATA_STORES value
 * from the main IDB database (JSON byte-length) and adds every
 * JournalMediaStore blob's real size. Best-effort: a failed store read
 * contributes 0 rather than rejecting the whole measurement, so a single
 * degraded store can't blank the number.
 *
 * @returns {Promise<{ total: number, structured: number, media: number, mediaCount: number }>}
 *   total      = structured + media (bytes)
 *   structured = sum of JSON byte-length across USER_DATA_STORES
 *   media      = sum of journal image + audio blob bytes
 *   mediaCount = number of media records
 */
export async function measureUserData() {
  var structured = 0;
  var media = 0;
  var mediaCount = 0;

  // Structured stores (the main `votreader` IDB database).
  for (var i = 0; i < USER_DATA_STORES.length; i++) {
    var name = USER_DATA_STORES[i];
    try {
      var v = await IDBAdapter.get(name, 'v');
      if (v !== undefined && v !== null) {
        structured += utf8Bytes(JSON.stringify(v));
      }
    } catch (_e) { /* best-effort: a missing/degraded store contributes 0 */ }
  }

  // Journal media blobs (images + voice memos) — the heavy user content.
  try {
    var metas = await JournalMediaStore.list();
    for (var j = 0; j < metas.length; j++) {
      var sz = metas[j] && typeof metas[j].size === 'number' ? metas[j].size : 0;
      media += sz;
      mediaCount++;
    }
  } catch (_e) { /* best-effort */ }

  return { total: structured + media, structured: structured, media: media, mediaCount: mediaCount };
}
