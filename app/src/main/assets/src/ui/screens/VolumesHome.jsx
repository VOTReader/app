/* ═══════════════════════════════════════════════════════════════════════
   VolumesHome — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function VolumesHome({ onSelect, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const collections = [
  { id: "lords-rebuke", title: "The Lord's Rebuke", sub: "Correction & Warning", locked: LETTERS_REBUKE.length === 0 },
  { id: "words-to-live-by-1", title: "Words To Live By: Part One", sub: `${WTLB_ONE.length} Entries · Words of Wisdom`, locked: false },
  { id: "words-to-live-by-2", title: "Words To Live By: Part Two", sub: `${WTLB_TWO.length} Entries · More Words of Wisdom`, locked: false },
  { id: "the-blessed", title: "The Blessed", sub: colLetterArr(COL_BY_KEY.get('blessed')).length > 0 ? `${colLetterArr(COL_BY_KEY.get('blessed')).length} Entries · Blessings & Promises` : "Blessings & Promises", locked: colLetterArr(COL_BY_KEY.get('blessed')).length === 0 },
  { id: "little-flock", title: "Letters to The Little Flock", sub: LETTERS_FLOCK.length > 0 ? `${LETTERS_FLOCK.length} Letters` : "Personal Instruction", locked: LETTERS_FLOCK.length === 0 },
  { id: "letters-timothy", title: "Letters from Timothy", sub: LETTERS_TIMOTHY.length > 0 ? `${LETTERS_TIMOTHY.length} Letters` : "A Servant's Pen", locked: LETTERS_TIMOTHY.length === 0 },
  { id: "holy-days", title: "Regarding The Holy Days", sub: colLetterArr(COL_BY_KEY.get('holydays')).length > 0 ? `${colLetterArr(COL_BY_KEY.get('holydays')).length} Letters · Appointed Times` : "Appointed Times", locked: colLetterArr(COL_BY_KEY.get('holydays')).length === 0 }];

  const volumes = [
  { id: "volume-one", title: "Volume One", detail: `${LETTERS_V1.length} Letters`, sub: "2004 – 2006", locked: false },
  { id: "volume-two", title: "Volume Two", detail: `${LETTERS.length} Letters`, sub: "2004 – 2010", locked: false },
  { id: "volume-three", title: "Volume Three", detail: LETTERS_V3.length > 0 ? `${LETTERS_V3.length} Letters` : null, sub: "2006 – 2010", locked: LETTERS_V3.length === 0 },
  { id: "volume-four", title: "Volume Four", detail: LETTERS_V4.length > 0 ? `${LETTERS_V4.length} Letters` : null, sub: "2010 – 2011", locked: LETTERS_V4.length === 0 },
  { id: "volume-five", title: "Volume Five", detail: LETTERS_V5.length > 0 ? `${LETTERS_V5.length} Letters` : null, sub: "2011 – 2014", locked: LETTERS_V5.length === 0 },
  { id: "volume-six", title: "Volume Six", detail: LETTERS_V6.length > 0 ? `${LETTERS_V6.length} Letters` : null, sub: "2011 – 2014", locked: LETTERS_V6.length === 0 },
  { id: "volume-seven", title: "Volume Seven", detail: LETTERS_V7.length > 0 ? `${LETTERS_V7.length} Letters` : null, sub: "2005 – 2014", locked: LETTERS_V7.length === 0 }];

  return (
    <ScreenLayout
      navChildren={
        <>
          <button className="nav-home" onClick={onBack}>{"← Home"}</button>
          <NavButtons onSettings={onSettings} onHistory={onHistory} onSearch={onSearch} theme={theme} onThemeChange={onThemeChange} />
        </>
      }
    >
      <div className="home-screen volumes-landing">
        <div className="home-eyebrow">Prophetic Letters</div>
        <h1 className="home-title">The Volumes of Truth</h1>
        <p className="home-sub">Letters from The Lord, Our God and Savior</p>
        <div className="home-ornament">
          <div className="home-ornament-line" />
          <div className="home-ornament-diamond" />
          <div className="home-ornament-line r" />
        </div>
        <div className="genre-columns">
          <div className="genre-col genre-col-stretch">
            <div className="genre-col-label">The Seven Volumes</div>
            {volumes.map((v, _i) => (
              <button
                key={v.id}
                className={`genre-tile${v.locked ? " locked" : ""}`}
                onClick={() => !v.locked && onSelect(v.id)}
              >
                <div className="genre-tile-title">{v.title}</div>
                {(v.detail || v.sub) && <div className="genre-tile-sub">{[v.detail, v.sub].filter(Boolean).join(" · ")}</div>}
                {v.locked && <div className="genre-tile-badge">Coming Soon</div>}
              </button>
            ))}
          </div>
          <div className="genre-col genre-col-stretch">
            <div className="genre-col-label">Collections</div>
            {collections.map((b, _i) => (
              <button
                key={b.id}
                className={`genre-tile${b.locked ? " locked" : ""}`}
                onClick={() => !b.locked && onSelect(b.id)}
              >
                <div className="genre-tile-title">{b.title}</div>
                {b.sub && <div className="genre-tile-sub">{b.sub}</div>}
                {b.locked && <div className="genre-tile-badge">Coming Soon</div>}
              </button>
            ))}
          </div>
          <button
            className="genre-tile genre-full-width"
            style={{ textAlign: "center", padding: "1.4rem 1rem" }}
            onClick={() => onSelect("garden")}
          >
            <div className="genre-tile-title">A Return to The Garden</div>
            <div className="genre-tile-sub">209 Pages · A Visual Journey</div>
          </button>
        </div>
      </div>
    </ScreenLayout>
  );
}
