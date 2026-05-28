/* AppFlagStores — is/set/clear + legacy compat + independence tests.
   ──────────────────────────────────────────────────────────────────
   Three boolean presence flags: WelcomedFlagStore, AboutSeenFlagStore,
   GardenWarningFlagStore. Each backs a one-byte LS key migrated to IDB.
   is() normalizes via !! so legacy numeric/string truthies ("1", 1)
   read as true.
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WelcomedFlagStore,
  AboutSeenFlagStore,
  GardenWarningFlagStore,
} from './app-flag-stores.js';

const ALL_FLAGS = [WelcomedFlagStore, AboutSeenFlagStore, GardenWarningFlagStore];

beforeEach(() => {
  localStorage.clear();
  ALL_FLAGS.forEach((f) => f._resetForTests({ forceLoaded: true }));
});

/* ═══════════════════════════════════════════════════════════════════
   is() — read contract
   ═══════════════════════════════════════════════════════════════════ */

describe('AppFlagStores — is()', () => {
  it('returns false on empty (default)', () => {
    expect(WelcomedFlagStore.is()).toBe(false);
    expect(AboutSeenFlagStore.is()).toBe(false);
    expect(GardenWarningFlagStore.is()).toBe(false);
  });

  it('returns true after set()', () => {
    WelcomedFlagStore.set();
    expect(WelcomedFlagStore.is()).toBe(true);
  });

  it('returns false after clear()', () => {
    AboutSeenFlagStore.set();
    AboutSeenFlagStore.clear();
    expect(AboutSeenFlagStore.is()).toBe(false);
  });

  it('handles legacy numeric 1 as truthy', () => {
    // Simulate legacy LS data: JSON.parse("1") → number 1.
    /** @type {any} */ (WelcomedFlagStore)._cache = 1;
    expect(WelcomedFlagStore.is()).toBe(true);
  });

  it('handles legacy string "1" as truthy', () => {
    /** @type {any} */ (WelcomedFlagStore)._cache = '1';
    expect(WelcomedFlagStore.is()).toBe(true);
  });

  it('handles 0 as falsy', () => {
    /** @type {any} */ (WelcomedFlagStore)._cache = 0;
    expect(WelcomedFlagStore.is()).toBe(false);
  });

  it('handles null as falsy', () => {
    /** @type {any} */ (WelcomedFlagStore)._cache = null;
    // _cache is null → _load() falls through to default (false).
    expect(WelcomedFlagStore.is()).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   set() — mutation + version
   ═══════════════════════════════════════════════════════════════════ */

describe('AppFlagStores — set()', () => {
  it('writes true to cache', () => {
    GardenWarningFlagStore.set();
    expect(/** @type {any} */ (GardenWarningFlagStore)._cache).toBe(true);
  });

  it('is idempotent', () => {
    GardenWarningFlagStore.set();
    GardenWarningFlagStore.set();
    expect(GardenWarningFlagStore.is()).toBe(true);
  });

  it('bumps version on each call', () => {
    const v0 = WelcomedFlagStore.getVersion();
    WelcomedFlagStore.set();
    expect(WelcomedFlagStore.getVersion()).toBe(v0 + 1);
    WelcomedFlagStore.set();
    expect(WelcomedFlagStore.getVersion()).toBe(v0 + 2);
  });

  it('notifies subscribers', () => {
    const spy = vi.fn();
    AboutSeenFlagStore.subscribe(spy);
    AboutSeenFlagStore.set();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   clear() — mutation + version
   ═══════════════════════════════════════════════════════════════════ */

describe('AppFlagStores — clear()', () => {
  it('writes false to cache', () => {
    WelcomedFlagStore.set();
    WelcomedFlagStore.clear();
    expect(/** @type {any} */ (WelcomedFlagStore)._cache).toBe(false);
  });

  it('is idempotent', () => {
    WelcomedFlagStore.clear();
    WelcomedFlagStore.clear();
    expect(WelcomedFlagStore.is()).toBe(false);
  });

  it('bumps version on each call', () => {
    WelcomedFlagStore.set();
    const v0 = WelcomedFlagStore.getVersion();
    WelcomedFlagStore.clear();
    expect(WelcomedFlagStore.getVersion()).toBe(v0 + 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Independence — three stores don't share state
   ═══════════════════════════════════════════════════════════════════ */

describe('AppFlagStores — independence', () => {
  it('setting one flag does not affect the others', () => {
    WelcomedFlagStore.set();
    expect(WelcomedFlagStore.is()).toBe(true);
    expect(AboutSeenFlagStore.is()).toBe(false);
    expect(GardenWarningFlagStore.is()).toBe(false);
  });

  it('each store has its own version counter', () => {
    const vW = WelcomedFlagStore.getVersion();
    const vA = AboutSeenFlagStore.getVersion();
    WelcomedFlagStore.set();
    expect(WelcomedFlagStore.getVersion()).toBe(vW + 1);
    expect(AboutSeenFlagStore.getVersion()).toBe(vA);
  });
});
