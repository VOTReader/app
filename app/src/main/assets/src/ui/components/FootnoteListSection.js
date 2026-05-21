/* ═══════════════════════════════════════════════════════════════════════
   FootnoteListSection — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function FootnoteListSection({ footnotes, nkjv, highlightedFn, onInAppLink }) {
  const entries = Object.entries(footnotes);
  if (entries.length === 0) return null;
  const scrollToBubble = (num) => {
    // Find the first in-body bubble matching this footnote number and scroll
    // it into view. Brief pulse handled by the bubble's `.active` state if
    // the parent wires `highlightedFn`; we just do the scroll here.
    try {
      const el = document.querySelector(`.fn-ref[data-fn-num="${num}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}
  };
  return (/*#__PURE__*/
    React.createElement("div", { className: "footnote-list" }, /*#__PURE__*/
    React.createElement("div", { className: "footnote-list-header" }, "Footnotes"),
    entries.map(([num, fn]) => /*#__PURE__*/
    React.createElement("div", {
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
    nkjv[fn.ref] ? /*#__PURE__*/React.createElement(ExpandableVerse, { text: nkjv[fn.ref], refStr: fn.ref }) :
    /*#__PURE__*/React.createElement("span", { className: "footnote-list-missing" }, " — verse text not available"),
    fn.seeAlso && /*#__PURE__*/
    React.createElement("div", { style: { marginTop: "0.5rem" } }, /*#__PURE__*/
    React.createElement("span", { style: { fontFamily: "'Cinzel',serif", fontSize: "0.6rem", letterSpacing: "0.18em", color: "var(--gold-dim)", textTransform: "uppercase", marginRight: "0.4rem" } }, "Also see:"), /*#__PURE__*/
    React.createElement("span", { style: { fontStyle: "italic" } }, fn.seeAlso.label || fn.seeAlso.letterTitle), /*#__PURE__*/
    React.createElement(InAppLinkButton, { compact: true, link: { collection: fn.seeAlso.collection, letterTitle: fn.seeAlso.letterTitle, excerpt: fn.seeAlso.excerpt }, onActivate: onInAppLink })
    )

    ) :
    /*#__PURE__*/React.createElement(React.Fragment, null,
      fn.text && !(fn.link && _fnTextRedundantWithLink(fn.text, fn.link)) && /*#__PURE__*/React.createElement("span", { className: "footnote-list-note-text" }, fn.text, fn.link && " "),
      fn.link && /*#__PURE__*/React.createElement(InAppLinkButton, { compact: true, link: fn.link, onActivate: onInAppLink }),
      fn.url && /*#__PURE__*/React.createElement("span", { className: (fn.link || fn.text) ? "footnote-list-url-extra" : "footnote-list-note-text" }, /*#__PURE__*/React.createElement("a", { href: fn.url, target: "_blank", rel: "noopener noreferrer", className: "fn-link", onClick: (e) => e.stopPropagation() }, (fn.link || fn.text) ? "Open external link" : fn.url)),
      !fn.text && !fn.link && !fn.url && /*#__PURE__*/React.createElement("span", { className: "footnote-list-missing" }, "(no content attached)")
    )

    )
    )
    )
    ));

};
/* ═══════════════════════════════════════════════════════════════
   MATTHEW / BIBLE READER COMPONENTS
   (ThemeBtn, ModeToggle, InlineNotes, StudyPanels,
    BookSelector, ChapterIndex, ChapterView)
═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   MODE TOGGLE
═══════════════════════════════════════════════════════════════ */
/* ThemeBtn → extracted to src/ui/components/ThemeBtn.js */

/* ── Global Home button. Calls window.__goHome which App sets on mount. ── */
/* HomeBtn → extracted to src/ui/components/HomeBtn.js */

/* ── Inset bridge: MainActivity calls this after page load so CSS
   variables reflect the real device camera cutout / status bar height ── */
window.__setInsets = function (top, bottom) {
  document.documentElement.style.setProperty('--inset-top', top + 'px');
  document.documentElement.style.setProperty('--inset-bottom', bottom + 'px');
}
