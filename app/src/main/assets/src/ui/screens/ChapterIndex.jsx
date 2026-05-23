/* ═══════════════════════════════════════════════════════════════════════
   ChapterIndex — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ChapterIndex({ book, onSelect, onBack, onSearch, onHistory, onSettings, currentChapter, theme, onThemeChange, isRead, markAsReadEnabled, restoredNames, showChapterTitle }) {
  const currentRef = React.useRef(null);
  React.useEffect(() => {
    if (currentRef.current) {
      setTimeout(() => currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    }
  }, []);
  // Restored-Name chrome lookup for the chapter cards. When restoredNames
  // is on, show the restored chapter title; otherwise fall back to the
  // standard. If showChapterTitle is off, titles are hidden entirely.
  const getChapterTitle = (ch) => {
    if (showChapterTitle === false) return null;
    if (restoredNames && typeof BOOKS_RESTORED !== "undefined" && BOOKS_RESTORED[book.id]) {
      const r = BOOKS_RESTORED[book.id].chapters.find((c) => c.num === ch.num);
      if (r && r.title) return r.title;
    }
    return ch.title;
  };
  return (
    <ScreenLayout
      navChildren={
        <>
          <button className="nav-home" onClick={onBack}>{"← Books"}</button>
          <HomeBtn />
          <NavButtons onSettings={onSettings} onHistory={onHistory} onSearch={onSearch} theme={theme} onThemeChange={onThemeChange} />
        </>
      }
    >
      <div className="vol-index">
        <div className="vol-index-header">
          <div className="vol-index-eyebrow">Scriptures of Truth</div>
          <h1 className="vol-index-title">{book.title}</h1>
          <div className="vol-index-subtitle">{book.subtitle}</div>
          <div className="vol-index-ornament">
            <div className="vol-index-ornament-line" />
            <div className="vol-index-ornament-diamond" />
            <div className="vol-index-ornament-line r" />
          </div>
        </div>
        <div className="chapter-cards">
          {book.chapters.map((ch, i) => {
            const isCurrent = ch.num === currentChapter;
            return (
              <button
                key={ch.num}
                ref={isCurrent ? currentRef : null}
                className={`chapter-card-btn${isCurrent ? " is-current" : ""}`}
                onClick={() => onSelect(ch.num)}
              >
                <span className="chapter-card-num">{ch.num}</span>
                <div className="chapter-card-divider" />
                <div className="chapter-card-info">
                  {(() => {
                    const t = getChapterTitle(ch);
                    return t
                      ? <div className="chapter-card-title">{t}</div>
                      : <div className="chapter-card-title untitled">Chapter {ch.num}</div>;
                  })()}
                </div>
                {markAsReadEnabled && isRead(ch.num) && <span className="read-check">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </ScreenLayout>
  );
}
