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
  return `https://github.com/corbinlythgoe/votreader-assets/releases/download/${tier.tag}/garden_${String(n).padStart(3, "0")}.jpg`;
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
  if (gardenImageCache[key]) return;
  const img = new Image();
  img.src = gardenUrl(n, tierId);
  gardenImageCache[key] = img;
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

