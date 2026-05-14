function ScriptureSheet({ activeRef, onClose }) {
  const isOpen = activeRef !== null;
  const verseText = activeRef ? resolveScriptureText(activeRef.cite, typeof MATTHEW_NKJV !== 'undefined' ? MATTHEW_NKJV : null, null) : null;
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
