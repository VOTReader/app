/* ═══════════════════════════════════════════════════════════════════════
   HydrationGate — wraps <App> at the root createRoot.render() call
   ═══════════════════════════════════════════════════════════════════════
   Renders a loading screen until every IDB-backed CachedStore has
   transitioned to either 'loaded' or 'degraded'. Once
   hydrateAllStores() resolves, the gate flips to hydrated=true and
   children render with sync, in-memory store reads — zero render-path
   jank.

   For LS-only deployments (W2.3 not yet landed in production, or all
   stores opted out of IDB), the registry is empty, hydrateAllStores()
   resolves immediately, and the loading screen flashes only as long as
   it takes one effect tick — invisible to humans.

   Loading-screen visual: centered "VOTReader" word on the theme
   background so the gate respects the boot-script's
   `body.light` class. No spinner, no progress bar; the wait is fast
   enough (single-digit-ms for Tier 1 stores, <500ms for Tier 3 budget
   devices) that visual chrome would distract more than reassure.

   This component lives in src/components/ alongside ErrorBoundary
   because it has the same role: a thin wrapper around <App> at the
   root render. Bundled into bundle-b via _entry-b.js so the
   index.html lexical-mirror script can expose it to the createRoot
   call.

   THE LATE-LOAD REMOUNT (datasafe 2026-10-05): a store slower than its
   hydration timeout (3 s) settles 'degraded', and App renders on defaults
   for it - useSavedState and every other read-once-at-mount site read
   those defaults and never look again. When such a store later loads its
   real data, the gate remounts App (a new key on the wrapper) so every one
   of them reads the real data. Recoveries landing together are coalesced
   into one remount (REMOUNT_COALESCE_MS). usePersistedState writes nothing
   from a mount that began before vot-state loaded, so the remount loses no
   saved data; what changes on screen is that the reader's own place and
   settings come back (a toast says so). What the reader did to place, tabs
   and settings in the unloaded window is not kept: it was built on defaults.
   An import cannot overlap a remount - it refuses to run until every store
   has loaded (backup-flow _applyConfirmedImport).
   ═══════════════════════════════════════════════════════════════════════ */

import { hydrateAllStores, clearLegacyLs, storesNotLoaded } from '../stores/cached-store.js';
import { JournalStore } from '../stores/journal-store.js';
import { StorageHealth } from '../utils/storage-health.js';
import { DiagnosticLog } from '../utils/diagnostic-log.js';
import { showToast } from '../utils/toast.js';
import { DataSafety } from '../utils/data-safety.js';

const { useState, useEffect } = React;

/** Stores that load within this window of each other cause one remount. */
export const REMOUNT_COALESCE_MS = 250;
/** The data-health check and daily snapshot wait this long after every store loads
 *  (utils/data-safety.js): never on the boot path. */
export const SAFETY_DELAY_MS = 5000;

/**
 * Wrap the app root. Awaits hydrateAllStores() exactly once at mount;
 * shows a centered "VOTReader" splash until the promise settles.
 *
 * @param {{ children?: import('react').ReactNode }} props
 */
export function HydrationGate({ children }) {
  const [hydrated, setHydrated] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  // The stores not loaded when the gate opened: what App's first mount read
  // defaults for. Taken at the open, not in the effect below - a store may
  // load between App's first render and that effect.
  const lateRef = React.useRef(/** @type {any[]} */ ([]));

  useEffect(() => {
    let alive = true;
    // W2.3 Tier 3 latency gate: mark hydration start + end with the
    // Performance API so preview-eval can read window.__hydrationLatencyMs
    // for verification. PLAN.txt target: <200ms mid-range, <500ms budget.
    // If the budget is exceeded in real-device testing, split hot-store
    // hydration into two waves (state+annotations first, then notes+
    // links+history after first paint) per PLAN W2.3 Tier 3.
    try { performance.mark('vot-hydration-start'); } catch (_e) { /* perf unsupported */ }
    const startMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    hydrateAllStores()
      // W2.4: legacy-LS cleanup runs AFTER hydration so the
      // per-store self-seed has already read the legacy keys.
      // Best-effort + idempotent — failures don't block render.
      .then(() => clearLegacyLs())
      // v05-01: journal marks still keyed by block position move onto block
      // ids before anything paints them. Idempotent; a failure leaves the
      // marks on their old keys for the next boot and never blocks render.
      .then(() => {
        try {
          if (typeof JournalStore !== 'undefined' && JournalStore.rekeyMarks) JournalStore.rekeyMarks();
        } catch (_e) { /* next boot */ }
      })
      .finally(() => {
        if (!alive) return;
        const endMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsed = endMs - startMs;
        /** @type {any} */ (window).__hydrationLatencyMs = elapsed;
        try {
          performance.mark('vot-hydration-end');
          performance.measure('vot-hydration', 'vot-hydration-start', 'vot-hydration-end');
        } catch (_e) { /* perf unsupported */ }
        lateRef.current = storesNotLoaded();
        setHydrated(true);
        if (typeof StorageHealth !== 'undefined') StorageHealth.start();
      });
    return () => { alive = false; };
  }, []);

  // The late-load remount (header). Armed once, when the gate opens. The
  // data-safety pass runs once every store has loaded: at the open, or after
  // the remount that follows the last late one.
  useEffect(() => {
    if (!hydrated) return undefined;
    /** @type {any} */ let safetyTimer = null;
    const scheduleSafety = () => {
      if (safetyTimer != null) clearTimeout(safetyTimer);
      safetyTimer = setTimeout(() => { safetyTimer = null; DataSafety.run(); }, SAFETY_DELAY_MS);
    };
    let waiting = lateRef.current;
    if (waiting.length === 0) {
      scheduleSafety();
      return () => { if (safetyTimer != null) clearTimeout(safetyTimer); };
    }
    /** @type {any} */ let timer = null;
    let loadedCount = 0;
    const onChange = () => {
      const still = waiting.filter((s) => s.getState() !== 'loaded');
      if (still.length === waiting.length) return;
      loadedCount += waiting.length - still.length;
      waiting = still;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (typeof DiagnosticLog !== 'undefined') DiagnosticLog.warn('hydration', 'remounted App: ' + loadedCount + ' store(s) loaded after the gate opened');
        loadedCount = 0;
        setMountKey((k) => k + 1);
        if (waiting.length === 0) scheduleSafety();
        // The remount puts the reader back where their saved data says; say why.
        showToast({ id: 'vot-toast-late-load', className: 'vot-toast', text: 'Your saved library has finished loading.', durationMs: 4000 });
      }, REMOUNT_COALESCE_MS);
    };
    const unsubs = waiting.map((s) => s.subscribe(onChange));
    onChange();   // one may have loaded before this effect ran
    return () => {
      unsubs.forEach((u) => u());
      if (timer != null) clearTimeout(timer);
      if (safetyTimer != null) clearTimeout(safetyTimer);
    };
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div className="hydration-loading" role="status" aria-live="polite">
        <div className="hydration-loading-text">VOTReader</div>
      </div>
    );
  }

  return <React.Fragment key={mountKey}>{children}</React.Fragment>;
}
