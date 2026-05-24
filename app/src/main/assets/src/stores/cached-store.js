/* ══════════════════════════════════════════════════════════════════════
   CachedStore — shared localStorage cache factory
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   No dependencies. Loaded FIRST (every other store uses this at
   load time via `Object.assign(CachedStore(...), {...})`).
   ═══════════════════════════════════════════════════════════════════════ */

/* ── CachedStore factory — shared localStorage cache/load/save ── */
export function CachedStore(storageKey, defaultVal) {
  return {
    _cache: null,
    _load() {
      if (this._cache) return this._cache;
      try { this._cache = JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(defaultVal)); }
      catch (_e) { this._cache = typeof defaultVal === 'object' ? (Array.isArray(defaultVal) ? [] : {}) : defaultVal; }
      return this._cache;
    },
    _save() {
      try { localStorage.setItem(storageKey, JSON.stringify(this._cache)); } catch (e) { console.warn('localStorage write failed for', storageKey, e); }
    },
    raw() { return this._load(); }
  };
}
