function BibleChapterView({ book, chapter, onIndex, onNavigate, prevBook, nextBook, onPrevBook, onNextBook, nextBoundaryTitle, prevBoundaryTitle, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, markAsReadEnabled, showProgressBar, translation, restoredNames, showChapterTitle, showSectionHeadings, titleFocusHidden, setTitleFocusHidden, headingsFocusHidden, setHeadingsFocusHidden, hlTick, onLinkOpen, backHint, onTapThroughBack }) {
  const [highlightedVerses, setHighlightedVerses] = React.useState([]);
  const restoredCh = restoredNames && typeof BOOKS_RESTORED !== "undefined" &&
  BOOKS_RESTORED[book.id] &&
  BOOKS_RESTORED[book.id].chapters.find((c) => c.num === chapter.num) || null;
  const displayChapterTitle = restoredCh && restoredCh.title || chapter.title;
  const getSectionHeading = (si, sec) => {
    if (restoredCh && restoredCh.sections && restoredCh.sections[si] && restoredCh.sections[si].heading) {
      return restoredCh.sections[si].heading;
    }
    return sec.heading;
  };
  useEffect(() => {
    if (!surpriseAnchor || surpriseAnchor.type !== "verse") return;
    const vs = surpriseAnchor.verses;
    setHighlightedVerses(vs);
    const timer = setTimeout(() => {
      const el = document.getElementById(`v-${vs[0]}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const fadeTimer = setTimeout(() => setHighlightedVerses([]), 4000);
    return () => {clearTimeout(timer);clearTimeout(fadeTimer);};
  }, [surpriseAnchor]);
  const prevCh = book.chapters.find((c) => c.num === chapter.num - 1);
  const nextCh = book.chapters.find((c) => c.num === chapter.num + 1);

  useMarkAsRead(markAsReadEnabled, onMarkRead);

  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { showProgress: showProgressBar, navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home nav-back-icon", onClick: onIndex, title: `← ${book.title}`, "aria-label": `Back to ${book.title}` }, "\u2039"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/
      React.createElement("div", { className: "nav-arrows" }, /*#__PURE__*/
      React.createElement("button", { className: "nav-arrow-btn", disabled: !prevCh && !prevBook,
        onClick: () => prevCh ? onNavigate(prevCh.num) : onPrevBook && onPrevBook(),
        title: "Previous", "aria-label": "Previous chapter" }, "\u2039"), /*#__PURE__*/
      React.createElement("button", { className: "nav-arrow-btn", disabled: !nextCh && !nextBook,
        onClick: () => nextCh ? onNavigate(nextCh.num) : onNextBook && onNextBook(),
        title: "Next", "aria-label": "Next chapter" }, "\u203A")
      ), /*#__PURE__*/
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange, reading: true })
      ) }, /*#__PURE__*/
    React.createElement(StickyChapterNav, {
      onPrev: () => prevCh ? onNavigate(prevCh.num) : onPrevBook && onPrevBook(),
      onNext: () => nextCh ? onNavigate(nextCh.num) : onNextBook && onNextBook(),
      prevDisabled: !prevCh && !prevBook,
      nextDisabled: !nextCh && !nextBook,
      prevLabel: "Previous chapter",
      nextLabel: "Next chapter" }
    ),
    backHint && /*#__PURE__*/
    React.createElement("div", { className: "back-hint-row" }, /*#__PURE__*/
      React.createElement("button", { className: "back-hint-pill", onClick: onTapThroughBack, "aria-label": "Back to source" }, /*#__PURE__*/
        React.createElement("span", { className: "back-hint-arrow" }, "‹"), "Back to ", /*#__PURE__*/
        React.createElement("span", { className: "back-hint-title" }, backHint.volumeLabel ? `${backHint.volumeLabel} · ${backHint.title}` : backHint.title)
      )
    ),
    (() => {
      const titleEffective = showChapterTitle && !titleFocusHidden;
      const canFocusTitle = showChapterTitle && displayChapterTitle;
      const hasCuratedTitle = !!displayChapterTitle;
      const titleText = titleEffective && hasCuratedTitle ? displayChapterTitle : book.subtitle;
      const titleIsTappable = titleEffective && hasCuratedTitle;
      return (/*#__PURE__*/
        React.createElement("header", { className: "hero" }, /*#__PURE__*/
        React.createElement("div", { className: `hero-bg${OT_BOOK_IDS.has(book.id) ? " ot" : ""}` }), /*#__PURE__*/
        React.createElement("div", { className: "hero-content" }, /*#__PURE__*/
        React.createElement("div", { className: "hero-eyebrow" }, book.title, " \xA0\xB7\xA0 Chapter ", chapter.num), /*#__PURE__*/
        React.createElement("h1", {
          className: `hero-title${titleIsTappable ? " hero-title-tappable" : ""}`,
          onClick: titleIsTappable ? () => setTitleFocusHidden && setTitleFocusHidden(true) : undefined,
          title: titleIsTappable ? "Tap to hide chapter title" : undefined,
          role: titleIsTappable ? "button" : undefined },
        titleText),
        canFocusTitle && titleFocusHidden && /*#__PURE__*/
        React.createElement("button", {
          className: "hero-subtitle-restore",
          onClick: () => setTitleFocusHidden && setTitleFocusHidden(false),
          title: "Show chapter title",
          "aria-label": "Show chapter title" },
        "+ Show chapter title"), /*#__PURE__*/

        React.createElement("div", { className: "hero-ornament" }, /*#__PURE__*/
        React.createElement("div", { className: "hero-ornament-line" }), /*#__PURE__*/
        React.createElement("div", { className: "hero-ornament-diamond" }), /*#__PURE__*/
        React.createElement("div", { className: "hero-ornament-line r" })
        )
        )
        ));

    })(), /*#__PURE__*/
    React.createElement("div", { className: "page-wrapper" }, /*#__PURE__*/
    React.createElement("div", { className: "chapter-body" },
    showSectionHeadings && headingsFocusHidden && chapter.sections.some((s) => s.heading || s.letter) && /*#__PURE__*/
    React.createElement("button", {
      className: "hero-subtitle-restore headings-restore",
      onClick: () => setHeadingsFocusHidden && setHeadingsFocusHidden(false),
      title: "Show section headings",
      "aria-label": "Show section headings" },
    "+ Show section headings"),

    (() => {
      const POETIC_BOOKS = new Set(['psalms', 'proverbs', 'songofsolomon', 'lamentations', 'ecclesiastes']);
      const isPoetry = POETIC_BOOKS.has(book.id);
      const headingsVisible = showSectionHeadings && !headingsFocusHidden;
      const renderVerse = (v, vi) => {
        const vHlKey = bibleHlKey(book.id, chapter.num, v.n);
        const vText = translateVerse(book.id, chapter.num, v, translation);
        return /*#__PURE__*/React.createElement("span", { key: vi, id: `v-${v.n}`, className: `verse${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}` }, /*#__PURE__*/
          React.createElement("span", { className: "verse-num" }, v.n),
          React.createElement("span", { "data-hl-key": vHlKey, "data-hl-dom": true }, vText),
          React.createElement(LinkIcon, { hlKey: vHlKey, hlTick: hlTick, onClick: onLinkOpen }),
          " "
        );
      };

      if (!headingsVisible) {
        const allVerses = chapter.sections.flatMap((s) => s.verses);
        return (/*#__PURE__*/
          React.createElement("div", { className: `verses-block${isPoetry ? ' is-poetry' : ''}` },
          allVerses.map(renderVerse)
          ));

      }
      return chapter.sections.map((sec, si) => /*#__PURE__*/
      React.createElement("div", { key: si, className: "section-block" },
      sec.letter ? /*#__PURE__*/
      React.createElement("div", {
        className: "section-heading-psalm119 section-heading-tappable",
        onClick: () => setHeadingsFocusHidden && setHeadingsFocusHidden(true),
        title: "Tap to hide headings",
        role: "button" }, /*#__PURE__*/

      React.createElement("span", { className: "hebrew-letter" }, sec.letter), /*#__PURE__*/
      React.createElement("span", { className: "hebrew-letter-name" }, getSectionHeading(si, sec))
      ) :
      sec.heading ? /*#__PURE__*/
      React.createElement("div", {
        className: "section-heading section-heading-tappable",
        onClick: () => setHeadingsFocusHidden && setHeadingsFocusHidden(true),
        title: "Tap to hide headings",
        role: "button" },
      getSectionHeading(si, sec)) :
      null, /*#__PURE__*/
      React.createElement("div", { className: `verses-block${isPoetry ? ' is-poetry' : ''}` },
      sec.verses.map(renderVerse)
      )
      )
      );
    })(), /*#__PURE__*/
    React.createElement("div", { className: "reading-end" }), /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider" }, /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-line" }), /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-symbol" }, "\u2726"), /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-line" })
    ), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav" },
    prevCh ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card", onClick: () => onNavigate(prevCh.num) }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, book.title, " ", prevCh.num)
    ) :
    prevBook ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card", onClick: onPrevBook }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous Book"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, prevBoundaryTitle || `${prevBook.title} ${prevBook.chapters[prevBook.chapters.length - 1].num}`)
    ) : /*#__PURE__*/

    React.createElement("div", { className: "bottom-nav-card placeholder" }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "\u2014")
    ),

    nextCh ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card next", onClick: () => onNavigate(nextCh.num) }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, book.title, " ", nextCh.num)
    ) :
    nextBook ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card next", onClick: onNextBook }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next Book \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, nextBoundaryTitle || `${nextBook.title} 1`)
    ) : /*#__PURE__*/

    React.createElement("div", { className: "bottom-nav-card next placeholder" }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "\u2014")
    )

    )
    )
    )
    ));
}
