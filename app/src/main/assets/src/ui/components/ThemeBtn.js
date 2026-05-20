/* ═══════════════════════════════════════════════════════════════════════
   ThemeBtn — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function ThemeBtn({ theme, onThemeChange }) {
  const next = theme === "dark" ? "light" : "dark";
  const title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (/*#__PURE__*/
    React.createElement("button", { className: "nav-theme-btn", onClick: () => onThemeChange(next), title: title },
    theme === "dark" ? /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /*#__PURE__*/
    React.createElement("circle", { cx: "12", cy: "12", r: "5" }), /*#__PURE__*/
    React.createElement("line", { x1: "12", y1: "1", x2: "12", y2: "3" }), /*#__PURE__*/
    React.createElement("line", { x1: "12", y1: "21", x2: "12", y2: "23" }), /*#__PURE__*/
    React.createElement("line", { x1: "4.22", y1: "4.22", x2: "5.64", y2: "5.64" }), /*#__PURE__*/
    React.createElement("line", { x1: "18.36", y1: "18.36", x2: "19.78", y2: "19.78" }), /*#__PURE__*/
    React.createElement("line", { x1: "1", y1: "12", x2: "3", y2: "12" }), /*#__PURE__*/
    React.createElement("line", { x1: "21", y1: "12", x2: "23", y2: "12" }), /*#__PURE__*/
    React.createElement("line", { x1: "4.22", y1: "19.78", x2: "5.64", y2: "18.36" }), /*#__PURE__*/
    React.createElement("line", { x1: "18.36", y1: "5.64", x2: "19.78", y2: "4.22" })
    ) : /*#__PURE__*/

    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }, /*#__PURE__*/
    React.createElement("path", { d: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" })
    )

    ));

}
