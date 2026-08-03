/* ═══════════════════════════════════════════════════════════════════════
   ChapterIndex — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ChapterIndex({ book, onSelect, onBack, backLabel, onSearch, onHistory, onSettings, currentChapter, theme, onThemeChange, isRead, markAsReadEnabled, restoredNames, showChapterTitle }) {
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
  // Wave 0: the back affordance must name its REAL destination. Callers
  // pass backLabel ("Poetry & Wisdom", "Studies", "Home", …); "Books" is
  // the legacy fallback for any call site that doesn't. One string feeds
  // BOTH the tooltip and the TalkBack label so they can never disagree.
  const backDest = backLabel || "Books";
  // "~N min" estimate per chapter card, at the user's measured pace when
  // one exists (ReadingStatsStore, bundle-b) — 230-wpm default otherwise.
  // Counts the BASE book text (word-count.js contract); hidden when the
  // counters are absent or the chapter shape yields no words.
  const _wpm = (typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.measuredWpm === 'function') ? ReadingStatsStore.measuredWpm() : null;
  const minChip = (ch) => {
    if (typeof countItemWords !== 'function' || typeof readingMinutes !== 'function') return null;
    const m = readingMinutes(countItemWords(ch), _wpm);
    return m > 0 ? <span className="idx-min-chip">~{m} min</span> : null;
  };
  return (
    <ScreenLayout
      navChildren={LibraryNav({
        onBack, backLabel: backDest,
        onSettings, onHistory, onSearch, theme, onThemeChange,
      })}
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
          {book.chapters.map((ch, _i) => {
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
                {minChip(ch)}
                {markAsReadEnabled && isRead(ch.num) && <span className="read-check">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </ScreenLayout>
  );
}
