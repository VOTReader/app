/* ═══════════════════════════════════════════════════════════════════════
   ClearProgressRow — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function ClearProgressRow({ label, total, count, stage, onTap }) {
  if (count === 0) return (/*#__PURE__*/
    React.createElement("div", { className: "progress-row" }, /*#__PURE__*/
    React.createElement("span", { className: "progress-row-label" }, label), /*#__PURE__*/
    React.createElement("span", { className: "progress-row-tally" }, "0 / ", total), /*#__PURE__*/
    React.createElement("button", { className: "settings-clear-btn", disabled: true }, "Clear")
    ));

  return (/*#__PURE__*/
    React.createElement("div", { className: "progress-row" }, /*#__PURE__*/
    React.createElement("span", { className: "progress-row-label" }, label), /*#__PURE__*/
    React.createElement("span", { className: "progress-row-tally" }, count, " / ", total), /*#__PURE__*/
    React.createElement("button", { className: CLEAR_CLASSES[stage], onClick: onTap }, CLEAR_LABELS[stage])
    ));

}
