/* ═══════════════════════════════════════════════════════════════════════
   ScriptureGenre — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function ScriptureGenre({ genreId, onSelect, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const genre = [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt].find((g) => g.id === genreId);
  if (!genre) return null;
  const testament = SCRIPTURE_GENRES.nt.some((g) => g.id === genreId) ? "New Testament" : "Old Testament";
  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Scriptures"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/

      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange })) }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-header" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-eyebrow" }, testament), /*#__PURE__*/
    React.createElement("h1", { className: "vol-index-title" }, genre.label), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line r" })
    )
    ), /*#__PURE__*/
    React.createElement("div", { className: "chapter-cards" },
    genre.books.map((b, i) => /*#__PURE__*/
    React.createElement("button", { key: b.id,
      className: "chapter-card-btn",
      onClick: () => onSelect(b.id) }, /*#__PURE__*/
    React.createElement("span", { className: "chapter-card-num" }, i + 1), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-divider" }), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-info" }, /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-label" }, b.detail), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-title" }, b.title)
    )
    )
    )
    )
    )
    ));

}
