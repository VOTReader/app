/* ═══════════════════════════════════════════════════════════════════════
   App — the composition root (Q2.7-1 → Q2.7-2)
   ═══════════════════════════════════════════════════════════════════════
   This file is the root React component. It composes every screen,
   every sheet, every hook, every store into one orchestrator.

   Extracted from index.html in Q2.7-1 as a verbatim move; JSX
   conversion landed in Q2.7-2.

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
const { useState, useEffect, useCallback } = React;

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
  // Value (_translationTick) is unread; only the setter side effect matters.
  const [_translationTick, setTranslationTick] = useState(0);
  // Increments when bible-studies.js finishes loading — forces a re-render so
  // STUDIES = _studies() picks up the new data. studiesLoading tracks the
  // in-flight state so StudiesHome can show a brief loading indicator.
  // Value (_studiesTick) is unread; only the setter side effect matters.
  const [_studiesTick, setStudiesTick] = useState(0);
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
    linkPickerSource, openLinkPicker, closeLinkPicker,
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
          } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
        }, 70);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setNoteSheetTarget is a useState setter from useSheetOrchestration() (identity-stable per React invariant; eslint can't trace through hook-return destructuring at line 114).
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
    try {return JSON.parse(localStorage.getItem("vot-prophecy-cards") || "{}");} catch (_e) {return {};}
  });
  // Lazy-init: if it's still the initializer function, call it
  if (typeof prophecyCardStatesRef.current === "function") prophecyCardStatesRef.current = prophecyCardStatesRef.current();
  const saveProphecyCardStates = useCallback(() => {
    try {localStorage.setItem("vot-prophecy-cards", JSON.stringify(prophecyCardStatesRef.current));} catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ }
  }, []);
  /* cancelDwell + scheduleDwell + pauseDwell + setActiveReadKey + __onDwellCommit effect → src/hooks/use-reading-dwell.js (P6f) */
  const setLastReadForVol = (volId, id) => {
    setLastReadLetterMap((prev) => ({ ...prev, [volId]: id }));
  };
  /* goToLetterFromMatthew + openInAppLetter → src/hooks/use-tap-through.js (P7f).
     The useTapThrough() call is below useFromLetterStack (which returns
     pushFromLetter, a useTapThrough PARAM). */

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

  /* useTapThrough() call → moved below, after useReadingDwell (which
     returns setActiveReadKey, a useTapThrough PARAM). The fromMatthewCh
     tabField is also moved with it for cleanliness. */
  /* navigateToLink deferred body → src/hooks/use-navigate-to-link.js (P6j) */
  /* readItems / setReadItems / VERSION_ID / getReadKey / isRead / markRead /
     unmarkRead / clearAllProgress / clearReadForBook → useReadProgress
     (P7g, called below — needs settings.markAsRead as a PARAM, so the
     call site is just after useSettings). */
  const [gardenPage, setGardenPage] = tabField('gardenPage');
  const [gardenWarningOpen, setGardenWarningOpen] = useState(false);
  /* useSettings — settings object + mutators + body-class/AndroidBridge
     effect. Extracted to src/hooks/use-settings.js (P6g). */
  const { settings, setSettings, toggleSetting, updateSetting } = useSettings({
    savedSettings: saved.settings,
    theme,
  });

  /* Mark-as-read state + helpers → src/hooks/useMarkAsRead.js (P7g
     `useReadProgress` export). Owns readItems + VERSION_ID +
     getReadKey/isRead/markRead/unmarkRead/clearAllProgress/
     clearReadForBook. Called here so settings.markAsRead is in scope
     for the gate. */
  const {
    readItems, isRead, markRead, unmarkRead,
    clearAllProgress, clearReadForBook,
  } = useReadProgress({
    savedReadItems: saved.readItems,
    markAsReadEnabled: settings.markAsRead,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setClearAllStage is a useState setter from useTabActions() (identity-stable per React invariant; eslint can't trace through hook-return destructuring).
  useEffect(() => {setClearAllStage(0);}, [tabsOverviewOpen]);

  // Per-tab focus-mode overrides. Each tab has independent state.
  const [titleFocusHidden, setTitleFocusHidden] = tabField('titleFocusHidden');
  const [headingsFocusHidden, setHeadingsFocusHidden] = tabField('headingsFocusHidden');
  const [showWelcome, setShowWelcome] = useState(() => {
    try {return !localStorage.getItem('vot-welcomed');} catch (_e) {return true;}
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
    try {localStorage.setItem('vot-welcomed', '1');} catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ }
    setShowWelcome(false);
    // First-time users see the About intro right after the splash. After
    // CONTINUE marks `vot-about-seen`, this path becomes a no-op and the
    // splash just dismisses straight to home on subsequent uses.
    try {
      if (!localStorage.getItem('vot-about-seen')) {
        setNavOrigin({ screen: 'home', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null });
        setScreen('about');
      }
    } catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ }
  };
  // Tab-local search/nav breadcrumbs (each tab has its own search context).
  // searchQuery / searchOrigin / searchScope / searchContext tabFields →
  // owned by useSearch (P7c, called below).
  const [fromSearch, setFromSearch] = tabField('fromSearch');
  /* fromMatthewCh tabField → hoisted above to useTapThrough's call site (P7f). */
  const [fromWtlb, setFromWtlb] = tabField('fromWtlb');
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

  /* Tap-through openers (P7f). goToLetterFromMatthew + openInAppLetter
     both push onto fromLetterStack (from useFromLetterStack above) AND
     consume setActiveReadKey (from useReadingDwell just above) — that's
     why this call site sits HERE, not next to useFromLetterStack. The
     fromMatthewCh tabField is hoisted with it so setFromMatthewCh is
     in scope. */
  const [fromMatthewCh, setFromMatthewCh] = tabField('fromMatthewCh');
  const { goToLetterFromMatthew, openInAppLetter } = useTapThrough({
    screen, bookId, chapterNum, letterId, studyId, studyChapterId,
    pushFromLetter,
    setScreen, setLetterId, setStudyId, setStudyChapterId,
    setFromMatthewCh, setActiveReadKey, setLastReadForVol,
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

  /* App-shell nav surface (20 helpers) → src/hooks/use-nav.js (P7b).
     goTabs / goNavOrigin / goSearch / goSearchOrigin stay below (P7c). */
  const [journalEntryId, setJournalEntryId] = useState(null);
  const {
    goHome, goScripturesHome, goScriptureGenre, goVolumesHome,
    goSettings, goHistory, goAbout, goLibrary,
    goJournalHub, goJournalViewer, goJournalEditor,
    goNotesIndex, goLinksIndex, goBookmarksIndex, goHighlightsIndex,
    goColIdx, goMatthewIdx, goStudiesHome, goBibleIdx, goToGardenFirst,
  } = useNav({
    screen, bookId, chapterNum, letterId, studyId, studyChapterId,
    setScreen, setBookId, setChapterNum, setGenreId,
    setNavOrigin, setFromSearch, setFromWtlb, setFromLetterStack,
    setJournalEntryId, setGardenPage,
  });

  /* Bible Studies domain — STUDIES + UNIFIED_CHAIN + lookups + study
     nav. Called HIGH UP (right after useNav) because P7d cleared the
     TDZ blocker that previously forced this block to live ~line 754.
     useAndroidBack / useNavHistoryTracking / useSearch downstream
     consumers now read getStudyById / getStudyChapter / etc. as hook
     RETURNS (no longer const arrows) → their call-site placements
     became free as a result. (They haven't moved yet; that's deferred
     to keep P7d focused on the extraction itself.) See use-bible-studies.js
     header for the full TDZ-blocker rationale. */
  const {
    getStudyById, getStudyChapter, studyReadKey,
    selectStudy, selectStudyChapter,
    UNIFIED_CHAIN, prevChainEntry, nextChainEntry,
    goToChainEntryFirst, goToChainEntryLast,
  } = useBibleStudies({
    setScreen, setBookId, setChapterNum,
    setStudyId, setStudyChapterId,
    setActiveReadKey, setLastReadChapters, setFromStudies,
  });

  /* useNavigateToLink — the cross-app deep-linking router. Placed here
     because setJournalEntryId (declared above for useNav too) is one of
     its params; its returned navigateToLink has no consumer before this
     point. P6j. */
  const { navigateToLink } = useNavigateToLink({
    closeLinkSidebar, pushFromLetter,
    screen, bookId, chapterNum, letterId, studyId, studyChapterId,
    setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId,
    setSurpriseAnchor, setJournalEntryId,
  });

  /* createAndEditJournal → src/hooks/use-journal-mutations.js (P7e). */
  const { createAndEditJournal } = useJournalMutations({
    setHlTick, setJournalEntryId, setScreen,
  });
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
  /* goSearch / goSearchOrigin / window.__goSearch bridge → src/hooks/use-search.js (P7c). */
  /* addToHistory · clearHistory · pruneHistoryDay → extracted to src/hooks/use-history.js (P6c) */
  /* toggleSetting + updateSetting → src/hooks/use-settings.js (P6g) */

  /* Mark-as-read helpers → useReadProgress (P7g, called above). */

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

  /* goColIdx → src/hooks/use-nav.js (P7b). */

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
      try {acked = !!localStorage.getItem('vot-garden-warning-acked');} catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ }
      if (acked) setScreen("garden-view");else
      setGardenWarningOpen(true);
    }
  };


  /* srchVolLookup / SRCH_VOL_MAP / srchResolveLetterId → src/hooks/use-search.js (P7c). */

  /* handleSearchSelect (80-line result dispatcher) + handleSearchCommand
     → src/hooks/use-search.js (P7c). Both are returned by useSearch
     (called below, after handleSurprise — the search hook takes
     handleSurprise as a param for its 'random' command, same TDZ
     pattern as P7a's useNavHistoryTracking). */

  /* screenRef / bookIdRef / genreIdRef → created inside useAndroidBack (P6l) */

  /* useNavHistoryTracking(...) call → moved below, alongside useAndroidBack —
     getStudyById / getStudyChapter are `const` arrow helpers defined in the
     Bible Studies block (~90 lines down) and would be in TDZ here. Mirrors
     the same "call must follow its const-helper deps" arrangement that
     P6l uses for useAndroidBack. Extracted to src/hooks/use-nav-history-
     tracking.js (P7a — first App() decomposition extraction). */

  const fromMatthewChRef = useRefMirror(fromMatthewCh);  // also used in the render (~line 3001)
  /* fromLetterRef → returned by useFromLetterStack (P6i);
     fromSearchRef / fromStudiesRef / studyIdRef / fromWtlbRef → created inside useAndroidBack (P6l) */
  /* searchOriginRef → owned by useSearch (P7c). */

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: window.__goHome wired once + cleaned up at unmount. setFromSearch/setFromWtlb/setFromLetterStack/setScreen/setBookId/setChapterNum are all useState setters from useTabs/useFromLetterStack (identity-stable per React invariant).
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

  /* Search domain — state + helpers + handlers + window.__goSearch bridge.
     Sits BETWEEN handleSurprise (above) and useAndroidBack (below) by
     necessity: handleSurprise is a useSearch param (the 'random' command
     delegates to it for cross-domain handoff), and useAndroidBack consumes
     goSearchOrigin from useSearch's return. The window where this call
     fits is exactly one slot. Once handleSurprise extracts to useSurprise,
     useSearch can move up to alongside useNav. */
  const {
    searchQuery, setSearchQuery,
    searchScope, setSearchScope,
    searchContext,
    goSearch, goSearchOrigin,
    handleSearchSelect, handleSearchCommand,
  } = useSearch({
    tabField,
    screen, bookId, chapterNum, letterId,
    setScreen, setBookId, setChapterNum, setLetterId,
    setStudyId, setStudyChapterId, setSurpriseAnchor, setFromSearch,
    setActiveReadKey, setLastReadForVol,
    handleSurprise, goSettings, goHome,
  });

  /* ── Matthew ── */
  const selectMatthewCh = (num) => {setChapterNum(num);setScreen("matthew-ch");setActiveReadKey("matthew", () => setLastReadChapters((prev) => ({ ...prev, matthew: num })));};
  /* goMatthewIdx → src/hooks/use-nav.js (P7b). */

  /* STUDIES / getStudyById / getStudyChapter / studyReadKey → src/hooks/use-bible-studies.js (P7d). */

  /* goStudiesHome → src/hooks/use-nav.js (P7b). */

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
    getStudyById,
  });

  /* Auto-record reading history on nav change. Threads in the same
     getStudyById / getStudyChapter consts as useAndroidBack — both calls
     have to live below the Bible Studies block for the same TDZ reason. */
  useNavHistoryTracking({
    screen, bookId, chapterNum, letterId, studyId, studyChapterId,
    addToHistory, _findLetter, getStudyById, getStudyChapter,
  });

  /* selectStudy / selectStudyChapter / MATTHEW_CHAIN_ENTRY / CHAIN_ORDER /
     UNIFIED_CHAIN / chainIdx / prevChainEntry / nextChainEntry /
     goToChainEntryFirst / goToChainEntryLast → src/hooks/use-bible-studies.js
     (P7d). All destructured from the useBibleStudies call ~225 lines above. */

  /* ── Ephesians / Hebrews ── */
  const selectBibleCh = (num) => {setChapterNum(num);setScreen("bible-ch");setActiveReadKey(bookId, () => setLastReadChapters((prev) => ({ ...prev, [bookId]: num })));};
  /* goBibleIdx → src/hooks/use-nav.js (P7b). */

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
  /* goToGardenFirst → src/hooks/use-nav.js (P7b). */

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goTabs is an App()-local nav helper (line 554) whose body only calls state setters + reads stable values; adding it to deps would force this useMemo to rebuild on every parent render (since goTabs identity changes per render), defeating the memoization. The TabsContext consumers only need a fresh value when the LISTED deps change.
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

  return (
    <TabsContext.Provider value={tabsCtxValue}>
      {/* CSS is now a static app.css loaded via <link> in <head> — this slot
          intentionally renders nothing (null is a valid no-op React child). */}
      {null}

      {settings.showReadingDot && activeReadKey && !LETTER_SCREEN_SET.has(screen) && !["matthew-ch", "bible-ch", "search", "garden-view", "settings", "history", "library", "notes-index", "links-index", "bookmarks-index", "highlights-index", "journal-home", "journal-viewer", "journal-editor", "about"].includes(screen) && (
        <button className="reading-dot-global" onClick={goToLastRead} title="Resume reading">
          <span className="rdg-inner" />
        </button>
      )}

      {showWelcome && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundImage: 'url("splash.jpg")',
          backgroundColor: '#0a0e1a',
          backgroundSize: 'contain', backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={dismissWelcome}
              style={{
                margin: 'calc(var(--inset-top, 0px) + 1rem) 1rem 0 0',
                background: 'rgba(0,0,0,0.55)', border: '1.5px solid rgba(255,255,255,0.35)',
                borderRadius: '50%', width: '2.4rem', height: '2.4rem',
                color: '#fff', fontSize: '1.2rem', lineHeight: 1,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
              {"\u2715"}
            </button>
          </div>

          {isOnline && (
            <a
              href="https://www.thevolumesoftruth.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                position: 'absolute', left: '50%', top: '37%', transform: 'translateX(-50%)',
                width: '60%', maxWidth: '400px', height: '8%',
                zIndex: 1, borderBottom: '1.5px solid #6cacf0'
              }}
            />
          )}
        </div>
      )}

      {settings.tabsEnabled && tabsOverviewOpen && (
        <div className="tabs-overview-layer">
          <ScreenLayout navChildren={
            <>
              <button className="nav-home" onClick={() => setTabsOverviewOpen(false)}>{"\u2190 Back"}</button>
              <HomeBtn />
            </>
          }>
            <TabsOverview
              tabs={tabs}
              activeTabIdx={activeTabIdx}
              onSelect={(i) => {lastTabCloseStrikes.current = 0;switchToTab(i);setTabsOverviewOpen(false);}}
              onClose={(i) => closeTab(i)}
              onNewTab={() => {lastTabCloseStrikes.current = 0;openNewTab();setTabsOverviewOpen(false);}}
              onLongPress={(i) => setTabActionIdx(i)}
              onClearAll={(signal) => {
                // -1 = tap-anywhere-else reset; otherwise advance the stage
                if (signal === -1) {setClearAllStage(0);return;}
                if (clearAllStage === 0) setClearAllStage(1);else
                if (clearAllStage === 1) setClearAllStage(2);else
                {closeAllTabs();setClearAllStage(0);lastTabCloseStrikes.current = 0;}
              }}
              clearAllStage={clearAllStage}
              onDedupe={() => deduplicateTabs()}
              MAX_TABS={MAX_TABS}
              thumbnails={tabThumbnails}
            />
          </ScreenLayout>
        </div>
      )}
      {tabActionIdx != null && (
        <TabActionSheet
          idx={tabActionIdx}
          total={tabs.length}
          onCloseOthers={() => {closeOtherTabs(tabActionIdx);lastTabCloseStrikes.current = 0;}}
          onCloseToRight={() => {closeTabsToTheRight(tabActionIdx);lastTabCloseStrikes.current = 0;}}
          onDismiss={() => setTabActionIdx(null)}
        />
      )}

      {disableTabsPromptOpen && (
        <div className="disable-tabs-overlay" onClick={() => setDisableTabsPromptOpen(false)}>
          <div className="disable-tabs-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="disable-tabs-eyebrow">You keep closing your last tab</div>
            <h2 className="disable-tabs-title">Disable tabs?</h2>
            <div className="disable-tabs-body">{"Tabs let you juggle multiple reading places \u2014 a chapter, a letter, a study in parallel. If you only read one at a time, disabling tabs hides the switcher and this close button. You can re-enable tabs anytime in Settings \u2014 your open tabs will be waiting."}</div>
            <div className="disable-tabs-actions">
              <button
                className="disable-tabs-btn secondary"
                onClick={() => setDisableTabsPromptOpen(false)}>
                Keep Tabs On
              </button>
              <button
                className="disable-tabs-btn primary"
                onClick={() => {
                  updateSetting("tabsEnabled", false);
                  setDisableTabsPromptOpen(false);
                  setTabsOverviewOpen(false);
                }}>
                Disable Tabs
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "settings" && (
        <SettingsScreen
          settings={settings}
          onToggle={toggleSetting}
          onSetting={updateSetting}
          onBack={goNavOrigin}
          onSearch={goSearch}
          onHistory={goHistory}
          readItems={readItems}
          onClearBook={clearReadForBook}
          onClearAll={clearAllProgress}
          onClearHistory={clearHistory}
          historyCount={readHistory.length}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "search" && (
        <SearchScreen
          query={searchQuery}
          onQueryChange={setSearchQuery}
          settings={settings}
          onSettingsChange={(key, val) => setSettings((prev) => ({ ...prev, [key]: val }))}
          onSelect={handleSearchSelect}
          onCommand={handleSearchCommand}
          onBack={goSearchOrigin}
          searchScope={searchScope}
          searchContext={searchContext}
          onToggleScope={() => setSearchScope((prev) => prev ? null : searchContext)}
        />
      )}

      {screen === "home" && (
        <HomeScreen
          onSelect={handleSelect}
          onSurprise={handleSurprise}
          showSurprise={settings.showSurpriseButton}
          onSettings={goSettings}
          onSearch={goSearch}
          onHistory={goHistory}
          historyEnabled={settings.historyEnabled !== false}
          onInfo={() => setShowWelcome(true)}
          onAbout={goAbout}
          history={readHistory}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "about" && (
        <AboutScreen
          onContinue={() => {
            try { localStorage.setItem('vot-about-seen', '1'); } catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ }
            goNavOrigin();
          }}
          onBack={() => {
            try { localStorage.setItem('vot-about-seen', '1'); } catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ }
            goNavOrigin();
          }}
          onSearch={goSearch}
          onHistory={goHistory}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "history" && (
        <HistoryScreen
          history={readHistory}
          onBack={goNavOrigin}
          onSelect={(entry) => {
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
          }}
          onSearch={goSearch}
          onSettings={goSettings}
          onHistory={goHistory}
          onPruneDay={pruneHistoryDay}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "library" && (
        <LibraryScreen
          onBack={goHome}
          onOpenNotes={goNotesIndex}
          onOpenLinks={goLinksIndex}
          onOpenBookmarks={goBookmarksIndex}
          onOpenJournal={goJournalHub}
          onOpenHighlights={goHighlightsIndex}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          historyEnabled={settings.historyEnabled !== false}
          hlTick={hlTick}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "highlights-index" && typeof HighlightsScreen !== 'undefined' && (
        <HighlightsScreen
          onSettings={goSettings}
          onBack={() => setScreen('library')}
          onHome={goHome}
          onNavigateToSource={(endpoint, meta) => {
            if (endpoint) {
              setNavOrigin({ screen: 'highlights-index' });
              navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Highlights' });
            }
          }}
          onSearch={goSearch}
          onHistory={goHistory}
          historyEnabled={settings.historyEnabled !== false}
          hlTick={hlTick} setHlTick={setHlTick}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "journal-home" && typeof JournalHubScreen !== 'undefined' && (
        <JournalHubScreen
          onSettings={goSettings}
          onBack={() => setScreen('library')}
          onHome={goHome}
          onOpenEntry={(eid) => goJournalViewer(eid)}
          onEditEntry={(eid) => goJournalEditor(eid)}
          onCreateEntry={createAndEditJournal}
          onSearch={goSearch}
          onHistory={goHistory}
          historyEnabled={settings.historyEnabled !== false}
          hlTick={hlTick} setHlTick={setHlTick}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "journal-viewer" && typeof JournalViewerScreen !== 'undefined' && (
        <JournalViewerScreen
          onSettings={goSettings}
          entryId={journalEntryId}
          onBack={() => setScreen('journal-home')}
          onHome={goHome}
          onEdit={() => setScreen('journal-editor')}
          onNavigateToLink={(endpoint, meta) => {
            if (endpoint) {
              setNavOrigin({ screen: 'journal-viewer' });
              navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Journal' });
            }
          }}
          onOpenJournalEntry={(eid) => goJournalViewer(eid)}
          onOpenNotebook={(nbId) => {
            // Drop the user straight into that notebook's screen in the Notes
            // hub. __notesReturnCtx is consumed by NotesIndexScreen on mount
            // to pre-drill the right notebook (same channel the back-pill uses).
            window.__notesReturnCtx = { tab: 'notebooks', drilledNbId: nbId };
            setNavOrigin({ screen: 'journal-viewer' });
            setScreen('notes-index');
          }}
          onSearch={goSearch}
          onHistory={goHistory}
          historyEnabled={settings.historyEnabled !== false}
          hlTick={hlTick} setHlTick={setHlTick}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "journal-editor" && typeof JournalEditorScreen !== 'undefined' && (
        <JournalEditorScreen
          onSettings={goSettings}
          entryId={journalEntryId}
          onBack={() => goJournalViewer(journalEntryId)}
          onHome={goHome}
          onSearch={goSearch}
          onHistory={goHistory}
          historyEnabled={settings.historyEnabled !== false}
          hlTick={hlTick} setHlTick={setHlTick}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "notes-index" && (
        <NotesIndexScreen
          onSettings={goSettings}
          onBack={() => setScreen('library')}
          onHome={goHome}
          onOpenNote={(gid) => setNoteSheetTarget({ groupId: gid, startInEditMode: false })}
          onNavigateToSource={(endpoint, meta) => {
            if (endpoint) {
              setNavOrigin({ screen: 'notes-index' });
              // The back-pill renderer prepends "Back to " itself, so we just
              // pass the notebook/list name (e.g. "Uncategorized", "My Notes").
              navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Notes' });
            }
          }}
          onSearch={goSearch}
          onHistory={goHistory}
          historyEnabled={settings.historyEnabled !== false}
          hlTick={hlTick} setHlTick={setHlTick}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "links-index" && (
        <LinksScreen
          onSettings={goSettings}
          onBack={() => setScreen('library')}
          onHome={goHome}
          onNavigateToSource={(endpoint, meta) => {
            if (endpoint) {
              setNavOrigin({ screen: 'links-index' });
              navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Links' });
            }
          }}
          onNavigateToTarget={(endpoint, meta) => {
            if (endpoint) {
              setNavOrigin({ screen: 'links-index' });
              navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Links' });
            }
          }}
          onSearch={goSearch}
          onHistory={goHistory}
          historyEnabled={settings.historyEnabled !== false}
          hlTick={hlTick} setHlTick={setHlTick}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "bookmarks-index" && (
        <BookmarksScreen
          onSettings={goSettings}
          onBack={() => setScreen('library')}
          onHome={goHome}
          onNavigateToSource={(endpoint, meta) => {
            if (endpoint) {
              setNavOrigin({ screen: 'bookmarks-index' });
              navigateToLink(endpoint, meta || { sourceLetterTitle: 'My Bookmarks' });
            }
          }}
          onSearch={goSearch}
          onHistory={goHistory}
          historyEnabled={settings.historyEnabled !== false}
          hlTick={hlTick} setHlTick={setHlTick}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "scriptures-home" && (
        <ScripturesHome
          onSelect={handleScriptureSelect}
          onGenre={goScriptureGenre}
          onBack={goHome}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          onMatthewStudy={() => {setBookId("matthew");setChapterNum(null);setScreen("matthew-idx");}}
          theme={theme} onThemeChange={setTheme}
          layout={settings.scriptureLayout}
        />
      )}

      {screen === "scripture-genre" && genreId && (
        <ScriptureGenre
          genreId={genreId}
          onSelect={handleScriptureSelect}
          onBack={goScripturesHome}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "volumes-home" && (
        <VolumesHome
          onSelect={handleVolumeSelect}
          onBack={goHome}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "matthew-idx" && (
        <ChapterIndex
          book={MATTHEW}
          onSelect={selectMatthewCh}
          onBack={() => {if (fromStudies) {setFromStudies(false);goStudiesHome();} else {goHome();}}}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          currentChapter={settings.showReadingDot && activeReadKey === "matthew" ? lastReadChapters["matthew"] || null : null}
          isRead={(num) => isRead("matthew", num)}
          markAsReadEnabled={settings.markAsRead}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "matthew-ch" && chapter && (() => {
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
        return (
          <>
            <ChapterView
              book={MATTHEW} chapter={chapter} mode={mode} showStudy={showStudy} showEchoes={settings.showInlineEchoes !== false}
              showChapterTitle={settings.showChapterTitle !== false}
              titleFocusHidden={titleFocusHidden}
              setTitleFocusHidden={setTitleFocusHidden}
              onIndex={goMatthewIdx}
              onNavigate={(num) => {setSurpriseAnchor(null);selectMatthewCh(num);}}
              onMarkRead={() => markRead("matthew", chapterNum)}
              markAsReadEnabled={settings.markAsRead}
              showProgressBar={settings.showProgressBar}
              prevBoundary={chainPrev ? { short: studyShortTitle(chainPrev.title), title: studyShortTitle(chainPrev.title) } : null}
              onPrevBoundary={chainPrev ? () => {setFromStudies(true);goToChainEntryLast(chainPrev.slug)();} : null}
              nextBoundary={chainNext ? { short: studyShortTitle(chainNext.title), title: studyShortTitle(chainNext.title) } : null}
              onNextBoundary={chainNext ? () => {setFromStudies(true);goToChainEntryFirst(chainNext.slug)();} : null}
              onSearch={goSearch}
              onSettings={goSettings}
              onHistory={goHistory}
              theme={theme} onThemeChange={setTheme}
              surpriseAnchor={surpriseAnchor}
              onVotLetterClick={goToLetterFromMatthew}
              backHint={backHint} onTapThroughBack={tapThroughBack}
              hlTick={hlTick}
              onLinkOpen={openLinkSidebar}
            />
            <ModeToggle mode={mode} onChange={setMode} showStudy={showStudy} onShowStudyChange={setShowStudy} />
          </>
        );
      })()}

      {screen === "studies-home" && (
        <StudiesHome
          studies={UNIFIED_CHAIN}
          studiesLoading={studiesLoading}
          onSelectStudy={(slug) => {
            if (slug === 'matthew-study') {
              setFromStudies(true);
              setBookId("matthew");setChapterNum(null);setScreen("matthew-idx");
            } else {
              selectStudy(slug);
            }
          }}
          onBack={goHome}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "bible-study-index" && studyId && (() => {
        const study = getStudyById(studyId);
        if (!study) return studiesLoading ? <div className="sc-sheet-loading" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>Loading…</div> : null;
        return (
          <BibleStudyIndex
            study={study}
            onSelect={(chId) => selectStudyChapter(studyId, chId)}
            onBack={goStudiesHome}
            onSearch={goSearch}
            onHistory={goHistory}
            onSettings={goSettings}
            currentChapter={settings.showReadingDot && activeReadKey === studyReadKey(study.slug) ? lastReadChapters[studyReadKey(study.slug)] || null : null}
            isRead={(chId) => isRead(studyReadKey(study.slug), chId)}
            markAsReadEnabled={settings.markAsRead}
            theme={theme} onThemeChange={setTheme}
          />
        );
      })()}

      {screen === "bible-idx" && book && (
        <ChapterIndex
          book={book}
          onSelect={selectBibleCh}
          onBack={genreId ? () => setScreen("scripture-genre") : goScripturesHome}
          onSearch={goSearch}
          onHistory={goHistory}
          onSettings={goSettings}
          currentChapter={settings.showReadingDot && activeReadKey === bookId ? lastReadChapters[bookId] || null : null}
          isRead={(num) => isRead(bookId, num)}
          markAsReadEnabled={settings.markAsRead}
          restoredNames={settings.restoredNames}
          showChapterTitle={settings.showChapterTitle !== false}
          theme={theme} onThemeChange={setTheme}
        />
      )}

      {screen === "bible-ch" && book && chapter && (
        <BibleChapterView
          book={book} chapter={chapter}
          onIndex={book?.chapters.length === 1 ? genreId ? () => setScreen("scripture-genre") : goScripturesHome : goBibleIdx}
          onNavigate={(num) => {setSurpriseAnchor(null);selectBibleCh(num);}}
          onMarkRead={() => markRead(bookId, chapterNum)}
          markAsReadEnabled={settings.markAsRead}
          showProgressBar={settings.showProgressBar}
          translation={settings.translation}
          restoredNames={settings.restoredNames}
          showChapterTitle={settings.showChapterTitle !== false}
          showSectionHeadings={settings.showSectionHeadings !== false}
          titleFocusHidden={titleFocusHidden}
          setTitleFocusHidden={setTitleFocusHidden}
          headingsFocusHidden={headingsFocusHidden}
          setHeadingsFocusHidden={setHeadingsFocusHidden}
          prevBook={bcvPrevBook}
          nextBook={bcvNextBook}
          onPrevBook={bcvOnPrevBook}
          onNextBook={bcvOnNextBook}
          prevBoundaryTitle={bcvPrevBoundaryTitle}
          nextBoundaryTitle={bcvNextBoundaryTitle}
          onSearch={goSearch}
          onSettings={goSettings}
          onHistory={goHistory}
          theme={theme} onThemeChange={setTheme}
          surpriseAnchor={surpriseAnchor}
          backHint={backHint} onTapThroughBack={tapThroughBack}
          hlTick={hlTick} onLinkOpen={openLinkSidebar}
        />
      )}

      {void (_idxNav = function() { return (
        <>
          <button className="nav-home" onClick={goVolumesHome}>{"\u2190 Volumes"}</button>
          <HomeBtn />
          <NavButtons onSettings={goSettings} onHistory={goHistory} onSearch={goSearch} theme={theme} onThemeChange={setTheme} />
        </>
      ); })}

      {screen === "vot-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Volume Two" letters={LETTERS} {...colIdxProps('two')} />
        </ScreenLayout>
      )}

      {screen === "vot-one-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Volume One" letters={LETTERS_V1} preface={LETTERS_V1_PREFACE} {...colIdxProps('one')} />
        </ScreenLayout>
      )}

      {/* ── Shared props passed to every LetterView and WtlbEntryView ── */}
      {void (sharedViewProps = {
        onSearch: goSearch, onSettings: goSettings, onHistory: goHistory,
        theme: theme, onThemeChange: setTheme, surpriseAnchor: surpriseAnchor,
        onInAppLink: openInAppLetter, backHint: backHint, hlTick: hlTick,
        onLinkOpen: openLinkSidebar,
        onBack: () => window.handleAndroidBack && window.handleAndroidBack(),
        markAsReadEnabled: settings.markAsRead, showProgressBar: settings.showProgressBar
      })}
      {void (_navToChapter = (bid, ch) => {setFromWtlb(screen);setBookId(bid);setChapterNum(ch);setScreen("bible-ch");})}

      {screen === "bible-study-chapter" && studyId && studyChapterId && (() => {
        const study = getStudyById(studyId);
        const ch = getStudyChapter(study, studyChapterId);
        if (!study || !ch) return studiesLoading ? <div className="sc-sheet-loading" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>Loading…</div> : null;
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
        return (
          <LetterView
            {...sharedViewProps}
            letter={letterShim}
            studyMode={true}
            volumeLabel={study.title}
            onHome={() => {if (study.chapters.length > 1) {setStudyChapterId(null);setScreen("bible-study-index");} else {goStudiesHome();}}}
            onNavigate={(chId) => {setSurpriseAnchor(null);selectStudyChapter(studyId, chId);}}
            onStudyNavigate={jumpToStudy}
            onLetterClick={handleLetterClick}
            onMarkRead={() => markRead(studyReadKey(study.slug), studyChapterId)}
            onUnmark={() => unmarkRead(studyReadKey(study.slug), studyChapterId)}
            isRead={(id) => isRead(studyReadKey(study.slug), id)}
            prevBoundary={prevEntry ? { short: studyShortTitle(prevEntry.title), title: studyShortTitle(prevEntry.title) } : null}
            onPrevBoundary={prevEntry ? goToChainEntryLast(prevEntry.slug) : null}
            nextBoundary={nextEntry ? { short: studyShortTitle(nextEntry.title), title: studyShortTitle(nextEntry.title) } : null}
            onNextBoundary={nextEntry ? goToChainEntryFirst(nextEntry.slug) : null}
            prophecyCardStatesRef={prophecyCardStatesRef}
            saveProphecyCardStates={saveProphecyCardStates}
          />
        );
      })()}

      {screen === "vot-one-letter" && letterV1 && (
        <LetterView {...sharedViewProps} {...colReadNavProps('one', true)} {...boundaryConfig('one', letterV1)} letter={letterV1} volumeLabel="Volume One" />
      )}

      {screen === "vot-letter" && letter && (
        <LetterView {...sharedViewProps} {...colReadNavProps('two', true)} {...boundaryConfig('two', letter)} letter={letter} />
      )}

      {screen === "vot-three-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Volume Three" letters={LETTERS_V3} preface={LETTERS_V3_PREFACE} {...colIdxProps('three')} />
        </ScreenLayout>
      )}

      {screen === "vot-three-letter" && letterV3 && (
        <LetterView {...sharedViewProps} {...colReadNavProps('three', true)} {...boundaryConfig('three', letterV3)} letter={letterV3} volumeLabel="Volume Three" />
      )}

      {screen === "vot-four-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Volume Four" letters={LETTERS_V4} preface={LETTERS_V4_PREFACE} {...colIdxProps('four')} />
        </ScreenLayout>
      )}

      {screen === "vot-four-letter" && letterV4 && (
        <LetterView {...sharedViewProps} {...colReadNavProps('four', true)} {...boundaryConfig('four', letterV4)} letter={letterV4} volumeLabel="Volume Four" />
      )}

      {screen === "vot-five-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Volume Five" letters={LETTERS_V5} preface={LETTERS_V5_PREFACE} {...colIdxProps('five')} />
        </ScreenLayout>
      )}

      {screen === "vot-five-letter" && letterV5 && (
        <LetterView {...sharedViewProps} {...colReadNavProps('five', true)} {...boundaryConfig('five', letterV5)} letter={letterV5} volumeLabel="Volume Five" />
      )}

      {screen === "vot-six-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Volume Six" letters={LETTERS_V6} preface={LETTERS_V6_PREFACE} {...colIdxProps('six')} />
        </ScreenLayout>
      )}

      {screen === "vot-six-letter" && letterV6 && (
        <LetterView {...sharedViewProps} {...colReadNavProps('six', true)} {...boundaryConfig('six', letterV6)} letter={letterV6} volumeLabel="Volume Six" />
      )}

      {screen === "vot-seven-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Volume Seven" letters={LETTERS_V7} preface={LETTERS_V7_PREFACE} {...colIdxProps('seven')} />
        </ScreenLayout>
      )}

      {screen === "vot-seven-letter" && letterV7 && (
        <LetterView {...sharedViewProps} {...colReadNavProps('seven', true)} {...boundaryConfig('seven', letterV7)} letter={letterV7} volumeLabel="Volume Seven" />
      )}

      {screen === "vot-timothy-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Letters from Timothy" eyebrow="The Volumes of Truth" letters={LETTERS_TIMOTHY} preface={LETTERS_TIMOTHY_PREFACE} {...colIdxProps('timothy')} />
        </ScreenLayout>
      )}

      {screen === "vot-timothy-letter" && letterTimothy && (
        <LetterView {...sharedViewProps} {...colReadNavProps('timothy', true)} {...boundaryConfig('timothy', letterTimothy)} letter={letterTimothy} volumeLabel="Letters from Timothy" />
      )}

      {screen === "vot-flock-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Letters to The Lord's Little Flock" eyebrow="The Volumes of Truth" letters={LETTERS_FLOCK} preface={LETTERS_FLOCK_PREFACE} {...colIdxProps('flock')} />
        </ScreenLayout>
      )}

      {screen === "vot-flock-letter" && letterFlock && (
        <LetterView {...sharedViewProps} {...colReadNavProps('flock', true)} {...boundaryConfig('flock', letterFlock)} letter={letterFlock} volumeLabel="Letters to The Lord's Little Flock" />
      )}

      {screen === "vot-rebuke-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="The Lord's Rebuke" eyebrow="A Testament Against The World" letters={LETTERS_REBUKE} preface={LETTERS_REBUKE_PREFACE} {...colIdxProps('rebuke')} />
        </ScreenLayout>
      )}

      {screen === "vot-rebuke-letter" && letterRebuke && (
        <LetterView {...sharedViewProps} {...colReadNavProps('rebuke', true)} {...boundaryConfig('rebuke', letterRebuke)} letter={letterRebuke} volumeLabel="The Lord's Rebuke" />
      )}

      {screen === "wtlb-one-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Words To Live By" eyebrow={"Part One \xB7 Words of Wisdom"} letters={WTLB_ONE} columns={2} {...colIdxProps('wtlb1')} />
        </ScreenLayout>
      )}

      {screen === "wtlb-one-entry" && wtlb1Entry && (
        <WtlbEntryView {...sharedViewProps} {...colReadNavProps('wtlb1')} {...boundaryConfig('wtlb1', wtlb1Entry)} entry={wtlb1Entry} partLabel="Part One" onNavToChapter={_navToChapter} />
      )}

      {screen === "wtlb-two-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="Words To Live By" eyebrow={"Part Two \xB7 More Words of Wisdom"} letters={WTLB_TWO} columns={2} {...colIdxProps('wtlb2')} />
        </ScreenLayout>
      )}

      {screen === "wtlb-two-entry" && wtlb2Entry && (
        <WtlbEntryView {...sharedViewProps} {...colReadNavProps('wtlb2')} {...boundaryConfig('wtlb2', wtlb2Entry)} entry={wtlb2Entry} partLabel="Part Two" onNavToChapter={_navToChapter} />
      )}

      {screen === "blessed-index" && (
        <ScreenLayout navChildren={_idxNav()}>
          <VolumeLetterIndex volumeTitle="The Blessed" eyebrow="Blessings & Promises" letters={colLetterArr(COL_BY_KEY.get('blessed')).map((e) => ({ ...e, date: e.sourceLabel || '' }))} {...colIdxProps('blessed')} />
        </ScreenLayout>
      )}

      {screen === "blessed-entry" && blessedEntry && (
        <WtlbEntryView {...sharedViewProps} {...colReadNavProps('blessed')} {...boundaryConfig('blessed', blessedEntry)} entry={blessedEntry} partLabel="The Blessed" onNavToChapter={_navToChapter} />
      )}

      {screen === "holy-days-index" && (
        <ScreenLayout navChildren={
          <>
            <button className="nav-home" onClick={goVolumesHome}>{"\u2190 Volumes"}</button>
            <HomeBtn />
            <NavButtons onSettings={goSettings} onHistory={goHistory} onSearch={goSearch} theme={theme} onThemeChange={setTheme} />
          </>
        }>
          {typeof HOLY_DAYS_META !== 'undefined' && (HOLY_DAYS_META.audioPlaylist || HOLY_DAYS_META.videoPlaylist) && (
            <div className="hd-playlists">
              {HOLY_DAYS_META.audioPlaylist && (
                <a className="hd-playlist-btn" href={HOLY_DAYS_META.audioPlaylist} target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <span className="hd-playlist-label">Audio Playlist</span>
                  <span className="hd-playlist-sub">Listen on Bandcamp</span>
                </a>
              )}
              {HOLY_DAYS_META.videoPlaylist && (
                <a className="hd-playlist-btn" href={HOLY_DAYS_META.videoPlaylist} target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <span className="hd-playlist-label">Video Playlist</span>
                  <span className="hd-playlist-sub">Watch on YouTube</span>
                </a>
              )}
            </div>
          )}
          <VolumeLetterIndex volumeTitle="Regarding The Holy Days" eyebrow="The Appointed Times" letters={colLetterArr(COL_BY_KEY.get('holydays')).map((e) => ({ ...e, date: e.date || e.sourceLabel || '' }))} {...colIdxProps('holydays')} />
        </ScreenLayout>
      )}

      {screen === "holy-days-entry" && hdEntry && (() => {
        const bc = boundaryConfig('holydays', hdEntry);
        if (hdEntry.type === 'wtlb') {
          return (
            <WtlbEntryView {...sharedViewProps} {...colReadNavProps('holydays')} {...bc} entry={hdEntry} partLabel="Regarding The Holy Days" onNavToChapter={_navToChapter} footnotesMode={true} />
          );
        }
        const letterShim = { ...hdEntry, prevLetter: hdEntry.prevEntry || null, nextLetter: hdEntry.nextEntry || null };
        return (
          <LetterView {...sharedViewProps} {...colReadNavProps('holydays')} {...bc} letter={letterShim} volumeLabel="Regarding The Holy Days" />
        );
      })()}

      {screen === "hm-letter" && hmEntry && (() => {
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
        return (
          <LetterView {...sharedViewProps} {...colReadNavProps('hm')} letter={letterShim} volumeLabel="Hidden Manna" onHome={goHomeFromHM} onNavigate={(id) => {setLetterId(id);}} />
        );
      })()}

      {screen === "garden-view" && (
        <GardenView
          page={gardenPage}
          onPageChange={(p) => setGardenPage(p)}
          onBack={goVolumesHome}
          theme={theme} onThemeChange={setTheme}
          tier={settings.gardenTier || GARDEN_DEFAULT_TIER}
        />
      )}

      {gardenWarningOpen && (() => {
        const selectedTier = getGardenTier(settings.gardenTier);
        return (
          <div className="garden-warning-overlay" onClick={() => setGardenWarningOpen(false)}>
            <div className="garden-warning-modal" onClick={(e) => e.stopPropagation()}>
              <div className="garden-warning-title">Before You Begin</div>
              <div className="garden-warning-body">
                <em>A Return to The Garden</em> contains <strong>209 high-resolution photographs</strong> totaling approximately <strong>{selectedTier.size}</strong> at the selected quality. Pages stream from the internet as you read and are cached on your device.
                <br /><br />For the best experience, connect to <strong>Wi-Fi</strong> before proceeding. Mobile data charges may apply otherwise.
                <br /><br />Please also ensure your device has sufficient <strong>free storage</strong> available to cache the full collection.
              </div>
              <div className="garden-tier-selector">
                <div className="garden-tier-label">Image Quality</div>
                <div className="garden-tier-hint">You can change this anytime from the Settings menu.</div>
                {GARDEN_TIERS.map((t) => (
                  <button
                    key={t.id}
                    className={`garden-tier-option${settings.gardenTier === t.id ? " selected" : ""}`}
                    onClick={() => setSettings((s) => ({ ...s, gardenTier: t.id }))}>
                    <div className="garden-tier-option-main">
                      <span className="garden-tier-option-name">{t.label}</span>
                      <span className="garden-tier-option-size">{t.size}</span>
                    </div>
                    <div className="garden-tier-option-desc">{t.res}{" \xB7 "}{t.desc}</div>
                  </button>
                ))}
              </div>
              <div className="garden-warning-actions">
                <button className="garden-warning-btn garden-warning-btn-cancel"
                  onClick={() => setGardenWarningOpen(false)}>Go Back</button>
                <button className="garden-warning-btn garden-warning-btn-proceed"
                  onClick={() => {
                    try {localStorage.setItem('vot-garden-warning-acked', '1');} catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ }
                    setGardenWarningOpen(false);
                    setScreen("garden-view");
                  }}>Proceed</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Highlight & Link overlays (always mounted) ── */}
      <SelectionToolbar
        hlTick={hlTick} setHlTick={setHlTick}
        onLinkRequest={openLinkPicker}
        onNoteRequest={openNoteSheet}
        onBookmarkRequest={function(_bkm) { /* bookmark created; icon injected via applyDOMBookmarks */ }}
      />
      {annChip && (
        <AnnotationActionChip
          chip={annChip} setHlTick={setHlTick}
          onClose={() => setAnnChip(null)}
          onNoteRequest={openNoteSheet}
        />
      )}
      {linkSidebarKey && (
        <LinkSidebar
          hlKey={linkSidebarKey} hlTick={hlTick} setHlTick={setHlTick}
          onClose={closeLinkSidebar} onNavigate={navigateToLink}
        />
      )}
      {linkPickerSource && !linkRefineRequest && (
        <LinkPicker
          sourceKey={linkPickerSource.key} sourceLabel={linkPickerSource.label}
          sourceStart={linkPickerSource.start} sourceEnd={linkPickerSource.end}
          sourceText={linkPickerSource.text}
          hlTick={hlTick} setHlTick={setHlTick} onClose={closeLinkPicker}
          onRequestRefine={setLinkRefineRequest}
          lastCreatedLink={lastLinkCreated} onLinkCreated={setLastLinkCreated}
          mode={linkPickerMode}
          onPickTarget={linkPickerMode ? (target, item) => {
            // Card mode short-circuits here — the LinkPicker hands the target
            // back without a refine step. Excerpt mode never lands here; it
            // routes through the refine screens which do their own pick.
            if (linkPickerOnPickRef.current) linkPickerOnPickRef.current(target, item);
            closeLinkPicker();
          } : null}
        />
      )}
      {linkRefineRequest && linkRefineRequest.kind === 'verse' && linkPickerSource && (
        <VersePickerScreen
          refineRequest={linkRefineRequest}
          sourceKey={linkPickerSource.key} sourceLabel={linkPickerSource.label}
          sourceStart={linkPickerSource.start} sourceEnd={linkPickerSource.end}
          sourceText={linkPickerSource.text}
          setHlTick={setHlTick}
          returnTargetInsteadOfLink={!!linkPickerMode}
          // Link mode: confirm passes new link object; back passes null.
          // Picker mode: confirm passes refined target → hand to onPick + close.
          onClose={(result) => {
            if (linkPickerMode) {
              if (result && linkPickerOnPickRef.current) linkPickerOnPickRef.current(result);
              if (result) { closeLinkPicker(); } else { setLinkRefineRequest(null); }
              return;
            }
            setLinkRefineRequest(null);
            if (result) setLastLinkCreated(result);
          }}
        />
      )}
      {linkRefineRequest && linkRefineRequest.kind === 'excerpt' && linkPickerSource && (
        <LetterExcerptPickerScreen
          refineRequest={linkRefineRequest}
          sourceKey={linkPickerSource.key} sourceLabel={linkPickerSource.label}
          sourceStart={linkPickerSource.start} sourceEnd={linkPickerSource.end}
          sourceText={linkPickerSource.text}
          setHlTick={setHlTick}
          returnTargetInsteadOfLink={!!linkPickerMode}
          onClose={(result) => {
            if (linkPickerMode) {
              if (result && linkPickerOnPickRef.current) linkPickerOnPickRef.current(result);
              if (result) { closeLinkPicker(); } else { setLinkRefineRequest(null); }
              return;
            }
            setLinkRefineRequest(null);
            if (result) setLastLinkCreated(result);
          }}
        />
      )}
      {noteSheetTarget && (
        <NoteSheet
          // key forces a remount whenever the target group OR the edit-mode
          // intent changes — otherwise the internal `useState(startInEditMode ?
          // 'edit' : 'read')` captures the first prop value and never updates,
          // so opening a fresh note in edit mode after reading another note
          // would silently land in read mode.
          key={noteSheetTarget.groupId + ':' + (noteSheetTarget.startInEditMode ? 'edit' : 'read')}
          groupId={noteSheetTarget.groupId}
          startInEditMode={noteSheetTarget.startInEditMode}
          hlTick={hlTick} setHlTick={setHlTick} onClose={closeNoteSheet}
          onOpenNotebookPicker={(gid) => setNotebookPickerTarget(gid)}
        />
      )}
      {notebookPickerTarget && (
        <NotebookPickerSheet
          groupId={notebookPickerTarget}
          hlTick={hlTick} setHlTick={setHlTick}
          onClose={() => setNotebookPickerTarget(null)}
        />
      )}
      {multiNotePayload && (
        <MultiNotePopover
          payload={multiNotePayload}
          onClose={() => setMultiNotePayload(null)}
          onPick={(gid) => { setMultiNotePayload(null); setNoteSheetTarget({ groupId: gid, startInEditMode: false }); }}
        />
      )}
      {bookmarkPopoverPayload && (
        <BookmarkPopover
          // BookmarkPopover's signature is ({ bkmIds, x, y, onClose,
          // onNavigate, onDeleteDone }) — pass the unpacked payload, not a
          // `payload` prop. (Pre-2026-05-20 this render passed `payload` +
          // `onNavigateToSource`, which the component never read, so the
          // popover silently returned null. Fixed: real props now.)
          bkmIds={bookmarkPopoverPayload.bkmIds}
          x={bookmarkPopoverPayload.x}
          y={bookmarkPopoverPayload.y}
          onNavigate={(bkm) => {
            // Resolve the bookmark's source hlKey to an endpoint, then route
            // through navigateToLink so the back-pill is wired. Mirrors the
            // BookmarkCreateSheet "Open Source" path below.
            const endpoint = (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(bkm.hlKey) : null;
            setBookmarkPopoverPayload(null);
            if (endpoint) navigateToLink(endpoint, { sourceLetterTitle: 'Bookmark' });
          }}
          onDeleteDone={() => setHlTick(t => t + 1)}
          onClose={() => setBookmarkPopoverPayload(null)}
        />
      )}
      {/* BookmarkCreateSheet — pre-commit form for new bookmarks. Opens
          from SelectionToolbar's Bookmark action and from the chapter-
          bookmark NavButton (both via window.__bookmarkCreate). Saving
          commits to BookmarkStore + bumps hlTick so the inline icon
          pulse fires on the source passage. */}
      {/* Journal inbound sheet — triggered by tapping the journal chip in
          letter/chapter nav (or anywhere else that calls __openJournalInbound). */}
      {inboundJournalPayload && typeof JournalInboundSheet !== 'undefined' && (
        <JournalInboundSheet
          refKey={inboundJournalPayload.refKey}
          resourceLabel={inboundJournalPayload.label}
          onClose={() => setInboundJournalPayload(null)}
          onOpenEntry={(entry) => {
            setInboundJournalPayload(null);
            if (entry && entry.id) goJournalViewer(entry.id);
          }}
        />
      )}

      {bookmarkCreatePending && (
        <BookmarkCreateSheet
          pending={bookmarkCreatePending}
          onCancel={() => setBookmarkCreatePending(null)}
          onConfirm={(bkm) => {
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
          }}
          onDelete={(editId) => {
            if (editId && typeof BookmarkStore !== 'undefined') BookmarkStore.remove(editId);
            setBookmarkCreatePending(null);
            setHlTick(t => t + 1);
          }}
          onOpen={(editId) => {
            if (!editId) return;
            const bkm = BookmarkStore.get(editId);
            if (!bkm) { setBookmarkCreatePending(null); return; }
            // Navigate to the bookmark's source. Mirror BookmarkPopover's nav path.
            const endpoint = (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(bkm.hlKey) : null;
            setBookmarkCreatePending(null);
            if (endpoint) navigateToLink(endpoint, { sourceLetterTitle: 'Bookmark' });
          }}
        />
      )}
    </TabsContext.Provider>
  );

}

export { App };
