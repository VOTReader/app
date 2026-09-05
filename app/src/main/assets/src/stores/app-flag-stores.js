/* ══════════════════════════════════════════════════════════════════════
   AppFlagStores — small 1-byte presence flags
   ══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.

   Four booleans that previously lived as direct localStorage.setItem
   calls scattered across hooks and components (the fourth, Wave-0 P1-1,
   was born here — the AnnotationHint ✕ used to be a session-only
   window flag that re-pitched on every cold boot):

     vot-welcomed               — first-run welcome modal dismissed
     vot-about-seen             — About screen seen at least once
     vot-garden-warning-acked   — Garden View "this is fan-made" modal
                                  acknowledged
     vot-ann-hint-dismissed     — AnnotationHint coach-mark ✕ dismissed
     vot-tour-done              — "Show me around" finished, skipped, or
                                  told never to ask again (review-tutorial)

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

   The 4 stores are deliberately separate (not bundled into one
   "AppFlags" store) because the IDB schema in idb-adapter.js
   declares them as 4 separate stores, AND because the W2.2
   legacy-LS-fallback path expects one IDB store name per legacy LS
   key — bundling would require a custom fallback that reads the 3
   old LS keys and constructs the unified state. (The fourth has no
   legacy LS data — it is Wave-0-new — so its fallback simply finds
   nothing and defaults to false.)
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

/** First-run welcome modal — read by use-tabs + screen-routes. */
export const WelcomedFlagStore = buildFlagStore('vot-welcomed');

/** About screen seen — read by use-android-back, screen-routes, SettingsScreen. */
export const AboutSeenFlagStore = buildFlagStore('vot-about-seen');

/** Garden warning acknowledged — read by app.jsx + AppShellOverlays. */
export const GardenWarningFlagStore = buildFlagStore('vot-garden-warning-acked');

/** AnnotationHint coach-mark dismissed — read by AnnotationHint (bundle-d,
    via the window bridge). Wave-0 P1-1: the ✕ used to set a session-only
    window flag, so the pill re-pitched on every cold boot for anyone who
    dismissed it without ever annotating. IDB schema v7 added the store;
    no legacy LS data exists for this key. */
export const AnnHintDismissedFlagStore = buildFlagStore('vot-ann-hint-dismissed');

/** "Show me around" is done — finished, skipped, or "Don't show this again"
    on the Home strip (review-tutorial, 2026-09-04). Read by TourController
    (bundle-b) and TourPrompt (bundle-d); listed in Settings' _flagStores so a
    restored backup does not pitch the strip at a reader who already said no.
    IDB schema v11 added the store; no legacy LS data exists for this key. */
export const TourDoneFlagStore = buildFlagStore('vot-tour-done');
