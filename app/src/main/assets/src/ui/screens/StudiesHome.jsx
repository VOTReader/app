/* ═══════════════════════════════════════════════════════════════════════
   StudiesHome — Cluster G (bundle-d since lz1; lazy bundle-g before)
   ═══════════════════════════════════════════════════════════════════════
   studyCoverage, studyCoverageDetail and CoverageBadge are bundle-d globals,
   read at call time rather than imported (in lazy bundle-g a bundled copy
   would have shipped twice). */

export function StudiesHome({ studies, studiesLoading, studiesError, onRetry, onSelectStudy, onOpenAnswers, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
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
      navChildren={LibraryNav({
        onBack, backLabel: 'Home', showHome: false,
        onSettings, onHistory, onSearch, theme, onThemeChange,
      })}
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
          {list.length === 0 && !studiesLoading && !studiesError && (
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
                  {/* Hub order 2026-09-22: the row says whether it can be read
                      along with BEFORE the tap. 52 study chapters have no
                      recording at all (align's census), which nothing on the
                      way in used to admit. A locked study promises nothing
                      yet, so it carries no badge. */}
                  {s.locked ? null : (() => {
                    const coverage = studyCoverage(s);
                    return <CoverageBadge state={coverage.state} detail={studyCoverageDetail(coverage, s.parts ? 'chapters' : 'parts')} />;
                  })()}
                </div>
              </button>
            );
          })}
          {studiesError && !studiesLoading && (
            <div className="studies-empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center" }}>
              <div>{list.length === 0 ? "Couldn’t load studies." : "Some studies couldn’t load."}</div>
              <button type="button" onClick={onRetry} style={{ padding: "8px 20px", borderRadius: "999px", border: "1px solid currentColor", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer", opacity: 0.85 }}>Try again</button>
            </div>
          )}
          {/* U14 (AOGCG, 2026-10-22): Answers Only God Can Give is in the app, so the row opens it here
              (answers-home) rather than the website; the landing's About sheet links the site. */}
          {onOpenAnswers ? (
            <button type="button" className="chapter-card-btn" onClick={onOpenAnswers}>
              <span className="chapter-card-num">{list.length + 1}</span>
              <div className="chapter-card-divider" />
              <div className="chapter-card-info">
                <div className="chapter-card-label">Topics & Doctrines</div>
                <div className="chapter-card-title">Answers Only God Can Give</div>
              </div>
            </button>
          ) : null}
        </div>
      </div>
    </ScreenLayout>
  );
}
