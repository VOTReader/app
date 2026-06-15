/* ═══════════════════════════════════════════════════════════════════════
   useScrollMemory — per-tab, per-screen scroll-position capture + restore
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - scrollKeyRef             (hook-internal; NOT returned)
     - liveScrollRef            (hook-internal) — { key, y, pct } updated on
                                 EVERY scroll event (ref write, no re-render).
                                 The exact-position source for the nav-time
                                 commit below; immune to the 120 ms debounce
                                 race and to post-content-swap scrollTop
                                 clamping (never re-reads the DOM at nav).
     - flushScrollToActiveTab   (React.useCallback, dep [updateActiveTab])
                                 Writes { y, pct } into the active tab's
                                 scrollPositions map for the current screen.
     - Debounced scroll-listener effect (attaches to __scrollEl with 300 ms
                                 re-poll; fires flushScrollToActiveTab after
                                 120 ms idle; stamps liveScrollRef per event).
     - Visibility/pagehide effect (flushes before OS kill or tab-switch).
     - Screen-change restore effect (commits liveScrollRef for the key being
                                 LEFT — in-tab nav only; updates scrollKeyRef;
                                 restores saved Y or scrolls to top when no
                                 saved position).

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

// Land a saved scrollTop on the current __scrollEl. Returns a cleanup fn.
//
// PERF4 × exact restore: .letter-para / .section-block are
// content-visibility:auto with PLACEHOLDER intrinsic heights until first
// render, so restoring against estimated geometry lands on the wrong content
// (and scroll anchoring then drags it as blocks lazily render). While
// restoring a non-top position, body.scroll-restoring lifts content-visibility
// (app.css) so layout is REAL when scrollTop lands; the forced layout also
// populates contain-intrinsic-size:auto's remembered sizes, so re-engaging the
// optimization one frame later changes no geometry. Top restores (target 0)
// skip the force — top is top in any geometry.
//
// COLD-BOOT RACE: on a fresh launch the restore runs BEFORE the chapter is
// ready in two ways — (1) the scroll container itself isn't mounted yet
// (`__scrollEl` is null while the lazy-corpus loading view shows), and (2) even
// once mounted, the verses still have to render in, so the container is too
// short and `scrollTop = target` CLAMPS. The effect runs once (its deps are the
// nav keys, which don't change as the chapter streams in), so a single early
// apply was lost (Hebrews reopened at the top on every cold boot). Re-apply
// across animation frames until the container exists AND is tall enough to hold
// `target`, or a bounded deadline passes. Content already present (in-tab nav)
// satisfies the check on the FIRST apply and releases next frame — unchanged.
function startRestore(target) {
  if (target <= 0) {
    if (__scrollEl) __scrollEl.scrollTop = 0;
    return function () {};
  }
  document.body.classList.add('scroll-restoring');
  var raf = 0, raf2 = 0, tries = 0;
  var MAX_TRIES = 90; // ~1.5s @ 60fps — covers cold-boot corpus load + paint
  var land = function () {
    tries += 1;
    if (__scrollEl) {
      void __scrollEl.scrollHeight; // force real-geometry layout (cv lifted)
      __scrollEl.scrollTop = target;
    }
    // "Ready" = the scroll container is mounted AND tall enough to hold target.
    // On cold boot BOTH lag the restore: __scrollEl is null while the lazy-corpus
    // loading view shows (the chapter — and its .screen-scroll ref — hasn't
    // mounted), then once the chapter mounts its blocks still have to render in.
    // Retry across frames until ready, or give up at the deadline (then still
    // release, so the content-visibility lift can never leak).
    var ready = __scrollEl && (__scrollEl.scrollHeight - __scrollEl.clientHeight) >= target - 2;
    if (!ready && tries < MAX_TRIES) {
      raf = requestAnimationFrame(land);
      return;
    }
    // Re-apply after the post-commit layout pass (an async content swap can
    // still shift the offset), then release one PAINTED frame later so
    // contain-intrinsic-size:auto memoizes the real sizes before content-
    // visibility re-engages. Frame 1 paints WITH the force; frame 2 releases.
    raf = requestAnimationFrame(function () {
      if (__scrollEl) __scrollEl.scrollTop = target;
      raf2 = requestAnimationFrame(function () { document.body.classList.remove('scroll-restoring'); });
    });
  };
  land();
  return function () {
    cancelAnimationFrame(raf);
    if (raf2) cancelAnimationFrame(raf2);
    document.body.classList.remove('scroll-restoring');
  };
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
  // Last REAL scroll position, stamped on every scroll event. The debounced
  // flush only fires 120 ms after scrolling STOPS — navigating inside that
  // window (tap "next letter" mid-momentum) used to lose the final position
  // (the pending timeout fired after scrollKeyRef had moved to the new key).
  // This stash is what the restore effect commits for the key being left.
  const liveScrollRef = React.useRef(/** @type {{key: string, y: number, pct: number} | null} */ (null));
  // Previous activeTabIdx — the nav-time commit is for IN-TAB nav only. Tab
  // switches flush explicitly (goTabs fires flushScrollToActiveTab before the
  // overview opens); committing here on a tab switch would write the OLD
  // tab's position into the NEW tab via the rebound updateActiveTab.
  const prevTabIdxRef = React.useRef(activeTabIdx);

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
      // Exact-position stash, every event (ref write — no re-render). Skipped
      // while the tabs overview is open, mirroring the flush guard, so the
      // overview's own scrolling can't masquerade as screen position.
      if (currentEl && !tabsOverviewOpenRef.current) {
        const y = currentEl.scrollTop;
        const max = Math.max(currentEl.scrollHeight - currentEl.clientHeight, 1);
        liveScrollRef.current = { key: scrollKeyRef.current, y, pct: Math.max(0, Math.min(1, y / max)) };
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tabsOverviewOpenRef is a useRefMirror ref read via .current — call-time fresh, stable object identity (same contract as in flushScrollToActiveTab above). liveScrollRef/scrollKeyRef are plain useRefs. Deps stay [flushScrollToActiveTab] so the listener re-attaches only when the flush identity changes.
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
  // APP2: a LAYOUT effect (runs after commit, BEFORE paint) so the restored
  // scrollTop is in place for the FIRST paint of the new screen — as a passive
  // effect it applied AFTER paint, flashing the new content at scroll 0 for a
  // frame. Safe + effective because __scrollEl is a ScreenLayout ref CALLBACK,
  // attached during commit (child-first), so it is already the new container by
  // the time this parent layout effect runs; client-only app, so no SSR caveat.
  // Still applies the target synchronously AND again inside a requestAnimationFrame
  // (the rAF re-applies after the post-commit layout pass, in case the content swap
  // shifted the offset — async content / images). Cleanup cancels a stale rAF so a
  // rapid re-fire can't fight the next restore.
  React.useLayoutEffect(() => {
    const key = getScrollKey(screen, bookId, chapterNum, letterId, studyId, studyChapterId);
    // NAV-TIME EXACT CAPTURE: commit the live stash for the key being LEFT,
    // before the new screen's restore runs. The debounced flush alone loses
    // any scrolling done within 120 ms of the nav tap (its timeout fires
    // after scrollKeyRef has moved on); the stash holds the position at the
    // LAST scroll event — exactly where the user left. Guards:
    //   - in-tab nav only (tab switches flush via goTabs; see prevTabIdxRef)
    //   - stash key must MATCH the key being left (a stale stash from two
    //     screens ago must not leak onto a screen the user never scrolled)
    const prevKey = scrollKeyRef.current;
    const sameTab = prevTabIdxRef.current === activeTabIdx;
    prevTabIdxRef.current = activeTabIdx;
    const live = liveScrollRef.current;
    if (sameTab && prevKey !== key && live && live.key === prevKey) {
      updateActiveTab((t) => ({
        scrollPositions: { ...(t.scrollPositions || {}), [prevKey]: { y: live.y, pct: live.pct } }
      }));
    }
    scrollKeyRef.current = key;
    // surpriseAnchor is ALWAYS a verse anchor ({type:'verse'}) and is consumed
    // for scroll positioning ONLY by the bible-ch / matthew-ch screens (they
    // scrollIntoView the verse, so this effect must not fight them by resetting
    // to top). On any OTHER screen a set anchor is stale: a verse search/link
    // leaves it set, and navigating to a WTLB / Blessed / Holy-Days entry never
    // clears it (their nav lacks the letter/bible clearSurprise), so a bare
    // `if (surpriseAnchor) return` would early-return on EVERY subsequent WTLB
    // nav — permanently killing scroll-reset AND scroll-restore there while
    // letters/chapters (which clear the anchor) work. Only honor it where it
    // actually drives the scroll.
    if (surpriseAnchor && (screen === 'bible-ch' || screen === 'matthew-ch')) return;

    const saved = activeTab && activeTab.scrollPositions && activeTab.scrollPositions[key];
    // Support both new { y, pct } shape and legacy plain number for backcompat
    const savedY = saved == null ? null :
    typeof saved === 'number' ? saved : typeof saved.y === 'number' ? saved.y : null;
    const target = typeof savedY === 'number' && savedY > 0 ? savedY : 0;
    // Land the saved position (or top). startRestore (module scope) handles the
    // PERF4 content-visibility lift + the cold-boot content-render retry — see
    // its definition. Returning it as this layout effect's cleanup cancels any
    // pending frames if a rapid re-nav supersedes the restore.
    return startRestore(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effect intent: restore-saved-scroll on nav-key change. activeTab derives from tabs[activeTabIdx]; activeTabIdx is already in deps so tab-switch correctly re-runs. surpriseAnchor is read as a guard (early-return when set) but should NOT trigger re-fire — only nav changes drive scroll restoration. updateActiveTab is useCallback([activeTabIdx]) — its identity only changes with activeTabIdx, which IS a dep, so the closure is never stale.
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, activeTabIdx]);

  // ── Return ─────────────────────────────────────────────────────────────
  return { flushScrollToActiveTab };
}
