/* garden-facts.js - what v2's Garden reads (zones v2p7; design dz14 pictures 9d-garden-notice, 9e-garden-page).

   Main's Garden is globals: utils/garden.js through bundle-d (GARDEN_TOTAL, GARDEN_TIERS, gardenUrl and the image cache
   with its preload and crawl marks), GardenPosStore and GardenWarningFlagStore through bundle-b. v2 reads them here and
   never imports them: a second copy of garden.js would hold a second image cache that main's memory-trim signal never
   empties (stores/_entry-b.js). The tier is main's setting gardenTier (main's default Standard). */
import { gardenTiers } from './downloads-facts.js';
import { savedSettings } from './settings-pages.js';

const g = /** @type {any} */ (globalThis);

/** Main's swipe: a page turn needs a clear sideways drag (GardenView's SWIPE_MIN_DX, SWIPE_MAX_DY). */
export const SWIPE_MIN_DX = 60;
export const SWIPE_MAX_DY = 45;

/** +1 (next), -1 (previous) or 0 for a drag of dx, dy (main's gardenSwipeDir). @param {number} dx @param {number} dy */
export function swipeDir(dx, dy) {
  if (Math.abs(dx) > SWIPE_MIN_DX && Math.abs(dy) < SWIPE_MAX_DY) return dx < 0 ? 1 : -1;
  return 0;
}

/** How many pages the Garden has (main's GARDEN_TOTAL, 209). */
export function gardenTotal(gl = g) {
  return typeof gl.GARDEN_TOTAL === 'number' && gl.GARDEN_TOTAL > 0 ? gl.GARDEN_TOTAL : 209;
}

/** Main's default tier id. */
export function defaultTier(gl = g) {
  return typeof gl.GARDEN_DEFAULT_TIER === 'string' ? gl.GARDEN_DEFAULT_TIER : 'standard';
}

/** The tier the reader picked (main's settings.gardenTier), main's default when none. */
export function savedTier(gl = g) {
  const s = savedSettings(gl);
  return typeof s.gardenTier === 'string' && s.gardenTier ? s.gardenTier : defaultTier(gl);
}

/** The tier record for `id` (main's getGardenTier: an unknown id is the default), or null before bundle-d is here. */
export function tierOf(id, gl = g) {
  const tiers = gardenTiers(gl);
  return tiers.find((t) => t && t.id === id) || tiers.find((t) => t && t.id === defaultTier(gl)) || null;
}

/** "about 180 MB" from main's "~180 MB". @param {string} size */
export function aboutSize(size) {
  return 'about ' + String(size || '').replace(/^~\s*/, '');
}

/**
 * The notice's words under "Before you begin" (design 9d, main's warning body): the size follows the picked tier, as
 * main's "approximately <selectedTier.size> at the selected quality"; the device word follows the window.
 * @param {{ size: string } | null} tier @param {'phone' | 'computer'} device
 */
export function noticeLede(tier, device = 'phone', gl = g) {
  const size = tier ? ', ' + aboutSize(tier.size) + ' at the quality you pick' : '';
  return gardenTotal(gl) + ' high-resolution photographs' + size + '. Pages stream from the internet as you read and are kept on '
    + 'this ' + device + '. Connect to Wi-Fi first: mobile data charges may apply, and leave room for them all.';
}

/** True once the reader has opened the Garden past the notice (main's vot-garden-warning-acked). */
export function noticeSeen(gl = g) {
  const f = gl.GardenWarningFlagStore;
  try { return !!(f && typeof f.is === 'function' && f.is()); } catch (_e) { return false; }
}

/** Marks the notice seen (main's Proceed). */
export function markNoticeSeen(gl = g) {
  const f = gl.GardenWarningFlagStore;
  try { if (f && typeof f.set === 'function') f.set(); } catch (_e) { /* the notice shows again next time */ }
}

/** The page the reader last had open (main's GardenPosStore), or null while the store has not loaded or holds none. */
export function rememberedPage(gl = g) {
  const s = gl.GardenPosStore;
  try {
    if (!s || typeof s.getState !== 'function' || s.getState() !== 'loaded') return null;
    const n = Number(s.get());
    return Number.isInteger(n) && n >= 1 && n <= gardenTotal(gl) ? n : null;
  } catch (_e) { return null; }
}

/** Remembers `page` (main's write-through on every page change). */
export function rememberPage(page, gl = g) {
  const s = gl.GardenPosStore;
  try { if (s && typeof s.set === 'function') s.set(page); } catch (_e) { /* best effort, as main */ }
}

/** `n` as a whole page in 1..total. */
export function clampPage(n, gl = g) {
  return Math.min(gardenTotal(gl), Math.max(1, Math.floor(Number(n) || 1)));
}

/** Main's URL for page `n` at `tier` (its GitHub release), '' before bundle-d is here. */
export function pageUrl(n, tier, gl = g) {
  return typeof gl.gardenUrl === 'function' ? gl.gardenUrl(n, tier) : '';
}
