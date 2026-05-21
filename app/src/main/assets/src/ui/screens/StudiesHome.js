/* ═══════════════════════════════════════════════════════════════════════
   StudiesHome — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function StudiesHome({ studies, studiesLoading, onSelectStudy, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  // `studies` is the pre-ordered UNIFIED_CHAIN from App — heavy → light,
  // Matthew Study Bible already inserted at its weighted position.
  // studiesLoading is true while bible-studies.js is fetched the first time.
  const list = studies || [];
  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Home"), /*#__PURE__*/
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange })) }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-header" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-eyebrow" }, "In-Depth Bible Studies"), /*#__PURE__*/
    React.createElement("h1", { className: "vol-index-title" }, "Studies"), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-subtitle" }, "Bible/Letter Studies & The VOT Matthew Study Bible"), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line r" })
    )
    ), /*#__PURE__*/
    React.createElement("div", { className: "chapter-cards" },
    list.length === 0 && studiesLoading && /*#__PURE__*/
    React.createElement("div", { className: "sc-sheet-loading", style: { textAlign: "center", padding: "1.5rem 0" } }, "Loading studies…"),
    list.length === 0 && !studiesLoading && /*#__PURE__*/
    React.createElement("div", { className: "studies-empty" }, "Letter Studies coming soon."),

    list.map((s, i) => {
      const isMatthew = !!s.isMatthewStudy;
      const chCount = s.chapters ? s.chapters.length : 0;
      const displayCount = s.parts ? s.parts.length : chCount;
      const partsLabel = isMatthew ?
      `${chCount} Chapters · Inline Commentary` :
      s.singlePage ?
      "Reference" :
      displayCount > 0 ? `${displayCount} ${displayCount === 1 ? "Part" : "Parts"} · Bible Study` : "Coming Soon";
      return (/*#__PURE__*/
        React.createElement("button", { key: s.id,
          className: `chapter-card-btn${s.locked ? " is-locked" : ""}`,
          onClick: () => !s.locked && onSelectStudy(s.slug || s.id),
          disabled: s.locked }, /*#__PURE__*/
        React.createElement("span", { className: "chapter-card-num" }, i + 1), /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-divider" }), /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-info" }, /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-label" }, s.locked ? "Coming Soon" : partsLabel), /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-title" }, s.title)
        )
        ));

    }), /*#__PURE__*/
    React.createElement("a", { className: "chapter-card-btn study-external-card",
      href: "https://answersonlygodcangive.com/", target: "_blank", rel: "noopener noreferrer" }, /*#__PURE__*/
    React.createElement("span", { className: "chapter-card-num" }, "\u2197"), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-divider" }), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-info" }, /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-label" }, "External Site"), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-title" }, "AnswersOnlyGodCanGive.com")
    )
    )
    )
    )
    ));

}
