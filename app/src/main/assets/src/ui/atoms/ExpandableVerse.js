const EXPAND_THRESHOLD = 130;
const MIN_HIDDEN_WORDS = 20;

function ExpandableVerse({ text, refStr }) {
  const [expanded, setExpanded] = useState(false);
  const hiddenPortion = text.slice(EXPAND_THRESHOLD).trim();
  const hiddenWords = hiddenPortion.split(/\s+/).filter(Boolean).length;
  const isLong = text.length > EXPAND_THRESHOLD && hiddenWords >= MIN_HIDDEN_WORDS;

  const fullContent = /*#__PURE__*/React.createElement(ScriptureVerseText, { text: text, cite: refStr });
  const truncatedContent = /*#__PURE__*/React.createElement(VerseWithNumbers, { text: text.slice(0, EXPAND_THRESHOLD).trimEnd() + "\u2026", refStr: refStr });

  return (/*#__PURE__*/
    React.createElement("span", { className: "footnote-list-verse" },
    isLong && !expanded ? truncatedContent : fullContent,
    isLong && /*#__PURE__*/
    React.createElement("button", {
      onClick: () => setExpanded((e) => !e),
      style: {
        display: "inline-block", marginLeft: "0.5em",
        background: "none", border: "none", cursor: "pointer",
        color: "var(--gold)", fontFamily: "'Cinzel', serif",
        fontSize: "0.72rem", letterSpacing: "0.1em",
        textTransform: "uppercase", padding: "0",
        verticalAlign: "middle", lineHeight: 1
      } },

    expanded ? "Show less \u25b2" : "Read more \u25bc"
    )

    ));
}
