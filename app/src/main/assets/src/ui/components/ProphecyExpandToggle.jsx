/* ═══════════════════════════════════════════════════════════════════════
   ProphecyExpandToggle — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ProphecyExpandToggle({ allExpanded, onToggle }) {
  return (
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
    </div>
  );
}
