/* ═══════════════════════════════════════════════════════════════════════
   ProphecyExpandToggle — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Expand / Collapse every prophecy card of the letter. POL1 (UI pass rule:
   nothing floats over a reader): it was a position:fixed FAB portaled to
   <body> (.mode-toggle-wrap); it is now a worded gold button in the page,
   just above the letter's first prophecy group (LetterView), like the
   study-notes switch under a chapter title. */

/** @param {{ allExpanded: boolean, onToggle: (expand: boolean) => void }} props */
export function ProphecyExpandToggle({ allExpanded, onToggle }) {
  return (
    <div className="prophecy-expand-row">
      <button type="button" className="prophecy-expand-btn" aria-expanded={allExpanded} onClick={() => onToggle(!allExpanded)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          {allExpanded ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
        </svg>
        {allExpanded ? "Collapse all cards" : "Expand all cards"}
      </button>
    </div>
  );
}
