/* ═══════════════════════════════════════════════════════════════════════
   useStorageInfo — navigator.storage estimate + persist binding
   ═══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.

   Surfaces three browser-API values for W2.5's Settings → Your Data
   storage display:

     - quota / usage    (navigator.storage.estimate)
     - persisted         (navigator.storage.persisted)
     - requestPersist    (navigator.storage.persist; MUST fire from a
                          user-gesture onClick handler — Firefox
                          silently fails otherwise)

   Status field:
     'loading'      — initial; estimate() / persisted() in flight
     'ready'        — both resolved; quota/usage/persisted populated
     'unavailable'  — navigator.storage feature-undetected; show the
                      "unavailable" placeholder in the UI

   The hook reads on mount and never re-polls. W2.7's StorageHealth
   module will own the periodic re-assessment + write-failure
   integration; W2.5 is a one-shot status display.

   Returns:
     {
       status: 'loading' | 'ready' | 'unavailable',
       quota: number | null,        // raw bytes; null until ready
       usage: number | null,        // raw bytes; null until ready
       persisted: boolean | null,   // null until ready
       persistDenied: boolean,      // true after a failed persist() request
       requestPersist: () => Promise<void>,  // call from onClick
     }

   Browser-API edge cases:
     - In insecure contexts (plain HTTP without localhost),
       navigator.storage may be undefined → 'unavailable'.
     - In private/incognito modes, estimate() may resolve but
       persist() rejects or returns false — show as denied.
     - Brave actively fuzzes estimate() values for anti-fingerprinting
       — callers should display with an "approximately" caveat.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {{
 *   status: 'loading' | 'ready' | 'unavailable',
 *   quota: number | null,
 *   usage: number | null,
 *   persisted: boolean | null,
 *   persistDenied: boolean,
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
  const [state, setState] = React.useState(() => ({
    status: /** @type {'loading' | 'ready' | 'unavailable'} */ ('loading'),
    quota: /** @type {number | null} */ (null),
    usage: /** @type {number | null} */ (null),
    persisted: /** @type {boolean | null} */ (null),
    persistDenied: false,
  }));

  // Capture the storage API in a ref so requestPersist (called from
  // outside the useEffect) can detect availability without redundant
  // feature-checks. Stable across renders.
  const apiRef = React.useRef(/** @type {StorageManager | null} */ (null));

  React.useEffect(() => {
    /** @type {any} */
    const nav = (typeof navigator !== 'undefined') ? navigator : null;
    const storage = nav && nav.storage;
    if (!storage || typeof storage.estimate !== 'function') {
      setState((prev) => ({ ...prev, status: 'unavailable' }));
      return;
    }
    apiRef.current = storage;

    let cancelled = false;
    const fetchEstimate = storage.estimate();
    const fetchPersisted = (typeof storage.persisted === 'function')
      ? storage.persisted()
      : Promise.resolve(false);

    Promise.all([fetchEstimate.catch(() => null), fetchPersisted.catch(() => false)])
      .then(([estimate, persisted]) => {
        if (cancelled) return;
        const quota = estimate && typeof estimate.quota === 'number' ? estimate.quota : null;
        const usage = estimate && typeof estimate.usage === 'number' ? estimate.usage : null;
        setState((prev) => ({
          ...prev,
          status: 'ready',
          quota: quota,
          usage: usage,
          persisted: !!persisted,
        }));
      });

    return () => { cancelled = true; };
  }, []);

  /**
   * Request persistent storage. MUST be called from a user-gesture
   * onClick handler — Firefox silently fails otherwise. Updates
   * `persisted` on success or `persistDenied` on rejection.
   *
   * @returns {Promise<void>}
   */
  const requestPersist = React.useCallback(async () => {
    const storage = apiRef.current;
    if (!storage || typeof storage.persist !== 'function') {
      setState((prev) => ({ ...prev, persistDenied: true }));
      return;
    }
    try {
      const granted = await storage.persist();
      setState((prev) => ({
        ...prev,
        persisted: !!granted,
        persistDenied: !granted,
      }));
    } catch (_e) {
      setState((prev) => ({ ...prev, persistDenied: true }));
    }
  }, []);

  return {
    status: state.status,
    quota: state.quota,
    usage: state.usage,
    persisted: state.persisted,
    persistDenied: state.persistDenied,
    requestPersist: requestPersist,
  };
}
