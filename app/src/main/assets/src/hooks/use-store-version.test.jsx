// @ts-nocheck — a store stub on globalThis
/* useStoreVersion — one hook for the store subscribe/getVersion protocol (v15-code-health-08). */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStoreVersion, useStoreVersionByName } from './use-store-version.js';

function fakeStore() {
  let v = 0;
  const subs = new Set();
  return {
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    getVersion: () => v,
    bump() { v++; subs.forEach((cb) => cb()); },
    get listeners() { return subs.size; },
  };
}

afterEach(() => { delete globalThis.TestVersionStore; });

describe('useStoreVersion', () => {
  it('returns the version and re-renders when it moves', () => {
    const store = fakeStore();
    const { result } = renderHook(() => useStoreVersion(store));
    expect(result.current).toBe(0);
    act(() => store.bump());
    expect(result.current).toBe(1);
  });

  it('unsubscribes on unmount', () => {
    const store = fakeStore();
    const { unmount } = renderHook(() => useStoreVersion(store));
    expect(store.listeners).toBe(1);
    unmount();
    expect(store.listeners).toBe(0);
  });

  it('an absent or half-shaped store is inert at 0', () => {
    expect(renderHook(() => useStoreVersion(null)).result.current).toBe(0);
    expect(renderHook(() => useStoreVersion({ getVersion: () => 7 })).result.current).toBe(7);
    expect(renderHook(() => useStoreVersion({ subscribe: () => () => {} })).result.current).toBe(0);
  });

  it('by name reads the window slot a cross-bundle store fills', () => {
    const store = fakeStore();
    globalThis.TestVersionStore = store;
    const { result } = renderHook(() => useStoreVersionByName('TestVersionStore'));
    act(() => store.bump());
    expect(result.current).toBe(1);
    expect(renderHook(() => useStoreVersionByName('NoSuchStore')).result.current).toBe(0);
  });
});
