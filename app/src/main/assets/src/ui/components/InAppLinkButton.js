/* ═══════════════════════════════════════════════════════════════════════
   InAppLinkButton — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function InAppLinkButton({ link, onActivate, compact, label }) {
  if (!link || !onActivate) return null;
  const title = link.letterTitle || label || "Open in App";
  if (compact) {
    return (/*#__PURE__*/
      React.createElement("button", {
        type: "button",
        className: "footnote-list-link-btn fn-list-rich",
        onClick: (e) => {e.preventDefault();e.stopPropagation();onActivate(link);} }, /*#__PURE__*/
      React.createElement("span", { className: "fn-list-rich-body" }, /*#__PURE__*/
      React.createElement("span", { className: "fn-list-rich-eyebrow" }, "Open in App"), /*#__PURE__*/
      React.createElement("span", { className: "fn-list-rich-title" }, title)
      ), /*#__PURE__*/
      React.createElement("span", { className: "chev" }, "\u203A")
      ));

  }
  return (/*#__PURE__*/
    React.createElement("button", {
      type: "button",
      className: "fn-sheet-link-btn",
      onClick: (e) => {e.preventDefault();e.stopPropagation();onActivate(link);} }, /*#__PURE__*/

    React.createElement("span", { className: "fn-sheet-link-body" }, /*#__PURE__*/
    React.createElement("span", { className: "fn-sheet-link-eyebrow" }, "Open in App"), /*#__PURE__*/
    React.createElement("span", { className: "fn-sheet-link-title" }, title)
    ), /*#__PURE__*/
    React.createElement("span", { className: "fn-sheet-link-chevron" }, "\u203A")
    ));

}
