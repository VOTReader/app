/* ═══════════════════════════════════════════════════════════════════════
   TabActionSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function TabActionSheet({ idx, total, tab, onCloseOthers, onCloseToRight, onRename, onTogglePin, onDismiss }) {
  // Both actions here close SEVERAL tabs at once with no undo snapshot
  // (unlike the single × close, which gets an Undo toast) — so each is
  // confirm-gated in place, consistent with the app-wide ConfirmStrip
  // standard. `confirming` names which action is pending, or null.
  const [confirming, setConfirming] = React.useState(null); // null | 'others' | 'right'
  // [7] rename-in-place: null = closed; a string = the draft title being
  // edited (pre-filled with the current custom title, if any).
  const [renaming, setRenaming] = React.useState(/** @type {string | null} */ (null));
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
  // A fresh open (different tab) starts on the plain options, never mid-confirm.
  React.useEffect(() => { setConfirming(null); setRenaming(null); }, [idx]);
  // [13] focus trap — Tab stays inside the sheet while it's open (Escape
  // already routes through the modal registry in AppShellOverlays).
  const trapRef = useFocusTrap(idx != null);
  if (idx == null) return null;
  const tabNum = idx + 1;
  const hasOthers = total > 1;
  const hasRightTabs = idx < total - 1;
  const othersCount = total - 1;
  const rightCount = total - tabNum;
  return (
    <>
      <div className="select-sheet-backdrop open" onClick={onDismiss} />
      <div className="select-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="tab-actions-title" onClick={(e) => e.stopPropagation()}>
        <SheetHandle onClose={onDismiss} />
        <div className="select-sheet-eyebrow">Tab {tabNum}</div>
        <div className="select-sheet-title" id="tab-actions-title">Tab actions</div>
        <div className="select-sheet-ornament">
          <div className="select-sheet-ornament-line" />
          <div className="select-sheet-ornament-diamond">{"✦"}</div>
          <div className="select-sheet-ornament-line r" />
        </div>
        <div className="select-sheet-options">
          {/* [7] Rename — a persisted custom title that overrides the
              remembered label. Inline editor; Enter saves, empty clears. */}
          {renaming != null ? (
            <div className="tab-rename-row">
              <input
                className="tab-rename-input"
                type="text"
                value={renaming}
                maxLength={60}
                placeholder="Tab name"
                autoFocus
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onRename(renaming); onDismiss(); }
                  if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); }
                }}
              />
              <button className="tab-rename-save" onClick={() => { onRename(renaming); onDismiss(); }}>Save</button>
              <button className="tab-rename-cancel" onClick={() => setRenaming(null)}>Cancel</button>
            </div>
          ) : (
            <button className="select-sheet-option" data-autofocus onClick={() => setRenaming((tab && tab.customTitle) || '')}>
              <div className="select-sheet-option-main">
                <span className="select-sheet-option-label">Rename tab…</span>
              </div>
              <div className="select-sheet-option-desc">{tab && tab.customTitle ? `Custom name: “${tab.customTitle}”. Clear the field to go back to the automatic name.` : 'Give this tab a name of your own; it sticks until you clear it.'}</div>
            </button>
          )}
          <button className="select-sheet-option" onClick={() => { onTogglePin(); onDismiss(); }}>
            <div className="select-sheet-option-main">
              <span className="select-sheet-option-label">{tab && tab.pinned ? 'Unpin tab' : 'Pin tab'}</span>
            </div>
            <div className="select-sheet-option-desc">{tab && tab.pinned ? 'Stops protecting this tab from bulk-close actions.' : 'Moves this tab to the front and protects it from Close-others and Clear-all.'}</div>
          </button>
          {confirming === 'others' ? (
            <ConfirmStrip
              question={`Close ${othersCount} other ${othersCount === 1 ? 'tab' : 'tabs'}?`}
              yesLabel="Yes, close them"
              onCancel={() => setConfirming(null)}
              onConfirm={() => {onCloseOthers();onDismiss();}}
            />
          ) : (
            <button
              className="select-sheet-option"
              disabled={!hasOthers}
              style={!hasOthers ? { opacity: 0.42, cursor: 'not-allowed' } : undefined}
              onClick={hasOthers ? () => setConfirming('others') : undefined}
            >
              <div className="select-sheet-option-main">
                <span className="select-sheet-option-label">Close other tabs</span>
              </div>
              <div className="select-sheet-option-desc">Keep only this tab open. {hasOthers ? `${othersCount} other ${othersCount === 1 ? 'tab' : 'tabs'} will be closed.` : 'No other tabs to close.'}</div>
            </button>
          )}
          {confirming === 'right' ? (
            <ConfirmStrip
              question={`Close ${rightCount} ${rightCount === 1 ? 'tab' : 'tabs'} after this one?`}
              yesLabel="Yes, close them"
              onCancel={() => setConfirming(null)}
              onConfirm={() => {onCloseToRight();onDismiss();}}
            />
          ) : (
            <button
              className="select-sheet-option"
              disabled={!hasRightTabs}
              style={!hasRightTabs ? { opacity: 0.42, cursor: 'not-allowed' } : undefined}
              onClick={hasRightTabs ? () => setConfirming('right') : undefined}
            >
              <div className="select-sheet-option-main">
                <span className="select-sheet-option-label">Close tabs to the right</span>
              </div>
              <div className="select-sheet-option-desc">{hasRightTabs ? `Close ${rightCount} ${rightCount === 1 ? 'tab' : 'tabs'} after this one.` : 'No tabs to the right.'}</div>
            </button>
          )}
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
