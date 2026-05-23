/* ═══════════════════════════════════════════════════════════════════════
   ScriptureGenre — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ScriptureGenre({ genreId, onSelect, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const genre = [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt].find((g) => g.id === genreId);
  if (!genre) return null;
  const testament = SCRIPTURE_GENRES.nt.some((g) => g.id === genreId) ? "New Testament" : "Old Testament";
  return (
    <ScreenLayout
      navChildren={
        <>
          <button className="nav-home" onClick={onBack}>{"← Scriptures"}</button>
          <HomeBtn />
          <NavButtons onSettings={onSettings} onHistory={onHistory} onSearch={onSearch} theme={theme} onThemeChange={onThemeChange} />
        </>
      }
    >
      <div className="vol-index">
        <div className="vol-index-header">
          <div className="vol-index-eyebrow">{testament}</div>
          <h1 className="vol-index-title">{genre.label}</h1>
          <div className="vol-index-ornament">
            <div className="vol-index-ornament-line" />
            <div className="vol-index-ornament-diamond" />
            <div className="vol-index-ornament-line r" />
          </div>
        </div>
        <div className="chapter-cards">
          {genre.books.map((b, i) => (
            <button
              key={b.id}
              className="chapter-card-btn"
              onClick={() => onSelect(b.id)}
            >
              <span className="chapter-card-num">{i + 1}</span>
              <div className="chapter-card-divider" />
              <div className="chapter-card-info">
                <div className="chapter-card-label">{b.detail}</div>
                <div className="chapter-card-title">{b.title}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </ScreenLayout>
  );
}
