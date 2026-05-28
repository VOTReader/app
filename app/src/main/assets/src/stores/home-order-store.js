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
   logic — "saved array must have exactly DEFAULT_ORDER.length entries
   AND every DEFAULT_ORDER id must appear in saved" — used to live in
   HomeScreen; it moves here as part of get() so the store enforces
   the schema invariant on read. If the schema ever grows a new tile,
   any stale saved order missing that tile is rejected and the
   consumer falls back to DEFAULT_ORDER.

   DEFAULT_ORDER is also re-exported so HomeScreen (the one consumer)
   doesn't keep its own copy.

   API:
     HomeOrderStore.get()        → string[]  (saved order or DEFAULT_ORDER)
     HomeOrderStore.set(order)   → void
     HomeOrderStore.DEFAULT_ORDER → readonly string[]
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/** Canonical default home-tile order. */
export const DEFAULT_HOME_ORDER = Object.freeze([
  'volumes', 'scriptures', 'studies', 'library', 'settings', 'history',
]);

export const HomeOrderStore = extendStore(
  CachedStore('vot-home-order', /** @type {string[]} */ ([]), { idb: true }),
  {
    /**
     * Saved order if it passes the schema check (exact length match +
     * every default id present); otherwise DEFAULT_HOME_ORDER. Returns
     * a defensive read — callers must not mutate the returned array.
     * @returns {string[]}
     */
    get() {
      const saved = this._load();
      if (Array.isArray(saved) &&
          saved.length === DEFAULT_HOME_ORDER.length &&
          DEFAULT_HOME_ORDER.every((id) => saved.includes(id))) {
        return /** @type {string[]} */ (saved);
      }
      return /** @type {string[]} */ (DEFAULT_HOME_ORDER);
    },

    /**
     * Replace the saved order. Empty array or schema-mismatched arrays
     * are persisted as-is — the next get() will fall back to
     * DEFAULT_HOME_ORDER until set() is called with a valid order.
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
