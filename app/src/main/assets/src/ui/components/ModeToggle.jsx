/* ═══════════════════════════════════════════════════════════════════════
   ModeToggle — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ModeToggle({ mode, onChange, showStudy, onShowStudyChange }) {
  if (!showStudy) {
    return (
      <div className="mode-toggle-wrap">
        <div className="mode-toggle">
          <button
            className="mode-btn active"
            onClick={() => onShowStudyChange(true)}
            title="Show study notes, references, and further reading"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            {"On"}
          </button>
        </div>
      </div>
    );

  }
  const isPdf = mode === "pdf";
  return (
    <div className="mode-toggle-wrap">
      <div className="mode-toggle">
        <button
          className="mode-btn active"
          onClick={() => onChange(isPdf ? "inline" : "pdf")}
          title={isPdf ? "PDF Mode — tap to switch to Inline" : "Inline Mode — tap to switch to PDF"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {isPdf ? <path d="M2 6h20M2 12h20M2 18h12" /> : <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />}
          </svg>
          {isPdf ? "PDF" : "Inline"}
        </button>
        <div className="mode-divider" />
        <button
          className="mode-btn"
          onClick={() => onShowStudyChange(false)}
          title="Hide study notes, references, and further reading"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" />
          </svg>
          {"Off"}
        </button>
      </div>
    </div>
  );

}

/* ═══════════════════════════════════════════════════════════════
   INLINE NOTES COMPONENT
═══════════════════════════════════════════════════════════════ */
// Commentary cites (non-lookup scripture notes) may embed inline refs like
// "(Matthew 11:14)". Detect Book-Ch:Vs patterns and style them gold.
export function renderCommentaryCite(text) {
  if (!text) return text;
  // Matches "Matthew 11:14", "1 John 2:15-17", "Psalm 22:1", etc.
  const rx = /\b((?:[123]\s)?[A-Z][a-z]+(?:\s+[A-Za-z]+)*\s+\d+:\d+(?:[-,\s\d]+)?)\b/g;
  const parts = [];
  let last = 0,m;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<span key={m.index} className="inline-scrip-ref">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
