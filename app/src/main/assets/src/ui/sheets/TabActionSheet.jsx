/* ═══════════════════════════════════════════════════════════════════════
   TabActionSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function TabActionSheet({ idx, total, onCloseOthers, onCloseToRight, onDismiss }) {
  // Hook must run on every render (rules-of-hooks) — early-return moved AFTER
  // the effect. The idx==null guard inside the effect makes it a no-op when
  // the sheet isn't shown; the cleanup still fires correctly when idx
  // transitions from non-null → null.
  React.useEffect(() => {
    if (idx == null) return;
    const prev = window.__closeSheet;
    window.__closeSheet = onDismiss;
    return () => {window.__closeSheet = prev || null;};
  }, [idx, onDismiss]);
  if (idx == null) return null;
  const tabNum = idx + 1;
  const hasOthers = total > 1;
  const hasRightTabs = idx < total - 1;
  return (
    <>
      <div className="select-sheet-backdrop open" onClick={onDismiss} />
      <div className="select-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="select-sheet-handle" />
        <div className="select-sheet-eyebrow">Tab {tabNum}</div>
        <div className="select-sheet-title">Tab actions</div>
        <div className="select-sheet-ornament">
          <div className="select-sheet-ornament-line" />
          <div className="select-sheet-ornament-diamond">{"✦"}</div>
          <div className="select-sheet-ornament-line r" />
        </div>
        <div className="select-sheet-options">
          <button
            className="select-sheet-option"
            disabled={!hasOthers}
            style={!hasOthers ? { opacity: 0.42, cursor: 'not-allowed' } : undefined}
            onClick={hasOthers ? () => {onCloseOthers();onDismiss();} : undefined}
          >
            <div className="select-sheet-option-main">
              <span className="select-sheet-option-label">Close other tabs</span>
            </div>
            <div className="select-sheet-option-desc">Keep only this tab open. {hasOthers ? `${total - 1} other ${total - 1 === 1 ? 'tab' : 'tabs'} will be closed.` : 'No other tabs to close.'}</div>
          </button>
          <button
            className="select-sheet-option"
            disabled={!hasRightTabs}
            style={!hasRightTabs ? { opacity: 0.42, cursor: 'not-allowed' } : undefined}
            onClick={hasRightTabs ? () => {onCloseToRight();onDismiss();} : undefined}
          >
            <div className="select-sheet-option-main">
              <span className="select-sheet-option-label">Close tabs to the right</span>
            </div>
            <div className="select-sheet-option-desc">{hasRightTabs ? `Close ${total - tabNum} ${total - tabNum === 1 ? 'tab' : 'tabs'} after this one.` : 'No tabs to the right.'}</div>
          </button>
          <button
            className="select-sheet-option"
            onClick={onDismiss}
            style={{ borderStyle: 'dashed' }}
          >
            <div className="select-sheet-option-main">
              <span className="select-sheet-option-label">Cancel</span>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
