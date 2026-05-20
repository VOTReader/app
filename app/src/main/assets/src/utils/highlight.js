/* ===================================================================
   Highlight-excerpt rendering helpers — used by SearchScreen + cross-volume excerpt tap-throughs to highlight matched terms inside the destination DOM
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - normalizeForHighlight
   - splitWithHighlight
   - highlightExcerptInDom
   =================================================================== */


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

function highlightExcerptInDom(mainEl, excerpt) {
  if (!mainEl || !excerpt) return [];
  const tokenize = (s) => normalizeForHighlight(s).match(/[a-z0-9']+/g) || [];
  const stripFnRefs = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.fn-ref').forEach((f) => f.replaceWith(document.createTextNode(' ')));
    return clone.textContent;
  };
  const exTokens = tokenize(excerpt);
  if (exTokens.length === 0) return [];

  const paraEls = Array.from(mainEl.querySelectorAll("p, div.letter-poetry, div.letter-closing, div.letter-closing-fn"));
  const stream = [];
  const ranges = []; // [{el, start, end}, ...] — end is exclusive
  paraEls.forEach((el) => {
    const tks = tokenize(stripFnRefs(el));
    if (tks.length === 0) return;
    const start = stream.length;
    for (const t of tks) stream.push(t);
    ranges.push({ el, start, end: stream.length });
  });
  if (stream.length === 0) return [];

  // Find anchor by scanning for the longest consecutive prefix match.
  // Try anchorLen 8 → 6 → 4 in turn.
  const findAnchor = (anchorLen) => {
    if (anchorLen > exTokens.length) anchorLen = exTokens.length;
    if (anchorLen < 1) return -1;
    const need = exTokens.slice(0, anchorLen);
    const first = need[0];
    outer: for (let i = 0; i <= stream.length - need.length; i++) {
      if (stream[i] !== first) continue;
      for (let j = 1; j < need.length; j++) if (stream[i+j] !== need[j]) continue outer;
      return i;
    }
    return -1;
  };
  let anchor = findAnchor(8);
  if (anchor === -1) anchor = findAnchor(6);
  if (anchor === -1) anchor = findAnchor(4);
  if (anchor === -1) return [];

  // Walk forward from anchor through the stream, allowing small drift.
  // For each excerpt token, look ahead up to 3 stream tokens for a match.
  // If no match within window, skip the excerpt token (count as drift). Stop
  // when drift exceeds 25% of excerpt length, or stream/excerpt exhausted.
  let exIdx = 0; // cursor into exTokens
  let stIdx = anchor; // cursor into stream
  let lastMatchedStreamIdx = anchor; // furthest stream pos with a match
  const maxDrift = Math.max(8, Math.floor(exTokens.length * 0.25));
  let drift = 0;
  while (exIdx < exTokens.length && stIdx < stream.length) {
    const want = exTokens[exIdx];
    if (stream[stIdx] === want) {
      lastMatchedStreamIdx = stIdx;
      exIdx++;
      stIdx++;
      continue;
    }
    // Look ahead in stream for `want` within a small window.
    let foundAt = -1;
    const lookahead = Math.min(3, stream.length - stIdx);
    for (let k = 1; k < lookahead; k++) {
      if (stream[stIdx + k] === want) { foundAt = stIdx + k; break; }
    }
    if (foundAt !== -1) {
      lastMatchedStreamIdx = foundAt;
      exIdx++;
      stIdx = foundAt + 1;
      continue;
    }
    // No match within stream window — try advancing excerpt cursor instead.
    exIdx++;
    drift++;
    if (drift > maxDrift) break;
  }

  // Highlight every paragraph whose [start, end) overlaps [anchor, lastMatchedStreamIdx].
  const hits = ranges.filter((r) => r.start <= lastMatchedStreamIdx && r.end > anchor);
  if (hits.length === 0) return [];
  // If the excerpt spans (essentially) the entire letter, the highlight adds
  // no value — it's just the whole page lit up. Skip the flash; the reader
  // is meant to read from the top.
  if (hits.length >= ranges.length || hits.length / ranges.length >= 0.85) return [];

  // Wrap each hit paragraph's text in <mark class="letter-highlight"> so the
  // highlight follows the text shape (line-break-natural) instead of being a
  // square block around the paragraph. Skip text inside footnote refs and
  // inline scripture-ref anchors so those keep their original styling.
  const wrapped = [];
  const isSkippable = (n) => {
    let p = n.parentNode;
    while (p && p.nodeType === 1) {
      if (p.classList) {
        if (p.classList.contains('fn-ref')) return true;
        if (p.classList.contains('inline-scrip-ref')) return true;
        if (p.tagName === 'MARK' && p.classList.contains('letter-highlight')) return true;
      }
      p = p.parentNode;
    }
    return false;
  };
  hits.forEach((r) => {
    const tw = document.createTreeWalker(r.el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let n;
    while ((n = tw.nextNode())) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      if (isSkippable(n)) continue;
      textNodes.push(n);
    }
    textNodes.forEach((tn) => {
      const m = document.createElement('mark');
      m.className = 'letter-highlight';
      tn.parentNode.insertBefore(m, tn);
      m.appendChild(tn);
      wrapped.push(m);
    });
  });
  if (wrapped.length === 0) return [];
  // Scroll the first paragraph in the span into view (instant).
  hits[0].el.scrollIntoView({ block: "center" });
  setTimeout(() => {
    wrapped.forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
  }, 8400);
  return hits.map((r) => r.el);
}

