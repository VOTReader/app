/* ═══════════════════════════════════════════════════════════════════════
   AboutScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function AboutScreen({ onContinue, onBack, onSearch, onHistory, theme, onThemeChange }) {
  const [page, setPage] = React.useState(1);

  const handleBack     = page === 2 ? () => setPage(1) : onBack;
  const handleContinue = page === 1 ? () => setPage(2) : onContinue;

  return (
    <ScreenLayout
      navChildren={LibraryNav({
        // handleBack is page-aware: page 2 → page 1, page 1 → leave.
        onBack: handleBack, backTitle: 'Back', hide: ['settings'],
        onHistory, onSearch, theme, onThemeChange,
      })}
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
                  <p>This reader was made by a disciple for personal study; it is not the canonical source.</p>
                  <p>Your notes, journal, and highlights stay on this device — use Settings → Export to back them up.</p>
                  <p>
                    For the canonical text, audio, video, and PDFs, visit{" "}
                    <a href="https://www.thevolumesoftruth.com" target="_blank" rel="noopener noreferrer"><em>thevolumesoftruth.com</em></a>
                    .
                  </p>
                </div>
              </>
            ) : (
              <>
                <h1 className="about-heading">What You Can Do</h1>
                <div className="about-body about-features">
                  <p className="about-subhead">The Library</p>
                  <p>The complete Volumes of Truth corpus.</p>
                  <p>The entire Bible in ten translations, including two custom Restored Name editions.</p>
                  <p>Every PDF, Bible study, and letter study.</p>
                  <p className="about-subhead">Your Tools</p>
                  <p>Highlight, underline, bookmark, and note — anywhere.</p>
                  <p>A private journal with photos, voice memos, and a full feature suite — kept on your device.</p>
                  <p>Full-text search across the entire library.</p>
                  <p>Fully offline. Your data never leaves this device; nothing is downloaded except the <em>Return to the Garden</em> images.</p>
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
          {/* Wave 0: the FINAL page of first-run onboarding ends with a
              warm, action-oriented CTA ("Begin Reading") instead of the
              flat "Continue"; page 1 keeps "Continue" because it genuinely
              continues to page 2. */}
          <button
            className="about-continue"
            onClick={handleContinue}
            aria-label={page === 2 ? 'Begin Reading' : 'Continue'}
          >{page === 2 ? 'Begin Reading' : 'Continue'}</button>
        </div>
      </div>
    </ScreenLayout>
  );
}
