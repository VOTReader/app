// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { StateStore } from '../stores/state-store.js';
import { IDBAdapter } from '../stores/idb-adapter.js';
import { usePersistedState } from '../hooks/use-persisted-state.js';

const realState = {
  theme: 'light',
  settings: { fontStyle: 'classic', fontScale: '1.3' },
  tabs: [{ id: 'saved-tab', screen: 'vot-three-letter', letterId: 'real-letter' }],
  activeTabIdx: 0,
  readItems: { 'vol:three:real-letter': 2 },
};

const bootDefaults = {
  theme: 'dark',
  settings: { fontStyle: 'modern', fontScale: '1.0' },
  tabs: [{ id: 'default-tab', screen: 'home' }],
  activeTabIdx: 0,
  lastReadChapters: {},
  lastReadLetterMap: {},
  activeReadKey: null,
  readItems: {},
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  StateStore._resetForTests();
  IDBAdapter._resetForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  StateStore._resetForTests();
  IDBAdapter._resetForTests();
});

describe('REPRO storage-backup-3: degraded then recovered vot-state', () => {
  it('does not replay boot defaults over the real IDB state after a 3s timeout', async () => {
    let resolveHydration;
    vi.spyOn(IDBAdapter, 'get').mockImplementation(() => new Promise((resolve) => {
      resolveHydration = resolve;
    }));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const hydration = StateStore._hydrate();
    vi.advanceTimersByTime(3000);
    await hydration;
    expect(StateStore.getState()).toBe('degraded');

    // HydrationGate has resolved, so App mounts and its first persistence
    // effect writes its in-memory boot defaults while the store is degraded.
    renderHook(() => usePersistedState(bootDefaults));
    expect(StateStore._queue).toHaveLength(1);

    // The original IDB read eventually returns the user's actual state.
    resolveHydration(realState);
    await vi.advanceTimersByTimeAsync(0);

    expect(StateStore.getState()).toBe('loaded');
    expect(StateStore.get()).toEqual(realState);
  });
});
