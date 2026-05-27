/* ══════════════════════════════════════════════════════════════════════
   AppFlagStores — small 1-byte presence flags
   ══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.

   Three booleans that previously lived as direct localStorage.setItem
   calls scattered across hooks and components:

     vot-welcomed               — first-run welcome modal dismissed
     vot-about-seen             — About screen seen at least once
     vot-garden-warning-acked   — Garden View "this is fan-made" modal
                                  acknowledged

   Each is IDB-backed via the W2.2 state machine so the W2.4 LS-
   clearing pass doesn't strip them out from under a hook still
   reading directly. The HydrationGate awaits these alongside every
   other IDB store at boot; reads after hydration are sync from
   in-memory cache.

   Default value is `false` (or any falsy). Legacy LS data is the
   string "1" or absent. `JSON.parse("1")` → number 1, which is
   truthy — so the `is()` predicate (which uses `!!`) handles both
   the new boolean shape AND legacy numeric/string truthies
   gracefully. New writes via `set()` use `true`.

   API:
     <Flag>Store.is()    → boolean
     <Flag>Store.set()   → void  (records the flag as truthy)
     <Flag>Store.clear() → void  (records the flag as falsy)

   The 3 stores are deliberately separate (not bundled into one
   "AppFlags" store) because the IDB schema in idb-adapter.js
   declares them as 3 separate stores, AND because the W2.2
   legacy-LS-fallback path expects one IDB store name per legacy LS
   key — bundling would require a custom fallback that reads the 3
   old LS keys and constructs the unified state.
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/**
 * Build a presence-flag store. The cache holds a primitive (boolean,
 * or legacy numeric/string truthy); `is()` normalizes via `!!`.
 *
 * @param {string} key  localStorage / IDB store name
 * @returns {{
 *   is(): boolean,
 *   set(): void,
 *   clear(): void,
 * } & import('./cached-store.js').CachedStoreBase<any>}
 */
function buildFlagStore(key) {
  return extendStore(
    CachedStore(key, /** @type {boolean} */ (false), { idb: true }),
    {
      /**
       * True iff the flag has been set (legacy "1" string from pre-W2
       * data is truthy after JSON.parse → number 1).
       */
      is() { return !!this._load(); },
      /** Record the flag as truthy. Idempotent. */
      set() {
        if (this._shouldDefer('set')) return;
        this._cache = /** @type {any} */ (true);
        this._save();
        this._bump();
      },
      /** Record the flag as falsy. Idempotent. */
      clear() {
        if (this._shouldDefer('clear')) return;
        this._cache = /** @type {any} */ (false);
        this._save();
        this._bump();
      },
    }
  );
}

/** First-run welcome modal — read by AppShellOverlays via use-app-shell-effects. */
export const WelcomedFlagStore = buildFlagStore('vot-welcomed');

/** About screen seen — read by use-app-shell-effects, use-android-back, screen-routes. */
export const AboutSeenFlagStore = buildFlagStore('vot-about-seen');

/** Garden warning acknowledged — read by app.jsx + AppShellOverlays. */
export const GardenWarningFlagStore = buildFlagStore('vot-garden-warning-acked');
