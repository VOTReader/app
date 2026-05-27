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
   absent (collapsed default). Typical size: <10 KB across a heavy
   reader's usage.

   API:
     ProphecyCardsStore.getAll()    → Record<string, boolean>
     ProphecyCardsStore.getOne(k)   → boolean
     ProphecyCardsStore.setOne(k,v) → void
     ProphecyCardsStore.setAll(m)   → void  (whole-map replacement —
                                              the consumer batches
                                              changes via a ref then
                                              flushes once per gesture)
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
     * Boolean for one key. Defaults to false (collapsed).
     * @param {string} key
     * @returns {boolean}
     */
    getOne(key) {
      const data = this._load();
      return !!(data && data[key]);
    },

    /**
     * Set the boolean for one key. Idempotent.
     * @param {string} key
     * @param {boolean} value
     * @returns {void}
     */
    setOne(key, value) {
      if (!key) return;
      if (this._shouldDefer('setOne', key, value)) return;
      const data = this._load();
      if (value) data[key] = true;
      else delete data[key];
      this._save();
      this._bump();
    },

    /**
     * Replace the full map. Used by the consumer that batches changes
     * into a ref, then flushes via this method on commit (e.g. tap
     * commit). Filters falsy values so the persisted map stays
     * minimal.
     * @param {ProphecyCardsData | null | undefined} map
     * @returns {void}
     */
    setAll(map) {
      if (this._shouldDefer('setAll', map)) return;
      /** @type {ProphecyCardsData} */
      const next = {};
      if (map && typeof map === 'object') {
        for (const k of Object.keys(map)) {
          if (map[k]) next[k] = true;
        }
      }
      this._cache = next;
      this._save();
      this._bump();
    },
  }
);
