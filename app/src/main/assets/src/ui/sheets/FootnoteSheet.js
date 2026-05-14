const isRedundantNote = (text, link, url) => {
  if (!text) return false;
  const t = text.trim();
  if (url && !link && t.length < 160) return true;
  if (link && link.letterTitle) {
    const lt = link.letterTitle.trim();
    const tl = t.toLowerCase();
    const ltl = lt.toLowerCase();
    if (tl === ltl) return true;
    const cleaned = tl.replace(/^(see|also read|read|see regarding|from|see):?\s*['"]?/, '').replace(/['"]?\.?$/, '').trim();
    if (cleaned === ltl) return true;
  }
  return false;
};

function InAppLinkButton({ link, onActivate, compact, label }) {
  if (!link || !onActivate) return null;
  const title = link.letterTitle || label || "Open in App";
  if (compact) {
    return (/*#__PURE__*/
      React.createElement("button", {
        type: "button",
        className: "footnote-list-link-btn",
        onClick: (e) => {e.preventDefault();e.stopPropagation();onActivate(link);} },
      "Open in App ", /*#__PURE__*/
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

function FootnoteSheet({ num, fn, nkjv, collectionScriptures, footnotes, onClose, onInAppLink, onNavigate }) {
  const isOpen = num !== null;
  const verse = fn?.type === "scripture" ? resolveScriptureText(fn.ref, nkjv, collectionScriptures) : null;
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
      fn.text && !isRedundantNote(fn.text, fn.link, fn.url) && /*#__PURE__*/React.createElement("div", { className: "fn-sheet-note" }, fn.text),
      fn.link && /*#__PURE__*/React.createElement(InAppLinkButton, { link: fn.link, onActivate: onInAppLink }),
      fn.url && /*#__PURE__*/React.createElement("div", { className: fn.link ? "fn-sheet-url-extra" : "fn-sheet-note" }, /*#__PURE__*/React.createElement("a", { href: fn.url, target: "_blank", rel: "noopener noreferrer", className: "fn-link" }, fn.link ? "Open external link" : (fn.text || fn.url))),
      !fn.text && !fn.link && !fn.url && /*#__PURE__*/React.createElement("div", { className: "fn-sheet-verse-missing" }, "This footnote has no content attached.")
    )

    )

    )
    ));
}
