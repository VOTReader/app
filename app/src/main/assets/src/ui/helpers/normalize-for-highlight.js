function normalizeForHighlight(s) {
  return String(s || "").
  replace(/[\u2018\u2019]/g, "'").
  replace(/[\u201c\u201d]/g, '"').
  replace(/[\u2013\u2014]/g, "-").
  toLowerCase();
}

function splitWithHighlight(text, needle, keyPrefix) {
  if (!text || !needle) return null;
  const hay = normalizeForHighlight(text);
  const need = normalizeForHighlight(needle);
  if (!need || need.length > hay.length) return null;
  const idx = hay.indexOf(need);
  if (idx === -1) return null;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + need.length);
  const after = text.slice(idx + need.length);
  return (/*#__PURE__*/
    React.createElement(React.Fragment, null,
    before, /*#__PURE__*/
    React.createElement("mark", { key: `${keyPrefix}-mark`, className: "letter-highlight" }, match),
    after
    ));
}
