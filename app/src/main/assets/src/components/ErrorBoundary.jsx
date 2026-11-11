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
  constructor(props) { super(props); this.state = { error: null, crashCount: 0, caught: false, caughtKey: undefined }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  // A boundary that must come back is handed a resetKey: an error caught under
  // one key is dropped once the key moves on, and the children render again.
  // The AppShell chrome's boundaries (fallback={null}) never reset before, so one
  // crashed sheet took the selection toolbar and every other sheet with it until
  // a restart (v15-01). The key is noted on the render that catches, so a key
  // that changed in the crashing render itself does not retry it at once. No
  // resetKey (the root and screen boundaries): never resets, as before.
  static getDerivedStateFromProps(props, state) {
    if (!state.error) return null;
    if (!state.caught) return { caught: true, caughtKey: props.resetKey };
    return props.resetKey !== state.caughtKey ? { error: null, caught: false, caughtKey: undefined } : null;
  }
  componentDidCatch(error) {
    // Count the crash (windowed) and surface the count, then log. Both are
    // wrapped so storage/logging can never break the boundary itself. Only a
    // boundary that draws the full panel counts (sweep mw12): the count is one
    // sessionStorage slot, and a quiet chrome crash (fallback given) followed by
    // a first screen crash read as "This screen keeps failing".
    if (this.props.fallback === undefined) this.setState({ crashCount: _recordCrash() });
    try { DiagnosticLog.error('render', String(error)); } catch (_e) { /* swallow */ }
    // ERR3-ACK: chrome boundaries (AppShellSheets) pass onCatch so a crashed
    // sheet acknowledges itself with a toast ("That panel hit a problem and
    // closed. Anything you saved is safe.") instead of vanishing silently mid-task.
    // Wrapped like everything else here — a broken callback must never
    // break the last line of defense.
    if (typeof this.props.onCatch === 'function') {
      try { this.props.onCatch(error); } catch (_e) { /* swallow */ }
    }
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
    // WS6 (mock sy-crash): the empty-state pattern. It must draw when the app is half broken, so it names only
    // app.css classes (render-blocking, always loaded), draws its icons inline, and keeps a dark fallback colour
    // on the panel itself for a crash before app.css applies. Reload app first; after a second crash, the Read tab.
    /** @type {any} */
    var svg = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
    return (
      <div className="vot-crash-panel" style={{ minHeight: '100vh', boxSizing: 'border-box', paddingTop: '22vh', color: 'var(--text-1, #ece6da)', background: 'var(--bg, #0b0a08)', textAlign: 'center' }}>
        <div className="ui-empty" role="alert">
          <span className="ui-empty-icon" aria-hidden="true"><svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg></span>
          <h2 className="ui-empty-title">Something went wrong</h2>
          {/* Wave-0: the technical detail is in DiagnosticLog (componentDidCatch); the panel speaks human. */}
          <p className="ui-empty-text">This page hit an unexpected problem and could not finish loading. Your notes and data are safe.</p>
          <button type="button" className="ui-btn is-primary" onClick={() => location.reload()}>
            <svg {...svg} className="ui-i"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg>Reload app
          </button>
          {looping && (
            <button type="button" className="ui-btn vot-crash-home" style={{ marginTop: 10 }}
              onClick={() => { try { sessionStorage.setItem(CRASH_RECOVER_KEY, '1'); } catch (_e) { /* non-fatal */ } location.reload(); }}>
              <svg {...svg} className="ui-i"><path d="M4 11l8-7 8 7M6 10v10h12V10" /></svg>Go to the Read tab
            </button>
          )}
          {looping && (
            <p className="ui-empty-text" style={{ marginTop: 22 }}>
              This screen keeps failing. Going to the Read tab does not affect your saved notes and data.
            </p>
          )}
        </div>
      </div>
    );
  }
}
