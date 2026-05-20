/* ═══════════════════════════════════════════════════════════════════════
   GardenView — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function GardenView({ page, onPageChange, onBack, theme, onThemeChange, tier }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [jumpMode, setJumpMode] = React.useState(false);
  const [jumpInput, setJumpInput] = React.useState("");
  const jumpRef = React.useRef(null);
  const crawlRef = React.useRef(null);
  const pageRef = React.useRef(page);
  pageRef.current = page;

  // Enter immersive mode on mount, exit on unmount
  React.useEffect(() => {
    if (window.AndroidBridge?.setImmersiveMode) window.AndroidBridge.setImmersiveMode(true);
    return () => {if (window.AndroidBridge?.setImmersiveMode) window.AndroidBridge.setImmersiveMode(false);};
  }, []);

  // Reset error + native zoom on page change or tier change.
  React.useEffect(() => {
    setError(false);
    setLoading(!gardenIsCached(page, tier));
    if (window.AndroidBridge?.resetZoom) window.AndroidBridge.resetZoom();
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

  // Enable native Android zoom while Garden is open
  React.useEffect(() => {
    if (window.AndroidBridge?.setZoomEnabled) window.AndroidBridge.setZoomEnabled(true);
    return () => {if (window.AndroidBridge?.setZoomEnabled) window.AndroidBridge.setZoomEnabled(false);};
  }, []);

  return (/*#__PURE__*/
    React.createElement("div", { className: "garden-fullscreen" }, /*#__PURE__*/

    React.createElement("div", { className: "garden-top-bar" }, /*#__PURE__*/
    React.createElement("button", { className: "garden-back-btn", onClick: onBack }, /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /*#__PURE__*/React.createElement("polyline", { points: "15 18 9 12 15 6" }))
    ),
    jumpMode ? /*#__PURE__*/
    React.createElement("form", { className: "garden-jump-form", onSubmit: (e) => {e.preventDefault();handleJump();} }, /*#__PURE__*/
    React.createElement("input", { ref: jumpRef, type: "number", min: "1", max: GARDEN_TOTAL,
      className: "garden-jump-input",
      value: jumpInput,
      onChange: (e) => setJumpInput(e.target.value),
      onBlur: () => {setJumpMode(false);setJumpInput("");},
      placeholder: `1–${GARDEN_TOTAL}` }), /*#__PURE__*/
    React.createElement("span", { className: "garden-jump-hint" }, "/ ", GARDEN_TOTAL)
    ) : /*#__PURE__*/

    React.createElement("button", { className: "garden-page-counter", onClick: () => setJumpMode(true) },
    page, " / ", GARDEN_TOTAL
    )

    ), /*#__PURE__*/


    React.createElement("div", { className: "garden-image-area" },
    loading && /*#__PURE__*/
    React.createElement("div", { className: "garden-loading" }, /*#__PURE__*/
    React.createElement("div", { style: { color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" } }, error ? "Failed to load — check your connection" : `Loading page ${page}...`)
    ), /*#__PURE__*/

    React.createElement("img", {
      key: `${tier}-${page}`,
      src: gardenUrl(page, tier),
      alt: `Garden page ${page}`,
      className: "garden-page-img",
      style: { opacity: loading ? 0 : 1, transition: "opacity 0.3s" },
      onLoad: () => setLoading(false),
      onError: () => {setLoading(true);setError(true);} }
    )
    ), /*#__PURE__*/


    React.createElement("div", { className: "garden-bottom-bar" }, /*#__PURE__*/
    React.createElement("button", { className: "garden-arrow-btn", onClick: goPrev, disabled: page <= 1 }, /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /*#__PURE__*/React.createElement("polyline", { points: "15 18 9 12 15 6" }))
    ), /*#__PURE__*/
    React.createElement("button", { className: "garden-arrow-btn", onClick: goNext, disabled: page >= GARDEN_TOTAL }, /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /*#__PURE__*/React.createElement("polyline", { points: "9 6 15 12 9 18" }))
    )
    )
    ));

}
