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
   ═══════════════════════════════════════════════════════════════════════ */

import { hydrateAllStores, clearLegacyLs } from '../stores/cached-store.js';

const { useState, useEffect } = React;

/**
 * Wrap the app root. Awaits hydrateAllStores() exactly once at mount;
 * shows a centered "VOTReader" splash until the promise settles.
 *
 * @param {{ children?: import('react').ReactNode }} props
 */
export function HydrationGate({ children }) {
  const [hydrated, setHydrated] = useState(false);

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
      .finally(() => {
        if (!alive) return;
        const endMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsed = endMs - startMs;
        /** @type {any} */ (window).__hydrationLatencyMs = elapsed;
        try {
          performance.mark('vot-hydration-end');
          performance.measure('vot-hydration', 'vot-hydration-start', 'vot-hydration-end');
        } catch (_e) { /* perf unsupported */ }
        setHydrated(true);
        if (typeof StorageHealth !== 'undefined') StorageHealth.start();
      });
    return () => { alive = false; };
  }, []);

  if (!hydrated) {
    return (
      <div className="hydration-loading" role="status" aria-live="polite">
        <div className="hydration-loading-text">VOTReader</div>
      </div>
    );
  }

  return children;
}
