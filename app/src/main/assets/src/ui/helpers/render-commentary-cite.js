function renderCommentaryCite(text) {
  if (!text) return text;
  // Matches "Matthew 11:14", "1 John 2:15-17", "Psalm 22:1", etc.
  const rx = /\b((?:[123]\s)?[A-Z][a-z]+(?:\s+[A-Za-z]+)*\s+\d+:\d+(?:[-,\s\d]+)?)\b/g;
  const parts = [];
  let last = 0,m;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(/*#__PURE__*/React.createElement("span", { key: m.index, className: "inline-scrip-ref" }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
