/* ═══════════════════════════════════════════════════════════════════════
   shared-state — one state object per name, shared by every bundled copy
   ═══════════════════════════════════════════════════════════════════════
   Bundles b and d are built from separate esbuild entries, so a module both
   import is bundled twice, and each copy gets its own module-scope variables.
   For a module that holds state, two copies are two states: a flag set in d
   that only b reads, a toast stack each copy keeps blind to the other's
   (audit 2026-11-23 item 15: arch-1, bundles-n1, bundles-n2).

   A module that holds state and is bundled into more than one bundle keeps
   that state here instead: the first copy to load makes it, later copies get
   the same object. tools/check-bundle-state.js refuses a module that holds
   state at module scope and lands in two bundles.

   Bridge: window.__votShared (BRIDGES.md §14). Stateless itself.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The state object kept under `name`, made by `make` the first time any copy asks.
 * @template T
 * @param {string} name   one name per module (its file name is a good one)
 * @param {() => T} make  builds the initial state; runs once per page
 * @returns {T}
 */
export function sharedState(name, make) {
  const g = /** @type {any} */ (typeof window !== 'undefined' ? window : globalThis);
  const all = g.__votShared || (g.__votShared = Object.create(null));
  if (!(name in all)) all[name] = make();
  return all[name];
}
