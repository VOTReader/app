/* ═══════════════════════════════════════════════════════════════════════
   LetterView — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function LetterView({ letter, onHome, onNavigate, onStudyNavigate, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, onUnmark, isRead, markAsReadEnabled, showProgressBar, volumeLabel, studyMode, onLetterClick, onInAppLink, backHint, onBack, prophecyCardStatesRef, saveProphecyCardStates, hlTick, onLinkOpen }) {
  // Wrap onInAppLink so App receives the current letter.title as source —
  // this populates the back-hint pill when the user taps through.
  const wrappedInAppLink = onInAppLink ? (link) => onInAppLink(link, { sourceLetterTitle: letter.title, sourceVolumeLabel: volumeLabel }) : null;
  const [highlightedFn, setHighlightedFn] = React.useState(null);
  const [sheetFn, setSheetFn] = React.useState(null);
  const [surpriseBlockId, setSurpriseBlockId] = React.useState(null);
  // Transient tap-through highlight — set once on mount/letter-change from
  // window.__pendingHighlight, consumed on read so it never persists across
  // re-navigation (back/forward, direct nav, etc.).
  const [highlightExcerpt, setHighlightExcerpt] = React.useState(null);
  // Prophecy expand/collapse: positive = expand, negative = collapse, 0 = default
  const [expandSignal, setExpandSignal] = React.useState(0);
  const [allExpanded, setAllExpanded] = React.useState(true);
  const hasProphecyGroups = letter.blocks.some((b) => b.type === "prophecy-group");

  // __closeSheet is managed by the combined effect further down (handles both footnote + scripture sheets)
  const mainRef = React.useRef(null);

  useMarkAsRead(markAsReadEnabled, onMarkRead);

  // Reset state when letter changes (scroll handled by App). Also check
  // for a pending tap-through highlight for this letter; consume it.
  React.useEffect(() => {
    setHighlightedFn(null);
    setSheetFn(null);
    setScripRef(null);
    setSurpriseBlockId(null);
    const pending = window.__pendingHighlight;
    if (pending && pending.letterId === letter.id && pending.excerpt) {
      setHighlightExcerpt(pending.excerpt);
      window.__pendingHighlight = null;
    } else {
      setHighlightExcerpt(null);
    }
  }, [letter.id]);

  // After the highlight is rendered into the DOM, smooth-scroll it into view.
  // Falls back to block-level highlight when excerpt spans multiple segments.
  React.useEffect(() => {
    if (!highlightExcerpt) return;
    const timer = setTimeout(() => {
      const mark = mainRef.current && mainRef.current.querySelector("mark.letter-highlight");
      if (mark) { mark.scrollIntoView({ block: "center" }); return; }
      highlightExcerptInDom(mainRef.current, highlightExcerpt);
    }, 80);
    return () => clearTimeout(timer);
  }, [highlightExcerpt]);

  React.useEffect(() => {
    if (!surpriseAnchor || surpriseAnchor.type !== "excerpt") return;
    const excerpt = surpriseAnchor.text;
    // Find which block contains the excerpt
    const blocks = letter.blocks || [];
    let foundId = null;
    for (let i = 0; i < blocks.length; i++) {
      const segs = blocks[i].segments || [];
      const blockText = segs.map((s) => s.v || "").join(" ");
      if (blockText.includes(excerpt.slice(0, 40))) {
        foundId = `letter-block-${i}`;
        break;
      }
    }
    if (!foundId) return;
    setSurpriseBlockId(foundId);
    const timer = setTimeout(() => {
      const el = document.getElementById(foundId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const fadeTimer = setTimeout(() => setSurpriseBlockId(null), 4000);
    return () => {clearTimeout(timer);clearTimeout(fadeTimer);};
  }, [surpriseAnchor, letter.id]);

  const handleFnClick = (num) => {
    // Always open the bottom sheet — works on every viewport so the reader
    // never loses their place by jumping to the bottom of the letter.
    // Functional update: this handler is captured inside a StaticSubtree
    // (frozen at mount), so reading `sheetFn` from the closure would always
    // see its mount-time value (null) and re-tapping a footnote would never
    // toggle it closed. The updater form always sees the live value.
    setSheetFn((prev) => (prev === num ? null : num));
  };

  // WTLB-style scripture reference sheet (for inline {{ref:X}} markers in
  // Bible Letter Studies). Separate from the footnote sheet so both can
  // coexist — footnotes for external-link notes, scripture sheet for refs.
  const [scripRef, setScripRef] = React.useState(null);
  const handleScripClick = (ref) => {
    setScripRef(ref);
  };
  React.useEffect(() => {
    var closer = sheetFn !== null ? () => setSheetFn(null) : scripRef !== null ? () => setScripRef(null) : null;
    if (!closer) return;
    var prev = window.__closeSheet;
    window.__closeSheet = closer;
    return () => {window.__closeSheet = prev || null;};
  }, [sheetFn, scripRef]);

  const fnProps = { activeFn: sheetFn != null ? sheetFn : highlightedFn, onFnClick: handleFnClick, onScripClick: handleScripClick, onLetterClick, onInAppLink: wrappedInAppLink, studyMode, footnotes: studyMode ? letter.footnotes : null, highlightText: highlightExcerpt };
  // Footnote active-state is now driven imperatively against the live DOM.
  // The <Segments> output lives inside a StaticSubtree (frozen at mount),
  // so the `.fn-ref.active` class can no longer flow through React props.
  // Each fn bubble carries data-fn-num; toggle the class directly. Behavior
  // is identical to the old React-driven path (gold pulse on the active
  // footnote number).
  React.useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const active = sheetFn != null ? sheetFn : highlightedFn;
    root.querySelectorAll('.fn-ref.active').forEach((e) => e.classList.remove('active'));
    if (active != null) {
      const el = root.querySelector('.fn-ref[data-fn-num="' + String(active).replace(/"/g, '\\"') + '"]');
      if (el) el.classList.add('active');
    }
  }, [sheetFn, highlightedFn, letter.id]);
  const hasFn = letter.footnotes ? Object.keys(letter.footnotes).length > 0 : false;

  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { showProgress: showProgressBar, navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-volume nav-back-icon", onClick: onHome, title: `← ${volumeLabel || "Volume Two"}`, "aria-label": `Back to ${volumeLabel || "Volume Two"}` }, "\u2039"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/
      React.createElement("div", { className: "nav-arrows" }, /*#__PURE__*/
      React.createElement("button", { className: "nav-arrow-btn", disabled: !letter.prevLetter && !prevBoundary,
        onClick: () => letter.prevLetter ? onNavigate(letter.prevLetter.id) : onPrevBoundary && onPrevBoundary(),
        title: "Previous", "aria-label": "Previous letter" }, "\u2039"), /*#__PURE__*/
      React.createElement("button", { className: "nav-arrow-btn", disabled: !letter.nextLetter && !nextBoundary,
        onClick: () => letter.nextLetter ? onNavigate(letter.nextLetter.id) : onNextBoundary && onNextBoundary(),
        title: "Next", "aria-label": "Next letter" }, "\u203A")
      ), /*#__PURE__*/
      React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange, reading: true,
        chapterBookmark: letter ? { hlKey: 'letter:' + letter.id, label: letter.title || 'Letter bookmark' } : null,
        // Match the eyebrow convention: undefined volumeLabel defaults to "Volume Two"
        journalRefKey: (typeof jrnRefKeyForLetterByLabel === 'function') ? jrnRefKeyForLetterByLabel(volumeLabel || 'Volume Two', letter && letter.id) : null,
        journalRefLabel: letter && letter.title,
        hlTick: hlTick })
      ) }, /*#__PURE__*/
    React.createElement(StickyChapterNav, {
      onPrev: () => letter.prevLetter ? onNavigate(letter.prevLetter.id) : onPrevBoundary && onPrevBoundary(),
      onNext: () => letter.nextLetter ? onNavigate(letter.nextLetter.id) : onNextBoundary && onNextBoundary(),
      prevDisabled: !letter.prevLetter && !prevBoundary,
      nextDisabled: !letter.nextLetter && !nextBoundary,
      prevLabel: "Previous letter",
      nextLabel: "Next letter" }
    ),


    backHint && /*#__PURE__*/
    React.createElement("div", { className: "back-hint-row" }, /*#__PURE__*/
    React.createElement("button", { className: "back-hint-pill", onClick: onBack, "aria-label": "Back to source letter" }, /*#__PURE__*/
    React.createElement("span", { className: "back-hint-arrow" }, "\u2039"), "Back to ", /*#__PURE__*/

    React.createElement("span", { className: "back-hint-title" }, backHint.volumeLabel ? `${backHint.volumeLabel} · ${backHint.title}` : backHint.title)
    )
    ), /*#__PURE__*/



    React.createElement("header", { className: "hero" }, /*#__PURE__*/
    React.createElement("div", { className: `hero-bg ${studyMode ? "study" : "vol"}` }), /*#__PURE__*/
    React.createElement("div", { className: "hero-content" }, /*#__PURE__*/
    React.createElement("div", { className: "hero-eyebrow" }, volumeLabel || "Volume Two", " \xA0\xB7\xA0 ", studyMode ? letter.num === 0 ? "Preface" : `Chapter ${letter.num}` : letter.num === 0 ? "Preface" : `Letter ${letter.num}`), /*#__PURE__*/
    React.createElement("h1", { className: `hero-title${letter.title && letter.title.length > 25 ? " hero-title-long" : ""}` }, letter.title),
    letter.subtitle && /*#__PURE__*/React.createElement("div", { className: "hero-subtitle" }, letter.subtitle), /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "hero-ornament-line r" })
    )
    )
    ), /*#__PURE__*/


    React.createElement("div", { className: "page-wrapper" }, /*#__PURE__*/

    React.createElement("div", { className: "letter-meta" }, /*#__PURE__*/
    React.createElement("div", { className: "meta-date" }, letter.date), /*#__PURE__*/
    React.createElement("div", { className: "meta-from" }, letter.from), /*#__PURE__*/
    React.createElement("div", { className: "meta-spoken" }, letter.spoken), /*#__PURE__*/
    React.createElement("div", { className: "meta-for" }, letter.forLine),
    letter.noteLine && /*#__PURE__*/React.createElement("div", { className: "meta-note" }, letter.noteLine),
    letter.metaAddendum && /*#__PURE__*/
    React.createElement("div", { className: "meta-addendum" }, "Addendum to ",
    letter.metaAddendumLink && wrappedInAppLink ? /*#__PURE__*/
    React.createElement("a", { href: "#", onClick: (e) => {e.preventDefault();wrappedInAppLink(letter.metaAddendumLink);} }, letter.metaAddendum) :
    letter.metaAddendumInternal ? /*#__PURE__*/
    React.createElement("a", { href: "#", onClick: (e) => {e.preventDefault();onNavigate(letter.metaAddendumInternal);} }, letter.metaAddendum) : /*#__PURE__*/

    React.createElement("a", { href: letter.metaAddendumUrl, target: "_blank", rel: "noopener noreferrer" }, letter.metaAddendum)

    ),

    letter.preamble && /*#__PURE__*/React.createElement("div", { className: "meta-preamble" }, letter.preamble)
    ),


    letter.sectionIntro && letter.sectionIntro.length > 0 && /*#__PURE__*/
    React.createElement("div", { className: "section-intro-quote" },
    letter.sectionIntro.map((block, si) => {
      if (block.type === "heading") return (/*#__PURE__*/
        React.createElement("h3", { key: si, className: "section-intro-heading" }, block.text));

      if (!block.segments) return null;
      return (/*#__PURE__*/
        React.createElement("p", { key: si, className: "section-intro-text" }, /*#__PURE__*/
        React.createElement(Segments, _extends({ segments: block.segments }, fnProps))
        ));

    })
    ), /*#__PURE__*/



    React.createElement("div", { className: "content-layout" }, /*#__PURE__*/
    React.createElement("main", { className: "letter-body", ref: mainRef },
    letter.blocks.map((block, bi) => {
      if (block.type === "intro") return (/*#__PURE__*/
        React.createElement("p", { key: letter.id + ":" + bi, className: "letter-intro", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /*#__PURE__*/
        React.createElement(StaticSubtree, null, /*#__PURE__*/
        React.createElement(Segments, _extends({ segments: block.segments }, fnProps)))
        ));

      if (block.type === "heading") return (/*#__PURE__*/
        React.createElement("h2", { key: bi, className: `study-heading study-heading-l${block.level || 2}` }, block.text));

      if (block.type === "para") return (/*#__PURE__*/
        React.createElement("p", { key: letter.id + ":" + bi, className: "letter-para", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /*#__PURE__*/
        React.createElement(StaticSubtree, null, /*#__PURE__*/
        React.createElement(Segments, _extends({ segments: block.segments }, fnProps)))
        ));

      if (block.type === "poetry") {
        // Two formats: `lines` (array of segment-arrays) or `segments` (flat array, each entry = one line)
        if (block.lines) return (/*#__PURE__*/
          React.createElement("div", { key: letter.id + ":" + bi, className: "letter-poetry", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /*#__PURE__*/
          React.createElement(StaticSubtree, null,
          block.lines.map((line, li) => /*#__PURE__*/
          React.createElement("div", { key: li, className: "poetry-line" }, /*#__PURE__*/
          React.createElement(Segments, _extends({ segments: line }, fnProps))
          )
          ))
          ));

        return (/*#__PURE__*/
          React.createElement("div", { key: letter.id + ":" + bi, className: "letter-poetry", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /*#__PURE__*/
          React.createElement(StaticSubtree, null,
          (block.segments || []).map((seg, li) => {
            const lineSeg = { ...seg, v: (seg.v || '').replace(/^\n/, '') };
            return (/*#__PURE__*/
              React.createElement("div", { key: li, className: "poetry-line" }, /*#__PURE__*/
              React.createElement(Segments, _extends({ segments: [lineSeg] }, fnProps))
              ));

          }))
          ));

      }
      if (block.type === "closing") return (/*#__PURE__*/
        React.createElement("div", { key: letter.id + ":" + bi, className: "letter-closing", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /*#__PURE__*/
        React.createElement(StaticSubtree, null, block.text)));

      if (block.type === "closing-fn") return (/*#__PURE__*/
        React.createElement("div", { key: letter.id + ":" + bi, className: "letter-closing-fn", "data-hl-key": letterHlKey(letter.id, bi), "data-hl-dom": true }, /*#__PURE__*/
        React.createElement(StaticSubtree, null, /*#__PURE__*/
        React.createElement(Segments, _extends({ segments: block.segments }, fnProps)))
        ));

      if (block.type === "prophecy-group") return (/*#__PURE__*/
        React.createElement(ProphecyGroup, { key: bi, block: block, fnProps: fnProps, expandSignal: expandSignal, groupKey: letter.id + ":" + bi, statesRef: prophecyCardStatesRef, onSaveStates: saveProphecyCardStates }));

      if (block.type === "cover-image") return (/*#__PURE__*/
        React.createElement("div", { key: bi, className: "study-cover-inline" }, /*#__PURE__*/
        React.createElement("img", { src: block.src, alt: "Study cover" })
        ));

      if (block.type === "study-image") return (/*#__PURE__*/
        React.createElement("div", { key: bi }, /*#__PURE__*/
        React.createElement("div", { className: "study-image-block" }, /*#__PURE__*/
        React.createElement("img", { src: block.src, alt: block.alt || "Study diagram" })
        ),
        block.caption && /*#__PURE__*/React.createElement("p", { className: "study-image-caption" }, block.caption)
        ));

      return null;
    }),

    /* Reading-end sentinel: positioned at the actual end of body text so the
       progress bar and mark-as-read scroll trigger reflect when the reader
       has finished the letter proper \u2014 not the footnotes, ornament, nav cards,
       or related-topics that follow. */
    React.createElement("div", { className: "reading-end" }), /*#__PURE__*/

    hasFn && /*#__PURE__*/React.createElement(FootnoteListSection, { footnotes: letter.footnotes, nkjv: letter.nkjv, highlightedFn: highlightedFn, onInAppLink: wrappedInAppLink }), /*#__PURE__*/


    React.createElement("div", { className: "ornament-divider" }, /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-line" }), /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-symbol" }, "\u2726"), /*#__PURE__*/
    React.createElement("div", { className: "ornament-divider-line" })
    ), /*#__PURE__*/


    React.createElement("div", { className: "bottom-nav" },
    letter.prevLetter ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card", onClick: () => onNavigate(letter.prevLetter.id) }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous Letter"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, letter.prevLetter.title)
    ) :
    prevBoundary ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card", onClick: onPrevBoundary }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, prevBoundary.short ? `\u2039 Previous \u00B7 ${prevBoundary.short}` : "\u2039 Previous Book"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, prevBoundary.title)
    ) : /*#__PURE__*/

    React.createElement("div", { className: "bottom-nav-card placeholder" }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "\u2039 Previous Letter"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "\u2014")
    ),

    letter.nextLetter ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card next", onClick: () => onNavigate(letter.nextLetter.id) }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next Letter \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, letter.nextLetter.title)
    ) :
    nextBoundary ? /*#__PURE__*/
    React.createElement("button", { className: "bottom-nav-card next", onClick: onNextBoundary }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, nextBoundary.short ? `Next \u00B7 ${nextBoundary.short} \u203A` : "Next Book \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, nextBoundary.title)
    ) :
    letter.nextLetterExternal ? /*#__PURE__*/
    React.createElement("a", { className: "bottom-nav-card next", href: letter.nextLetterExternal.url, target: "_blank", rel: "noopener noreferrer" }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next Letter \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, letter.nextLetterExternal.title)
    ) : /*#__PURE__*/

    React.createElement("div", { className: "bottom-nav-card next placeholder" }, /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-label" }, "Next Letter \u203A"), /*#__PURE__*/
    React.createElement("div", { className: "bottom-nav-title" }, "\u2014")
    )

    ), /*#__PURE__*/


    React.createElement("div", { className: "related-section" },
    letter.addendum && /*#__PURE__*/
    React.createElement("div", { className: "related-card" }, /*#__PURE__*/
    React.createElement("div", { className: "related-card-title" }, "Also Read"),
    letter.addendumLink && wrappedInAppLink ? /*#__PURE__*/
    React.createElement("a", { className: "related-link", href: "#", onClick: (e) => {e.preventDefault();wrappedInAppLink(letter.addendumLink);} }, letter.addendum) :
    letter.addendumInternal ? /*#__PURE__*/
    React.createElement("a", { className: "related-link", href: "#", onClick: (e) => {e.preventDefault();onNavigate(letter.addendumInternal);} }, letter.addendum) : /*#__PURE__*/

    React.createElement("a", { className: "related-link", href: letter.addendumUrl, target: "_blank", rel: "noopener noreferrer" }, letter.addendum)

    ),

    letter.relatedTopics?.length > 0 && /*#__PURE__*/
    React.createElement("div", { className: "related-card" }, /*#__PURE__*/
    React.createElement("div", { className: "related-card-title" }, "Related Topics"),
    letter.relatedTopics.map((t, i) =>
    t.link && wrappedInAppLink ? /*#__PURE__*/
    React.createElement("a", { key: i, className: "related-link", href: "#", onClick: (e) => {e.preventDefault();wrappedInAppLink(t.link);} }, t.label) :
    t.internalStudy && onStudyNavigate ? /*#__PURE__*/
    React.createElement("a", { key: i, className: "related-link", href: "#", onClick: (e) => {e.preventDefault();onStudyNavigate(t.internalStudy);} }, t.label) : /*#__PURE__*/

    React.createElement("a", { key: i, className: "related-link", href: t.url, target: "_blank", rel: "noopener noreferrer" }, t.label)

    )
    ),

    letter.bibleStudies?.length > 0 && /*#__PURE__*/
    React.createElement("div", { className: "related-card" }, /*#__PURE__*/
    React.createElement("div", { className: "related-card-title" }, "Bible Study"),
    letter.bibleStudies.map((s, i) =>
    s.link && wrappedInAppLink ? /*#__PURE__*/
    React.createElement("a", { key: i, className: "related-link", href: "#", onClick: (e) => {e.preventDefault();wrappedInAppLink(s.link);} }, s.label) :
    s.internalStudy && onStudyNavigate ? /*#__PURE__*/
    React.createElement("a", { key: i, className: "related-link", href: "#", onClick: (e) => {e.preventDefault();onStudyNavigate(s.internalStudy);} }, s.label) : /*#__PURE__*/

    React.createElement("a", { key: i, className: "related-link", href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.label)

    )
    ),

    (letter.audioUrl || letter.soundcloudUrl) && /*#__PURE__*/
    React.createElement("div", { className: "related-card" }, /*#__PURE__*/
    React.createElement("div", { className: "related-card-title" }, "Audio"),
    letter.audioUrl && /*#__PURE__*/
    React.createElement("a", { className: "related-link", href: letter.audioUrl, target: "_blank", rel: "noopener noreferrer" }, "\u266A Audio Recording"),

    letter.soundcloudUrl && /*#__PURE__*/
    React.createElement("a", { className: "related-link", href: letter.soundcloudUrl, target: "_blank", rel: "noopener noreferrer" }, "\u266A Listen on SoundCloud")

    ), /*#__PURE__*/

    React.createElement("div", { className: "related-card" }, /*#__PURE__*/
    React.createElement("div", { className: "related-card-title" }, "Videos"),
    letter.videos?.map((v, i) => /*#__PURE__*/
    React.createElement("a", { key: i, className: "related-link", href: v.url, target: "_blank", rel: "noopener noreferrer" }, "\u25B6 ", v.label)
    ),
    letter.videoVoiceUrl && /*#__PURE__*/
    React.createElement("a", { className: "related-link", href: letter.videoVoiceUrl, target: "_blank", rel: "noopener noreferrer" }, "\u25B6 ", letter.videoVoiceLabel || "Video (with voice over)"),

    letter.videoMusicUrl && /*#__PURE__*/
    React.createElement("a", { className: "related-link", href: letter.videoMusicUrl, target: "_blank", rel: "noopener noreferrer" }, "\u25B6 Video (excerpts set to music)"), /*#__PURE__*/

    React.createElement("a", { className: "related-link", href: "https://www.youtube.com/user/trumpetcallofgod", target: "_blank", rel: "noopener noreferrer" }, /*#__PURE__*/React.createElement("span", { style: { color: '#cc4444' } }, "\u25B6"), " Official YouTube Channel")
    )
    )
    )

    )
    ), /*#__PURE__*/


    React.createElement(FootnoteSheet, {
      num: sheetFn,
      fn: sheetFn ? letter.footnotes[sheetFn] : null,
      nkjv: letter.nkjv,
      footnotes: letter.footnotes,
      onNavigate: (newKey) => setSheetFn(newKey),
      onClose: () => setSheetFn(null),
      onInAppLink: (link) => {setSheetFn(null);wrappedInAppLink && wrappedInAppLink(link);} }
    ), /*#__PURE__*/


    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: `fn-sheet-backdrop${scripRef ? " open" : ""}`, onClick: () => setScripRef(null) }), /*#__PURE__*/
    React.createElement("div", { className: `fn-sheet${scripRef ? " open" : ""}` }, /*#__PURE__*/
    React.createElement("div", { className: "fn-sheet-handle" }),
    scripRef && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("span", { className: "sc-sheet-tag" }, "Scripture Reference"), /*#__PURE__*/
    React.createElement("span", { className: "sc-sheet-cite" }, scripRef),
    (() => {
      const baked = letter.nkjv && letter.nkjv[scripRef];
      const looked = !baked ? lookupVersesFromBooks(scripRef) : null;
      const text = baked || looked;
      return text ? /*#__PURE__*/
      React.createElement("div", { className: "sc-sheet-verse" }, /*#__PURE__*/React.createElement(ScriptureVerseText, { text: text, cite: scripRef })) : /*#__PURE__*/
      React.createElement("div", { className: "sc-sheet-verse", style: { color: 'var(--cream-dim)', fontStyle: 'italic' } }, "Verse text not available in app data");
    })()
    )

    )
    ),

    hasProphecyGroups && /*#__PURE__*/
    React.createElement(ProphecyExpandToggle, { allExpanded: allExpanded, onToggle: (expand) => {
        setAllExpanded(expand);
        setExpandSignal(expand ? expandSignal >= 0 ? expandSignal + 1 : 1 : expandSignal <= 0 ? expandSignal - 1 : -1);
        // Batch-update all cards for this chapter in the persistent ref
        if (prophecyCardStatesRef) {
          const prefix = letter.id + ":";
          Object.keys(prophecyCardStatesRef.current).forEach((k) => {
            if (k.startsWith(prefix)) prophecyCardStatesRef.current[k] = expand;
          });
          saveProphecyCardStates && saveProphecyCardStates();
        }
      } })

    ));

}
