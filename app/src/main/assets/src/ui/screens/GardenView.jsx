/* ═══════════════════════════════════════════════════════════════════════
   GardenView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export const GARDEN_PRELOAD_AHEAD = 5;
export const GARDEN_CRAWL_DELAY = 500; // ms between background crawl downloads

export function GardenView({ page, onPageChange, onBack, theme: _theme, onThemeChange: _onThemeChange, tier }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [jumpMode, setJumpMode] = React.useState(false);
  const [jumpInput, setJumpInput] = React.useState("");
  const jumpRef = React.useRef(null);
  const crawlRef = React.useRef(null);
  const pageRef = React.useRef(page);
  pageRef.current = page;

  // Enter immersive mode on mount, exit on unmount. W1.2 Tier B.3:
  // bridge owns the platform branch — Android hides system bars natively;
  // web tries Fullscreen API (best-effort; user-gesture chain has expired
  // by the time this effect fires, so the request is typically blocked
  // and silently logged).
  React.useEffect(() => {
    PlatformBridge.setImmersiveMode(true);
    return () => { PlatformBridge.setImmersiveMode(false); };
  }, []);

  // Reset error + zoom on page/tier change. W1.2 Tier B.3: resetZoom is a
  // no-op on web (browsers don't expose an API to reset user pinch-zoom).
  React.useEffect(() => {
    setError(false);
    setLoading(!gardenIsCached(page, tier));
    PlatformBridge.resetZoom();
  }, [page, tier]);

  // Priority preload: current page + 5 ahead (immediate, no throttle)
  React.useEffect(() => {
    gardenPreload(page, tier);
    for (let i = page + 1; i <= Math.min(page + GARDEN_PRELOAD_AHEAD, GARDEN_TOTAL); i++) {
      gardenPreload(i, tier);
    }
  }, [page, tier]);

  // Background sequential crawl: fills in all pages from 1 forward, throttled.
  // Restarts when tier changes (because all existing cached pages are for a
  // different tier now).
  React.useEffect(() => {
    let cancelled = false;
    let crawlPage = 1;

    const crawlNext = () => {
      if (cancelled) return;
      // Skip already-cached pages (for the CURRENT tier)
      while (crawlPage <= GARDEN_TOTAL && gardenImageCache[gardenCacheKey(crawlPage, tier)]) crawlPage++;
      if (crawlPage > GARDEN_TOTAL) return;

      const cur = pageRef.current;
      if (crawlPage >= cur && crawlPage <= cur + GARDEN_PRELOAD_AHEAD) {
        crawlPage++;
      }

      if (crawlPage <= GARDEN_TOTAL && !gardenImageCache[gardenCacheKey(crawlPage, tier)]) {
        gardenPreload(crawlPage, tier);
        crawlPage++;
      }

      crawlRef.current = setTimeout(crawlNext, GARDEN_CRAWL_DELAY);
    };

    crawlRef.current = setTimeout(crawlNext, 1500);

    return () => {
      cancelled = true;
      if (crawlRef.current) clearTimeout(crawlRef.current);
    };
  }, [tier]);

  // Focus jump input when it opens
  React.useEffect(() => {
    if (jumpMode && jumpRef.current) jumpRef.current.focus();
  }, [jumpMode]);

  const goNext = () => {if (page < GARDEN_TOTAL) onPageChange(page + 1);};
  const goPrev = () => {if (page > 1) onPageChange(page - 1);};

  const handleJump = () => {
    const n = parseInt(jumpInput, 10);
    if (n >= 1 && n <= GARDEN_TOTAL) onPageChange(n);
    setJumpMode(false);
    setJumpInput("");
  };

  // Enable native pinch-zoom while Garden is open. W1.2 Tier B.3: Android
  // overrides WebView's default-disabled zoom; web is a no-op since
  // browsers default to zoom-enabled and CSS touch-action hacks would
  // actively break the natural pinch (per [[verify-inertness-not-equivalence]]).
  React.useEffect(() => {
    PlatformBridge.setZoomEnabled(true);
    return () => { PlatformBridge.setZoomEnabled(false); };
  }, []);

  return (
    <div className="garden-fullscreen">
      <div className="garden-top-bar">
        <button className="garden-back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {jumpMode ? (
          <form className="garden-jump-form" onSubmit={(e) => {e.preventDefault();handleJump();}}>
            <input
              ref={jumpRef}
              type="number"
              min="1"
              max={GARDEN_TOTAL}
              className="garden-jump-input"
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              onBlur={() => {setJumpMode(false);setJumpInput("");}}
              placeholder={`1–${GARDEN_TOTAL}`}
            />
            <span className="garden-jump-hint">/ {GARDEN_TOTAL}</span>
          </form>
        ) : (
          <button className="garden-page-counter" onClick={() => setJumpMode(true)}>
            {page} / {GARDEN_TOTAL}
          </button>
        )}
      </div>

      <div className="garden-image-area">
        {loading && (
          <div className="garden-loading">
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" }}>
              {error ? "Failed to load — check your connection" : `Loading page ${page}...`}
            </div>
          </div>
        )}
        <img
          key={`${tier}-${page}`}
          src={gardenUrl(page, tier)}
          alt={`Garden page ${page}`}
          className="garden-page-img"
          style={{ opacity: loading ? 0 : 1, transition: "opacity 0.3s" }}
          onLoad={() => setLoading(false)}
          onError={() => {setLoading(true);setError(true);}}
        />
      </div>

      <div className="garden-bottom-bar">
        <button className="garden-arrow-btn" onClick={goPrev} disabled={page <= 1}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button className="garden-arrow-btn" onClick={goNext} disabled={page >= GARDEN_TOTAL}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
