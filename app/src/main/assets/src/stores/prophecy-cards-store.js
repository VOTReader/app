/* ══════════════════════════════════════════════════════════════════════
   ProphecyCardsStore — prophecy card expand/collapse state
   ══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.

   Previously lived as direct localStorage access in
   use-reading-position-nav.js (a useRef-cached object map + a
   saveProphecyCardStates helper). Migrated to IDB-backed CachedStore
   so the W2.4 LS-clearing pass doesn't strip it.

   Data shape: `Record<string, boolean>` where the key is
   "chapterId:blockIndex:cardType" and the value is true (expanded) or
   false (collapsed by hand). Absent = expanded: ProphecyCard opens a
   card with nothing saved, so a collapse must be kept as `false`
   (W2.3b.1 dropped it, and every closed card reopened after a reload).
   Typical size: <10 KB across a heavy reader's usage.

   API:
     ProphecyCardsStore.getAll()    → Record<string, boolean>
     ProphecyCardsStore.getOne(k)   → boolean
     ProphecyCardsStore.setOne(k,v) → void
     ProphecyCardsStore.setAll(m)   → void  (whole-map replacement —
                                              the consumer batches
                                              changes via a ref then
                                              flushes once per gesture;
                                              keeps true and false)
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/** @typedef {Record<string, boolean>} ProphecyCardsData */

export const ProphecyCardsStore = extendStore(
  CachedStore('vot-prophecy-cards', /** @type {ProphecyCardsData} */ ({}), { idb: true }),
  {
    /**
     * Full state map (defensive copy — callers may mutate without
     * affecting the cache; flush via setAll when done).
     * @returns {ProphecyCardsData}
     */
    getAll() {
      const data = this._load();
      return Object.assign(/** @type {ProphecyCardsData} */ ({}), data || {});
    },

    /**
     * True when the card is saved expanded; false when saved collapsed or
     * not saved (a card with nothing saved opens: read getAll for that).
     * @param {string} key
     * @returns {boolean}
     */
    getOne(key) {
      const data = this._load();
      return !!(data && data[key]);
    },

    /**
     * Set the boolean for one key (false keeps the card collapsed); any
     * other falsy value forgets it (back to expanded). Idempotent.
     * @param {string} key
     * @param {boolean} value
     * @returns {void}
     */
    setOne(key, value) {
      if (!key) return;
      if (this._shouldDefer('setOne', key, value)) return;
      const data = this._load();
      if (value === false) data[key] = false;
      else if (value) data[key] = true;
      else delete data[key];
      this._save();
      this._bump();
    },

    /**
     * Replace the full map. Used by the consumer that batches changes
     * into a ref, then flushes via this method on commit (e.g. tap
     * commit), and by backup restore. Keeps false (collapsed) and
     * true (any truthy value); drops the other falsy values.
     * @param {ProphecyCardsData | null | undefined} map
     * @returns {void}
     */
    setAll(map) {
      if (this._shouldDefer('setAll', map)) return;
      /** @type {ProphecyCardsData} */
      const next = {};
      if (map && typeof map === 'object') {
        for (const k of Object.keys(map)) {
          if (map[k] === false) next[k] = false;
          else if (map[k]) next[k] = true;
        }
      }
      this._cache = next;
      this._save();
      this._bump();
    },
  }
);
