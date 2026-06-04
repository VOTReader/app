/* ══════════════════════════════════════════════════════════════════════
   StateStore — vot-state IDB-backed with localStorage shim for boot
   ══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.

   Owns the persisted app-state union previously written to
   localStorage['vot-state'] by usePersistedState. Migrated to IDB
   under W2.3b so the W2.4 LS-clearing pass doesn't strip it.

   THE BOOT SCRIPT SHIM:
   index.html line 73 reads vot-state from localStorage SYNCHRONOUSLY
   before React mounts to apply the theme class (`s.theme === "light"`)
   and decide whether to disable the @font-face block
   (`s.settings.fontStyle !== "modern"`). Those two paths cannot wait
   on async IDB hydration without a FOUC.

   Solution: the W2.2 lsShim hook. Every StateStore.set() writes the
   full state to IDB AND a reduced copy to localStorage containing
   ONLY the paths the boot script reads:

     localStorage['vot-state'] = JSON.stringify({
       theme: full?.theme,
       settings: { fontStyle: full?.settings?.fontStyle,
                   fontScale: full?.settings?.fontScale },
     });

   The reduced shape is grepped from the literal boot-script code —
   do NOT expand it without first verifying a new field is actually
   read pre-React-mount. Over-inclusion wastes LS quota on data
   already in IDB; under-inclusion causes a wrong-theme flash.

   STATE SHAPE (the union usePersistedState writes):
     tabs[], activeTabIdx, theme, lastReadChapters, lastReadLetterMap,
     activeReadKey, settings, readItems

   API:
     StateStore.get()         → full state object (or {} if hydrated to empty)
     StateStore.set(fullState) → replace full state (single op for W2.2 queue)

   OP GRANULARITY: full-replacement set(). usePersistedState writes the
   entire union as one effect, so the rebase semantics are trivial —
   the queue holds at most one entry (the latest fullState), replay is
   one assignment. No need to decompose into per-field ops like
   addTab/setTheme/etc.

   LEGACY-LS FALLBACK: on first hydration after W2.3b deploys, the IDB
   store is empty. CachedStore._hydrate falls back to the legacy
   vot-state LS key (which has the FULL pre-W2.3b state, not the
   reduced shim shape), parses it, and seeds IDB. The very next
   _save() then overwrites LS with the reduced shim. User data
   survives the migration boundary; LS shape converges to the shim
   shape after one save cycle.
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/**
 * @typedef {{
 *   tabs?: any[],
 *   activeTabIdx?: number,
 *   theme?: string,
 *   lastReadChapters?: any,
 *   lastReadLetterMap?: any,
 *   activeReadKey?: string | null,
 *   settings?: any,
 *   readItems?: any,
 *   [key: string]: any
 * }} VotState
 */

/**
 * Reduce the full state to the paths the boot script reads pre-mount —
 * `s.theme`, `s.settings.fontStyle`, and `s.settings.fontScale` (WL1
 * text-size: applied to the --font-scale CSS var before React mounts so
 * larger text does not flash in at the standard size). Anything else is
 * kept in IDB only. Returning these as a stable shape (always `theme` +
 * always `settings.fontStyle` + `settings.fontScale` keys, even when
 * undefined) keeps the LS payload predictable for the boot script.
 *
 * @param {VotState | null | undefined} full
 * @returns {{ theme: string | undefined, settings: { fontStyle: string | undefined, fontScale: string | undefined } }}
 */
function _bootScriptShim(full) {
  return {
    theme: full && full.theme,
    settings: {
      fontStyle: full && full.settings && full.settings.fontStyle,
      fontScale: full && full.settings && full.settings.fontScale,
    },
  };
}

export const StateStore = extendStore(
  CachedStore('vot-state', /** @type {VotState} */ ({}), {
    idb: true,
    lsShim: _bootScriptShim,
  }),
  {
    /**
     * Full state object (HydrationGate guarantees this is the loaded
     * cache by the time any consumer calls). Returns the live cache
     * reference — mutations through it persist on the next set().
     * @returns {VotState}
     */
    get() { return /** @type {VotState} */ (this._load()); },

    /**
     * Replace the full state. usePersistedState calls this on every
     * effect tick with the latest 8-value union. The W2.2 state
     * machine handles rebase (pending → loaded) by replaying the
     * single queued set() against the IDB-loaded base — last write
     * wins, which matches the pre-W2 semantics where every effect
     * tick wrote the full LS payload.
     *
     * @param {VotState} fullState
     * @returns {void}
     */
    set(fullState) {
      if (this._shouldDefer('set', fullState)) return;
      this._cache = /** @type {any} */ (fullState);
      this._save();
      this._bump();
    },
  }
);
