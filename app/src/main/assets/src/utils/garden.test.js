import { describe, it, expect } from 'vitest';
import {
  GARDEN_TOTAL,
  GARDEN_DEFAULT_TIER,
  getGardenTier,
  gardenUrl,
  gardenCacheKey,
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
