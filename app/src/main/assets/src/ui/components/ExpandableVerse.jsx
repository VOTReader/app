/* ═══════════════════════════════════════════════════════════════════════
   ExpandableVerse — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export const EXPAND_THRESHOLD = 130;
export const MIN_HIDDEN_WORDS = 20; // only collapse if hiding at least this many whole words

export function ExpandableVerse({ text, refStr }) {
  const [expanded, setExpanded] = React.useState(false);

  // Compound refs store text as "partLabel — verse text | partLabel — verse text".
  // VerseWithNumbers doesn't split on " | ", so the raw string would make the
  // "18:20-33 — " chapter-label render as plain white text in the truncated preview.
  // Extract just the first part's verse content and its label (e.g. "18:20-33")
  // as the preview ref, so Strategy 0 verse-number detection works correctly.
  let previewText = text;
  let previewRef = refStr;
  if (text.includes(" | ")) {
    const firstPart = text.split(" | ")[0];
    const dashIdx = firstPart.indexOf(" — ");
    if (dashIdx !== -1) {
      previewRef = firstPart.slice(0, dashIdx).trim();
      previewText = firstPart.slice(dashIdx + 3);
    } else {
      previewText = firstPart;
    }
  }

  const hiddenPortion = previewText.slice(EXPAND_THRESHOLD).trim();
  const hiddenWords = hiddenPortion.split(/\s+/).filter(Boolean).length;
  const isLong = text.length > EXPAND_THRESHOLD && hiddenWords >= MIN_HIDDEN_WORDS;

  const fullContent = <ScriptureVerseText text={text} cite={refStr} />;
  const truncatedContent = <VerseWithNumbers text={previewText.slice(0, EXPAND_THRESHOLD).trimEnd() + "…"} refStr={previewRef} />;

  return (
    <span className="footnote-list-verse">
      {isLong && !expanded ? truncatedContent : fullContent}
      {isLong && (
        <button
          // stopPropagation: the parent .footnote-list-item card has an onClick
          // that calls scrollToBubble(num) — without this, tapping Read more
          // ALSO scrolls the page up to the in-body footnote bubble.
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v); }}
          style={{
            display: "inline-block", marginLeft: "0.5em",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--gold)", fontFamily: "'Cinzel', serif",
            fontSize: "0.72rem", letterSpacing: "0.1em",
            textTransform: "uppercase", padding: "0",
            verticalAlign: "middle", lineHeight: 1
          }}
        >
          {expanded ? "Show less ▲" : "Read more ▼"}
        </button>
      )}
    </span>
  );
}
