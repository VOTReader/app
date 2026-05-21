/* ═══════════════════════════════════════════════════════════════════════
   NavButtons — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function NavButtons({ onSettings, onHistory, onSearch, theme, onThemeChange, reading, chapterBookmark, hlTick, journalRefKey, journalRefLabel }) {
  return React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("button", { className: "settings-gear-btn", onClick: onSettings, title: "Settings" }, /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /*#__PURE__*/React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }))), /*#__PURE__*/
    React.createElement("button", { className: reading ? "nav-search-btn nav-history-reading" : "nav-search-btn", onClick: onHistory, title: "History" }, /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("polyline", { points: "1 4 1 10 7 10" }), /*#__PURE__*/React.createElement("path", { d: "M3.51 15a9 9 0 1 0 .49-5.01" }))), /*#__PURE__*/
    React.createElement("button", { className: "nav-search-btn", onClick: onSearch, title: "Search" }, /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /*#__PURE__*/React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }))), /*#__PURE__*/
    chapterBookmark && React.createElement(ChapterBookmarkBtn, { chapterBookmark: chapterBookmark, hlTick: hlTick }),
    React.createElement(ThemeBtn, { theme: theme, onThemeChange: onThemeChange }));
}
