/* ═══════════════════════════════════════════════════════════════════════
   WtlbEntryView — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function WtlbEntryView({ entry, partLabel, onHome, onNavigate, onSearch, onSettings, onHistory, onNavToChapter, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, theme, onThemeChange, onMarkRead, onUnmark, isRead, markAsReadEnabled, showProgressBar, scripturesDict, indexLabel, footnotesMode, backHint, onBack, hlTick, onLinkOpen, onInAppLink }) {
  const [scriptureRef, setScriptureRef] = React.useState(null);
  const [scriptureText, setScriptureText] = React.useState(null);
  const [highlightedFn, setHighlightedFn] = React.useState(null);
  // Excerpt highlight (Matthew SB tap-through). Read window.__pendingHighlight
  // on entry-id change and apply via shared highlightExcerptInDom helper.
  const wtlbMainRef = React.useRef(null);
  React.useEffect(() => {
    const pending = window.__pendingHighlight;
    if (!pending || pending.letterId !== entry.id || !pending.excerpt) return;
    window.__pendingHighlight = null;
    const excerpt = pending.excerpt;
    const t = setTimeout(() => highlightExcerptInDom(wtlbMainRef.current, excerpt), 80);
    return () => clearTimeout(t);
  }, [entry.id]);

  // Pre-scan paragraphs for scripture refs. Classify each occurrence as:
  //  - trailing: last substantive content in its paragraph (no word-chars or later
  //    markers after it) — rendered as a small parenthetical cite regardless of mode
  //  - inline:   rendered as a parenthetical cite (default) OR a numbered fn-bubble
  //    (footnotesMode), with the bubble-numbered refs listed in a footnote section below
  const refAnalysis = React.useMemo(() => {
    const perParagraph = []; // [[{ref, trailing, num|null}, ...], ...]
    const refNumMap = {}; // unique non-trailing ref -> number (only when footnotesMode)
    const orderedRefs = []; // list of unique non-trailing refs in order
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
    const perEntry = entry.scriptures || {};
    const dict = scripturesDict || WTLB_SCRIPTURES;
    return perEntry[ref] || dict[ref] || null;
  };

  React.useEffect(() => {
    if (scriptureRef === null) return;
    var prev = window.__closeSheet;
    window.__closeSheet = () => setScriptureRef(null);
    return () => {window.__closeSheet = prev || null;};
  }, [scriptureRef]);

  // Tapping a parenthetical cite always opens the bottom sheet with verse text.
  const openSheetForRef = (ref) => {
    setScriptureRef(ref);
    setScriptureText(lookupVerse(ref));
  };

  // Tapping a footnote bubble: always open the bottom sheet so the reader
  // never loses their place by jumping to the bottom of the entry.
  const handleBubbleClick = (ref, n) => {
    openSheetForRef(ref);
  };

  useMarkAsRead(markAsReadEnabled, onMarkRead);

  React.useEffect(() => {setScriptureRef(null);setScriptureText(null);setHighlightedFn(null);}, [entry.id]);

  // Footnote active-state via the live DOM. Paragraph content lives inside
  // a StaticSubtree (frozen at mount) so the inline fn-bubble's `.active`
  // class can't flow through React props anymore; each bubble carries
  // data-fn-num, so toggle it imperatively (identical visual behavior).
  React.useEffect(() => {
    const root = wtlbMainRef.current;
    if (!root) return;
    root.querySelectorAll('.fn-ref.active').forEach((e) => e.classList.remove('active'));
    if (highlightedFn != null) {
      const el = root.querySelector('.fn-ref[data-fn-num="' + String(highlightedFn).replace(/"/g, '\\"') + '"]');
      if (el) el.classList.add('active');
    }
  }, [highlightedFn, entry.id]);

  const prevEntry = entry.prevEntry;
  const nextEntry = entry.nextEntry;

  // Map a written volume number (numeric digit or English word) to the
  // canonical collection label used by VOT_LETTER_REGISTRY / resolveVotLetter.
  // Returns null when no recognized form is present.
  const _attrCollectionLabel = (volStr) => {
    if (!volStr) return null;
    const s = String(volStr).trim().toLowerCase();
    const NUMS = { '1':'One', '2':'Two', '3':'Three', '4':'Four', '5':'Five', '6':'Six', '7':'Seven' };
    if (NUMS[s]) return 'Volume ' + NUMS[s];
    const WORDS = ['one','two','three','four','five','six','seven'];
    if (WORDS.includes(s)) return 'Volume ' + s.charAt(0).toUpperCase() + s.slice(1);
    return null;
  };

  // Render a single line, consuming ref occurrences from the current paragraph's
  // analysis via a per-paragraph counter passed in by caller.
  const renderLine = (line, consumeRef) => {
    // Inline split patterns (in priority order — first match wins per segment):
    //   **bold**           **...**
    //   _italic_           _..._
    //   {{ref:...}}        scripture popup
    //   {{nav:...}}        bible-chapter nav link
    //   [From "Title" ~ Volume N]   WTLB attribution tap-through to the source letter
    const parts = line.split(/(\*\*.*?\*\*|_.*?_|\{\{ref:[^}]+\}\}|\{\{nav:[^}]+\}\}|\[From [^\]]+\])/g);
    return parts.map((seg, si) => {
      if (!seg) return null;
      if (seg.startsWith('**') && seg.endsWith('**')) return /*#__PURE__*/React.createElement("strong", { key: si }, renderLine(seg.slice(2, -2), consumeRef));
      if (seg.startsWith('_') && seg.endsWith('_')) return /*#__PURE__*/React.createElement("em", { key: si }, renderLine(seg.slice(1, -1), consumeRef));
      // [From "Letter Title" ~ Volume N] — WTLB attribution. Smart-quotes or
      // ASCII quotes accepted around the title; volume can be digit or word.
      // Renders as a tappable letter-link → openInAppLetter wires the
      // single-shot back-pill correctly. Falls through to plain text if the
      // parse fails OR if onInAppLink isn't provided.
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
        // info should exist but guard anyway
        if (info && footnotesMode && !info.trailing && info.num != null) {
          const n = info.num;
          return (/*#__PURE__*/
            React.createElement("span", { key: si, className: `fn-ref${highlightedFn === n ? " active" : ""}`,
              "data-fn-num": n,
              onClick: () => handleBubbleClick(ref, n),
              title: `Footnote ${n}` }, n));

        }
        // Trailing ref OR non-footnotesMode → parenthetical cite
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
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange, reading: true,
        chapterBookmark: entry ? { hlKey: 'wtlb:' + entry.id, label: entry.title || (partLabel ? partLabel + ' \u2014 Entry ' + entry.num : 'Bookmark') } : null,
        hlTick: hlTick })
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
    entry.paragraphs.map((p, pi) => {
      const paraRefs = refAnalysis.perParagraph[pi] || [];
      let refCursor = 0;
      const consumeRef = () => paraRefs[refCursor++];
      return (/*#__PURE__*/
        React.createElement("p", { key: entry.id + ":" + pi, style: { textAlign: p.align }, className: p.align === 'center' ? 'letter-poetry' : 'letter-para', "data-hl-key": wtlbHlKey(entry.id, pi), "data-hl-dom": true }, /*#__PURE__*/
        React.createElement(StaticSubtree, null,
        p.text.split('\n').map((line, li, arr) => /*#__PURE__*/
        React.createElement(React.Fragment, { key: li },
        renderLine(line, consumeRef),
        li < arr.length - 1 && /*#__PURE__*/React.createElement("br", null)
        )
        ))
        ));

    }),

    /* Reading-end sentinel: end of body text, before footnotes/nav. */
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
    React.createElement("div", { className: "bottom-nav-label" }, prevBoundary.short ? `\u2039 Previous \u00b7 ${prevBoundary.short}` : "\u2039 Previous"), /*#__PURE__*/
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
