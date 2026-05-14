function ScriptureVerseText({ text, cite }) {
  const parts = text.split(" | ");
  if (parts.length > 1) {
    const normalizedCite = (cite || '').trim();
    return (/*#__PURE__*/
      React.createElement("div", { className: "sc-sheet-compound" },
      parts.map((part, i) => {
        const dashIdx = part.indexOf(" \u2014 ");
        if (dashIdx !== -1) {
          const label = part.slice(0, dashIdx).trim();
          const verse = part.slice(dashIdx + 3);
          const showLabel = label && label !== normalizedCite;
          return (/*#__PURE__*/
            React.createElement("div", { key: i, className: "sc-sheet-compound-part" },
            showLabel && /*#__PURE__*/React.createElement("span", { className: "sc-sheet-compound-label" }, label), /*#__PURE__*/
            React.createElement(VerseWithNumbers, { text: verse, refStr: label || cite })
            ));

        }
        return /*#__PURE__*/React.createElement("div", { key: i, className: "sc-sheet-compound-part" }, /*#__PURE__*/React.createElement(VerseWithNumbers, { text: part, refStr: cite }));
      })
      ));

  }
  return /*#__PURE__*/React.createElement(VerseWithNumbers, { text: text, refStr: cite });
}

function VerseWithNumbers({ text, refStr }) {
  const segments = splitIntoVerses(text, refStr);
  if (!segments) {
    const cleaned = (text || "").replace(/^[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*/, "");
    return /*#__PURE__*/React.createElement("span", null, cleaned);
  }
  return (/*#__PURE__*/
    React.createElement("span", null,
    segments.map((seg, i) => /*#__PURE__*/
    React.createElement("span", { key: i }, /*#__PURE__*/
    React.createElement("sup", { className: "verse-sup" }, seg.vNum),
    seg.text.replace(/^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/, ''), i < segments.length - 1 ? " " : ""
    )
    )
    ));
}
