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
     - captureActiveTabThumbnail  (React.useCallback, stable on tabsEnabled;
                                   failed captures retry up to 3× @2.5s)
     - scroll-stop capture effect (attaches to __scrollEl with polling)
     - aspect-ratio CSS var effect (sets --card-ar on resize; a settled
                                   resize also RECAPTURES the active tab —
                                   stored thumbs would be the wrong aspect)
     - capture-after-nav effect   (fires 350 ms after screen/tab change)
     - overview-open heal effect  (opening the overview captures the active
                                   content tab — safe: clone renders exclude
                                   the overlay; heals blank/stale cards)

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

   WINDOW: none — no window.__* handler bridges wired. Content-tab captures
     go through PlatformBridge.takeThemedScreenshot(curTheme) — an html2canvas
     DOM-clone render on BOTH platforms (chrome-free + blink-free: the live
     page is never photographed). Garden tabs go through takeScreenshot()
     (native PixelCopy on Android, html2canvas on web) for true pixels.

   ┌─ HARD INVARIANT — captureActiveTabThumbnail identity stability ───────┐
   │ captureActiveTabThumbnail MUST be the direct return value of          │
   │ React.useCallback with dependency array [tabsEnabled]. The scroll-    │
   │ stop and after-nav effects list it in their dep arrays and re-attach  │
   │ their listeners when its identity changes — stability is load-bearing.│
   └───────────────────────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';
import { PlatformBridge, captureTargetEl } from '../utils/platform-bridge.js';

/**
 * Publish the tab-card aspect ratio (--card-ar) from the APP COLUMN
 * (.screen-layout — what the screenshots capture; max-width 760px centered
 * on desktop, full-width on phones). Falls back to the window when no
 * column is mounted (corpus-loading placeholder, garden). Called from the
 * mount/resize effect AND at capture time — at boot the first measurement
 * can land while a lazy corpus still shows the placeholder (no column yet),
 * so the capture path re-measures once real screens exist.
 */
function updateCardAr() {
  // Same target selection as the capture itself (captureTargetEl) so the
  // card box and the pixels that fill it always agree — the naive
  // first-.screen-layout read could measure the overview overlay's own
  // layout or a transient zero-sized node.
  const layout = captureTargetEl();
  const colW = (layout && layout.classList && layout.classList.contains('screen-layout'))
    ? layout.getBoundingClientRect().width : 0;
  const w = colW || window.innerWidth || 1;
  const h = window.innerHeight || 1;
  document.documentElement.style.setProperty('--card-ar', Math.round(w) + ' / ' + h);
}

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
  // The load also SCRUBS degenerate variants: before the capture-side floor
  // existed, a zero-sized-canvas capture stored "data:," and painted that tab
  // blank forever (background tabs never recapture). Any variant under the
  // floor is dropped; an entry left empty is deleted → placeholder until the
  // next good capture.
  React.useEffect(() => {
    let cancelled = false;
    const ok = (u) => typeof u === 'string' && u.length >= 1000;
    idbReadAll().then((thumbs) => {
      if (cancelled) return;
      const norm = {};
      /** @type {Array<[string, string]>} */
      const probes = [];
      for (const k of Object.keys(thumbs || {})) {
        const v = thumbs[k];
        let entry = null;
        let rewrite = false;
        if (typeof v === 'string') {
          if (ok(v)) entry = { unknown: v };
        } else if (v && typeof v.url === 'string') {
          // interim { url, theme } rows
          rewrite = true;
          if (ok(v.url)) {
            entry = (v.theme === 'dark' || v.theme === 'light')
              ? { [v.theme]: v.url }
              : { unknown: v.url };
          }
        } else if (v && typeof v === 'object') {
          entry = {};
          for (const f of ['dark', 'light', 'unknown']) {
            if (ok(v[f])) entry[f] = v[f];
            else if (v[f] != null) rewrite = true; // blank variant scrubbed
          }
          if (Object.keys(entry).length === 0) entry = null;
        }
        if (entry) {
          norm[k] = entry;
          if (entry.unknown) probes.push([k, entry.unknown]);
          if (rewrite) idbPut(k, entry);
        } else {
          idbDelete(k); // blank/empty row — placeholder until recaptured
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
  // Bounded failed-capture retry (see the tail of captureActiveTabThumbnail).
  const captureRetryCountRef = React.useRef(0);
  const captureRetryTimerRef = React.useRef(/** @type {any} */ (null));

  // ── Capture callback ───────────────────────────────────────────────────
  // HARD INVARIANT: must be React.useCallback with dep array [tabsEnabled].
  // Single async-await path: clone render (takeThemedScreenshot) for content
  // tabs, true-pixel shot (takeScreenshot) for Garden — see the primary-
  // capture comment below.
  const captureActiveTabThumbnail = React.useCallback(async () => {
    if (!tabsEnabled) return;
    if (captureInFlightRef.current) return;
    // AUTO-SCROLL SUPPRESSION. A capture is an html2canvas clone render plus a
    // ~900ms-deferred second render for the other theme — main-thread work that
    // competes directly with a main-thread scroll. The scroll-stop path already
    // starves itself while motion is continuous (its 300ms idle never arrives),
    // but the after-nav capture fires on every auto-advance, which on short
    // entries would mean two full-page renders per page. Suppress every path at
    // this one choke point; the scroll-stop capture fires the moment the reader
    // pauses, and the overview-open heal covers anything still stale.
    if (typeof document !== 'undefined' && document.body
      && document.body.classList.contains('autoscroll-running')) return;
    const tab = tabsRef.current[activeTabIdxRef.current];
    if (!tab) return;
    // Garden pages are photographs — theme-neutral content where a themed
    // re-render buys nothing (and html2canvas re-rasterizing large images is
    // the priciest case). One capture fills BOTH variant slots.
    const isGarden = tab.screen === 'garden-view';
    // While the overview overlay is up only the GARDEN capture is suppressed:
    // its native shot photographs the real screen (overlay included). Content
    // tabs are clone renders that exclude the overlay via
    // SCREENSHOT_IGNORE_CLASSES ('tabs-overview-layer'), so capturing under
    // it is safe — and the overview-open heal below depends on it.
    if (tabsOverviewOpenRef.current && isGarden) return;
    const key = tabContentKey(tab);
    // Re-measure the card aspect now that a real screen is up — the mount
    // effect can fire while a lazy-corpus placeholder (no .screen-layout)
    // still covers the route.
    updateCardAr();

    // Measure nav height (in CSS px) so the native side can crop it — only
    // the Garden true-pixel shot uses it (web ignores topCropDp; content-tab
    // captures are clone renders where the nav + floating chrome are excluded
    // via the bridge's SCREENSHOT_IGNORE_CLASSES ignoreElements list).
    const navEl = document.querySelector('.top-nav');
    const navHeightDp = navEl ? Math.round(navEl.getBoundingClientRect().height) : 0;

    const curTheme = themeRef.current === 'light' ? 'light' : 'dark';
    const otherTheme = curTheme === 'light' ? 'dark' : 'light';
    const seq = ++captureSeqRef.current;
    if (variantTimerRef.current) { clearTimeout(variantTimerRef.current); variantTimerRef.current = null; }

    // Merge one theme's pixels into the tab's variant entry ({ dark?, light?,
    // unknown? }). Any real capture supersedes a legacy `unknown` snapshot.
    // The length floor rejects degenerate captures ("data:," from a zero-sized
    // canvas) — storing one painted a permanently blank tab card.
    const mergeVariant = (variantTheme, dataUrl) => {
      if (!dataUrl || dataUrl.length < 1000) return;
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

    // The OTHER theme rides the same clone-render path with the opposite
    // theme class forced on the clone, so both variants exist without the
    // user ever seeing a theme flash. Deferred ~900ms so the two html2canvas
    // renders never contend with each other or the visible nav/scroll settle,
    // and dropped if a newer capture supersedes it meanwhile.
    // NOTE: no live-body class, no on-screen hiding — html2canvas draws from
    // a DOM clone and drops the chrome via SCREENSHOT_IGNORE_CLASSES, so the
    // visible page is never touched. (The old `capturing-thumb` body class
    // hid the floating chrome ON SCREEN for the full render — the owner's
    // "dice/dot/arrows blink out for a split second" glitch. Never re-add it.)
    const scheduleOtherTheme = () => {
      if (isGarden) return;
      variantTimerRef.current = setTimeout(async () => {
        variantTimerRef.current = null;
        if (captureSeqRef.current !== seq) return;        // superseded
        try {
          const dataUrl = await PlatformBridge.takeThemedScreenshot(otherTheme, 1440, 90);
          if (captureSeqRef.current === seq) mergeVariant(otherTheme, dataUrl);
        } catch (_e) {
          // best-effort — the overview falls back to the flip filter
        }
      }, 900);
    };

    // Primary capture — CONTENT tabs render from a DOM clone in the CURRENT
    // theme (takeThemedScreenshot(curTheme): html2canvas on both platforms,
    // chrome-free via SCREENSHOT_IGNORE_CLASSES, and blink-free by
    // construction — the live page is never photographed, so nothing ever
    // needs hiding on screen). On web this is the same html2canvas path the
    // primary always used; on Android it replaces the native PixelCopy shot,
    // which could only stay chrome-free by visibility-hiding the floating
    // chrome on the REAL screen (the owner's split-second blink glitch).
    // GARDEN keeps the native true-pixel shot (photo pages are html2canvas's
    // priciest case, are theme-neutral, and carry no floating chrome — so
    // the native path is both cheaper and blink-free there).
    captureInFlightRef.current = true;
    let gotUrl = false;
    try {
      const dataUrl = isGarden
        ? await PlatformBridge.takeScreenshot(navHeightDp, 1440, 90)
        : await PlatformBridge.takeThemedScreenshot(curTheme, 1440, 90);
      gotUrl = !!dataUrl;
      applyThumb(dataUrl);
      if (dataUrl) scheduleOtherTheme();
    } catch (_e) {
      // Best-effort capture — failures are silent (thumbnails are visual
      // sugar; missing one isn't an error worth surfacing to the user).
    } finally {
      captureInFlightRef.current = false;
    }
    // BOUNDED RETRY: a failed capture used to wait for the next scroll-stop
    // or nav — on a tab the user just opens the overview from, that's never,
    // and the card stays a blank ✦ forever (owner's PC). Retry up to 3
    // consecutive times, 2.5s apart, seq-guarded so a real capture (or a
    // newer failure chain) supersedes the pending retry. Success resets the
    // budget; a permanently-broken environment stops after 3 traces.
    if (gotUrl) {
      captureRetryCountRef.current = 0;
    } else if (captureRetryCountRef.current < 3) {
      captureRetryCountRef.current += 1;
      if (captureRetryTimerRef.current) clearTimeout(captureRetryTimerRef.current);
      captureRetryTimerRef.current = setTimeout(() => {
        captureRetryTimerRef.current = null;
        if (captureSeqRef.current !== seq) return; // superseded by a newer capture
        captureActiveTabThumbnail();
      }, 2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTabIdxRef/tabsOverviewOpenRef/tabsRef are useRef refs read via .current inside the callback — call-time fresh, never stale. The ref objects themselves are stable; inclusion would add noise without changing behavior.
  }, [tabsEnabled]);

  // ── Pending other-theme capture + failed-capture retry — clear on unmount ─
  React.useEffect(() => () => {
    if (variantTimerRef.current) clearTimeout(variantTimerRef.current);
    if (captureRetryTimerRef.current) clearTimeout(captureRetryTimerRef.current);
  }, []);

  // ── Overview-open heal ─────────────────────────────────────────────────
  // The moment the overview opens is the one guaranteed chance to refresh
  // the ACTIVE card the user is about to look at — and the only trigger
  // available while it's open (the page under the overlay neither scrolls
  // nor navigates). Clone renders exclude the overlay via
  // SCREENSHOT_IGNORE_CLASSES, so this is safe for content tabs; the
  // callback itself suppresses Garden (native shot would photograph the
  // overlay). Heals both the blank-✦ card (all captures failed while the
  // tab was live) and a stale-geometry thumb after a window resize.
  React.useEffect(() => {
    if (!tabsEnabled || !tabsOverviewOpen) return undefined;
    const timer = setTimeout(captureActiveTabThumbnail, 60);
    return () => clearTimeout(timer);
  }, [tabsOverviewOpen, tabsEnabled, captureActiveTabThumbnail]);

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
  // Keep tab-card aspect ratio in sync with the APP COLUMN (.screen-layout —
  // what the screenshots now capture), not the raw window: on a wide desktop
  // window the column is a centered 760px strip, so window-aspect cards drew
  // landscape boxes around portrait captures. Column aspect ⇒ every card is
  // a mini of the app viewport on every platform. On phones the column
  // equals the window, so mobile card geometry is unchanged. (updateCardAr
  // also runs at capture time — see the callback above — covering the boot
  // race where this effect fires while a lazy corpus placeholder is up.)
  React.useEffect(() => {
    updateCardAr();
    let recaptureTimer = /** @type {any} */ (null);
    const onResize = () => {
      updateCardAr();
      // A resize changes the column geometry the cards mirror — every stored
      // thumb is now the WRONG aspect for the new --card-ar (cover-cropping
      // them is the PC "giant text / cropped garbage" glitch). Recapture the
      // active tab once the resize settles; background tabs heal when
      // visited (and render letterboxed meanwhile — TabsOverview's aspect
      // guard).
      clearTimeout(recaptureTimer);
      recaptureTimer = setTimeout(captureActiveTabThumbnail, 600);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(recaptureTimer);
      window.removeEventListener('resize', onResize);
    };
  }, [captureActiveTabThumbnail]);

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
