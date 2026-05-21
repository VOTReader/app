/* ═══════════════════════════════════════════════════════════════════════
   useThumbnails — tab-card thumbnail capture, IDB persistence, and GC
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js via tools/build.py.

   OWNS:
     - tabThumbnails state (content-keyed JPEG data-URL map)
     - setTabThumbnails   (returned so App's closeAllTabs can clear it)
     - IDB load-on-mount  (idbReadAll — reads IndexedDB on first render)
     - GC effect          (debounced, removes stale keys no longer tied
                           to any open tab)
     - captureActiveTabThumbnail  (React.useCallback, stable on tabsEnabled)
     - scroll-stop capture effect (attaches to __scrollEl with polling)
     - aspect-ratio CSS var effect (sets --card-ar on resize)
     - capture-after-nav effect   (fires 350 ms after screen/tab change)

   DOES NOT OWN:
     - tabContentKey / idbReadAll / idbPut / idbDelete — global helpers
       in Cluster A (bundle-a.js); accessed as bare names via window.
     - __scrollEl — window global set by the main scroll container's ref
       callback in App(); read directly as a global (no import needed).
     - tabsOverviewOpenRef — callers pass tabsOverviewOpen as a param;
       an internal ref mirror provides the synchronous read inside the
       capture callback.

   PARAMS:
     tabs              — full tabs array (for GC live-key set + tabsRef)
     activeTabIdx      — current active tab index (for activeTabIdxRef)
     activeTab         — current active tab object (screen, bookId, etc.)
                         used as effect deps for the after-nav trigger
     tabsEnabled       — settings.tabsEnabled; gates capture everywhere
     tabsOverviewOpen  — boolean; suppresses capture while overview is up

   RETURNS: { tabThumbnails, setTabThumbnails, captureActiveTabThumbnail }

   STORAGE:
     IndexedDB — written via idbPut(key, dataUrl); read via idbReadAll()
     on mount. Keys are content-signature strings produced by
     tabContentKey(tab) — survive tab-index shifts (close/reorder).

   HARD INVARIANT:
     captureActiveTabThumbnail MUST be the direct return value of
     React.useCallback with dependency array [tabsEnabled]. The
     scroll-stop and after-nav effects depend on its identity stability.
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';

export function useThumbnails({
  tabs,
  activeTabIdx,
  activeTab,
  tabsEnabled,
  tabsOverviewOpen,
}) {
  // ── State ──────────────────────────────────────────────────────────────
  const [tabThumbnails, setTabThumbnails] = React.useState({});

  // ── Load previously-saved thumbnails on mount ──────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    idbReadAll().then((thumbs) => {
      if (cancelled) return;
      setTabThumbnails(thumbs || {});
    });
    return () => { cancelled = true; };
  }, []);

  // ── Garbage-collect stale thumbnails ───────────────────────────────────
  // Debounced so we don't thrash during rapid tab edits.
  const thumbGcTimerRef = React.useRef(null);
  React.useEffect(() => {
    clearTimeout(thumbGcTimerRef.current);
    thumbGcTimerRef.current = setTimeout(() => {
      const liveKeys = new Set(tabs.map((t) => tabContentKey(t)));
      const deadKeys = Object.keys(tabThumbnails).filter((k) => !liveKeys.has(k));
      if (deadKeys.length === 0) return;
      deadKeys.forEach((k) => idbDelete(k));
      setTabThumbnails((prev) => {
        const out = {};
        for (const k of Object.keys(prev)) if (liveKeys.has(k)) out[k] = prev[k];
        return out;
      });
    }, 2000);
    return () => clearTimeout(thumbGcTimerRef.current);
  }, [tabs, tabThumbnails]);

  // ── Refs ───────────────────────────────────────────────────────────────
  const activeTabIdxRef = useRefMirror(activeTabIdx);
  const tabsRef = useRefMirror(tabs);
  const tabsOverviewOpenRef = useRefMirror(tabsOverviewOpen);
  const captureInFlightRef = React.useRef(false);
  const thumbnailsRef = React.useRef({});

  // ── Capture callback ───────────────────────────────────────────────────
  // HARD INVARIANT: must be React.useCallback with dep array [tabsEnabled].
  const captureActiveTabThumbnail = React.useCallback(() => {
    if (!tabsEnabled) return;
    if (tabsOverviewOpenRef.current) return; // overview open → no point capturing
    if (captureInFlightRef.current) return;
    const tab = tabsRef.current[activeTabIdxRef.current];
    if (!tab) return;
    const key = tabContentKey(tab);

    // Measure nav height (in CSS px) so the native side can crop it
    const navEl = document.querySelector('.top-nav');
    const navHeightDp = navEl ? Math.round(navEl.getBoundingClientRect().height) : 0;

    const applyThumb = (dataUrl) => {
      if (!dataUrl) return;
      thumbnailsRef.current[key] = dataUrl;
      setTabThumbnails((prev) => ({ ...prev, [key]: dataUrl }));
      idbPut(key, dataUrl); // write-through to IndexedDB — survives app restart
    };

    // Hide floating UI chrome (sticky arrows, reading dot) for the duration
    // of the capture so the thumbnail shows pure content only.
    document.body.classList.add('capturing-thumb');
    // Force a synchronous layout so the visibility:hidden takes effect
    // before we hand control to the native bridge.
    void document.body.offsetHeight;

    // Native fast path — synchronous because WebView JS interfaces run on
    // a worker thread; blocking here on the UI thread for ~50ms does not
    // deadlock. Synchronous is important: callers (like goTabs) need the
    // thumbnail captured BEFORE the overlay mounts and covers the screen.
    if (window.AndroidBridge && typeof window.AndroidBridge.takeScreenshot === 'function') {
      captureInFlightRef.current = true;
      try {
        const dataUrl = window.AndroidBridge.takeScreenshot(navHeightDp, 1440, 90);
        applyThumb(dataUrl);
      } catch (e) {}
      captureInFlightRef.current = false;
      document.body.classList.remove('capturing-thumb');
      return;
    }

    // html2canvas fallback (dev browser / no bridge)
    if (typeof html2canvas !== 'function') return;
    captureInFlightRef.current = true;
    const bg = document.body.classList.contains('light') ? '#f7f2e8' : '#07070e';
    try {
      html2canvas(document.body, {
        backgroundColor: bg,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true, logging: false, allowTaint: false, imageTimeout: 2000,
        ignoreElements: (el) => el.classList && (
          el.classList.contains('tabs-overview-layer') ||
          el.classList.contains('top-nav') ||
          el.classList.contains('back-hint-row') ||
          el.classList.contains('chapter-nav-sticky') ||
          el.classList.contains('reading-dot-global') ||
          el.classList.contains('surprise-fab') ||
          el.classList.contains('mode-toggle-wrap'))
      }).then((canvas) => {
        const MAX_DIM = 1440;
        const w = canvas.width, h = canvas.height;
        const scale = Math.min(MAX_DIM / w, MAX_DIM / h, 1);
        let out = canvas;
        if (scale < 1) {
          const c2 = document.createElement('canvas');
          c2.width = Math.round(w * scale); c2.height = Math.round(h * scale);
          const ctx = c2.getContext('2d');
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
          out = c2;
        }
        applyThumb(out.toDataURL('image/jpeg', 0.90));
      }).catch(() => {}).finally(() => {
        captureInFlightRef.current = false;
        document.body.classList.remove('capturing-thumb');
      });
    } catch (e) {
      captureInFlightRef.current = false;
      document.body.classList.remove('capturing-thumb');
    }
  }, [tabsEnabled]);

  // ── Scroll-stop capture effect ─────────────────────────────────────────
  // Keep tab thumbnails fresh: capture on scroll-stop (300ms idle).
  React.useEffect(() => {
    let scrollTimer = null;
    let currentEl = null;
    const onScroll = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(captureActiveTabThumbnail, 300);
    };
    const attach = () => {
      if (__scrollEl !== currentEl) {
        if (currentEl) currentEl.removeEventListener("scroll", onScroll);
        currentEl = __scrollEl;
        if (currentEl) currentEl.addEventListener("scroll", onScroll, { passive: true });
      }
    };
    attach();
    const poll = setInterval(attach, 400);
    return () => {
      clearInterval(poll); clearTimeout(scrollTimer);
      if (currentEl) currentEl.removeEventListener("scroll", onScroll);
    };
  }, [captureActiveTabThumbnail]);

  // ── Aspect-ratio CSS var effect ────────────────────────────────────────
  // Keep tab-card aspect ratio in sync with the viewport so
  // thumbnails fill their cards without crop or distortion.
  React.useEffect(() => {
    const update = () => {
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      document.documentElement.style.setProperty('--card-ar', w + ' / ' + h);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Capture-after-nav effect ───────────────────────────────────────────
  // Capture shortly after any screen/tab change.
  React.useEffect(() => {
    if (!tabsEnabled) return;
    if (tabsOverviewOpen) return;
    const timer = setTimeout(captureActiveTabThumbnail, 350);
    return () => clearTimeout(timer);
  }, [activeTab.screen, activeTab.bookId, activeTab.chapterNum, activeTab.letterId,
  activeTab.studyId, activeTab.studyChapterId, activeTab.genreId,
  activeTab.gardenPage, activeTabIdx, tabsEnabled, tabsOverviewOpen,
  captureActiveTabThumbnail]);

  // ── Return ─────────────────────────────────────────────────────────────
  return { tabThumbnails, setTabThumbnails, captureActiveTabThumbnail };
}
