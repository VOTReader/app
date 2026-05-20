/* ═══════════════════════════════════════════════════════════════════════
   ScriptureSheet — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function ScriptureSheet({ activeRef, onClose }) {
  const isOpen = activeRef !== null;
  const verseText = activeRef ? MATTHEW_NKJV[activeRef.cite] : null;
  return (/*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: `fn-sheet-backdrop${isOpen ? " open" : ""}`, onClick: onClose }), /*#__PURE__*/
    React.createElement("div", { className: `fn-sheet${isOpen ? " open" : ""}` }, /*#__PURE__*/
    React.createElement("div", { className: "fn-sheet-handle" }),
    activeRef && verseText && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("span", { className: "sc-sheet-tag" }, "Scripture Reference \xB7 ", activeRef.ref), /*#__PURE__*/
    React.createElement("span", { className: "sc-sheet-cite" }, activeRef.cite), /*#__PURE__*/
    React.createElement("div", { className: "sc-sheet-verse" }, /*#__PURE__*/
    React.createElement(ScriptureVerseText, { text: verseText, cite: activeRef.cite })
    )
    )

    )
    ));

}
