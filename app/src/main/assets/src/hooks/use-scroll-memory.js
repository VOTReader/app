/* ═══════════════════════════════════════════════════════════════════════
   useScrollMemory — per-tab, per-screen scroll-position capture + restore
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js via tools/build.py.

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
                     — current navigation state; used as effect deps and
                       passed to getScrollKey.
     activeTab       — current active-tab object; scrollPositions are read
                       from here to restore scroll on screen change.
     activeTabIdx    — current tab index; included in the restore-effect
                       dep array so a tab switch also triggers restore.
     updateActiveTab — stable updater from useTabs; passed as the sole dep
                       of flushScrollToActiveTab's useCallback.
     surpriseAnchor  — if truthy, the screen-change effect skips restore
                       (the anchor will position the view instead).
     tabsOverviewOpen — if truthy, flushScrollToActiveTab is a no-op
                       (don't overwrite with the overview's scroll position).

   RETURNS: { flushScrollToActiveTab }

   STORAGE:
     None directly. Writes into activeTab.scrollPositions via
     updateActiveTab — those values are persisted by useSavedState as part
     of the tabs array in localStorage['vot-state'].

   HARD INVARIANT:
     flushScrollToActiveTab MUST be the direct return value of
     React.useCallback with dependency array [updateActiveTab]. Effects 1
     and 2 list it in their dep arrays and re-attach their listeners when
     its identity changes — identity stability is load-bearing.
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
  // ASYMMETRIC CLEANUP IS INTENTIONAL: the savedY branch returns a cleanup
  // to cancel the timer; the scroll-to-top branch uses a 0 ms setTimeout
  // with no cleanup return — this is deliberate (fires immediately, no
  // cleanup benefit). DO NOT add a cleanup return to the scroll-to-top
  // branch.
  React.useEffect(() => {
    const key = getScrollKey(screen, bookId, chapterNum, letterId, studyId, studyChapterId);
    scrollKeyRef.current = key;
    if (surpriseAnchor) return;

    const saved = activeTab && activeTab.scrollPositions && activeTab.scrollPositions[key];
    // Support both new { y, pct } shape and legacy plain number for backcompat
    const savedY = saved == null ? null :
    typeof saved === 'number' ? saved : typeof saved.y === 'number' ? saved.y : null;
    if (typeof savedY === 'number' && savedY > 0) {
      const timer = setTimeout(() => {if (__scrollEl) __scrollEl.scrollTop = savedY;}, 0);
      return () => clearTimeout(timer);
    }
    // Fresh screen / no saved position → top
    setTimeout(() => {if (__scrollEl) __scrollEl.scrollTop = 0;}, 0);
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, activeTabIdx]);

  // ── Return ─────────────────────────────────────────────────────────────
  return { flushScrollToActiveTab };
}
