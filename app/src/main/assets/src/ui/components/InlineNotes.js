/* ═══════════════════════════════════════════════════════════════════════
   InlineNotes — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function InlineNotes({ scriptures, votNotes, onScriptureClick, onVotLetterClick }) {
  if (!scriptures.length && !votNotes.length) return null;
  return (/*#__PURE__*/
    React.createElement("div", { className: "inline-notes" },
    scriptures.map((s, i) => {
      const hasVerse = !!MATTHEW_NKJV[s.cite];
      return hasVerse ? /*#__PURE__*/
      React.createElement("button", { key: `s${i}`, className: "inline-note-scripture", onClick: () => onScriptureClick && onScriptureClick(s) }, /*#__PURE__*/
      React.createElement("span", { className: "inline-note-tag" }, s.ref), /*#__PURE__*/
      React.createElement("span", { className: "inline-note-cite" }, s.cite), /*#__PURE__*/
      React.createElement("span", { className: "inline-note-chevron" }, "\u203A")
      ) : /*#__PURE__*/

      React.createElement("div", { key: `s${i}`, className: "inline-note-scripture inline-note-plain" }, /*#__PURE__*/
      React.createElement("span", { className: "inline-note-tag" }, s.ref), /*#__PURE__*/
      React.createElement("span", { className: "inline-note-cite" }, renderCommentaryCite(s.cite))
      );

    }),
    votNotes.map((n, i) => {
      const canTap = onVotLetterClick && !!resolveVotLetter(n.vol, n.letter);
      const hm = isHiddenManna(n);
      const badge = hm ? /*#__PURE__*/
      React.createElement("span", { className: "inline-vot-hm", title: "Hidden Manna \u2014 The Word of The Lord Spoken to Timothy" }, "HM") :
      canTap ? /*#__PURE__*/
      React.createElement("span", { className: "inline-vot-chevron" }, "\u203A") :
      null;
      const inner = /*#__PURE__*/
      React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("div", { className: "inline-vot-header" }, /*#__PURE__*/
      React.createElement("span", { className: "inline-vot-ref" }, n.ref), /*#__PURE__*/
      React.createElement("span", { className: "inline-vot-vol" }, n.vol),
      badge
      ), /*#__PURE__*/
      React.createElement("div", { className: "inline-vot-letter" }, "\"", n.letter, "\""),
      n.excerpt && /*#__PURE__*/React.createElement("div", { className: "inline-vot-excerpt" }, n.excerpt)
      );

      return canTap ? /*#__PURE__*/
      React.createElement("button", {
        key: `v${i}`,
        className: "inline-vot-note inline-vot-note-tappable",
        onClick: () => onVotLetterClick(n.vol, n.letter, n.excerpt) },
      inner) : /*#__PURE__*/

      React.createElement("div", { key: `v${i}`, className: "inline-vot-note" }, inner);

    })
    ));

}
