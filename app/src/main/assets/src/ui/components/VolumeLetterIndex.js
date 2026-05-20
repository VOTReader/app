/* ═══════════════════════════════════════════════════════════════════════
   VolumeLetterIndex — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function VolumeLetterIndex({ volumeTitle, eyebrow, letters, preface, onSelect, onSelectPreface, currentLetter, isRead, markAsReadEnabled, columns }) {
  const currentRef = React.useRef(null);
  React.useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, []);
  return (/*#__PURE__*/
    React.createElement("div", { className: "vol-index" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-header" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-eyebrow" }, eyebrow || "The Volumes of Truth"), /*#__PURE__*/
    React.createElement("h1", { className: "vol-index-title" }, volumeTitle), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line r" })
    )
    ), /*#__PURE__*/
    React.createElement("div", { className: `chapter-cards${columns === 2 ? " two-col" : ""}` },
    preface && (columns === 2 ? /*#__PURE__*/
    React.createElement("button", { className: "chapter-card-btn", onClick: () => onSelectPreface && onSelectPreface(preface.id) }, /*#__PURE__*/
    React.createElement("div", { className: "two-col-inner" }, /*#__PURE__*/
    React.createElement("div", { className: "two-col-num" }, "0"), /*#__PURE__*/
    React.createElement("div", { className: "two-col-title" }, preface.title)
    )
    ) : /*#__PURE__*/

    React.createElement("button", { className: "chapter-card-btn", onClick: () => onSelectPreface && onSelectPreface(preface.id) }, /*#__PURE__*/
    React.createElement("span", { className: "chapter-card-num" }, "0"), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-divider" }), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-info" }, /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-label" }, "Preface"), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-title" }, preface.title)
    ),
    markAsReadEnabled && isRead(preface.id) && /*#__PURE__*/React.createElement("span", { className: "read-check", style: { marginLeft: '0.4rem' } }, "\u2713")
    )),

    letters.map((letter) => {
      const isCurrent = letter.id === currentLetter;
      if (columns === 2) {
        return (/*#__PURE__*/
          React.createElement("button", { key: letter.id,
            className: `chapter-card-btn${isCurrent ? " is-current" : ""}`,
            ref: isCurrent ? currentRef : null,
            onClick: () => onSelect(letter.id) }, /*#__PURE__*/

          React.createElement("div", { className: "two-col-inner" }, /*#__PURE__*/
          React.createElement("div", { className: "two-col-num" }, letter.num), /*#__PURE__*/
          React.createElement("div", { className: "two-col-title" }, letter.title)
          )
          ));

      }
      return (/*#__PURE__*/
        React.createElement("button", { key: letter.id,
          className: `chapter-card-btn${isCurrent ? " is-current" : ""}`,
          ref: isCurrent ? currentRef : null,
          onClick: () => onSelect(letter.id) }, /*#__PURE__*/

        React.createElement("span", { className: "chapter-card-num" }, letter.num), /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-divider" }), /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-info" }, /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-label" }, letter.date), /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-title" }, letter.title)
        ),
        markAsReadEnabled && isRead(letter.id) && /*#__PURE__*/React.createElement("span", { className: "read-check", style: { marginLeft: '0.4rem' } }, "\u2713")
        ));

    })
    )
    ));

}
