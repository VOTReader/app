/* ═══════════════════════════════════════════════════════════════════════
   SrchSnippet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function SrchSnippet({ text, terms, maxLen = 180 }) {
  if (!text) return null;
  const snippet = window.VotSearch.snippet(text, terms || [], maxLen);
  const spans = window.VotSearch.highlightSpans(snippet, terms || []);
  return (
    <span>
      {spans.map((s, i) =>
        s.hit ? (
          <mark key={i} className="search-highlight">{s.text}</mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        )
      )}
    </span>
  );
}
