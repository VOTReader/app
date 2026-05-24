/* ════════════════════════════════════════════════════════════════════════
   Segments — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function Segments({ segments, activeFn, onFnClick, onScripClick, onLetterClick, onInAppLink, studyMode: _studyMode, footnotes: _footnotes, highlightText }) {
  return segments.map((seg, i) => {
    if (seg.t === "fn") {
      // Always render as a gold circled number (Volumes style). Studies
      // and Volumes now use the exact same footnote affordance: tap the
      // number → FootnoteSheet shows scripture text / in-app link /
      // external URL depending on the footnote type.
      return (
        <span
          key={i}
          className={`fn-ref${activeFn === seg.v ? " active" : ""}`}
          data-fn-num={seg.v}
          onClick={() => onFnClick(seg.v)}
          title={`Footnote ${seg.v}`}
        >{seg.v}</span>
      );
    }
    if (seg.t === "letter-link") {
      // Two tap-through mechanisms:
      //   (a) seg.link { collection, letterTitle } — cross-volume via
      //       openInAppLetter, with back-stack routing + back-hint pill.
      //   (b) seg.letterId + seg.screen — legacy matthew.js path.
      if (seg.link && onInAppLink) {
        return (
          <span key={i} className="letter-link-ref" onClick={() => onInAppLink(seg.link)}>{seg.label}</span>
        );
      }
      return (
        <span key={i} className="letter-link-ref" onClick={() => onLetterClick && onLetterClick(seg.letterId, seg.screen)}>{seg.label}</span>
      );
    }
    if (seg.t === "stanza-break") return <div key={i} className="stanza-break" />;
    // Collision guard: inject a leading space when the previous segment ended with
    // a non-whitespace character and this segment starts with a word char, opening
    // paren/bracket, or opening quote. Avoids false positives before trailing
    // punctuation (commas, periods, etc.) that the fetch script split into segments.
    const prevV = i > 0 ? segments[i - 1].v || '' : '';
    const v = seg.v && /^[\w([{"\u201c\u2018]/.test(seg.v) && /\S$/.test(prevV) ? ' ' + seg.v : seg.v || '';
    if (seg.t === "bold-italic") return <React.Fragment key={i}>{renderTextWithScripRefs(v, "bold-italic", onScripClick, highlightText)}</React.Fragment>;
    if (seg.t === "italic") return <React.Fragment key={i}>{renderTextWithScripRefs(v, "italic-text", onScripClick, highlightText)}</React.Fragment>;
    if (seg.t === "caps") return <span key={i} style={{ fontWeight: 600, letterSpacing: '0.03em' }}>{v}</span>;
    return <React.Fragment key={i}>{renderTextWithScripRefs(v, null, onScripClick, highlightText)}</React.Fragment>;
  });
}
