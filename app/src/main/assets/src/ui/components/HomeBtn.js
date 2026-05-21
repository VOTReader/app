/* ═══════════════════════════════════════════════════════════════════════
   HomeBtn — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function HomeBtn() {
  return (/*#__PURE__*/
    React.createElement("button", { className: "nav-search-btn", onClick: () => window.__goHome && window.__goHome(), title: "Home", "aria-label": "Home" }, /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /*#__PURE__*/
    React.createElement("path", { d: "M3 10.5L12 3l9 7.5" }), /*#__PURE__*/
    React.createElement("path", { d: "M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" })
    )
    ));

}
