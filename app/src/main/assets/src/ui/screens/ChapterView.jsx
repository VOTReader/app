/* ═══════════════════════════════════════════════════════════════════════
   ChapterView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ChapterView({ book, chapter, mode, showStudy, showEchoes, showChapterTitle, titleFocusHidden, setTitleFocusHidden, onIndex, onNavigate, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, markAsReadEnabled, showProgressBar, onVotLetterClick, hlTick, onLinkOpen, backHint, onTapThroughBack }) {
  const [activeScripRef, setActiveScripRef] = React.useState(null);
  const [highlightedVerses, setHighlightedVerses] = React.useState([]);

  React.useEffect(() => {
    if (!activeScripRef) return;
    var prev = window.__closeSheet;
    window.__closeSheet = () => setActiveScripRef(null);
    return () => { window.__closeSheet = prev || null; };
  }, [activeScripRef]);

  // W1.5(a.2) — Escape-key dispatch registration. The scripture sheet is
  // always rendered (line ~233 mounts <ScriptureSheet activeRef={...}/>);
  // the registry gate uses `activeScripRef` because the sheet's onClose
  // is what actually clears the active ref (= the only meaningful close).
  useModalRegistry({
    id: 'scripture-sheet',
    dismiss: () => setActiveScripRef(null),
    active: !!activeScripRef,
  });

  React.useEffect(() => {
    if (!surpriseAnchor || surpriseAnchor.type !== "verse") return;
    const vs = surpriseAnchor.verses;
    setHighlightedVerses(vs);
    const timer = setTimeout(() => {
      const el = document.getElementById(`v-${vs[0]}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const fadeTimer = setTimeout(() => setHighlightedVerses([]), 4000);
    return () => { clearTimeout(timer); clearTimeout(fadeTimer); };
  }, [surpriseAnchor]);
  const prevCh = book.chapters.find((c) => c.num === chapter.num - 1);
  const nextCh = book.chapters.find((c) => c.num === chapter.num + 1);
  const verses = chapter.verses || [];

  useMarkAsRead(markAsReadEnabled, onMarkRead);
  const hasLinks = chapter.links && chapter.links.length > 0;

  return (
    <ScreenLayout
      showProgress={showProgressBar}
      navChildren={
        <>
          <button className="nav-home nav-back-icon" onClick={onIndex} title={`← ${book.title}`} aria-label={`Back to ${book.title}`}>‹</button>
          <HomeBtn />
          <div className="nav-arrows">
            <button
              className="nav-arrow-btn"
              disabled={!prevCh && !prevBoundary}
              onClick={() => prevCh ? onNavigate(prevCh.num) : onPrevBoundary && onPrevBoundary()}
              title="Previous"
              aria-label="Previous chapter"
            >‹</button>
            <button
              className="nav-arrow-btn"
              disabled={!nextCh && !nextBoundary}
              onClick={() => nextCh ? onNavigate(nextCh.num) : onNextBoundary && onNextBoundary()}
              title="Next"
              aria-label="Next chapter"
            >›</button>
          </div>
          <NavButtons
            onSettings={onSettings}
            onHistory={onHistory}
            onSearch={onSearch}
            theme={theme}
            onThemeChange={onThemeChange}
            reading={true}
            chapterBookmark={chapter ? { hlKey: 'study:matthew-' + chapter.num, label: 'Matthew ' + chapter.num + ' (Study)' } : null}
            hlTick={hlTick}
          />
        </>
      }
    >
      <StickyChapterNav
        onPrev={() => prevCh ? onNavigate(prevCh.num) : onPrevBoundary && onPrevBoundary()}
        onNext={() => nextCh ? onNavigate(nextCh.num) : onNextBoundary && onNextBoundary()}
        prevDisabled={!prevCh && !prevBoundary}
        nextDisabled={!nextCh && !nextBoundary}
        prevLabel="Previous chapter"
        nextLabel="Next chapter"
      />
      {backHint && (
        <div className="back-hint-row">
          <button className="back-hint-pill" onClick={onTapThroughBack} aria-label="Back to source">
            <span className="back-hint-arrow">‹</span>Back to{' '}
            <span className="back-hint-title">{backHint.volumeLabel ? `${backHint.volumeLabel} · ${backHint.title}` : backHint.title}</span>
          </button>
        </div>
      )}
      <header className="hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <div className="hero-eyebrow">Matthew {"\xA0\xB7\xA0"} Chapter {chapter.num}</div>
          <h1 className="hero-title">Chapter {chapter.num}</h1>
          {chapter.title && showChapterTitle && (
            !titleFocusHidden ? (
              <div
                className="hero-subtitle hero-subtitle-tappable"
                onClick={() => setTitleFocusHidden && setTitleFocusHidden(true)}
                title="Tap to hide summary"
                role="button"
              >
                {chapter.title}
              </div>
            ) : (
              <button
                className="hero-subtitle-restore"
                onClick={() => setTitleFocusHidden && setTitleFocusHidden(false)}
                title="Show summary"
                aria-label="Show chapter summary"
              >+ Show summary</button>
            )
          )}
          <div className="hero-ornament">
            <div className="hero-ornament-line" />
            <div className="hero-ornament-diamond" />
            <div className="hero-ornament-line r" />
          </div>
        </div>
      </header>

      <div className="page-wrapper">
        <div className="chapter-body">
          {mode === "pdf" ? (
            /* ── PDF MODE: clean flowing verse text + study panels below ── */
            <>
              <div className="verses-block">
                {verses.map((v, vi) => {
                  const vHlKey = studyHlKey(book.id + '-' + chapter.num, v.n);
                  return (
                    <span key={vi} id={`v-${v.n}`} className={`verse${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}`}>
                      <span className="verse-num">{v.n}</span>
                      <HighlightableText text={v.text} hlKey={vHlKey} hlTick={typeof hlTick !== 'undefined' ? hlTick : 0} />
                      <LinkIcon hlKey={vHlKey} hlTick={hlTick} onClick={onLinkOpen} />
                      <BookmarkIcon hlKey={vHlKey} hlTick={hlTick} />
                      {' '}
                    </span>
                  );
                })}
              </div>
              {showStudy && (
                <StudyPanels
                  scriptures={chapter.scriptures || []}
                  votNotes={chapter.votNotes || []}
                  onScriptureClick={setActiveScripRef}
                  onVotLetterClick={onVotLetterClick}
                />
              )}
            </>
          ) : (
            /* ── INLINE MODE: notes after each verse ── */
            <div className="verses-inline">
              {verses.map((v, vi) => {
                const { scriptures, votNotes } = getNotesForVerse(chapter, v.n);
                const echoes = showEchoes ? getEchoesForVerse(chapter, v.n) : { scriptures: [], votNotes: [] };
                const hasEchoes = echoes.scriptures.length > 0 || echoes.votNotes.length > 0;
                const vHlKey = studyHlKey(book.id + '-' + chapter.num, v.n);
                return (
                  <div key={vi} id={`v-${v.n}`} className={`verse-row${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}`}>
                    <div className="verse-line">
                      <span className="verse-num">{v.n}</span>
                      <HighlightableText text={v.text} hlKey={vHlKey} hlTick={typeof hlTick !== 'undefined' ? hlTick : 0} />
                      <LinkIcon hlKey={vHlKey} hlTick={hlTick} onClick={onLinkOpen} />
                      <BookmarkIcon hlKey={vHlKey} hlTick={hlTick} />
                    </div>
                    {showStudy && (scriptures.length > 0 || votNotes.length > 0) && (
                      <InlineNotes scriptures={scriptures} votNotes={votNotes} onScriptureClick={setActiveScripRef} onVotLetterClick={onVotLetterClick} />
                    )}
                    {showStudy && hasEchoes && (
                      <InlineEcho scriptures={echoes.scriptures} votNotes={echoes.votNotes} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Reading-end sentinel: end of verses/body, before Further Study links,
              ornament, and nav cards. */}
          <div className="reading-end" />

          {showStudy && hasLinks && (
            <div className="study-panel-group" style={{ marginTop: "2rem" }}>
              <div className="study-panel-group-title">Further Study</div>
              <div className="study-links">
                {chapter.links.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="study-link">
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="ornament-divider">
            <div className="ornament-divider-line" />
            <div className="ornament-divider-symbol">✦</div>
            <div className="ornament-divider-line" />
          </div>
          <div className="bottom-nav">
            {prevCh ? (
              <button className="bottom-nav-card" onClick={() => onNavigate(prevCh.num)}>
                <div className="bottom-nav-label">‹ Previous</div>
                <div className="bottom-nav-title">Matthew {prevCh.num}</div>
              </button>
            ) : prevBoundary ? (
              <button className="bottom-nav-card" onClick={onPrevBoundary}>
                <div className="bottom-nav-label">‹ Previous Book</div>
                <div className="bottom-nav-title">{prevBoundary.title}</div>
              </button>
            ) : (
              <div className="bottom-nav-card placeholder">
                <div className="bottom-nav-label">‹ Previous</div>
                <div className="bottom-nav-title">—</div>
              </div>
            )}

            {nextCh ? (
              <button className="bottom-nav-card next" onClick={() => onNavigate(nextCh.num)}>
                <div className="bottom-nav-label">Next ›</div>
                <div className="bottom-nav-title">Matthew {nextCh.num}</div>
              </button>
            ) : nextBoundary ? (
              <button className="bottom-nav-card next" onClick={onNextBoundary}>
                <div className="bottom-nav-label">Next Book ›</div>
                <div className="bottom-nav-title">{nextBoundary.title}</div>
              </button>
            ) : (
              <div className="bottom-nav-card next placeholder">
                <div className="bottom-nav-label">Next ›</div>
                <div className="bottom-nav-title">—</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ScriptureSheet activeRef={activeScripRef} onClose={() => setActiveScripRef(null)} />
    </ScreenLayout>
  );
}
