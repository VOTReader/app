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

// ── CONTENT-ANCHOR capture / restore ───────────────────────────────────────
// Pixel offsets (and percentages) DRIFT when the page reflows: font-size (the
// Text-Size setting) and font-family (Modern/Classic) changes, a different
// translation, rotation, and content-visibility's ESTIMATED block heights all
// move where a given pixel/percent lands — and the content above your spot
// reflows by a different ratio than the content below it, so a proportion can't
// track it either. Anchoring to the actual content element at the top of the
// viewport — its data-hl-key, the SAME stable id the annotation engine uses —
// makes restore invariant to all of that: we put the same verse/paragraph back
// at the top, and any residual error is bounded by that ONE element instead of
// the whole page above it. y/pct stay as the fallback (screens with no
// data-hl-key, pre-anchor saved positions, or an element that no longer exists).

// The topmost reading-content element at/under the viewport top → { anchorKey,
// anchorOff }. anchorOff = px the viewport top sits below that element's top
// (sub-element precision; negative if the element starts just below the top,
// e.g. a study note occupies the very top). We BINARY-SEARCH the data-hl-key
// elements (verses / paragraphs — document-ordered, so vertically monotonic)
// for the first whose bottom is below the viewport top. elementFromPoint is NOT
// used: on the Matthew Study Bible the exact top pixel is often a study note or
// a sticky chapter-nav arrow (neither carries data-hl-key), so a point hit-test
// finds no anchor — the search finds the nearest verse regardless. Empty key on
// screens with no data-hl-key (Garden / Settings) → caller falls back to y/pct.
function captureAnchor(el) {
  if (!el) return { anchorKey: null, anchorOff: 0 };
  var cRect = el.getBoundingClientRect();
  if (!cRect.height) return { anchorKey: null, anchorOff: 0 };
  var list = el.querySelectorAll('[data-hl-key]');
  var n = list.length;
  if (!n) return { anchorKey: null, anchorOff: 0 };
  var top = cRect.top + 1;
  var lo = 0, hi = n - 1, found = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (list[mid].getBoundingClientRect().bottom > top) { found = mid; hi = mid - 1; }
    else { lo = mid + 1; }
  }
  if (found < 0) return { anchorKey: null, anchorOff: 0 }; // scrolled past the last one
  var anchor = list[found];
  return { anchorKey: anchor.getAttribute('data-hl-key'), anchorOff: Math.round(cRect.top - anchor.getBoundingClientRect().top) };
}

// Content-coordinate Y of an anchor element's top (distance from the top of the
// scrollable content), or null if it isn't in the DOM yet. Invariant of the
// current scrollTop because the rect-delta and scrollTop cancel.
function anchorContentTop(el, anchorKey) {
  if (!el || !anchorKey) return null;
  var anchor = el.querySelector('[data-hl-key="' + String(anchorKey).replace(/"/g, '\\"') + '"]');
  if (!anchor) return null;
  return (anchor.getBoundingClientRect().top - el.getBoundingClientRect().top) + el.scrollTop;
}

// Land a saved position on the current __scrollEl. Returns a cleanup fn.
// Accepts the full saved record { y, pct, anchorKey, anchorOff }, a legacy plain
// number, or null. PREFERS the content anchor; falls back to the saved pixel y.
//
// PERF4 × exact restore: .letter-para / .section-block are content-visibility:
// auto with PLACEHOLDER intrinsic heights until first render, so measuring
// against estimated geometry lands on the wrong content. While restoring a
// non-top position, body.scroll-restoring lifts content-visibility (app.css) so
// layout is REAL when we read the anchor's position and set scrollTop; the
// forced layout also memoizes contain-intrinsic-size, so re-engaging one frame
// later changes no geometry.
//
// COLD-BOOT RACE: on a fresh launch the restore runs before the chapter is
// ready in two ways — __scrollEl is null while the lazy-corpus loading view
// shows, and even once mounted the verses (and the anchor element) still have to
// render in. The effect runs once (deps are the nav keys), so we re-attempt
// across animation frames until the anchor element appears (or, for the pixel
// fallback, the container is tall enough), or a bounded deadline passes.
function startRestore(saved) {
  var legacyY = (saved == null) ? 0
    : (typeof saved === 'number' ? saved : (typeof saved.y === 'number' ? saved.y : 0));
  var anchorKey = (saved && typeof saved === 'object') ? (saved.anchorKey || null) : null;
  var anchorOff = (saved && typeof saved === 'object' && typeof saved.anchorOff === 'number') ? saved.anchorOff : 0;

  // Nothing meaningful to restore (top of page, no anchor) — top is top.
  if (!anchorKey && legacyY <= 0) {
    if (__scrollEl) __scrollEl.scrollTop = 0;
    return function () {};
  }
  document.body.classList.add('scroll-restoring');
  var raf = 0, raf2 = 0, tries = 0;
  var MAX_TRIES = 90; // ~1.5s @ 60fps — covers cold-boot corpus load + paint

  // Best target available THIS frame: the content anchor if its element is in
  // the DOM (precise), else the saved pixel y.
  function best() {
    var aTop = anchorContentTop(__scrollEl, anchorKey);
    if (aTop != null) return { y: Math.max(0, Math.round(aTop + anchorOff)), anchored: true };
    return { y: legacyY, anchored: false };
  }
  function settle() {
    raf = requestAnimationFrame(function () {
      if (__scrollEl) __scrollEl.scrollTop = best().y; // re-apply post-commit layout pass
      raf2 = requestAnimationFrame(function () { document.body.classList.remove('scroll-restoring'); });
    });
  }
  var land = function () {
    tries += 1;
    var deadline = tries >= MAX_TRIES;
    if (__scrollEl) {
      void __scrollEl.scrollHeight; // force real-geometry layout (cv lifted)
      var t = best();
      __scrollEl.scrollTop = t.y;
      // Ready when the anchor resolved (precise), OR — no anchor wanted/found —
      // the container is tall enough for the pixel fallback. While an anchor IS
      // wanted but its element hasn't rendered yet (cold boot), keep retrying.
      var tallEnough = (__scrollEl.scrollHeight - __scrollEl.clientHeight) >= t.y - 2;
      if (t.anchored || (!anchorKey && tallEnough) || deadline) { settle(); return; }
    } else if (deadline) {
      document.body.classList.remove('scroll-restoring');
      return;
    }
    raf = requestAnimationFrame(land);
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
  const liveScrollRef = React.useRef(/** @type {{key: string, y: number, pct: number, anchorKey: string|null, anchorOff: number} | null} */ (null));
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
    const a = captureAnchor(__scrollEl);
    updateActiveTab((t) => ({
      scrollPositions: { ...(t.scrollPositions || {}), [key]: { y: scrollTop, pct, anchorKey: a.anchorKey, anchorOff: a.anchorOff } }
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
        const a = captureAnchor(currentEl);
        liveScrollRef.current = { key: scrollKeyRef.current, y, pct: Math.max(0, Math.min(1, y / max)), anchorKey: a.anchorKey, anchorOff: a.anchorOff };
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
        scrollPositions: { ...(t.scrollPositions || {}), [prevKey]: { y: live.y, pct: live.pct, anchorKey: live.anchorKey, anchorOff: live.anchorOff } }
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
    // Hand the full saved record to startRestore — it prefers the content anchor
    // (robust to reflow / font-size / content-visibility), falls back to the
    // pixel y, and handles the legacy plain-number + null shapes. It also owns
    // the PERF4 content-visibility lift and the cold-boot retry; returning it as
    // this layout effect's cleanup cancels pending frames if a rapid re-nav
    // supersedes the restore.
    return startRestore(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effect intent: restore-saved-scroll on nav-key change. activeTab derives from tabs[activeTabIdx]; activeTabIdx is already in deps so tab-switch correctly re-runs. surpriseAnchor is read as a guard (early-return when set) but should NOT trigger re-fire — only nav changes drive scroll restoration. updateActiveTab is useCallback([activeTabIdx]) — its identity only changes with activeTabIdx, which IS a dep, so the closure is never stale.
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, activeTabIdx]);

  // ── Return ─────────────────────────────────────────────────────────────
  return { flushScrollToActiveTab };
}
