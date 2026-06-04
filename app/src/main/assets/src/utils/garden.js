/* ===================================================================
   Garden image helpers — tier resolution, URL building, IDB cache
   ===================================================================
   ES module (G.2.3). Owns the Garden constants + image cache. The
   constants are re-exposed on `window` via _entry-d.js so the inline
   App() block in index.html (which references GARDEN_TIERS and
   GARDEN_DEFAULT_TIER for the Settings → Garden tier selector) keeps
   working without an import.
   Bundled helpers (P5e):
   - getGardenTier
   - gardenUrl
   - gardenCacheKey
   - gardenPreload
   - gardenIsCached
   =================================================================== */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   res: string,
 *   size: string,
 *   tag: string,
 *   desc: string
 * }} GardenTier
 */

/** Total Garden images available across all tiers. */
export const GARDEN_TOTAL = 209;

/** Quality tiers — each hosted on its own GitHub release.
 *  @type {GardenTier[]} */
export const GARDEN_TIERS = [
  { id: "mobile",   label: "Mobile",   res: "2160px", size: "~110 MB", tag: "garden-mobile",   desc: "Screen-native; light on cell data" },
  { id: "standard", label: "Standard", res: "2880px", size: "~180 MB", tag: "garden-standard", desc: "Balanced default — great at 1× and 1.5× zoom" },
  { id: "native",   label: "Native",   res: "3600px", size: "~320 MB", tag: "garden-native",   desc: "Full source detail; no upscaling" },
  { id: "ultra",    label: "Ultra",    res: "4600px", size: "~680 MB", tag: "garden-ultra",    desc: "Maximum quality — for pixel-peepers" },
];

/** Default tier id when no user preference is set. */
export const GARDEN_DEFAULT_TIER = "standard";

/** Per-tier image cache, keyed as `"<tierId>:<page>"`.
 *  @type {Record<string, HTMLImageElement>} */
export const gardenImageCache = {};

/** PF5 — LRU bound on the DECODED-image cache. The viewer shows ONE page at a
 *  time, so a handful of decoded bitmaps around the current page is plenty for
 *  instant prev/next while bounding RAM: an Ultra-tier page decodes to tens of MB,
 *  and without a bound the 209-page background crawl trended ~700 MB of resident
 *  bitmaps that were never evicted. */
export const GARDEN_CACHE_MAX = 12;
/** PERF-2 — the LRU bound + priority-preload look-ahead, PER TIER. A decoded bitmap's
 *  RAM scales with resolution², so a FIXED count let Ultra (4600px ≈ 112 MB each) reach
 *  ~1.3 GB resident at 12. Scale the count DOWN as resolution climbs so the resident
 *  total stays ~0.3-0.45 GB on a budget device. INVARIANT: `cap` >= `ahead` + 2, so the
 *  priority window (current + ahead) plus one prev page never evicts the page in view. */
const GARDEN_TIER_LIMITS = {
  mobile:   { cap: 12, ahead: 5 }, // ~2160px ≈ 25 MB  → ~300 MB resident
  standard: { cap: 8,  ahead: 5 }, // ~2880px ≈ 44 MB  → ~350 MB
  native:   { cap: 6,  ahead: 3 }, // ~3600px ≈ 70 MB  → ~420 MB
  ultra:    { cap: 4,  ahead: 2 }, // ~4600px ≈ 112 MB → ~450 MB
};
/** Resolve a tier id to its { cap, ahead } limits (falls back to standard).
 *  @param {string} tierId @returns {{cap:number, ahead:number}} */
export function gardenTierLimits(tierId) { return GARDEN_TIER_LIMITS[tierId] || GARDEN_TIER_LIMITS.standard; }
/** LRU order of live cache keys, oldest first. @type {string[]} */
const _gardenLru = [];
/** PF5 — the crawl's done-marker: page-keys whose JPEG has been REQUESTED (so the
 *  browser's HTTP cache is warm). Kept as a Set of strings SEPARATE from the live
 *  `gardenImageCache`, so LRU-evicting a decoded bitmap does NOT make the crawl
 *  re-fetch it (the old code used the live Image ref as the marker, which both
 *  pinned the bitmaps AND would loop forever once eviction landed).
 *  @type {Set<string>} */
export const gardenCrawled = new Set();

/** Drop the decoded bitmap for a cache key (release its memory). */
function _gardenEvict(key) {
  const img = gardenImageCache[key];
  if (img) { try { img.src = ''; } catch (_e) { /* releasing the decode — best-effort */ } }
  delete gardenImageCache[key];
}

/** Mark `key` most-recently-used; evict the oldest beyond the key's per-tier cap (PERF-2). */
function _gardenTouch(key) {
  const i = _gardenLru.indexOf(key);
  if (i >= 0) _gardenLru.splice(i, 1);
  _gardenLru.push(key);
  const cap = gardenTierLimits(String(key).split(':')[0]).cap;
  while (_gardenLru.length > cap) {
    const oldest = _gardenLru.shift();
    if (oldest !== undefined && oldest !== key) _gardenEvict(oldest);
  }
}

/**
 * Resolve a tier id to its full record, falling back to the default tier
 * if the id is unknown (never returns undefined).
 *
 * @param {string} id
 * @returns {GardenTier}
 */
export function getGardenTier(id) {
  return /** @type {GardenTier} */ (GARDEN_TIERS.find((t) => t.id === id) || GARDEN_TIERS.find((t) => t.id === GARDEN_DEFAULT_TIER));
}

/**
 * Build the GitHub Releases URL for a Garden page at a given tier.
 *
 * @param {number} n       page number (1..GARDEN_TOTAL)
 * @param {string} tierId
 * @returns {string}
 */
export function gardenUrl(n, tierId) {
  const tier = getGardenTier(tierId);
  // SE4: clamp n to an integer in [1, GARDEN_TOTAL] so the URL path is safe
  // LOCALLY, not dependent on every caller having range-guarded first — a
  // non-integer / out-of-range n could otherwise build a malformed or
  // unintended path (e.g. "garden_1.5.jpg" or a page that doesn't exist).
  const page = Math.min(GARDEN_TOTAL, Math.max(1, Math.floor(Number(n) || 1)));
  return `https://github.com/VOTReader/votreader-assets/releases/download/${tier.tag}/garden_${String(page).padStart(3, "0")}.jpg`;
}

/**
 * Build the cache key used by gardenImageCache.
 *
 * @param {number} n
 * @param {string} tierId
 * @returns {string}
 */
export function gardenCacheKey(n, tierId) {return `${tierId}:${n}`;}

/**
 * Begin loading a Garden image into the per-tier cache. No-op when n is
 * out of range or when the image is already cached.
 *
 * @param {number} n       page number (1..GARDEN_TOTAL)
 * @param {string} tierId
 * @returns {void}
 */
export function gardenPreload(n, tierId) {
  if (n < 1 || n > GARDEN_TOTAL) return;
  const key = gardenCacheKey(n, tierId);
  if (gardenImageCache[key]) { _gardenTouch(key); return; } // already resident — keep it fresh
  const img = new Image();
  img.src = gardenUrl(n, tierId);
  gardenImageCache[key] = img;
  gardenCrawled.add(key);   // PF5: remember it was fetched even after LRU eviction
  _gardenTouch(key);        // PF5: LRU-insert + evict the oldest beyond the cap
}

/**
 * True iff the image has finished loading and decoded successfully.
 *
 * @param {number} n
 * @param {string} tierId
 * @returns {boolean}
 */
export function gardenIsCached(n, tierId) {
  const img = gardenImageCache[gardenCacheKey(n, tierId)];
  return !!(img && img.complete && img.naturalWidth > 0);
}

