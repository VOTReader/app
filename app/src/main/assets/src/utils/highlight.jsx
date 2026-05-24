/* ═══════════════════════════════════════════════════════════════════════
   highlight — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Highlight-excerpt rendering helpers — used by SearchScreen + cross-volume
   excerpt tap-throughs to highlight matched terms inside the destination DOM.
   Bundled helpers (P5e):
   - normalizeForHighlight
   - splitWithHighlight  (returns JSX)
   - highlightExcerptInDom (imperative DOM mutation)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Normalize text for highlight-matching: smart quotes → ASCII, en/em dash
 * → hyphen, lowercase. Used by both splitWithHighlight (in-component) and
 * highlightExcerptInDom (post-render). Stringifies any input.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function normalizeForHighlight(s) {
  return String(s || "").
  replace(/[‘’]/g, "'").
  replace(/[“”]/g, '"').
  replace(/[–—]/g, "-").
  toLowerCase();
}

/**
 * Split a string at the first normalized occurrence of `needle` and wrap
 * the match in a `<mark class="letter-highlight">`. Returns a React
 * Fragment (or null if no match). Caller is responsible for wrapping the
 * result in any containing element.
 *
 * @param {string | null | undefined} text
 * @param {string | null | undefined} needle  search term (normalized internally)
 * @param {string} keyPrefix                  used to build a stable React key
 * @returns {any}  React fragment | null
 */
export function splitWithHighlight(text, needle, keyPrefix) {
  if (!text || !needle) return null;
  const hay = normalizeForHighlight(text);
  const need = normalizeForHighlight(needle);
  if (!need || need.length > hay.length) return null;
  const idx = hay.indexOf(need);
  if (idx === -1) return null;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + need.length);
  const after = text.slice(idx + need.length);
  return (
    <>
      {before}
      <mark key={`${keyPrefix}-mark`} className="letter-highlight">{match}</mark>
      {after}
    </>
  );
}

/**
 * Imperatively highlight an excerpt inside a rendered letter/body DOM tree.
 * Run AFTER React paints. Tokenizes paragraphs, finds an anchor (longest-
 * prefix match falling back from 8 → 6 → 4 tokens), walks forward through
 * the excerpt with limited drift tolerance, then wraps matching text nodes
 * in `<mark class="letter-highlight">`. Auto-clears after 8.4s by unwrapping
 * the marks. Skips footnote refs / inline scrip refs / pre-existing marks.
 *
 * Returns the paragraph elements that ended up wrapped (for scrollIntoView
 * inspection in callers). Returns [] when the anchor isn't found or the
 * match was too broad (≥85% of paragraphs would be wrapped — likely a bad
 * normalization, not a real excerpt match).
 *
 * @param {HTMLElement | null | undefined} mainEl
 * @param {string | null | undefined} excerpt
 * @returns {HTMLElement[]}
 */
export function highlightExcerptInDom(mainEl, excerpt) {
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

  let exIdx = 0;
  let stIdx = anchor;
  let lastMatchedStreamIdx = anchor;
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
    exIdx++;
    drift++;
    if (drift > maxDrift) break;
  }

  const hits = ranges.filter((r) => r.start <= lastMatchedStreamIdx && r.end > anchor);
  if (hits.length === 0) return [];
  if (hits.length >= ranges.length || hits.length / ranges.length >= 0.85) return [];

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
