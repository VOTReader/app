/* ===================================================================
   Garden image helpers — tier resolution, URL building, IDB cache
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - getGardenTier
   - gardenUrl
   - gardenCacheKey
   - gardenPreload
   - gardenIsCached
   =================================================================== */


function getGardenTier(id) {
  return GARDEN_TIERS.find((t) => t.id === id) || GARDEN_TIERS.find((t) => t.id === GARDEN_DEFAULT_TIER);
}

function gardenUrl(n, tierId) {
  const tier = getGardenTier(tierId);
  return `https://github.com/corbinlythgoe/votreader-assets/releases/download/${tier.tag}/garden_${String(n).padStart(3, "0")}.jpg`;
}

function gardenCacheKey(n, tierId) {return `${tierId}:${n}`;}

function gardenPreload(n, tierId) {
  if (n < 1 || n > GARDEN_TOTAL) return;
  const key = gardenCacheKey(n, tierId);
  if (gardenImageCache[key]) return;
  const img = new Image();
  img.src = gardenUrl(n, tierId);
  gardenImageCache[key] = img;
}

function gardenIsCached(n, tierId) {
  const img = gardenImageCache[gardenCacheKey(n, tierId)];
  return img && img.complete && img.naturalWidth > 0;
}

