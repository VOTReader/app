/* ═══════════════════════════════════════════════════════════════════════
   SrchGroup — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function SrchGroup({ gkey, items, terms, onSelect, defaultOpen }) {
  const [open, setOpen] = React.useState(defaultOpen !== false);
  const meta = SRCH_GROUP_META[gkey] || { label: gkey };
  return (/*#__PURE__*/
    React.createElement("div", { className: "srch-group" + (open ? '' : ' collapsed') }, /*#__PURE__*/
    React.createElement("button", { className: "srch-group-header", onClick: () => setOpen((o) => !o) }, /*#__PURE__*/
    React.createElement("span", null, meta.label, /*#__PURE__*/React.createElement("span", { className: "srch-group-count-inline" }, " · ", items.length, " ", items.length === 1 ? "match" : "matches")), /*#__PURE__*/
    React.createElement("span", { className: "srch-group-count" }, open ? '▾' : '▸')
    ), /*#__PURE__*/
    React.createElement("div", { className: "srch-group-items" },
    items.map((entry, i) => /*#__PURE__*/
    React.createElement(SrchCard, { key: i, entry: entry, terms: terms, onSelect: onSelect })
    )
    )
    ));

}
