/* ═══════════════════════════════════════════════════════════════════════
   TabActionSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function TabActionSheet({ idx, total, tabs = null, tab, onCloseOthers, onCloseToRight, onRename, onTogglePin, onMove = null, onDismiss }) {
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
  // W53: pinned tabs survive both bulk closes (use-tab-actions), so the counts
  // are of the UNPINNED tabs they will close, and an action with none is off.
  const list = Array.isArray(tabs) ? tabs : null;
  const closable = (/** @type {(i: number) => boolean} */ pick) => (list
    ? list.filter((t, i) => pick(i) && !(t && t.pinned)).length
    : Array.from({ length: total }, (_, i) => i).filter(pick).length);
  const pinnedWhere = (/** @type {(i: number) => boolean} */ pick) => !!list && list.some((t, i) => pick(i) && !!(t && t.pinned));
  const othersCount = closable((i) => i !== idx);
  const rightCount = closable((i) => i > idx);
  const hasOthers = othersCount > 0;
  const hasRightTabs = rightCount > 0;
  const pinnedNote = (/** @type {(i: number) => boolean} */ pick) => (pinnedWhere(pick) ? ' Pinned tabs stay open.' : '');
  return (
    <>
      <div className="select-sheet-backdrop open" aria-hidden="true" onClick={onDismiss} />
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
            <div className="select-sheet-option-desc">{tab && tab.pinned ? 'Stops protecting this tab from Close other tabs and Clear All.' : 'Moves this tab to the front and keeps it open through Close other tabs and Clear All.'}</div>
          </button>
          {/* n196: the keyboard and screen-reader path to reorder (drag was the only one). The sheet
              stays open on the moved tab, so a second press moves it again. */}
          {onMove && (
            <div className="tab-move-row" role="group" aria-label="Move tab">
              <button className="select-sheet-option tab-move-btn" disabled={idx <= 0} onClick={() => onMove(-1)}>
                <span className="select-sheet-option-label">Move earlier</span>
              </button>
              <button className="select-sheet-option tab-move-btn" disabled={idx >= total - 1} onClick={() => onMove(1)}>
                <span className="select-sheet-option-label">Move later</span>
              </button>
            </div>
          )}
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
              <div className="select-sheet-option-desc">{hasOthers
                ? `Keep only this tab open. ${othersCount} other ${othersCount === 1 ? 'tab' : 'tabs'} will be closed.${pinnedNote((i) => i !== idx)}`
                : (pinnedWhere((i) => i !== idx) ? 'No other tabs to close: pinned tabs stay open.' : 'No other tabs to close.')}</div>
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
              <div className="select-sheet-option-desc">{hasRightTabs
                ? `Close ${rightCount} ${rightCount === 1 ? 'tab' : 'tabs'} after this one.${pinnedNote((i) => i > idx)}`
                : (pinnedWhere((i) => i > idx) ? 'Only pinned tabs to the right; they stay open.' : 'No tabs to the right.')}</div>
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
