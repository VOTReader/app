/* ═══════════════════════════════════════════════════════════════════════
   useStoreVersion — re-render when a store changes (v15-code-health-08).
   Stateless; any bundle may import it.
   ═══════════════════════════════════════════════════════════════════════

   Every store here speaks the same two-method protocol: subscribe(cb) returns
   an unsubscribe, getVersion() returns a number that moves on every change.
   The app had 85 hand-rolled React.useSyncExternalStore pairs over it and two
   private, identical copies of this hook (LibraryScreen, MilestonesScreen).
   This is the one copy; call sites move to it as they are touched. */

/**
 * Subscribe to a store's version. An absent store, or one missing either
 * method, is inert: version 0, no subscription.
 * @param {any} store
 * @returns {number}
 */
export function useStoreVersion(store) {
  return React.useSyncExternalStore(
    React.useCallback((cb) => ((store && typeof store.subscribe === 'function') ? store.subscribe(cb) : () => {}), [store]),
    () => ((store && typeof store.getVersion === 'function') ? store.getVersion() : 0),
  );
}

/**
 * The same, for a cross-bundle store reached by its window name (the store
 * may belong to a bundle that has not loaded; then it is inert until it has).
 * @param {string} name
 * @returns {number}
 */
export function useStoreVersionByName(name) {
  return useStoreVersion(/** @type {any} */ (globalThis)[name]);
}
