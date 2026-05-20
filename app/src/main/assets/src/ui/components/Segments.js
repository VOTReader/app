/* ═══════════════════════════════════════════════════════════════════════
   Segments — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function Segments({ segments, activeFn, onFnClick, onScripClick, onLetterClick, onInAppLink, studyMode, footnotes, highlightText }) {
  return segments.map((seg, i) => {
    if (seg.t === "fn") {
      // Always render as a gold circled number (Volumes style). Studies
      // and Volumes now use the exact same footnote affordance: tap the
      // number → FootnoteSheet shows scripture text / in-app link /
      // external URL depending on the footnote type.
      return (/*#__PURE__*/
        React.createElement("span", { key: i, className: `fn-ref${activeFn === seg.v ? " active" : ""}`,
          "data-fn-num": seg.v,
          onClick: () => onFnClick(seg.v), title: `Footnote ${seg.v}` }, seg.v));

    }
    if (seg.t === "letter-link") {
      // Two tap-through mechanisms:
      //   (a) seg.link { collection, letterTitle } — cross-volume via
      //       openInAppLetter, with back-stack routing + back-hint pill.
      //   (b) seg.letterId + seg.screen — legacy matthew.js path.
      if (seg.link && onInAppLink) {
        return (/*#__PURE__*/
          React.createElement("span", { key: i, className: "letter-link-ref",
            onClick: () => onInAppLink(seg.link) }, seg.label));

      }
      return (/*#__PURE__*/
        React.createElement("span", { key: i, className: "letter-link-ref",
          onClick: () => onLetterClick && onLetterClick(seg.letterId, seg.screen) }, seg.label));

    }
    if (seg.t === "stanza-break") return /*#__PURE__*/React.createElement("div", { key: i, className: "stanza-break" });
    // Collision guard: inject a leading space when the previous segment ended with
    // a non-whitespace character and this segment starts with a word char, opening
    // paren/bracket, or opening quote. Avoids false positives before trailing
    // punctuation (commas, periods, etc.) that the fetch script split into segments.
    const prevV = i > 0 ? segments[i - 1].v || '' : '';
    const v = seg.v && /^[\w(\[{"\u201c\u2018]/.test(seg.v) && /\S$/.test(prevV) ? ' ' + seg.v : seg.v || '';
    if (seg.t === "bold-italic") return /*#__PURE__*/React.createElement(React.Fragment, { key: i }, renderTextWithScripRefs(v, "bold-italic", onScripClick, highlightText));
    if (seg.t === "italic") return /*#__PURE__*/React.createElement(React.Fragment, { key: i }, renderTextWithScripRefs(v, "italic-text", onScripClick, highlightText));
    if (seg.t === "caps") return /*#__PURE__*/React.createElement("span", { key: i, style: { fontWeight: 600, letterSpacing: '0.03em' } }, v);
    return /*#__PURE__*/React.createElement(React.Fragment, { key: i }, renderTextWithScripRefs(v, null, onScripClick, highlightText));
  });
}
