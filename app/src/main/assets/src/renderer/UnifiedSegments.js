function renderTextWithScripRefs(text, baseClassName, onScripClick, highlightText) {
  if (!text) return baseClassName ? /*#__PURE__*/React.createElement("span", { className: baseClassName }, text) : text;
  const hasRef = text.includes('{{ref:');
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

function UnifiedSegments({ content, onFnClick, onScripClick, onInAppLink, activeFn, highlightedFn, highlightText }) {
  if (!Array.isArray(content)) return null;

  return content.map((seg, i) => {
    const key = i;
    const commonProps = { onFnClick, onScripClick, onInAppLink, activeFn, highlightedFn, highlightText };

    switch (seg.type) {
      case 'text':
        return /*#__PURE__*/React.createElement(React.Fragment, { key: key },
          renderTextWithScripRefs(seg.text, null, onScripClick, highlightText));

      case 'emphasis':
        return /*#__PURE__*/React.createElement("em", { key: key },
          renderTextWithScripRefs(seg.text, null, onScripClick, highlightText));

      case 'strong':
        return /*#__PURE__*/React.createElement("strong", { key: key },
          seg.children ? /*#__PURE__*/React.createElement(UnifiedSegments, _extends({ content: seg.children }, commonProps)) :
          renderTextWithScripRefs(seg.text, null, onScripClick, highlightText));

      case 'caps':
        return /*#__PURE__*/React.createElement("span", { key: key, style: { fontWeight: 600, letterSpacing: '0.03em' } }, seg.text);

      case 'footnote-ref':
        const fnId = seg.footnoteId;
        return /*#__PURE__*/React.createElement("span", {
          key: key,
          className: `fn-ref${(activeFn === fnId || highlightedFn === fnId) ? " active" : ""}`,
          "data-fn-num": fnId,
          onClick: () => onFnClick && onFnClick(fnId),
          title: `Footnote ${fnId}`
        }, fnId);

      case 'letter-link':
        return /*#__PURE__*/React.createElement("span", {
          key: key,
          className: "letter-link-ref",
          onClick: () => onInAppLink && onInAppLink(seg.link),
          title: seg.link ? `Open "${seg.link.letterTitle}" in ${seg.link.collection}` : undefined
        }, seg.text || (seg.link && seg.link.letterTitle));

      case 'scripture-ref':
        return /*#__PURE__*/React.createElement("a", {
          key: key,
          className: "wtlb-cite",
          href: "#",
          onClick: (e) => { e.preventDefault(); onScripClick && onScripClick(seg.ref); },
          title: seg.ref
        }, "(", seg.ref, ")");

      case 'nav-ref':
        const bookTitle = BOOKS[seg.bookId]?.title || seg.bookId;
        return /*#__PURE__*/React.createElement("a", {
          key: key,
          className: "fn-link",
          href: "#",
          onClick: (e) => { e.preventDefault(); window.__navToChapter && window.__navToChapter(seg.bookId, seg.chapter); }
        }, "[", bookTitle, " ", seg.chapter, "]");

      case 'stanza-break':
        return /*#__PURE__*/React.createElement("div", { key: key, className: "stanza-break" });

      case 'line-break':
        return /*#__PURE__*/React.createElement("br", { key: key });

      default:
        return /*#__PURE__*/React.createElement(React.Fragment, { key: key }, seg.text);
    }
  });
}

function Segments({ segments, activeFn, onFnClick, onScripClick, onLetterClick, onInAppLink, studyMode, footnotes, highlightText }) {
  return segments.map((seg, i) => {
    if (seg.t === "fn") {
      return (/*#__PURE__*/
        React.createElement("span", { key: i, className: `fn-ref${activeFn === seg.v ? " active" : ""}`,
          "data-fn-num": seg.v,
          onClick: () => onFnClick(seg.v), title: `Footnote ${seg.v}` }, seg.v));

    }
    if (seg.t === "letter-link") {
      if (seg.link && onInAppLink) {
        return (/*#__PURE__*/
          React.createElement("span", { key: i, className: "letter-link-ref",
            onClick: () => onInAppLink(seg.link) }, seg.label));

      }
      return (/*#__PURE__*/
        React.createElement("span", { key: i, className: "letter-link-ref",
          onClick: () => onLetterClick && onLetterClick(seg.letterId, seg.screen) }, seg.label));

    }
    if (seg.t === "stanza-break") return /*#__PURE__*/React.createElement("div", { key: i, className: "stanza-break" });
    const prevV = i > 0 ? segments[i - 1].v || '' : '';
    const v = seg.v && /^[\w(\[{"\u201c\u2018]/.test(seg.v) && /\S$/.test(prevV) ? ' ' + seg.v : seg.v || '';
    if (seg.t === "bold-italic") return /*#__PURE__*/React.createElement(React.Fragment, { key: i }, renderTextWithScripRefs(v, "bold-italic", onScripClick, highlightText));
    if (seg.t === "italic") return /*#__PURE__*/React.createElement(React.Fragment, { key: i }, renderTextWithScripRefs(v, "italic-text", onScripClick, highlightText));
    if (seg.t === "caps") return /*#__PURE__*/React.createElement("span", { key: i, style: { fontWeight: 600, letterSpacing: '0.03em' } }, v);
    return /*#__PURE__*/React.createElement(React.Fragment, { key: i }, renderTextWithScripRefs(v, null, onScripClick, highlightText));
  });
}
