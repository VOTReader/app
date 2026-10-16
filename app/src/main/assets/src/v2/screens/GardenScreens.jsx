/* GardenScreens - Return to the Garden in v2 (zones v2p7 to design's dz14: 9d the first-visit notice, 9e a page).

   The notice is main's garden warning (AppShellOverlays) as a kit sheet over Home: what the Garden downloads, main's four
   image qualities (a pick is main's setting gardenTier), Go back, and Open the Garden (main's Proceed: it sets
   vot-garden-warning-acked, so Home's row opens the Garden straight away from then on).

   The page is main's GardenView in the kit's full-screen look: the photograph whole on black, Back, the page number
   (tap it to type a page, as main) and the arrows; swipe, pinch, double-tap and wheel zoom with main's numbers; main's
   preload, background crawl and remembered page (GardenPosStore); Android goes immersive while it is open. The laptop
   also turns pages with the arrow keys. Main's helpers are bundle-d / bundle-b globals (garden-facts.js). A gate boot
   draws the page it is given and fetches, crawls and remembers nothing. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { Sheet } from '../Sheet.jsx';
import { gardenTiers } from '../downloads-facts.js';
import { writeSetting } from '../settings-pages.js';
import {
  swipeDir, gardenTotal, defaultTier, savedTier, tierOf, noticeLede, markNoticeSeen, rememberedPage, rememberPage, clampPage,
  pageUrl,
} from '../garden-facts.js';

const g = /** @type {any} */ (globalThis);

/** Main's GardenView numbers. */
const MAX_ZOOM = 5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_ZOOM = 2.5;
const CRAWL_START_MS = 1500;
const CRAWL_MS = 500;

/**
 * The first-visit notice (9d). `tier` is the tier picked so far; a gate boot keeps a pick on screen and writes nothing.
 * @param {{ tier: string, gate: any, device: 'phone' | 'computer', desktop: boolean, onOpen: () => void, onClose: () => void }} props
 */
export function GardenNotice({ tier: first, gate, device, desktop, onOpen, onClose }) {
  const [tier, setTier] = React.useState(first);
  const picked = tierOf(tier);
  const pick = (id) => {
    setTier(id);
    if (!gate) writeSetting('gardenTier', id);
  };
  const open = () => {
    if (!gate) markNoticeSeen();
    onOpen();
  };
  return (
    <Sheet kind="gdn" label="Before you begin" onClose={onClose} desktop={desktop}>
      <span className="overline">A Return to The Garden</span>
      <div className="sh">Before you begin</div>
      <p className="gdn-p">{noticeLede(picked, device)}</p>
      <div className="gdn-l"><span className="label">Image quality</span><span className="gdn-h">You can change this anytime in Settings.</span></div>
      <div className="opts">
        {gardenTiers().map((t) => {
          const on = !!picked && t.id === picked.id;
          return (
            <button key={t.id} type="button" className={'srow opt gt' + (on ? ' on' : '')} aria-pressed={on} onClick={() => pick(t.id)}>
              <span className="tx">
                <span className="t">{t.label}<span className="sz num">{t.size}</span></span>
                <span className="s">{t.res} · {t.desc}</span>
              </span>
              {on && <span className="ck"><Icon name="check" /></span>}
            </button>
          );
        })}
      </div>
      <div className="gdn-a">
        <button type="button" className="btn2" onClick={onClose}>Go back</button>
        <button type="button" className="pill" onClick={open}>Open the Garden</button>
      </div>
    </Sheet>
  );
}

/** The tier the notice starts on: the gate's, else the reader's. @param {any} gate */
export function noticeTier(gate) {
  return gate ? (gate.facts && gate.facts.gardenTier) || defaultTier() : savedTier();
}

/** Turns Android's immersive mode on while the page is open (main's GardenView); the web's would need a tap, so a gate
 *  boot there leaves it. @param {boolean} gated */
function useImmersive(gated) {
  React.useEffect(() => {
    const b = g.PlatformBridge;
    if (!b || typeof b.setImmersiveMode !== 'function' || (gated && !b.isAndroid)) return undefined;
    try { b.setImmersiveMode(true); } catch (_e) { /* best effort, as main */ }
    return () => { try { b.setImmersiveMode(false); } catch (_e) { /* best effort */ } };
  }, [gated]);
}

/**
 * Main's preload (the page and a per-tier look-ahead) and its throttled background crawl from page 1, skipped on
 * Save-Data or 2g. Not on a gate boot. @param {number} page @param {string} tier @param {boolean} on
 */
function usePreload(page, tier, on) {
  const pageRef = React.useRef(page);
  pageRef.current = page;
  React.useEffect(() => {
    if (!on || typeof g.gardenPreload !== 'function') return;
    const total = gardenTotal();
    const ahead = typeof g.gardenTierLimits === 'function' ? g.gardenTierLimits(tier).ahead : 5;
    g.gardenPreload(page, tier);
    for (let i = page + 1; i <= Math.min(page + ahead, total); i++) g.gardenPreload(i, tier);
  }, [page, tier, on]);
  React.useEffect(() => {
    if (!on || typeof g.gardenPreload !== 'function' || !g.gardenCrawled || typeof g.gardenCacheKey !== 'function') return undefined;
    const conn = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator).connection : null;
    if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return undefined;
    const total = gardenTotal();
    const ahead = typeof g.gardenTierLimits === 'function' ? g.gardenTierLimits(tier).ahead : 5;
    const done = (n) => g.gardenCrawled.has(g.gardenCacheKey(n, tier));
    let cancelled = false;
    let at = 1;
    /** @type {any} */
    let timer = null;
    const next = () => {
      if (cancelled) return;
      while (at <= total && done(at)) at++;
      if (at > total) return;
      const cur = pageRef.current;
      if (at >= cur && at <= cur + ahead) at++;
      if (at <= total && !done(at)) {
        g.gardenPreload(at, tier);
        at++;
      }
      timer = setTimeout(next, CRAWL_MS);
    };
    timer = setTimeout(next, CRAWL_START_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tier, on]);
}

/**
 * Main's pinch, pan, double-tap and wheel zoom on `areaRef` (a CSS transform on the image), and its sideways swipe at
 * scale 1, which calls `turn(+1 | -1)`. The image keeps its centring translate in front of the zoom.
 * @param {{ current: HTMLElement | null }} areaRef @param {{ current: HTMLElement | null }} imgRef
 * @param {(dir: number) => void} turn
 */
function useZoom(areaRef, imgRef, turn) {
  const zoom = React.useRef({ scale: 1, tx: 0, ty: 0 });
  const turnRef = React.useRef(turn);
  turnRef.current = turn;
  const apply = React.useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const { scale, tx, ty } = zoom.current;
    if (scale <= 1) {
      el.style.transform = '';
      el.style.willChange = '';
    } else {
      el.style.willChange = 'transform';
      el.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`;
    }
  }, [imgRef]);
  const clamp = React.useCallback(() => {
    const z = zoom.current;
    const area = areaRef.current;
    const img = imgRef.current;
    if (!area || !img || z.scale <= 1) { z.tx = 0; z.ty = 0; return; }
    const ew = img.clientWidth;
    const eh = img.clientHeight;
    if (!ew || !eh) return;
    const maxTx = Math.max(0, (ew * z.scale - area.clientWidth) / 2);
    const maxTy = Math.max(0, (eh * z.scale - area.clientHeight) / 2);
    z.tx = Math.max(-maxTx, Math.min(maxTx, z.tx));
    z.ty = Math.max(-maxTy, Math.min(maxTy, z.ty));
  }, [areaRef, imgRef]);
  const reset = React.useCallback(() => {
    zoom.current = { scale: 1, tx: 0, ty: 0 };
    apply();
  }, [apply]);

  React.useEffect(() => {
    const area = areaRef.current;
    if (!area) return undefined;
    // main's gesture record; wasMultiTouch latches from a second finger until the last one lifts, so a pinch whose
    // fingers lift one at a time is never read as a swipe (main's gap-garden-viewer-and-image-cache-5)
    const s = {
      active: false, type: /** @type {null | 'pinch' | 'pan'} */ (null), wasMultiTouch: false,
      startDist: 0, startScale: 1, startTx: 0, startTy: 0, midX: 0, midY: 0, panStartX: 0, panStartY: 0,
      tapStartX: 0, tapStartY: 0, lastTapTime: 0, lastTapX: 0, lastTapY: 0,
    };
    const centreOf = (x, y) => {
      const r = area.getBoundingClientRect();
      return [x - r.left - r.width / 2, y - r.top - r.height / 2];
    };
    const onStart = (e) => {
      const z = zoom.current;
      if (e.touches.length >= 2) s.wasMultiTouch = true;
      if (e.touches.length === 2) {
        e.preventDefault();
        const [a, b] = e.touches;
        s.active = true;
        s.type = 'pinch';
        s.startDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        s.startScale = z.scale;
        s.startTx = z.tx;
        s.startTy = z.ty;
        [s.midX, s.midY] = centreOf((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      } else if (e.touches.length === 1) {
        s.tapStartX = e.touches[0].clientX;
        s.tapStartY = e.touches[0].clientY;
        if (z.scale > 1) {
          e.preventDefault();
          s.active = true;
          s.type = 'pan';
          s.panStartX = e.touches[0].clientX;
          s.panStartY = e.touches[0].clientY;
          s.startTx = z.tx;
          s.startTy = z.ty;
        }
      }
    };
    const onMove = (e) => {
      if (!s.active) return;
      const z = zoom.current;
      if (s.type === 'pinch' && e.touches.length >= 2) {
        e.preventDefault();
        const [a, b] = e.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const [midX, midY] = centreOf((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        const scale = Math.max(1, Math.min(MAX_ZOOM, s.startScale * (dist / s.startDist)));
        z.tx = midX - (s.midX - s.startTx) * (scale / s.startScale);
        z.ty = midY - (s.midY - s.startTy) * (scale / s.startScale);
        z.scale = scale;
        clamp();
        apply();
      } else if (s.type === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        z.tx = s.startTx + (e.touches[0].clientX - s.panStartX);
        z.ty = s.startTy + (e.touches[0].clientY - s.panStartY);
        clamp();
        apply();
      }
    };
    const onEnd = (e) => {
      const z = zoom.current;
      if (s.type === 'pinch' && z.scale < 1.05) {
        z.scale = 1; z.tx = 0; z.ty = 0;
        apply();
      }
      if (e.touches.length === 0) {
        const wasMultiTouch = s.wasMultiTouch;
        s.active = false;
        s.type = null;
        s.wasMultiTouch = false;
        if (e.changedTouches.length !== 1) return;
        const t = e.changedTouches[0];
        const moved = Math.hypot(t.clientX - s.tapStartX, t.clientY - s.tapStartY) > 10;
        if (!moved) {
          const now = Date.now();
          if (now - s.lastTapTime < DOUBLE_TAP_MS && Math.hypot(t.clientX - s.lastTapX, t.clientY - s.lastTapY) < 30) {
            if (z.scale > 1) {
              z.scale = 1; z.tx = 0; z.ty = 0;
            } else {
              const [px, py] = centreOf(t.clientX, t.clientY);
              z.scale = DOUBLE_TAP_ZOOM;
              z.tx = px * (1 - DOUBLE_TAP_ZOOM);
              z.ty = py * (1 - DOUBLE_TAP_ZOOM);
              clamp();
            }
            apply();
            s.lastTapTime = 0;
          } else {
            s.lastTapTime = now;
            s.lastTapX = t.clientX;
            s.lastTapY = t.clientY;
          }
        } else {
          s.lastTapTime = 0;
          if (!wasMultiTouch && z.scale === 1) {
            const dir = swipeDir(t.clientX - s.tapStartX, t.clientY - s.tapStartY);
            if (dir) turnRef.current(dir);
          }
        }
      } else if (e.touches.length === 1) {
        // a pinch down to one finger: measure that finger's own travel from here, and pan with it when zoomed
        s.tapStartX = e.touches[0].clientX;
        s.tapStartY = e.touches[0].clientY;
        if (z.scale > 1) {
          s.type = 'pan';
          s.panStartX = e.touches[0].clientX;
          s.panStartY = e.touches[0].clientY;
          s.startTx = z.tx;
          s.startTy = z.ty;
        }
      }
    };
    // a cancelled gesture only resets: it is never a tap, swipe or pinch
    const onCancel = () => { s.active = false; s.type = null; s.wasMultiTouch = false; };
    const onWheel = (e) => {
      e.preventDefault();
      const z = zoom.current;
      const [px, py] = centreOf(e.clientX, e.clientY);
      const scale = Math.max(1, Math.min(MAX_ZOOM, z.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      if (scale !== z.scale) {
        z.tx = px - (px - z.tx) * (scale / z.scale);
        z.ty = py - (py - z.ty) * (scale / z.scale);
        z.scale = scale;
      }
      if (z.scale < 1.02) { z.scale = 1; z.tx = 0; z.ty = 0; }
      clamp();
      apply();
    };
    area.addEventListener('touchstart', onStart, { passive: false });
    area.addEventListener('touchmove', onMove, { passive: false });
    area.addEventListener('touchend', onEnd);
    area.addEventListener('touchcancel', onCancel);
    area.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      area.removeEventListener('touchstart', onStart);
      area.removeEventListener('touchmove', onMove);
      area.removeEventListener('touchend', onEnd);
      area.removeEventListener('touchcancel', onCancel);
      area.removeEventListener('wheel', onWheel);
    };
  }, [areaRef, apply, clamp]);
  return reset;
}

/**
 * A Garden page (9e): { place: 'garden', page? }. With no page it opens where the reader left off (main's GardenPosStore).
 * @param {import('../places.js').PlaceProps} props
 */
export function GardenScreen({ route, gate, facts, pop, onReady }) {
  const gated = !!gate;
  const total = gardenTotal();
  const [tier] = React.useState(() => (gated ? (facts && facts.gardenTier) || defaultTier() : savedTier()));
  const [page, setPage] = React.useState(() => clampPage(route.page || (!gated && rememberedPage()) || 1));
  const pageRef = React.useRef(page);
  pageRef.current = page;
  const cached = (n) => !gated && typeof g.gardenIsCached === 'function' && g.gardenIsCached(n, tier);
  const [loading, setLoading] = React.useState(() => !cached(page));
  const [error, setError] = React.useState(false);
  // a retry remounts the img (its key), so the browser asks again for the same address
  const [retry, setRetry] = React.useState(0);
  const [jumping, setJumping] = React.useState(false);
  const [typed, setTyped] = React.useState('');
  const areaRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const imgRef = React.useRef(/** @type {HTMLImageElement | null} */ (null));
  const jumpRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));

  /** Goes to page n (in range); remembered as main does, on every real change. */
  const goTo = React.useCallback((n) => {
    if (!Number.isInteger(n) || n < 1 || n > total || n === pageRef.current) return;
    setPage(n);
    if (!gated) rememberPage(n);
  }, [total, gated]);
  const turn = React.useCallback((dir) => goTo(pageRef.current + dir), [goTo]);
  const resetZoom = useZoom(areaRef, imgRef, turn);

  useImmersive(gated);
  usePreload(page, tier, !gated);

  // main's heal: a Garden opened on page 1 before the remembered page has loaded goes there once it has
  React.useEffect(() => {
    const store = g.GardenPosStore;
    if (gated || route.page || !store || typeof store.subscribe !== 'function') return undefined;
    let unsub = null;
    const heal = () => {
      if (typeof store.getState === 'function' && store.getState() !== 'loaded') return false;
      const n = rememberedPage();
      if (n && n > 1 && pageRef.current === 1) setPage(n);
      return true;
    };
    if (!heal()) unsub = store.subscribe(() => { if (heal() && unsub) { unsub(); unsub = null; } });
    return () => { if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a new page starts unzoomed, loading unless main's cache has it decoded (in the commit, before the new img's load event)
  React.useLayoutEffect(() => {
    setError(false);
    setLoading(!cached(page));
    resetZoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, resetZoom]);

  // jsdom never loads an img: there (no decode) the page counts as drawn
  React.useEffect(() => {
    const img = imgRef.current;
    if (img && typeof img.decode !== 'function') setLoading(false);
  }, [page, retry]);

  // ready: a real boot at once (the page says Loading); a gate boot once its photograph is drawn or has failed
  React.useEffect(() => {
    if (!gated || !loading || error) onReady();
  }, [gated, loading, error, onReady]);

  React.useEffect(() => { if (jumping && jumpRef.current) jumpRef.current.focus(); }, [jumping]);

  // the laptop's keys: Left and Right turn the page (not while a page number is being typed)
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = /** @type {any} */ (e.target);
      if (t && t.closest && t.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [turn]);

  const tryAgain = () => {
    // main's retry: drop the failed entry first, or neither the preload nor the crawl would ever ask again
    if (g.gardenImageCache && typeof g.gardenCacheKey === 'function') delete g.gardenImageCache[g.gardenCacheKey(page, tier)];
    setError(false);
    setLoading(true);
    setRetry((n) => n + 1);
  };
  const jump = () => {
    goTo(parseInt(typed, 10));
    setJumping(false);
    setTyped('');
  };

  return (
    <div className="gv" data-zone="garden">
      <div className="gv-area" ref={areaRef}>
        {loading && (
          <div className="gv-msg" role="status">
            {error
              ? <><span>Failed to load — check your connection</span><button type="button" className="gv-retry" onClick={tryAgain}>Try again</button></>
              : <span>{'Loading page ' + page + '...'}</span>}
          </div>
        )}
        <img ref={imgRef} key={tier + '-' + page + '-' + retry} className={'gv-img' + (loading ? ' loading' : '') + (gated ? ' still' : '')} src={pageUrl(page, tier)}
          alt={'Garden page ' + page} onLoad={() => setLoading(false)} onError={() => { setLoading(true); setError(true); }} />
      </div>
      <div className="gv-top">
        <button type="button" className="ic" aria-label="Back" onClick={pop}><Icon name="arrowL" /></button>
        {jumping ? (
          <form className="gv-n gv-jump num" onSubmit={(e) => { e.preventDefault(); jump(); }}>
            <input ref={jumpRef} type="number" min="1" max={total} inputMode="numeric" value={typed} placeholder={'1–' + total}
              aria-label="Jump to page" onChange={(e) => setTyped(e.target.value)} onBlur={() => { setJumping(false); setTyped(''); }} />
            <span>/ {total}</span>
          </form>
        ) : (
          <button type="button" className="gv-n num" aria-label="Jump to a page" onClick={() => setJumping(true)}>{page} / {total}</button>
        )}
      </div>
      <div className="gv-bot">
        <button type="button" className="gv-ar" aria-label="Previous page" disabled={page <= 1} onClick={() => turn(-1)}><Icon name="chev" flip /></button>
        <button type="button" className="gv-ar" aria-label="Next page" disabled={page >= total} onClick={() => turn(1)}><Icon name="chev" /></button>
      </div>
    </div>
  );
}

// bare: the page alone in the window (no top bar, player or tabs); the laptop's root takes the kit's .dk.gvd (black, the
// arrows at the sides)
definePlace('garden', { Screen: GardenScreen, bare: true, rootClass: 'gvd', contentClass: 'content garden', title: () => 'Return to the Garden' });
