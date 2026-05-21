/* ═══════════════════════════════════════════════════════════════════════
   BibleStudyIndex — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function BibleStudyIndex({ study, onSelect, onBack, onSearch, onHistory, onSettings, currentChapter, theme, onThemeChange, isRead, markAsReadEnabled }) {
  const currentRef = React.useRef(null);
  const [expandedPart, setExpandedPart] = React.useState(null);

  // Auto-expand the part containing the current reading position
  React.useEffect(() => {
    if (currentChapter && study.parts) {
      const ownerPart = study.parts.find((p) => p.chapterIds.includes(currentChapter));
      if (ownerPart) setExpandedPart(ownerPart.num);
    }
  }, []);

  // Scroll current chapter into view after expand
  React.useEffect(() => {
    if (currentRef.current) {
      setTimeout(() => currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" }), 180);
    }
  }, [expandedPart]);

  const resolveChapter = (cid) => (study.chapters || []).find((c) => c.id === cid);

  const renderChapterCard = (ch) => {
    if (!ch) return null;
    const isCurrent = ch.id === currentChapter;
    return (/*#__PURE__*/
      React.createElement("button", {
        key: ch.id,
        ref: isCurrent ? currentRef : null,
        className: `chapter-card-btn${isCurrent ? " is-current" : ""}`,
        onClick: () => onSelect(ch.id) }, /*#__PURE__*/

      React.createElement("span", { className: "chapter-card-num" }, ch.num), /*#__PURE__*/
      React.createElement("div", { className: "chapter-card-divider" }), /*#__PURE__*/
      React.createElement("div", { className: "chapter-card-info" },
      ch.title ? /*#__PURE__*/
      React.createElement("div", { className: "chapter-card-title" }, ch.title) : /*#__PURE__*/

      React.createElement("div", { className: "chapter-card-title untitled" }, "Part ", ch.num)

      ),
      markAsReadEnabled && isRead(ch.id) && /*#__PURE__*/React.createElement("span", { className: "read-check" }, "\u2713")
      ));

  };

  const navBar = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
  React.createElement("button", { className: "nav-home", onClick: onBack }, "\u2190 Studies"), /*#__PURE__*/
  React.createElement(HomeBtn, null), /*#__PURE__*/
  React.createElement(NavButtons, { onSettings: onSettings, onHistory: onHistory, onSearch: onSearch, theme: theme, onThemeChange: onThemeChange })
  );

  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: navBar }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-header" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-eyebrow" }, "Bible/Letter Study"), /*#__PURE__*/
    React.createElement("h1", { className: "vol-index-title" }, study.title),
    study.subtitle && /*#__PURE__*/React.createElement("div", { className: "vol-index-subtitle" }, study.subtitle), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament" }, /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-diamond" }), /*#__PURE__*/
    React.createElement("div", { className: "vol-index-ornament-line r" })
    )
    ), /*#__PURE__*/
    React.createElement("div", { className: "chapter-cards" },
    study.parts ? /*#__PURE__*/React.createElement(React.Fragment, null,

    study.prefaceId && renderChapterCard(resolveChapter(study.prefaceId)),


    study.parts.map((part) => {
      const partChapters = part.chapterIds.map(resolveChapter).filter(Boolean);
      const sectionCount = partChapters.length;
      const isSingleSection = sectionCount === 1;
      const isOpen = expandedPart === part.num;

      if (isSingleSection) {
        /* Single-section part: direct tap goes straight to chapter */
        const ch = partChapters[0];
        const isCurrent = ch && ch.id === currentChapter;
        return (/*#__PURE__*/
          React.createElement("button", {
            key: part.num,
            ref: isCurrent ? currentRef : null,
            className: `part-group-card${isCurrent ? " is-expanded" : ""}`,
            onClick: () => ch && onSelect(ch.id) }, /*#__PURE__*/

          React.createElement("div", { className: "part-group-info" }, /*#__PURE__*/
          React.createElement("div", { className: "part-group-num" }, "Part ", part.num), /*#__PURE__*/
          React.createElement("div", { className: "part-group-title" }, part.title),
          part.subtitle && /*#__PURE__*/React.createElement("div", { className: "part-group-subtitle" }, part.subtitle)
          ),
          markAsReadEnabled && ch && isRead(ch.id) && /*#__PURE__*/React.createElement("span", { className: "read-check" }, "\u2713")
          ));

      }

      /* Multi-section part: accordion expand */
      return (/*#__PURE__*/
        React.createElement(React.Fragment, { key: part.num }, /*#__PURE__*/
        React.createElement("button", {
          className: `part-group-card${isOpen ? " is-expanded" : ""}`,
          onClick: () => setExpandedPart(isOpen ? null : part.num) }, /*#__PURE__*/

        React.createElement("div", { className: "part-group-info" }, /*#__PURE__*/
        React.createElement("div", { className: "part-group-num" }, "Part ", part.num), /*#__PURE__*/
        React.createElement("div", { className: "part-group-title" }, part.title),
        part.subtitle && /*#__PURE__*/React.createElement("div", { className: "part-group-subtitle" }, part.subtitle)
        ), /*#__PURE__*/
        React.createElement("span", { className: `part-chevron${isOpen ? " is-open" : ""}` }, "\u203A")
        ),
        isOpen && /*#__PURE__*/
        React.createElement("div", { className: "part-chapters" },
        partChapters.map((ch) => renderChapterCard(ch))
        )

        ));

    })
    ) : (
    /* Flat chapter list fallback for studies without parts */
    (study.chapters || []).map((ch) => renderChapterCard(ch)))

    )
    )
    ));

}
