/* ═══════════════════════════════════════════════════════════════════════
   SrchSnippet — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function SrchSnippet({ text, terms, maxLen = 180 }) {
  if (!text) return null;
  const snippet = window.VotSearch.snippet(text, terms || [], maxLen);
  const spans = window.VotSearch.highlightSpans(snippet, terms || []);
  return (/*#__PURE__*/
    React.createElement("span", null,
    spans.map((s, i) =>
    s.hit ? /*#__PURE__*/
    React.createElement("mark", { key: i, className: "search-highlight" }, s.text) : /*#__PURE__*/
    React.createElement(React.Fragment, { key: i }, s.text)
    )
    ));

}
