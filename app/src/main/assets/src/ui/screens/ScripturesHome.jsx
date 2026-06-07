/* ═══════════════════════════════════════════════════════════════════════
   ScripturesHome — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ScripturesHome({ onSelect, onGenre, onBack, onSearch, onHistory, onSettings, theme, onThemeChange, onMatthewStudy: _onMatthewStudy, layout, translation }) {
  // Q8: pre-trigger the Bible corpus load when this screen mounts so the
  // user's likely next action (tap a genre tile or book) doesn't pay the
  // full ~7 MB download wait. The subscription re-renders this component
  // when BOOKS becomes defined, replacing skeleton "—" counts with real
  // chapter totals. Idempotent — second mount returns the cached Promise.
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__bibleCorpus !== 'undefined' ? window.__bibleCorpus.subscribe(cb) : () => {}), []),
    () => (typeof window.__bibleCorpus !== 'undefined' ? window.__bibleCorpus.getVersion() : 0)
  );
  React.useEffect(() => {
    if (typeof window.__loadBibleCorpus === 'function') {
      window.__loadBibleCorpus().catch((e) => console.warn('Bible corpus pre-load failed', e));
    }
    // Also pre-fire the Matthew Study Bible — the home screen offers a
    // "Matthew Study" jump-button which lands directly on matthew-idx.
    if (typeof window.__loadMatthewCorpus === 'function') {
      window.__loadMatthewCorpus().catch((e) => console.warn('Matthew corpus pre-load failed', e));
    }
  }, []);
  const bibleLoaded = typeof window.__bibleCorpus !== 'undefined' && window.__bibleCorpus.loaded;

  const handleTile = (group) => {
    // Block book-navigation tiles (single-book) until BOOKS is loaded —
    // setScreen('bible-ch') would render a blank chapter view otherwise.
    if (!bibleLoaded && typeof window.__loadBibleCorpus === 'function') {
      window.__loadBibleCorpus().then(() => {
        if (group.single) onSelect(group.books[0].id, true);
        else onGenre(group.id);
      });
      return;
    }
    if (group.single) {onSelect(group.books[0].id, true);} else
    onGenre(group.id);
  };
  const handleBook = (id) => {
    if (!bibleLoaded && typeof window.__loadBibleCorpus === 'function') {
      window.__loadBibleCorpus().then(() => onSelect(id));
      return;
    }
    onSelect(id);
  };

  const allGenres = [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt];
  const allBooks = allGenres.flatMap((g) => g.books);

  const navBar = (
    <>
      <button className="nav-home" onClick={onBack}>{"← Home"}</button>
      <NavButtons onSettings={onSettings} onHistory={onHistory} onSearch={onSearch} theme={theme} onThemeChange={onThemeChange} />
    </>
  );

  const hero = (
    <>
      <div className="home-eyebrow">{translationName(translation)}</div>
      <h1 className="home-title">The Scriptures of Truth</h1>
      <div className="home-ornament">
        <div className="home-ornament-line" />
        <div className="home-ornament-diamond" />
        <div className="home-ornament-line r" />
      </div>
    </>
  );

  /* ── GENRE GRID (default) ── */
  if (layout === "genre" || !layout) return (
    <ScreenLayout navChildren={navBar}>
      <div className="home-screen scriptures-landing">
        {hero}
        <div className="genre-columns">
          <div className="genre-col genre-col-stretch">
            <div className="genre-col-label">Old Testament</div>
            {SCRIPTURE_GENRES.ot.map((g) => {
              const totalCh = bibleLoaded
                ? g.books.reduce((s, b) => s + (BOOKS[b.id]?.chapters.length || 0), 0)
                : '—';
              const bookCount = g.books.length;
              const bookLabel = `${bookCount} ${bookCount === 1 ? "Book" : "Books"}`;
              return (
                <button key={g.id} className="genre-tile" onClick={() => handleTile(g)}>
                  <div className="genre-tile-title">{g.label}</div>
                  <div className="genre-tile-sub">{bookLabel}{" · "}{totalCh} Chapters</div>
                </button>
              );
            })}
          </div>
          <div className="genre-col genre-col-stretch">
            <div className="genre-col-label">New Testament</div>
            {SCRIPTURE_GENRES.nt.map((g) => {
              const totalCh = bibleLoaded
                ? g.books.reduce((s, b) => s + (BOOKS[b.id]?.chapters.length || 0), 0)
                : '—';
              const bookCount = g.books.length;
              const bookLabel = `${bookCount} ${bookCount === 1 ? "Book" : "Books"}`;
              return (
                <button key={g.id} className="genre-tile" onClick={() => handleTile(g)}>
                  <div className="genre-tile-title">{g.label}</div>
                  <div className="genre-tile-sub">{bookLabel}{" · "}{totalCh} Chapters</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </ScreenLayout>
  );

  /* ── COMPACT LIST ── */
  if (layout === "compact") return (
    <ScreenLayout navChildren={navBar}>
      <div className="home-screen">
        {hero}
        <div className="compact-list">
          {[
            { label: "Old Testament", genres: SCRIPTURE_GENRES.ot },
            { label: "New Testament", genres: SCRIPTURE_GENRES.nt }
          ].map((section) => (
            <React.Fragment key={section.label}>
              <div className="compact-list-header" style={{ fontSize: "0.65rem", color: "var(--gold)", marginTop: "0.8rem" }}>{section.label}</div>
              {section.genres.map((g) => (
                <div key={g.id} className="compact-list-group">
                  <div className="compact-list-header">{g.label}</div>
                  {g.books.map((b) => (
                    <button key={b.id} className="compact-list-item" onClick={() => handleBook(b.id)}>
                      <span className="compact-list-title">{b.title}</span>
                      <span className="compact-list-detail">{b.detail}</span>
                    </button>
                  ))}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </ScreenLayout>
  );

  /* ── BOOK GRID ── */
  if (layout === "grid") return (
    <ScreenLayout navChildren={navBar}>
      <div className="home-screen">
        {hero}
        <div className="flat-grid">
          {allBooks.map((b) => (
            <button key={b.id} className="flat-grid-card" onClick={() => handleBook(b.id)}>
              <div className="flat-grid-title">{b.title}</div>
              <div className="flat-grid-detail">{b.detail}</div>
            </button>
          ))}
        </div>
      </div>
    </ScreenLayout>
  );

  /* ── CANONICAL SCROLL ── */
  const otBooks = SCRIPTURE_GENRES.ot.flatMap((g) => g.books);
  const ntBooks = SCRIPTURE_GENRES.nt.flatMap((g) => g.books);
  let canonNum = 0;
  return (
    <ScreenLayout navChildren={navBar}>
      <div className="home-screen">
        {hero}
        <div className="canon-scroll">
          <div className="canon-scroll-divider">Old Testament</div>
          {otBooks.map((b) => {
            canonNum++;
            return (
              <button key={b.id} className="canon-card" style={{ animationDelay: `${canonNum * 0.3 % 5}s` }} onClick={() => handleBook(b.id)}>
                <span className="canon-card-num">{String(canonNum).padStart(2, "0")}</span>
                <div className="canon-card-body">
                  <div className="canon-card-title">{b.title}</div>
                  {CANON_SUBTITLES[b.id] && <div className="canon-card-sub">{CANON_SUBTITLES[b.id]}</div>}
                  <div className="canon-card-detail">{b.detail}</div>
                </div>
              </button>
            );
          })}
          <div className="canon-scroll-divider">New Testament</div>
          {ntBooks.map((b) => {
            canonNum++;
            return (
              <button key={b.id} className="canon-card" style={{ animationDelay: `${canonNum * 0.3 % 5}s` }} onClick={() => handleBook(b.id)}>
                <span className="canon-card-num">{String(canonNum).padStart(2, "0")}</span>
                <div className="canon-card-body">
                  <div className="canon-card-title">{b.title}</div>
                  {CANON_SUBTITLES[b.id] && <div className="canon-card-sub">{CANON_SUBTITLES[b.id]}</div>}
                  <div className="canon-card-detail">{b.detail}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ScreenLayout>
  );
}
