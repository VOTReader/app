/* ═══════════════════════════════════════════════════════════════════════
   SrchSnippet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function SrchSnippet({ text, terms, maxLen = 180 }) {
  const ref = React.useRef(null);

  // After mount, scroll the first <mark> to the vertical center of the
  // fixed-height container so the hit always lands in the middle of the
  // preview box, not at the top or bottom.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = el.querySelector('mark');
    if (!mark) return;
    const elRect = el.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    el.scrollTop = markRect.top - elRect.top - (el.clientHeight - markRect.height) / 2;
  }, []);

  if (!text) return null;
  const snippet = window.VotSearch.snippet(text, terms || [], maxLen);
  const spans = window.VotSearch.highlightSpans(snippet, terms || []);
  return (
    <div ref={ref} className="srch-snippet-scroll">
      {spans.map((s, i) =>
        s.hit ? (
          <mark key={i} className="search-highlight">{s.text}</mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        )
      )}
    </div>
  );
}
