/* ══════════════════════════════════════════════════════════════════════
   CachedStore — shared localStorage cache factory
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   No dependencies. Loaded FIRST (every other store uses this at
   load time via `Object.assign(CachedStore(...), {...})`).

   Q4 TYPE ROOT — this is the type seed for the entire store layer. All
   11 stores extend it via Object.assign. The CachedStoreBase<T> type below
   is the canonical interface; individual stores layer their methods on
   top via Object.assign(CachedStore(...), {...}) and per-store JSDoc that
   re-binds `this` inside their methods (Q4.3 will add those per-store).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The shape returned by CachedStore(). Internal `_cache`/`_load`/`_save`
 * are exposed deliberately — stores invoke them from their methods via
 * `this._load()` / `this._save()`. The `_` prefix is convention, not
 * access modifier; treat as the load-on-first-call lazy cache contract.
 *
 * @template T
 * @typedef {{
 *   _cache: T | null,
 *   _load(): T,
 *   _save(): void,
 *   raw(): T
 * }} CachedStoreBase
 */

/**
 * Build a localStorage-backed cache for a single key. The returned object
 * is what stores compose via `Object.assign(CachedStore(key, def), {...})`
 * — see annotation-store.js, bookmark-store.js, etc. for the pattern.
 *
 * Internal invariants:
 *   - `_cache` is `null` until first `_load()` (lazy init).
 *   - `_load()` writes `_cache` then returns it; subsequent calls return
 *     the cached object directly (no re-parse).
 *   - `_save()` JSON-stringifies `_cache` and writes to localStorage;
 *     quota-exceeded errors are caught and logged, not thrown.
 *   - `raw()` is the public "give me the live cache object" accessor;
 *     mutations through it persist on the next `_save()`.
 *
 * @template T
 * @param {string} storageKey   localStorage key (e.g. 'vot-annotations')
 * @param {T} defaultVal        value used when the key is unset or unparseable
 * @returns {CachedStoreBase<T>}
 */
export function CachedStore(storageKey, defaultVal) {
  return {
    _cache: null,
    _load() {
      if (this._cache) return this._cache;
      try { this._cache = JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(defaultVal)); }
      catch (_e) { this._cache = /** @type {any} */ (typeof defaultVal === 'object' ? (Array.isArray(defaultVal) ? [] : {}) : defaultVal); }
      return /** @type {T} */ (this._cache);
    },
    _save() {
      try { localStorage.setItem(storageKey, JSON.stringify(this._cache)); } catch (e) { console.warn('localStorage write failed for', storageKey, e); }
    },
    raw() { return this._load(); }
  };
}
