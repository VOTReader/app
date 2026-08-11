/* ══════════════════════════════════════════════════════════════════════
   LibraryOrderStore — library-screen tile-order persistence
   ══════════════════════════════════════════════════════════════════════
   Mirrors HomeOrderStore. Stores the display order of the library tiles
   in IDB under key 'vot-library-order'. DB_VERSION bumped 3→4
   (idb-adapter.js) to create the object store on existing installs via
   the onupgradeneeded additive guard.

   get() is tolerant of schema change in BOTH directions, as
   HomeOrderStore now is. Growth: a saved order from before a new
   default tile shipped keeps the user's custom arrangement, with the
   new tile appended at the end. Removal: an id that has since left
   DEFAULT_ORDER — a retired tile, or a foreign id from an import
   payload — is dropped in place rather than rejecting the whole save,
   which used to discard the user's entire arrangement over one stale
   id. A schema change must never cost a user their arrangement; the
   merge still guarantees the result carries no unknown id and omits
   no real tile. Only a save that isn't an array of strings falls back
   to DEFAULT_ORDER wholesale.

   API:
     LibraryOrderStore.get()              → string[]  (merged saved, or DEFAULT)
     LibraryOrderStore.set(order)         → void
     LibraryOrderStore.DEFAULT_ORDER      → readonly string[]
   ══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/** Canonical default library-tile order. The schema-tolerant get() below
 *  means adding ids here surfaces the new tiles (appended) on existing
 *  installs, and removing one drops it from existing saves — both without
 *  disturbing a saved arrangement. */
export const DEFAULT_LIBRARY_ORDER = Object.freeze([
  'notes', 'links', 'journal', 'bookmarks', 'highlights', 'progress',
  'milestones', 'scripture-web',
]);
// 'audio' retired 2026-08-09 — the Listening Library became a HOME card;
// saved orders still carrying it simply drop the id in place.

export const LibraryOrderStore = extendStore(
  CachedStore('vot-library-order', /** @type {string[]} */ ([]), { idb: true }),
  {
    /**
     * Saved order merged against the current defaults (deduped, with
     * ids no longer in DEFAULT_LIBRARY_ORDER dropped in place and any
     * default ids the save predates appended at the end); a save that
     * isn't an array of strings falls back to DEFAULT_LIBRARY_ORDER.
     * @returns {string[]}
     */
    get() {
      const saved = this._load();
      if (!Array.isArray(saved) || !saved.every((id) => typeof id === 'string')) {
        return /** @type {string[]} */ (DEFAULT_LIBRARY_ORDER);
      }
      const seen = new Set();
      const clean = saved.filter((id) =>
        DEFAULT_LIBRARY_ORDER.includes(id) && !seen.has(id) && seen.add(id));
      const missing = DEFAULT_LIBRARY_ORDER.filter((id) => !seen.has(id));
      return /** @type {string[]} */ (clean.concat(missing));
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
