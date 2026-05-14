function ChapterView({ book, chapter, mode, showStudy, showEchoes, showChapterTitle, titleFocusHidden, setTitleFocusHidden, onIndex, onNavigate, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, markAsReadEnabled, showProgressBar, onVotLetterClick, hlTick, onLinkOpen, backHint, onTapThroughBack }) {
  const [activeScripRef, setActiveScripRef] = React.useState(null);
  const [highlightedVerses, setHighlightedVerses] = React.useState([]);

  useEffect(() => {
    if (!activeScripRef) return;
    var prev = window.__closeSheet;
    window.__closeSheet = () => setActiveScripRef(null);
    return () => {window.__closeSheet = prev || null;};
  }, [activeScripRef]);

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
  const verses = chapter.verses || [];

  useMarkAsRead(markAsReadEnabled, onMarkRead);
  const hasLinks = chapter.links && chapter.links.length > 0;

  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { showProgress: showProgressBar, navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home nav-back-icon", onClick: onIndex, title: `← ${book.title}`, "aria-label": `Back to ${book.title}` }, "\u2039"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/
      React.createElement("div", { className: "nav-arrows" }, /*#__PURE__*/
      React.createElement("button", { className: "nav-arrow-btn", disabled: !prevCh && !prevBoundary,
        onClick: () => prevCh ? onNavigate(prevCh.num) : onPrevBoundary && onPrevBoundary(),
        title: "Previous", "aria-label": "Previous chapter" }, "\u2039"), /*#__PURE__*/
      React.createElement("button", { className: "nav-arrow-btn", disabled: !nextCh && !nextBoundary,
        onClick: () => nextCh ? onNavigate(nextCh.num) : onNextBoundary && onNextBoundary(),
        title: "Next", "aria-label": "Next chapter" }, "\u203A")
      ), /*#__PURE__*/
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange, reading: true })
      ) }, /*#__PURE__*/
    React.createElement(StickyChapterNav, {
      onPrev: () => prevCh ? onNavigate(prevCh.num) : onPrevBoundary && onPrevBoundary(),
      onNext: () => nextCh ? onNavigate(nextCh.num) : onNextBoundary && onNextBoundary(),
      prevDisabled: !prevCh && !prevBoundary,
      nextDisabled: !nextCh && !nextBoundary,
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
    /*#__PURE__*/
    React.createElement("header", { className: "hero" }, /*#__PURE__*/
    React.createElement("div", { className: "hero-bg" }), /*#__PURE__*/
    React.createElement("div", { className: "hero-content" }, /*#__PURE__*/
    React.createElement("div", { className: "hero-eyebrow" }, "Matthew \xA0\xB7\xA0 Chapter ",
    chapter.num
    ), /*#__PURE__*/
    React.createElement("h1", { className: "hero-title" }, "Chapter ", chapter.num),
    chapter.title && showChapterTitle && (
    !titleFocusHidden ? /*#__PURE__*/
    React.createElement("div", {
      className: "hero-subtitle hero-subtitle-tappable",
      onClick: () => setTitleFocusHidden && setTitleFocusHidden(true),
      title: "Tap to hide summary",
      role: "button" },
    chapter.title) : /*#__PURE__*/

    React.createElement("button", {
      className: "hero-subtitle-restore",
      onClick: () => setTitleFocusHidden && setTitleFocusHidden(false),
      title: "Show summary",
      "aria-label": "Show chapter summary" },
    "+ Show summary")), /*#__PURE__*/


    React.createElement("div", { className: "hero-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament-line r" })
    )
    )
    ), /*#__PURE__*/

    React.createElement("div", { className: "page-wrapper" }, /*#__PURE__*/
    React.createElement("div", { className: "chapter-body" },
    mode === "pdf" ? /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: "verses-block" },
    verses.map((v, vi) => {
      const vHlKey = studyHlKey(book.id + '-' + chapter.num, v.n);
      return /*#__PURE__*/React.createElement("span", { key: vi, id: `v-${v.n}`, className: `verse${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}` }, /*#__PURE__*/
        React.createElement("span", { className: "verse-num" }, v.n),
        React.createElement("span", { "data-hl-key": vHlKey, "data-hl-dom": true }, v.text),
        React.createElement(LinkIcon, { hlKey: vHlKey, hlTick: hlTick, onClick: onLinkOpen }),
        " "
      );
    })
    ),
    showStudy && /*#__PURE__*/
    React.createElement(StudyPanels, {
      scriptures: chapter.scriptures || [],
      votNotes: chapter.votNotes || [],
      onScriptureClick: setActiveScripRef,
      onVotLetterClick: onVotLetterClick }
    )

    ) : /*#__PURE__*/

    React.createElement("div", { className: "verses-inline" },
    verses.map((v, vi) => {
      const { scriptures, votNotes } = getNotesForVerse(chapter, v.n);
      const echoes = showEchoes ? getEchoesForVerse(chapter, v.n) : { scriptures: [], votNotes: [] };
      const hasEchoes = echoes.scriptures.length > 0 || echoes.votNotes.length > 0;
      const vHlKey = studyHlKey(book.id + '-' + chapter.num, v.n);
      return (/*#__PURE__*/
        React.createElement("div", { key: vi, id: `v-${v.n}`, className: `verse-row${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}` }, /*#__PURE__*/
        React.createElement("div", { className: "verse-line" }, /*#__PURE__*/
        React.createElement("span", { className: "verse-num" }, v.n), /*#__PURE__*/
        React.createElement("span", { "data-hl-key": vHlKey, "data-hl-dom": true }, v.text),
        React.createElement(LinkIcon, { hlKey: vHlKey, hlTick: hlTick, onClick: onLinkOpen })
        ),
        showStudy && (scriptures.length > 0 || votNotes.length > 0) && /*#__PURE__*/
        React.createElement(InlineNotes, { scriptures: scriptures, votNotes: votNotes, onScriptureClick: setActiveScripRef, onVotLetterClick: onVotLetterClick }),
        showStudy && hasEchoes && /*#__PURE__*/
        React.createElement(InlineEcho, { scriptures: echoes.scriptures, votNotes: echoes.votNotes })

        ));

    })
    ),

    React.createElement("div", { className: "reading-end" }), /*#__PURE__*/

    showStudy && hasLinks && /*#__PURE__*/
    React.createElement("div", { className: "study-panel-group", style: { marginTop: "2rem" } }, /*#__PURE__*/
    React.createElement("div", { className: "study-panel-group-title" }, "Further Study"), /*#__PURE__*/
    React.createElement("div", { className: "study-links" },
    chapter.links.map((link, i) => /*#__PURE__*/
    React.createElement("a", { key: i, href: link.url, target: "_blank", rel: "noopener noreferrer", className: "study-link" },
    link.label
    )
    )
    )
    ), /*#__PURE__*/


    React.createElement("div", { className: "ornament-divider" }, /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-line" }), /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-symbol" }, "\u2726"), /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-line" })
    ), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav" },
    prevCh ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card", onClick: () => onNavigate(prevCh.num) }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "Matthew ", prevCh.num)
    ) :
    prevBoundary ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card", onClick: onPrevBoundary }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous Book"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, prevBoundary.title)
    ) : /*#__PURE__*/

    React.createElement("div", { className: "bottom-nav-card placeholder" }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "\u2014")
    ),

    nextCh ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card next", onClick: () => onNavigate(nextCh.num) }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "Matthew ", nextCh.num)
    ) :
    nextBoundary ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card next", onClick: onNextBoundary }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next Book \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, nextBoundary.title)
    ) : /*#__PURE__*/

    React.createElement("div", { className: "bottom-nav-card next placeholder" }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "\u2014")
    )

    )
    )
    ), /*#__PURE__*/
    React.createElement(ScriptureSheet, { activeRef: activeScripRef, onClose: () => setActiveScripRef(null) })
    ));
}
