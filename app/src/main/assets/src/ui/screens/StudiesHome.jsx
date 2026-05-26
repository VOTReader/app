/* ═══════════════════════════════════════════════════════════════════════
   StudiesHome — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function StudiesHome({ studies, studiesLoading, onSelectStudy, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  // Q8.2: pre-fire the Matthew Study Bible corpus load. By the time the
  // user picks a study from the list, the 618 KB corpus is already
  // downloading in parallel.
  React.useEffect(() => {
    if (typeof window.__loadMatthewCorpus === 'function') {
      window.__loadMatthewCorpus().catch((e) => console.warn('Matthew corpus pre-load failed', e));
    }
  }, []);
  // `studies` is the pre-ordered UNIFIED_CHAIN from App — heavy → light,
  // Matthew Study Bible already inserted at its weighted position.
  // studiesLoading is true while bible-studies.js is fetched the first time.
  const list = studies || [];
  return (
    <ScreenLayout
      navChildren={
        <>
          <button className="nav-home" onClick={onBack}>{"← Home"}</button>
          <NavButtons onSettings={onSettings} onHistory={onHistory} onSearch={onSearch} theme={theme} onThemeChange={onThemeChange} />
        </>
      }
    >
      <div className="vol-index">
        <div className="vol-index-header">
          <div className="vol-index-eyebrow">In-Depth Bible Studies</div>
          <h1 className="vol-index-title">Studies</h1>
          <div className="vol-index-subtitle">Bible/Letter Studies & The VOT Matthew Study Bible</div>
          <div className="vol-index-ornament">
            <div className="vol-index-ornament-line" />
            <div className="vol-index-ornament-diamond" />
            <div className="vol-index-ornament-line r" />
          </div>
        </div>
        <div className="chapter-cards">
          {list.length === 0 && studiesLoading && (
            <div className="sc-sheet-loading" style={{ textAlign: "center", padding: "1.5rem 0" }}>Loading studies…</div>
          )}
          {list.length === 0 && !studiesLoading && (
            <div className="studies-empty">Letter Studies coming soon.</div>
          )}
          {list.map((s, i) => {
            const isMatthew = !!s.isMatthewStudy;
            const chCount = s.chapters ? s.chapters.length : 0;
            const displayCount = s.parts ? s.parts.length : chCount;
            const partsLabel = isMatthew ?
              `${chCount} Chapters · Inline Commentary` :
              s.singlePage ?
                "Reference" :
                displayCount > 0 ? `${displayCount} ${displayCount === 1 ? "Part" : "Parts"} · Bible Study` : "Coming Soon";
            return (
              <button
                key={s.id}
                className={`chapter-card-btn${s.locked ? " is-locked" : ""}`}
                onClick={() => !s.locked && onSelectStudy(s.slug || s.id)}
                disabled={s.locked}
              >
                <span className="chapter-card-num">{i + 1}</span>
                <div className="chapter-card-divider" />
                <div className="chapter-card-info">
                  <div className="chapter-card-label">{s.locked ? "Coming Soon" : partsLabel}</div>
                  <div className="chapter-card-title">{s.title}</div>
                </div>
              </button>
            );
          })}
          <a className="chapter-card-btn study-external-card" href="https://answersonlygodcangive.com/" target="_blank" rel="noopener noreferrer">
            <span className="chapter-card-num">↗</span>
            <div className="chapter-card-divider" />
            <div className="chapter-card-info">
              <div className="chapter-card-label">External Site</div>
              <div className="chapter-card-title">AnswersOnlyGodCanGive.com</div>
            </div>
          </a>
        </div>
      </div>
    </ScreenLayout>
  );
}
