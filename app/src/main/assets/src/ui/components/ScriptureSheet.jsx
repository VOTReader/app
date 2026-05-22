/* ═══════════════════════════════════════════════════════════════════════
   ScriptureSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ScriptureSheet({ activeRef, onClose }) {
  const isOpen = activeRef !== null;
  const verseText = activeRef ? MATTHEW_NKJV[activeRef.cite] : null;
  return (
    <>
      <div className={`fn-sheet-backdrop${isOpen ? " open" : ""}`} onClick={onClose} />
      <div className={`fn-sheet${isOpen ? " open" : ""}`}>
        <div className="fn-sheet-handle" />
        {activeRef && verseText && (
          <>
            <span className="sc-sheet-tag">{"Scripture Reference \xB7 "}{activeRef.ref}</span>
            <span className="sc-sheet-cite">{activeRef.cite}</span>
            <div className="sc-sheet-verse">
              <ScriptureVerseText text={verseText} cite={activeRef.cite} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
