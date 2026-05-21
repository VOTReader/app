/* ═══════════════════════════════════════════════════════════════════════
   ProphecyExpandToggle — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function ProphecyExpandToggle({ allExpanded, onToggle }) {
  return (/*#__PURE__*/
    React.createElement("div", { className: "mode-toggle-wrap" }, /*#__PURE__*/
    React.createElement("div", { className: "mode-toggle" }, /*#__PURE__*/
    React.createElement("button", {
      className: "mode-btn active",
      onClick: () => onToggle(!allExpanded),
      title: allExpanded ? "Collapse all cards" : "Expand all cards" }, /*#__PURE__*/

    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /*#__PURE__*/
    allExpanded ?
    React.createElement("polyline", { points: "6 15 12 9 18 15" }) :
    React.createElement("polyline", { points: "6 9 12 15 18 9" })
    ), allExpanded ? "Collapse" : "Expand"

    )
    )
    ));

}
