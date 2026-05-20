/* ═══════════════════════════════════════════════════════════════════════
   InlineEcho — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function InlineEcho({ scriptures, votNotes }) {
  if (!scriptures.length && !votNotes.length) return null;
  const scrollToRef = (ref) => {
    const ranges = parseRefRanges(ref);
    if (ranges.length > 0) {
      const target = document.getElementById(`v-${ranges[0].end}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  return (/*#__PURE__*/
    React.createElement("div", { className: "inline-echo" },
    scriptures.map((s, i) => /*#__PURE__*/
    React.createElement("button", { key: `es${i}`, className: "inline-echo-pill", onClick: () => scrollToRef(s.ref), title: `See note at ${s.ref}` }, /*#__PURE__*/
    React.createElement("span", { className: "echo-arrow" }, "↑"), /*#__PURE__*/
    React.createElement("span", null, s.ref)
    )
    ),
    votNotes.map((n, i) => /*#__PURE__*/
    React.createElement("button", { key: `ev${i}`, className: "inline-echo-pill", onClick: () => scrollToRef(n.ref), title: `See note at ${n.ref}` }, /*#__PURE__*/
    React.createElement("span", { className: "echo-arrow" }, "↑"), /*#__PURE__*/
    React.createElement("span", null, n.ref, " — ", n.vol)
    )
    )
    ));

}
