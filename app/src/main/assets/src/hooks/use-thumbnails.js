/* ═══════════════════════════════════════════════════════════════════════
   useThumbnails — tab-card thumbnail capture, IDB persistence, and GC
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - tabThumbnails state (content-keyed DUAL-THEME variant maps:
       { dark?: jpegDataUrl, light?: jpegDataUrl, unknown?: jpegDataUrl } —
       the current theme is photographed as before; the OTHER theme is
       rendered ~900ms later from an html2canvas clone with the opposite
       theme class forced, so the Tabs overview always has the right-theme
       card and a theme switch never mixes dark+light walls)
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
 * Classify which theme a legacy (pre-metadata) thumbnail was captured under
 * by its average luminance: the dark theme's background (#07070e, luma ~8)
 * and the light theme's (#f7f2e8, luma ~242) dominate any capture, so a
 * mid-scale threshold is unambiguous. Resolves 'dark' | 'light', or null
 * when the image can't be decoded/drawn (jsdom, corrupt row) — callers
 * leave the row as `unknown` and render it as-is.
 *
 * @param {string} dataUrl
 * @returns {Promise<'dark'|'light'|null>}
 */
export function classifyThumbTheme(dataUrl) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 8; c.height = 8;
          const ctx = c.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0, 8, 8);
          const d = ctx.getImageData(0, 0, 8, 8).data;
          let luma = 0;
          for (let i = 0; i < d.length; i += 4) {
            luma += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          }
          luma /= (d.length / 4);
          resolve(luma >= 128 ? 'light' : 'dark');
        } catch (_e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch (_e) { resolve(null); }
  });
}

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
 *   tabsOverviewOpen: boolean,
 *   theme: string
 * }} args
 * @returns {{
 *   tabThumbnails: Record<string, { dark?: string, light?: string, unknown?: string }>,
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
  theme,
}) {
  // ── State ──────────────────────────────────────────────────────────────
  const [tabThumbnails, setTabThumbnails] = React.useState({});
  // Call-time mirror of tabThumbnails — mergeVariant and the probe upgrades
  // read it to build entries without stale-closure state.
  const thumbnailsRef = React.useRef({});

  // ── Load previously-saved thumbnails on mount ──────────────────────────
  // Entries are DUAL-THEME variant maps: { dark?: url, light?: url,
  // unknown?: url }. The overview picks the variant matching the current
  // theme, so a theme switch never shows a mixed dark/light wall and never
  // needs a recapture. Older shapes migrate in place:
  //   - { url, theme }  (the one-day interim format) → { [theme]: url }
  //   - bare string / theme:null (pre-metadata rows)  → { unknown: url },
  //     then classifyThumbTheme probes the JPEG's average luminance and
  //     upgrades the row to its real theme slot (so even never-revisited
  //     tabs participate in theme matching — the owner's Library card).
  React.useEffect(() => {
    let cancelled = false;
    idbReadAll().then((thumbs) => {
      if (cancelled) return;
      const norm = {};
      /** @type {Array<[string, string]>} */
      const probes = [];
      for (const k of Object.keys(thumbs || {})) {
        const v = thumbs[k];
        if (typeof v === 'string') {
          norm[k] = { unknown: v };
          probes.push([k, v]);
        } else if (v && typeof v.url === 'string') {
          // interim { url, theme } rows
          if (v.theme === 'dark' || v.theme === 'light') {
            norm[k] = { [v.theme]: v.url };
            idbPut(k, norm[k]);
          } else {
            norm[k] = { unknown: v.url };
            probes.push([k, v.url]);
          }
        } else {
          norm[k] = v || {};
        }
      }
      thumbnailsRef.current = norm;
      setTabThumbnails(norm);
      // Luminance-probe the unknowns in the background; each resolution
      // upgrades its row (state + IDB) unless a real capture got there first.
      probes.forEach(([k, url]) => {
        classifyThumbTheme(url).then((cls) => {
          if (cancelled || !cls) return;
          const cur = thumbnailsRef.current[k];
          if (!cur || cur.unknown !== url) return; // superseded by a real capture
          const entry = { [cls]: url };
          thumbnailsRef.current[k] = entry;
          setTabThumbnails((prev) => ({ ...prev, [k]: entry }));
          idbPut(k, entry);
        });
      });
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
  // Theme rides a ref so the capture reads it call-time fresh without
  // breaking the captureActiveTabThumbnail [tabsEnabled] identity invariant.
  const themeRef = useRefMirror(theme);
  const captureInFlightRef = React.useRef(false);
  // Capture sequence + the pending other-theme capture timer. Each primary
  // capture bumps the sequence; the deferred themed capture aborts if a newer
  // primary superseded it (fresh scroll position or content).
  const captureSeqRef = React.useRef(0);
  const variantTimerRef = React.useRef(/** @type {any} */ (null));

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

    const curTheme = themeRef.current === 'light' ? 'light' : 'dark';
    const otherTheme = curTheme === 'light' ? 'dark' : 'light';
    // Garden pages are photographs — theme-neutral content where a themed
    // re-render buys nothing (and html2canvas re-rasterizing large images is
    // the priciest case). One capture fills BOTH variant slots.
    const isGarden = tab.screen === 'garden-view';
    const seq = ++captureSeqRef.current;
    if (variantTimerRef.current) { clearTimeout(variantTimerRef.current); variantTimerRef.current = null; }

    // Merge one theme's pixels into the tab's variant entry ({ dark?, light?,
    // unknown? }). Any real capture supersedes a legacy `unknown` snapshot.
    const mergeVariant = (variantTheme, dataUrl) => {
      if (!dataUrl) return;
      const cur = thumbnailsRef.current[key];
      const base = (cur && typeof cur === 'object') ? cur : {};
      const entry = { ...base, [variantTheme]: dataUrl };
      delete entry.unknown;
      delete entry.url; delete entry.theme; // scrub interim-format fields
      thumbnailsRef.current[key] = entry;
      setTabThumbnails((prev) => ({ ...prev, [key]: entry }));
      idbPut(key, entry); // write-through to IndexedDB — survives app restart
    };

    const applyThumb = (dataUrl) => {
      if (!dataUrl) return;
      mergeVariant(curTheme, dataUrl);
      if (isGarden) mergeVariant(otherTheme, dataUrl);
    };

    // The OTHER theme can't be photographed (native capture only shoots the
    // on-screen pixels) but it CAN be rendered: html2canvas draws from a DOM
    // clone whose theme class we force (PlatformBridge.takeThemedScreenshot),
    // so both variants exist without the user ever seeing a theme flash.
    // Deferred ~900ms so it never contends with the visible nav/scroll settle,
    // and dropped if a newer capture supersedes it meanwhile.
    const scheduleOtherTheme = () => {
      if (isGarden) return;
      variantTimerRef.current = setTimeout(async () => {
        variantTimerRef.current = null;
        if (captureSeqRef.current !== seq) return;        // superseded
        if (tabsOverviewOpenRef.current) return;          // overview covers the page
        document.body.classList.add('capturing-thumb');   // clone inherits it
        try {
          const dataUrl = await PlatformBridge.takeThemedScreenshot(otherTheme, 1440, 90);
          if (captureSeqRef.current === seq) mergeVariant(otherTheme, dataUrl);
        } catch (_e) {
          // best-effort — the overview falls back to the flip filter
        } finally {
          document.body.classList.remove('capturing-thumb');
        }
      }, 900);
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
      if (dataUrl) scheduleOtherTheme();
    } catch (_e) {
      // Best-effort capture — failures are silent (thumbnails are visual
      // sugar; missing one isn't an error worth surfacing to the user).
    } finally {
      captureInFlightRef.current = false;
      document.body.classList.remove('capturing-thumb');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTabIdxRef/tabsOverviewOpenRef/tabsRef are useRef refs read via .current inside the callback — call-time fresh, never stale. The ref objects themselves are stable; inclusion would add noise without changing behavior.
  }, [tabsEnabled]);

  // ── Pending other-theme capture — clear on unmount ─────────────────────
  React.useEffect(() => () => {
    if (variantTimerRef.current) clearTimeout(variantTimerRef.current);
  }, []);

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
  // Capture shortly after any screen/tab change — and after a THEME change
  // (the active tab re-renders in the new theme; recapturing swaps its
  // filtered overview card for true pixels).
  React.useEffect(() => {
    if (!tabsEnabled) return;
    if (tabsOverviewOpen) return;
    const timer = setTimeout(captureActiveTabThumbnail, 350);
    return () => clearTimeout(timer);
  }, [activeTab.screen, activeTab.bookId, activeTab.chapterNum, activeTab.letterId,
  activeTab.studyId, activeTab.studyChapterId, activeTab.genreId,
  activeTab.gardenPage, activeTabIdx, tabsEnabled, tabsOverviewOpen, theme,
  captureActiveTabThumbnail]);

  // ── Return ─────────────────────────────────────────────────────────────
  return { tabThumbnails, setTabThumbnails, captureActiveTabThumbnail };
}
