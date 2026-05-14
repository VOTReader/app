function FootnoteListSection({ footnotes, nkjv, collectionScriptures, highlightedFn, onInAppLink }) {
  const entries = Object.entries(footnotes);
  if (entries.length === 0) return null;
  const scrollToBubble = (num) => {
    try {
      const el = document.querySelector(`.fn-ref[data-fn-num="${num}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}
  };
  return (/*#__PURE__*/
    React.createElement("div", { className: "footnote-list" }, /*#__PURE__*/
    React.createElement("div", { className: "footnote-list-header" }, "Footnotes"),
    entries.map(([num, fn]) => {
      const verseText = fn.type === "scripture" ? resolveScriptureText(fn.ref, nkjv, collectionScriptures) : null;
      return /*#__PURE__*/React.createElement("div", {
        key: num,
        id: `fn-item-${num}`,
        className: `footnote-list-item${highlightedFn === num ? " pulse" : ""}`,
        role: "button",
        tabIndex: 0,
        onClick: () => scrollToBubble(num),
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToBubble(num); } },
        title: `Jump back to footnote ${num} in the body` }, /*#__PURE__*/
      React.createElement("div", { className: "footnote-list-num" }, num, "."), /*#__PURE__*/
      React.createElement("div", null,
      fn.type === "scripture" ? /*#__PURE__*/
      React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("span", { className: "footnote-list-ref" }, fn.ref),
      verseText ? /*#__PURE__*/React.createElement(ExpandableVerse, { text: verseText, refStr: fn.ref }) :
      /*#__PURE__*/React.createElement("span", { className: "footnote-list-missing" }, " — verse text not available"),
      fn.seeAlso && /*#__PURE__*/
      React.createElement("div", { style: { marginTop: "0.5rem" } }, /*#__PURE__*/
      React.createElement("span", { style: { fontFamily: "'Cinzel',serif", fontSize: "0.6rem", letterSpacing: "0.18em", color: "var(--gold-dim)", textTransform: "uppercase", marginRight: "0.4rem" } }, "Also see:"), /*#__PURE__*/
      React.createElement("span", { style: { fontStyle: "italic" } }, fn.seeAlso.label || fn.seeAlso.letterTitle), /*#__PURE__*/
      React.createElement(InAppLinkButton, { compact: true, link: { collection: fn.seeAlso.collection, letterTitle: fn.seeAlso.letterTitle, excerpt: fn.seeAlso.excerpt }, onActivate: onInAppLink })
      )

      ) :
      /*#__PURE__*/React.createElement(React.Fragment, null,
        fn.text && !isRedundantNote(fn.text, fn.link, fn.url) && /*#__PURE__*/React.createElement("span", { className: "footnote-list-note-text" }, fn.text, fn.link && " "),
        fn.link && /*#__PURE__*/React.createElement(InAppLinkButton, { compact: true, link: fn.link, onActivate: onInAppLink }),
        fn.url && /*#__PURE__*/React.createElement("span", { className: fn.link ? "footnote-list-url-extra" : "footnote-list-note-text" }, /*#__PURE__*/React.createElement("a", { href: fn.url, target: "_blank", rel: "noopener noreferrer", className: "fn-link" }, fn.link ? "Open external link" : (fn.text || fn.url))),
        !fn.text && !fn.link && !fn.url && /*#__PURE__*/React.createElement("span", { className: "footnote-list-missing" }, "(no content attached)")
      )

      )
      );
    })
    ));
}
