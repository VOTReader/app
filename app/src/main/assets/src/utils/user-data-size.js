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
     - vot-minisearch-cache (rebuildable MiniSearch index)
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
 *
 * That "add it here too" instruction is no longer on anyone's memory:
 * `user-data-parity.test.js` asserts this list, the SettingsScreen export
 * map, and import-validators' STORE_SHAPES name the same stores, and fails
 * naming whichever leg is short. It was written because this list had gone
 * a release without `vot-audio-library` — exported and restored, but
 * invisible to the "Your Data" number.
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
  'vot-reading-streak',
  'vot-reading-stats',
  'vot-garden-pos',
  'vot-recent-nav',
  'vot-history',
  'vot-prophecy-cards',
  'vot-home-order',
  'vot-state',           // includes readItems (marked-as-read) + tabs + settings
  'vot-audio-library',   // saved recordings + recent listening + play counts (IDB v9)
  'vot-audio-positions', // per-recording resume points (IDB v10)
  // C2-D [D2], 2026-08-10 — these three are hand-made choices that were
  // dying with the device: the Library tile arrangement, the note style +
  // colour the reader last chose (every new note inherits it), and the
  // dismissal of the annotation coach-mark (a restored backup re-pitched a
  // hint the reader had already waved off). All three are IDB stores of
  // long standing; only the backup never knew about them.
  'vot-library-order',
  'vot-note-default',
  'vot-welcomed',
  'vot-about-seen',
  'vot-garden-warning-acked',
  'vot-ann-hint-dismissed',
  // review-tutorial: the fifth flag — "Show me around" done / skipped / never again.
  'vot-tour-done',
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

/* ── Storage-growth series (BACKLOG [30]) ────────────────────────────────
   A tiny time series of measureUserData().total so Settings can show
   whether the reader's own data is growing, and how fast.

   WHY IT RIDES THE `meta` STORE instead of getting its own CachedStore:
   a new store would need BOTH an IDBAdapter.STORE_NAMES entry AND a
   DB_VERSION bump, or it hydrates 'degraded' and queues writes forever
   with a fully green unit suite. `meta` is already registered, and — the
   load-bearing part — it is deliberately NOT in USER_DATA_STORES, so the
   series can never inflate the very number it is trending. A new user-data
   store would have measured itself.

   Sampling happens only where measureUserData ALREADY runs: the Settings
   mount effect, which lives in the lazily-loaded bundle-e. Zero boot cost,
   no timer, at most one sample per day (a same-day revisit overwrites, so
   the point stays fresh rather than duplicating). */

/** IDB `meta` key holding the series. */
var SAMPLES_KEY = 'user-data-samples';
/** Roughly two months of daily points — bounded so this can never grow. */
var MAX_SAMPLES = 60;

/** Local calendar day, mirroring _jrnDateStr (inlined: this module has no imports). */
function _sampleDayKey(ts) {
  var d = new Date(ts);
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

/**
 * The recorded series, oldest first. Always an array — IDBAdapter REJECTS
 * on failure (unlike CachedStore, which absorbs it), so this swallows.
 *
 * @returns {Promise<Array<{ d: string, b: number }>>}
 */
export async function getUserDataSamples() {
  try {
    var raw = await IDBAdapter.get('meta', SAMPLES_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (s) {
      return s && typeof s.d === 'string' && typeof s.b === 'number' && isFinite(s.b);
    });
  } catch (_e) {
    return [];
  }
}

/**
 * Record today's total. Overwrites today's point if one exists, so opening
 * Settings twice in a day keeps one (current) sample rather than two.
 *
 * @param {number} totalBytes
 * @returns {Promise<Array<{ d: string, b: number }>>} the updated series
 */
export async function recordUserDataSample(totalBytes) {
  var bytes = Math.max(0, Math.round(Number(totalBytes) || 0));
  if (!isFinite(bytes)) return [];
  var series = await getUserDataSamples();
  var today = _sampleDayKey(Date.now());
  var last = series.length ? series[series.length - 1] : null;
  if (last && last.d === today) last.b = bytes;
  else series.push({ d: today, b: bytes });
  if (series.length > MAX_SAMPLES) series.splice(0, series.length - MAX_SAMPLES);
  try { await IDBAdapter.put('meta', SAMPLES_KEY, series); }
  catch (_e) { /* best-effort — a trend is never worth failing Settings over */ }
  return series;
}
