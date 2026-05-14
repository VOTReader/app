function VolumeIndex({ onSelect, currentLetter, isRead, markAsReadEnabled }) {
  const currentRef = React.useRef(null);
  React.useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, []);
  return (/*#__PURE__*/
    React.createElement("div", { className: "vol-index" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-header" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-eyebrow" }, "The Volumes of Truth"), /*#__PURE__*/
    React.createElement("h1", { className: "vol-index-title" }, "Volume Two"), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line r" })
    )
    ), /*#__PURE__*/
    React.createElement("div", { className: "chapter-cards" },
    LETTERS.map((letter) => {
      const isCurrent = letter.id === currentLetter;
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
