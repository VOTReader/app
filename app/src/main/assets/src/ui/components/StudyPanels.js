/* ═══════════════════════════════════════════════════════════════════════
   StudyPanels — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function StudyPanels({ scriptures, votNotes, onScriptureClick, onVotLetterClick }) {
  const hasScriptures = scriptures && scriptures.length > 0;
  const hasVot = votNotes && votNotes.length > 0;
  if (!hasScriptures && !hasVot) return null;
  return (/*#__PURE__*/
    React.createElement("div", { className: "study-panels" },
    hasScriptures && /*#__PURE__*/
    React.createElement("div", { className: "study-panel-group" }, /*#__PURE__*/
    React.createElement("div", { className: "study-panel-group-title" }, "Scripture References"), /*#__PURE__*/
    React.createElement("div", { className: "scripture-refs" },
    scriptures.map((s, i) => {
      const hasVerse = !!MATTHEW_NKJV[s.cite];
      return hasVerse ? /*#__PURE__*/
      React.createElement("button", { key: i, className: "scripture-ref", onClick: () => onScriptureClick && onScriptureClick(s) }, /*#__PURE__*/
      React.createElement("span", { className: "scripture-ref-tag" }, s.ref), /*#__PURE__*/
      React.createElement("span", { className: "scripture-ref-text" }, s.cite), /*#__PURE__*/
      React.createElement("span", { className: "scripture-ref-chevron" }, "\u203A")
      ) : /*#__PURE__*/

      React.createElement("div", { key: i, className: "scripture-ref scripture-ref-note" }, /*#__PURE__*/
      React.createElement("span", { className: "scripture-ref-tag" }, s.ref), /*#__PURE__*/
      React.createElement("span", { className: "scripture-ref-text" }, renderCommentaryCite(s.cite))
      );

    })
    )
    ),

    hasVot && /*#__PURE__*/
    React.createElement("div", { className: "study-panel-group" }, /*#__PURE__*/
    React.createElement("div", { className: "study-panel-group-title" }, "Volumes of Truth Notes"), /*#__PURE__*/
    React.createElement("div", { className: "vot-notes" },
    votNotes.map((n, i) => {
      const canTap = onVotLetterClick && !!resolveVotLetter(n.vol, n.letter);
      const hm = isHiddenManna(n);
      const badge = hm ? /*#__PURE__*/
      React.createElement("span", { className: "vot-note-hm", title: "Hidden Manna \u2014 The Word of The Lord Spoken to Timothy" }, "HM") :
      canTap ? /*#__PURE__*/
      React.createElement("span", { className: "vot-note-chevron" }, "\u203A") :
      null;
      const inner = /*#__PURE__*/
      React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("div", { className: "vot-note-header" }, /*#__PURE__*/
      React.createElement("span", { className: "vot-note-ref" }, n.ref), /*#__PURE__*/
      React.createElement("span", { className: "vot-note-vol" }, n.vol),
      badge
      ), /*#__PURE__*/
      React.createElement("div", { className: "vot-note-letter" }, "\"", n.letter, "\""),
      n.excerpt && /*#__PURE__*/React.createElement("div", { className: "vot-note-excerpt" }, n.excerpt)
      );

      return canTap ? /*#__PURE__*/
      React.createElement("button", { key: i, className: "vot-note vot-note-tappable", onClick: () => onVotLetterClick(n.vol, n.letter, n.excerpt) }, inner) : /*#__PURE__*/

      React.createElement("div", { key: i, className: "vot-note" }, inner);

    })
    )
    )

    ));

}
