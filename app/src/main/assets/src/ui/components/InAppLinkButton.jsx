/* ═══════════════════════════════════════════════════════════════════════
   InAppLinkButton — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function InAppLinkButton({ link, onActivate, compact, label }) {
  if (!link || !onActivate) return null;
  const title = link.letterTitle || label || "Open in App";
  if (compact) {
    return (
      <button
        type="button"
        className="footnote-list-link-btn fn-list-rich"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onActivate(link); }}
      >
        <span className="fn-list-rich-body">
          <span className="fn-list-rich-eyebrow">Open in App</span>
          <span className="fn-list-rich-title">{title}</span>
        </span>
        <span className="chev">{"\u203A"}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="fn-sheet-link-btn"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onActivate(link); }}
    >
      <span className="fn-sheet-link-body">
        <span className="fn-sheet-link-eyebrow">Open in App</span>
        <span className="fn-sheet-link-title">{title}</span>
      </span>
      <span className="fn-sheet-link-chevron">{"\u203A"}</span>
    </button>
  );
}
