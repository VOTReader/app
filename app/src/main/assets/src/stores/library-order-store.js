/* ══════════════════════════════════════════════════════════════════════
   LibraryOrderStore — library-screen tile-order persistence
   ══════════════════════════════════════════════════════════════════════
   Mirrors HomeOrderStore. Stores the display order of the library tiles
   in IDB under key 'vot-library-order'. DB_VERSION bumped 3→4
   (idb-adapter.js) to create the object store on existing installs via
   the onupgradeneeded additive guard.

   Unlike HomeOrderStore's strict exact-length check, get() here is
   growth-tolerant: a saved order from before a new default tile shipped
   keeps the user's custom arrangement, with the new tile appended at
   the end. Foreign ids still reject the whole save (schema safety).

   API:
     LibraryOrderStore.get()              → string[]  (saved or DEFAULT)
     LibraryOrderStore.set(order)         → void
     LibraryOrderStore.DEFAULT_ORDER      → readonly string[]
   ══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/** Canonical default library-tile order. Growth-tolerant get() below means
 *  adding ids here surfaces the new tiles (appended) on existing installs
 *  without disturbing a saved arrangement. */
export const DEFAULT_LIBRARY_ORDER = Object.freeze([
  'notes', 'links', 'journal', 'bookmarks', 'highlights', 'progress',
  'audio', 'milestones',
]);

export const LibraryOrderStore = extendStore(
  CachedStore('vot-library-order', /** @type {string[]} */ ([]), { idb: true }),
  {
    /**
     * Saved order when every saved id is a known tile id (deduped, with
     * any default ids the save predates appended at the end); otherwise
     * DEFAULT_LIBRARY_ORDER.
     * @returns {string[]}
     */
    get() {
      const saved = this._load();
      if (Array.isArray(saved) && saved.length > 0 &&
          saved.every((id) => DEFAULT_LIBRARY_ORDER.includes(id))) {
        const seen = new Set();
        const clean = saved.filter((id) => !seen.has(id) && seen.add(id));
        const missing = DEFAULT_LIBRARY_ORDER.filter((id) => !seen.has(id));
        return /** @type {string[]} */ (clean.concat(missing));
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
