/* ═══════════════════════════════════════════════════════════════════════
   GardenView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export const GARDEN_PRELOAD_AHEAD = 5;
export const GARDEN_CRAWL_DELAY = 500;
const MAX_ZOOM = 5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_ZOOM = 2.5;

export function GardenView({ page, onPageChange, onBack, theme: _theme, onThemeChange: _onThemeChange, tier }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [jumpMode, setJumpMode] = React.useState(false);
  const [jumpInput, setJumpInput] = React.useState("");
  const jumpRef = React.useRef(null);
  const crawlRef = React.useRef(null);
  const pageRef = React.useRef(page);
  pageRef.current = page;

  const imgAreaRef = React.useRef(null);
  const imgElRef = React.useRef(null);
  const zoomState = React.useRef({ scale: 1, tx: 0, ty: 0 });
  const gestureState = React.useRef({
    active: false, type: null,
    startDist: 0, startScale: 1, startTx: 0, startTy: 0,
    midX: 0, midY: 0,
    panStartX: 0, panStartY: 0,
    tapStartX: 0, tapStartY: 0,
    lastTapTime: 0, lastTapX: 0, lastTapY: 0,
  });

  const applyZoom = React.useCallback(() => {
    const el = imgElRef.current;
    if (!el) return;
    const { scale, tx, ty } = zoomState.current;
    if (scale <= 1) {
      el.style.transform = '';
      el.style.willChange = '';
    } else {
      el.style.willChange = 'transform';
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
  }, []);

  const clampZoom = React.useCallback(() => {
    const z = zoomState.current;
    const container = imgAreaRef.current;
    const img = imgElRef.current;
    if (!container || !img || z.scale <= 1) { z.tx = 0; z.ty = 0; return; }
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const ew = img.clientWidth;
    const eh = img.clientHeight;
    if (!ew || !eh) return;
    const maxTx = Math.max(0, (ew * z.scale - cw) / 2);
    const maxTy = Math.max(0, (eh * z.scale - ch) / 2);
    z.tx = Math.max(-maxTx, Math.min(maxTx, z.tx));
    z.ty = Math.max(-maxTy, Math.min(maxTy, z.ty));
  }, []);

  // Enter immersive mode on mount, exit on unmount
  React.useEffect(() => {
    PlatformBridge.setImmersiveMode(true);
    return () => { PlatformBridge.setImmersiveMode(false); };
  }, []);

  // Reset error + zoom on page/tier change
  React.useEffect(() => {
    setError(false);
    setLoading(!gardenIsCached(page, tier));
    const z = zoomState.current;
    z.scale = 1; z.tx = 0; z.ty = 0;
    gestureState.current.active = false;
    gestureState.current.type = null;
    applyZoom();
  }, [page, tier, applyZoom]);

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

  // Pinch-zoom, pan, double-tap, and wheel zoom — all via CSS transform.
  // Replaces the old WebView zoom (setZoomEnabled/resetZoom bridge calls)
  // which couldn't reliably reset scale on page navigation.
  React.useEffect(() => {
    const area = imgAreaRef.current;
    if (!area) return;

    const onTouchStart = (e) => {
      const g = gestureState.current;
      if (e.touches.length === 2) {
        e.preventDefault();
        const [a, b] = e.touches;
        g.active = true;
        g.type = 'pinch';
        g.startDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        g.startScale = zoomState.current.scale;
        g.startTx = zoomState.current.tx;
        g.startTy = zoomState.current.ty;
        const rect = area.getBoundingClientRect();
        g.midX = (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2;
        g.midY = (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2;
      } else if (e.touches.length === 1) {
        g.tapStartX = e.touches[0].clientX;
        g.tapStartY = e.touches[0].clientY;
        if (zoomState.current.scale > 1) {
          e.preventDefault();
          g.active = true;
          g.type = 'pan';
          g.panStartX = e.touches[0].clientX;
          g.panStartY = e.touches[0].clientY;
          g.startTx = zoomState.current.tx;
          g.startTy = zoomState.current.ty;
        }
      }
    };

    const onTouchMove = (e) => {
      const g = gestureState.current;
      if (!g.active) return;
      const z = zoomState.current;
      if (g.type === 'pinch' && e.touches.length >= 2) {
        e.preventDefault();
        const [a, b] = e.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const rect = area.getBoundingClientRect();
        const midX = (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2;
        const midY = (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2;
        const newScale = Math.max(1, Math.min(MAX_ZOOM, g.startScale * (dist / g.startDist)));
        z.tx = midX - (g.midX - g.startTx) * (newScale / g.startScale);
        z.ty = midY - (g.midY - g.startTy) * (newScale / g.startScale);
        z.scale = newScale;
        clampZoom();
        applyZoom();
      } else if (g.type === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        z.tx = g.startTx + (e.touches[0].clientX - g.panStartX);
        z.ty = g.startTy + (e.touches[0].clientY - g.panStartY);
        clampZoom();
        applyZoom();
      }
    };

    const onTouchEnd = (e) => {
      const g = gestureState.current;
      const z = zoomState.current;

      if (g.type === 'pinch' && z.scale < 1.05) {
        z.scale = 1; z.tx = 0; z.ty = 0;
        applyZoom();
      }

      if (e.touches.length === 0) {
        g.active = false;
        g.type = null;

        if (e.changedTouches.length === 1) {
          const t = e.changedTouches[0];
          const moved = Math.hypot(t.clientX - g.tapStartX, t.clientY - g.tapStartY) > 10;
          if (!moved) {
            const now = Date.now();
            if (now - g.lastTapTime < DOUBLE_TAP_MS && Math.hypot(t.clientX - g.lastTapX, t.clientY - g.lastTapY) < 30) {
              if (z.scale > 1) {
                z.scale = 1; z.tx = 0; z.ty = 0;
              } else {
                const rect = area.getBoundingClientRect();
                const pcx = t.clientX - rect.left - rect.width / 2;
                const pcy = t.clientY - rect.top - rect.height / 2;
                z.scale = DOUBLE_TAP_ZOOM;
                z.tx = pcx * (1 - DOUBLE_TAP_ZOOM);
                z.ty = pcy * (1 - DOUBLE_TAP_ZOOM);
                clampZoom();
              }
              applyZoom();
              g.lastTapTime = 0;
            } else {
              g.lastTapTime = now;
              g.lastTapX = t.clientX;
              g.lastTapY = t.clientY;
            }
          } else {
            g.lastTapTime = 0;
          }
        }
      } else if (e.touches.length === 1 && z.scale > 1) {
        g.type = 'pan';
        g.panStartX = e.touches[0].clientX;
        g.panStartY = e.touches[0].clientY;
        g.startTx = z.tx;
        g.startTy = z.ty;
      }
    };

    const onWheel = (e) => {
      e.preventDefault();
      const z = zoomState.current;
      const rect = area.getBoundingClientRect();
      const pcx = e.clientX - rect.left - rect.width / 2;
      const pcy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = Math.max(1, Math.min(MAX_ZOOM, z.scale * factor));
      if (newScale !== z.scale) {
        z.tx = pcx - (pcx - z.tx) * (newScale / z.scale);
        z.ty = pcy - (pcy - z.ty) * (newScale / z.scale);
        z.scale = newScale;
      }
      if (z.scale < 1.02) { z.scale = 1; z.tx = 0; z.ty = 0; }
      clampZoom();
      applyZoom();
    };

    area.addEventListener('touchstart', onTouchStart, { passive: false });
    area.addEventListener('touchmove', onTouchMove, { passive: false });
    area.addEventListener('touchend', onTouchEnd);
    area.addEventListener('touchcancel', onTouchEnd);
    area.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      area.removeEventListener('touchstart', onTouchStart);
      area.removeEventListener('touchmove', onTouchMove);
      area.removeEventListener('touchend', onTouchEnd);
      area.removeEventListener('touchcancel', onTouchEnd);
      area.removeEventListener('wheel', onWheel);
    };
  }, [applyZoom, clampZoom]);

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

      <div className="garden-image-area" ref={imgAreaRef}>
        {loading && (
          <div className="garden-loading">
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" }}>
              {error ? "Failed to load — check your connection" : `Loading page ${page}...`}
            </div>
          </div>
        )}
        <img
          ref={imgElRef}
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
