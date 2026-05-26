/* ═══════════════════════════════════════════════════════════════════════
   VolumesHome — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function VolumesHome({ onSelect, onBack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  // Q8.3: VOT corpus is lazy. Subscribe + pre-fire on mount so the
  // letter-count details fill in once bundle-a-vot.js loads. Use
  // colLetterArr (lazy-safe) for all collections — returns [] when
  // the corresponding global isn't defined yet.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') {
      window.__loadVotCorpus().catch((e) => console.warn('VOT corpus pre-load failed', e));
    }
  }, []);
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.getVersion() : 0
  );
  const _votReady = (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.loaded : false;
  const _cnt = (k) => colLetterArr(COL_BY_KEY.get(k)).length;
  // Q8.3: while corpus is still loading, NO tile is locked (we know they all
  // exist — clicking lands on a "Loading…" route until data arrives).
  // Once loaded, `locked` reflects actual content state (a collection with 0
  // letters is "Coming Soon").
  const _locked = (k) => _votReady && _cnt(k) === 0;
  const collections = [
  { id: "lords-rebuke", title: "The Lord's Rebuke", sub: "Correction & Warning", locked: _locked('rebuke') },
  { id: "words-to-live-by-1", title: "Words To Live By: Part One", sub: _cnt('wtlb1') > 0 ? `${_cnt('wtlb1')} Entries · Words of Wisdom` : "Words of Wisdom", locked: _locked('wtlb1') },
  { id: "words-to-live-by-2", title: "Words To Live By: Part Two", sub: _cnt('wtlb2') > 0 ? `${_cnt('wtlb2')} Entries · More Words of Wisdom` : "More Words of Wisdom", locked: _locked('wtlb2') },
  { id: "the-blessed", title: "The Blessed", sub: _cnt('blessed') > 0 ? `${_cnt('blessed')} Entries · Blessings & Promises` : "Blessings & Promises", locked: _locked('blessed') },
  { id: "little-flock", title: "Letters to The Little Flock", sub: _cnt('flock') > 0 ? `${_cnt('flock')} Letters` : "Personal Instruction", locked: _locked('flock') },
  { id: "letters-timothy", title: "Letters from Timothy", sub: _cnt('timothy') > 0 ? `${_cnt('timothy')} Letters` : "A Servant's Pen", locked: _locked('timothy') },
  { id: "holy-days", title: "Regarding The Holy Days", sub: _cnt('holydays') > 0 ? `${_cnt('holydays')} Letters · Appointed Times` : "Appointed Times", locked: _locked('holydays') }];

  const volumes = [
  { id: "volume-one", title: "Volume One", detail: _cnt('one') > 0 ? `${_cnt('one')} Letters` : null, sub: "2004 – 2006", locked: _locked('one') },
  { id: "volume-two", title: "Volume Two", detail: _cnt('two') > 0 ? `${_cnt('two')} Letters` : null, sub: "2004 – 2010", locked: _locked('two') },
  { id: "volume-three", title: "Volume Three", detail: _cnt('three') > 0 ? `${_cnt('three')} Letters` : null, sub: "2006 – 2010", locked: _locked('three') },
  { id: "volume-four", title: "Volume Four", detail: _cnt('four') > 0 ? `${_cnt('four')} Letters` : null, sub: "2010 – 2011", locked: _locked('four') },
  { id: "volume-five", title: "Volume Five", detail: _cnt('five') > 0 ? `${_cnt('five')} Letters` : null, sub: "2011 – 2014", locked: _locked('five') },
  { id: "volume-six", title: "Volume Six", detail: _cnt('six') > 0 ? `${_cnt('six')} Letters` : null, sub: "2011 – 2014", locked: _locked('six') },
  { id: "volume-seven", title: "Volume Seven", detail: _cnt('seven') > 0 ? `${_cnt('seven')} Letters` : null, sub: "2005 – 2014", locked: _locked('seven') }];

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
