/* ══════════════════════════════════════════════════════════════════════
   HomeOrderStore — home-screen tile-order persistence
   ══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.

   Previously lived as direct localStorage access in HomeScreen.jsx:
     read:  JSON.parse(localStorage.getItem("vot-home-order") || "null")
     write: localStorage.setItem("vot-home-order", JSON.stringify(newOrder))

   That key was missed in the original W2.3b key inventory — W2.4's
   LS-clearing pass would silently wipe the user's customized tile
   ordering. Migrated to IDB here under W2.3b.4 alongside the other
   small persistence keys. Requires IDBAdapter DB_VERSION bump 1 → 2
   so existing installs get the new object store via
   onupgradeneeded.

   Shape: string[] (6 home-tile ids in display order). The validation
   logic used to live in HomeScreen and demanded an exact match —
   "saved array must have exactly DEFAULT_ORDER.length entries AND
   every DEFAULT_ORDER id must appear in saved" — which meant one
   schema move cost every user their hand-arranged home screen. get()
   now MERGES against the current defaults instead, in both
   directions: ids no longer in DEFAULT_ORDER (a retired tile, or a
   foreign id from an import payload) are dropped in place, and every
   default id the save is missing (a tile that shipped after the save)
   is appended at the end in default order. The result can never carry
   an unknown id or omit a real tile — the invariant the strict check
   was guarding — while the user's arrangement survives the schema
   change. Only a value that isn't an array of strings is untrustworthy
   enough to fall back to DEFAULT_ORDER wholesale.

   DEFAULT_ORDER is also re-exported so HomeScreen (the one consumer)
   doesn't keep its own copy.

   API:
     HomeOrderStore.get()        → string[]  (merged saved order, or DEFAULT_ORDER)
     HomeOrderStore.set(order)   → void
     HomeOrderStore.DEFAULT_ORDER → readonly string[]
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/** Canonical default home-tile order. 'listening' joined 2026-08-09 (the
 *  Listening Library moved home from the Library + Volumes entry points);
 *  existing saved orders keep their arrangement and gain it at the end. */
export const DEFAULT_HOME_ORDER = Object.freeze([
  'volumes', 'scriptures', 'studies', 'listening', 'library', 'settings', 'history',
]);

export const HomeOrderStore = extendStore(
  CachedStore('vot-home-order', /** @type {string[]} */ ([]), { idb: true }),
  {
    /**
     * Saved order merged against the current defaults (deduped, with
     * ids no longer in DEFAULT_HOME_ORDER dropped in place and any
     * default ids the save predates appended at the end); a save that
     * isn't an array of strings falls back to DEFAULT_HOME_ORDER.
     * Returns a defensive read — callers must not mutate the returned
     * array.
     * @returns {string[]}
     */
    get() {
      const saved = this._load();
      if (!Array.isArray(saved) || !saved.every((id) => typeof id === 'string')) {
        return /** @type {string[]} */ (DEFAULT_HOME_ORDER);
      }
      const seen = new Set();
      const clean = saved.filter((id) =>
        DEFAULT_HOME_ORDER.includes(id) && !seen.has(id) && seen.add(id));
      const missing = DEFAULT_HOME_ORDER.filter((id) => !seen.has(id));
      return /** @type {string[]} */ (clean.concat(missing));
    },

    /**
     * Replace the saved order. Empty or partial arrays are persisted
     * as-is — the next get() merges them against DEFAULT_HOME_ORDER
     * rather than rejecting them.
     * @param {string[]} order
     * @returns {void}
     */
    set(order) {
      if (this._shouldDefer('set', order)) return;
      this._cache = Array.isArray(order) ? order.slice() : [];
      this._save();
      this._bump();
    },
  }
);
