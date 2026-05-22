/* ═══════════════════════════════════════════════════════════════════════
   InlineEcho — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function InlineEcho({ scriptures, votNotes }) {
  if (!scriptures.length && !votNotes.length) return null;
  const scrollToRef = (ref) => {
    const ranges = parseRefRanges(ref);
    if (ranges.length > 0) {
      const target = document.getElementById(`v-${ranges[0].end}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  return (
    <div className="inline-echo">
      {scriptures.map((s, i) => (
        <button key={`es${i}`} className="inline-echo-pill" onClick={() => scrollToRef(s.ref)} title={`See note at ${s.ref}`}>
          <span className="echo-arrow">{"↑"}</span>
          <span>{s.ref}</span>
        </button>
      ))}
      {votNotes.map((n, i) => (
        <button key={`ev${i}`} className="inline-echo-pill" onClick={() => scrollToRef(n.ref)} title={`See note at ${n.ref}`}>
          <span className="echo-arrow">{"↑"}</span>
          <span>{n.ref}{" — "}{n.vol}</span>
        </button>
      ))}
    </div>
  );
}
