import { describe, it, expect } from 'vitest';
import {
  GARDEN_TOTAL,
  GARDEN_DEFAULT_TIER,
  getGardenTier,
  gardenUrl,
  gardenCacheKey,
  gardenPreload,
  gardenImageCache,
  gardenCrawled,
  GARDEN_CACHE_MAX,
  gardenTierLimits,
} from './garden.js';

describe('getGardenTier', () => {
  it('resolves a known tier id', () => {
    expect(getGardenTier('ultra').tag).toBe('garden-ultra');
  });
  it('falls back to the default tier for an unknown id (never undefined)', () => {
    expect(getGardenTier('nope').id).toBe(GARDEN_DEFAULT_TIER);
    expect(getGardenTier(undefined).id).toBe(GARDEN_DEFAULT_TIER);
  });
});

describe('gardenUrl', () => {
  it('builds a zero-padded release URL for an in-range page', () => {
    expect(gardenUrl(42, 'standard')).toBe(
      'https://github.com/VOTReader/votreader-assets/releases/download/garden-standard/garden_042.jpg'
    );
  });
  it('pads page 1 to three digits', () => {
    expect(gardenUrl(1, 'mobile')).toContain('/garden_001.jpg');
  });

  // SE4 — n is clamped to an integer in [1, GARDEN_TOTAL] so a bad caller can
  // never shape the path (traversal, malformed page, out-of-range fetch).
  it('clamps n below 1 up to page 1 (SE4)', () => {
    expect(gardenUrl(0, 'standard')).toContain('/garden_001.jpg');
    expect(gardenUrl(-7, 'standard')).toContain('/garden_001.jpg');
  });
  it('clamps n above the total down to GARDEN_TOTAL (SE4)', () => {
    expect(gardenUrl(GARDEN_TOTAL + 50, 'standard')).toContain(`/garden_${GARDEN_TOTAL}.jpg`);
  });
  it('floors a non-integer n (SE4)', () => {
    expect(gardenUrl(1.9, 'standard')).toContain('/garden_001.jpg');
  });
  it('coerces a non-numeric n to page 1 (SE4)', () => {
    // The param is typed number; the SE4 guard exists for an UNTYPED/hostile
    // caller, so the cast is deliberate — we are testing the runtime coercion.
    expect(gardenUrl(/** @type {any} */ ('../../etc'), 'standard')).toContain('/garden_001.jpg');
    expect(gardenUrl(/** @type {any} */ (undefined), 'standard')).toContain('/garden_001.jpg');
  });
});

describe('gardenCacheKey', () => {
  it('keys by tier and page', () => {
    expect(gardenCacheKey(5, 'native')).toBe('native:5');
  });
});

describe('gardenPreload LRU + crawled set (PF5)', () => {
  it('bounds the live decoded-image cache to the per-tier cap (PERF-2)', () => {
    const stdCap = gardenTierLimits('standard').cap;
    expect(stdCap).toBeLessThan(GARDEN_CACHE_MAX); // standard now holds fewer than the old fixed 12
    const N = GARDEN_CACHE_MAX + 6;
    for (let p = 1; p <= N; p++) gardenPreload(p, 'standard');
    // resident decoded bitmaps never exceed the STANDARD cap (the ~700 MB unbounded-crawl fix)
    expect(Object.keys(gardenImageCache).length).toBeLessThanOrEqual(stdCap);
    // the most-recent page stays resident; the oldest was evicted (LRU order)
    expect(gardenImageCache[gardenCacheKey(N, 'standard')]).toBeTruthy();
    expect(gardenImageCache[gardenCacheKey(1, 'standard')]).toBeUndefined();
  });
  it('PERF-2 invariant: every tier cap >= look-ahead + 2, and higher-res tiers hold fewer', () => {
    for (const t of ['mobile', 'standard', 'native', 'ultra']) {
      const { cap, ahead } = gardenTierLimits(t);
      expect(cap).toBeGreaterThanOrEqual(ahead + 2);     // priority window never evicts the current page
      expect(cap).toBeLessThanOrEqual(GARDEN_CACHE_MAX);
    }
    expect(gardenTierLimits('ultra').cap).toBeLessThan(gardenTierLimits('native').cap);
    expect(gardenTierLimits('native').cap).toBeLessThan(gardenTierLimits('standard').cap);
  });
  it('records EVERY fetched page in gardenCrawled even after its bitmap is evicted', () => {
    const N = GARDEN_CACHE_MAX + 6;
    for (let p = 1; p <= N; p++) {
      expect(gardenCrawled.has(gardenCacheKey(p, 'standard'))).toBe(true); // crawl won't re-fetch
    }
    // page 1's bitmap is gone (evicted) but it's still marked crawled — proves the
    // done-marker is the Set, not the live ref (no re-crawl loop, refs freed).
    expect(gardenImageCache[gardenCacheKey(1, 'standard')]).toBeUndefined();
    expect(gardenCrawled.has(gardenCacheKey(1, 'standard'))).toBe(true);
  });
  it('re-touching a resident page does not grow the cache', () => {
    const residentKey = Object.keys(gardenImageCache)[0];
    const before = Object.keys(gardenImageCache).length;
    const [tierId, pageStr] = residentKey.split(':');
    gardenPreload(Number(pageStr), tierId);
    expect(Object.keys(gardenImageCache).length).toBe(before);
  });
});
