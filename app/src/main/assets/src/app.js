/* ═══════════════════════════════════════════════════════════════════════
   App — the composition root (Q2.7-1)
   ═══════════════════════════════════════════════════════════════════════
   This file is the root React component. It composes every screen,
   every sheet, every hook, every store into one orchestrator.

   Extracted from index.html in Q2.7-1 as a VERBATIM move. Every
   React.createElement(...) call stays as-is. JSX conversion is the
   next commit (Q2.7-2).

   Bundles into dist/bundle-d.js via ../ui/_entry-d.js. The bundle's
   esbuild IIFE wrapper ships as a classic <script>, not a module, so
   free-variable references (useState/useEffect/etc. from inline #1,
   BIBLE_BOOK_LIST + TabsContext + studyShortTitle from inline #3)
   resolve through the classic-script global lexical environment —
   exactly as they do for the ~80 other modules in bundle-d that read
   them today. No window.* shims required.

   The destructure below mirrors index.html inline #1 — kept here for
   clarity so this file reads as self-contained.
   ═══════════════════════════════════════════════════════════════════════ */
const { useState, useEffect, useCallback, useRef, useMemo } = React;

function App() {
  // screens: "home" | "scriptures-home" | "volumes-home" | "matthew-idx" | "matthew-ch" | "bible-idx" | "bible-ch" | "vot-index" | "vot-letter" | "search"
  var sharedViewProps, _navToChapter, _idxNav;

  /* ═══════════════════════════════════════════════════════════════════
     HOOK CALL-ORDER DAG (P6 decomposition) — 13 hooks, in call order.
     THIS COMMENT IS THE SINGLE SOURCE OF TRUTH for hook call order. If it
     ever disagrees with CLAUDE.md or any other doc, TRUST THIS COMMENT and
     fix the doc — never "correct" this block to match a stale doc.
     The number is call ORDER; the "←" list is the dependency. A hook need
     only follow the hooks named in its "←" list — two hooks with no "←"
     relationship are order-independent (e.g. 3 and 4 both depend only on
     useTabs, so they may be swapped). A few hooks ALSO carry an App-local
     constraint not expressible as a hook dep — flagged inline below.
        1. useSavedState          (no hook deps — reads vot-state once)
        2. useTabs                ← saved
        3. useSheetOrchestration  ← nav state via tabField (2)
        4. useFromLetterStack     ← tabField (2)
        5. useSettings            ← saved
        6. useHistory             ← settings.historyEnabled (5)
        7. useThumbnails          ← tabs/activeTab (2), settings (5)
        8. useScrollMemory        ← activeTab + updateActiveTab (2)
        9. useReadingDwell        ← settings.dwellMs (5), saved.activeReadKey
       10. useTabActions          ← tabState (2), cancelDwell (9), setTabThumbnails (7)
       11. usePersistedState      ← tabs (2), activeReadKey (9), settings (5)
       12. useNavigateToLink      ← closeLinkSidebar (3), pushFromLetter (4)
                                    + App-local: must follow setJournalEntryId.
       13. useAndroidBack         ← cancelDwell (9), fromLetterRef (4), + every
                                    go* nav helper + App-local: HARD-LAST —
                                    must follow goStudiesHome, defined deep
                                    in App().
     The other 2 of the 15 P6 hooks are not in this sequence: useMarkAsRead
     is called by the 4 reading views; useRefMirror is called inline ~15×.
     ═══════════════════════════════════════════════════════════════════ */
  /* useSavedState + _validateTabState → extracted to src/hooks/use-saved-state.js (P6a) */
  const saved = useSavedState();

  /* ═══════════════════════════════════════════════════════════════
     TAB-BACKED READING STATE — the per-tab state machine + tabField
     accessor + CRITICAL INVARIANT 1 (cached stable per-key setters) +
     the stability probe → src/hooks/use-tabs.js (P6k Commit A). The
     tab open/close/switch OPERATIONS → src/hooks/use-tab-actions.js
     (P6k Commit B), called further down once its cross-hook deps
     (cancelDwell, setTabThumbnails) exist. `tabState` is the whole
     useTabs return — useTabActions consumes setTabs/setActiveTabIdx
     from it, so App() does not destructure those loose.
  ═══════════════════════════════════════════════════════════════ */
  const tabState = useTabs({ saved });
  const { tabField, activeTab, tabs, activeTabIdx, updateActiveTab } = tabState;

  const [screen, setScreen] = tabField('screen');
  const [bookId, setBookId] = tabField('bookId');
  const [chapterNum, setChapterNum] = tabField('chapterNum');
  const [letterId, setLetterId] = tabField('letterId');
  const [studyId, setStudyId] = tabField('studyId');
  const [studyChapterId, setStudyChapterId] = tabField('studyChapterId');
  const [fromStudies, setFromStudies] = tabField('fromStudies');
  const [mode, setMode] = tabField('mode');
  const [showStudy, setShowStudy] = tabField('showStudy');
  const [genreId, setGenreId] = tabField('genreId');
  const [surpriseAnchor, setSurpriseAnchor] = tabField('surpriseAnchor');

  // App-global
  const [theme, setTheme] = useState(saved.theme || "dark");
  // Increments each time an alt translation finishes loading — forces a
  // re-render so translateVerse() starts returning the loaded text.
  const [translationTick, setTranslationTick] = useState(0);
  // Increments when bible-studies.js finishes loading — forces a re-render so
  // STUDIES = _studies() picks up the new data. studiesLoading tracks the
  // in-flight state so StudiesHome can show a brief loading indicator.
  const [studiesTick, setStudiesTick] = useState(0);
  const [studiesLoading, setStudiesLoading] = useState(false);

  /* ═══════════════════════════════════════════════════════════════
     HIGHLIGHT & LINK STATE
     hlTick forces re-renders when highlights/links are mutated.
     Overlay state tracks which sheets/sidebars are open.
  ═══════════════════════════════════════════════════════════════ */
  const [hlTick, setHlTick] = useState(0);
  /* useSheetOrchestration — modal/sheet/overlay open-state + the
     window.__open* bridges + auto-dismiss-on-navigation.
     Extracted to src/hooks/use-sheet-orchestration.js (P6h). */
  const {
    annChip, setAnnChip,
    linkSidebarKey, openLinkSidebar, closeLinkSidebar,
    linkPickerSource, openLinkPicker, openLinkPickerForTarget, closeLinkPicker,
    linkRefineRequest, setLinkRefineRequest,
    lastLinkCreated, setLastLinkCreated,
    linkPickerMode, linkPickerOnPickRef,
    noteSheetTarget, setNoteSheetTarget, openNoteSheet, closeNoteSheet,
    notebookPickerTarget, setNotebookPickerTarget,
    multiNotePayload, setMultiNotePayload,
    bookmarkPopoverPayload, setBookmarkPopoverPayload,
    bookmarkCreatePending, setBookmarkCreatePending,
    inboundJournalPayload, setInboundJournalPayload,
  } = useSheetOrchestration({
    screen, letterId, bookId, chapterNum, studyId, studyChapterId,
    setHlTick,
  });
  /* sheet slots → src/hooks/use-sheet-orchestration.js (P6h) */

  /* navigateToLink — the cross-app deep-linking router (the _navToLinkRef
     three-part deferred-body pattern) → src/hooks/use-navigate-to-link.js
     (P6j). The hook is called further down, after journalEntryId —
     setJournalEntryId is one of its params. navigateToLink has no consumer
     before that call site. */

  /* bridge effects (__openLinkSidebar, __showAnnChip, __showMultiNote,
     __openBookmarkPopover) → src/hooks/use-sheet-orchestration.js (P6h) */
  // Lightweight escape hatch for inline components (e.g. the chapter
  // bookmark button in NavButtons) to trigger a hlTick bump without prop-
  // drilling. Used after store writes that aren't otherwise tied to React
  // state — so the apply-DOM effect re-runs and inline icons refresh.
  useEffect(() => { window.__bumpHlTick = () => setHlTick(t => t + 1); return () => { delete window.__bumpHlTick; }; }, []);
  // Track soft-keyboard height via the visualViewport API and expose it
  // to CSS as `--keyboard-height`. Overlays that own inputs/textareas
  // (BookmarkCreateSheet, LinkPicker, NoteSheet) use this variable as
  // padding-bottom so the sheet lifts above the keyboard when it opens
  // and settles back down when it closes — works the same on any
  // Android version, any keyboard app, and PWA-mode browsers. The
  // Kotlin-side `--inset-bottom` covers system bars / camera cutout;
  // this covers IME specifically and is independent of WebView quirks.
  useEffect(() => {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      // Difference between layout viewport and visual viewport ≈ keyboard.
      // Some browsers (notably older Android WebViews) report a small
      // residual diff (~1-3px) even when the keyboard is closed — clamp
      // anything under 80px to 0 so we don't shift overlays for noise.
      const diff = Math.max(0, window.innerHeight - vv.height);
      const kh = diff > 80 ? diff : 0;
      root.style.setProperty('--keyboard-height', kh + 'px');
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.setProperty('--keyboard-height', '0px');
    };
  }, []);
  /* __bookmarkCreate, inboundJournalPayload, __openJournalInbound,
     __bookmarkEdit, auto-dismiss effect → src/hooks/use-sheet-orchestration.js (P6h) */
  useEffect(() => {
    const t = setTimeout(() => {
      // Each annotation layer is isolated: this pipeline mutates the DOM
      // imperatively AFTER React renders, so rapid prev/next on a heavily
      // annotated page can leave stale/detached nodes mid-pass. A throw
      // here would propagate to React and trip the ErrorBoundary, forcing
      // a full reload. Degrade gracefully instead — a missed icon recovers
      // on the next hlTick; a crash does not.
      try { applyDOMHighlights(); } catch (e) { console.error('applyDOMHighlights failed', e); }
      try { applyDOMLinks(); } catch (e) { console.error('applyDOMLinks failed', e); }
      try { applyDOMBookmarks(); } catch (e) { console.error('applyDOMBookmarks failed', e); }
      try { applyNoteIcons(); } catch (e) { console.error('applyNoteIcons failed', e); }
      try { applyActiveNoteState(); } catch (e) { console.error('applyActiveNoteState failed', e); }
      // If we navigated here from the Notes index by tapping a row, the
      // groupId of the note to open was stashed on the window. Consume it
      // and open the NoteSheet now that the source page is rendered.
      if (window.__pendingOpenNote) {
        const gid = window.__pendingOpenNote;
        window.__pendingOpenNote = null;
        // Defer one more tick so DOM marks are in place for the active-state
        setTimeout(() => {
          if (NoteStore.get(gid)) setNoteSheetTarget({ groupId: gid, startInEditMode: false });
        }, 60);
      }
      // Opened from Library (bookmark/note/highlight/underline) → jump
      // straight to that mark's block. Instant (no smooth behavior) so the
      // page opens already at the position rather than animating there.
      if (window.__pendingScrollHlKey) {
        const sk = window.__pendingScrollHlKey;
        window.__pendingScrollHlKey = null;
        setTimeout(() => {
          try {
            const el = document.querySelector('[data-hl-key="' + sk.replace(/"/g, '\\"') + '"]');
            if (el) el.scrollIntoView({ block: 'center' });
          } catch (e) {}
        }, 70);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [hlTick, screen, letterId]);
  // Toggle .is-active on every mark/icon belonging to the open note's group.
  // Default state: notes show only the trailing 📝 icon (no tint, no ribbon).
  // When NoteSheet opens, the anchored text lights up; closing reverts.
  useEffect(() => {
    window.__activeNoteGroup = noteSheetTarget ? noteSheetTarget.groupId : null;
    applyActiveNoteState();
  }, [noteSheetTarget, hlTick]);

  /* TAB MANAGEMENT — openNewTab / switchToTab / closeTab / closeOtherTabs
     / closeTabsToTheRight / closeAllTabs / deduplicateTabs + the 4 tab-UI
     state slots (tabActionIdx, disableTabsPromptOpen, clearAllStage,
     lastTabCloseStrikes) → src/hooks/use-tab-actions.js (P6k Commit B).
     The useTabActions() call is further down, after useReadingDwell —
     it needs cancelDwell + setTabThumbnails. tabsOverviewOpen stays here
     (useThumbnails consumes it as a param, before useTabActions runs). */
  // Tabs Overview is an app-level overlay, not a per-tab screen.
  // That way, switching tabs unmounts the overview cleanly and the
  // individual tabs never carry a stale "tabs" screen.
  const [tabsOverviewOpen, setTabsOverviewOpen] = useState(false);
  /* tabActionIdx / disableTabsPromptOpen / clearAllStage / lastTabCloseStrikes
     → src/hooks/use-tab-actions.js (P6k Commit B) */
  /* Thumbnail state + IDB load + GC → extracted to src/hooks/use-thumbnails.js (P6d) */
  // (Effect closing overview when tabs are disabled lives further down —
  // it needs `settings`, which is declared after this block.)
  const [lastReadChapters, setLastReadChapters] = useState(saved.lastReadChapters || {});
  const [lastReadLetterMap, setLastReadLetterMap] = useState(() => {
    const map = { ...(saved.lastReadLetterMap || {}) };
    if (saved.lastReadLetter && !map.two) map.two = saved.lastReadLetter;
    if (saved.lastReadLetterV1 && !map.one) map.one = saved.lastReadLetterV1;
    return map;
  });
  // Single global "you are here" dot — tracks the ONE most recently read book/volume
  /* Dwell-timer state + commitDwellNow → src/hooks/use-reading-dwell.js (P6f) */
  // Prophecy card expand/collapse state — persisted to localStorage
  // Key format: "chapterId:blockIndex:cardType" → boolean
  const prophecyCardStatesRef = React.useRef(() => {
    try {return JSON.parse(localStorage.getItem("vot-prophecy-cards") || "{}");} catch (e) {return {};}
  });
  // Lazy-init: if it's still the initializer function, call it
  if (typeof prophecyCardStatesRef.current === "function") prophecyCardStatesRef.current = prophecyCardStatesRef.current();
  const saveProphecyCardStates = useCallback(() => {
    try {localStorage.setItem("vot-prophecy-cards", JSON.stringify(prophecyCardStatesRef.current));} catch (e) {}
  }, []);
  /* cancelDwell + scheduleDwell + pauseDwell + setActiveReadKey + __onDwellCommit effect → src/hooks/use-reading-dwell.js (P6f) */
  const setLastReadForVol = (volId, id) => {
    setLastReadLetterMap((prev) => ({ ...prev, [volId]: id }));
  };
  const goToLetterFromMatthew = (vol, letter, excerpt) => {
    const dest = resolveVotLetter(vol, letter);
    if (!dest) return; // defensive: unknown letter → no-op (no blackscreen)
    pushFromLetter({
      sourceScreen: "matthew-ch",
      sourceBookId: "matthew",
      sourceChapterNum: chapterNum,
      sourceLetterId: null,
      sourceStudyId: null,
      sourceStudyChapterId: null,
      sourceLetterTitle: `Matthew ${chapterNum}`,
      sourceVolumeLabel: null
    });
    if (excerpt) {
      window.__pendingHighlight = { excerpt: excerpt, letterId: dest.id };
    } else {
      window.__pendingHighlight = null;
    }
    setFromMatthewCh({ chapterNum });
    if (dest.isStudy) {
      setStudyId(dest.studyId);
      setStudyChapterId(dest.studyChapterId);
      setActiveReadKey(dest.activeReadKey);
    } else {
      setLetterId(dest.id);
      setActiveReadKey("vol:" + dest.volKey, () => setLastReadForVol(dest.volKey, dest.id));
    }
    setScreen(dest.screen);
  };

  /* In-app letter tap-through from a footnote (link / seeAlso).
     Records the source letter + screen so Android back returns here.
     Sets window.__pendingHighlight so the destination LetterView, on its
     next mount/letter-change, wraps the excerpt with <mark.letter-highlight>. */
  /* useFromLetterStack — the multi-level tap-through back-stack:
     fromLetterStack (tabField) + pushFromLetter + tapThroughBack + the
     destSnapshot prune effect + the backHint computation + the
     fromLetterRef mirror. Extracted to src/hooks/use-from-letter-stack.js
     (P6i). setFromLetterStack is returned because __goHome and
     handleAndroidBack (both still in App()) mutate the stack directly. */
  const {
    setFromLetterStack, pushFromLetter,
    tapThroughBack, fromLetterRef, backHint,
  } = useFromLetterStack({
    tabField,
    screen, bookId, chapterNum, letterId, studyId, studyChapterId,
    setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId,
  });

  const openInAppLetter = (target, meta) => {
    if (!target || !target.letterTitle) return;
    const dest = resolveVotLetter(target.collection, target.letterTitle);
    if (!dest) return;
    // Push source onto the back-nav stack so multi-level tap-throughs
    // unwind correctly (A → B → C → back → B → back → A). Source title +
    // volume label (from meta) populate the back-hint pill on the dest.
    //
    // Also compute a destSnapshot — used by the prune effect + _destMatches
    // to hide the back-pill the moment the user navigates away from the
    // destination (next/prev chapter or letter, different book, etc.).
    // ALL back pills in the app are now single-shot per user direction:
    // the pill is a contextual breadcrumb for THIS landing, not a
    // permanent fixture that survives onward navigation.
    let destSnapshot = null;
    if (dest.isStudy) {
      destSnapshot = { screen: 'bible-study-chapter', bookId: null, chapterNum: null, letterId: null, studyId: dest.studyId, studyChapterId: dest.studyChapterId };
    } else {
      destSnapshot = { screen: dest.screen, bookId: null, chapterNum: null, letterId: dest.id, studyId: null, studyChapterId: null };
    }
    pushFromLetter({
      sourceScreen: screen, sourceLetterId: letterId,
      sourceBookId: bookId, sourceChapterNum: chapterNum,
      sourceStudyId: studyId, sourceStudyChapterId: studyChapterId,
      sourceLetterTitle: meta && meta.sourceLetterTitle ? meta.sourceLetterTitle : null,
      sourceVolumeLabel: meta && meta.sourceVolumeLabel ? meta.sourceVolumeLabel : null,
      destSnapshot: destSnapshot
    });
    if (target.excerpt) {
      window.__pendingHighlight = { excerpt: target.excerpt, letterId: dest.id };
    } else {
      window.__pendingHighlight = null;
    }
    if (dest.isStudy) {
      setStudyId(dest.studyId);
      setStudyChapterId(dest.studyChapterId);
      setActiveReadKey(dest.activeReadKey);
    } else {
      setLetterId(dest.id);
      setActiveReadKey("vol:" + dest.volKey, () => setLastReadForVol(dest.volKey, dest.id));
    }
    setScreen(dest.screen);
  };
  /* navigateToLink deferred body → src/hooks/use-navigate-to-link.js (P6j) */
  const [readItems, setReadItems] = useState(saved.readItems || {});
  const [gardenPage, setGardenPage] = tabField('gardenPage');
  const [gardenWarningOpen, setGardenWarningOpen] = useState(false);
  /* useSettings — settings object + mutators + body-class/AndroidBridge
     effect. Extracted to src/hooks/use-settings.js (P6g). */
  const { settings, setSettings, toggleSetting, updateSetting } = useSettings({
    savedSettings: saved.settings,
    theme,
  });
  // Close tabs overview when tabs get disabled (relies on `settings`)
  useEffect(() => {
    if (!settings.tabsEnabled && tabsOverviewOpen) setTabsOverviewOpen(false);
  }, [settings.tabsEnabled, tabsOverviewOpen]);

  // Lazy-load the active translation. NKJV is always available (baked into
  // BOOKS.chapters[].sections[].verses[].text); all others are ~4.5MB JS
  // files loaded on demand.
  useEffect(() => {
    const code = settings.translation;
    if (!code || code === 'nkjv') return;
    loadTranslation(code).then(() => setTranslationTick((v) => v + 1));
  }, [settings.translation]);

  // Lazy-load bible-studies.js the first time the user opens any Studies screen.
  // Covers: Studies home, a study index, or a direct tap-through to a study chapter.
  useEffect(() => {
    const needsStudies = screen === 'studies-home' || screen === 'bible-study-index' || screen === 'bible-study-chapter';
    if (!needsStudies) return;
    if (typeof BIBLE_STUDIES !== 'undefined') return; // already loaded
    setStudiesLoading(true);
    loadBibleStudies().then(() => {
      setStudiesLoading(false);
      setStudiesTick((v) => v + 1);
    });
  }, [screen]);
  // Reset Clear-all confirmation stage whenever overview opens/closes
  useEffect(() => {setClearAllStage(0);}, [tabsOverviewOpen]);

  // Per-tab focus-mode overrides. Each tab has independent state.
  const [titleFocusHidden, setTitleFocusHidden] = tabField('titleFocusHidden');
  const [headingsFocusHidden, setHeadingsFocusHidden] = tabField('headingsFocusHidden');
  const [showWelcome, setShowWelcome] = useState(() => {
    try {return !localStorage.getItem('vot-welcomed');} catch (e) {return true;}
  });
  const [isOnline, setIsOnline] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch('https://www.thevolumesoftruth.com/favicon.ico', { mode: 'no-cors', cache: 'no-store' }).
      then(() => {if (!cancelled) setIsOnline(true);}).
      catch(() => {if (!cancelled) setIsOnline(false);});
    };
    check();
    return () => {cancelled = true;};
  }, [showWelcome]);
  const dismissWelcome = () => {
    try {localStorage.setItem('vot-welcomed', '1');} catch (e) {}
    setShowWelcome(false);
    // First-time users see the About intro right after the splash. After
    // CONTINUE marks `vot-about-seen`, this path becomes a no-op and the
    // splash just dismisses straight to home on subsequent uses.
    try {
      if (!localStorage.getItem('vot-about-seen')) {
        setNavOrigin({ screen: 'home', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null });
        setScreen('about');
      }
    } catch (e) {}
  };
  // Tab-local search/nav breadcrumbs (each tab has its own search context)
  const [searchQuery, setSearchQuery] = tabField('searchQuery');
  const [fromSearch, setFromSearch] = tabField('fromSearch');
  const [fromMatthewCh, setFromMatthewCh] = tabField('fromMatthewCh');
  const [fromWtlb, setFromWtlb] = tabField('fromWtlb');
  const [searchOrigin, setSearchOrigin] = tabField('searchOrigin');
  const [searchScope, setSearchScope] = tabField('searchScope');
  const [searchContext, setSearchContext] = tabField('searchContext');
  const [navOrigin, setNavOrigin] = tabField('navOrigin');

  // App-global: read history shared across all tabs.
  // State + mutators extracted to useHistory(); auto-track effect stays
  // below (depends on tab-local nav state).
  const { readHistory, addToHistory, clearHistory, pruneHistoryDay } = useHistory(settings.historyEnabled);
  /* useThumbnails — tab card thumbnail capture + IDB persistence + GC.
     Extracted to src/hooks/use-thumbnails.js (P6d). */
  const { tabThumbnails, setTabThumbnails, captureActiveTabThumbnail } = useThumbnails({
    tabs, activeTabIdx, activeTab,
    tabsEnabled: settings.tabsEnabled,
    tabsOverviewOpen,
  });
  const navOriginRef = useRefMirror(navOrigin);
  /* tabsOverviewOpenRef → created inside useAndroidBack (P6l) */

  /* useScrollMemory — per-tab/per-screen scroll position capture +
     restore. Extracted to src/hooks/use-scroll-memory.js (P6e). */
  const { flushScrollToActiveTab } = useScrollMemory({
    screen, bookId, chapterNum, letterId, studyId, studyChapterId,
    activeTab, activeTabIdx,
    updateActiveTab,
    surpriseAnchor,
    tabsOverviewOpen,
  });

  /* useReadingDwell — dwell-timer mark-as-read (commits a read only
     after dwellMs of visible reading). Extracted to
     src/hooks/use-reading-dwell.js (P6f). */
  const { activeReadKey, setActiveReadKey, cancelDwell } = useReadingDwell({
    dwellMs: settings.dwellMs,
    initialActiveReadKey: saved.activeReadKey || null,
  });

  /* useTabActions — tab open/close/switch operations (P6k Commit B).
     Called here, after useReadingDwell + useThumbnails, so cancelDwell
     and setTabThumbnails are in scope as plain params. See
     src/hooks/use-tab-actions.js. */
  const {
    openNewTab, switchToTab, closeTab, closeOtherTabs,
    closeTabsToTheRight, closeAllTabs, deduplicateTabs,
    tabActionIdx, setTabActionIdx,
    disableTabsPromptOpen, setDisableTabsPromptOpen,
    clearAllStage, setClearAllStage, lastTabCloseStrikes, MAX_TABS,
  } = useTabActions({ tabState, cancelDwell, setTabThumbnails });

  /* vot-state persistence sink → src/hooks/use-persisted-state.js (P6k+1).
     8 params: tabs/activeTabIdx (useTabs), activeReadKey (useReadingDwell),
     settings (useSettings) are hook returns; theme/lastReadChapters/
     lastReadLetterMap/readItems are still App-local useState. */
  usePersistedState({
    tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap,
    activeReadKey, settings, readItems,
  });

  const ALL_BOOKS = { matthew: MATTHEW, ...BOOKS };
  window.__ALL_BOOKS = ALL_BOOKS; // expose for parseScriptureRef()
  const book = bookId ? ALL_BOOKS[bookId] : null;
  const chapter = book && chapterNum != null ? book.chapters.find((c) => c.num === chapterNum) : null;
  function _findLetter(volKey) {
    if (!letterId) return null;
    var col = COL_BY_KEY.get(volKey);
    var arr = colLetterArr(col), pref = colPreface(col);
    return arr.find(function(l) { return l.id === letterId; }) || (pref && pref.id === letterId ? pref : null);
  }
  const letter = _findLetter('two');
  const letterV1 = _findLetter('one');
  const letterV3 = _findLetter('three');
  const letterV4 = _findLetter('four');
  const letterV5 = _findLetter('five');
  const letterV6 = _findLetter('six');
  const letterV7 = _findLetter('seven');
  const letterTimothy = _findLetter('timothy');
  const letterFlock = _findLetter('flock');
  const letterRebuke = _findLetter('rebuke');
  const wtlb1Entry = _findLetter('wtlb1');
  const wtlb2Entry = _findLetter('wtlb2');
  const blessedEntry = _findLetter('blessed');
  const hdEntry = _findLetter('holydays');
  const hmEntry = _findLetter('hm');

  /* ── Core navigation ── */
  const goHome = () => {setFromSearch(false);setFromWtlb(null);setFromLetterStack([]);window.__pendingHighlight = null;window.__pendingScrollHlKey = null;setScreen("home");setBookId(null);setChapterNum(null);};
  const goScripturesHome = () => {setScreen("scriptures-home");setBookId(null);setChapterNum(null);setGenreId(null);};
  const goScriptureGenre = (gid) => {setGenreId(gid);setScreen("scripture-genre");};
  const goVolumesHome = () => {setScreen("volumes-home");};
  const goSettings = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("settings");};
  const goHistory = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("history");};
  const goAbout = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("about");};
  const goLibrary = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("library");};
  // ── Journal nav helpers ──
  const [journalEntryId, setJournalEntryId] = useState(null);

  /* useNavigateToLink — the cross-app deep-linking router. Placed here
     because setJournalEntryId (just above) is one of its params; its
     returned navigateToLink has no consumer before this point. P6j. */
  const { navigateToLink } = useNavigateToLink({
    closeLinkSidebar, pushFromLetter,
    screen, bookId, chapterNum, letterId, studyId, studyChapterId,
    setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId,
    setSurpriseAnchor, setJournalEntryId,
  });

  const goJournalHub = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("journal-home");};
  const goJournalViewer = (eid) => {if (eid) {setJournalEntryId(eid);setScreen("journal-viewer");}};
  const goJournalEditor = (eid) => {if (eid) {setJournalEntryId(eid);setScreen("journal-editor");}};
  const createAndEditJournal = () => {
    if (typeof JournalStore === 'undefined') return;
    const e = JournalStore.add();
    if (typeof JournalStatsStore !== 'undefined') {
      const newMilestones = JournalStatsStore.recordNewEntry(e.created);
      if (newMilestones && newMilestones.length) {
        newMilestones.forEach(m => jrnShowMilestoneToast(m));
      }
    }
    setHlTick(t => t + 1);
    setJournalEntryId(e.id);
    setScreen("journal-editor");
  };
  const goNotesIndex = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("notes-index");};
  const goLinksIndex = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("links-index");};
  const goBookmarksIndex = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("bookmarks-index");};
  const goHighlightsIndex = () => {setNavOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });setScreen("highlights-index");};
  /* captureActiveTabThumbnail + scroll-stop + aspect-ratio + after-nav effects
     → extracted to src/hooks/use-thumbnails.js (P6d) */

  // Tabs overview — overlay; back closes it without touching per-tab screen.
  const goTabs = () => {
    if (!settings.tabsEnabled) return;
    flushScrollToActiveTab(); // capture current scroll before overlay mounts
    captureActiveTabThumbnail(); // grab visual of current screen for this tab's card
    setTabsOverviewOpen(true);
  };
  const goNavOrigin = () => {
    const o = navOriginRef.current;
    setNavOrigin(null);
    if (o) {setScreen(o.screen);if (o.bookId !== undefined) setBookId(o.bookId);if (o.chapterNum !== undefined) setChapterNum(o.chapterNum);if (o.letterId !== undefined) setLetterId(o.letterId);if (o.studyId !== undefined) setStudyId(o.studyId);if (o.studyChapterId !== undefined) setStudyChapterId(o.studyChapterId);} else
    goHome();
  };
  const goSearch = () => {
    setSearchOrigin({ screen, bookId, chapterNum, letterId });
    // Compute the reading-position context so SearchScreen can offer an
    // optional "In {Book/Volume}" scope chip. null = opened outside a
    // reading screen (home/indexes/settings) → no chip shown.
    // searchScope always starts null (global); user taps chip to apply.
    let ctx = null;
    if (screen === 'matthew-ch') {
      ctx = { kind: 'book', bookId: 'matthew', label: 'Matthew' };
    } else if (screen === 'bible-ch' && bookId) {
      const bk = BOOKS[bookId];
      ctx = { kind: 'book', bookId, label: bk ? bk.title : bookId };
    } else {
      const _scCol = COL_BY_LETTER_SC.get(screen);
      if (_scCol) ctx = { kind: 'volume', volumeId: _scCol.searchVolId, label: _scCol.label };
    }
    setSearchContext(ctx);
    setSearchScope(null);
    // If a pending query was stashed by the SelectionToolbar's Search action,
    // pre-fill the search input.
    if (window.__pendingSearchQuery) {
      setSearchQuery(window.__pendingSearchQuery);
      window.__pendingSearchQuery = null;
    }
    setScreen("search");
  };

  // Expose goSearch globally so SelectionToolbar's Search action can route here
  useEffect(() => {
    window.__goSearch = goSearch;
    return () => { window.__goSearch = null; };
  });

  /* addToHistory · clearHistory · pruneHistoryDay → extracted to src/hooks/use-history.js (P6c) */
  const goSearchOrigin = () => {
    const o = searchOriginRef.current;
    if (o) {setSearchOrigin(null);setScreen(o.screen);if (o.bookId !== undefined) setBookId(o.bookId);if (o.chapterNum !== undefined) setChapterNum(o.chapterNum);if (o.letterId !== undefined) setLetterId(o.letterId);} else
    goHome();
  };
  /* toggleSetting + updateSetting → src/hooks/use-settings.js (P6g) */

  /* ── Mark as Read helpers ──
     Key format: "versionId:bookOrVolumeId:chapterOrLetterId"
     Version is hardcoded as "v1" for now; future versions get their own keys.
     markAsRead setting = false → we never ADD new marks, but existing ones are kept.
  ── */
  const VERSION_ID = "v1";
  const getReadKey = (bid, cid) => `${VERSION_ID}:${bid}:${cid}`;
  const isRead = (bid, cid) => !!readItems[getReadKey(bid, cid)];
  const markRead = (bid, cid) => {
    if (!settings.markAsRead) return;
    const key = getReadKey(bid, cid);
    if (!readItems[key]) setReadItems((prev) => ({ ...prev, [key]: true }));
  };
  const unmarkRead = (bid, cid) => {
    const key = getReadKey(bid, cid);
    setReadItems((prev) => {const next = { ...prev };delete next[key];return next;});
  };
  const clearAllProgress = () => setReadItems({});

  /* ── Go to last-read position (global reading dot) ── */
  const goToLastRead = () => {
    if (!activeReadKey) return;
    if (activeReadKey.startsWith("vol:")) {
      const volKey = activeReadKey.slice(4);
      const col = COL_BY_KEY.get(volKey);
      const lid = lastReadLetterMap[volKey] || null;
      if (lid && col) {setLetterId(lid);setScreen(col.letterScreen);}
    } else if (activeReadKey.startsWith("bible-study-")) {
      // Resume inside a Bible Letter Study
      const slug = activeReadKey.slice("bible-study-".length);
      const chId = lastReadChapters[activeReadKey];
      const study = getStudyById(slug);
      if (study && chId) {
        selectStudyChapter(slug, chId);
      } else if (study) {
        selectStudy(slug);
      }
    } else {
      const ch = lastReadChapters[activeReadKey];
      if (ch) {setBookId(activeReadKey);setChapterNum(ch);setScreen(activeReadKey === 'matthew' ? 'matthew-ch' : 'bible-ch');}
    }
  };

  const goColIdx = (volKey) => { const c = COL_BY_KEY.get(volKey); if (c && c.indexScreen) setScreen(c.indexScreen); };

  /* ── Category → sub-section routing ── */
  const handleScriptureSelect = (id, clearGenre) => {
    if (clearGenre) setGenreId(null);
    if (id === "matthew") {setBookId("matthew");setChapterNum(null);setScreen("matthew-idx");} else
    if (BOOKS[id]) {setBookId(id);if (BOOKS[id].chapters.length === 1) {setChapterNum(1);setScreen("bible-ch");} else {setChapterNum(null);setScreen("bible-idx");}}
  };
  const handleVolumeSelect = (id) => {
    const col = COL_BY_CARD.get(id);
    if (col && col.indexScreen) { setScreen(col.indexScreen); return; }
    if (id === "garden") {
      let acked = false;
      try {acked = !!localStorage.getItem('vot-garden-warning-acked');} catch (e) {}
      if (acked) setScreen("garden-view");else
      setGardenWarningOpen(true);
    }
  };


  // Derive search-volume map from COLLECTIONS registry
  const srchVolLookup = (searchVolId) => {
    const col = COL_BY_SEARCH_ID.get(searchVolId);
    if (!col) return null;
    return { screen: col.letterScreen, lastReadFn: (id) => setLastReadForVol(col.volKey, id), activeKey: 'vol:' + col.volKey };
  };
  // Compat alias used by handleSearchSelect and handleSearchCommand
  const SRCH_VOL_MAP = new Proxy({}, { get: (_, key) => srchVolLookup(key) });

  const srchResolveLetterId = (volumeId, letterNum, letterId) => {
    if (letterId) return letterId;
    if (letterNum == null) return null;
    const col = COL_BY_SEARCH_ID.get(volumeId);
    if (!col) return null;
    const arr = colLetterArr(col);
    for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].num === letterNum) return arr[i].id;
    const pref = colPreface(col);
    if (pref && (letterNum === 0 || arr.length === 0)) return pref.id;
    return null;
  };

  const handleSearchSelect = (entry) => {
    setFromSearch(true);
    // Direct parsed reference (from __direct entries)
    if (entry && entry.__direct && entry.ref) {
      const r = entry.ref;
      // Scriptures corpus → plain Matthew (bible-ch). Volumes/All → study.
      const useStudyMatthew = entry.__corpus !== 'scriptures';
      if (r.kind === 'ref-bible' || r.kind === 'named-passage') {
        const matthewHit = r.bookId === 'matthew' || r.bookId === 'matthew-plain';
        const effectiveBookId = matthewHit ?
        useStudyMatthew ? 'matthew' : 'matthew-plain' :
        r.bookId;
        setBookId(effectiveBookId);
        setChapterNum(r.chapter);
        if (r.verseStart) {
          const vs = [];
          const vEnd = r.verseEnd || r.verseStart;
          for (let v = r.verseStart; v <= vEnd; v++) vs.push(v);
          setSurpriseAnchor({ type: 'verse', verses: vs });
        } else {
          setSurpriseAnchor(null);
        }
        setScreen(effectiveBookId === 'matthew' ? 'matthew-ch' : 'bible-ch');
        return;
      }
      if (r.kind === 'ref-letter') {
        const vm = SRCH_VOL_MAP[r.volumeId];
        if (!vm) return;
        const lid = srchResolveLetterId(r.volumeId, r.letterNum, r.letterId);
        if (!lid) return;
        setLetterId(lid);
        if (vm.activeKey) setActiveReadKey(vm.activeKey, () => vm.lastReadFn(lid));
        else vm.lastReadFn(lid);
        setScreen(vm.screen);
        return;
      }
      if (r.kind === 'ref-book') {
        const matthewHit = r.bookId === 'matthew' || r.bookId === 'matthew-plain';
        const effectiveBookId = matthewHit ?
        useStudyMatthew ? 'matthew' : 'matthew-plain' :
        r.bookId;
        setBookId(effectiveBookId);
        setChapterNum(null);
        setScreen(effectiveBookId === 'matthew' ? 'matthew-idx' : 'bible-idx');
        return;
      }
      return;
    }
    // Result doc from Orama
    const doc = entry && entry.doc;
    if (!doc) return;
    const k = doc.kind;
    if (k === 'verse' || k === 'chapter-title' || k === 'heading' || k === 'study-note' || k === 'cross-ref') {
      // doc.bookId is 'matthew' only in the Volumes engine (Study Bible);
      // Scriptures engine emits 'matthew-plain'. Route accordingly.
      setBookId(doc.bookId);
      setChapterNum(doc.chapterNum);
      if (doc.verseNum) {
        setSurpriseAnchor({ type: 'verse', verses: [doc.verseNum] });
      } else {
        setSurpriseAnchor(null);
      }
      setScreen(doc.bookId === 'matthew' ? 'matthew-ch' : 'bible-ch');
      return;
    }
    if (k === 'letter' || k === 'letter-title' || k === 'footnote' || k === 'wtlb' || k === 'wtlb-title' || k === 'blessed' || k === 'blessed-title' || k === 'holy-day' || k === 'holy-day-title') {
      const vm = SRCH_VOL_MAP[doc.volumeId];
      if (!vm || !doc.letterId) return;
      setLetterId(doc.letterId);
      if (vm.activeKey) setActiveReadKey(vm.activeKey, () => vm.lastReadFn(doc.letterId));
      else vm.lastReadFn(doc.letterId);
      setScreen(vm.screen);
      return;
    }
    if (k === 'bible-study') {
      // Open the study at the given chapter
      setStudyId(doc.letterId || null);
      setStudyChapterId(doc.chapterNum || null);
      setScreen('bible-study-chapter');
      return;
    }
  };

  // Handler for command-kind parses (dispatched from SearchScreen)
  const handleSearchCommand = (action) => {
    if (action === 'home') {setScreen('home');return;}
    if (action === 'settings') {goSettings && goSettings();return;}
    if (action === 'scriptures') {setScreen('scriptures-home');return;}
    if (action === 'volumes') {setScreen('volumes-home');return;}
    if (action === 'clear-query') {setSearchQuery('');return;}
    if (action === 'rebuild-index') {
      if (window.VotSearch) window.VotSearch.rebuild().catch(() => {});
      return;
    }
    if (action === 'random') {
      // trigger random scripture/letter — uses existing Surprise Me flow if available
      if (typeof surpriseMe === 'function') surpriseMe();
      return;
    }
  };

  /* screenRef / bookIdRef / genreIdRef → created inside useAndroidBack (P6l) */

  // Track history whenever a reading screen is entered
  useEffect(() => {
    if (screen === 'matthew-ch' && chapterNum) {
      const ch = MATTHEW.chapters.find((c) => c.num === chapterNum);
      addToHistory({ type: 'chapter', bookId: 'matthew', bookTitle: 'Matthew', chapterNum, chapterTitle: ch?.title || null });
    } else if (screen === 'bible-ch' && bookId && chapterNum) {
      const book = BOOKS[bookId];
      const ch = book?.chapters.find((c) => c.num === chapterNum);
      addToHistory({ type: 'chapter', bookId, bookTitle: book?.title || bookId, chapterNum, chapterTitle: ch?.title || null });
    } else if (letterId) {
      var _hcol = COL_BY_LETTER_SC.get(screen);
      if (_hcol) { var _he = _findLetter(_hcol.volKey); if (_he) addToHistory({ type: 'letter', letterId, letterTitle: _he.title, letterNum: _he.num || null, volumeScreen: _hcol.indexScreen }); }
    } else if (screen === 'bible-study-chapter' && studyId && studyChapterId) {
      const study = getStudyById(studyId);
      const ch = getStudyChapter(study, studyChapterId);
      if (study && ch) addToHistory({ type: 'study-chapter', studyId, studyChapterId, studyTitle: study.title, studySlug: study.slug, chapterTitle: ch.title, chapterNum: ch.num });
    }
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId]);

  const fromMatthewChRef = useRefMirror(fromMatthewCh);  // also used in the render (~line 3001)
  /* fromLetterRef → returned by useFromLetterStack (P6i);
     fromSearchRef / fromStudiesRef / studyIdRef / fromWtlbRef → created inside useAndroidBack (P6l) */
  const searchOriginRef = useRefMirror(searchOrigin);

  /* visibilitychange dwell-pause/resume effect → src/hooks/use-reading-dwell.js (P6f) */

  // One-time journal media orphan sweep. JournalStore.remove() deliberately
  // does NOT delete media blobs (an embed in another entry may still
  // reference the source's image/audio — shared-media protection). The
  // trade-off is that the owning entry's deletion orphans its blobs in
  // IndexedDB. collectAllMediaIds() walks EVERY entry (source + embeds), so
  // a blob survives as long as any entry still references it; only truly
  // unreferenced blobs are pruned. Deferred so it never competes with the
  // first paint. This was wired but never invoked before.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (typeof JournalStore === 'undefined' || typeof JournalMediaStore === 'undefined') return;
        const referenced = JournalStore.collectAllMediaIds();
        JournalMediaStore.pruneOrphans(referenced).then((n) => {
          if (n) console.info('Journal media orphan sweep removed', n, 'blob(s)');
        }).catch((e) => console.warn('Journal media orphan sweep failed', e));
      } catch (e) { console.warn('Journal media orphan sweep threw', e); }
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  // Expose the home-button handler globally so <HomeBtn /> can call it
  // without prop drilling. Clears return-breadcrumbs so Home means Home.
  useEffect(() => {
    window.__goHome = () => {
      setFromSearch(false);setFromWtlb(null);setFromLetterStack([]);
      window.__pendingHighlight = null;
      setScreen("home");setBookId(null);setChapterNum(null);
    };
    return () => {if (window.__goHome) delete window.__goHome;};
  }, []);

  /* useAndroidBack(...) call → moved below, after goStudiesHome — that
     nav helper is one of the hook's params and is defined further down,
     so the call must follow it to avoid a TDZ ReferenceError. P6l. */

  /* ── Home category selector ── */
  const handleSelect = (id) => {
    if (id === "scriptures") goScripturesHome();else
    if (id === "volumes") goVolumesHome();else
    if (id === "studies") {setFromStudies(false);setGenreId(null);goStudiesHome();}else
    if (id === "library") goLibrary();
  };

  /* ── Surprise Me (pure random) ── */
  const handleSurprise = () => {
    const pool = [
    ...MATTHEW.chapters.map((ch) => ({ _k: "matthew", num: ch.num })),
    ...BIBLE_BOOK_LIST.flatMap((b) => b.chapters.map((ch) => ({ _k: "bible", bookId: b.id, num: ch.num }))),
    ..._studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).flatMap((s) => s.chapters.map((ch) => ({ _k: "study", studyId: s.id, chId: ch.id })))
    ];
    for (const col of COLLECTIONS) {
      if (!col.surpriseType) continue;
      for (const l of colLetterArr(col)) pool.push({ _k: "col", volKey: col.volKey, id: l.id });
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSurpriseAnchor(null);
    if (pick._k === "matthew") {
      setBookId("matthew");setChapterNum(pick.num);setScreen("matthew-ch");
    } else if (pick._k === "bible") {
      setBookId(pick.bookId);setChapterNum(pick.num);setScreen("bible-ch");
    } else if (pick._k === "study") {
      selectStudyChapter(pick.studyId, pick.chId);
    } else {
      const col = COL_BY_KEY.get(pick.volKey);
      if (!col) return;
      setLetterId(pick.id);
      setActiveReadKey("vol:" + col.volKey, () => setLastReadForVol(col.volKey, pick.id));
      setScreen(col.letterScreen);
    }
  };

  /* ── Matthew ── */
  const selectMatthewCh = (num) => {setChapterNum(num);setScreen("matthew-ch");setActiveReadKey("matthew", () => setLastReadChapters((prev) => ({ ...prev, matthew: num })));};
  const goMatthewIdx = () => {setChapterNum(null);setScreen("matthew-idx");};

  /* ── Bible Letter Studies ── */
  const STUDIES = _studies();
  const ACTIVE_STUDIES = STUDIES.filter((s) => !s.locked && s.chapters && s.chapters.length > 0);
  const getStudyById = (id) => STUDIES.find((s) => s.id === id) || null;
  const getStudyChapter = (study, chId) => study && study.chapters ? study.chapters.find((c) => c.id === chId) : null;
  const studyReadKey = (slug) => `bible-study-${slug}`;

  const goStudiesHome = () => {setScreen("studies-home");};

  /* useAndroidBack — the window.handleAndroidBack routing handler + its 9
     call-time ref mirrors. Extracted to src/hooks/use-android-back.js
     (P6l — the last P6 hook). The widest param surface in the app: it is
     the most-coupled handler, depending on nav state + the App-local
     nav-helper glue + cancelDwell + the fromLetter stack. Called here,
     after every nav helper it threads (goStudiesHome is the last one). */
  useAndroidBack({
    screen, bookId, genreId, fromSearch, fromStudies, fromMatthewCh, studyId, fromWtlb,
    tabsOverviewOpen, journalEntryId, fromLetterRef,
    setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId,
    setFromLetterStack, setFromSearch, setFromStudies, setFromWtlb, setFromMatthewCh,
    setTabsOverviewOpen,
    cancelDwell, goNavOrigin, goHome, goSearchOrigin, goScripturesHome,
    goStudiesHome, goVolumesHome, goJournalViewer,
  });

  const selectStudy = (id) => {
    const study = getStudyById(id);
    if (!study || study.locked || !study.chapters?.length) return;
    setStudyId(id);
    if (study.chapters.length === 1 || study.singlePage) {
      const ch = study.chapters[0];
      setStudyChapterId(ch.id);
      setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: ch.id })));
      setScreen("bible-study-chapter");
    } else {
      setStudyChapterId(null);
      setActiveReadKey(studyReadKey(study.slug));
      setScreen("bible-study-index");
    }
  };
  const selectStudyChapter = (sid, chId) => {
    const study = getStudyById(sid);
    if (!study) return;
    setStudyId(sid);
    setStudyChapterId(chId);
    setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: chId })));
    setScreen("bible-study-chapter");
  };

  // ─── UNIFIED STUDY CHAIN ──────────────────────────────────────────
  // Includes the 7 Bible Letter Studies AND the Matthew Study Bible as a
  // virtual entry, ordered heavy → light by content weight. Matthew is
  // ~389 KB so it lands at position 2 (after More Than a Man). Cross-chain
  // prev/next, StudiesHome rendering, and matthew-ch boundary nav all
  // consume this one list so everything stays in sync.
  const MATTHEW_CHAIN_ENTRY = {
    id: 'matthew-study', slug: 'matthew-study',
    title: 'The Volumes of Truth New Testament Study Bible - The Book of Matthew',
    isMatthewStudy: true,
    chapters: (_matthew() || {}).chapters || []
  };
  const CHAIN_ORDER = [
  'more-than-a-man',
  'matthew-study',
  'purity',
  'state-of-the-dead',
  'grace-and-the-law',
  'lamb-of-god',
  'trinity-exposed',
  'odds-chart'];

  const UNIFIED_CHAIN = CHAIN_ORDER.
  map((slug) => slug === 'matthew-study' ? MATTHEW_CHAIN_ENTRY : STUDIES.find((s) => s.id === slug)).
  filter((e) => e && (e.isMatthewStudy || !e.locked && e.chapters && e.chapters.length > 0));

  const chainIdx = (slug) => UNIFIED_CHAIN.findIndex((e) => e.slug === slug);
  const prevChainEntry = (slug) => {const i = chainIdx(slug);return i > 0 ? UNIFIED_CHAIN[i - 1] : null;};
  const nextChainEntry = (slug) => {const i = chainIdx(slug);return i >= 0 && i < UNIFIED_CHAIN.length - 1 ? UNIFIED_CHAIN[i + 1] : null;};

  // Navigate to the first/last chapter of a chain entry (either a Bible
  // Letter Study OR the Matthew Study Bible).
  const goToChainEntryFirst = (slug) => () => {
    if (slug === 'matthew-study') {
      setFromStudies(true);
      setBookId('matthew');setChapterNum(1);setScreen('matthew-ch');
      setActiveReadKey('matthew', () => setLastReadChapters((prev) => ({ ...prev, matthew: 1 })));
      return;
    }
    const s = getStudyById(slug);
    if (!s || !s.chapters?.length) return;
    selectStudyChapter(slug, s.chapters[0].id);
  };
  const goToChainEntryLast = (slug) => () => {
    if (slug === 'matthew-study') {
      setFromStudies(true);
      const lastNum = MATTHEW.chapters[MATTHEW.chapters.length - 1].num;
      setBookId('matthew');setChapterNum(lastNum);setScreen('matthew-ch');
      setActiveReadKey('matthew', () => setLastReadChapters((prev) => ({ ...prev, matthew: lastNum })));
      return;
    }
    const s = getStudyById(slug);
    if (!s || !s.chapters?.length) return;
    selectStudyChapter(slug, s.chapters[s.chapters.length - 1].id);
  };

  // Legacy aliases retained so older call sites keep working
  const goToStudyFirstChapter = (sid) => goToChainEntryFirst(sid);
  const goToStudyLastChapter = (sid) => goToChainEntryLast(sid);
  const goToMatthewStudyFromStudies = () => {setFromStudies(true);setBookId("matthew");setChapterNum(null);setScreen("matthew-idx");};
  const goToMatthewStudyFirstCh = goToChainEntryFirst('matthew-study');

  /* ── Ephesians / Hebrews ── */
  const selectBibleCh = (num) => {setChapterNum(num);setScreen("bible-ch");setActiveReadKey(bookId, () => setLastReadChapters((prev) => ({ ...prev, [bookId]: num })));};
  const goBibleIdx = () => {setChapterNum(null);setScreen("bible-idx");};

  /* ── Cross-volume boundary jumps ──
     Chain: Revelation → V1 → V2 → V3 → V4 → V5 → V6 → V7 → Rebuke → WTLB1 → WTLB2 → Flock → Timothy
  ── */
  const goToRevelationLast = () => {const rev = BOOKS.revelation;setBookId("revelation");setChapterNum(rev.chapters[rev.chapters.length - 1].num);setScreen("bible-ch");};
  // First/last helpers
  const _first = (arr, volKey, scr) => () => {if (arr.length > 0) {const id = arr[0].id;setLetterId(id);setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id));setScreen(scr);}};
  const _last = (arr, volKey, scr) => () => {if (arr.length > 0) {const id = arr[arr.length - 1].id;setLetterId(id);setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id));setScreen(scr);}};
  const _firstPreface = (preface, arr, volKey, scr) => () => {const id = preface ? preface.id : arr.length > 0 ? arr[0].id : null;if (id) {setLetterId(id);setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id));setScreen(scr);}};
  var _goFirst = {}, _goLast = {};
  COLLECTIONS.forEach(function(col) {
    if (!col.letterScreen) return;
    var arr = colLetterArr(col);
    var pref = colPreface(col);
    _goFirst[col.volKey] = pref ? _firstPreface(pref, arr, col.volKey, col.letterScreen) : _first(arr, col.volKey, col.letterScreen);
    _goLast[col.volKey] = _last(arr, col.volKey, col.letterScreen);
  });
  const goToGardenFirst = () => {setGardenPage(1);setScreen("garden-view");};

  /* boundaryConfig(volKey, entry) → { prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary }
     Derives reading-chain boundary cards from READING_CHAIN, skipping empty
     collections, with special endpoints (Revelation before V1, Garden after
     HolyDays). Returns null boundaries when the entry has an internal sibling
     in the same collection. */
  const boundaryConfig = (volKey, entry) => {
    const sourceCol = COL_BY_KEY.get(volKey);
    if (!sourceCol) return { prevBoundary: null, onPrevBoundary: null, nextBoundary: null, onNextBoundary: null };
    const hasPrev = !!(entry && (entry.prevLetter || entry.prevEntry));
    const hasNext = !!(entry && (entry.nextLetter || entry.nextEntry));
    const idx = READING_CHAIN.indexOf(volKey);
    let prevBoundary = null, onPrevBoundary = null, nextBoundary = null, onNextBoundary = null;

    if (!hasPrev) {
      if (volKey === 'one') {
        // Special: Revelation precedes Volume One
        prevBoundary = { short: "Revelation", title: `Revelation · Chapter ${BOOKS.revelation.chapters[BOOKS.revelation.chapters.length - 1].num}` };
        onPrevBoundary = goToRevelationLast;
      } else if (idx > 0) {
        // Walk back through chain skipping empties
        for (let i = idx - 1; i >= 0; i--) {
          const pCol = COL_BY_KEY.get(READING_CHAIN[i]);
          const pArr = colLetterArr(pCol);
          if (pArr.length === 0) continue;
          prevBoundary = { short: _boundaryShort(sourceCol, pCol), title: pArr[pArr.length - 1].title || pCol.short };
          onPrevBoundary = _goLast[pCol.volKey];
          break;
        }
      }
    }

    if (!hasNext) {
      if (volKey === 'holydays') {
        // Special: Garden follows Holy Days
        nextBoundary = { short: "A Return to the Garden", title: "A Return to the Garden" };
        onNextBoundary = goToGardenFirst;
      } else if (idx >= 0 && idx < READING_CHAIN.length - 1) {
        for (let i = idx + 1; i < READING_CHAIN.length; i++) {
          const nCol = COL_BY_KEY.get(READING_CHAIN[i]);
          const nArr = colLetterArr(nCol);
          if (nArr.length === 0) continue;
          const pref = colPreface(nCol);
          nextBoundary = { short: _boundaryShort(sourceCol, nCol), title: (pref ? pref.title : nArr[0].title) || nCol.short };
          onNextBoundary = _goFirst[nCol.volKey];
          break;
        }
      }
    }
    return { prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary };
  };

  /* ── Eph ↔ Heb internal cross-book ── */
  const bookIdx = book ? BIBLE_BOOK_LIST.findIndex((b) => b.id === bookId) : -1;
  const prevBibleBook = bookIdx > 0 ? BIBLE_BOOK_LIST[bookIdx - 1] : null;
  const nextBibleBook = bookIdx >= 0 && bookIdx < BIBLE_BOOK_LIST.length - 1 ? BIBLE_BOOK_LIST[bookIdx + 1] : null;
  const goNextBibleBook = () => {
    if (!nextBibleBook) return;
    setBookId(nextBibleBook.id);
    setChapterNum(nextBibleBook.chapters[0].num);
    setScreen("bible-ch");
  };
  const goPrevBibleBook = () => {
    if (!prevBibleBook) return;
    setBookId(prevBibleBook.id);
    setChapterNum(prevBibleBook.chapters[prevBibleBook.chapters.length - 1].num);
    setScreen("bible-ch");
  };

  /* ── Computed BibleChapterView boundary props ── */
  const chIsFirst = chapter && !book?.chapters.find((c) => c.num === chapter.num - 1);
  const chIsLast = chapter && !book?.chapters.find((c) => c.num === chapter.num + 1);

  // Prev: first chapters → previous book in BIBLE_BOOK_LIST
  const bcvPrevBook = chIsFirst ? prevBibleBook : null;
  const bcvOnPrevBook = goPrevBibleBook;
  const bcvPrevBoundaryTitle = null;

  // Next: revelation last → Volume One; other last → next book
  const bcvNextBook = chIsLast ?
  bookId === "revelation" ?
  { title: "Volume One", chapters: [{ num: 1 }] } :
  nextBibleBook :
  null;
  const bcvOnNextBook = chIsLast && bookId === "revelation" ?
  _goFirst.one :
  goNextBibleBook;
  const bcvNextBoundaryTitle = chIsLast && bookId === "revelation" ?
  "Volume One · Letter 1" :
  null;

  const tabsCtxValue = React.useMemo(() => ({
    enabled: !!settings.tabsEnabled,
    count: tabs.length,
    activeIdx: activeTabIdx,
    onOpen: goTabs,
    isOnTabsScreen: tabsOverviewOpen
  }), [settings.tabsEnabled, tabs.length, activeTabIdx, tabsOverviewOpen]);

  function colReadNavProps(volKey, clearSurprise) {
    var rk = COL_BY_KEY.get(volKey).readKey;
    return {
      onMarkRead: () => markRead(rk, letterId),
      onUnmark: () => unmarkRead(rk, letterId),
      isRead: (id) => isRead(rk, id),
      onNavigate: (id) => { if (clearSurprise) setSurpriseAnchor(null); setLetterId(id); setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id)); },
      onHome: () => goColIdx(volKey)
    };
  }

  function colIdxProps(volKey) {
    var col = COL_BY_KEY.get(volKey);
    var nav = (id) => { setLetterId(id); setActiveReadKey("vol:" + volKey, () => setLastReadForVol(volKey, id)); setScreen(col.letterScreen); };
    return {
      onSelect: nav,
      onSelectPreface: col.prefaceGlobal ? nav : undefined,
      currentLetter: settings.showReadingDot && activeReadKey === ("vol:" + volKey) ? lastReadLetterMap[volKey] || null : null,
      isRead: (id) => isRead(col.readKey, id),
      markAsReadEnabled: settings.markAsRead
    };
  }

  return (/*#__PURE__*/
    React.createElement(TabsContext.Provider, { value: tabsCtxValue }, /*#__PURE__*/
    /* CSS is now a static app.css loaded via <link> in <head> — this slot
       intentionally renders nothing (null is a valid no-op React child). */
    null,


    settings.showReadingDot && activeReadKey && !LETTER_SCREEN_SET.has(screen) && !["matthew-ch", "bible-ch", "search", "garden-view", "settings", "history", "library", "notes-index", "links-index", "bookmarks-index", "highlights-index", "journal-home", "journal-viewer", "journal-editor", "about"].includes(screen) && /*#__PURE__*/
    React.createElement("button", { className: "reading-dot-global", onClick: goToLastRead, title: "Resume reading" }, /*#__PURE__*/
    React.createElement("span", { className: "rdg-inner" })
    ),



    showWelcome && /*#__PURE__*/
    React.createElement("div", { style: {
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundImage: 'url("splash.jpg")',
        backgroundColor: '#0a0e1a',
        backgroundSize: 'contain', backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        display: 'flex', flexDirection: 'column'
      } }, /*#__PURE__*/
    React.createElement("div", { style: { display: 'flex', justifyContent: 'flex-end' } }, /*#__PURE__*/
    React.createElement("button", {
      onClick: dismissWelcome,
      style: {
        margin: 'calc(var(--inset-top, 0px) + 1rem) 1rem 0 0',
        background: 'rgba(0,0,0,0.55)', border: '1.5px solid rgba(255,255,255,0.35)',
        borderRadius: '50%', width: '2.4rem', height: '2.4rem',
        color: '#fff', fontSize: '1.2rem', lineHeight: 1,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
      } },
    "\u2715")
    ),

    isOnline && /*#__PURE__*/React.createElement("a", {
      href: "https://www.thevolumesoftruth.com",
      target: "_blank",
      rel: "noopener noreferrer",
      style: {
        position: 'absolute', left: '50%', top: '37%', transform: 'translateX(-50%)',
        width: '60%', maxWidth: '400px', height: '8%',
        zIndex: 1, borderBottom: '1.5px solid #6cacf0'
      } }
    )
    ),



    settings.tabsEnabled && tabsOverviewOpen && /*#__PURE__*/
    React.createElement("div", { className: "tabs-overview-layer" }, /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home", onClick: () => setTabsOverviewOpen(false) }, "\u2190 Back"), /*#__PURE__*/
      React.createElement(HomeBtn, null)
      ) }, /*#__PURE__*/
    React.createElement(TabsOverview, {
      tabs: tabs,
      activeTabIdx: activeTabIdx,
      onSelect: (i) => {lastTabCloseStrikes.current = 0;switchToTab(i);setTabsOverviewOpen(false);},
      onClose: (i) => closeTab(i),
      onNewTab: () => {lastTabCloseStrikes.current = 0;openNewTab();setTabsOverviewOpen(false);},
      onLongPress: (i) => setTabActionIdx(i),
      onClearAll: (signal) => {
        // -1 = tap-anywhere-else reset; otherwise advance the stage
        if (signal === -1) {setClearAllStage(0);return;}
        if (clearAllStage === 0) setClearAllStage(1);else
        if (clearAllStage === 1) setClearAllStage(2);else
        {closeAllTabs();setClearAllStage(0);lastTabCloseStrikes.current = 0;}
      },
      clearAllStage: clearAllStage,
      onDedupe: () => deduplicateTabs(),
      MAX_TABS: MAX_TABS,
      thumbnails: tabThumbnails }
    )
    ),
    tabActionIdx != null && /*#__PURE__*/
    React.createElement(TabActionSheet, {
      idx: tabActionIdx,
      total: tabs.length,
      onCloseOthers: () => {closeOtherTabs(tabActionIdx);lastTabCloseStrikes.current = 0;},
      onCloseToRight: () => {closeTabsToTheRight(tabActionIdx);lastTabCloseStrikes.current = 0;},
      onDismiss: () => setTabActionIdx(null) }
    ),

    disableTabsPromptOpen && /*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-overlay", onClick: () => setDisableTabsPromptOpen(false) }, /*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-dialog", onClick: (e) => e.stopPropagation() }, /*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-eyebrow" }, "You keep closing your last tab"), /*#__PURE__*/
    React.createElement("h2", { className: "disable-tabs-title" }, "Disable tabs?"), /*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-body" }, "Tabs let you juggle multiple reading places \u2014 a chapter, a letter, a study in parallel. If you only read one at a time, disabling tabs hides the switcher and this close button. You can re-enable tabs anytime in Settings \u2014 your open tabs will be waiting."



    ), /*#__PURE__*/
    React.createElement("div", { className: "disable-tabs-actions" }, /*#__PURE__*/
    React.createElement("button", {
      className: "disable-tabs-btn secondary",
      onClick: () => setDisableTabsPromptOpen(false) },
    "Keep Tabs On"), /*#__PURE__*/
    React.createElement("button", {
      className: "disable-tabs-btn primary",
      onClick: () => {
        updateSetting("tabsEnabled", false);
        setDisableTabsPromptOpen(false);
        setTabsOverviewOpen(false);
      } },
    "Disable Tabs")
    )
    )
    )

    ),



    screen === "settings" && /*#__PURE__*/
    React.createElement(SettingsScreen, {
      settings: settings,
      onToggle: toggleSetting,
      onSetting: updateSetting,
      onBack: goNavOrigin,
      onSearch: goSearch,
      onHistory: goHistory,
      readItems: readItems,
      onClearBook: (bid) => setReadItems((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {if (k.startsWith(`${VERSION_ID}:${bid}:`)) delete next[k];});
        return next;
      }),
      onClearAll: clearAllProgress,
      onClearHistory: clearHistory,
      historyCount: readHistory.length,
      theme: theme, onThemeChange: setTheme }
    ),



    screen === "search" && /*#__PURE__*/
    React.createElement(SearchScreen, {
      query: searchQuery,
      onQueryChange: setSearchQuery,
      settings: settings,
      onSettingsChange: (key, val) => setSettings((prev) => ({ ...prev, [key]: val })),
      onSelect: handleSearchSelect,
      onCommand: handleSearchCommand,
      onBack: goSearchOrigin,
      searchScope: searchScope,
      searchContext: searchContext,
      onToggleScope: () => setSearchScope((prev) => prev ? null : searchContext) }
    ),



    screen === "home" && /*#__PURE__*/
    React.createElement(HomeScreen, {
      onSelect: handleSelect,
      onSurprise: handleSurprise,
      showSurprise: settings.showSurpriseButton,
      onSettings: goSettings,
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      onInfo: () => setShowWelcome(true),
      onAbout: goAbout,
      history: readHistory,
      theme: theme, onThemeChange: setTheme }
    ),

    screen === "about" && /*#__PURE__*/
    React.createElement(AboutScreen, {
      onContinue: () => {
        try { localStorage.setItem('vot-about-seen', '1'); } catch (e) {}
        goNavOrigin();
      },
      onBack: () => {
        try { localStorage.setItem('vot-about-seen', '1'); } catch (e) {}
        goNavOrigin();
      },
      onSearch: goSearch,
      onHistory: goHistory,
      theme: theme, onThemeChange: setTheme }
    ),



    screen === "history" && /*#__PURE__*/
    React.createElement(HistoryScreen, {
      history: readHistory,
      onBack: goNavOrigin,
      onSelect: (entry) => {
        if (entry.type === 'study-chapter') {
          const study = getStudyById(entry.studyId);
          if (!study) return;
          setStudyId(entry.studyId);
          setStudyChapterId(entry.studyChapterId);
          setActiveReadKey(studyReadKey(study.slug), () => setLastReadChapters((prev) => ({ ...prev, [studyReadKey(study.slug)]: entry.studyChapterId })));
          setScreen('bible-study-chapter');
        } else if (entry.type === 'letter') {
          setLetterId(entry.letterId);
          var _hc = entry.volumeScreen && COL_BY_INDEX_SC.get(entry.volumeScreen) || (entry.volume === 1 ? COL_BY_KEY.get('one') : COL_BY_KEY.get('two'));
          setActiveReadKey('vol:' + _hc.volKey, () => setLastReadForVol(_hc.volKey, entry.letterId));
          setScreen(_hc.letterScreen);
        } else {
          setBookId(entry.bookId);setChapterNum(entry.chapterNum);
          setActiveReadKey(entry.bookId, () => setLastReadChapters((prev) => ({ ...prev, [entry.bookId]: entry.chapterNum })));
          setScreen(entry.bookId === 'matthew' ? 'matthew-ch' : 'bible-ch');
        }
      },
      onSearch: goSearch,
      onSettings: goSettings,
      onHistory: goHistory,
      onPruneDay: pruneHistoryDay,
      theme: theme, onThemeChange: setTheme }
    ),

    screen === "library" && /*#__PURE__*/
    React.createElement(LibraryScreen, {
      onBack: goHome,
      onOpenNotes: goNotesIndex,
      onOpenLinks: goLinksIndex,
      onOpenBookmarks: goBookmarksIndex,
      onOpenJournal: goJournalHub,
      onOpenHighlights: goHighlightsIndex,
      onSearch: goSearch,
      onHistory: goHistory,
      onSettings: goSettings,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "highlights-index" && typeof HighlightsScreen !== 'undefined' && /*#__PURE__*/
    React.createElement(HighlightsScreen, {
      onSettings: goSettings,
      onBack: () => setScreen('library'),
      onHome: goHome,
      onNavigateToSource: (endpoint, meta) => {
        if (endpoint) {
          setNavOrigin({ screen: 'highlights-index' });
          navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Highlights' });
        }
      },
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "journal-home" && typeof JournalHubScreen !== 'undefined' && /*#__PURE__*/
    React.createElement(JournalHubScreen, {
      onSettings: goSettings,
      onBack: () => setScreen('library'),
      onHome: goHome,
      onOpenEntry: (eid) => goJournalViewer(eid),
      onEditEntry: (eid) => goJournalEditor(eid),
      onCreateEntry: createAndEditJournal,
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "journal-viewer" && typeof JournalViewerScreen !== 'undefined' && /*#__PURE__*/
    React.createElement(JournalViewerScreen, {
      onSettings: goSettings,
      entryId: journalEntryId,
      onBack: () => setScreen('journal-home'),
      onHome: goHome,
      onEdit: () => setScreen('journal-editor'),
      onNavigateToLink: (endpoint, meta) => {
        if (endpoint) {
          setNavOrigin({ screen: 'journal-viewer' });
          navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Journal' });
        }
      },
      onOpenJournalEntry: (eid) => goJournalViewer(eid),
      onOpenNotebook: (nbId) => {
        // Drop the user straight into that notebook's screen in the Notes
        // hub. __notesReturnCtx is consumed by NotesIndexScreen on mount
        // to pre-drill the right notebook (same channel the back-pill uses).
        window.__notesReturnCtx = { tab: 'notebooks', drilledNbId: nbId };
        setNavOrigin({ screen: 'journal-viewer' });
        setScreen('notes-index');
      },
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "journal-editor" && typeof JournalEditorScreen !== 'undefined' && /*#__PURE__*/
    React.createElement(JournalEditorScreen, {
      onSettings: goSettings,
      entryId: journalEntryId,
      onBack: () => goJournalViewer(journalEntryId),
      onHome: goHome,
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "notes-index" && /*#__PURE__*/
    React.createElement(NotesIndexScreen, {
      onSettings: goSettings,
      onBack: () => setScreen('library'),
      onHome: goHome,
      onOpenNote: (gid) => setNoteSheetTarget({ groupId: gid, startInEditMode: false }),
      onNavigateToSource: (endpoint, meta) => {
        if (endpoint) {
          setNavOrigin({ screen: 'notes-index' });
          // The back-pill renderer prepends "Back to " itself, so we just
          // pass the notebook/list name (e.g. "Uncategorized", "My Notes").
          navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Notes' });
        }
      },
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "links-index" && /*#__PURE__*/
    React.createElement(LinksScreen, {
      onSettings: goSettings,
      onBack: () => setScreen('library'),
      onHome: goHome,
      onNavigateToSource: (endpoint, meta) => {
        if (endpoint) {
          setNavOrigin({ screen: 'links-index' });
          navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Links' });
        }
      },
      onNavigateToTarget: (endpoint, meta) => {
        if (endpoint) {
          setNavOrigin({ screen: 'links-index' });
          navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Links' });
        }
      },
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "bookmarks-index" && /*#__PURE__*/
    React.createElement(BookmarksScreen, {
      onSettings: goSettings,
      onBack: () => setScreen('library'),
      onHome: goHome,
      onNavigateToSource: (endpoint, meta) => {
        if (endpoint) {
          setNavOrigin({ screen: 'bookmarks-index' });
          navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Bookmarks' });
        }
      },
      onSearch: goSearch,
      onHistory: goHistory,
      historyEnabled: settings.historyEnabled !== false,
      hlTick: hlTick, setHlTick: setHlTick,
      theme: theme, onThemeChange: setTheme
    }),

    screen === "scriptures-home" && /*#__PURE__*/
    React.createElement(ScripturesHome, {
      onSelect: handleScriptureSelect,
      onGenre: goScriptureGenre,
      onBack: goHome,
      onSearch: goSearch,
      onHistory: goHistory,
      onSettings: goSettings,
      onMatthewStudy: () => {setBookId("matthew");setChapterNum(null);setScreen("matthew-idx");},
      theme: theme, onThemeChange: setTheme,
      layout: settings.scriptureLayout }
    ),



    screen === "scripture-genre" && genreId && /*#__PURE__*/
    React.createElement(ScriptureGenre, {
      genreId: genreId,
      onSelect: handleScriptureSelect,
      onBack: goScripturesHome,
      onSearch: goSearch,
      onHistory: goHistory,
      onSettings: goSettings,
      theme: theme, onThemeChange: setTheme }
    ),



    screen === "volumes-home" && /*#__PURE__*/
    React.createElement(VolumesHome, {
      onSelect: handleVolumeSelect,
      onBack: goHome,
      onSearch: goSearch,
      onHistory: goHistory,
      onSettings: goSettings,
      theme: theme, onThemeChange: setTheme }
    ),



    screen === "matthew-idx" && /*#__PURE__*/
    React.createElement(ChapterIndex, {
      book: MATTHEW,
      onSelect: selectMatthewCh,
      onBack: () => {if (fromStudies) {setFromStudies(false);goStudiesHome();} else {goHome();}},
      onSearch: goSearch,
      onHistory: goHistory,
      onSettings: goSettings,
      currentChapter: settings.showReadingDot && activeReadKey === "matthew" ? lastReadChapters["matthew"] || null : null,
      isRead: (num) => isRead("matthew", num),
      markAsReadEnabled: settings.markAsRead,
      theme: theme, onThemeChange: setTheme }
    ),


    screen === "matthew-ch" && chapter && (() => {
      // Chain-aware boundaries: when entered via Studies (fromStudies=true),
      // Matthew participates in the unified heavy→light chain. Ch 1 prev →
      // previous chain entry's last chapter; Ch 28 next → next chain entry's
      // first chapter. Matthew's own ch N ↔ ch N±1 uses ChapterView's
      // built-in prevCh/nextCh so the inner chapters feel normal.
      const mtLastNum = MATTHEW.chapters[MATTHEW.chapters.length - 1].num;
      const atFirstCh = chapter.num === 1;
      const atLastCh = chapter.num === mtLastNum;
      const chainPrev = fromStudies && atFirstCh ? prevChainEntry('matthew-study') : null;
      const chainNext = fromStudies && atLastCh ? nextChainEntry('matthew-study') : null;
      return (/*#__PURE__*/
        React.createElement(React.Fragment, null, /*#__PURE__*/
        React.createElement(ChapterView, {
          book: MATTHEW, chapter: chapter, mode: mode, showStudy: showStudy, showEchoes: settings.showInlineEchoes !== false,
          showChapterTitle: settings.showChapterTitle !== false,
          titleFocusHidden: titleFocusHidden,
          setTitleFocusHidden: setTitleFocusHidden,
          onIndex: goMatthewIdx,
          onNavigate: (num) => {setSurpriseAnchor(null);selectMatthewCh(num);},
          onMarkRead: () => markRead("matthew", chapterNum),
          markAsReadEnabled: settings.markAsRead,
          showProgressBar: settings.showProgressBar,
          prevBoundary: chainPrev ? { short: studyShortTitle(chainPrev.title), title: studyShortTitle(chainPrev.title) } : null,
          onPrevBoundary: chainPrev ? () => {setFromStudies(true);goToChainEntryLast(chainPrev.slug)();} : null,
          nextBoundary: chainNext ? { short: studyShortTitle(chainNext.title), title: studyShortTitle(chainNext.title) } : null,
          onNextBoundary: chainNext ? () => {setFromStudies(true);goToChainEntryFirst(chainNext.slug)();} : null,
          onSearch: goSearch,
          onSettings: goSettings,
          onHistory: goHistory,
          theme: theme, onThemeChange: setTheme,
          surpriseAnchor: surpriseAnchor,
          onVotLetterClick: goToLetterFromMatthew,
          backHint: backHint, onTapThroughBack: tapThroughBack,
          hlTick: hlTick,
          onLinkOpen: openLinkSidebar }
        ), /*#__PURE__*/
        React.createElement(ModeToggle, { mode: mode, onChange: setMode, showStudy: showStudy, onShowStudyChange: setShowStudy })
        ));

    })(),


    screen === "studies-home" && /*#__PURE__*/
    React.createElement(StudiesHome, {
      studies: UNIFIED_CHAIN,
      studiesLoading: studiesLoading,
      onSelectStudy: (slug) => {
        if (slug === 'matthew-study') {
          setFromStudies(true);
          setBookId("matthew");setChapterNum(null);setScreen("matthew-idx");
        } else {
          selectStudy(slug);
        }
      },
      onBack: goHome,
      onSearch: goSearch,
      onHistory: goHistory,
      onSettings: goSettings,
      theme: theme, onThemeChange: setTheme }
    ),



    screen === "bible-study-index" && studyId && (() => {
      const study = getStudyById(studyId);
      if (!study) return studiesLoading ? React.createElement("div", { className: "sc-sheet-loading", style: { display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" } }, "Loading…") : null;
      return (/*#__PURE__*/
        React.createElement(BibleStudyIndex, {
          study: study,
          onSelect: (chId) => selectStudyChapter(studyId, chId),
          onBack: goStudiesHome,
          onSearch: goSearch,
          onHistory: goHistory,
          onSettings: goSettings,
          currentChapter: settings.showReadingDot && activeReadKey === studyReadKey(study.slug) ? lastReadChapters[studyReadKey(study.slug)] || null : null,
          isRead: (chId) => isRead(studyReadKey(study.slug), chId),
          markAsReadEnabled: settings.markAsRead,
          theme: theme, onThemeChange: setTheme }
        ));

    })(),


    screen === "bible-idx" && book && /*#__PURE__*/
    React.createElement(ChapterIndex, {
      book: book,
      onSelect: selectBibleCh,
      onBack: genreId ? () => setScreen("scripture-genre") : goScripturesHome,
      onSearch: goSearch,
      onHistory: goHistory,
      onSettings: goSettings,
      currentChapter: settings.showReadingDot && activeReadKey === bookId ? lastReadChapters[bookId] || null : null,
      isRead: (num) => isRead(bookId, num),
      markAsReadEnabled: settings.markAsRead,
      restoredNames: settings.restoredNames,
      showChapterTitle: settings.showChapterTitle !== false,
      theme: theme, onThemeChange: setTheme }
    ),


    screen === "bible-ch" && book && chapter && /*#__PURE__*/
    React.createElement(BibleChapterView, {
      book: book, chapter: chapter,
      onIndex: book?.chapters.length === 1 ? genreId ? () => setScreen("scripture-genre") : goScripturesHome : goBibleIdx,
      onNavigate: (num) => {setSurpriseAnchor(null);selectBibleCh(num);},
      onMarkRead: () => markRead(bookId, chapterNum),
      markAsReadEnabled: settings.markAsRead,
      showProgressBar: settings.showProgressBar,
      translation: settings.translation,
      restoredNames: settings.restoredNames,
      showChapterTitle: settings.showChapterTitle !== false,
      showSectionHeadings: settings.showSectionHeadings !== false,
      titleFocusHidden: titleFocusHidden,
      setTitleFocusHidden: setTitleFocusHidden,
      headingsFocusHidden: headingsFocusHidden,
      setHeadingsFocusHidden: setHeadingsFocusHidden,
      prevBook: bcvPrevBook,
      nextBook: bcvNextBook,
      onPrevBook: bcvOnPrevBook,
      onNextBook: bcvOnNextBook,
      prevBoundaryTitle: bcvPrevBoundaryTitle,
      nextBoundaryTitle: bcvNextBoundaryTitle,
      onSearch: goSearch,
      onSettings: goSettings,
      onHistory: goHistory,
      theme: theme, onThemeChange: setTheme,
      surpriseAnchor: surpriseAnchor,
      backHint: backHint, onTapThroughBack: tapThroughBack,
      hlTick: hlTick, onLinkOpen: openLinkSidebar }
    ),



    void (_idxNav = function() { return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home", onClick: goVolumesHome }, "\u2190 Volumes"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/
      React.createElement(NavButtons, { onSettings: goSettings, onHistory: goHistory, onSearch: goSearch, theme: theme, onThemeChange: setTheme })); }),

    screen === "vot-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Volume Two", letters: LETTERS }, colIdxProps('two')))
    ),


    screen === "vot-one-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Volume One", letters: LETTERS_V1, preface: LETTERS_V1_PREFACE }, colIdxProps('one')))
    ),


    /* ── Shared props passed to every LetterView and WtlbEntryView ── */
    void (sharedViewProps = {
      onSearch: goSearch, onSettings: goSettings, onHistory: goHistory,
      theme: theme, onThemeChange: setTheme, surpriseAnchor: surpriseAnchor,
      onInAppLink: openInAppLetter, backHint: backHint, hlTick: hlTick,
      onLinkOpen: openLinkSidebar,
      onBack: () => window.handleAndroidBack && window.handleAndroidBack(),
      markAsReadEnabled: settings.markAsRead, showProgressBar: settings.showProgressBar
    }),
    void (_navToChapter = (bid, ch) => {setFromWtlb(screen);setBookId(bid);setChapterNum(ch);setScreen("bible-ch");}),


    screen === "bible-study-chapter" && studyId && studyChapterId && (() => {
      const study = getStudyById(studyId);
      const ch = getStudyChapter(study, studyChapterId);
      if (!study || !ch) return studiesLoading ? React.createElement("div", { className: "sc-sheet-loading", style: { display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" } }, "Loading…") : null;
      const idx = study.chapters.findIndex((c) => c.id === studyChapterId);
      const prevCh = idx > 0 ? study.chapters[idx - 1] : null;
      const nextCh = idx < study.chapters.length - 1 ? study.chapters[idx + 1] : null;
      // Chain-aware boundary: crosses into the next/prev entry in the
      // unified heavy→light chain, which includes the Matthew Study Bible.
      const prevEntry = !prevCh ? prevChainEntry(studyId) : null;
      const nextEntry = !nextCh ? nextChainEntry(studyId) : null;

      // Build the letter-shaped object expected by LetterView.
      // Resource fields (audio/video/relatedTopics/etc.) fall back from
      // chapter → study, so the study can declare them once and every
      // chapter inherits. Chapter-level values override when present.
      const pick = (chVal, studyVal, empty) => {
        if (chVal === undefined || chVal === null) return studyVal != null ? studyVal : empty;
        if (Array.isArray(chVal)) return chVal.length ? chVal : studyVal || empty;
        return chVal;
      };
      const letterShim = {
        id: ch.id,
        title: ch.title,
        subtitle: ch.subtitle || null,
        num: ch.num,
        date: null, from: null, spoken: null, forLine: null,
        preamble: ch.part ? `Part ${ch.part}` : null,
        blocks: ch.blocks || [],
        sectionIntro: ch.sectionIntro || null,
        footnotes: ch.footnotes || {},
        nkjv: ch.nkjv || {},
        prevLetter: prevCh ? { id: prevCh.id, title: prevCh.title } : null,
        nextLetter: nextCh ? { id: nextCh.id, title: nextCh.title } : null,
        relatedTopics: pick(ch.relatedTopics, study.relatedTopics, []),
        bibleStudies: pick(ch.bibleStudies, study.bibleStudies, []),
        videos: pick(ch.videos, study.videos, []),
        audioUrl: pick(ch.audioUrl, study.audioUrl, null),
        soundcloudUrl: pick(ch.soundcloudUrl, study.soundcloudUrl, null),
        videoVoiceUrl: pick(ch.videoVoiceUrl, study.videoVoiceUrl, null),
        videoVoiceLabel: pick(ch.videoVoiceLabel, study.videoVoiceLabel, null),
        videoMusicUrl: pick(ch.videoMusicUrl, study.videoMusicUrl, null),
        addendum: pick(ch.addendum, study.addendum, null)
      };

      // onStudyNavigate: internal jump to another study. Saves current
      // location so back returns here via existing fromSearch-style logic.
      const jumpToStudy = (targetSlug) => {
        if (targetSlug === 'matthew-study') {
          setFromStudies(true);
          setBookId('matthew');setChapterNum(null);setScreen('matthew-idx');
          return;
        }
        const target = getStudyById(targetSlug);
        if (!target || target.locked) return;
        selectStudy(targetSlug);
      };
      const handleLetterClick = (lid, sc) => {
        setFromStudies(true);
        setLetterId(lid);
        const _col = COL_BY_LETTER_SC.get(sc);
        if (_col) setActiveReadKey(_col.readKey);
        setScreen(sc);
      };
      return (/*#__PURE__*/
        React.createElement(LetterView, Object.assign({}, sharedViewProps, {
          letter: letterShim,
          studyMode: true,
          volumeLabel: study.title,
          onHome: () => {if (study.chapters.length > 1) {setStudyChapterId(null);setScreen("bible-study-index");} else {goStudiesHome();}},
          onNavigate: (chId) => {setSurpriseAnchor(null);selectStudyChapter(studyId, chId);},
          onStudyNavigate: jumpToStudy,
          onLetterClick: handleLetterClick,
          onMarkRead: () => markRead(studyReadKey(study.slug), studyChapterId),
          onUnmark: () => unmarkRead(studyReadKey(study.slug), studyChapterId),
          isRead: (id) => isRead(studyReadKey(study.slug), id),
          prevBoundary: prevEntry ? { short: studyShortTitle(prevEntry.title), title: studyShortTitle(prevEntry.title) } : null,
          onPrevBoundary: prevEntry ? goToChainEntryLast(prevEntry.slug) : null,
          nextBoundary: nextEntry ? { short: studyShortTitle(nextEntry.title), title: studyShortTitle(nextEntry.title) } : null,
          onNextBoundary: nextEntry ? goToChainEntryFirst(nextEntry.slug) : null,
          prophecyCardStatesRef: prophecyCardStatesRef,
          saveProphecyCardStates: saveProphecyCardStates }))
        );

    })(),


    screen === "vot-one-letter" && letterV1 && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('one', true), boundaryConfig('one', letterV1), {
      letter: letterV1, volumeLabel: "Volume One" })
    ),


    screen === "vot-letter" && letter && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('two', true), boundaryConfig('two', letter), {
      letter: letter })
    ),



    screen === "vot-three-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Volume Three", letters: LETTERS_V3, preface: LETTERS_V3_PREFACE }, colIdxProps('three')))
    ),

    screen === "vot-three-letter" && letterV3 && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('three', true), boundaryConfig('three', letterV3), {
      letter: letterV3, volumeLabel: "Volume Three" })),



    screen === "vot-four-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Volume Four", letters: LETTERS_V4, preface: LETTERS_V4_PREFACE }, colIdxProps('four')))
    ),

    screen === "vot-four-letter" && letterV4 && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('four', true), boundaryConfig('four', letterV4), {
      letter: letterV4, volumeLabel: "Volume Four" })),



    screen === "vot-five-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Volume Five", letters: LETTERS_V5, preface: LETTERS_V5_PREFACE }, colIdxProps('five')))
    ),

    screen === "vot-five-letter" && letterV5 && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('five', true), boundaryConfig('five', letterV5), {
      letter: letterV5, volumeLabel: "Volume Five" })),



    screen === "vot-six-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Volume Six", letters: LETTERS_V6, preface: LETTERS_V6_PREFACE }, colIdxProps('six')))
    ),

    screen === "vot-six-letter" && letterV6 && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('six', true), boundaryConfig('six', letterV6), {
      letter: letterV6, volumeLabel: "Volume Six" })),



    screen === "vot-seven-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Volume Seven", letters: LETTERS_V7, preface: LETTERS_V7_PREFACE }, colIdxProps('seven')))
    ),

    screen === "vot-seven-letter" && letterV7 && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('seven', true), boundaryConfig('seven', letterV7), {
      letter: letterV7, volumeLabel: "Volume Seven" })),



    screen === "vot-timothy-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Letters from Timothy", eyebrow: "The Volumes of Truth", letters: LETTERS_TIMOTHY, preface: LETTERS_TIMOTHY_PREFACE }, colIdxProps('timothy')))
    ),

    screen === "vot-timothy-letter" && letterTimothy && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('timothy', true), boundaryConfig('timothy', letterTimothy), {
      letter: letterTimothy, volumeLabel: "Letters from Timothy" })),



    screen === "vot-flock-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Letters to The Lord's Little Flock", eyebrow: "The Volumes of Truth", letters: LETTERS_FLOCK, preface: LETTERS_FLOCK_PREFACE }, colIdxProps('flock')))
    ),

    screen === "vot-flock-letter" && letterFlock && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('flock', true), boundaryConfig('flock', letterFlock), {
      letter: letterFlock, volumeLabel: "Letters to The Lord's Little Flock" })),



    screen === "vot-rebuke-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "The Lord's Rebuke", eyebrow: "A Testament Against The World", letters: LETTERS_REBUKE, preface: LETTERS_REBUKE_PREFACE }, colIdxProps('rebuke')))
    ),

    screen === "vot-rebuke-letter" && letterRebuke && /*#__PURE__*/
    React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('rebuke', true), boundaryConfig('rebuke', letterRebuke), {
      letter: letterRebuke, volumeLabel: "The Lord's Rebuke" })),



    screen === "wtlb-one-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Words To Live By", eyebrow: "Part One \xB7 Words of Wisdom", letters: WTLB_ONE, columns: 2 }, colIdxProps('wtlb1')))
    ),

    screen === "wtlb-one-entry" && wtlb1Entry && /*#__PURE__*/
    React.createElement(WtlbEntryView, Object.assign({}, sharedViewProps, colReadNavProps('wtlb1'), boundaryConfig('wtlb1', wtlb1Entry), {
      entry: wtlb1Entry, partLabel: "Part One",
      onNavToChapter: _navToChapter })),


    screen === "wtlb-two-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Words To Live By", eyebrow: "Part Two \xB7 More Words of Wisdom", letters: WTLB_TWO, columns: 2 }, colIdxProps('wtlb2')))
    ),

    screen === "wtlb-two-entry" && wtlb2Entry && /*#__PURE__*/
    React.createElement(WtlbEntryView, Object.assign({}, sharedViewProps, colReadNavProps('wtlb2'), boundaryConfig('wtlb2', wtlb2Entry), {
      entry: wtlb2Entry, partLabel: "Part Two",
      onNavToChapter: _navToChapter })),


    screen === "blessed-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: _idxNav() }, /*#__PURE__*/
    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "The Blessed", eyebrow: "Blessings & Promises", letters: colLetterArr(COL_BY_KEY.get('blessed')).map((e) => ({ ...e, date: e.sourceLabel || '' })) }, colIdxProps('blessed')))
    ),

    screen === "blessed-entry" && blessedEntry && /*#__PURE__*/
    React.createElement(WtlbEntryView, Object.assign({}, sharedViewProps, colReadNavProps('blessed'), boundaryConfig('blessed', blessedEntry), {
      entry: blessedEntry, partLabel: "The Blessed",
      onNavToChapter: _navToChapter })),


    screen === "holy-days-index" && /*#__PURE__*/
    React.createElement(ScreenLayout, { navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home", onClick: goVolumesHome }, "\u2190 Volumes"), /*#__PURE__*/
      React.createElement(HomeBtn, null), /*#__PURE__*/
      React.createElement(NavButtons, { onSettings: goSettings, onHistory: goHistory, onSearch: goSearch, theme: theme, onThemeChange: setTheme })
      ) },
    typeof HOLY_DAYS_META !== 'undefined' && (HOLY_DAYS_META.audioPlaylist || HOLY_DAYS_META.videoPlaylist) && /*#__PURE__*/
    React.createElement("div", { className: "hd-playlists" },
    HOLY_DAYS_META.audioPlaylist && /*#__PURE__*/
    React.createElement("a", { className: "hd-playlist-btn", href: HOLY_DAYS_META.audioPlaylist, target: "_blank", rel: "noopener noreferrer" }, /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("path", { d: "M9 18V5l12-2v13" }), /*#__PURE__*/React.createElement("circle", { cx: "6", cy: "18", r: "3" }), /*#__PURE__*/React.createElement("circle", { cx: "18", cy: "16", r: "3" })), /*#__PURE__*/
    React.createElement("span", { className: "hd-playlist-label" }, "Audio Playlist"), /*#__PURE__*/
    React.createElement("span", { className: "hd-playlist-sub" }, "Listen on Bandcamp")
    ),

    HOLY_DAYS_META.videoPlaylist && /*#__PURE__*/
    React.createElement("a", { className: "hd-playlist-btn", href: HOLY_DAYS_META.videoPlaylist, target: "_blank", rel: "noopener noreferrer" }, /*#__PURE__*/
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /*#__PURE__*/React.createElement("polygon", { points: "23 7 16 12 23 17 23 7" }), /*#__PURE__*/React.createElement("rect", { x: "1", y: "5", width: "15", height: "14", rx: "2", ry: "2" })), /*#__PURE__*/
    React.createElement("span", { className: "hd-playlist-label" }, "Video Playlist"), /*#__PURE__*/
    React.createElement("span", { className: "hd-playlist-sub" }, "Watch on YouTube")
    )

    ), /*#__PURE__*/

    React.createElement(VolumeLetterIndex, Object.assign({ volumeTitle: "Regarding The Holy Days", eyebrow: "The Appointed Times", letters: colLetterArr(COL_BY_KEY.get('holydays')).map((e) => ({ ...e, date: e.date || e.sourceLabel || '' })) }, colIdxProps('holydays')))
    ),

    screen === "holy-days-entry" && hdEntry && (() => {
      const bc = boundaryConfig('holydays', hdEntry);
      if (hdEntry.type === 'wtlb') {
        return (/*#__PURE__*/
          React.createElement(WtlbEntryView, Object.assign({}, sharedViewProps, colReadNavProps('holydays'), bc, {
            entry: hdEntry, partLabel: "Regarding The Holy Days",
            onNavToChapter: _navToChapter,
            footnotesMode: true })));
      }
      const letterShim = { ...hdEntry, prevLetter: hdEntry.prevEntry || null, nextLetter: hdEntry.nextEntry || null };
      return (/*#__PURE__*/
        React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('holydays'), bc, {
          letter: letterShim, volumeLabel: "Regarding The Holy Days" })));
    })(),



    screen === "hm-letter" && hmEntry && (() => {
      const letterShim = { ...hmEntry, prevLetter: null, nextLetter: null };
      // Returning home from HM goes back to the Matthew chapter that led here.
      const goHomeFromHM = () => {
        if (fromMatthewChRef.current) {
          setFromMatthewCh(null);
          setScreen("matthew-ch");
        } else {
          goHome();
        }
      };
      return (/*#__PURE__*/
        React.createElement(LetterView, Object.assign({}, sharedViewProps, colReadNavProps('hm'), { letter: letterShim, volumeLabel: "Hidden Manna",
          onHome: goHomeFromHM,
          onNavigate: (id) => {setLetterId(id);} })));

    })(),


    screen === "garden-view" && /*#__PURE__*/
    React.createElement(GardenView, {
      page: gardenPage,
      onPageChange: (p) => setGardenPage(p),
      onBack: goVolumesHome,
      theme: theme, onThemeChange: setTheme,
      tier: settings.gardenTier || GARDEN_DEFAULT_TIER }
    ),



    gardenWarningOpen && (() => {
      const selectedTier = getGardenTier(settings.gardenTier);
      return (/*#__PURE__*/
        React.createElement("div", { className: "garden-warning-overlay", onClick: () => setGardenWarningOpen(false) }, /*#__PURE__*/
        React.createElement("div", { className: "garden-warning-modal", onClick: (e) => e.stopPropagation() }, /*#__PURE__*/
        React.createElement("div", { className: "garden-warning-title" }, "Before You Begin"), /*#__PURE__*/
        React.createElement("div", { className: "garden-warning-body" }, /*#__PURE__*/
        React.createElement("em", null, "A Return to The Garden"), " contains ", /*#__PURE__*/React.createElement("strong", null, "209 high-resolution photographs"), " totaling approximately ", /*#__PURE__*/React.createElement("strong", null, selectedTier.size), " at the selected quality. Pages stream from the internet as you read and are cached on your device.", /*#__PURE__*/
        React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "For the best experience, connect to ", /*#__PURE__*/
        React.createElement("strong", null, "Wi-Fi"), " before proceeding. Mobile data charges may apply otherwise.", /*#__PURE__*/
        React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "Please also ensure your device has sufficient ", /*#__PURE__*/
        React.createElement("strong", null, "free storage"), " available to cache the full collection."
        ), /*#__PURE__*/
        React.createElement("div", { className: "garden-tier-selector" }, /*#__PURE__*/
        React.createElement("div", { className: "garden-tier-label" }, "Image Quality"), /*#__PURE__*/
        React.createElement("div", { className: "garden-tier-hint" }, "You can change this anytime from the Settings menu."),
        GARDEN_TIERS.map((t) => /*#__PURE__*/
        React.createElement("button", { key: t.id,
          className: `garden-tier-option${settings.gardenTier === t.id ? " selected" : ""}`,
          onClick: () => setSettings((s) => ({ ...s, gardenTier: t.id })) }, /*#__PURE__*/
        React.createElement("div", { className: "garden-tier-option-main" }, /*#__PURE__*/
        React.createElement("span", { className: "garden-tier-option-name" }, t.label), /*#__PURE__*/
        React.createElement("span", { className: "garden-tier-option-size" }, t.size)
        ), /*#__PURE__*/
        React.createElement("div", { className: "garden-tier-option-desc" }, t.res, " \xB7 ", t.desc)
        )
        )
        ), /*#__PURE__*/
        React.createElement("div", { className: "garden-warning-actions" }, /*#__PURE__*/
        React.createElement("button", { className: "garden-warning-btn garden-warning-btn-cancel",
          onClick: () => setGardenWarningOpen(false) }, "Go Back"

        ), /*#__PURE__*/
        React.createElement("button", { className: "garden-warning-btn garden-warning-btn-proceed",
          onClick: () => {
            try {localStorage.setItem('vot-garden-warning-acked', '1');} catch (e) {}
            setGardenWarningOpen(false);
            setScreen("garden-view");
          } }, "Proceed"

        )
        )
        )
        ));

    })(),

    /* ── Highlight & Link overlays (always mounted) ── */
    React.createElement(SelectionToolbar, {
      hlTick: hlTick, setHlTick: setHlTick,
      onLinkRequest: openLinkPicker,
      onNoteRequest: openNoteSheet,
      onBookmarkRequest: function(bkm) { /* bookmark created; icon injected via applyDOMBookmarks */ }
    }),
    annChip && React.createElement(AnnotationActionChip, {
      chip: annChip, setHlTick: setHlTick,
      onClose: () => setAnnChip(null),
      onNoteRequest: openNoteSheet
    }),
    linkSidebarKey && React.createElement(LinkSidebar, {
      hlKey: linkSidebarKey, hlTick: hlTick, setHlTick: setHlTick,
      onClose: closeLinkSidebar, onNavigate: navigateToLink
    }),
    linkPickerSource && !linkRefineRequest && React.createElement(LinkPicker, {
      sourceKey: linkPickerSource.key, sourceLabel: linkPickerSource.label,
      sourceStart: linkPickerSource.start, sourceEnd: linkPickerSource.end,
      sourceText: linkPickerSource.text,
      hlTick: hlTick, setHlTick: setHlTick, onClose: closeLinkPicker,
      onRequestRefine: setLinkRefineRequest,
      lastCreatedLink: lastLinkCreated, onLinkCreated: setLastLinkCreated,
      mode: linkPickerMode,
      onPickTarget: linkPickerMode ? (target, item) => {
        // Card mode short-circuits here — the LinkPicker hands the target
        // back without a refine step. Excerpt mode never lands here; it
        // routes through the refine screens which do their own pick.
        if (linkPickerOnPickRef.current) linkPickerOnPickRef.current(target, item);
        closeLinkPicker();
      } : null
    }),
    linkRefineRequest && linkRefineRequest.kind === 'verse' && linkPickerSource && React.createElement(VersePickerScreen, {
      refineRequest: linkRefineRequest,
      sourceKey: linkPickerSource.key, sourceLabel: linkPickerSource.label,
      sourceStart: linkPickerSource.start, sourceEnd: linkPickerSource.end,
      sourceText: linkPickerSource.text,
      setHlTick: setHlTick,
      returnTargetInsteadOfLink: !!linkPickerMode,
      // Link mode: confirm passes new link object; back passes null.
      // Picker mode: confirm passes refined target → hand to onPick + close.
      onClose: (result) => {
        if (linkPickerMode) {
          if (result && linkPickerOnPickRef.current) linkPickerOnPickRef.current(result);
          if (result) { closeLinkPicker(); } else { setLinkRefineRequest(null); }
          return;
        }
        setLinkRefineRequest(null);
        if (result) setLastLinkCreated(result);
      }
    }),
    linkRefineRequest && linkRefineRequest.kind === 'excerpt' && linkPickerSource && React.createElement(LetterExcerptPickerScreen, {
      refineRequest: linkRefineRequest,
      sourceKey: linkPickerSource.key, sourceLabel: linkPickerSource.label,
      sourceStart: linkPickerSource.start, sourceEnd: linkPickerSource.end,
      sourceText: linkPickerSource.text,
      setHlTick: setHlTick,
      returnTargetInsteadOfLink: !!linkPickerMode,
      onClose: (result) => {
        if (linkPickerMode) {
          if (result && linkPickerOnPickRef.current) linkPickerOnPickRef.current(result);
          if (result) { closeLinkPicker(); } else { setLinkRefineRequest(null); }
          return;
        }
        setLinkRefineRequest(null);
        if (result) setLastLinkCreated(result);
      }
    }),
    noteSheetTarget && React.createElement(NoteSheet, {
      // key forces a remount whenever the target group OR the edit-mode
      // intent changes — otherwise the internal `useState(startInEditMode ?
      // 'edit' : 'read')` captures the first prop value and never updates,
      // so opening a fresh note in edit mode after reading another note
      // would silently land in read mode.
      key: noteSheetTarget.groupId + ':' + (noteSheetTarget.startInEditMode ? 'edit' : 'read'),
      groupId: noteSheetTarget.groupId,
      startInEditMode: noteSheetTarget.startInEditMode,
      hlTick: hlTick, setHlTick: setHlTick, onClose: closeNoteSheet,
      onOpenNotebookPicker: (gid) => setNotebookPickerTarget(gid)
    }),
    notebookPickerTarget && React.createElement(NotebookPickerSheet, {
      groupId: notebookPickerTarget,
      hlTick: hlTick, setHlTick: setHlTick,
      onClose: () => setNotebookPickerTarget(null)
    }),
multiNotePayload && React.createElement(MultiNotePopover, {
      payload: multiNotePayload,
      onClose: () => setMultiNotePayload(null),
      onPick: (gid) => { setMultiNotePayload(null); setNoteSheetTarget({ groupId: gid, startInEditMode: false }); }
    }),
    bookmarkPopoverPayload && React.createElement(BookmarkPopover, {
      // BookmarkPopover's signature is ({ bkmIds, x, y, onClose,
      // onNavigate, onDeleteDone }) — pass the unpacked payload, not a
      // `payload` prop. (Pre-2026-05-20 this render passed `payload` +
      // `onNavigateToSource`, which the component never read, so the
      // popover silently returned null. Fixed: real props now.)
      bkmIds: bookmarkPopoverPayload.bkmIds,
      x: bookmarkPopoverPayload.x,
      y: bookmarkPopoverPayload.y,
      onNavigate: (bkm) => {
        // Resolve the bookmark's source hlKey to an endpoint, then route
        // through navigateToLink so the back-pill is wired. Mirrors the
        // BookmarkCreateSheet "Open Source" path below.
        const endpoint = (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(bkm.hlKey) : null;
        setBookmarkPopoverPayload(null);
        if (endpoint) navigateToLink(endpoint, { sourceLetterTitle: 'Bookmark' });
      },
      onDeleteDone: () => setHlTick(t => t + 1),
      onClose: () => setBookmarkPopoverPayload(null)
    }),
    // BookmarkCreateSheet — pre-commit form for new bookmarks. Opens
    // from SelectionToolbar's Bookmark action and from the chapter-
    // bookmark NavButton (both via window.__bookmarkCreate). Saving
    // commits to BookmarkStore + bumps hlTick so the inline icon
    // pulse fires on the source passage.
    // Journal inbound sheet — triggered by tapping the journal chip in
    // letter/chapter nav (or anywhere else that calls __openJournalInbound).
    inboundJournalPayload && typeof JournalInboundSheet !== 'undefined' && React.createElement(JournalInboundSheet, {
      refKey: inboundJournalPayload.refKey,
      resourceLabel: inboundJournalPayload.label,
      onClose: () => setInboundJournalPayload(null),
      onOpenEntry: (entry) => {
        setInboundJournalPayload(null);
        if (entry && entry.id) goJournalViewer(entry.id);
      }
    }),

    bookmarkCreatePending && React.createElement(BookmarkCreateSheet, {
      pending: bookmarkCreatePending,
      onCancel: () => setBookmarkCreatePending(null),
      onConfirm: (bkm) => {
        if (!bkm || !bkm.hlKey) { setBookmarkCreatePending(null); return; }
        if (bkm.editId) {
          // EDIT mode — update existing record.
          BookmarkStore.update(bkm.editId, { label: bkm.label, thought: bkm.thought || '' });
        } else {
          // CREATE mode — insert new.
          BookmarkStore.add({
            id: (typeof bkmId === 'function') ? bkmId() : ('bkm_' + Date.now()),
            hlKey: bkm.hlKey,
            label: bkm.label,
            thought: bkm.thought || '',
            created: Date.now(),
            updated: Date.now()
          });
        }
        setBookmarkCreatePending(null);
        setHlTick(t => t + 1);
      },
      onDelete: (editId) => {
        if (editId && typeof BookmarkStore !== 'undefined') BookmarkStore.remove(editId);
        setBookmarkCreatePending(null);
        setHlTick(t => t + 1);
      },
      onOpen: (editId) => {
        if (!editId) return;
        const bkm = BookmarkStore.get(editId);
        if (!bkm) { setBookmarkCreatePending(null); return; }
        // Navigate to the bookmark's source. Mirror BookmarkPopover's nav path.
        const endpoint = (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(bkm.hlKey) : null;
        setBookmarkCreatePending(null);
        if (endpoint) navigateToLink(endpoint, { sourceLetterTitle: 'Bookmark' });
      }
    })
    ));

}

export { App };
