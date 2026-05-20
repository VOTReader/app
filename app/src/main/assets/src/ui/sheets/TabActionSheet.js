/* ═══════════════════════════════════════════════════════════════════════
   TabActionSheet — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function TabActionSheet({ idx, total, onCloseOthers, onCloseToRight, onDismiss }) {
  if (idx == null) return null;
  const tabNum = idx + 1;
  const hasOthers = total > 1;
  const hasRightTabs = idx < total - 1;
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = onDismiss;
    return () => {window.__closeSheet = prev || null;};
  }, [onDismiss]);
  return (/*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-backdrop open", onClick: onDismiss }), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet", onClick: (e) => e.stopPropagation() }, /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-handle" }), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-eyebrow" }, "Tab ", tabNum), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-title" }, "Tab actions"), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-ornament-diamond" }, "\u2726"), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-ornament-line r" })
    ), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-options" }, /*#__PURE__*/
    React.createElement("button", {
      className: "select-sheet-option",
      disabled: !hasOthers,
      style: !hasOthers ? { opacity: 0.42, cursor: 'not-allowed' } : undefined,
      onClick: hasOthers ? () => {onCloseOthers();onDismiss();} : undefined }, /*#__PURE__*/

    React.createElement("div", { className: "select-sheet-option-main" }, /*#__PURE__*/
    React.createElement("span", { className: "select-sheet-option-label" }, "Close other tabs")
    ), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-option-desc" }, "Keep only this tab open. ", hasOthers ? `${total - 1} other ${total - 1 === 1 ? 'tab' : 'tabs'} will be closed.` : 'No other tabs to close.')
    ), /*#__PURE__*/
    React.createElement("button", {
      className: "select-sheet-option",
      disabled: !hasRightTabs,
      style: !hasRightTabs ? { opacity: 0.42, cursor: 'not-allowed' } : undefined,
      onClick: hasRightTabs ? () => {onCloseToRight();onDismiss();} : undefined }, /*#__PURE__*/

    React.createElement("div", { className: "select-sheet-option-main" }, /*#__PURE__*/
    React.createElement("span", { className: "select-sheet-option-label" }, "Close tabs to the right")
    ), /*#__PURE__*/
    React.createElement("div", { className: "select-sheet-option-desc" }, hasRightTabs ? `Close ${total - tabNum} ${total - tabNum === 1 ? 'tab' : 'tabs'} after this one.` : 'No tabs to the right.')
    ), /*#__PURE__*/
    React.createElement("button", {
      className: "select-sheet-option",
      onClick: onDismiss,
      style: { borderStyle: 'dashed' } }, /*#__PURE__*/

    React.createElement("div", { className: "select-sheet-option-main" }, /*#__PURE__*/
    React.createElement("span", { className: "select-sheet-option-label" }, "Cancel")
    )
    )
    )
    )
    ));

}
