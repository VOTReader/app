/* ═══════════════════════════════════════════════════════════════════════
   HomeBtn — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{ beforeGo?: (() => void) | null }} props
 *   beforeGo — runs before the home navigation. Overlay hosts (the Tabs
 *   overview) pass their own dismiss here: __goHome only changes the screen
 *   UNDERNEATH an overlay, so without closing it the tap looked like a no-op.
 */
export function HomeBtn({ beforeGo = null } = {}) {
  return (
    <button
      className="nav-search-btn"
      onClick={() => { if (beforeGo) beforeGo(); window.__goHome && window.__goHome(); }}
      title="Home"
      aria-label="Home"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5L12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
      </svg>
    </button>
  );
}
