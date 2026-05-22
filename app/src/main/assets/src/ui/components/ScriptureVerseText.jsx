/* ═══════════════════════════════════════════════════════════════════════
   ScriptureVerseText — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ScriptureVerseText({ text, cite }) {
  // Compound citations are stored as "Book X:Y — verse text | Book X:Y — verse text".
  // CONVENTION: single-ref scripture text must never contain literal " | " (space-pipe-space).
  // The data audit (PLAN.txt §12 Phase 1 data state) confirms this is uniformly upheld;
  // if a future edit violates it, the split will fire and the part(s) without " — "
  // will fall through to the unlabeled VerseWithNumbers branch below.
  const parts = text.split(" | ");
  if (parts.length > 1) {
    // Only render compound-part labels when they differ from the outer cite.
    // The outer cite (sheet header or footnote-list-ref) already identifies
    // the ref — showing the same label inside each compound-part duplicates it.
    const normalizedCite = (cite || '').trim();
    return (
      <div className="sc-sheet-compound">
        {parts.map((part, i) => {
          const dashIdx = part.indexOf(" — ");
          if (dashIdx !== -1) {
            const label = part.slice(0, dashIdx).trim();
            const verse = part.slice(dashIdx + 3);
            const showLabel = label && label !== normalizedCite;
            return (
              <div key={i} className="sc-sheet-compound-part">
                {showLabel && <span className="sc-sheet-compound-label">{label}</span>}
                <VerseWithNumbers text={verse} refStr={label || cite} />
              </div>
            );
          }
          return (
            <div key={i} className="sc-sheet-compound-part">
              <VerseWithNumbers text={part} refStr={cite} />
            </div>
          );
        })}
      </div>
    );
  }
  return <VerseWithNumbers text={text} refStr={cite} />;
}
