function WtlbEntryView({ entry, partLabel, onHome, onNavigate, onSearch, onSettings, onHistory, onNavToChapter, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, theme, onThemeChange, onMarkRead, onUnmark, isRead, markAsReadEnabled, showProgressBar, scripturesDict, indexLabel, footnotesMode, backHint, onBack, hlTick, onLinkOpen, onInAppLink }) {
  const [scriptureRef, setScriptureRef] = useState(null);
  const [scriptureText, setScriptureText] = useState(null);
  const [highlightedFn, setHighlightedFn] = useState(null);
  const wtlbMainRef = useRef(null);

  useEffect(() => {
    const pending = window.__pendingHighlight;
    if (!pending || pending.letterId !== entry.id || !pending.excerpt) return;
    window.__pendingHighlight = null;
    const excerpt = pending.excerpt;
    const t = setTimeout(() => highlightExcerptInDom(wtlbMainRef.current, excerpt), 80);
    return () => clearTimeout(t);
  }, [entry.id]);

  const refAnalysis = React.useMemo(() => {
    const perParagraph = [];
    const refNumMap = {};
    const orderedRefs = [];
    let num = 0;
    entry.paragraphs.forEach((p) => {
      const arr = [];
      const re = /\{\{ref:([^}]+)\}\}/g;
      let m;
      while ((m = re.exec(p.text)) !== null) {
        const ref = m[1].trim();
        const after = p.text.slice(m.index + m[0].length);
        const stripped = after.replace(/\{\{(?:ref|nav):[^}]+\}\}/g, '');
        const hasWordChar = /\w/.test(stripped);
        const hasLaterMarker = /\{\{(?:ref|nav):/.test(after);
        const trailing = !hasWordChar && !hasLaterMarker;
        let n = null;
        if (footnotesMode && !trailing) {
          if (!(ref in refNumMap)) {
            num++;
            refNumMap[ref] = num;
            orderedRefs.push(ref);
          }
          n = refNumMap[ref];
        }
        arr.push({ ref, trailing, num: n });
      }
      perParagraph.push(arr);
    });
    return { perParagraph, refNumMap, orderedRefs };
  }, [entry.id, footnotesMode]);

  const lookupVerse = (ref) => {
    return resolveScriptureText(ref, entry.scriptures, scripturesDict || WTLB_SCRIPTURES);
  };

  useEffect(() => {
    if (scriptureRef === null) return;
    var prev = window.__closeSheet;
    window.__closeSheet = () => setScriptureRef(null);
    return () => {window.__closeSheet = prev || null;};
  }, [scriptureRef]);

  const openSheetForRef = (ref) => {
    setScriptureRef(ref);
    setScriptureText(lookupVerse(ref));
  };

  const handleBubbleClick = (ref, n) => {
    openSheetForRef(ref);
  };

  useMarkAsRead(markAsReadEnabled, onMarkRead);

  useEffect(() => {setScriptureRef(null);setScriptureText(null);setHighlightedFn(null);}, [entry.id]);

  const prevEntry = entry.prevEntry;
  const nextEntry = entry.nextEntry;

  const _attrCollectionLabel = (volStr) => {
    if (!volStr) return null;
    const s = String(volStr).trim().toLowerCase();
    const NUMS = { '1':'One', '2':'Two', '3':'Three', '4':'Four', '5':'Five', '6':'Six', '7':'Seven' };
    if (NUMS[s]) return 'Volume ' + NUMS[s];
    const WORDS = ['one','two','three','four','five','six','seven'];
    if (WORDS.includes(s)) return 'Volume ' + s.charAt(0).toUpperCase() + s.slice(1);
    return null;
  };

  const renderLine = (line, consumeRef) => {
    const parts = line.split(/(\*\*.*?\*\*|_.*?_|\{\{ref:[^}]+\}\}|\{\{nav:[^}]+\}\}|\[From [^\]]+\])/g);
    return parts.map((seg, si) => {
      if (!seg) return null;
      if (seg.startsWith('**') && seg.endsWith('**')) return /*#__PURE__*/React.createElement("strong", { key: si }, renderLine(seg.slice(2, -2), consumeRef));
      if (seg.startsWith('_') && seg.endsWith('_')) return /*#__PURE__*/React.createElement("em", { key: si }, renderLine(seg.slice(1, -1), consumeRef));
      const attrMatch = seg.match(/^\[From ["“”](.+?)["“”]\s*~\s*Volume\s+(\d+|[A-Za-z]+)\]$/);
      if (attrMatch && onInAppLink) {
        const title = attrMatch[1];
        const collection = _attrCollectionLabel(attrMatch[2]);
        if (collection) {
          return /*#__PURE__*/React.createElement("span", { key: si, className: "letter-link-ref",
            onClick: () => onInAppLink(
              { collection: collection, letterTitle: title },
              { sourceLetterTitle: entry.title, sourceVolumeLabel: partLabel || null }
            ),
            title: 'Open "' + title + '" in ' + collection },
            seg);
        }
      }
      const refMatch = seg.match(/^\{\{ref:(.+)\}\}$/);
      if (refMatch) {
        const ref = refMatch[1].trim();
        const info = consumeRef();
        if (info && footnotesMode && !info.trailing && info.num != null) {
          const n = info.num;
          return (/*#__PURE__*/
            React.createElement("span", { key: si, className: `fn-ref${highlightedFn === n ? " active" : ""}`,
              "data-fn-num": n,
              onClick: () => handleBubbleClick(ref, n),
              title: `Footnote ${n}` }, n));

        }
        return (/*#__PURE__*/
          React.createElement("a", { key: si, className: "wtlb-cite", href: "#",
            onClick: (e) => {e.preventDefault();openSheetForRef(ref);} }, "(",
          ref, ")"
          ));

      }
      const navMatch = seg.match(/^\{\{nav:([^:]+):(\d+)\}\}$/);
      if (navMatch) {
        const bookId = navMatch[1],ch = parseInt(navMatch[2], 10);
        const bookTitle = BOOKS[bookId]?.title || bookId;
        return /*#__PURE__*/React.createElement("a", { key: si, className: "fn-link", href: "#", onClick: (e) => {e.preventDefault();onNavToChapter(bookId, ch);} }, "[", bookTitle, " ", ch, "]");
      }
      return /*#__PURE__*/React.createElement(React.Fragment, { key: si }, seg);
    });
  };

  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { showProgress: showProgressBar, navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home nav-back-icon", onClick: onHome, title: "\u2190 Index", "aria-label": "Back to Index" }, "\u2039"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/
      React.createElement("div", { className: "nav-arrows" }, /*#__PURE__*/
      React.createElement("button", { className: "nav-arrow-btn", disabled: !prevEntry && !prevBoundary,
        onClick: () => prevEntry ? onNavigate(prevEntry.id) : onPrevBoundary && onPrevBoundary(),
        title: "Previous", "aria-label": "Previous entry" }, "\u2039"), /*#__PURE__*/
      React.createElement("button", { className: "nav-arrow-btn", disabled: !nextEntry && !nextBoundary,
        onClick: () => nextEntry ? onNavigate(nextEntry.id) : onNextBoundary && onNextBoundary(),
        title: "Next", "aria-label": "Next entry" }, "\u203A")
      ), /*#__PURE__*/
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange, reading: true })
      ) }, /*#__PURE__*/
    React.createElement(StickyChapterNav, {
      onPrev: () => prevEntry ? onNavigate(prevEntry.id) : onPrevBoundary && onPrevBoundary(),
      onNext: () => nextEntry ? onNavigate(nextEntry.id) : onNextBoundary && onNextBoundary(),
      prevDisabled: !prevEntry && !prevBoundary,
      nextDisabled: !nextEntry && !nextBoundary,
      prevLabel: "Previous entry",
      nextLabel: "Next entry" }
    ),

    backHint && /*#__PURE__*/
    React.createElement("div", { className: "back-hint-row" }, /*#__PURE__*/
    React.createElement("button", { className: "back-hint-pill", onClick: onBack, "aria-label": "Back to source letter" }, /*#__PURE__*/
    React.createElement("span", { className: "back-hint-arrow" }, "\u2039"), "Back to ", /*#__PURE__*/

    React.createElement("span", { className: "back-hint-title" }, backHint.volumeLabel ? `${backHint.volumeLabel} · ${backHint.title}` : backHint.title)
    )
    ), /*#__PURE__*/


    React.createElement("header", { className: "hero" }, /*#__PURE__*/
    React.createElement("div", { className: "hero-bg vol" }), /*#__PURE__*/
    React.createElement("div", { className: "hero-content" }, /*#__PURE__*/
    React.createElement("div", { className: "hero-eyebrow" }, partLabel, " \xA0\xB7\xA0 ", entry.num), /*#__PURE__*/
    React.createElement("h1", { className: "hero-title" }, entry.title), /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament-line r" })
    )
    )
    ), /*#__PURE__*/

    React.createElement("div", { className: "page-wrapper" }, /*#__PURE__*/
    React.createElement("div", { className: "content-layout" }, /*#__PURE__*/
    React.createElement("main", { className: "letter-body", ref: wtlbMainRef },
    entry.content ?
    entry.content.map((block, bi) => (/*#__PURE__*/
      React.createElement("p", { key: bi, style: { textAlign: block.align }, className: block.align === 'center' ? 'letter-poetry' : 'letter-para', "data-hl-key": wtlbHlKey(entry.id, bi), "data-hl-dom": true }, /*#__PURE__*/
      React.createElement(UnifiedSegments, _extends({ content: block.content }, { onFnClick: (n) => handleBubbleClick(null, n), onScripClick: handleBubbleClick, onInAppLink, highlightedFn }))
      ))) :
    entry.paragraphs.map((p, pi) => {
      const paraRefs = refAnalysis.perParagraph[pi] || [];
      let refCursor = 0;
      const consumeRef = () => paraRefs[refCursor++];
      return (/*#__PURE__*/
        React.createElement("p", { key: pi, style: { textAlign: p.align }, className: p.align === 'center' ? 'letter-poetry' : 'letter-para', "data-hl-key": wtlbHlKey(entry.id, pi), "data-hl-dom": true },
        p.text.split('\n').map((line, li, arr) => /*#__PURE__*/
        React.createElement(React.Fragment, { key: li },
        renderLine(line, consumeRef),
        li < arr.length - 1 && /*#__PURE__*/React.createElement("br", null)
        )
        )
        ));

    }),

    React.createElement("div", { className: "reading-end" }), /*#__PURE__*/

    footnotesMode && refAnalysis.orderedRefs.length > 0 && /*#__PURE__*/
    React.createElement("div", { className: "footnote-list wtlb-footnote-list" }, /*#__PURE__*/
    React.createElement("div", { className: "footnote-list-header" }, "Footnotes"),
    refAnalysis.orderedRefs.map((ref) => {
      const num = refAnalysis.refNumMap[ref];
      const verseText = lookupVerse(ref);
      return (/*#__PURE__*/
        React.createElement("div", { key: ref, id: `wtlb-fn-${entry.id}-${num}`, className: `footnote-list-item${highlightedFn === num ? " pulse" : ""}` }, /*#__PURE__*/
        React.createElement("div", { className: "footnote-list-num" }, num, "."), /*#__PURE__*/
        React.createElement("div", null, /*#__PURE__*/
        React.createElement("span", { className: "footnote-list-ref" }, ref),
        verseText && /*#__PURE__*/React.createElement(ExpandableVerse, { text: verseText, refStr: ref })
        )
        ));

    })
    ), /*#__PURE__*/


    React.createElement("div", { className: "ornament-divider" }, /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-line" }), /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-symbol" }, "\u2726"), /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-line" })
    ), /*#__PURE__*/

    React.createElement("div", { className: "bottom-nav" },
    prevEntry ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card", onClick: () => onNavigate(prevEntry.id) }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, prevEntry.title)
    ) :
    prevBoundary ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card", onClick: onPrevBoundary }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, prevBoundary.short ? `\u2039 Previous \u00b7 ${prevBoundary.short}` : "\u2039 Previous Book"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, prevBoundary.title)
    ) : /*#__PURE__*/

    React.createElement("div", { className: "bottom-nav-card placeholder" }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "\u2014")
    ),

    nextEntry ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card next", onClick: () => onNavigate(nextEntry.id) }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, nextEntry.title)
    ) :
    nextBoundary ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card next", onClick: onNextBoundary }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, nextBoundary.short ? `Next \u00B7 ${nextBoundary.short} \u203A` : "Next \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, nextBoundary.title)
    ) : /*#__PURE__*/

    React.createElement("div", { className: "bottom-nav-card next placeholder" }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "\u2014")
    )

    )
    )
    )
    ), /*#__PURE__*/


    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: `fn-sheet-backdrop${scriptureRef ? " open" : ""}`, onClick: () => setScriptureRef(null) }), /*#__PURE__*/
    React.createElement("div", { className: `fn-sheet${scriptureRef ? " open" : ""}` }, /*#__PURE__*/
    React.createElement("div", { className: "fn-sheet-handle" }),
    scriptureRef && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("span", { className: "sc-sheet-tag" }, "Scripture Reference"), /*#__PURE__*/
    React.createElement("span", { className: "sc-sheet-cite" }, scriptureRef),
    scriptureText ? /*#__PURE__*/
    React.createElement("div", { className: "sc-sheet-verse" }, /*#__PURE__*/React.createElement(ScriptureVerseText, { text: scriptureText, cite: scriptureRef })) : /*#__PURE__*/

    React.createElement("div", { className: "sc-sheet-verse", style: { color: 'var(--cream-dim)', fontStyle: 'italic' } }, "Verse text not available in app data")

    )

    )
    )
    ));
}
