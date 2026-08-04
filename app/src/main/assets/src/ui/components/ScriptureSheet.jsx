/* ═══════════════════════════════════════════════════════════════════════
   ScriptureSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ScriptureSheet({ activeRef, onClose, onGoToRef }) {
  const isOpen = activeRef != null;
  const rail = useRailMode();   // companion-rail fork — see FootnoteSheet
  const trapRef = useFocusTrap(isOpen && !rail);
  const verseText = activeRef ? MATTHEW_NKJV[activeRef.cite] : null;
  // position:fixed sheet — portal to <body> so it anchors to the viewport, NOT to
  // the reading screen's `.pager-track`. During a page-swipe settle the track
  // carries a transient transform / will-change:transform (use-pager-gesture); a
  // transformed ancestor becomes the containing block for fixed descendants, so
  // the sheet's `bottom:0` would resolve to the bottom of the tall scrolled track
  // and drop off-screen while the backdrop still greys the screen.
  return ReactDOM.createPortal(
    <>
      {!rail && <div className={`fn-sheet-backdrop${isOpen ? ' open' : ''}`} aria-hidden="true" onClick={isOpen ? onClose : undefined} />}
      <div className={`fn-sheet${isOpen ? ' open' : ''}${rail ? ' rail' : ''}`} ref={trapRef} role={rail ? 'complementary' : 'dialog'} aria-modal={!rail && isOpen ? 'true' : undefined} aria-hidden={!isOpen} inert={!isOpen ? true : undefined} aria-label={activeRef ? `Scripture ${activeRef.cite}` : 'Scripture'}>
        <SheetHandle onClose={onClose} />
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
            {typeof GoToRefButton !== 'undefined' && onGoToRef && (
              <GoToRefButton refStr={activeRef.cite} onGo={onGoToRef} />
            )}
          </>
        )}
      </div>
    </>,
    document.body
  );
}
