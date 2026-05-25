/* CachedStore base — subscribe/getVersion/_bump contract tests.
   ─────────────────────────────────────────────────────────────
   Validates the React 18 useSyncExternalStore-compatible reactivity
   contract added in the post-Q6 migration. The contract:

     - subscribe(cb) returns unsubscribe; cb fires on each _bump
     - getVersion() returns a stable number that increments on _bump
     - _bump notifies all current subscribers

   These tests don't touch any specific store's data — they probe
   the base class. Per-store migration tests live in each store's
   .test.js (annotation, bookmark, note, link).
   ─────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CachedStore } from './cached-store.js';

describe('CachedStore — useSyncExternalStore reactivity contract', () => {
  let store;
  beforeEach(() => {
    // localStorage shim if absent (vitest env may or may not have it)
    if (typeof localStorage === 'undefined') {
      /** @type {any} */ const data = {};
      /** @type {any} */ const shim = {
        _data: data,
        get length() { return Object.keys(data).length; },
        clear() { for (const k in data) delete data[k]; },
        key(i) { return Object.keys(data)[i] ?? null; },
        getItem(k) { return data[k] ?? null; },
        setItem(k, v) { data[k] = String(v); },
        removeItem(k) { delete data[k]; },
      };
      globalThis.localStorage = shim;
    } else {
      localStorage.clear?.();
    }
    store = CachedStore('test-cached-store-key', {});
  });

  it('initial getVersion is 0', () => {
    expect(store.getVersion()).toBe(0);
  });

  it('_bump increments version', () => {
    store._bump();
    expect(store.getVersion()).toBe(1);
    store._bump();
    expect(store.getVersion()).toBe(2);
  });

  it('subscribe receives notifications on _bump', () => {
    const cb = vi.fn();
    store.subscribe(cb);
    expect(cb).not.toHaveBeenCalled();
    store._bump();
    expect(cb).toHaveBeenCalledTimes(1);
    store._bump();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('multiple subscribers all receive notifications', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    store.subscribe(cb1);
    store.subscribe(cb2);
    store.subscribe(cb3);
    store._bump();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further notifications', () => {
    const cb = vi.fn();
    const unsubscribe = store.subscribe(cb);
    store._bump();
    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();
    store._bump();
    expect(cb).toHaveBeenCalledTimes(1); // not called again
  });

  it('one subscriber throwing does NOT prevent others from being notified', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cb1 = vi.fn(() => { throw new Error('subscriber 1 boom'); });
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    store.subscribe(cb1);
    store.subscribe(cb2);
    store.subscribe(cb3);
    store._bump();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('subscribe is idempotent (same callback added twice = one entry)', () => {
    const cb = vi.fn();
    store.subscribe(cb);
    store.subscribe(cb);
    store._bump();
    expect(cb).toHaveBeenCalledTimes(1); // Set dedupe
  });

  it('subscribe before any _bump still works', () => {
    const cb = vi.fn();
    store.subscribe(cb);
    expect(cb).not.toHaveBeenCalled();
    expect(store.getVersion()).toBe(0);
  });

  it('getVersion is referentially stable when nothing mutates', () => {
    const v1 = store.getVersion();
    const v2 = store.getVersion();
    expect(Object.is(v1, v2)).toBe(true);
  });
});
