// @ts-nocheck
/* datasafe 2026-10-05 — the slow-cold-start wipe.
   ────────────────────────────────────────────────
   Corbin: "My phone keeps losing VOTReader data." A vot-state hydration slower
   than the 3 s timeout settled 'degraded', App rendered on defaults, the store
   then loaded the real record (and made it the merge base), and the next
   ordinary write carried the defaults: every read mark, last-read place,
   setting and tab gone. storage-backup-3.repro.test.js stopped at the recovery
   and never ran that next write; these tests run it, against fake-indexeddb. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, render, act, cleanup } from '@testing-library/react';
import { StateStore } from '../stores/state-store.js';
import { IDBAdapter } from '../stores/idb-adapter.js';
import { CachedStore, _resetStoreRegistry } from '../stores/cached-store.js';
import { mergeStateStore, allowProgressClear, _resetProgressClearForTests } from '../stores/store-merge.js';
import { usePersistedState, RESUME_STATE_KEY } from '../hooks/use-persisted-state.js';
import { useSavedState } from '../hooks/use-saved-state.js';
import { HydrationGate, REMOUNT_COALESCE_MS } from '../components/HydrationGate.jsx';
import { DiagnosticLog, PERSIST_KEY } from './diagnostic-log.js';

const marks = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['bible:john:' + (i + 1), 1]));

const REAL = {
  theme: 'light',
  settings: { translation: 'kjv', fontStyle: 'classic', fontScale: '1.2' },
  tabs: [{ id: 't1', screen: 'bible-ch', bookId: 'john', chapterNum: 3 }],
  activeTabIdx: 0,
  activeReadKey: null,
  readItems: { ...marks(12), 'vot1:chosen-by-god': 2 },
  lastReadChapters: { john: 3 },
  lastReadLetterMap: { vot1: 'chosen-by-god' },
};

const DEFAULTS = {
  theme: 'dark',
  settings: { fontStyle: 'modern', fontScale: '1.0' },
  tabs: [{ id: 'd1', screen: 'home' }],
  activeTabIdx: 0,
  activeReadKey: null,
  readItems: {},
  lastReadChapters: {},
  lastReadLetterMap: {},
};

/** Make the next vot-state read slow: it answers only when released. */
function slowFirstStateRead() {
  const realGet = IDBAdapter.get.bind(IDBAdapter);
  let release;
  const gate = new Promise((r) => { release = r; });
  let first = true;
  vi.spyOn(IDBAdapter, 'get').mockImplementation((store, key) => {
    if (store === 'vot-state' && key === 'v' && first) {
      first = false;
      return gate.then(() => realGet(store, key));
    }
    return realGet(store, key);
  });
  return { release: () => release(), realGet };
}

async function settle(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  localStorage.clear();
  sessionStorage.clear();
  DiagnosticLog.clear();
  _resetProgressClearForTests();
  IDBAdapter._resetForTests();
  StateStore._resetForTests();
  await IDBAdapter.put('vot-state', 'v', REAL);   // last session's real record
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  StateStore._resetForTests();
  IDBAdapter._resetForTests();
});

describe('a mount that began before vot-state loaded writes nothing', () => {
  it('keeps every read mark, setting and tab through recovery and the next write', async () => {
    const { release, realGet } = slowFirstStateRead();
    const hydration = StateStore._hydrate();
    await settle(3000);
    await hydration;
    expect(StateStore.getState()).toBe('degraded');

    // App mounts on the degraded store: its union is the hook defaults.
    const { rerender, unmount } = renderHook((u) => usePersistedState(u), { initialProps: DEFAULTS });
    expect(StateStore._queue).toHaveLength(0);

    release();                                     // the slow read lands
    await settle(10);
    expect(StateStore.getState()).toBe('loaded');

    // The reader taps something: a new union, still built from defaults.
    rerender({ ...DEFAULTS, tabs: [{ id: 'd1', screen: 'volumes-home' }] });
    await settle(300);
    await StateStore.whenSaved();
    window.dispatchEvent(new Event('pagehide'));   // the leave record path
    unmount();                                     // the unmount flush path
    await settle(10);
    await StateStore.whenSaved();

    const disk = await realGet('vot-state', 'v');
    expect(disk.readItems).toEqual(REAL.readItems);
    expect(disk.lastReadChapters).toEqual(REAL.lastReadChapters);
    expect(disk.lastReadLetterMap).toEqual(REAL.lastReadLetterMap);
    expect(disk.theme).toBe('light');
    expect(disk.settings).toEqual(REAL.settings);
    expect(disk.tabs).toEqual(REAL.tabs);
    expect(sessionStorage.getItem(RESUME_STATE_KEY)).toBeNull();
  });

  it('a mount over a loaded store still writes as before', async () => {
    const realGet = IDBAdapter.get.bind(IDBAdapter);
    StateStore._resetForTests({ forceLoaded: true });
    StateStore._cache = { ...REAL };
    StateStore._base = { ...REAL };
    const { rerender } = renderHook((u) => usePersistedState(u), { initialProps: REAL });
    rerender({ ...REAL, tabs: [{ id: 't1', screen: 'volumes-home' }] });
    await settle(300);
    await StateStore.whenSaved();
    const disk = await realGet('vot-state', 'v');
    expect(disk.tabs).toEqual([{ id: 't1', screen: 'volumes-home' }]);
    expect(disk.readItems).toEqual(REAL.readItems);
  });

  it('useSavedState leaves the leave record for the remount when the store is not loaded', async () => {
    sessionStorage.setItem(RESUME_STATE_KEY, JSON.stringify({ at: Date.now(), state: { ...REAL, tabs: [{ id: 't9', screen: 'volumes-home' }] }, base: null }));
    slowFirstStateRead();
    const hydration = StateStore._hydrate();
    await settle(3000);
    await hydration;
    expect(StateStore.getState()).toBe('degraded');
    renderHook(() => useSavedState());
    expect(sessionStorage.getItem(RESUME_STATE_KEY)).not.toBeNull();
  });
});

describe('the progress-wipe guard in mergeStateStore', () => {
  it('keeps the disk ledger when a write would empty it with no clear armed', () => {
    const out = mergeStateStore(REAL, DEFAULTS, REAL);
    expect(out.readItems).toEqual(REAL.readItems);
    expect(out.lastReadChapters).toEqual(REAL.lastReadChapters);
    expect(out.theme).toBe('light');
    expect(out.tabs).toEqual(REAL.tabs);
    expect(DiagnosticLog.entries().some((e) => e.tag === 'state-guard')).toBe(true);
  });

  it('lets a deliberate clear empty it', () => {
    allowProgressClear();
    const out = mergeStateStore(REAL, { ...REAL, readItems: {} }, REAL);
    expect(out.readItems).toEqual({});
  });

  it('the clear token expires', () => {
    allowProgressClear();
    vi.advanceTimersByTime(61000);
    const out = mergeStateStore(REAL, { ...REAL, readItems: {} }, REAL);
    expect(out.readItems).toEqual(REAL.readItems);
  });

  it('a small ledger merges as before (unmarking the last few reads works)', () => {
    const small = { ...REAL, readItems: { a: 1, b: 1 } };
    const out = mergeStateStore(small, { ...small, readItems: {} }, small);
    expect(out.readItems).toEqual({});
  });
});

describe('HydrationGate remounts App when a late store loads', () => {
  beforeEach(() => { _resetStoreRegistry(); });

  it('remounts once, after the slow store loads', async () => {
    const realGet = IDBAdapter.get.bind(IDBAdapter);
    let release;
    const gate = new Promise((r) => { release = r; });
    vi.spyOn(IDBAdapter, 'get').mockImplementation((store, key) => (store === 'vot-test-late' ? gate.then(() => ['real']) : realGet(store, key)));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const late = CachedStore('vot-test-late', [], { idb: true });
    late._backgroundRetryDelays = [];
    let mounts = 0;
    function Child() {
      React.useEffect(() => { mounts += 1; }, []);
      return <div>{JSON.stringify(late._load())}</div>;
    }
    const { container } = render(<HydrationGate><Child /></HydrationGate>);
    await settle(3000);
    await settle(10);
    expect(mounts).toBe(1);
    expect(container.textContent).toBe('[]');
    release();
    await settle(10);
    await settle(REMOUNT_COALESCE_MS + 10);
    expect(mounts).toBe(2);
    expect(container.textContent).toBe('["real"]');
    await settle(5000);
    expect(mounts).toBe(2);
  });
});

describe('storage-health warnings survive a reload', () => {
  it('persists hydration / state-guard warnings to a capped ring and not ordinary ones', () => {
    DiagnosticLog.warn('hydration', 'vot-state degraded');
    DiagnosticLog.warn('render', 'not kept');
    for (let i = 0; i < 60; i++) DiagnosticLog.warn('state-guard', 'n' + i);
    const ring = JSON.parse(localStorage.getItem(PERSIST_KEY));
    expect(ring).toHaveLength(50);
    expect(ring.every((e) => e.tag !== 'render')).toBe(true);
    expect(ring[49].msg).toBe('n59');
    expect(DiagnosticLog.persisted()).toHaveLength(50);
  });
});
