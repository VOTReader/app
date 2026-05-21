/* ===================================================================
   renderTextWithScripRefs — JSX-free React tokenizer that turns body text with embedded {{ref:...}} / {{nav:...}} / *italic* / **bold** patterns into a tappable React tree. Used by Notes index, Bookmark cards, etc.
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - renderTextWithScripRefs
   =================================================================== */


export function renderTextWithScripRefs(text, baseClassName, onScripClick, highlightText) {
  if (!text) return baseClassName ? /*#__PURE__*/React.createElement("span", { className: baseClassName }, text) : text;
  const hasRef = text.includes('{{ref:');
  // No scripture refs: handle highlight inline, else return as-is.
  if (!hasRef) {
    if (highlightText) {
      const hl = splitWithHighlight(text, highlightText, "hl");
      if (hl) return baseClassName ? /*#__PURE__*/React.createElement("span", { className: baseClassName }, hl) : hl;
    }
    return baseClassName ? /*#__PURE__*/React.createElement("span", { className: baseClassName }, text) : text;
  }
  const parts = text.split(/(\{\{ref:[^}]+\}\})/g);
  return parts.map((part, i) => {
    const m = part.match(/^\{\{ref:(.+)\}\}$/);
    if (m) {
      const ref = m[1].trim();
      return (/*#__PURE__*/
        React.createElement("a", { key: i, className: "inline-scrip-ref", href: "#",
          onClick: (e) => {e.preventDefault();onScripClick && onScripClick(ref);},
          title: ref }, ref));

    }
    if (!part) return null;
    let content = part;
    if (highlightText) {
      const hl = splitWithHighlight(part, highlightText, `hl-${i}`);
      if (hl) content = hl;
    }
    return baseClassName ? /*#__PURE__*/
    React.createElement("span", { key: i, className: baseClassName }, content) : /*#__PURE__*/
    React.createElement(React.Fragment, { key: i }, content);
  });
}

