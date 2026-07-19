/* ═══════════════════════════════════════════════════════════════
   GARDEN POSITION STORE — durable "last Garden page" memory
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore.

   Why this exists (owner-reported 2026-07-18): the Garden page lived
   ONLY as per-tab state inside the debounced vot-state flush. On
   Android a background kill can arrive before that flush (pagehide is
   NOT guaranteed — the same failure the J1 journal fix closed), and a
   Garden opened in a NEW tab starts at the DEFAULT_TAB page 1 — both
   read as "I lost my place overnight". This store write-throughs to
   IDB on EVERY page turn (CachedStore _save is immediate, not
   debounced), and GardenView self-heals from it when it mounts on the
   default page 1.

   Semantics: lastPage is wherever the user last WAS — including a
   deliberate return to page 1 (that write makes the memory agree, so
   the heal never fights an intentional navigation).
═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/** @typedef {{ lastPage: number }} GardenPosData */

export var GardenPosStore = extendStore(
  CachedStore('vot-garden-pos', /** @type {GardenPosData} */ ({ lastPage: 0 }), { idb: true }),
  {
    /**
     * The last Garden page the user was on, or 0 when never recorded.
     * @returns {number}
     */
    get() { return Number(this._load().lastPage) || 0; },

    /**
     * Record the current Garden page. Equality-guarded (a re-record of
     * the same page is a no-op — no write, no version bump).
     * @param {number} page
     * @returns {void}
     */
    set(page) {
      if (this._shouldDefer('set', page)) return;
      var p = Number(page) || 0;
      if (p < 1) return;
      var data = this._load();
      if (data.lastPage === p) return;
      data.lastPage = p;
      this._save();
      this._bump();
    },

    /**
     * Replace wholesale (import path). Defaults missing fields.
     * @param {Partial<GardenPosData> | null | undefined} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      var d = (data && typeof data === 'object' && !Array.isArray(data)) ? data : /** @type {any} */ ({});
      this._cache = /** @type {any} */ ({ lastPage: Number(d.lastPage) || 0 });
      this._save();
      this._bump();
    }
  }
);
