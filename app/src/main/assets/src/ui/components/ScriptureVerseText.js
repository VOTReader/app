/* ═══════════════════════════════════════════════════════════════════════
   ScriptureVerseText — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function ScriptureVerseText({ text, cite }) {
  // Compound citations are stored as "Book X:Y — verse text | Book X:Y — verse text".
  // CONVENTION: single-ref scripture text must never contain literal " | " (space-pipe-space).
  // The data audit (PLAN.txt §12 Phase 1 data state) confirms this is uniformly upheld;
  // if a future edit violates it, the split will fire and the part(s) without " — "
  // will fall through to the unlabeled VerseWithNumbers branch below.
  const parts = text.split(" | ");
  if (parts.length > 1) {
    // Only render compound-part labels when they differ from the outer cite.
    // The outer cite (sheet header or footnote-list-ref) already identifies
    // the ref — showing the same label inside each compound-part duplicates it.
    const normalizedCite = (cite || '').trim();
    return (/*#__PURE__*/
      React.createElement("div", { className: "sc-sheet-compound" },
      parts.map((part, i) => {
        const dashIdx = part.indexOf(" \u2014 ");
        if (dashIdx !== -1) {
          const label = part.slice(0, dashIdx).trim();
          const verse = part.slice(dashIdx + 3);
          const showLabel = label && label !== normalizedCite;
          return (/*#__PURE__*/
            React.createElement("div", { key: i, className: "sc-sheet-compound-part" },
            showLabel && /*#__PURE__*/React.createElement("span", { className: "sc-sheet-compound-label" }, label), /*#__PURE__*/
            React.createElement(VerseWithNumbers, { text: verse, refStr: label || cite })
            ));

        }
        return /*#__PURE__*/React.createElement("div", { key: i, className: "sc-sheet-compound-part" }, /*#__PURE__*/React.createElement(VerseWithNumbers, { text: part, refStr: cite }));
      })
      ));

  }
  return /*#__PURE__*/React.createElement(VerseWithNumbers, { text: text, refStr: cite });
}
