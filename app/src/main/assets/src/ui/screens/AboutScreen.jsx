/* ═══════════════════════════════════════════════════════════════════════
   AboutScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function AboutScreen({ onContinue, onBack, onSearch, onHistory, theme, onThemeChange }) {
  return (
    <ScreenLayout
      navChildren={
        <>
          <button className="nav-home nav-back-icon" onClick={onBack} title="Back" aria-label="Back">‹</button>
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
          <div className="about-diamonds" aria-hidden="true">
            <span className="about-diamond" />
            <span className="about-diamond" />
            <span className="about-diamond" />
          </div>
          <button className="about-continue" onClick={onContinue} aria-label="Continue">Continue</button>
        </div>
      </div>
    </ScreenLayout>
  );
}
