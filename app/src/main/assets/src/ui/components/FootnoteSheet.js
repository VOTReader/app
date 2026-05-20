/* ═══════════════════════════════════════════════════════════════════════
   FootnoteSheet — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function FootnoteSheet({ num, fn, nkjv, footnotes, onClose, onInAppLink, onNavigate }) {
  const isOpen = num !== null;
  const verse = fn?.type === "scripture" ? nkjv?.[fn.ref] || null : null;
  // Build ordered key list once we know the footnotes dict; keys are
  // typically numeric strings ("1", "2", "10"), so sort numerically when
  // possible and fall back to lexical order for unusual keys.
  const orderedKeys = footnotes ? Object.keys(footnotes).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  }) : [];
  const curIdx = num != null ? orderedKeys.indexOf(String(num)) : -1;
  const prevKey = curIdx > 0 ? orderedKeys[curIdx - 1] : null;
  const nextKey = curIdx >= 0 && curIdx < orderedKeys.length - 1 ? orderedKeys[curIdx + 1] : null;
  const total = orderedKeys.length;
  const showNav = total > 1 && onNavigate && curIdx !== -1;
  return (/*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: `fn-sheet-backdrop${isOpen ? " open" : ""}`, onClick: onClose }), /*#__PURE__*/
    React.createElement("div", { className: `fn-sheet${isOpen ? " open" : ""}` }, /*#__PURE__*/
    React.createElement("div", { className: "fn-sheet-handle" }),
    fn && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: "fn-sheet-num-row" }, /*#__PURE__*/
    React.createElement("div", { className: "fn-sheet-num" }, "Footnote ", num, showNav && /*#__PURE__*/React.createElement("span", { className: "fn-sheet-num-of" }, " of ", total)),
    showNav && /*#__PURE__*/React.createElement("div", { className: "fn-sheet-nav" }, /*#__PURE__*/
    React.createElement("button", {
      className: "fn-sheet-nav-btn",
      onClick: () => prevKey != null && onNavigate(prevKey),
      disabled: prevKey == null,
      "aria-label": "Previous footnote",
      title: "Previous footnote" }, "‹"), /*#__PURE__*/
    React.createElement("button", {
      className: "fn-sheet-nav-btn",
      onClick: () => nextKey != null && onNavigate(nextKey),
      disabled: nextKey == null,
      "aria-label": "Next footnote",
      title: "Next footnote" }, "›")
    )
    ),
    fn.type === "scripture" ? /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("span", { className: "fn-sheet-ref" }, fn.ref),
    verse ? /*#__PURE__*/React.createElement("div", { className: "fn-sheet-verse" }, /*#__PURE__*/React.createElement(ScriptureVerseText, { text: verse, cite: fn.ref })) :
    /*#__PURE__*/React.createElement("div", { className: "fn-sheet-verse-missing" }, "Verse text isn't available for this reference. The footnote points to ", /*#__PURE__*/React.createElement("strong", null, fn.ref), ", but no matching entry was found in this letter's scripture dictionary."),
    fn.seeAlso && /*#__PURE__*/
    React.createElement("div", { className: "fn-sheet-see-also" }, /*#__PURE__*/
    React.createElement("span", { className: "fn-sheet-see-also-label" }, "Also see"), /*#__PURE__*/
    React.createElement(InAppLinkButton, {
      link: { collection: fn.seeAlso.collection, letterTitle: fn.seeAlso.letterTitle, excerpt: fn.seeAlso.excerpt },
      onActivate: onInAppLink,
      label: fn.seeAlso.label || fn.seeAlso.letterTitle }
    )
    )

    ) :
    /*#__PURE__*/React.createElement(React.Fragment, null,
      fn.text && !(fn.link && _fnTextRedundantWithLink(fn.text, fn.link)) && /*#__PURE__*/React.createElement("div", { className: "fn-sheet-note" }, fn.text),
      fn.link && /*#__PURE__*/React.createElement(InAppLinkButton, { link: fn.link, onActivate: onInAppLink }),
      fn.url && /*#__PURE__*/React.createElement("div", { className: (fn.link || fn.text) ? "fn-sheet-url-extra" : "fn-sheet-note" }, /*#__PURE__*/React.createElement("a", { href: fn.url, target: "_blank", rel: "noopener noreferrer", className: "fn-link" }, (fn.link || fn.text) ? "Open external link" : fn.url)),
      !fn.text && !fn.link && !fn.url && /*#__PURE__*/React.createElement("div", { className: "fn-sheet-verse-missing" }, "This footnote has no content attached.")
    )

    )

    )
    ));

}
