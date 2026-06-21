/* ═══════════════════════════════════════════════════════════════════════
   ScriptureSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ScriptureSheet({ activeRef, onClose }) {
  const isOpen = activeRef !== null;
  const verseText = activeRef ? MATTHEW_NKJV[activeRef.cite] : null;
  // position:fixed sheet — portal to <body> so it anchors to the viewport, NOT to
  // the reading screen's `.pager-track`. During a page-swipe settle the track
  // carries a transient transform / will-change:transform (use-pager-gesture); a
  // transformed ancestor becomes the containing block for fixed descendants, so
  // the sheet's `bottom:0` would resolve to the bottom of the tall scrolled track
  // and drop off-screen while the backdrop still greys the screen.
  return ReactDOM.createPortal(
    <>
      <div className={`fn-sheet-backdrop${isOpen ? " open" : ""}`} onClick={onClose} />
      <div className={`fn-sheet${isOpen ? " open" : ""}`}>
        <div className="fn-sheet-handle" />
        {activeRef && (
          <>
            <span className="sc-sheet-tag">{"Scripture Reference \xB7 "}{activeRef.ref}</span>
            <span className="sc-sheet-cite">{activeRef.cite}</span>
            {verseText ? (
              <div className="sc-sheet-verse">
                <ScriptureVerseText text={verseText} cite={activeRef.cite} />
              </div>
            ) : (
              <div className="sc-sheet-verse" style={{ color: 'var(--cream-dim)', fontStyle: 'italic' }}>Verse text not available in app data</div>
            )}
          </>
        )}
      </div>
    </>,
    document.body
  );
}
