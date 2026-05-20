/* ═══════════════════════════════════════════════════════════════════════
   SrchCard — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function SrchCard({ entry, terms, onSelect, isDirect }) {
  if (isDirect) {
    return (/*#__PURE__*/
      React.createElement("button", { className: "srch-card card-direct", onClick: () => onSelect(entry) }, /*#__PURE__*/
      React.createElement("div", { className: "srch-card-top" }, /*#__PURE__*/
      React.createElement("span", { className: "srch-card-ref" }, entry.__label)
      ), /*#__PURE__*/
      React.createElement("div", { className: "srch-card-snippet" }, entry.__sub || 'Go')
      ));

  }
  const doc = entry.doc;
  const meta = SRCH_KIND_LABEL[doc.kind] || { label: doc.kind, cls: '' };
  const refLine = doc.ref || (doc.title || '') + (doc.chapterNum ? ' ' + doc.chapterNum : '');
  const body = doc.kind === 'heading' ? (doc.heading || doc.text) :
  (doc.kind === 'chapter-title' || doc.kind === 'letter-title' || doc.kind === 'wtlb-title' || doc.kind === 'blessed-title' || doc.kind === 'holy-day-title') ?
  (doc.title || doc.text) :
  doc.text;
  return (/*#__PURE__*/
    React.createElement("button", { className: "srch-card", onClick: () => onSelect(entry) }, /*#__PURE__*/
    React.createElement("div", { className: "srch-card-top" }, /*#__PURE__*/
    React.createElement("span", { className: "srch-card-ref" }, refLine), /*#__PURE__*/
    React.createElement("span", { className: "srch-card-badge " + (meta.cls || '') }, meta.label),
    doc.translation && doc.translation !== 'nkjv' && /*#__PURE__*/React.createElement("span", { className: "srch-card-badge" }, doc.translation.toUpperCase()),
    doc.heading && doc.kind === 'verse' && /*#__PURE__*/React.createElement("span", { className: "srch-card-badge badge-heading" }, doc.heading.length > 28 ? doc.heading.slice(0, 28) + '…' : doc.heading)
    ), /*#__PURE__*/
    React.createElement("div", { className: "srch-card-snippet" }, /*#__PURE__*/
    React.createElement(SrchSnippet, { text: body || '', terms: terms })
    )
    ));

}
