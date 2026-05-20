/* ═══════════════════════════════════════════════════════════════════════
   ErrorBoundary — root-level React error boundary
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Catches any unhandled render error from the App tree and shows a
   "Something went wrong" panel with the error message + a Reload App
   button. Gold-themed so the error screen stays in-brand.

   Wraps <App> at the root createRoot.render() call in index.html.

   Class components don't have hook-context concerns, so this extraction
   needs no React.useX upgrade — just a destination move.
   ═══════════════════════════════════════════════════════════════════════ */

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  render() {
    if (!this.state.error) return this.props.children;
    return React.createElement("div", { style: { padding: "2rem", textAlign: "center", color: "#e0c97f", fontFamily: "Georgia, serif" } },
      React.createElement("h2", { style: { marginBottom: "1rem" } }, "Something went wrong"),
      React.createElement("p", { style: { color: "#b0a080", fontSize: "0.85rem", maxWidth: "400px", margin: "0 auto 1.5rem", wordBreak: "break-word" } }, String(this.state.error)),
      React.createElement("button", { onClick: () => location.reload(), style: { padding: "0.6rem 1.6rem", background: "transparent", border: "1px solid #e0c97f", color: "#e0c97f", borderRadius: "4px", cursor: "pointer", fontFamily: "inherit" } }, "Reload App"));
  }
}
