/* ═══════════════════════════════════════════════════════════════════════
   StickyChapterNav — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function StickyChapterNav({ onPrev, onNext, prevDisabled, nextDisabled, prevLabel, nextLabel }) {
  return (/*#__PURE__*/
    React.createElement("div", { className: "chapter-nav-sticky" }, /*#__PURE__*/
    React.createElement("button", {
      className: "chapter-nav-sticky-arrow",
      disabled: !!prevDisabled,
      onClick: onPrev,
      title: prevLabel || "Previous",
      "aria-label": prevLabel || "Previous" },
    "\u2039"), /*#__PURE__*/
    React.createElement("button", {
      className: "chapter-nav-sticky-arrow",
      disabled: !!nextDisabled,
      onClick: onNext,
      title: nextLabel || "Next",
      "aria-label": nextLabel || "Next" },
    "\u203A")
    ));

}
