/* ═══════════════════════════════════════════════════════════════════════
   AboutScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function AboutScreen({ onContinue, onBack, onSearch, onHistory, theme, onThemeChange }) {
  const [page, setPage] = React.useState(1);

  const handleBack     = page === 2 ? () => setPage(1) : onBack;
  const handleContinue = page === 1 ? () => setPage(2) : onContinue;

  return (
    <ScreenLayout
      navChildren={
        <>
          <button className="nav-home nav-back-icon" onClick={handleBack} title="Back" aria-label="Back">‹</button>
          <HomeBtn />
          <button className="nav-search-btn" onClick={onHistory} title="History">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-5.01" />
            </svg>
          </button>
          <button className="nav-search-btn" onClick={onSearch} title="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <ThemeBtn theme={theme} onThemeChange={onThemeChange} />
        </>
      }
    >
      <div className="about-screen">
        <div className="about-card">
          <div className="about-diamonds" aria-hidden="true">
            <span className="about-diamond" />
            <span className="about-diamond" />
            <span className="about-diamond" />
          </div>
          <div key={page} className="about-page-in">
            {page === 1 ? (
              <>
                <h1 className="about-heading">About VOTReader</h1>
                <div className="about-body">
                  <p>The Volumes of Truth are the Word of The Lord, given through His servant Timothy.</p>
                  <p>This reader was made by a disciple for personal study and reflection. It is not the canonical source.</p>
                  <p>Your notes, journal, and highlights stay on this device. Use Settings → Export to save them to a file you control.</p>
                  <p>
                    For the canonical text, audio, video, and PDF files, visit{" "}
                    <a href="https://www.thevolumesoftruth.com" target="_blank" rel="noopener noreferrer"><em>thevolumesoftruth.com</em></a>
                    .
                  </p>
                </div>
              </>
            ) : (
              <>
                <h1 className="about-heading">What You Can Do</h1>
                <div className="about-body about-features">
                  <p><strong>Complete library.</strong> All 7 Volumes, Letters to the Flock, Letters from Timothy, WTLB, The Blessed, Holy Days, and the Bible in multiple translations.</p>
                  <p><strong>Matthew Study Bible.</strong> The full Gospel with inline study notes, a dedicated study mode, and linked Bible study chapters.</p>
                  <p><strong>Highlights and notes.</strong> Mark any passage in your choice of colors, underline it, or write a personal note. Annotations appear everywhere that passage is referenced.</p>
                  <p><strong>Personal journal.</strong> Write entries with photos and voice memos. Stored privately on this device.</p>
                  <p><strong>Full-text search.</strong> Search across all letters, scriptures, and the Bible — with synonym expansion to surface related passages.</p>
                  <p><strong>Fully offline.</strong> Works without an internet connection after the first load. Your data never leaves this device.</p>
                </div>
              </>
            )}
          </div>
          <div className="about-page-dots" aria-label={`Page ${page} of 2`}>
            <span className={`about-page-dot${page === 1 ? ' active' : ''}`} />
            <span className={`about-page-dot${page === 2 ? ' active' : ''}`} />
          </div>
          <div className="about-diamonds" aria-hidden="true">
            <span className="about-diamond" />
            <span className="about-diamond" />
            <span className="about-diamond" />
          </div>
          <button className="about-continue" onClick={handleContinue} aria-label="Continue">Continue</button>
        </div>
      </div>
    </ScreenLayout>
  );
}
