/* ═══════════════════════════════════════════════════════════════════════
   BibleStudyIndex — Cluster D (esbuild bundle-d.js)
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
    return (
      <button
        key={ch.id}
        ref={isCurrent ? currentRef : null}
        className={`chapter-card-btn${isCurrent ? " is-current" : ""}`}
        onClick={() => onSelect(ch.id)}
      >
        <span className="chapter-card-num">{ch.num}</span>
        <div className="chapter-card-divider" />
        <div className="chapter-card-info">
          {ch.title
            ? <div className="chapter-card-title">{ch.title}</div>
            : <div className="chapter-card-title untitled">Part {ch.num}</div>
          }
        </div>
        {markAsReadEnabled && isRead(ch.id) && <span className="read-check">{"✓"}</span>}
      </button>
    );
  };

  const navBar = (
    <>
      <button className="nav-home" onClick={onBack}>{"← Studies"}</button>
      <HomeBtn />
      <NavButtons onSettings={onSettings} onHistory={onHistory} onSearch={onSearch} theme={theme} onThemeChange={onThemeChange} />
    </>
  );

  return (
    <ScreenLayout navChildren={navBar}>
      <div className="vol-index">
        <div className="vol-index-header">
          <div className="vol-index-eyebrow">Bible/Letter Study</div>
          <h1 className="vol-index-title">{study.title}</h1>
          {study.subtitle && <div className="vol-index-subtitle">{study.subtitle}</div>}
          <div className="vol-index-ornament">
            <div className="vol-index-ornament-line" />
            <div className="vol-index-ornament-diamond" />
            <div className="vol-index-ornament-line r" />
          </div>
        </div>
        <div className="chapter-cards">
          {study.parts ? (
            <>
              {study.prefaceId && renderChapterCard(resolveChapter(study.prefaceId))}
              {study.parts.map((part) => {
                const partChapters = part.chapterIds.map(resolveChapter).filter(Boolean);
                const sectionCount = partChapters.length;
                const isSingleSection = sectionCount === 1;
                const isOpen = expandedPart === part.num;

                if (isSingleSection) {
                  /* Single-section part: direct tap goes straight to chapter */
                  const ch = partChapters[0];
                  const isCurrent = ch && ch.id === currentChapter;
                  return (
                    <button
                      key={part.num}
                      ref={isCurrent ? currentRef : null}
                      className={`part-group-card${isCurrent ? " is-expanded" : ""}`}
                      onClick={() => ch && onSelect(ch.id)}
                    >
                      <div className="part-group-info">
                        <div className="part-group-num">Part {part.num}</div>
                        <div className="part-group-title">{part.title}</div>
                        {part.subtitle && <div className="part-group-subtitle">{part.subtitle}</div>}
                      </div>
                      {markAsReadEnabled && ch && isRead(ch.id) && <span className="read-check">{"✓"}</span>}
                    </button>
                  );
                }

                /* Multi-section part: accordion expand */
                return (
                  <React.Fragment key={part.num}>
                    <button
                      className={`part-group-card${isOpen ? " is-expanded" : ""}`}
                      onClick={() => setExpandedPart(isOpen ? null : part.num)}
                    >
                      <div className="part-group-info">
                        <div className="part-group-num">Part {part.num}</div>
                        <div className="part-group-title">{part.title}</div>
                        {part.subtitle && <div className="part-group-subtitle">{part.subtitle}</div>}
                      </div>
                      <span className={`part-chevron${isOpen ? " is-open" : ""}`}>{"›"}</span>
                    </button>
                    {isOpen && (
                      <div className="part-chapters">
                        {partChapters.map((ch) => renderChapterCard(ch))}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          ) : (
            /* Flat chapter list fallback for studies without parts */
            (study.chapters || []).map((ch) => renderChapterCard(ch))
          )}
        </div>
      </div>
    </ScreenLayout>
  );
}
