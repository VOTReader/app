/* ═══════════════════════════════════════════════════════════════════════
   useThumbnails — tab-card thumbnail capture, IDB persistence, and GC
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

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
     tabs              — full tabs array (useTabs). For the GC live-key
                         set + tabsRef.
     activeTabIdx      — active tab index (useTabs). For activeTabIdxRef.
     activeTab         — active tab object (useTabs); screen/bookId/etc.
                         used as effect deps for the after-nav trigger.
     tabsEnabled       — settings.tabsEnabled (useSettings); gates capture
                         everywhere.
     tabsOverviewOpen  — boolean (App()-local state); suppresses capture
                         while the Tabs Overview overlay is up.

   RETURNS: { tabThumbnails, setTabThumbnails, captureActiveTabThumbnail }

   STORAGE:
     IndexedDB — written via idbPut(key, dataUrl); read via idbReadAll()
     on mount. Keys are content-signature strings produced by
     tabContentKey(tab) — survive tab-index shifts (close/reorder).

   WINDOW: none — no window.__* handler bridges wired. The screenshot
     capture goes through PlatformBridge.takeScreenshot() — bridge owns
     the platform branch (native PixelCopy on Android, html2canvas on web).

   ┌─ HARD INVARIANT — captureActiveTabThumbnail identity stability ───────┐
   │ captureActiveTabThumbnail MUST be the direct return value of          │
   │ React.useCallback with dependency array [tabsEnabled]. The scroll-    │
   │ stop and after-nav effects list it in their dep arrays and re-attach  │
   │ their listeners when its identity changes — stability is load-bearing.│
   └───────────────────────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';
import { PlatformBridge } from '../utils/platform-bridge.js';

/**
 * Per-tab thumbnail capture + IDB persistence + scroll-stop refresh.
 * Owns the tabThumbnails state, the captureActiveTabThumbnail callback,
 * the IDB load-on-mount effect, and the scroll-listener attach effect.
 *
 * @param {{
 *   tabs: any[],
 *   activeTabIdx: number,
 *   activeTab: any,
 *   tabsEnabled: boolean,
 *   tabsOverviewOpen: boolean
 * }} args
 * @returns {{
 *   tabThumbnails: Record<string, string>,
 *   setTabThumbnails: (val: any) => void,
 *   captureActiveTabThumbnail: () => void
 * }}
 */
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
  // Single async-await path: PlatformBridge.takeScreenshot() handles the
  // platform branch.
  const captureActiveTabThumbnail = React.useCallback(async () => {
    if (!tabsEnabled) return;
    if (tabsOverviewOpenRef.current) return; // overview open → no point capturing
    if (captureInFlightRef.current) return;
    const tab = tabsRef.current[activeTabIdxRef.current];
    if (!tab) return;
    const key = tabContentKey(tab);

    // Measure nav height (in CSS px) so the native side can crop it. Web
    // ignores topCropDp (chrome hidden via the capturing-thumb body class
    // + the bridge's SCREENSHOT_IGNORE_CLASSES selector list).
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
    // before we hand control to the bridge.
    void document.body.offsetHeight;

    captureInFlightRef.current = true;
    try {
      const dataUrl = await PlatformBridge.takeScreenshot(navHeightDp, 1440, 90);
      applyThumb(dataUrl);
    } catch (_e) {
      // Best-effort capture — failures are silent (thumbnails are visual
      // sugar; missing one isn't an error worth surfacing to the user).
    } finally {
      captureInFlightRef.current = false;
      document.body.classList.remove('capturing-thumb');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTabIdxRef/tabsOverviewOpenRef/tabsRef are useRef refs read via .current inside the callback — call-time fresh, never stale. The ref objects themselves are stable; inclusion would add noise without changing behavior.
  }, [tabsEnabled]);

  // ── Scroll-stop capture effect ─────────────────────────────────────────
  // Keep tab thumbnails fresh: capture on scroll-stop (300ms idle).
  React.useEffect(() => {
    // SHELL-2: when tabs are off (a common/default config) there is nothing to
    // capture, so don't run the 400ms re-attach poll + scroll listener for the
    // app's lifetime. The effect re-runs when tabsEnabled flips (it's a dep), so
    // turning tabs on re-establishes the listener.
    if (!tabsEnabled) return undefined;
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
  }, [captureActiveTabThumbnail, tabsEnabled]);

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
