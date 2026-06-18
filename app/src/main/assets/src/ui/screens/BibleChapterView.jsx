/* ═══════════════════════════════════════════════════════════════════════
   BibleChapterView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function BibleChapterView({ book, chapter, onIndex, onNavigate, prevBook, nextBook, onPrevBook, onNextBook, nextBoundaryTitle, prevBoundaryTitle, onSearch, onSettings, onHistory, theme, onThemeChange, surpriseAnchor, onMarkRead, markAsReadEnabled, showProgressBar, translation, restoredNames, showChapterTitle, showSectionHeadings, titleFocusHidden, setTitleFocusHidden, headingsFocusHidden, setHeadingsFocusHidden, onLinkOpen, backHint, onTapThroughBack }) {
  const [highlightedVerses, setHighlightedVerses] = React.useState([]);
  // Restored-Name chrome lookup. When settings.restoredNames is on and
  // books-restored.js has an entry for this chapter, swap the chrome.
  // Fall back silently to the standard chrome otherwise.
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
  const goPrevCh = () => prevCh ? onNavigate(prevCh.num) : onPrevBook && onPrevBook();
  const goNextCh = () => nextCh ? onNavigate(nextCh.num) : onNextBook && onNextBook();

  // Visible finger-follow page swipe (ScreenLayout `pager`). Same neighbors the
  // nav arrows + bottom-nav use: a same-book chapter peeks full verse content,
  // a book boundary peeks a card.
  const POETIC_BOOKS = new Set(['psalms', 'proverbs', 'songofsolomon', 'lamentations', 'ecclesiastes']);
  const isPoetry = POETIC_BOOKS.has(book.id);
  const _bibleBg = (typeof OT_BOOK_IDS !== 'undefined' && OT_BOOK_IDS.has(book.id)) ? 'ot' : '';
  const _versesPeek = (ch) => ({
    kind: 'verses', wrapClass: 'chapter-body', poetry: isPoetry,
    hero: { eyebrow: `${book.title}\xA0\xB7\xA0Chapter ${ch.num}`, title: (ch.title || book.subtitle), bgClass: _bibleBg },
    verses: ch.sections.flatMap((s) => s.verses),
  });
  const pager = {
    onPrev: goPrevCh,
    onNext: goNextCh,
    peek: (side) => side === 'next'
      ? (nextCh ? _versesPeek(nextCh) : nextBook ? { kind: 'boundary', eyebrow: 'Next Book', title: nextBoundaryTitle || `${nextBook.title} 1` } : null)
      : (prevCh ? _versesPeek(prevCh) : prevBook ? { kind: 'boundary', eyebrow: 'Previous Book', title: prevBoundaryTitle || `${prevBook.title} ${prevBook.chapters[prevBook.chapters.length - 1].num}` } : null),
  };

  useMarkAsRead(markAsReadEnabled, onMarkRead);

  return (
    <ScreenLayout
      showProgress={showProgressBar}
      pager={pager}
      navChildren={
        <>
          <button className="nav-home nav-back-icon" onClick={onIndex} title={`← ${book.title}`} aria-label={`Back to ${book.title}`}>‹</button>
          <HomeBtn />
          <div className="nav-arrows">
            <button
              className="nav-arrow-btn"
              disabled={!prevCh && !prevBook}
              onClick={goPrevCh}
              title="Previous"
              aria-label="Previous chapter"
            >‹</button>
            <button
              className="nav-arrow-btn"
              disabled={!nextCh && !nextBook}
              onClick={goNextCh}
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
            chapterBookmark={(book && chapter) ? { hlKey: 'bible:' + book.id + ':' + chapter.num, label: (book.title || book.id) + ' ' + chapter.num } : null}
            journalRefKey={(book && chapter && typeof jrnRefKeyForChapter === 'function') ? jrnRefKeyForChapter(book.id, chapter.num) : null}
            journalRefLabel={(book && chapter) ? ((book.title || book.id) + ' ' + chapter.num) : null}
          />
        </>
      }
    >
      <StickyChapterNav
        onPrev={goPrevCh}
        onNext={goNextCh}
        prevDisabled={!prevCh && !prevBook}
        nextDisabled={!nextCh && !nextBook}
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
      {(() => {
        const titleEffective = showChapterTitle && !titleFocusHidden;
        const canFocusTitle = showChapterTitle && displayChapterTitle;
        const hasCuratedTitle = !!displayChapterTitle;
        const titleText = titleEffective && hasCuratedTitle ? displayChapterTitle : book.subtitle;
        const titleIsTappable = titleEffective && hasCuratedTitle;
        return (
          <header className="hero">
            <div className={`hero-bg${OT_BOOK_IDS.has(book.id) ? " ot" : ""}`} />
            <div className="hero-content">
              <div className="hero-eyebrow">{book.title} {"\xA0\xB7\xA0"} Chapter {chapter.num}</div>
              <h1
                className={`hero-title${titleIsTappable ? " hero-title-tappable" : ""}`}
                onClick={titleIsTappable ? () => setTitleFocusHidden && setTitleFocusHidden(true) : undefined}
                title={titleIsTappable ? "Tap to hide chapter title" : undefined}
                role={titleIsTappable ? "button" : undefined}
              >
                {titleText}
              </h1>
              {canFocusTitle && titleFocusHidden && (
                <button
                  className="hero-subtitle-restore"
                  onClick={() => setTitleFocusHidden && setTitleFocusHidden(false)}
                  title="Show chapter title"
                  aria-label="Show chapter title"
                >+ Show chapter title</button>
              )}
              <div className="hero-ornament">
                <div className="hero-ornament-line" />
                <div className="hero-ornament-diamond" />
                <div className="hero-ornament-line r" />
              </div>
            </div>
          </header>
        );
      })()}
      <div className="page-wrapper">
        <div className="chapter-body">
          {showSectionHeadings && headingsFocusHidden && chapter.sections.some((s) => s.heading || s.letter) && (
            <button
              className="hero-subtitle-restore headings-restore"
              onClick={() => setHeadingsFocusHidden && setHeadingsFocusHidden(false)}
              title="Show section headings"
              aria-label="Show section headings"
            >+ Show section headings</button>
          )}

          {(() => {
            const headingsVisible = showSectionHeadings && !headingsFocusHidden;
            const renderVerse = (v, vi) => {
              const vHlKey = bibleHlKey(book.id, chapter.num, v.n);
              const vText = translateVerse(book.id, chapter.num, v, translation);
              return (
                <span key={vi} id={`v-${v.n}`} className={`verse${highlightedVerses.includes(v.n) ? " verse-surprise" : ""}`}>
                  <span className="verse-num">{v.n}</span>
                  <HighlightableText text={vText} hlKey={vHlKey} />
                  <LinkIcon hlKey={vHlKey} onClick={onLinkOpen} />
                  <BookmarkIcon hlKey={vHlKey} />
                  {' '}
                </span>
              );
            };

            if (!headingsVisible) {
              // Flat render: concatenate all verses from all sections into one
              // continuous verses-block — no section-block wrapping, no gaps.
              const allVerses = chapter.sections.flatMap((s) => s.verses);
              return (
                <div className={`verses-block${isPoetry ? ' is-poetry' : ''}`}>
                  {allVerses.map(renderVerse)}
                </div>
              );
            }
            return chapter.sections.map((sec, si) => (
              <div key={si} className="section-block">
                {sec.letter ? (
                  <div
                    className="section-heading-psalm119 section-heading-tappable"
                    onClick={() => setHeadingsFocusHidden && setHeadingsFocusHidden(true)}
                    title="Tap to hide headings"
                    role="button"
                  >
                    <span className="hebrew-letter">{sec.letter}</span>
                    <span className="hebrew-letter-name">{getSectionHeading(si, sec)}</span>
                  </div>
                ) : sec.heading ? (
                  <div
                    className="section-heading section-heading-tappable"
                    onClick={() => setHeadingsFocusHidden && setHeadingsFocusHidden(true)}
                    title="Tap to hide headings"
                    role="button"
                  >
                    {getSectionHeading(si, sec)}
                  </div>
                ) : null}
                <div className={`verses-block${isPoetry ? ' is-poetry' : ''}`}>
                  {sec.verses.map(renderVerse)}
                </div>
              </div>
            ));
          })()}
          {/* Reading-end sentinel: end of verses, before ornament and nav. */}
          <div className="reading-end" />
          <div className="ornament-divider">
            <div className="ornament-divider-line" />
            <div className="ornament-divider-symbol">✦</div>
            <div className="ornament-divider-line" />
          </div>
          <div className="bottom-nav">
            {prevCh ? (
              <button className="bottom-nav-card" onClick={() => onNavigate(prevCh.num)}>
                <div className="bottom-nav-label">‹ Previous</div>
                <div className="bottom-nav-title">{book.title} {prevCh.num}</div>
              </button>
            ) : prevBook ? (
              <button className="bottom-nav-card" onClick={onPrevBook}>
                <div className="bottom-nav-label">‹ Previous Book</div>
                <div className="bottom-nav-title">{prevBoundaryTitle || `${prevBook.title} ${prevBook.chapters[prevBook.chapters.length - 1].num}`}</div>
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
                <div className="bottom-nav-title">{book.title} {nextCh.num}</div>
              </button>
            ) : nextBook ? (
              <button className="bottom-nav-card next" onClick={onNextBook}>
                <div className="bottom-nav-label">Next Book ›</div>
                <div className="bottom-nav-title">{nextBoundaryTitle || `${nextBook.title} 1`}</div>
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
    </ScreenLayout>
  );
}
