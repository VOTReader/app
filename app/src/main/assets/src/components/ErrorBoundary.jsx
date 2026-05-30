/* ═══════════════════════════════════════════════════════════════════════
   ErrorBoundary — root-level React error boundary (JSX)
   ═══════════════════════════════════════════════════════════════════════
   Wraps <App> at the root createRoot.render() call in index.html.
   Catches any unhandled render error and shows a gold-themed
   "Something went wrong" panel with the error message + Reload button.
   ═══════════════════════════════════════════════════════════════════════ */

import { DiagnosticLog } from '../utils/diagnostic-log.js';

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  // W7.4: record render crashes to the DiagnosticLog so they reach the
  // Settings export. Wrapped so logging can never break the boundary itself.
  componentDidCatch(error) {
    try { DiagnosticLog.error('render', String(error)); } catch (_e) { /* swallow */ }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#e0c97f", fontFamily: "Georgia, serif" }}>
        <h2 style={{ marginBottom: "1rem" }}>Something went wrong</h2>
        <p style={{ color: "#b0a080", fontSize: "0.85rem", maxWidth: "400px", margin: "0 auto 1.5rem", wordBreak: "break-word" }}>
          {String(this.state.error)}
        </p>
        <button
          onClick={() => location.reload()}
          style={{ padding: "0.6rem 1.6rem", background: "transparent", border: "1px solid #e0c97f", color: "#e0c97f", borderRadius: "4px", cursor: "pointer", fontFamily: "inherit" }}
        >
          Reload App
        </button>
      </div>
    );
  }
}
