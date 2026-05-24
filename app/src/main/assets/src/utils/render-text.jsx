/* ═══════════════════════════════════════════════════════════════════════
   render-text — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   renderTextWithScripRefs — tokenizes body text with embedded {{ref:...}} /
   {{nav:...}} / *italic* / **bold** patterns into a tappable React tree.
   Used by Notes index, Bookmark cards, etc.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Render a string with embedded `{{ref:Book Chapter:Verse}}` patterns as
 * a React tree: literal segments become text (optionally wrapped in a
 * span with `baseClassName`), and ref tokens become `<a>` tags that fire
 * `onScripClick(ref)`. If `highlightText` is provided, plain segments
 * are passed through `splitWithHighlight` (a global) to surface a span
 * around the match.
 *
 * Returns either a React.ReactNode tree (when refs/highlights are
 * present) or the bare string (no refs, no highlight, no className) —
 * callers must handle both shapes.
 *
 * @param {string | null | undefined} text
 * @param {string} [baseClassName]   wraps plain segments + the highlighted span
 * @param {((ref: string) => void) | null | undefined} [onScripClick]
 * @param {string | null | undefined} [highlightText]  substring to highlight, if any
 * @returns {any}  React node | string
 */
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
