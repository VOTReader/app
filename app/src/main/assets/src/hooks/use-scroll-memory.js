/* ═══════════════════════════════════════════════════════════════════════
   useScrollMemory — per-tab, per-screen scroll-position capture + restore
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - scrollKeyRef             (hook-internal; NOT returned)
     - flushScrollToActiveTab   (React.useCallback, dep [updateActiveTab])
                                 Writes { y, pct } into the active tab's
                                 scrollPositions map for the current screen.
     - Debounced scroll-listener effect (attaches to __scrollEl with 300 ms
                                 re-poll; fires flushScrollToActiveTab after
                                 120 ms idle).
     - Visibility/pagehide effect (flushes before OS kill or tab-switch).
     - Screen-change restore effect (updates scrollKeyRef; restores saved Y
                                 or scrolls to top when no saved position).

   DOES NOT OWN:
     - __scrollEl — window global set by the main scroll-container's ref
       callback in App(); read directly as a bare-name global (no import).
     - COL_BY_LETTER_SC — Map exported by scripture-resolution.js and
       exposed on window via _entry-b.js. Used in getScrollKey to derive
       the correct prefix for letter/WTLB/blessed/holy-days screens. Read
       directly as a bare-name global (no import).

   PARAMS:
     screen, bookId, chapterNum, letterId, studyId, studyChapterId
                     — current navigation state (useTabs via tabField);
                       used as effect deps and passed to getScrollKey.
     activeTab       — active-tab object (useTabs); scrollPositions are
                       read from here to restore scroll on screen change.
     activeTabIdx    — active tab index (useTabs); in the restore-effect
                       dep array so a tab switch also triggers restore.
     updateActiveTab — stable updater (useTabs); the sole dep of
                       flushScrollToActiveTab's useCallback.
     surpriseAnchor  — useTabs via tabField; if truthy the screen-change
                       effect skips restore (the anchor positions instead).
     tabsOverviewOpen — App()-local state; if truthy flushScrollToActiveTab
                       is a no-op (don't overwrite with the overview scroll).

   RETURNS: { flushScrollToActiveTab }

   STORAGE:
     None directly. Writes into activeTab.scrollPositions via
     updateActiveTab — those values ride along in the tabs array persisted
     to localStorage['vot-state'] by usePersistedState (P6k+1).

   WINDOW: none — wires no window.__* handler bridges. Reads the bare-name
     global __scrollEl and attaches scroll / visibilitychange / pagehide
     listeners (all balanced with removeEventListener in effect cleanup).

   ┌─ HARD INVARIANT — flushScrollToActiveTab identity stability ──────────┐
   │ flushScrollToActiveTab MUST be the direct return value of             │
   │ React.useCallback with dependency array [updateActiveTab]. Effects 1  │
   │ and 2 list it in their dep arrays and re-attach their listeners when  │
   │ its identity changes — identity stability is load-bearing.            │
   └───────────────────────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';

// ── Module-private helper ──────────────────────────────────────────────────
// Derives a stable localStorage / scrollPositions key for the current
// screen. COL_BY_LETTER_SC is a bare-name window global (bundle-b.js).
function getScrollKey(scr, bid, cnum, lid, sid, scid) {
  if (scr === "matthew-ch" || scr === "bible-ch") return bid + '-' + cnum;
  if (scr === "bible-study-chapter") return 'study-' + (sid || '') + '-' + (scid || '');
  if (scr === "hm-letter") return 'entry-' + lid;
  var _sc = COL_BY_LETTER_SC.get(scr);
  if (_sc) {
    var pfx = _sc.kind === 'holy-days' ? 'holyday' : _sc.kind === 'letter' ? 'letter' : _sc.kind;
    return pfx + '-' + lid;
  }
  return scr;
}

/**
 * Per-tab scroll-position persistence. Saves the active tab's scroll
 * percentage on scroll-stop / page-hide / pagehide; restores it on
 * screen-key change. Returns flushScrollToActiveTab so callers can fire
 * an immediate save (e.g. before a tab switch).
 *
 * @param {{
 *   screen: string,
 *   bookId: string | null,
 *   chapterNum: number | null,
 *   letterId: string | null,
 *   studyId: string | null,
 *   studyChapterId: string | null,
 *   activeTab: any,
 *   activeTabIdx: number,
 *   updateActiveTab: (patchOrFn: any) => void,
 *   surpriseAnchor: any,
 *   tabsOverviewOpen: boolean
 * }} args
 * @returns {{ flushScrollToActiveTab: () => void }}
 */
export function useScrollMemory({
  screen, bookId, chapterNum, letterId, studyId, studyChapterId,
  activeTab,
  activeTabIdx,
  updateActiveTab,
  surpriseAnchor,
  tabsOverviewOpen,
}) {
  // ── Refs ───────────────────────────────────────────────────────────────
  const scrollKeyRef = React.useRef(getScrollKey(screen, bookId, chapterNum, letterId, studyId, studyChapterId));
  const tabsOverviewOpenRef = useRefMirror(tabsOverviewOpen);

  // ── Flush callback ─────────────────────────────────────────────────────
  // HARD INVARIANT: must be React.useCallback with dep array [updateActiveTab].
  const flushScrollToActiveTab = React.useCallback(() => {
    if (tabsOverviewOpenRef.current) return; // don't overwrite with overview scroll
    const key = scrollKeyRef.current;
    if (!key || !__scrollEl) return;
    const { scrollTop, scrollHeight, clientHeight } = __scrollEl;
    const max = Math.max(scrollHeight - clientHeight, 1);
    const pct = Math.max(0, Math.min(1, scrollTop / max));
    updateActiveTab((t) => ({
      scrollPositions: { ...(t.scrollPositions || {}), [key]: { y: scrollTop, pct } }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tabsOverviewOpenRef is a useRef ref read via .current — call-time fresh, stable object identity. Per HARD INVARIANT above, deps are intentionally [updateActiveTab] only.
  }, [updateActiveTab]);

  // ── Effect 1: debounced scroll-listener attach ─────────────────────────
  // Re-polls every 300 ms in case __scrollEl hasn't mounted yet.
  React.useEffect(() => {
    let timeout;
    let currentEl = null;
    const onScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(flushScrollToActiveTab, 120);
    };
    const attach = () => {
      if (__scrollEl !== currentEl) {
        if (currentEl) currentEl.removeEventListener("scroll", onScroll);
        currentEl = __scrollEl;
        if (currentEl) currentEl.addEventListener("scroll", onScroll, { passive: true });
      }
    };
    attach();
    const poll = setInterval(attach, 300);
    return () => {clearInterval(poll);if (currentEl) currentEl.removeEventListener("scroll", onScroll);clearTimeout(timeout);};
  }, [flushScrollToActiveTab]);

  // ── Effect 2: flush on page-hide / app-background ─────────────────────
  // Ensures position is preserved across OS kills and tab switches.
  React.useEffect(() => {
    const onVis = () => {if (document.visibilityState === 'hidden') flushScrollToActiveTab();};
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flushScrollToActiveTab);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flushScrollToActiveTab);
    };
  }, [flushScrollToActiveTab]);

  // ── Effect 3: screen-change → update key + restore saved scroll ────────
  // Both branches set scrollTop synchronously (catches fast desktop
  // engines) AND via requestAnimationFrame (catches Android WebView,
  // where the browser finalises layout AFTER the React commit — a bare
  // setTimeout(0) fires before that layout pass and gets overridden by
  // the WebView's scroll-maintenance). Both branches return cleanup so
  // a rapid re-fire doesn't race with a stale rAF.
  React.useEffect(() => {
    const key = getScrollKey(screen, bookId, chapterNum, letterId, studyId, studyChapterId);
    scrollKeyRef.current = key;
    if (surpriseAnchor) return;

    const saved = activeTab && activeTab.scrollPositions && activeTab.scrollPositions[key];
    // Support both new { y, pct } shape and legacy plain number for backcompat
    const savedY = saved == null ? null :
    typeof saved === 'number' ? saved : typeof saved.y === 'number' ? saved.y : null;
    const target = typeof savedY === 'number' && savedY > 0 ? savedY : 0;
    if (__scrollEl) __scrollEl.scrollTop = target;
    const raf = requestAnimationFrame(() => { if (__scrollEl) __scrollEl.scrollTop = target; });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effect intent: restore-saved-scroll on nav-key change. activeTab derives from tabs[activeTabIdx]; activeTabIdx is already in deps so tab-switch correctly re-runs. surpriseAnchor is read as a guard (early-return when set) but should NOT trigger re-fire — only nav changes drive scroll restoration.
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, activeTabIdx]);

  // ── Return ─────────────────────────────────────────────────────────────
  return { flushScrollToActiveTab };
}
