/* CachedStore base — subscribe/getVersion/_bump + W2.2 IDB rebase tests.
   ─────────────────────────────────────────────────────────────────────
   Two-part suite:

   PART 1 — React 18 reactivity contract (subscribe + getVersion + _bump).
     Original Q7-era tests. LS-only stores; no IDB. Validates that the
     useSyncExternalStore-compatible contract is intact.

   PART 2 — W2.2 opt-in IDB backing + write-queue REBASE semantics.
     Uses an in-file test fixture (createTestStore) that mimics a real
     store's mutation methods (add/remove) plus the _shouldDefer guard
     pattern. The fixture lets the tests exercise the state machine
     (pending → loaded / pending → degraded → loaded) without coupling
     to BookmarkStore/AnnotationStore/etc.

     IDBAdapter is mocked via vi.spyOn so the tests have full control
     over resolution timing — vi.useFakeTimers() + vi.advanceTimersByTime
     drive the hydration timeout and background-retry chain.

     The two documented data-loss vectors (PLAN.txt:1284-1366,
     [[w2-hydration-data-loss]]) are exercised explicitly:
       Vector 1 (late stomp): hydration completes AFTER user writes →
                              ALL writes survive (rebase, not overwrite).
       Vector 2 (cache-wins): the rebase must preserve previous-session
                              IDB data AND current-session writes; a
                              "discard IDB, keep cache" merge would
                              fail tests #5 and #6.
   ─────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CachedStore, extendStore,
  hydrateAllStores, hasAnyPendingStores, _resetStoreRegistry,
  clearLegacyLs, _resetLegacyLsFlag, LS_SKIP_LIST,
} from './cached-store.js';
import { IDBAdapter } from './idb-adapter.js';

/* ═══════════════════════════════════════════════════════════════════
   PART 1 — Original reactivity contract (LS-only mode, unchanged).
   ═══════════════════════════════════════════════════════════════════ */

describe('CachedStore — useSyncExternalStore reactivity contract (LS mode)', () => {
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

describe('CachedStore — backward compatibility (no opts, 2-arg call)', () => {
  beforeEach(() => { localStorage.clear?.(); });

  it('2-arg call (no opts) starts in loaded state — no async hydration', () => {
    const store = CachedStore('vot-test-bw', []);
    expect(store.getState()).toBe('loaded');
    expect(store.isReady()).toBe(true);
  });

  it('opts.idb=false explicitly is identical to no opts', () => {
    const store = CachedStore('vot-test-bw', [], { idb: false });
    expect(store.getState()).toBe('loaded');
    expect(store.isReady()).toBe(true);
  });

  it('_shouldDefer always returns false in LS mode', () => {
    const store = CachedStore('vot-test-bw', []);
    expect(store._shouldDefer('add', { id: 'x' })).toBe(false);
  });

  it('_hydrate is a no-op for LS-mode stores (resolves immediately)', async () => {
    const store = CachedStore('vot-test-bw', []);
    await expect(store._hydrate()).resolves.toBeUndefined();
    expect(store.getState()).toBe('loaded');
  });

  it('LS write-through still works (_save writes to localStorage)', () => {
    const store = CachedStore('vot-test-bw', []);
    store._load(); // initialize cache
    store._cache.push({ id: 'x' });
    store._save();
    expect(JSON.parse(localStorage.getItem('vot-test-bw'))).toEqual([{ id: 'x' }]);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   PART 2 — W2.2 IDB-backing + write-queue REBASE.

   Test fixture: `createTestStore(opts)` builds a store with add/remove
   mutation methods that gate on `_shouldDefer`. This mimics what a real
   store's W2.3 migration will look like.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Build a test store that behaves like BookmarkStore (array of items
 * keyed by .id) but with IDB-backed semantics. add/remove use the
 * `_shouldDefer` guard pattern that real stores will adopt in W2.3.
 */
function createTestStore(key, opts) {
  return extendStore(
    CachedStore(key, /** @type {Array<{id: string, label: string}>} */ ([]), opts),
    {
      add(item) {
        if (this._shouldDefer('add', item)) return;
        this._load().push(item);
        this._save();
        this._bump();
      },
      remove(id) {
        if (this._shouldDefer('remove', id)) return;
        this._cache = this._load().filter(function (it) { return it.id !== id; });
        this._save();
        this._bump();
      },
      all() {
        return this._load();
      },
    }
  );
}

describe('CachedStore W2.2 — initial state machine', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); });

  it('idb:true store starts in pending state', () => {
    const store = createTestStore('vot-test-w22-init', { idb: true });
    expect(store.getState()).toBe('pending');
    expect(store.isReady()).toBe(false);
  });

  it('_load() during pending returns fresh defaults (empty)', () => {
    const store = createTestStore('vot-test-w22-init', { idb: true });
    expect(store.all()).toEqual([]);
  });

  it('_load() during pending returns a STABLE reference (memoized defaults via _defaultRef)', () => {
    // Previously this test asserted different references on each call —
    // which was the LATENT BUG that caused infinite useSyncExternalStore
    // loops in degraded state on budget devices. The correct invariant
    // is reference stability so React's Object.is comparison doesn't
    // trigger a re-render storm. The defaults object is shared across
    // consumers during the brief pending window; this is safe because
    // (a) hooks treat it as read-only, (b) the recursive overlay-apply
    // in _shouldDefer swaps to _pendingCache (a separate ref) before
    // any mutation, and (c) _defaultRef is cleared by _rebaseAndPromote
    // so post-hydration the real _cache takes over.
    const store = createTestStore('vot-test-w22-init', { idb: true });
    const a = store.all();
    const b = store.all();
    expect(a).toBe(b); // SAME reference — stability invariant
    expect(a).toEqual([]);
  });
});

describe('CachedStore W2.2 — happy-path hydration (pending → loaded fast)', () => {
  beforeEach(() => {
    localStorage.clear?.();
    _resetStoreRegistry();
    vi.restoreAllMocks();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('hydration <100ms transitions to loaded with IDB data', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([
      { id: 'b1', label: 'Book 1' },
      { id: 'b2', label: 'Book 2' },
    ]);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-fast', { idb: true });
    await store._hydrate();
    expect(store.getState()).toBe('loaded');
    expect(store.isReady()).toBe(true);
    expect(store.all()).toEqual([
      { id: 'b1', label: 'Book 1' },
      { id: 'b2', label: 'Book 2' },
    ]);
  });

  it('empty IDB (undefined) → cache becomes default empty array', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue(undefined);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-empty', { idb: true });
    await store._hydrate();
    expect(store.getState()).toBe('loaded');
    expect(store.all()).toEqual([]);
  });

  it('post-load mutations write through to IDB', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([]);
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-write', { idb: true });
    await store._hydrate();
    putSpy.mockClear();
    store.add({ id: 'b1', label: 'fresh' });
    expect(store.all()).toEqual([{ id: 'b1', label: 'fresh' }]);
    expect(putSpy).toHaveBeenCalledWith('vot-test-w22-write', 'v', [{ id: 'b1', label: 'fresh' }]);
  });

  it('hydration is idempotent — second call returns same promise', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([]);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-idem', { idb: true });
    const p1 = store._hydrate();
    const p2 = store._hydrate();
    expect(p1).toBe(p2);
    await p1;
  });

  it('subscribers are notified on transition to loaded', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([{ id: 'x', label: 'X' }]);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-sub', { idb: true });
    const cb = vi.fn();
    store.subscribe(cb);
    await store._hydrate();
    expect(cb).toHaveBeenCalled();
    expect(store.getVersion()).toBeGreaterThan(0);
  });
});

describe('CachedStore W2.2 — writes during pending (Vector 1: late stomp prevention)', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('writes during pending populate _pendingCache AND queue', () => {
    // IDB hangs forever — store stays pending.
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-vec1-q', { idb: true });
    store._hydrate(); // kick off (will hang)
    store.add({ id: 'A', label: 'pending-add' });
    expect(store.getState()).toBe('pending');
    expect(store._queue).toEqual([
      { op: 'add', args: [{ id: 'A', label: 'pending-add' }] },
    ]);
    // _pendingCache reflects the user's write — UI continuity.
    expect(store._pendingCache).toEqual([{ id: 'A', label: 'pending-add' }]);
  });

  it('_load() during pending returns the _pendingCache overlay (UI sees user writes)', () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-vec1-load', { idb: true });
    store._hydrate();
    store.add({ id: 'A', label: 'visible-during-pending' });
    expect(store.all()).toEqual([{ id: 'A', label: 'visible-during-pending' }]);
  });

  it('_bump fires during pending writes — subscribers re-render with overlay', () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-vec1-bump', { idb: true });
    store._hydrate();
    const cb = vi.fn();
    store.subscribe(cb);
    const v0 = store.getVersion();
    store.add({ id: 'A', label: 'x' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(store.getVersion()).toBeGreaterThan(v0);
  });

  it('IDB.put is NOT called for pending writes (no premature persistence)', () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-vec1-noput', { idb: true });
    store._hydrate();
    store.add({ id: 'A', label: 'x' });
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('REBASE on hydration: previous-session IDB data + current-session writes BOTH survive', async () => {
    // Pre-populate IDB with previous-session data {B, C, D}.
    // Simulate slow IDB: get() resolves after writes have happened.
    /** @type {(v: any) => void} */
    let resolveGet = () => {};
    const slowGet = new Promise((r) => { resolveGet = r; });
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(slowGet);
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w22-rebase', { idb: true });
    const hydratePromise = store._hydrate();

    // During pending, user writes {A}.
    store.add({ id: 'A', label: 'current-session-A' });
    expect(store.all()).toEqual([{ id: 'A', label: 'current-session-A' }]);

    // IDB finally resolves with {B, C, D}.
    resolveGet([
      { id: 'B', label: 'prev-B' },
      { id: 'C', label: 'prev-C' },
      { id: 'D', label: 'prev-D' },
    ]);
    await hydratePromise;

    // After rebase, cache contains {B, C, D} (IDB base) PLUS replayed
    // queue ops applied on top → {B, C, D, A}.
    const final = store.all();
    const ids = final.map((x) => x.id).sort();
    expect(ids).toEqual(['A', 'B', 'C', 'D']);
    expect(final.find((x) => x.id === 'A').label).toBe('current-session-A');

    // The rebased state was flushed to IDB ONCE (batched, single save).
    // Filter to the post-rebase calls only.
    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(putSpy.mock.calls[0][0]).toBe('vot-test-w22-rebase');
    expect(putSpy.mock.calls[0][1]).toBe('v');
    const persistedIds = putSpy.mock.calls[0][2].map((x) => x.id).sort();
    expect(persistedIds).toEqual(['A', 'B', 'C', 'D']);

    expect(store.getState()).toBe('loaded');
    expect(store._pendingCache).toBeNull(); // dropped on rebase
    expect(store._queue).toEqual([]);
  });
});

describe('CachedStore W2.2 — hydration timeout → degraded → recovery (Vector 2 prevention)', () => {
  beforeEach(() => {
    localStorage.clear?.();
    _resetStoreRegistry();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.DiagnosticLog;
  });

  it('hydration >3s without resolution → degraded', async () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {})); // never resolves
    const store = createTestStore('vot-test-w22-deg', { idb: true });
    const hydratePromise = store._hydrate();
    expect(store.getState()).toBe('pending');
    vi.advanceTimersByTime(3000);
    await hydratePromise;
    expect(store.getState()).toBe('degraded');
  });

  it('logs the degraded transition to DiagnosticLog — E5', async () => {
    const warn = vi.fn();
    window.DiagnosticLog = { warn }; // cached-store reads the bare global
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    const store = createTestStore('vot-test-w22-e5', { idb: true });
    const hydratePromise = store._hydrate();
    vi.advanceTimersByTime(3000);
    await hydratePromise;
    expect(warn).toHaveBeenCalledWith('hydration', expect.stringContaining('degraded'));
  });

  it('subscribers are notified on degraded transition', async () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    const store = createTestStore('vot-test-w22-deg-sub', { idb: true });
    const cb = vi.fn();
    store.subscribe(cb);
    const hydratePromise = store._hydrate();
    vi.advanceTimersByTime(3000);
    await hydratePromise;
    expect(cb).toHaveBeenCalled();
  });

  it('writes during degraded populate queue + pendingCache (same as pending)', async () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-deg-write', { idb: true });
    const hydratePromise = store._hydrate();
    vi.advanceTimersByTime(3000);
    await hydratePromise;
    expect(store.getState()).toBe('degraded');
    store.add({ id: 'D1', label: 'during-degraded' });
    expect(store.all()).toEqual([{ id: 'D1', label: 'during-degraded' }]);
    expect(store._queue.length).toBe(1);
  });

  it('background retry promotes degraded → loaded with rebased queue', async () => {
    // First two IDB.get calls hang (initial + first background retry).
    // Third (second background retry) succeeds with previous-session data.
    let getCallCount = 0;
    /** @type {(v: any) => void} */
    let resolveSecondRetry = () => {};
    const getSpy = vi.spyOn(IDBAdapter, 'get').mockImplementation(function () {
      getCallCount += 1;
      if (getCallCount === 1) return new Promise(() => {}); // initial: hangs forever
      if (getCallCount === 2) return Promise.reject(new Error('still down'));
      // Third call (and beyond) resolves with {B, C}.
      return new Promise(function (r) {
        resolveSecondRetry = r;
      });
    });
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w22-recovery', { idb: true });
    const hydratePromise = store._hydrate();

    // 3s hydration timeout → degraded.
    vi.advanceTimersByTime(3000);
    await hydratePromise;
    expect(store.getState()).toBe('degraded');

    // User writes during degraded.
    store.add({ id: 'A', label: 'session-A' });

    // First background retry (5s after degraded) — rejects.
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.getState()).toBe('degraded');

    // Second background retry (10s after the first reject).
    await vi.advanceTimersByTimeAsync(10000);
    // Third get call is queued — resolve it with previous-session data.
    resolveSecondRetry([{ id: 'B', label: 'prev-B' }, { id: 'C', label: 'prev-C' }]);
    // Flush microtasks.
    await vi.advanceTimersByTimeAsync(0);

    // Now rebased: {B, C} from IDB + {A} from queue.
    expect(store.getState()).toBe('loaded');
    const ids = store.all().map((x) => x.id).sort();
    expect(ids).toEqual(['A', 'B', 'C']);
    expect(store._pendingCache).toBeNull();
    expect(store._queue).toEqual([]);

    // One batched put on rebase.
    expect(putSpy).toHaveBeenCalledTimes(1);
    getSpy.mockRestore();
  });

  it('IDB rejection on initial hydration → degraded + background retry', async () => {
    let getCallCount = 0;
    vi.spyOn(IDBAdapter, 'get').mockImplementation(function () {
      getCallCount += 1;
      if (getCallCount === 1) return Promise.reject(new Error('IDB unavailable'));
      return Promise.resolve([{ id: 'recovered', label: 'X' }]);
    });
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = createTestStore('vot-test-w22-rej', { idb: true });
    const hydratePromise = store._hydrate();
    await hydratePromise;

    expect(store.getState()).toBe('degraded');
    expect(consoleSpy).toHaveBeenCalled();

    // Background retry kicks in at 5s.
    await vi.advanceTimersByTimeAsync(5000);

    expect(store.getState()).toBe('loaded');
    expect(store.all()).toEqual([{ id: 'recovered', label: 'X' }]);

    consoleSpy.mockRestore();
  });

  it('permanent IDB failure: store stays degraded, queue is session truth', async () => {
    vi.spyOn(IDBAdapter, 'get').mockRejectedValue(new Error('corrupted'));
    vi.spyOn(IDBAdapter, 'put').mockRejectedValue(new Error('corrupted'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = createTestStore('vot-test-w22-perm-fail', { idb: true });
    await store._hydrate();
    expect(store.getState()).toBe('degraded');

    store.add({ id: 'survivor', label: 'session-only' });
    // _load() serves the queue overlay (user sees their write).
    expect(store.all()).toEqual([{ id: 'survivor', label: 'session-only' }]);

    // Run all retry attempts — each rejects.
    await vi.advanceTimersByTimeAsync(120000); // covers all 4 backoff slots
    expect(store.getState()).toBe('degraded');
    // Queue is still the only truth.
    expect(store.all()).toEqual([{ id: 'survivor', label: 'session-only' }]);

    consoleSpy.mockRestore();
  });
});

describe('CachedStore W2.2 — batched replay (Flag 2: single save + single bump)', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('replaying N queued ops fires ONE IDB.put and ONE subscriber notification', async () => {
    /** @type {(v: any) => void} */
    let resolveGet = () => {};
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise((r) => { resolveGet = r; }));
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w22-batch', { idb: true });
    const hydratePromise = store._hydrate();

    // 5 writes during pending.
    store.add({ id: 'a', label: 'A' });
    store.add({ id: 'b', label: 'B' });
    store.add({ id: 'c', label: 'C' });
    store.add({ id: 'd', label: 'D' });
    store.add({ id: 'e', label: 'E' });

    // Subscriber attached AFTER pending writes — should only see the
    // single end-of-rebase notification, not intermediate replay ticks.
    const cb = vi.fn();
    store.subscribe(cb);

    // Capture put count before rebase.
    const putCountBefore = putSpy.mock.calls.length;
    expect(putCountBefore).toBe(0); // no pending-write puts

    resolveGet([]);
    await hydratePromise;

    // After rebase: ONE put (the batched flush), ONE subscriber call.
    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);

    // Final state has all 5 items.
    expect(store.all().length).toBe(5);
  });

  it('a subscriber attached BEFORE writes sees pending-overlay bumps + ONE rebase bump', async () => {
    /** @type {(v: any) => void} */
    let resolveGet = () => {};
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise((r) => { resolveGet = r; }));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w22-batch-pre', { idb: true });
    const cb = vi.fn();
    store.subscribe(cb);

    const hydratePromise = store._hydrate();
    store.add({ id: 'a', label: 'A' });
    store.add({ id: 'b', label: 'B' });
    store.add({ id: 'c', label: 'C' });
    // 3 pending bumps (UI continuity).
    expect(cb).toHaveBeenCalledTimes(3);

    resolveGet([]);
    await hydratePromise;

    // +1 for the batched rebase bump = 4 total.
    expect(cb).toHaveBeenCalledTimes(4);
  });
});

describe('CachedStore W2.2 — multiple stores hydrate concurrently with independent state', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('two stores: one succeeds fast, one times out → independent states', async () => {
    vi.useFakeTimers();
    let getCalls = 0;
    vi.spyOn(IDBAdapter, 'get').mockImplementation(function (storeName) {
      getCalls += 1;
      if (storeName === 'vot-test-w22-fast2') {
        return Promise.resolve([{ id: 'fast-loaded' }]);
      }
      // 'vot-test-w22-slow' never resolves.
      return new Promise(() => {});
    });
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const fast = createTestStore('vot-test-w22-fast2', { idb: true });
    const slow = createTestStore('vot-test-w22-slow', { idb: true });

    const fastPromise = fast._hydrate();
    const slowPromise = slow._hydrate();

    // Drain microtasks for the fast one.
    await vi.advanceTimersByTimeAsync(0);
    expect(fast.getState()).toBe('loaded');
    expect(slow.getState()).toBe('pending');

    // Timeout the slow one.
    vi.advanceTimersByTime(3000);
    await slowPromise;
    expect(slow.getState()).toBe('degraded');
    expect(fast.getState()).toBe('loaded'); // still loaded
    await fastPromise; // already resolved

    expect(getCalls).toBeGreaterThanOrEqual(2);
  });
});

describe('CachedStore W2.2 — LS shim for boot-script reads', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('lsShim writes a reduced LS copy on every save', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue({
      theme: 'light',
      settings: { fontStyle: 'modern', otherStuff: 'preserved' },
      tabs: [{ id: 't1' }],
    });
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = extendStore(
      CachedStore('vot-state-test', {}, {
        idb: true,
        lsShim: (full) => ({
          theme: full && full.theme,
          settings: { fontStyle: full && full.settings && full.settings.fontStyle },
        }),
      }),
      {
        setTheme(t) {
          if (this._shouldDefer('setTheme', t)) return;
          /** @type {any} */ (this._load()).theme = t;
          this._save();
          this._bump();
        },
      }
    );
    await store._hydrate();
    expect(store.getState()).toBe('loaded');

    store.setTheme('dark');

    // LS shim was written.
    const raw = JSON.parse(localStorage.getItem('vot-state-test'));
    expect(raw).toEqual({ theme: 'dark', settings: { fontStyle: 'modern' } });
    // Other fields NOT in LS shim — IDB has the full state.
    expect(raw.tabs).toBeUndefined();
  });

  it('lsShim function throwing does NOT block IDB write', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue({ theme: 'light' });
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = extendStore(
      CachedStore('vot-state-test-throw', {}, {
        idb: true,
        lsShim: () => { throw new Error('shim boom'); },
      }),
      {
        setTheme(t) {
          if (this._shouldDefer('setTheme', t)) return;
          /** @type {any} */ (this._load()).theme = t;
          this._save();
          this._bump();
        },
      }
    );
    await store._hydrate();
    putSpy.mockClear();

    store.setTheme('dark');
    // IDB put still fired despite shim throw.
    expect(putSpy).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe('CachedStore W2.2 — remove/delete during pending (reassignment safety)', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('remove during pending: queue records remove; pendingCache reflects filter', () => {
    // IDB hangs.
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-remove-pending', { idb: true });
    store._hydrate();

    // add three items, then remove one — all during pending.
    store.add({ id: 'a' });
    store.add({ id: 'b' });
    store.add({ id: 'c' });
    expect(store.all().map((x) => x.id)).toEqual(['a', 'b', 'c']);
    store.remove('b');
    // pendingCache reflects the remove.
    expect(store.all().map((x) => x.id)).toEqual(['a', 'c']);
    // queue has 4 ops in order.
    expect(store._queue.length).toBe(4);
    expect(store._queue.map((q) => q.op)).toEqual(['add', 'add', 'add', 'remove']);
  });

  it('remove during pending then rebase on hydration: final state is correct', async () => {
    /** @type {(v: any) => void} */
    let resolveGet = () => {};
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise((r) => { resolveGet = r; }));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w22-remove-rebase', { idb: true });
    const hydratePromise = store._hydrate();

    store.add({ id: 'session-A' });
    store.add({ id: 'session-B' });
    store.remove('session-A');

    resolveGet([{ id: 'prev-X' }, { id: 'prev-Y' }]);
    await hydratePromise;

    // Final cache: previous-session {X, Y} + add B + remove A
    // (A was never in IDB, but remove() still runs in replay and
    //  is a no-op on the missing key). Result: {X, Y, B}.
    const ids = store.all().map((x) => x.id).sort();
    expect(ids).toEqual(['prev-X', 'prev-Y', 'session-B']);
  });
});

describe('CachedStore W2.3 Tier 1 — registry + hydrateAllStores', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('idb:true stores auto-register; LS-only stores do not', () => {
    expect(hasAnyPendingStores()).toBe(false);
    CachedStore('vot-test-w23-ls', []); // LS-only — NOT registered
    expect(hasAnyPendingStores()).toBe(false);
    CachedStore('vot-test-w23-idb', [], { idb: true }); // registered
    expect(hasAnyPendingStores()).toBe(true);
  });

  it('hydrateAllStores resolves immediately when registry is empty', async () => {
    expect(_resetStoreRegistry).toBeDefined();
    await expect(hydrateAllStores()).resolves.toBeUndefined();
  });

  it('hydrateAllStores awaits every registered IDB store', async () => {
    const getSpy = vi.spyOn(IDBAdapter, 'get').mockResolvedValue([]);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const s1 = createTestStore('vot-test-w23-many-1', { idb: true });
    const s2 = createTestStore('vot-test-w23-many-2', { idb: true });
    const s3 = createTestStore('vot-test-w23-many-3', { idb: true });
    await hydrateAllStores();
    expect(s1.getState()).toBe('loaded');
    expect(s2.getState()).toBe('loaded');
    expect(s3.getState()).toBe('loaded');
    expect(getSpy).toHaveBeenCalledTimes(3);
  });

  it('hydrateAllStores resolves even if one store fails (Promise.allSettled)', async () => {
    let getCount = 0;
    vi.spyOn(IDBAdapter, 'get').mockImplementation(function (storeName) {
      getCount += 1;
      if (storeName === 'vot-test-w23-fail-bad') return Promise.reject(new Error('corrupted'));
      return Promise.resolve([]);
    });
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ok = createTestStore('vot-test-w23-fail-ok', { idb: true });
    const bad = createTestStore('vot-test-w23-fail-bad', { idb: true });

    // Must not throw despite one store failing.
    await expect(hydrateAllStores()).resolves.toBeUndefined();
    expect(ok.getState()).toBe('loaded');
    expect(bad.getState()).toBe('degraded');
    expect(getCount).toBe(2);
    consoleSpy.mockRestore();
  });

  it('hasAnyPendingStores flips to false after hydrateAllStores resolves', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([]);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    createTestStore('vot-test-w23-pending', { idb: true });
    expect(hasAnyPendingStores()).toBe(true);
    await hydrateAllStores();
    expect(hasAnyPendingStores()).toBe(false);
  });
});

describe('CachedStore — _defaultRef stability during pending/degraded', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('_load returns the SAME reference on consecutive calls during pending (no _pendingCache writes)', () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {})); // hangs
    const store = createTestStore('vot-test-defaultref-pending', { idb: true });
    store._hydrate();
    // No writes performed → _pendingCache stays null → _load falls
    // through to the defaults branch. The reference must be stable
    // across calls or useSyncExternalStore will infinite-loop.
    const r1 = store._load();
    const r2 = store._load();
    const r3 = store._load();
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(Array.isArray(r1)).toBe(true);
    expect(r1.length).toBe(0);
  });

  it('_load returns the SAME reference on consecutive calls during degraded (regression for infinite-loop bug)', async () => {
    vi.useFakeTimers();
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    const store = createTestStore('vot-test-defaultref-degraded', { idb: true });
    const p = store._hydrate();
    vi.advanceTimersByTime(3000);
    await p;
    expect(store.getState()).toBe('degraded');
    // Critical invariant: getSnapshot returns stable reference in degraded.
    const r1 = store._load();
    const r2 = store._load();
    const r3 = store._load();
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('_rebaseAndPromote clears _defaultRef so future hydration cycles allocate fresh', async () => {
    // Start hanging, time out, then resolve.
    /** @type {(v: any) => void} */
    let resolveGet = () => {};
    vi.spyOn(IDBAdapter, 'get').mockImplementation(() => new Promise((r) => { resolveGet = r; }));
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-defaultref-clear', { idb: true });
    const p = store._hydrate();
    // Consume the defaults ref by calling _load() during pending.
    const pendingRef = store._load();
    expect(store._defaultRef).toBe(pendingRef);
    // Resolve hydration → cache populated, _defaultRef cleared.
    resolveGet([{ id: 'x' }]);
    await p;
    expect(store._defaultRef).toBeNull();
    expect(store.getState()).toBe('loaded');
    expect(store._load()).toEqual([{ id: 'x' }]);
  });

  it('_resetForTests clears _defaultRef', () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    const store = createTestStore('vot-test-defaultref-reset', { idb: true });
    store._hydrate();
    store._load(); // populates _defaultRef
    expect(store._defaultRef).not.toBeNull();
    store._resetForTests();
    expect(store._defaultRef).toBeNull();
  });
});

describe('CachedStore W2.4 — clearLegacyLs (one-time LS cleanup)', () => {
  beforeEach(() => {
    localStorage.clear?.();
    _resetStoreRegistry();
    vi.restoreAllMocks();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('LS_SKIP_LIST exports the one permanent LS exception (vot-state)', () => {
    expect(LS_SKIP_LIST).toContain('vot-state');
    expect(LS_SKIP_LIST).not.toContain('vot-ann-migrated');  // W7.1 retired this exception
    expect(LS_SKIP_LIST.length).toBe(1);
    expect(Object.isFrozen(LS_SKIP_LIST)).toBe(true);
  });

  it('first run: clears vot-* LS keys except skip-list AND sets the flag', async () => {
    // Seed legacy LS state
    localStorage.setItem('vot-bookmarks', '[]');
    localStorage.setItem('vot-history', '[]');
    localStorage.setItem('vot-home-order', '[]');
    localStorage.setItem('vot-state', '{"theme":"dark"}');           // skip
    localStorage.setItem('vot-ann-migrated', '1');                    // W7.1: no longer skipped → cleared
    localStorage.setItem('other-non-vot-key', 'untouched');           // not vot-* prefix

    // Mock IDB so the flag round-trip works
    /** @type {Record<string, any>} */
    const idbMeta = {};
    vi.spyOn(IDBAdapter, 'get').mockImplementation(async function (_store, key) {
      return idbMeta[String(key)];
    });
    vi.spyOn(IDBAdapter, 'put').mockImplementation(async function (_store, key, value) {
      idbMeta[String(key)] = value;
    });

    await clearLegacyLs();

    // Cleared (incl. vot-ann-migrated — W7.1 removed it from the skip list):
    expect(localStorage.getItem('vot-bookmarks')).toBeNull();
    expect(localStorage.getItem('vot-history')).toBeNull();
    expect(localStorage.getItem('vot-home-order')).toBeNull();
    expect(localStorage.getItem('vot-ann-migrated')).toBeNull();
    // Preserved:
    expect(localStorage.getItem('vot-state')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('other-non-vot-key')).toBe('untouched');
    // Flag set:
    expect(idbMeta['migrated-v1']).toBe(true);
  });

  it('U19: defers (does NOT wipe) while any IDB store is still pending', async () => {
    // A 'pending' store hasn't run its legacy-LS fallback yet, so wiping the
    // vot-* keys now would destroy pre-W2.4 data. createTestStore(idb) registers
    // in 'pending' until hydrated; leave it un-hydrated to exercise the guard.
    createTestStore('vot-test-pending-guard', { idb: true });
    expect(hasAnyPendingStores()).toBe(true);

    localStorage.setItem('vot-bookmarks', '[{"id":"keep"}]');
    /** @type {Record<string, any>} */
    const idbMeta = {};
    vi.spyOn(IDBAdapter, 'get').mockImplementation(async function (_s, k) { return idbMeta[String(k)]; });
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockImplementation(async function (_s, k, v) { idbMeta[String(k)] = v; });

    await clearLegacyLs();

    // Deferred: LS untouched + the done-flag NOT set (next boot retries).
    expect(localStorage.getItem('vot-bookmarks')).toBe('[{"id":"keep"}]');
    expect(idbMeta['migrated-v1']).toBeUndefined();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('idempotent: second call is a no-op (flag already set)', async () => {
    /** @type {Record<string, any>} */
    const idbMeta = { 'migrated-v1': true };
    vi.spyOn(IDBAdapter, 'get').mockImplementation(async function (_s, k) { return idbMeta[String(k)]; });
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockImplementation(async () => {});

    localStorage.setItem('vot-something', 'should-survive');
    await clearLegacyLs();
    expect(localStorage.getItem('vot-something')).toBe('should-survive');
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('meta-read failure: returns gracefully without touching LS', async () => {
    vi.spyOn(IDBAdapter, 'get').mockRejectedValue(new Error('IDB unavailable'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem('vot-bookmarks', 'preserved-on-error');
    await clearLegacyLs();
    expect(localStorage.getItem('vot-bookmarks')).toBe('preserved-on-error');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('meta-write failure: LS still cleared (partial OK; next boot retries)', async () => {
    /** @type {Record<string, any>} */
    const idbMeta = {};
    vi.spyOn(IDBAdapter, 'get').mockImplementation(async (_s, k) => idbMeta[String(k)]);
    vi.spyOn(IDBAdapter, 'put').mockRejectedValue(new Error('quota'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem('vot-bookmarks', '[]');
    await clearLegacyLs();
    expect(localStorage.getItem('vot-bookmarks')).toBeNull();  // cleared
    expect(idbMeta['migrated-v1']).toBeUndefined();             // flag NOT set
    consoleSpy.mockRestore();
  });

  it('_resetLegacyLsFlag clears the flag so clearLegacyLs runs again', async () => {
    /** @type {Record<string, any>} */
    const idbMeta = { 'migrated-v1': true };
    vi.spyOn(IDBAdapter, 'get').mockImplementation(async (_s, k) => idbMeta[String(k)]);
    vi.spyOn(IDBAdapter, 'put').mockImplementation(async (_s, k, v) => { idbMeta[String(k)] = v; });
    vi.spyOn(IDBAdapter, 'delete').mockImplementation(async (_s, k) => { delete idbMeta[String(k)]; });

    expect(idbMeta['migrated-v1']).toBe(true);
    await _resetLegacyLsFlag();
    expect(idbMeta['migrated-v1']).toBeUndefined();

    // Now clearLegacyLs runs the cleanup again
    localStorage.setItem('vot-cleanup-me', 'x');
    await clearLegacyLs();
    expect(localStorage.getItem('vot-cleanup-me')).toBeNull();
    expect(idbMeta['migrated-v1']).toBe(true);
  });
});

describe('CachedStore W2.3 — legacy LS fallback on first hydration', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('seeds IDB from legacy LS key when IDB returns undefined', async () => {
    // Pre-W2 LS data — what a user upgrading from a pre-W2 deploy has.
    localStorage.setItem('vot-test-w23-legacy', JSON.stringify([
      { id: 'legacy-A', label: 'pre-W2 data' },
      { id: 'legacy-B', label: 'also pre-W2' },
    ]));
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue(undefined); // IDB empty
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w23-legacy', { idb: true });
    await store._hydrate();

    // Cache contains the legacy data.
    expect(store.all().map((x) => x.id).sort()).toEqual(['legacy-A', 'legacy-B']);
    // IDB was seeded with the migrated data so the next boot reads from IDB.
    expect(putSpy).toHaveBeenCalled();
    const seedCall = putSpy.mock.calls.find((c) => c[0] === 'vot-test-w23-legacy');
    expect(seedCall).toBeDefined();
    expect(seedCall[2].map((x) => x.id).sort()).toEqual(['legacy-A', 'legacy-B']);
  });

  it('does NOT fall back to LS when IDB has data', async () => {
    localStorage.setItem('vot-test-w23-idb-wins', JSON.stringify([{ id: 'LS-stale', label: 'should-not-appear' }]));
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([{ id: 'idb-current', label: 'idb-wins' }]);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w23-idb-wins', { idb: true });
    await store._hydrate();

    expect(store.all()).toEqual([{ id: 'idb-current', label: 'idb-wins' }]);
  });

  it('handles unparseable legacy LS gracefully (resolves to defaults)', async () => {
    localStorage.setItem('vot-test-w23-broken', '{not valid json');
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue(undefined);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = createTestStore('vot-test-w23-broken', { idb: true });
    await store._hydrate();

    expect(store.all()).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('legacyLsKey: null disables the fallback', async () => {
    localStorage.setItem('vot-test-w23-no-fallback', JSON.stringify([{ id: 'stays-in-LS' }]));
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue(undefined);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w23-no-fallback', { idb: true, legacyLsKey: null });
    await store._hydrate();

    // LS data is NOT pulled into cache because the fallback was disabled.
    expect(store.all()).toEqual([]);
  });

  it('custom legacyLsKey reads from a different LS key', async () => {
    localStorage.setItem('different-legacy-name', JSON.stringify([{ id: 'X' }]));
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue(undefined);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w23-custom', { idb: true, legacyLsKey: 'different-legacy-name' });
    await store._hydrate();

    expect(store.all()).toEqual([{ id: 'X' }]);
  });
});

describe('CachedStore W2.2 — getState / isReady reflect transitions', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('observed lifecycle: pending → loaded', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([]);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w22-life', { idb: true });
    expect(store.getState()).toBe('pending');
    expect(store.isReady()).toBe(false);
    await store._hydrate();
    expect(store.getState()).toBe('loaded');
    expect(store.isReady()).toBe(true);
  });

  it('observed lifecycle: pending → degraded → loaded', async () => {
    vi.useFakeTimers();
    let getCallCount = 0;
    vi.spyOn(IDBAdapter, 'get').mockImplementation(function () {
      getCallCount += 1;
      if (getCallCount === 1) return new Promise(() => {}); // initial hangs
      return Promise.resolve([{ id: 'recovered' }]);
    });
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);

    const store = createTestStore('vot-test-w22-life-deg', { idb: true });
    expect(store.getState()).toBe('pending');

    const hydratePromise = store._hydrate();
    vi.advanceTimersByTime(3000);
    await hydratePromise;
    expect(store.getState()).toBe('degraded');

    // Background retry recovers at 5s.
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.getState()).toBe('loaded');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   PART 3 — W7.2 raw() immutability (frozen-copy mutation safety).
   ═══════════════════════════════════════════════════════════════════
   raw() must return a shallow-FROZEN COPY, never the live `_cache`. The
   regression these tests pin: a naive `Object.freeze(this._load())` would
   freeze the live cache (since _load() returns it) and break the store's
   own in-place mutations. Freezing a copy isolates the guard. */

describe('CachedStore — W7.2 raw() immutability (frozen copy)', () => {
  beforeEach(() => {
    if (typeof localStorage === 'undefined') {
      /** @type {any} */ const data = {};
      globalThis.localStorage = /** @type {any} */ ({
        get length() { return Object.keys(data).length; },
        clear() { for (const k in data) delete data[k]; },
        key(i) { return Object.keys(data)[i] ?? null; },
        getItem(k) { return data[k] ?? null; },
        setItem(k, v) { data[k] = String(v); },
        removeItem(k) { delete data[k]; },
      });
    } else {
      localStorage.clear?.();
    }
  });

  it('returns a frozen object; adding/reassigning/deleting a top-level key throws', () => {
    const s = CachedStore('w72-obj', /** @type {Record<string, number>} */ ({ x: 1 }));
    const r = s.raw();
    expect(Object.isFrozen(r)).toBe(true);
    expect(r).toEqual({ x: 1 });
    expect(() => { r.y = 2; }).toThrow();
    expect(() => { r.x = 9; }).toThrow();
    expect(() => { delete r.x; }).toThrow();
  });

  it('returns a frozen COPY — does NOT freeze the live cache (the regression)', () => {
    const s = CachedStore('w72-live', /** @type {Record<string, number>} */ ({}));
    s._load().a = 1;              // simulate a named-method in-place write
    const snap = s.raw();         // frozen COPY of the current cache
    // The live cache must stay mutable. If raw() had frozen the live
    // `_cache` (the naive Object.freeze(this._load()) form), this throws.
    expect(() => { s._load().b = 2; }).not.toThrow();
    expect(s._load().b).toBe(2);
    // The earlier snapshot is frozen and unaffected by the later write.
    expect(Object.isFrozen(snap)).toBe(true);
    expect('b' in snap).toBe(false);
  });

  it('is a point-in-time snapshot — later writes do not appear in an earlier raw()', () => {
    const s = CachedStore('w72-snap', /** @type {Record<string, number>} */ ({}));
    s._load().a = 1;
    const r1 = s.raw();
    s._load().b = 2;
    expect('b' in r1).toBe(false);      // r1 captured before the write
    expect('b' in s.raw()).toBe(true);  // a fresh raw() sees it
  });

  it('on an array-shaped store returns a frozen array copy; live array stays mutable', () => {
    const s = CachedStore('w72-arr', /** @type {string[]} */ ([]));
    s._load().push('a');
    const r = s.raw();
    expect(Array.isArray(r)).toBe(true);
    expect(r).toEqual(['a']);
    expect(Object.isFrozen(r)).toBe(true);
    expect(() => r.push('b')).toThrow();
    expect(() => s._load().push('c')).not.toThrow();   // live cache untouched
  });

  it('on a primitive-valued store returns the value as-is (no wrapping, no throw)', () => {
    expect(CachedStore('w72-bool', false).raw()).toBe(false);
    expect(CachedStore('w72-num', 0).raw()).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   PART 4 — W7.1b versioned-migration framework (failure-safety).
   ═══════════════════════════════════════════════════════════════════
   The make-or-break: a migration that throws (or has a missing step, or
   whose commit fails) must leave the original data intact and NOT advance
   the version, so the next boot retries. On success, data + version commit
   atomically. The framework is fully dormant (zero IDB reads) at v1. */

describe('CachedStore W7.1b — versioned migration framework', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  /** Mock IDBAdapter reads: serve the data blob (key 'v') + the meta version. */
  function mockReads(dataVal, metaVal) {
    const getSpy = vi.spyOn(IDBAdapter, 'get').mockImplementation(async function (s, key) {
      if (s === 'meta') return metaVal;
      if (key === 'v') return dataVal;
      return undefined;
    });
    const putSpy = vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    return { getSpy, putSpy };
  }

  /** Cache as any[] so assertions can read migration-added fields. */
  const items = (store) => /** @type {any[]} */ (store.all());

  it('is fully dormant at schemaVersion 1 — never reads the meta version, never commits', async () => {
    const { getSpy } = mockReads([{ id: 'a', label: 'A' }], undefined);
    const commitSpy = vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w71-dormant', { idb: true });  // schemaVersion defaults to 1
    await store._hydrate();
    expect(store.all()).toEqual([{ id: 'a', label: 'A' }]);
    expect(getSpy.mock.calls.filter(([s]) => s === 'meta').length).toBe(0);  // no version read
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('runs a single v1→v2 migration and commits data + version atomically', async () => {
    mockReads([{ id: 'a', label: 'A' }], undefined);  // version absent → from 1
    const commitSpy = vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w71-v2', {
      idb: true,
      schemaVersion: 2,
      migrations: { 2: (arr) => arr.map((x) => ({ ...x, v: 2 })) },
    });
    await store._hydrate();
    expect(items(store)).toEqual([{ id: 'a', label: 'A', v: 2 }]);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    const [storeName, data, version] = commitSpy.mock.calls[0];
    expect(storeName).toBe('vot-test-w71-v2');
    expect(data).toEqual([{ id: 'a', label: 'A', v: 2 }]);
    expect(version).toBe(2);
  });

  it('runs the chain in ascending order (v1→v3)', async () => {
    mockReads([{ id: 'a', tags: [] }], undefined);
    vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w71-chain', {
      idb: true,
      schemaVersion: 3,
      migrations: {
        2: (arr) => arr.map((x) => ({ ...x, tags: [...x.tags, '2'] })),
        3: (arr) => arr.map((x) => ({ ...x, tags: [...x.tags, '3'] })),
      },
    });
    await store._hydrate();
    expect(items(store)[0].tags).toEqual(['2', '3']);  // v2 before v3
  });

  it('resumes from the persisted version (v2→v3 runs only step 3)', async () => {
    mockReads([{ id: 'a' }], 2);  // persisted version 2
    vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const step2 = vi.fn((arr) => arr);
    const store = createTestStore('vot-test-w71-resume', {
      idb: true,
      schemaVersion: 3,
      migrations: { 2: step2, 3: (arr) => arr.map((x) => ({ ...x, three: true })) },
    });
    await store._hydrate();
    expect(step2).not.toHaveBeenCalled();      // already past v2
    expect(items(store)[0].three).toBe(true);  // only step 3 ran
  });

  it('does nothing when the persisted version already equals schemaVersion', async () => {
    mockReads([{ id: 'a', label: 'A' }], 2);
    const commitSpy = vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const mig = vi.fn((arr) => arr);
    const store = createTestStore('vot-test-w71-current', { idb: true, schemaVersion: 2, migrations: { 2: mig } });
    await store._hydrate();
    expect(mig).not.toHaveBeenCalled();
    expect(commitSpy).not.toHaveBeenCalled();
    expect(store.all()).toEqual([{ id: 'a', label: 'A' }]);
  });

  // ── failure-safety (the make-or-break) ──

  it('a migration that THROWS midway leaves the original data + version intact', async () => {
    mockReads([{ id: 'a', label: 'A' }], undefined);  // from 1
    const commitSpy = vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w71-throw', {
      idb: true,
      schemaVersion: 3,
      migrations: {
        2: (arr) => arr.map((x) => ({ ...x, two: true })),
        3: () => { throw new Error('boom'); },
      },
    });
    await store._hydrate();
    // Aborted: cache is the ORIGINAL (not the v2-transformed), version NOT advanced.
    expect(store.all()).toEqual([{ id: 'a', label: 'A' }]);
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('clone isolation — a migration that mutates its input then throws cannot corrupt the data', async () => {
    mockReads([{ id: 'a', label: 'A' }], undefined);
    vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w71-clone', {
      idb: true,
      schemaVersion: 2,
      migrations: { 2: (arr) => { arr[0].label = 'CORRUPTED'; throw new Error('boom'); } },
    });
    await store._hydrate();
    // The mutation hit the CLONE; the promoted data is the pristine original.
    expect(store.all()).toEqual([{ id: 'a', label: 'A' }]);
  });

  it('a missing migration step aborts (loud) and leaves data at the old version', async () => {
    mockReads([{ id: 'a' }], undefined);  // from 1; needs steps 2 AND 3
    const commitSpy = vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const store = createTestStore('vot-test-w71-missing', {
      idb: true,
      schemaVersion: 3,
      migrations: { 3: (arr) => arr },  // step 2 missing → chain throws
    });
    await store._hydrate();
    expect(store.all()).toEqual([{ id: 'a' }]);
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('a failed atomic commit leaves the data un-migrated (retry next boot)', async () => {
    mockReads([{ id: 'a', label: 'A' }], undefined);
    const commitSpy = vi.spyOn(IDBAdapter, 'commitMigration').mockRejectedValue(new Error('quota'));
    const store = createTestStore('vot-test-w71-commitfail', {
      idb: true, schemaVersion: 2, migrations: { 2: (arr) => arr.map((x) => ({ ...x, v: 2 })) },
    });
    await store._hydrate();
    expect(commitSpy).toHaveBeenCalledTimes(1);            // attempted
    expect(store.all()).toEqual([{ id: 'a', label: 'A' }]);  // commit failed atomically → original promoted
  });

  it('stamps the version (no commit) for an empty store that trails', async () => {
    const { putSpy } = mockReads(undefined, undefined);  // no data, version absent → from 1, target 2
    const commitSpy = vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const mig = vi.fn((arr) => arr);
    const store = createTestStore('vot-test-w71-empty', { idb: true, schemaVersion: 2, migrations: { 2: mig } });
    await store._hydrate();
    expect(mig).not.toHaveBeenCalled();        // nothing to transform
    expect(commitSpy).not.toHaveBeenCalled();
    expect(store.all()).toEqual([]);           // default
    const stamp = putSpy.mock.calls.find(([s, k]) => s === 'meta' && k === 'schema:vot-test-w71-empty');
    expect(stamp).toBeTruthy();
    expect(stamp[2]).toBe(2);                   // version stamped to current
  });

  it('does not downgrade when the stored version is newer than the app', async () => {
    mockReads([{ id: 'a', label: 'A' }], 5);  // stored v5, app v2
    const commitSpy = vi.spyOn(IDBAdapter, 'commitMigration').mockResolvedValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createTestStore('vot-test-w71-newer', { idb: true, schemaVersion: 2, migrations: { 2: (arr) => arr } });
    await store._hydrate();
    expect(store.all()).toEqual([{ id: 'a', label: 'A' }]);  // used as-is, no transform
    expect(commitSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();  // warned about the newer-than-app version
  });
});

/* ═══════════════════════════════════════════════════════════════════
   U1 — whenSaved() durability barrier.
   _save() is fire-and-forget; the import path (the ONLY backup) must be
   able to wait for the actual IDB write to land before reloading, or a
   reload races the write and silently drops the just-imported data.
   These tests pin that whenSaved() is a real barrier (resolves AFTER the
   put settles), reports failure as `false` rather than throwing, and
   composes across stores the way the import barrier uses it.
   ═══════════════════════════════════════════════════════════════════ */
describe('CachedStore U1 — whenSaved() durability barrier', () => {
  beforeEach(() => { localStorage.clear?.(); _resetStoreRegistry(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('LS-mode store resolves whenSaved() true immediately (no IDB write to await)', async () => {
    const store = createTestStore('vot-test-whensaved-ls', { idb: false });
    store.add({ id: 'a', label: 'A' });
    await expect(store.whenSaved()).resolves.toBe(true);
  });

  it('never-written store resolves whenSaved() true immediately', async () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {})); // hydration never settles
    const store = createTestStore('vot-test-whensaved-nw', { idb: true });
    await expect(store.whenSaved()).resolves.toBe(true); // _lastWrite is null
  });

  it('does NOT resolve until the IDB put settles (the barrier)', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([]);
    let putSettled = false;
    let releasePut = () => {};
    const putGate = new Promise((res) => { releasePut = () => { putSettled = true; res(undefined); }; });
    vi.spyOn(IDBAdapter, 'put').mockReturnValue(putGate);
    const store = createTestStore('vot-test-whensaved-barrier', { idb: true });
    await store._hydrate();

    store.add({ id: 'b1', label: 'fresh' });
    // Write in flight — whenSaved() must still be pending.
    const PENDING = Symbol('pending');
    expect(await Promise.race([store.whenSaved(), Promise.resolve(PENDING)])).toBe(PENDING);
    expect(putSettled).toBe(false);

    releasePut();
    await expect(store.whenSaved()).resolves.toBe(true);
    expect(putSettled).toBe(true);
  });

  it('resolves FALSE (never throws) when the IDB put rejects', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([]);
    vi.spyOn(IDBAdapter, 'put').mockRejectedValue(new Error('QuotaExceededError'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createTestStore('vot-test-whensaved-fail', { idb: true });
    await store._hydrate();
    store.add({ id: 'b1', label: 'x' });
    await expect(store.whenSaved()).resolves.toBe(false);
  });

  it('import barrier: Promise.all(whenSaved) waits for EVERY store\'s put to land', async () => {
    // Mirrors _doImport: one store's write is slow; the barrier must not
    // resolve until both have durably landed.
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([]);
    let releaseSlow = (/** @type {any} */ _v) => {};
    const slowGate = new Promise((res) => { releaseSlow = res; });
    vi.spyOn(IDBAdapter, 'put').mockImplementation((key) =>
      key === 'vot-test-whensaved-slow' ? slowGate : Promise.resolve(undefined));

    const fast = createTestStore('vot-test-whensaved-fast2', { idb: true });
    const slow = createTestStore('vot-test-whensaved-slow', { idb: true });
    await fast._hydrate();
    await slow._hydrate();
    fast.add({ id: 'f', label: 'fast' });
    slow.add({ id: 's', label: 'slow' });

    const barrier = Promise.all([fast.whenSaved(), slow.whenSaved()]);
    const PENDING = Symbol('pending');
    expect(await Promise.race([barrier, Promise.resolve(PENDING)])).toBe(PENDING);

    releaseSlow(undefined);
    await expect(barrier).resolves.toEqual([true, true]);
  });
});
