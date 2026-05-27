/* ══════════════════════════════════════════════════════════════════════
   CachedStore — shared cache factory (localStorage or IndexedDB)
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   No dependencies — IDBAdapter is imported on demand from inside _save()
   and _hydrate() so the cycle of "store imports adapter imports nothing"
   stays clean for esbuild.

   Q4 TYPE ROOT — this is the type seed for the entire store layer. All
   11 stores extend it via Object.assign. The CachedStoreBase<T> type below
   is the canonical interface; individual stores layer their methods on
   top via extendStore(CachedStore(...), {...}).

   W2.2 ADDITIONS — opt-in IndexedDB backing:

     CachedStore(key, defaultVal, { idb: true, storeName, lsShim,
                                    hydrationTimeoutMs })

   When opts.idb is true, the store goes through a per-store state
   machine: 'pending' → 'loaded' (hydration succeeded) OR 'degraded'
   (hydration timed out). The pending/degraded states preserve user
   writes in a separate _queue + _pendingCache; on transition to
   'loaded', the queue is REBASED on top of IDB-loaded data — current-
   session writes apply atop previous-session truth. NEVER "cache wins
   on conflict" (that's the documented data-loss vector). See
   [[w2-hydration-data-loss]] for the full rationale.

   When opts.idb is false (default), behavior is byte-identical to the
   pre-W2.2 localStorage-only implementation. ALL existing call sites
   are 2-arg `CachedStore(key, default)` — they pay zero cost from
   the W2.2 additions until W2.3 opts them in tier by tier.
   ═══════════════════════════════════════════════════════════════════════ */

import { IDBAdapter } from './idb-adapter.js';

/**
 * Configuration object accepted by the third arg of CachedStore().
 *
 * @typedef {{
 *   idb?: boolean,
 *   storeName?: string,
 *   lsShim?: (full: any) => any,
 *   hydrationTimeoutMs?: number,
 * }} CachedStoreOpts
 */

/**
 * State machine value for an IDB-backed store. LS-only stores stay at
 * 'loaded' for life.
 *
 * @typedef {'pending' | 'loaded' | 'degraded'} StoreState
 */

/**
 * The shape returned by CachedStore(). Internal `_cache`/`_load`/`_save`
 * are exposed deliberately — stores invoke them from their methods via
 * `this._load()` / `this._save()`. The `_` prefix is convention, not
 * access modifier; treat as the load-on-first-call lazy cache contract.
 *
 * Mutation signaling: each store mutation should call `this._bump()` AFTER
 * `this._save()`. `_bump` increments `_version` and notifies subscribers.
 * `subscribe(cb)` + `getVersion()` together form the React 18 reactivity
 * contract for `useSyncExternalStore`.
 *
 * W2.2 extensions: when opts.idb is true, the store gains a state
 * machine (`_state`), a write queue (`_queue`), a pending overlay
 * (`_pendingCache`), and async hydration (`_hydrate()`). Store mutation
 * methods opt in to deferred-replay semantics by gating with
 * `_shouldDefer(opName, ...args)`.
 *
 * @template T
 * @typedef {{
 *   _cache: T | null,
 *   _pendingCache: T | null,
 *   _idb: boolean,
 *   _idbStoreName: string,
 *   _idbLsShim: ((full: T | null) => any) | null,
 *   _idbHydrationTimeoutMs: number,
 *   _backgroundRetryDelays: number[],
 *   _state: StoreState,
 *   _queue: Array<{ op: string, args: any[] }>,
 *   _replaying: boolean,
 *   _applyingPending: boolean,
 *   _hydratePromise: Promise<void> | null,
 *   _load(): T,
 *   _save(): void,
 *   raw(): T,
 *   _version: number,
 *   _listeners: Set<() => void> | null,
 *   _bump(): void,
 *   subscribe(callback: () => void): () => void,
 *   getVersion(): number,
 *   isReady(): boolean,
 *   getState(): StoreState,
 *   _shouldDefer(opName: string, ...args: any[]): boolean,
 *   _hydrate(): Promise<void>,
 *   _replayQueueOnto(): void,
 *   _rebaseAndPromote(loadedData: T | undefined | null): void,
 *   _applyToPendingCache(opName: string, args: any[]): void,
 *   _backgroundRetry(): void,
 * }} CachedStoreBase
 */

/**
 * Build a cache for a single storage key. Default mode (no opts or
 * `opts.idb === false`) is localStorage-backed exactly as before.
 * Opt-in IDB mode (`opts.idb === true`) adds the W2.2 state machine.
 *
 * Internal invariants (LS mode):
 *   - `_cache` is `null` until first `_load()` (lazy init).
 *   - `_load()` writes `_cache` then returns it; subsequent calls return
 *     the cached object directly (no re-parse).
 *   - `_save()` JSON-stringifies `_cache` and writes to localStorage;
 *     quota-exceeded errors are caught and logged, not thrown.
 *   - `raw()` is the public "give me the live cache object" accessor;
 *     mutations through it persist on the next `_save()`.
 *
 * Internal invariants (IDB mode):
 *   - `_state` starts at 'pending'. Transitions to 'loaded' on
 *     successful hydration within `hydrationTimeoutMs`, or 'degraded'
 *     on timeout / IDB rejection.
 *   - During 'pending' and 'degraded': `_load()` returns a session-
 *     local overlay (`_pendingCache`) seeded by `_shouldDefer` — so the
 *     UI keeps showing user-added items even if IDB is slow.
 *   - During 'pending' and 'degraded': store mutation methods call
 *     `this._shouldDefer(opName, ...args)`. The op is recorded on
 *     `_queue` (for rebase) AND applied to `_pendingCache` (for UI).
 *   - On transition to 'loaded': `_cache = idbLoaded`; `_queue` ops
 *     replay onto `_cache` with `_save()`+`_bump()` SUPPRESSED;
 *     finally ONE `_save()` (flush rebased state) and ONE `_bump()`.
 *
 * @template T
 * @param {string} storageKey   storage key (e.g. 'vot-annotations')
 * @param {T} defaultVal        value used when the key is unset or unparseable
 * @param {CachedStoreOpts} [opts]  optional W2.2 config
 * @returns {CachedStoreBase<T>}
 */
export function CachedStore(storageKey, defaultVal, opts) {
  opts = opts || {};
  const useIdb = opts.idb === true;
  const idbStoreName = opts.storeName || storageKey;
  const lsShim = opts.lsShim || null;
  const hydrationTimeoutMs = (opts.hydrationTimeoutMs != null) ? opts.hydrationTimeoutMs : 3000;
  /** Linear-backoff schedule (ms) for background IDB retries when
   *  degraded. Exposed via `_backgroundRetryDelays` for test control. */
  const backgroundRetryDelays = [5000, 10000, 30000, 60000];

  /**
   * Fresh, mutation-safe copy of the default value. Returned from
   * `_load()` when the store has no real data yet — keeps consumers
   * from accidentally cross-contaminating defaults via shared refs.
   * @returns {T}
   */
  function copyDefault() {
    if (Array.isArray(defaultVal)) return /** @type {any} */ ([]);
    if (defaultVal !== null && typeof defaultVal === 'object') return /** @type {any} */ ({});
    return defaultVal;
  }

  return {
    _cache: null,
    _pendingCache: null,
    /** Internal mirror of useIdb so tests / consumers can ask. */
    _idb: useIdb,
    _idbStoreName: idbStoreName,
    _idbLsShim: lsShim,
    _idbHydrationTimeoutMs: hydrationTimeoutMs,
    _backgroundRetryDelays: backgroundRetryDelays,
    _state: /** @type {StoreState} */ (useIdb ? 'pending' : 'loaded'),
    _queue: [],
    _replaying: false,
    _applyingPending: false,
    _hydratePromise: /** @type {Promise<void> | null} */ (null),

    /**
     * Sync read. LS-mode: lazy init from localStorage. IDB-mode loaded:
     * return `_cache`. IDB-mode pending/degraded: return `_pendingCache`
     * if populated (so UI shows current-session writes even while IDB
     * is slow), else a fresh defaults copy.
     */
    _load() {
      if (this._cache !== null) return this._cache;
      if (useIdb && this._state !== 'loaded') {
        // Pending or degraded — surface the queue overlay if any.
        if (this._pendingCache !== null) return /** @type {T} */ (this._pendingCache);
        return /** @type {T} */ (copyDefault());
      }
      try { this._cache = JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(defaultVal)); }
      catch (_e) { this._cache = /** @type {any} */ (copyDefault()); }
      return /** @type {T} */ (this._cache);
    },

    /**
     * Persist the current cache. LS-mode: write JSON to localStorage.
     * IDB-mode: write to IDB (async, fire-and-forget; QuotaExceededError
     * is logged but not thrown — W2.7 will route to StorageHealth). If
     * `lsShim` is configured (vot-state), also writes a reduced copy to
     * localStorage for the synchronous boot-script read at index.html.
     *
     * Suppressed during `_replaying` (batched single flush at end of
     * replay) and during `_applyingPending` (pending-mode writes are
     * not durable until the eventual rebase).
     */
    _save() {
      if (this._replaying || this._applyingPending) return;
      if (useIdb) {
        const cacheToWrite = this._cache;
        if (cacheToWrite !== null) {
          IDBAdapter.put(idbStoreName, 'v', cacheToWrite).catch(function (err) {
            // W2.7 will replace this with StorageHealth.onWriteFailure.
            console.warn('IDB write failed for', storageKey, err);
          });
        }
        if (lsShim) {
          try {
            const reduced = lsShim(cacheToWrite);
            localStorage.setItem(storageKey, JSON.stringify(reduced));
          } catch (e) { console.warn('LS shim write failed for', storageKey, e); }
        }
        return;
      }
      try { localStorage.setItem(storageKey, JSON.stringify(this._cache)); }
      catch (e) { console.warn('localStorage write failed for', storageKey, e); }
    },

    raw() { return this._load(); },

    /* ─── React 18 reactivity contract (subscribe + getSnapshot) ─── */
    _version: 0,
    _listeners: /** @type {Set<() => void> | null} */ (null),

    /**
     * Increment version + notify all subscribers. Suppressed during
     * `_replaying` (the single end-of-replay `_bump` covers the batch).
     * Fires during `_applyingPending` so the UI updates immediately
     * when a user adds a bookmark / note / etc during pending or
     * degraded states.
     */
    _bump() {
      if (this._replaying) return;
      this._version += 1;
      if (this._listeners) {
        for (const cb of this._listeners) {
          try { cb(); } catch (e) { console.warn('store subscriber threw for', storageKey, e); }
        }
      }
    },

    subscribe(callback) {
      if (!this._listeners) this._listeners = new Set();
      this._listeners.add(callback);
      return () => { if (this._listeners) this._listeners.delete(callback); };
    },

    getVersion() { return this._version; },

    /* ─── W2.2 IDB-backing API ─── */

    /** True iff the store has successfully hydrated. */
    isReady() { return this._state === 'loaded'; },

    /** Current state-machine state. */
    getState() { return this._state; },

    /**
     * Deferred-write guard called by mutation methods as their first
     * line in IDB-backed stores:
     *
     *   add(item) {
     *     if (this._shouldDefer('add', item)) return;
     *     this._load().push(item); this._save(); this._bump();
     *   }
     *
     * Returns `true` when the op is queued (caller exits early).
     * Returns `false` when the caller should proceed normally
     * (LS-mode, loaded state, or already inside a replay / pending
     * application).
     *
     * Side effect when returning true: pushes onto `_queue` (for
     * future rebase) AND applies the op to `_pendingCache` (for
     * UI continuity).
     */
    _shouldDefer(opName, ...args) {
      // Never defer in LS-only mode.
      if (!useIdb) return false;
      // While replaying queued ops or already applying a pending op
      // (recursive re-entry from _applyToPendingCache), pass through.
      if (this._replaying || this._applyingPending) return false;
      // Loaded state: normal write-through.
      if (this._state === 'loaded') return false;
      // Pending or degraded: queue + apply to overlay.
      this._queue.push({ op: opName, args: args });
      this._applyToPendingCache(opName, args);
      return true;
    },

    /**
     * Apply an op to `_pendingCache` by re-invoking the store's own
     * method with the swap trick: temporarily point `_cache` at
     * `_pendingCache` so the method's normal `this._load()` /
     * `this._cache = ...` semantics work, then restore. `_save()` is
     * suppressed during this (pending writes aren't durable until
     * rebase) but `_bump()` fires so subscribers re-render with the
     * overlay.
     */
    _applyToPendingCache(opName, args) {
      const method = /** @type {any} */ (this)[opName];
      if (typeof method !== 'function') return;
      if (this._pendingCache === null) this._pendingCache = /** @type {any} */ (copyDefault());
      const savedCache = this._cache;
      this._cache = this._pendingCache;
      this._applyingPending = true;
      try {
        method.apply(this, args);
      } catch (e) {
        console.warn('pending-overlay apply failed for', storageKey, opName, e);
      } finally {
        // Capture any reassignment of _cache from inside the method
        // (e.g. `this._cache = filtered` in remove() patterns).
        this._pendingCache = this._cache;
        this._cache = savedCache;
        this._applyingPending = false;
      }
    },

    /**
     * Begin async hydration. Idempotent — returns the same in-flight
     * promise if already running. Resolves when state transitions to
     * 'loaded' or 'degraded'. No-op for LS-only stores (resolves
     * immediately).
     *
     * Times out per `hydrationTimeoutMs` (default 3000ms). On timeout,
     * state transitions to 'degraded' and a background retry chain
     * kicks off; the original IDB request continues, and whichever
     * succeeds first promotes the store back to 'loaded'.
     */
    _hydrate() {
      if (!useIdb) return Promise.resolve();
      if (this._hydratePromise) return this._hydratePromise;
      const self = this;
      this._hydratePromise = new Promise(function (resolve) {
        let settled = false;
        const settle = function () {
          if (settled) return;
          settled = true;
          resolve();
        };
        // Race: IDB.get vs hydration timeout.
        const timeoutId = setTimeout(function () {
          if (settled) return;
          if (self._state !== 'loaded') {
            self._state = 'degraded';
            // Wake subscribers so any "Storage temporarily unavailable"
            // UI mounts. Force a synthetic bump (not via _bump because
            // there's no cache write — just a state-machine event).
            self._version += 1;
            if (self._listeners) {
              for (const cb of self._listeners) {
                try { cb(); } catch (e) { console.warn('subscriber threw on degraded transition for', storageKey, e); }
              }
            }
            self._backgroundRetry();
          }
          settle();
        }, hydrationTimeoutMs);
        IDBAdapter.get(idbStoreName, 'v').then(function (loadedData) {
          clearTimeout(timeoutId);
          if (self._state === 'loaded') { settle(); return; }
          self._rebaseAndPromote(/** @type {any} */ (loadedData));
          settle();
        }).catch(function (err) {
          clearTimeout(timeoutId);
          if (self._state === 'loaded') { settle(); return; }
          console.warn('IDB hydration failed for', storageKey, err);
          if (self._state !== 'degraded') {
            self._state = 'degraded';
            self._version += 1;
            if (self._listeners) {
              for (const cb of self._listeners) {
                try { cb(); } catch (e) { console.warn('subscriber threw on degraded transition for', storageKey, e); }
              }
            }
            self._backgroundRetry();
          }
          settle();
        });
      });
      return this._hydratePromise;
    },

    /**
     * Promote from any pre-loaded state to 'loaded' by rebasing the
     * queue on top of `loadedData` (the IDB snapshot). Discards
     * `_pendingCache` because the real cache is now authoritative.
     */
    _rebaseAndPromote(loadedData) {
      this._cache = /** @type {any} */ ((loadedData !== undefined && loadedData !== null) ? loadedData : copyDefault());
      this._state = 'loaded';
      this._pendingCache = null;
      this._replayQueueOnto();
      // Flush the rebased state (single batched save).
      this._save();
      // Single batched bump.
      this._version += 1;
      if (this._listeners) {
        for (const cb of this._listeners) {
          try { cb(); } catch (e) { console.warn('store subscriber threw for', storageKey, e); }
        }
      }
    },

    /**
     * Replay every queued op on top of `_cache`. `_save()` and
     * `_bump()` are suppressed during the loop (via `_replaying`); the
     * caller is responsible for the single end-of-replay save + bump.
     */
    _replayQueueOnto() {
      const queue = this._queue;
      this._queue = [];
      this._replaying = true;
      try {
        for (const entry of queue) {
          const method = /** @type {any} */ (this)[entry.op];
          if (typeof method !== 'function') {
            console.warn('no replay handler for op', entry.op, 'in store', storageKey);
            continue;
          }
          try { method.apply(this, entry.args); }
          catch (e) { console.warn('replay handler failed for', storageKey, entry.op, e); }
        }
      } finally {
        this._replaying = false;
      }
    },

    /**
     * Schedule a chain of background IDB retries while in 'degraded'
     * state. Each tick attempts `IDBAdapter.get`; on success, promotes
     * to 'loaded' via rebase. On failure, schedules the next tick from
     * `_backgroundRetryDelays`. Idempotent — bails early if already
     * loaded.
     */
    _backgroundRetry() {
      const self = this;
      let attempt = 0;
      const tick = function () {
        if (self._state === 'loaded') return;
        IDBAdapter.get(idbStoreName, 'v').then(function (loadedData) {
          if (self._state === 'loaded') return;
          self._rebaseAndPromote(/** @type {any} */ (loadedData));
        }).catch(function () {
          attempt += 1;
          const delay = self._backgroundRetryDelays[Math.min(attempt, self._backgroundRetryDelays.length - 1)];
          setTimeout(tick, delay);
        });
      };
      setTimeout(tick, this._backgroundRetryDelays[0]);
    },
  };
}

/**
 * Compose a CachedStore base with store-specific methods. Identical at
 * runtime to `Object.assign(base, methods)` — the only purpose is to give
 * TypeScript a `ThisType<B & M>` annotation so `this` inside the methods
 * literal correctly resolves to BOTH the base (with `_load`/`_save`/`_cache`)
 * AND the sibling methods. Without this helper, plain `Object.assign` loses
 * the base type through TS's narrow inference of object-literal methods.
 *
 * All 11 stores import + use this instead of `Object.assign`.
 *
 * @template B, M
 * @param {B} base
 * @param {M & ThisType<B & M>} methods
 * @returns {B & M}
 */
export function extendStore(base, methods) {
  return /** @type {B & M} */ (Object.assign(/** @type {any} */ (base), methods));
}
