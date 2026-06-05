/* ═══════════════════════════════════════════════════════════════════════
   useStorageInfo — storage estimate + persist binding for Settings
   ═══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.

   W2.7d rewire: delegates to StorageHealth.getReport() for quota, usage,
   and persisted values. This eliminates duplicate navigator.storage.estimate()
   calls — StorageHealth owns the periodic assessment, and this hook
   reactively reads from it via useSyncExternalStore.

   The returned shape is identical to the W2.5 original so SettingsScreen
   render code doesn't change.

   Returns:
     {
       status: 'loading' | 'ready' | 'unavailable',
       quota: number | null,
       usage: number | null,
       persisted: boolean | null,
       persistDenied: boolean,
       persistable: boolean,
       requestPersist: () => Promise<void>,
     }
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {{
 *   status: 'loading' | 'ready' | 'unavailable',
 *   quota: number | null,
 *   usage: number | null,
 *   persisted: boolean | null,
 *   persistDenied: boolean,
 *   persistable: boolean,
 *   requestPersist: () => Promise<void>,
 * }} StorageInfo
 */

/**
 * React hook returning the current storage-API state + a
 * requestPersist callback that the consumer fires from a click
 * handler.
 *
 * @returns {StorageInfo}
 */
export function useStorageInfo() {
  const [persistDenied, setPersistDenied] = React.useState(false);

  React.useSyncExternalStore(StorageHealth.subscribe, StorageHealth.getVersion);
  const report = StorageHealth.getReport();

  const status = report.lastAssessedAt === 0
    ? /** @type {'loading'} */ ('loading')
    : (report.quota == null && report.usage == null)
      ? /** @type {'unavailable'} */ ('unavailable')
      : /** @type {'ready'} */ ('ready');

  // "persistable" = there's a user-actionable way to secure persistence here
  // (a prompt engine like Firefox, not installed/standalone, not the APK).
  // Mirrors the not-persisted risk — the single source of truth in
  // StorageHealth — so the Settings "Protect now" button + wording stay in
  // lockstep with the banner. Read as the literal risk id because the stubbed
  // test global may not expose RISK.
  const persistable = Array.isArray(report.risks)
    && report.risks.indexOf('not-persisted') !== -1;

  const requestPersist = React.useCallback(async () => {
    var granted = await StorageHealth.requestPersistence();
    if (!granted) setPersistDenied(true);
  }, []);

  return {
    status: status,
    quota: report.quota,
    usage: report.usage,
    persisted: report.persisted,
    persistDenied: persistDenied,
    persistable: persistable,
    requestPersist: requestPersist,
  };
}
