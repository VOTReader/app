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
 * Module-private registry of IDB-backed stores. Populated automatically
 * when CachedStore() is called with opts.idb=true. Read by
 * hydrateAllStores() so App's HydrationGate can await every IDB store
 * with one Promise.allSettled.
 *
 * @type {Set<CachedStoreBase<any>>}
 */
const _idbStoreRegistry = new Set();

/**
 * Configuration object accepted by the third arg of CachedStore().
 *
 * @typedef {{
 *   idb?: boolean,
 *   storeName?: string,
 *   lsShim?: (full: any) => any,
 *   hydrationTimeoutMs?: number,
 *   legacyLsKey?: string | null,
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
 *   _defaultRef: T | null,
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
 *   _notifySubscribers(): void,
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
 *   _resetForTests(opts?: { forceLoaded?: boolean }): void,
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
 *   - `raw()` returns a shallow-FROZEN COPY of the cache (W7.2) — a
 *     point-in-time snapshot for inspection/export. Mutating it throws;
 *     the write path is the store's named methods. It is NOT the live
 *     object (freezing the live `_cache` would break in-place mutations).
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
  /**
   * Legacy localStorage key to consult on first hydration when IDB
   * returns empty. Defaults to `storageKey` (the existing LS key has
   * the same name as the new IDB store). Set to `null` to disable —
   * e.g. for stores that have no pre-W2 LS data. This is the
   * transparent per-store migration path: each IDB-backed store
   * self-migrates its previous-deploy data on first hydration so the
   * Tier commit ships safely without waiting for the explicit W2.4
   * bulk-migration step.
   */
  const legacyLsKey = (opts.legacyLsKey === null) ? null : (opts.legacyLsKey || storageKey);
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

  /** @type {CachedStoreBase<T>} */
  const inst = {
    _cache: null,
    _pendingCache: null,
    /**
     * Stable defaults reference used during pending/degraded states.
     * Lazy-allocated on first _load(); cleared by _rebaseAndPromote +
     * _resetForTests so a re-entered pending state allocates fresh.
     * @type {T | null}
     */
    _defaultRef: null,
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
        // Memoize the default reference so `useSyncExternalStore`
        // consumers don't see a fresh `[]` / `{}` per getSnapshot call.
        // Without this, a degraded-state store (hydration timeout, no
        // user writes yet → _pendingCache null) returns a new
        // reference on every render, and `Object.is` comparison in
        // useSyncExternalStore triggers an infinite re-render loop on
        // any subscribing component (reachable in production on a
        // budget device where IDB is slow enough to time out). Cleared
        // in `_rebaseAndPromote` once the real cache takes over.
        if (!this._defaultRef) this._defaultRef = /** @type {any} */ (copyDefault());
        return /** @type {T} */ (this._defaultRef);
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
            console.error('IDB write failed for', idbStoreName, err);
            if (typeof StorageHealth !== 'undefined') StorageHealth.onWriteFailure(err);
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

    /**
     * Public read accessor — returns a shallow-FROZEN COPY of the cache,
     * NOT the live object (W7.2 mutation safety). Attempting to mutate the
     * result throws a TypeError (ES modules run in strict mode), so the only
     * write path is the store's named methods (add/remove/update/set), which
     * call `_save()` + `_bump()`.
     *
     * Why a copy, not `Object.freeze(this._load())`: `_load()` returns the
     * LIVE `_cache`, and stores mutate it in place (`this._load().push(...)`,
     * etc.). Freezing it directly would freeze the working object and break
     * every subsequent mutation. Freezing a *copy* isolates the guard from
     * the live cache. Shallow only — nested objects/arrays are shared refs
     * (named methods are the write path; deep-freeze is unnecessary cost).
     * Primitive-valued stores return the value as-is.
     *
     * Cost: O(top-level keys), not O(bytes) — and raw() has no render-path
     * callers (reactive reads go through subscribe()+getVersion() + named
     * getters). Treat the result as a snapshot, not a live reactive view.
     */
    raw() {
      const d = this._load();
      if (d === null || typeof d !== 'object') return d;
      const anyD = /** @type {any} */ (d);
      const copy = Array.isArray(anyD) ? anyD.slice() : { ...anyD };
      return /** @type {T} */ (Object.freeze(copy));
    },

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
      this._notifySubscribers();
    },

    /**
     * Iterate `_listeners` with try/catch isolation. Shared by `_bump`
     * (data-change notification) and the state-transition notification
     * sites in `_hydrate` (timeout → degraded, error → degraded) and
     * `_rebaseAndPromote` (post-replay). All three sites need the
     * same "increment + iterate with isolated try/catch" sequence; this
     * helper is the single place to maintain that loop.
     *
     * Does NOT touch `_version` — the caller decides when to bump.
     * Does NOT respect `_replaying` — state-transition callers need to
     * fire notifications even when an immediately-preceding replay
     * suppressed bumps; the replaying flag is reset before they call in.
     */
    _notifySubscribers() {
      if (!this._listeners) return;
      for (const cb of this._listeners) {
        try { cb(); } catch (e) { console.warn('store subscriber threw for', storageKey, e); }
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
            // UI mounts. Increment _version manually + notify — _bump()
            // would semantically mean "data changed" but really only the
            // state-machine state changed (no cache write).
            self._version += 1;
            self._notifySubscribers();
            self._backgroundRetry();
          }
          settle();
        }, hydrationTimeoutMs);
        IDBAdapter.get(idbStoreName, 'v').then(function (loadedData) {
          clearTimeout(timeoutId);
          if (self._state === 'loaded') { settle(); return; }
          // Transparent per-store migration: if IDB is empty AND the
          // legacy LS key has data from a pre-W2 deploy, seed cache
          // from LS AND flush to IDB so subsequent boots read from
          // IDB. W2.4 will eventually clear the LS keys; until then
          // this preserves user data across the W2.3 → W2.4 deploy
          // window without a separate one-time migration step.
          if ((loadedData === undefined || loadedData === null) && legacyLsKey) {
            try {
              const lsRaw = localStorage.getItem(legacyLsKey);
              if (lsRaw) {
                const parsed = JSON.parse(lsRaw);
                IDBAdapter.put(idbStoreName, 'v', parsed).catch(function (e) {
                  console.warn('IDB legacy-LS seed failed for', storageKey, e);
                });
                loadedData = parsed;
              }
            } catch (e) { console.warn('legacy LS parse failed for', storageKey, e); }
          }
          self._rebaseAndPromote(/** @type {any} */ (loadedData));
          settle();
        }).catch(function (err) {
          clearTimeout(timeoutId);
          if (self._state === 'loaded') { settle(); return; }
          console.warn('IDB hydration failed for', storageKey, err);
          if (self._state !== 'degraded') {
            self._state = 'degraded';
            self._version += 1;
            self._notifySubscribers();
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
      this._defaultRef = null;
      this._replayQueueOnto();
      // Flush the rebased state (single batched save).
      this._save();
      // Single batched bump. _replayQueueOnto already cleared _replaying,
      // so a plain _bump() would work, but we go through the manual
      // increment + _notifySubscribers split here for symmetry with the
      // degraded-transition sites and to make the "one bump per rebase"
      // intent explicit at the call site.
      this._version += 1;
      this._notifySubscribers();
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
     * TEST-ONLY: reset the full state machine. Tests that assign
     * `_cache = null` need to also clear `_pendingCache`, `_queue`,
     * `_state`, and `_hydratePromise` — otherwise stale overlay data
     * leaks between cases. Use this helper instead of poking fields
     * directly so the reset stays consistent with future state
     * additions. Do NOT call from production code.
     *
     * @param {{ forceLoaded?: boolean }} [opts]
     *   `forceLoaded: true` skips the IDB-mode 'pending' default and
     *   sets state to 'loaded' — used by store tests that exercise
     *   LS-side fallback migration paths synchronously (e.g.
     *   link-store.test's legacy {a,b} → {source,target} cases),
     *   bypassing the async _hydrate roundtrip.
     */
    _resetForTests(opts) {
      this._cache = null;
      this._pendingCache = null;
      this._defaultRef = null;
      this._queue = [];
      this._replaying = false;
      this._applyingPending = false;
      this._hydratePromise = null;
      const forceLoaded = opts && opts.forceLoaded === true;
      this._state = (forceLoaded || !useIdb) ? 'loaded' : 'pending';
    },

    /**
     * Schedule a chain of background IDB retries while in 'degraded'
     * state. Each tick attempts `IDBAdapter.get`; on success, promotes
     * to 'loaded' via rebase. On failure, schedules the next tick from
     * `_backgroundRetryDelays`. Idempotent — bails early if already
     * loaded.
     */
    _backgroundRetry() {
      if (!this._backgroundRetryDelays.length) return;
      const self = this;
      let attempt = 0;
      const tick = function () {
        if (self._state === 'loaded') return;
        IDBAdapter.get(idbStoreName, 'v').then(function (loadedData) {
          if (self._state === 'loaded') return;
          // Same legacy-LS seed as initial hydration — every retry
          // attempt checks for pre-W2 LS data so data isn't lost if
          // the first hydration fired before IDB came up.
          if ((loadedData === undefined || loadedData === null) && legacyLsKey) {
            try {
              const lsRaw = localStorage.getItem(legacyLsKey);
              if (lsRaw) {
                const parsed = JSON.parse(lsRaw);
                IDBAdapter.put(idbStoreName, 'v', parsed).catch(function () { /* best-effort */ });
                loadedData = parsed;
              }
            } catch (_e) { /* unparseable — fall through with empty data */ }
          }
          self._rebaseAndPromote(/** @type {any} */ (loadedData));
        }).catch(function () {
          attempt += 1;
          var idx = Math.min(attempt, self._backgroundRetryDelays.length - 1);
          if (idx < 0) return;
          setTimeout(tick, self._backgroundRetryDelays[idx]);
        });
      };
      setTimeout(tick, this._backgroundRetryDelays[0]);
    },
  };
  // Auto-register IDB-backed stores so HydrationGate / hydrateAllStores
  // can await them. LS-only stores don't participate.
  if (useIdb) _idbStoreRegistry.add(inst);
  return inst;
}

/**
 * Kick off async hydration on every IDB-backed store registered to
 * date. Returns a Promise that resolves when every store has
 * transitioned to either 'loaded' or 'degraded' (i.e., its hydration
 * settled — successful or timed out into background retry).
 *
 * Uses Promise.allSettled so one degraded store doesn't block the
 * others — a store whose IDB is broken stays in degraded mode while
 * the others fully load. HydrationGate awaits this exactly once at
 * mount; the resolved promise unlocks the loading screen.
 *
 * For LS-only stores (opts.idb !== true), this is a no-op — they
 * aren't in the registry.
 *
 * @returns {Promise<void>}
 */
export function hydrateAllStores() {
  const stores = Array.from(_idbStoreRegistry);
  if (stores.length === 0) return Promise.resolve();
  return Promise.allSettled(stores.map(function (s) { return s._hydrate(); })).then(function () { /* drop the settled-result array */ });
}

/**
 * True iff at least one IDB-backed store is still in 'pending' state
 * (hydration in flight or not yet started). Useful as a sync test
 * helper / a synchronous read for components that want to skip the
 * loading screen when nothing's pending (the registry happens to be
 * empty at mount time, e.g. in test environments with no IDB stores).
 *
 * @returns {boolean}
 */
export function hasAnyPendingStores() {
  for (const s of _idbStoreRegistry) {
    if (s._state === 'pending') return true;
  }
  return false;
}

/**
 * TEST-ONLY: clear the module-private IDB-store registry. Used by
 * tests that construct fresh stores per case to avoid cross-test
 * pollution. Do NOT call from production code.
 */
export function _resetStoreRegistry() {
  _idbStoreRegistry.clear();
}

/* ═══════════════════════════════════════════════════════════════════
   W2.4 — One-time legacy localStorage cleanup
   ═══════════════════════════════════════════════════════════════════
   By the time `hydrateAllStores()` resolves, every IDB-backed store
   has self-seeded from its legacy LS key (per the W2.2 legacy-LS-
   fallback path inside `_hydrate`). The original `vot-*` LS payloads
   are now wasted quota — IDB owns the truth.

   `clearLegacyLs()` removes them on first post-W2.4 boot. It is a
   CLEANUP function, not a migration function (W2.3+W2.3b already
   did the data move). Idempotent via a flag in the meta store; safe
   to call on every boot.

   ORDERING: must run AFTER `hydrateAllStores()` resolves. The
   per-store self-seed reads the legacy LS key; clearing LS first
   would null those reads and produce empty IDB stores for pre-W2.4
   users (catastrophic — looks like a wipe).

   SKIP_LIST: two keys stay in LS permanently:
     'vot-state'         — reduced theme+fontStyle shim for the sync
                           boot-script read at index.html:73. Cannot
                           wait on async IDB.
     'vot-ann-migrated'  — legacy annotation-migration gate read at
                           annotation-store.js module load before any
                           IDB store opens.
   ═══════════════════════════════════════════════════════════════════ */

/** localStorage keys NOT cleared by W2.4. Frozen + exported so tests
 *  + the Settings export path can reference the canonical list. */
export const LS_SKIP_LIST = Object.freeze(['vot-state', 'vot-ann-migrated']);

/** Meta-store key holding the W2.4 cleanup-complete flag. */
const LS_MIGRATION_FLAG_KEY = 'migrated-v1';

/**
 * One-time legacy LS cleanup. Idempotent — checks the meta-store
 * flag; if already set, returns immediately. Otherwise iterates
 * `localStorage`, removes every `vot-*` key not in `LS_SKIP_LIST`,
 * then writes the flag.
 *
 * MUST run after `hydrateAllStores()` resolves so the per-store
 * legacy-LS-fallback path has read the LS keys it needs.
 *
 * Best-effort: any individual error (meta read, LS iteration, LS
 * removeItem, meta write) is logged but does not throw. A partial
 * cleanup is acceptable — the next boot retries because the flag
 * isn't set yet.
 *
 * @returns {Promise<void>}
 */
export async function clearLegacyLs() {
  let alreadyDone;
  try {
    alreadyDone = await IDBAdapter.get('meta', LS_MIGRATION_FLAG_KEY);
  } catch (e) {
    console.warn('clearLegacyLs: meta read failed; deferring to next boot', e);
    return;
  }
  if (alreadyDone) return;

  /** @type {string[]} */
  const toClear = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('vot-') === 0 && !LS_SKIP_LIST.includes(k)) {
        toClear.push(k);
      }
    }
  } catch (e) {
    console.warn('clearLegacyLs: LS iteration failed', e);
    return;
  }
  for (const k of toClear) {
    try { localStorage.removeItem(k); }
    catch (_e) { /* per-key non-fatal */ }
  }

  try {
    await IDBAdapter.put('meta', LS_MIGRATION_FLAG_KEY, true);
  } catch (e) {
    console.warn('clearLegacyLs: meta write failed; will retry next boot', e);
  }
}

/**
 * TEST-ONLY: clear the W2.4 cleanup flag so the next clearLegacyLs()
 * call performs the cleanup again. Used by tests to exercise both
 * the first-run and idempotent paths.
 * @returns {Promise<void>}
 */
export function _resetLegacyLsFlag() {
  return IDBAdapter.delete('meta', LS_MIGRATION_FLAG_KEY).catch(function (_e) { /* test helper — best effort */ });
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
