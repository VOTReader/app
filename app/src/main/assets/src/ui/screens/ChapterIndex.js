function ChapterIndex({ book, onSelect, onBack, onSearch, onHistory, onSettings, currentChapter, theme, onThemeChange, isRead, markAsReadEnabled, restoredNames, showChapterTitle }) {
  const currentRef = React.useRef(null);
  React.useEffect(() => {
    if (currentRef.current) {
      setTimeout(() => currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    }
  }, []);
  const getChapterTitle = (ch) => {
    if (showChapterTitle === false) return null;
    if (restoredNames && typeof BOOKS_RESTORED !== "undefined" && BOOKS_RESTORED[book.id]) {
      const r = BOOKS_RESTORED[book.id].chapters.find((c) => c.num === ch.num);
      if (r && r.title) return r.title;
    }
    return ch.title;
  };
  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Books"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/

      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange })) }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-header" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-eyebrow" }, "Scriptures of Truth"), /*#__PURE__*/
    React.createElement("h1", { className: "vol-index-title" }, book.title), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-subtitle" }, book.subtitle), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line r" })
    )
    ), /*#__PURE__*/
    React.createElement("div", { className: "chapter-cards" },
    book.chapters.map((ch, i) => {
      const isCurrent = ch.num === currentChapter;
      return (/*#__PURE__*/
        React.createElement("button", {
          key: ch.num,
          ref: isCurrent ? currentRef : null,
          className: `chapter-card-btn${isCurrent ? " is-current" : ""}`,
          onClick: () => onSelect(ch.num) }, /*#__PURE__*/

        React.createElement("span", { className: "chapter-card-num" }, ch.num), /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-divider" }), /*#__PURE__*/
        React.createElement("div", { className: "chapter-card-info" },
        (() => {
          const t = getChapterTitle(ch);
          return t ? /*#__PURE__*/
          React.createElement("div", { className: "chapter-card-title" }, t) : /*#__PURE__*/

          React.createElement("div", { className: "chapter-card-title untitled" }, "Chapter ", ch.num);

        })()
        ),
        markAsReadEnabled && isRead(ch.num) && /*#__PURE__*/React.createElement("span", { className: "read-check" }, "\u2713")
        ));

    })
    )
    )
    ));
}
