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
import { CachedStore, extendStore } from './cached-store.js';
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
  beforeEach(() => { localStorage.clear?.(); });

  it('idb:true store starts in pending state', () => {
    const store = createTestStore('vot-test-w22-init', { idb: true });
    expect(store.getState()).toBe('pending');
    expect(store.isReady()).toBe(false);
  });

  it('_load() during pending returns fresh defaults (empty)', () => {
    const store = createTestStore('vot-test-w22-init', { idb: true });
    expect(store.all()).toEqual([]);
  });

  it('_load() during pending returns a FRESH copy each call (not shared)', () => {
    const store = createTestStore('vot-test-w22-init', { idb: true });
    const a = store.all();
    const b = store.all();
    expect(a).not.toBe(b); // different array references
    expect(a).toEqual([]);
    expect(b).toEqual([]);
  });
});

describe('CachedStore W2.2 — happy-path hydration (pending → loaded fast)', () => {
  beforeEach(() => {
    localStorage.clear?.();
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
  beforeEach(() => { localStorage.clear?.(); vi.restoreAllMocks(); });
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
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
  beforeEach(() => { localStorage.clear?.(); vi.restoreAllMocks(); });
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
  beforeEach(() => { localStorage.clear?.(); vi.restoreAllMocks(); });
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
  beforeEach(() => { localStorage.clear?.(); vi.restoreAllMocks(); });
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
  beforeEach(() => { localStorage.clear?.(); vi.restoreAllMocks(); });
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

describe('CachedStore W2.2 — getState / isReady reflect transitions', () => {
  beforeEach(() => { localStorage.clear?.(); vi.restoreAllMocks(); });
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
