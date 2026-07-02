/* ═══════════════════════════════════════════════════════════════════════
   ProphecyExpandToggle — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ProphecyExpandToggle({ allExpanded, onToggle }) {
  // position:fixed FAB (.mode-toggle-wrap) — portal to <body> so it anchors to
  // the viewport, NOT to the reading screen's `.pager-track`. During a
  // page-swipe settle the track carries a transient transform /
  // will-change:transform (use-pager-gesture); a transformed ancestor becomes
  // the containing block for fixed descendants, so the FAB's bottom/right
  // would resolve against the tall scrolled track and float off-position
  // (same trap as ScriptureSheet / FootnoteSheet).
  return ReactDOM.createPortal(
    <div className="mode-toggle-wrap">
      <div className="mode-toggle">
        <button
          className="mode-btn active"
          onClick={() => onToggle(!allExpanded)}
          title={allExpanded ? "Collapse all cards" : "Expand all cards"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {allExpanded ? (
              <polyline points="6 15 12 9 18 15" />
            ) : (
              <polyline points="6 9 12 15 18 9" />
            )}
          </svg>
          {allExpanded ? "Collapse" : "Expand"}
        </button>
      </div>
    </div>,
    document.body
  );
}
