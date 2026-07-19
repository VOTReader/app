/* GardenPosStore — durable last-Garden-page memory.
   ────────────────────────────────────────────────────────────────────
   Same harness as the sibling stores: _resetForTests({ forceLoaded })
   bypasses the IDB state machine. */

import { describe, it, expect, beforeEach } from 'vitest';
import { GardenPosStore } from './garden-pos-store.js';

beforeEach(() => {
  localStorage.clear();
  GardenPosStore._resetForTests({ forceLoaded: true });
});

describe('GardenPosStore', () => {
  it('defaults to 0 (never recorded)', () => {
    expect(GardenPosStore.get()).toBe(0);
  });

  it('set + get round-trips', () => {
    GardenPosStore.set(57);
    expect(GardenPosStore.get()).toBe(57);
  });

  it('re-setting the same page is a no-op (no version bump)', () => {
    GardenPosStore.set(57);
    const v = GardenPosStore.getVersion();
    GardenPosStore.set(57);
    expect(GardenPosStore.getVersion()).toBe(v);
  });

  it('rejects sub-1 pages and junk', () => {
    GardenPosStore.set(57);
    GardenPosStore.set(0);
    GardenPosStore.set(-3);
    GardenPosStore.set(/** @type {any} */ ('junk'));
    expect(GardenPosStore.get()).toBe(57);
  });

  it('replaceAll (import path) replaces and defaults', () => {
    GardenPosStore.set(57);
    GardenPosStore.replaceAll({ lastPage: 9 });
    expect(GardenPosStore.get()).toBe(9);
    GardenPosStore.replaceAll(null);
    expect(GardenPosStore.get()).toBe(0);
  });
});
