/* ═══════════════════════════════════════════════════════════════════════
   render-text — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   renderTextWithScripRefs — tokenizes body text with embedded {{ref:...}} /
   {{nav:...}} / *italic* / **bold** patterns into a tappable React tree.
   Used by Notes index, Bookmark cards, etc.
   ═══════════════════════════════════════════════════════════════════════ */

export function renderTextWithScripRefs(text, baseClassName, onScripClick, highlightText) {
  if (!text) return baseClassName ? <span className={baseClassName}>{text}</span> : text;
  const hasRef = text.includes('{{ref:');
  // No scripture refs: handle highlight inline, else return as-is.
  if (!hasRef) {
    if (highlightText) {
      const hl = splitWithHighlight(text, highlightText, "hl");
      if (hl) return baseClassName ? <span className={baseClassName}>{hl}</span> : hl;
    }
    return baseClassName ? <span className={baseClassName}>{text}</span> : text;
  }
  const parts = text.split(/(\{\{ref:[^}]+\}\})/g);
  return parts.map((part, i) => {
    const m = part.match(/^\{\{ref:(.+)\}\}$/);
    if (m) {
      const ref = m[1].trim();
      return (
        <a
          key={i}
          className="inline-scrip-ref"
          href="#"
          onClick={(e) => { e.preventDefault(); onScripClick && onScripClick(ref); }}
          title={ref}
        >
          {ref}
        </a>
      );
    }
    if (!part) return null;
    let content = part;
    if (highlightText) {
      const hl = splitWithHighlight(part, highlightText, `hl-${i}`);
      if (hl) content = hl;
    }
    return baseClassName
      ? <span key={i} className={baseClassName}>{content}</span>
      : <React.Fragment key={i}>{content}</React.Fragment>;
  });
}
