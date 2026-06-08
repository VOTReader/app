/* ═══════════════════════════════════════════════════════════════════════
   ErrorBoundary — root-level React error boundary (JSX)
   ═══════════════════════════════════════════════════════════════════════
   Wraps <App> at the root createRoot.render() call in index.html.
   Catches any unhandled render error and shows a gold-themed
   "Something went wrong" panel with the error message + Reload button.

   E4 — crash-loop guard. The only recovery is location.reload(), but reload
   re-restores the persisted screen (use-saved-state / use-tabs), so a screen
   that crashes deterministically re-crashes after reload — an infinite loop.
   We count crashes within a short window in sessionStorage (survives reload,
   clears on tab close); on the 2nd+ crash we additionally offer "Reset to
   Home", which sets a one-shot flag that useSavedState consumes synchronously
   on the next boot to coerce the persisted screen(s) back to home. The bad
   screen lives in IDB (not the LS shim), so it can't be cleared from here
   directly — the flag is the handoff.
   ═══════════════════════════════════════════════════════════════════════ */

import { DiagnosticLog } from '../utils/diagnostic-log.js';

const CRASH_COUNT_KEY = 'vot-crash-count';
const CRASH_FIRST_MS_KEY = 'vot-crash-first-ms';
const CRASH_RECOVER_KEY = 'vot-crash-recover';
const CRASH_WINDOW_MS = 20000;

/**
 * Record this crash in sessionStorage and return the in-window crash count
 * (>= 1). A crash more than CRASH_WINDOW_MS after the first resets the window
 * so two unrelated crashes across a long session don't spuriously trip the
 * recovery affordance. Never throws — sessionStorage can be unavailable
 * (private mode / storage disabled), and the boundary is the last line of
 * defense.
 *
 * @returns {number}
 */
function _recordCrash() {
  try {
    var now = Date.now();
    var first = parseInt(sessionStorage.getItem(CRASH_FIRST_MS_KEY) || '0', 10) || 0;
    var count = parseInt(sessionStorage.getItem(CRASH_COUNT_KEY) || '0', 10) || 0;
    if (!first || now - first > CRASH_WINDOW_MS) { first = now; count = 0; }
    count += 1;
    sessionStorage.setItem(CRASH_FIRST_MS_KEY, String(first));
    sessionStorage.setItem(CRASH_COUNT_KEY, String(count));
    return count;
  } catch (_e) { return 1; }
}

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, crashCount: 0 }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(error) {
    // Count the crash (windowed) and surface the count, then log. Both are
    // wrapped so storage/logging can never break the boundary itself.
    var count = _recordCrash();
    this.setState({ crashCount: count });
    try { DiagnosticLog.error('render', String(error)); } catch (_e) { /* swallow */ }
  }
  render() {
    if (!this.state.error) return this.props.children;
    // ERR3: a consumer may opt into a custom fallback (commonly `null`). The
    // AppShell chrome boundaries (AppShellOverlays / AppShellSheets) pass
    // fallback={null} so a crashed sheet/overlay quietly vanishes + still logs
    // (componentDidCatch above) instead of replacing the WHOLE app with the
    // root "Something went wrong" panel. Omitting fallback keeps that panel —
    // correct for the screen slot + the root boundary. `!== undefined` so an
    // explicit null is honored.
    if (this.props.fallback !== undefined) return this.props.fallback;
    var looping = this.state.crashCount >= 2;
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#e0c97f", fontFamily: "Georgia, serif" }}>
        <h2 style={{ marginBottom: "1rem" }}>Something went wrong</h2>
        <p style={{ color: "#b0a080", fontSize: "0.85rem", maxWidth: "400px", margin: "0 auto 1.5rem", wordBreak: "break-word" }}>
          {String(this.state.error)}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => location.reload()}
            style={{ padding: "0.6rem 1.6rem", background: "transparent", border: "1px solid #e0c97f", color: "#e0c97f", borderRadius: "4px", cursor: "pointer", fontFamily: "inherit" }}
          >
            Reload App
          </button>
          {looping && (
            <button
              onClick={() => { try { sessionStorage.setItem(CRASH_RECOVER_KEY, '1'); } catch (_e) { /* non-fatal */ } location.reload(); }}
              style={{ padding: "0.6rem 1.6rem", background: "#e0c97f", border: "1px solid #e0c97f", color: "#1a1408", borderRadius: "4px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}
            >
              Reset to Home
            </button>
          )}
        </div>
        {looping && (
          <p style={{ color: "#8a7a55", fontSize: "0.72rem", maxWidth: "360px", margin: "1rem auto 0" }}>
            This screen keeps failing. Use Reset to Home to return to the home screen — your saved notes and data are not affected.
          </p>
        )}
      </div>
    );
  }
}
