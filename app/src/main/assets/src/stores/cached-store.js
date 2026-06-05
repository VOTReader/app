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
 * STORE-1: is the Web Locks API present? The cross-tab-safe flush serializes
 * its read-merge-write through `navigator.locks`. Native on the chrome108
 * floor; if a host lacks it (very old PWA browser, or a bare test env without
 * the shim), merge stores fall back to the blob write — no crash, just the
 * pre-STORE-1 last-writer-wins on that host.
 * @returns {boolean}
 */
function _locksAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.locks && typeof navigator.locks.request === 'function';
}

/**
 * Configuration object accepted by the third arg of CachedStore().
 *
 * @typedef {{
 *   idb?: boolean,
 *   storeName?: string,
 *   lsShim?: (full: any) => any,
 *   hydrationTimeoutMs?: number,
 *   legacyLsKey?: string | null,
 *   schemaVersion?: number,
 *   migrations?: Record<number, (old: any) => any>,
 *   crossTabMerge?: (base: any, ours: any, theirs: any) => any,
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
 *   _schemaVersion: number,
 *   _migrations: Record<number, (old: any) => any>,
 *   _schemaMetaKey: string,
 *   _state: StoreState,
 *   _queue: Array<{ op: string, args: any[] }>,
 *   _replaying: boolean,
 *   _applyingPending: boolean,
 *   _hydratePromise: Promise<void> | null,
 *   _load(): T,
 *   _save(): void,
 *   _saveMerged(): void,
 *   _crossTabMerge: ((base: T | null, ours: T | null, theirs: T | null) => T) | null,
 *   _base: T | null,
 *   _baseStr: string | null,
 *   _lastWrite: Promise<any> | null,
 *   raw(): T,
 *   _version: number,
 *   _keyVersions: Record<string, number>,
 *   _crossKeyVersion: number,
 *   _listeners: Set<() => void> | null,
 *   _bump(): void,
 *   _bumpKey(key: string): void,
 *   _notifySubscribers(): void,
 *   subscribe(callback: () => void): () => void,
 *   getVersion(): number,
 *   getVersionForKey(key: string): number,
 *   isReady(): boolean,
 *   getState(): StoreState,
 *   whenSaved(): Promise<boolean>,
 *   _shouldDefer(opName: string, ...args: any[]): boolean,
 *   _migrateIfNeeded(loadedData: T | null | undefined): Promise<T | null | undefined>,
 *   _hydrate(): Promise<void>,
 *   _replayQueueOnto(): void,
 *   _rebaseAndPromote(loadedData: T | undefined | null): void,
 *   _applyToPendingCache(opName: string, args: any[]): void,
 *   _backgroundRetry(): void,
 *   _scheduleWriteRetry(): void,
 *   _clearWriteRetry(): void,
 *   _writeRetryTimer: any,
 *   _writeRetryAttempt: number,
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
  /**
   * Per-store data schema version (W7.1b). Default 1. When a store's persisted
   * data shape changes, bump this and register a transform under `migrations`
   * keyed by the NEW version. The framework is fully DORMANT while this stays
   * 1 — `_migrateIfNeeded` short-circuits before any IDB read.
   */
  const schemaVersion = (typeof opts.schemaVersion === 'number' && opts.schemaVersion >= 1) ? opts.schemaVersion : 1;
  /**
   * Migration chain: `{ <toVersion>: (oldData) => newData, ... }`. Each entry
   * is a PURE transform, run once and in ascending order during hydration when
   * the persisted version trails `schemaVersion`. See `_migrateIfNeeded`.
   */
  const migrations = (opts.migrations && typeof opts.migrations === 'object') ? opts.migrations : {};
  /**
   * STORE-1 cross-tab-safe flush strategy. When set (precious stores only),
   * `_save()` re-reads the freshly-committed IDB value and 3-way-merges the
   * local cache onto it under a per-store navigator.locks mutex, instead of
   * blind whole-cache last-writer-wins (which silently clobbers a sibling
   * tab's committed records). Signature `(base, ours, theirs) => merged`,
   * returning the store's native cache shape. Absent ⇒ today's exact blob
   * write (zero behavior change for the low-stakes stores). See store-merge.js.
   * @type {((base: any, ours: any, theirs: any) => any) | null}
   */
  const crossTabMerge = (typeof opts.crossTabMerge === 'function') ? opts.crossTabMerge : null;
  /** Meta-store key holding this store's persisted schema version. */
  const schemaMetaKey = 'schema:' + idbStoreName;
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
    _schemaVersion: schemaVersion,
    _migrations: migrations,
    _schemaMetaKey: schemaMetaKey,
    _crossTabMerge: crossTabMerge,
    /** STORE-1: the IDB snapshot this tab last synced with — the common
     *  ancestor for the 3-way cross-tab merge (set at hydrate + after each
     *  merge-flush). Null until first hydrate, and forever for non-merge
     *  stores. `_baseStr` caches its JSON for a cheap "did a sibling diverge?"
     *  check on each flush. */
    _base: /** @type {any} */ (null),
    _baseStr: /** @type {string | null} */ (null),
    _state: /** @type {StoreState} */ (useIdb ? 'pending' : 'loaded'),
    _queue: [],
    _replaying: false,
    _applyingPending: false,
    _hydratePromise: /** @type {Promise<void> | null} */ (null),
    _lastWrite: /** @type {Promise<any> | null} */ (null),
    /** STORE-4: a single pending write-retry timer + its attempt counter. A
     *  failed fire-and-forget write schedules a bounded re-flush; a success
     *  clears it. Null when no retry is pending. */
    _writeRetryTimer: /** @type {any} */ (null),
    _writeRetryAttempt: 0,

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
     *
     * STORE-1: a store with `crossTabMerge` set routes through `_saveMerged`
     * (serialized read-merge-write) instead of this blind blob write, so a
     * second PWA tab can't clobber committed records. No merge store uses
     * `lsShim`, so the merge path needs no LS branch.
     */
    _save() {
      if (this._replaying || this._applyingPending) return;
      if (useIdb) {
        if (this._crossTabMerge && _locksAvailable()) { this._saveMerged(); return; }
        const cacheToWrite = this._cache;
        if (cacheToWrite !== null) {
          // U1: keep the raw put promise so whenSaved() can await durability
          // before the import path reloads. The .catch below is a separate
          // branch for health/logging — it does NOT consume `_lastWrite`, so an
          // awaiter still observes whether the write succeeded or failed.
          const writePromise = IDBAdapter.put(idbStoreName, 'v', cacheToWrite);
          this._lastWrite = writePromise;
          const self = this;
          writePromise.then(function () {
            // STORE-4: the latest cache is durable — cancel any pending failure-retry.
            self._clearWriteRetry();
          }, function (err) {
            console.error('IDB write failed for', idbStoreName, err);
            // W7.4: bare-global (typeof) guard mirrors the StorageHealth line
            // below — cached-store deliberately holds no imports (see header).
            if (typeof DiagnosticLog !== 'undefined') DiagnosticLog.warn('store', 'IDB write failed: ' + idbStoreName + ' — ' + ((err && err.name) || err));
            if (typeof StorageHealth !== 'undefined') StorageHealth.onWriteFailure(err);
            // STORE-4: a fire-and-forget write that fails used to drop the edit
            // silently if no later mutation re-flushed it. Schedule a bounded
            // re-flush of the LATEST cache so a transient quota/abort blip recovers.
            self._scheduleWriteRetry();
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
      catch (e) {
        console.warn('localStorage write failed for', storageKey, e);
        if (typeof DiagnosticLog !== 'undefined') DiagnosticLog.warn('store', 'localStorage write failed: ' + storageKey + ' — ' + ((e && e.name) || e));
      }
    },

    /**
     * STORE-1: cross-tab-safe IDB flush for stores with a `crossTabMerge`
     * strategy. Serializes a read-merge-write under a per-store
     * navigator.locks mutex (so two PWA tabs can't interleave a
     * read-modify-write) and 3-way-merges the local cache onto the FRESHLY
     * committed IDB value (so a sibling tab's records survive instead of being
     * clobbered by this tab's stale whole-cache). `_base` is the common
     * ancestor that lets the merge tell a delete apart from a never-seen add.
     *
     * Reached only in the 'loaded' state (pending/degraded writes are queued by
     * `_shouldDefer` and never call `_save`), so `_base` is always set first by
     * `_rebaseAndPromote`. Worst case (merge throws) degrades to writing the
     * local cache — identical to the pre-STORE-1 behavior, never worse.
     */
    _saveMerged() {
      const self = this;
      const name = idbStoreName;
      const p = navigator.locks.request('vot-store:' + name, function () {
        return IDBAdapter.get(name, 'v').then(function (theirsRaw) {
          const theirs = (theirsRaw === undefined) ? null : theirsRaw;
          // ── synchronous merge + adopt: no `await` between reading `_cache`
          //    and reassigning it, so a concurrent in-place mutation of the old
          //    cache object is captured by this merge, never silently dropped.
          const ours = self._cache;
          let merged;
          let pulledRemote = false;
          try {
            merged = self._crossTabMerge(self._base, ours, theirs);
            // Did a sibling commit anything since our last sync? Compare the
            // fresh committed value to our cached base signature (free — we
            // captured `_baseStr` at the last sync). Drives the surface-bump.
            pulledRemote = (theirs !== null) && (JSON.stringify(theirs) !== self._baseStr);
          } catch (e) {
            console.warn('cross-tab merge failed for', name, '— writing local cache', e);
            merged = ours;
          }
          self._cache = /** @type {any} */ (merged);
          try { self._baseStr = JSON.stringify(merged); self._base = JSON.parse(self._baseStr); }
          catch (_e) { self._baseStr = null; self._base = /** @type {any} */ (merged); }
          // ── end synchronous section
          return IDBAdapter.put(name, 'v', merged).then(function () {
            // Surface a sibling's pulled-in records. ONLY when a sibling actually
            // diverged — the solo-tab hot path adds no extra re-render, so the
            // F1+F2 keyed-annotation optimization is preserved.
            if (pulledRemote) self._bump();
          });
        });
      });
      this._lastWrite = p;
      p.then(function () {
        self._clearWriteRetry();   // STORE-4: merged write durable — cancel any pending retry
      }, function (err) {
        console.error('IDB merged write failed for', name, err);
        if (typeof DiagnosticLog !== 'undefined') DiagnosticLog.warn('store', 'IDB merged write failed: ' + name + ' — ' + ((err && err.name) || err));
        if (typeof StorageHealth !== 'undefined') StorageHealth.onWriteFailure(err);
        self._scheduleWriteRetry();   // STORE-4: bounded re-flush on a transient failure
      });
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
    /* F1+F2: per-hlKey version map + a cross-key "generation" counter. A keyed
       getSnapshot (getVersionForKey) lets a verse re-render ONLY when ITS key
       changed, or on a whole-data op — instead of every verse re-rendering on
       any store mutation (176 re-renders on Psalm 119 → ~1). */
    _keyVersions: /** @type {Record<string, number>} */ ({}),
    _crossKeyVersion: 0,
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
      this._crossKeyVersion += 1; // F1+F2: a whole-store bump re-renders every keyed verse
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

    /* F1+F2: keyed reactivity. getVersionForKey(key) changes when key's own
       records change (via _bumpKey) OR on any whole-data op (_crossKeyVersion,
       bumped by _bump + the rebase/degraded transitions). So a verse subscribed
       to its hlKey re-renders on its own edits + bulk ops, but NOT on a single-
       key edit to a DIFFERENT verse. */
    getVersionForKey(key) { return (this._keyVersions[key] || 0) + this._crossKeyVersion; },

    /* Single-key sibling of _bump: bumps the per-key counter + the global
       _version (so whole-store getVersion() consumers still update), but NOT
       _crossKeyVersion — that omission is what isolates other keys. Respects
       _replaying like _bump (the end-of-replay _bump covers the batch). */
    _bumpKey(key) {
      if (this._replaying) return;
      this._keyVersions[key] = (this._keyVersions[key] || 0) + 1;
      this._version += 1;
      this._notifySubscribers();
    },

    /* ─── W2.2 IDB-backing API ─── */

    /** True iff the store has successfully hydrated. */
    isReady() { return this._state === 'loaded'; },

    /** Current state-machine state. */
    getState() { return this._state; },

    /**
     * Resolves `true` once this store's most recent IDB write has durably
     * landed, `false` if that write failed. localStorage-mode and a
     * never-written store both resolve `true` immediately. NEVER rejects (so a
     * stray caller can't trip an unhandled rejection). The import path awaits
     * this across every store before reloading, so a fire-and-forget `_save()`
     * can't be torn down mid-transaction and silently drop the imported data
     * (U1 — Export/Import is the only backup).
     * @returns {Promise<boolean>}
     */
    whenSaved() {
      if (!this._lastWrite) return Promise.resolve(true);
      return this._lastWrite.then(function () { return true; }, function () { return false; });
    },

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
     * Schema-migration gate (W7.1b), run during hydration BEFORE the loaded
     * blob is promoted to the live cache. Reads the store's recorded schema
     * version from `meta` (absent ⇒ 1 = oldest); if it trails the declared
     * `_schemaVersion`, runs the registered chain (`_migrations[from+1] …
     * [target]`) and commits the result.
     *
     * Failure-safe by construction:
     *   - DORMANT short-circuit: `_schemaVersion <= 1` returns immediately
     *     with NO IDB read — the framework costs nothing until a real
     *     migration is declared.
     *   - The chain runs on a deep CLONE, so a migration that mutates its
     *     input and then throws cannot corrupt the original blob.
     *   - Any throw (or a missing step) ABORTS: the original blob is returned
     *     unchanged and the version is NOT advanced, so the next boot retries.
     *     Half-migrated data is never promoted or persisted.
     *   - On success, data + new version commit in ONE atomic transaction
     *     (`IDBAdapter.commitMigration`) — never data-advanced-but-version-
     *     stale (would re-run a migration on migrated data) nor the inverse.
     *   - A version NEWER than the app's (downgrade) is left as-is + warned.
     *
     * @param {T | null | undefined} loadedData
     * @returns {Promise<T | null | undefined>} the data to promote
     */
    async _migrateIfNeeded(loadedData) {
      if (!useIdb) return loadedData;
      const target = this._schemaVersion;
      if (target <= 1) return loadedData;   // dormant — no migration possible
      let persisted;
      try { persisted = await IDBAdapter.get('meta', this._schemaMetaKey); }
      catch (e) { console.warn('schema-version read failed for', storageKey, e); return loadedData; }
      const from = (typeof persisted === 'number' && persisted >= 1) ? persisted : 1;
      if (from >= target) {
        if (from > target) {
          console.warn('store', storageKey, 'has schema v' + from + ' > app v' + target + '; using as-is (no downgrade)');
        }
        return loadedData;
      }
      // A migration is due (from < target).
      if (loadedData === undefined || loadedData === null) {
        // No data to transform — stamp the current version so a later write
        // (already in the current shape) isn't later mistaken for old data.
        try { await IDBAdapter.put('meta', this._schemaMetaKey, target); }
        catch (e) { console.warn('schema-version stamp failed for', storageKey, e); }
        return loadedData;
      }
      // Clone so a throwing/mutating migration can't corrupt the original.
      let working;
      try { working = JSON.parse(JSON.stringify(loadedData)); }
      catch (e) {
        console.warn('schema migration clone failed for', storageKey, '— keeping data at v' + from, e);
        return loadedData;
      }
      try {
        for (let v = from + 1; v <= target; v++) {
          const fn = this._migrations[v];
          if (typeof fn !== 'function') throw new Error('no migration registered for v' + v);
          working = fn(working);
        }
      } catch (e) {
        console.warn('schema migration v' + from + '->v' + target + ' failed for', storageKey, '— data left at v' + from + ', will retry next boot', e);
        return loadedData;   // original untouched; version NOT advanced
      }
      // Success — commit migrated data + new version atomically.
      try {
        await IDBAdapter.commitMigration(idbStoreName, working, target);
      } catch (e) {
        console.warn('schema migration commit failed for', storageKey, '— data left at v' + from + ', will retry next boot', e);
        return loadedData;   // atomic: neither data nor version advanced
      }
      return working;
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
            // E5: trace the degraded transition. Under the no-telemetry policy
            // the exported diagnostic log is the ONLY signal that a store's
            // hydration timed out (and is now serving copyDefault snapshots).
            if (typeof DiagnosticLog !== 'undefined') DiagnosticLog.warn('hydration', storageKey + ' degraded (hydration timed out @' + hydrationTimeoutMs + 'ms)');
            // E5: surface a low-key "storage is slow" banner via StorageHealth
            // (the banner subscribes to StorageHealth, not to the stores).
            if (typeof StorageHealth !== 'undefined') StorageHealth.setStoresDegraded(true);
            // Wake subscribers so any "Storage temporarily unavailable"
            // UI mounts. Increment _version manually + notify — _bump()
            // would semantically mean "data changed" but really only the
            // state-machine state changed (no cache write).
            self._version += 1;
            self._crossKeyVersion += 1; // F1+F2: keyed verses re-render on a degraded transition too
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
          self._migrateIfNeeded(/** @type {any} */ (loadedData)).then(function (finalData) {
            if (self._state === 'loaded') { settle(); return; }
            self._rebaseAndPromote(/** @type {any} */ (finalData));
            settle();
          }, function (err) {
            // _migrateIfNeeded resolves on all internal failures; this guards
            // an unexpected rejection — promote the un-migrated data.
            console.warn('schema migration rejected unexpectedly for', storageKey, err);
            if (self._state !== 'loaded') self._rebaseAndPromote(/** @type {any} */ (loadedData));
            settle();
          });
        }).catch(function (err) {
          clearTimeout(timeoutId);
          if (self._state === 'loaded') { settle(); return; }
          console.warn('IDB hydration failed for', storageKey, err);
          if (self._state !== 'degraded') {
            self._state = 'degraded';
            // E5: trace the degraded transition (see the timeout path above).
            if (typeof DiagnosticLog !== 'undefined') DiagnosticLog.warn('hydration', storageKey + ' degraded (IDB hydration rejected: ' + ((err && err.name) || err) + ')');
            // E5: surface the "storage is slow" banner (see the timeout path).
            if (typeof StorageHealth !== 'undefined') StorageHealth.setStoresDegraded(true);
            self._version += 1;
            self._crossKeyVersion += 1; // F1+F2: keyed verses re-render on a degraded transition too
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
      // STORE-1: snapshot the just-synced IDB state as the 3-way merge base
      // BEFORE the queue replays onto _cache (a CLONE, so replay's in-place
      // mutation of _cache can't bleed into base). For non-merge stores this
      // is a no-op. From here every flush merges its delta onto fresh IDB.
      if (this._crossTabMerge) {
        try { this._baseStr = JSON.stringify(this._cache); this._base = JSON.parse(this._baseStr); }
        catch (_e) { this._baseStr = null; this._base = null; }
      }
      this._state = 'loaded';
      // E5: this store recovered — clear the degraded banner ONLY if no other
      // store is still degraded (the setter no-ops when unchanged).
      if (typeof StorageHealth !== 'undefined') StorageHealth.setStoresDegraded(_anyStoreDegraded());
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
      this._crossKeyVersion += 1; // F1+F2: keyed verses re-render after a rebase
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
      this._base = null;          // STORE-1: clear the merge ancestor
      this._baseStr = null;
      if (this._writeRetryTimer != null) { clearTimeout(this._writeRetryTimer); this._writeRetryTimer = null; }  // STORE-4
      this._writeRetryAttempt = 0;
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
          self._migrateIfNeeded(/** @type {any} */ (loadedData)).then(function (finalData) {
            if (self._state === 'loaded') return;
            self._rebaseAndPromote(/** @type {any} */ (finalData));
          });
        }).catch(function () {
          attempt += 1;
          var idx = Math.min(attempt, self._backgroundRetryDelays.length - 1);
          if (idx < 0) return;
          setTimeout(tick, self._backgroundRetryDelays[idx]);
        });
      };
      setTimeout(tick, this._backgroundRetryDelays[0]);
    },

    /**
     * STORE-4: schedule a bounded re-flush after a failed IDB write. A
     * fire-and-forget `_save()` that rejects used to drop the edit silently
     * unless a LATER mutation happened to re-flush the whole cache; a transient
     * quota/abort blip that then cleared lost that edit. This re-runs `_save()`
     * (which re-flushes the CURRENT cache, not the failed snapshot) on the linear-
     * backoff schedule, deduped to one chain and capped at the schedule length.
     * A successful write clears it (`_clearWriteRetry`). After the cap we give up;
     * StorageHealth (READONLY tier + toast) and whenSaved() at export still report
     * a persistent failure. No-op for LS-only stores.
     */
    _scheduleWriteRetry() {
      if (!useIdb) return;
      if (this._writeRetryTimer != null) return;   // a retry chain is already pending
      const delays = this._backgroundRetryDelays;
      if (!delays.length) return;
      const attempt = this._writeRetryAttempt || 0;
      if (attempt >= delays.length) return;         // bounded — stop after the schedule
      const self = this;
      this._writeRetryTimer = setTimeout(function () {
        self._writeRetryTimer = null;
        self._writeRetryAttempt = attempt + 1;
        self._save();   // re-flush latest cache; its success/failure clears or re-schedules
      }, delays[attempt]);
    },

    /** STORE-4: a durable write cancels the pending retry + resets the counter. */
    _clearWriteRetry() {
      if (this._writeRetryTimer != null) { clearTimeout(this._writeRetryTimer); this._writeRetryTimer = null; }
      this._writeRetryAttempt = 0;
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
 * E5: true iff any registered IDB store is currently in the degraded tier.
 * Used to clear the "storage is slow" banner only once NO store remains
 * degraded (a single store recovering must not hide a still-broken one).
 *
 * @returns {boolean}
 */
function _anyStoreDegraded() {
  for (const s of _idbStoreRegistry) {
    if (s._state === 'degraded') return true;
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

   SKIP_LIST: one key stays in LS permanently:
     'vot-state'  — reduced theme+fontStyle shim for the sync boot-script
                    read at index.html:73. Cannot wait on async IDB.
   (W7.1 retired the second exception, 'vot-ann-migrated' — its only reader,
   the pre-W2 annotation bootstrap migration, was deleted, so W2.4 now
   clears the orphaned flag like any other legacy vot-* key.)
   ═══════════════════════════════════════════════════════════════════ */

/** localStorage keys NOT cleared by W2.4. Frozen + exported so tests
 *  + the Settings export path can reference the canonical list. */
export const LS_SKIP_LIST = Object.freeze(['vot-state']);

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

  // SAFETY (U19): never wipe legacy LS while any IDB store is still 'pending'.
  // The per-store legacy-LS fallback reads these vot-* keys DURING hydration to
  // migrate pre-W2.4 data into IDB — clearing them first would destroy it.
  // HydrationGate already awaits hydrateAllStores() before calling us; this
  // turns the "MUST run after hydration" comment into a real guard, so a future
  // reorder fails SAFE (defers to next boot) instead of wiping un-migrated data.
  if (hasAnyPendingStores()) {
    console.warn('clearLegacyLs: hydration still pending; deferring cleanup to next boot');
    return;
  }

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
