/* ═══════════════════════════════════════════════════════════════════════
   LibraryNav — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function LibraryNav(opts) {
  opts = opts || {};
  return React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("button", {
      className: "nav-home nav-back-icon",
      onClick: opts.onBack,
      title: opts.backTitle || "Back",
      "aria-label": opts.backTitle || "Back" }, "‹"), /*#__PURE__*/
    React.createElement(HomeBtn, null),
    opts.leftExtras || null, /*#__PURE__*/
    React.createElement(NavButtons, {
      onSettings: opts.onSettings,
      onHistory: opts.onHistory,
      onSearch: opts.onSearch,
      theme: opts.theme,
      onThemeChange: opts.onThemeChange }),
    opts.rightExtras || null);
}
