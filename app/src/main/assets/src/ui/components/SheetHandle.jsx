/* ═══════════════════════════════════════════════════════════════════════
   SheetHandle — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   THE one grabber module for every bottom sheet. Replaces the three
   cosmetic handle divs (fn-sheet-handle / select-sheet-handle /
   link-action-handle) that were duplicated across 9 sheets — an owner
   report: an older reader tapped the pill bar expecting it to close the
   sheet and nothing happened. Both the pill bar and the ‹ chevron at the
   sheet's upper-left are real 44px buttons that close the sheet; the
   chevron is the visible fallback for readers who don't know the
   pull-handle idiom. */

export function SheetHandle({ onClose }) {
  return (
    <div className="sheet-handle-row">
      <button type="button" className="sheet-handle-back" onClick={onClose} aria-label="Close">
        ‹
      </button>
      {/* The pill bar is a redundant touch affordance for sighted users —
          aria-hidden + tabIndex -1 keep it out of the accessibility tree so
          the ‹ chevron is the ONE screen-reader/keyboard Close stop (two
          adjacent identical "Close" announcements otherwise). */}
      <button type="button" className="sheet-handle-grab" onClick={onClose} aria-hidden="true" tabIndex={-1}>
        <span className="sheet-handle-bar" />
      </button>
    </div>
  );
}
