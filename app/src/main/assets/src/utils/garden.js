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

export const GARDEN_TOTAL = 209;

// Quality tiers — each hosted on its own GitHub release
export const GARDEN_TIERS = [
  { id: "mobile",   label: "Mobile",   res: "2160px", size: "~110 MB", tag: "garden-mobile",   desc: "Screen-native; light on cell data" },
  { id: "standard", label: "Standard", res: "2880px", size: "~180 MB", tag: "garden-standard", desc: "Balanced default — great at 1× and 1.5× zoom" },
  { id: "native",   label: "Native",   res: "3600px", size: "~320 MB", tag: "garden-native",   desc: "Full source detail; no upscaling" },
  { id: "ultra",    label: "Ultra",    res: "4600px", size: "~680 MB", tag: "garden-ultra",    desc: "Maximum quality — for pixel-peepers" },
];

export const GARDEN_DEFAULT_TIER = "standard";

// Image cache — per-tier, keyed as "tier:page"
export const gardenImageCache = {};

export function getGardenTier(id) {
  return GARDEN_TIERS.find((t) => t.id === id) || GARDEN_TIERS.find((t) => t.id === GARDEN_DEFAULT_TIER);
}

export function gardenUrl(n, tierId) {
  const tier = getGardenTier(tierId);
  return `https://github.com/corbinlythgoe/votreader-assets/releases/download/${tier.tag}/garden_${String(n).padStart(3, "0")}.jpg`;
}

export function gardenCacheKey(n, tierId) {return `${tierId}:${n}`;}

export function gardenPreload(n, tierId) {
  if (n < 1 || n > GARDEN_TOTAL) return;
  const key = gardenCacheKey(n, tierId);
  if (gardenImageCache[key]) return;
  const img = new Image();
  img.src = gardenUrl(n, tierId);
  gardenImageCache[key] = img;
}

export function gardenIsCached(n, tierId) {
  const img = gardenImageCache[gardenCacheKey(n, tierId)];
  return img && img.complete && img.naturalWidth > 0;
}

