/* ══════════════════════════════════════════════════════════════════════
   LibraryOrderStore — library-screen tile-order persistence
   ══════════════════════════════════════════════════════════════════════
   Mirrors HomeOrderStore. Stores the display order of the 5 library
   tiles in IDB under key 'vot-library-order'. DB_VERSION bumped 3→4
   (idb-adapter.js) to create the object store on existing installs via
   the onupgradeneeded additive guard.

   API:
     LibraryOrderStore.get()              → string[]  (saved or DEFAULT)
     LibraryOrderStore.set(order)         → void
     LibraryOrderStore.DEFAULT_ORDER      → readonly string[]
   ══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/** Canonical default library-tile order. */
export const DEFAULT_LIBRARY_ORDER = Object.freeze([
  'notes', 'links', 'journal', 'bookmarks', 'highlights',
]);

export const LibraryOrderStore = extendStore(
  CachedStore('vot-library-order', /** @type {string[]} */ ([]), { idb: true }),
  {
    /**
     * Saved order if it passes the schema check (exact length match +
     * every default id present); otherwise DEFAULT_LIBRARY_ORDER.
     * @returns {string[]}
     */
    get() {
      const saved = this._load();
      if (Array.isArray(saved) &&
          saved.length === DEFAULT_LIBRARY_ORDER.length &&
          DEFAULT_LIBRARY_ORDER.every((id) => saved.includes(id))) {
        return /** @type {string[]} */ (saved);
      }
      return /** @type {string[]} */ (DEFAULT_LIBRARY_ORDER);
    },

    /**
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
