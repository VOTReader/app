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
const { useState, useEffect } = React;

function App() {
  // screens: "home" | "scriptures-home" | "volumes-home" | "matthew-idx" | "matthew-ch" | "bible-idx" | "bible-ch" | "vot-index" | "vot-letter" | "search"
  /* sharedViewProps / _navToChapter / _idxNav → declared as const right
     before return() (P8a). Previously assigned inline-via-`void(... = ...)`
     mid-JSX; that pattern leaked render-time-only state into outer scope
     and prevented ROUTES (the Phase 2 screen-router pilot) from
     referencing them. Now they're plain consts at the top of the
     render-prep block where ROUTES can use them. */

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
     SHEET / OVERLAY STATE — tracks which sheets/sidebars are open.
     (W7.3 removed the hlTick counter; the imperative DOM annotation
     layer now re-applies off store subscriptions in useDomAnnotationSync.)
  ═══════════════════════════════════════════════════════════════ */
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
  });

  /* navigateToLink — the cross-app deep-linking router (the _navToLinkRef
     three-part deferred-body pattern) → src/hooks/use-navigate-to-link.js
     (P6j). The hook is called further down, after journalEntryId —
     setJournalEntryId is one of its params. navigateToLink has no consumer
     before that call site. */

  /* bridge effects (__openLinkSidebar, __showAnnChip, __showMultiNote,
     __openBookmarkPopover) → src/hooks/use-sheet-orchestration.js (P6h) */
  // Soft-keyboard height → --keyboard-height CSS var (visualViewport), so
  // input-owning overlays lift above the IME. Mount-only → extracted to
  // src/hooks/use-keyboard-inset.js (P11).
  useKeyboardInset();
  // Keep the tab/window title in sync with the active screen (W4.6).
  useDocumentTitle({ activeTab });
  // Desktop keyboard shortcuts (web only): / + Ctrl+F search, arrows = chapter nav (W4.2).
  useDesktopKeyboard();
  /* __bookmarkCreate, inboundJournalPayload, __openJournalInbound,
     __bookmarkEdit, auto-dismiss effect → src/hooks/use-sheet-orchestration.js (P6h) */
  /* DOM annotation re-apply layer → mounted as <AnnotationDomSync/> in the
     render tree below (NOT a hook call here) so a store mutation re-renders
     only that null leaf, not all of App() (U5). It reads noteSheetTarget +
     setNoteSheetTarget from useSheetOrchestration, passed down as props. */

  /* TAB MANAGEMENT — openNewTab / switchToTab / closeTab / closeOtherTabs
     / closeTabsToTheRight / closeAllTabs / deduplicateTabs + the 4 tab-UI
     state slots (tabActionIdx, disableTabsPromptOpen, lastTabCloseStrikes)
     → src/hooks/use-tab-actions.js (P6k Commit B).
     The useTabActions() call is further down, after useReadingDwell —
     it needs cancelDwell + setTabThumbnails. tabsOverviewOpen stays here
     (useThumbnails consumes it as a param, before useTabActions runs). */
  // Tabs Overview is an app-level overlay, not a per-tab screen.
  // That way, switching tabs unmounts the overview cleanly and the
  // individual tabs never carry a stale "tabs" screen.
  const [tabsOverviewOpen, setTabsOverviewOpen] = useState(false);
  /* tabActionIdx / disableTabsPromptOpen / lastTabCloseStrikes
     → src/hooks/use-tab-actions.js (P6k Commit B) */
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
  /* prophecyCardStatesRef + saveProphecyCardStates + setLastReadForVol +
     selectMatthewCh/BibleCh + goToLastRead → src/hooks/use-reading-position-nav.js
     (P7h, called below — needs setActiveReadKey from useReadingDwell). */
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

  // One-time reclaim of stale search-index cache generations at boot. The
  // vot-search-cache DB accumulated a fresh ~21 MB serialized index per
  // dataSignature() change (corpus edit / schema bump / translation switch)
  // and never evicted the superseded copies — hundreds of MB of dead index
  // on long-lived installs. purgeStaleCache() is a CHEAP standalone IDB
  // key-deletion (it does NOT build or load an index), so it runs here at
  // boot rather than being gated behind VotSearch.init() (which only fires
  // when the user opens Search — they might not for days). Keeps only the
  // current-signature entries; idempotent; fire-and-forget.
  useEffect(() => {
    if (window.VotSearch && typeof window.VotSearch.purgeStaleCache === 'function') {
      window.VotSearch.purgeStaleCache(settings.translation || 'nkjv').catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time boot reclaim; deliberately runs once on mount, not per translation change (saveToCache self-evicts thereafter).
  }, []);

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
  // Per-tab focus-mode overrides. Each tab has independent state.
  const [titleFocusHidden, setTitleFocusHidden] = tabField('titleFocusHidden');
  const [headingsFocusHidden, setHeadingsFocusHidden] = tabField('headingsFocusHidden');
  /* showWelcome / isOnline / dismissWelcome → src/hooks/use-app-shell-effects.js
     (P7k, called below — needs setNavOrigin which is the next tabField). */
  // Tab-local search/nav breadcrumbs (each tab has its own search context).
  // searchQuery / searchOrigin / searchScope / searchContext tabFields →
  // owned by useSearch (P7c, called below).
  const [fromSearch, setFromSearch] = tabField('fromSearch');
  const [fromWtlb, setFromWtlb] = tabField('fromWtlb');
  const [fromSurprise, setFromSurprise] = tabField('fromSurprise');
  const [navOrigin, setNavOrigin] = tabField('navOrigin');

  /* AppShell-level leftover effects + small state (P7k — closes Phase 1).
     showWelcome / isOnline / dismissWelcome. */
  const { showWelcome, setShowWelcome, isOnline, dismissWelcome } = useAppShellEffects({
    setNavOrigin, setScreen,
  });

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

  /* Bible Studies domain — STUDIES + UNIFIED_CHAIN + lookups + study
     nav. Called HERE (right after useReadingDwell, so setActiveReadKey
     is in scope) so its returned getStudyById / selectStudy /
     selectStudyChapter are available as PARAMS for useReadingPositionNav
     (just below — goToLastRead uses them for the 'bible-study-' branch).
     Moved here from "right after useNav" in P7h to clear the TDZ for
     useReadingPositionNav. */
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

  /* Reading-cursor coordination (P7h). Owns setLastReadForVol +
     selectMatthewCh/BibleCh + goToLastRead + prophecyCardStatesRef +
     saveProphecyCardStates. Called HERE (between useBibleStudies and
     useTapThrough) because:
       - needs setActiveReadKey from useReadingDwell + getStudyById /
         selectStudy / selectStudyChapter from useBibleStudies (above)
       - returns setLastReadForVol which useTapThrough (just below)
         consumes as a PARAM. */
  const {
    prophecyCardStatesRef, saveProphecyCardStates,
    setLastReadForVol,
    selectMatthewCh, selectBibleCh,
    goToLastRead,
  } = useReadingPositionNav({
    bookId,
    activeReadKey, lastReadLetterMap, lastReadChapters,
    setLetterId, setBookId, setChapterNum, setScreen,
    setActiveReadKey,
    setLastReadLetterMap, setLastReadChapters,
    getStudyById, selectStudy, selectStudyChapter,
  });

  /* Tap-through openers (P7f). goToLetterFromMatthew + openInAppLetter
     both push onto fromLetterStack (from useFromLetterStack above) AND
     consume setActiveReadKey (from useReadingDwell) + setLastReadForVol
     (from useReadingPositionNav just above). The fromMatthewCh tabField
     is hoisted with it so setFromMatthewCh is in scope. */
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
    lastTabCloseStrikes, MAX_TABS,
  } = useTabActions({ tabState, cancelDwell, setTabThumbnails });

  /* vot-state persistence sink → src/hooks/use-persisted-state.js (P6k+1).
     8 params: tabs/activeTabIdx (useTabs), activeReadKey (useReadingDwell),
     settings (useSettings) are hook returns; theme/lastReadChapters/
     lastReadLetterMap/readItems are still App-local useState. */
  usePersistedState({
    tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap,
    activeReadKey, settings, readItems,
  });

  // Q8/PF6 lazy-load: BOOKS / MATTHEW / the VOT corpora — and the lazy screen
  // bundle (Settings/Search/Garden, PF6) — are undefined until their loaders
  // resolve. useLazyBundles subscribes App() to all four so a loading route
  // swaps to the real screen the moment each arrives. (Folded out of App()
  // into a bundle-b hook to keep this file under its 800-line canary.)
  useLazyBundles();
  const _MATTHEW = (typeof MATTHEW !== 'undefined') ? MATTHEW : null;
  const ALL_BOOKS = {
    ...(_MATTHEW ? { matthew: _MATTHEW } : {}),
    ...(typeof BOOKS !== 'undefined' ? BOOKS : {})
  };
  window.__ALL_BOOKS = ALL_BOOKS; // expose for parseScriptureRef()
  const book = bookId ? ALL_BOOKS[bookId] : null;
  const chapter = book && chapterNum != null ? book.chapters.find((c) => c.num === chapterNum) : null;
  function _findLetter(volKey) {
    if (!letterId) return null;
    var col = COL_BY_KEY.get(volKey);
    var arr = colLetterArr(col), pref = colPreface(col);
    return arr.find(function(l) { return l.id === letterId; }) || (pref && pref.id === letterId ? pref : null);
  }
  // F3: resolve only the ACTIVE letter's volume (screen -> its collection ->
  // its array) instead of brute-scanning all 15 collections every render. NOT
  // memoized on letterId: colLetterArr reads the lazy VOT corpus live, so a
  // cold-opened letter would freeze at null (the documented staleness trap).
  const _activeCol = letterId ? COL_BY_LETTER_SC.get(screen) : null;
  const activeVolKey = _activeCol ? _activeCol.volKey : null;
  const activeLetter = activeVolKey ? _findLetter(activeVolKey) : null;

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

  /* W1.5(b) — History API sync. Watches the per-active-tab nav-key tuple
     and pushes an empty-state history entry on every change. Required
     prerequisite for W1.5(d)'s popstate listener (without this layer
     there are zero browser history entries to pop). Web-only — skips on
     Android via window.AndroidBridge guard. See use-history-sync.js for
     the design + the _suppressNextPush carve-out that (c)/(d) use to
     prevent back-induced navigations from re-pushing entries. */
  useHistorySync({
    screen, bookId, chapterNum, letterId, studyId, studyChapterId,
    genreId, gardenPage,
  });

  /* useBibleStudies() call → moved UP to right after useReadingDwell
     (P7h) so its returns are in scope for useReadingPositionNav. */

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

  const { createAndEditJournal } = useJournalMutations({
    setJournalEntryId, setScreen,
  });

  /* Reading-chain boundary navigation (P7i). Cross-volume chain
     (Revelation → V1 → ... → Garden) + within-Bible book prev/next.
     The Revelation → Volume One bridge is the load-bearing intersection
     (Bible side's `next from Rev last` → chain side's `Volume One first`).
     All deps in scope by here: book/chapter (above), setActiveReadKey
     (useReadingDwell), setLastReadForVol (useReadingPositionNav),
     goToGardenFirst (useNav). */
  const {
    boundaryConfig,
    bcvPrevBook, bcvOnPrevBook, bcvPrevBoundaryTitle,
    bcvNextBook, bcvOnNextBook, bcvNextBoundaryTitle,
  } = useReadingChainNav({
    book, chapter, bookId,
    setBookId, setChapterNum, setScreen, setLetterId,
    setActiveReadKey, setLastReadForVol, goToGardenFirst,
  });

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

  /* ── Category → sub-section routing ── */
  const handleScriptureSelect = (id, clearGenre) => {
    if (clearGenre) setGenreId(null);
    if (id === "matthew") {setBookId("matthew");setChapterNum(null);setScreen("matthew-idx");} else
    if (typeof BOOKS !== 'undefined' && BOOKS[id]) {setBookId(id);if (BOOKS[id].chapters.length === 1) {setChapterNum(1);setScreen("bible-ch");} else {setChapterNum(null);setScreen("bible-idx");}}
  };
  const handleVolumeSelect = (id) => {
    const col = COL_BY_CARD.get(id);
    if (col && col.indexScreen) { setScreen(col.indexScreen); return; }
    if (id === "garden") {
      if (GardenWarningFlagStore.is()) setScreen("garden-view");
      else setGardenWarningOpen(true);
    }
  };

  /* handleSearchSelect (80-line result dispatcher) + handleSearchCommand
     → src/hooks/use-search.js (P7c). Both are returned by useSearch
     (called below, after handleSurprise — the search hook takes
     handleSurprise as a param for its 'random' command, same TDZ
     pattern as P7a's useNavHistoryTracking). */

  /* useNavHistoryTracking(...) call → moved below, alongside useAndroidBack —
     getStudyById / getStudyChapter are `const` arrow helpers defined in the
     Bible Studies block (~90 lines down) and would be in TDZ here. Mirrors
     the same "call must follow its const-helper deps" arrangement that
     P6l uses for useAndroidBack. Extracted to src/hooks/use-nav-history-
     tracking.js (P7a — first App() decomposition extraction). */

  const fromMatthewChRef = useRefMirror(fromMatthewCh);  // also used in the render (~line 3001)

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
        // U1: only sweep when the journal store is fully hydrated. If it is
        // still pending/degraded (slow IDB, or a fresh import that hasn't
        // rebased yet), collectAllMediaIds() under-reports referenced blobs and
        // the prune would irreversibly delete real (or just-imported) media.
        // Skipping is safe: an orphan blob is harmless leftover space, swept on
        // a later boot once the store loads in time.
        if (!JournalStore.isReady()) {
          console.info('Journal media orphan sweep skipped — store not ready (' + JournalStore.getState() + ')');
          return;
        }
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
      window.navHandoff.clear('pendingHighlight');
      setScreen("home");setBookId(null);setChapterNum(null);
    };
    return () => {if (window.__goHome) delete window.__goHome;};
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: window.__goHome wired once + cleaned up at unmount. setFromSearch/setFromWtlb/setFromLetterStack/setScreen/setBookId/setChapterNum are all useState setters from useTabs/useFromLetterStack (identity-stable per React invariant).
  }, []);

  /* ── Home category selector ── */
  const handleSelect = (id) => {
    if (id === "scriptures") goScripturesHome();else
    if (id === "volumes") goVolumesHome();else
    if (id === "studies") {setFromStudies(false);setGenreId(null);goStudiesHome();}else
    if (id === "library") goLibrary();
  };

  /* handleSurprise → src/hooks/use-surprise.js (P7j). */
  const { handleSurprise } = useSurprise({
    setSurpriseAnchor, setFromSurprise,
    setBookId, setChapterNum, setScreen, setLetterId,
    setActiveReadKey, setLastReadForVol, selectStudyChapter,
  });

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

  /* useAndroidBack — the window.handleAndroidBack routing handler + its 9
     call-time ref mirrors. Extracted to src/hooks/use-android-back.js
     (P6l — the last P6 hook). The widest param surface in the app: it is
     the most-coupled handler, depending on nav state + the App-local
     nav-helper glue + cancelDwell + the fromLetter stack. Called here,
     after every nav helper it threads (goStudiesHome is the last one). */
  useAndroidBack({
    screen, bookId, genreId, fromSearch, fromStudies, fromMatthewCh, studyId, fromWtlb, fromSurprise,
    tabsOverviewOpen, journalEntryId, fromLetterRef,
    setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId,
    setFromLetterStack, setFromSearch, setFromStudies, setFromWtlb, setFromMatthewCh, setFromSurprise,
    setTabsOverviewOpen, setSurpriseAnchor,
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

  /* ── Ephesians / Hebrews ── */

  const tabsCtxValue = React.useMemo(() => ({
    enabled: !!settings.tabsEnabled,
    count: tabs.length,
    activeIdx: activeTabIdx,
    onOpen: goTabs,
    isOnTabsScreen: tabsOverviewOpen
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goTabs is an App()-local nav helper (line 554) whose body only calls state setters + reads stable values; adding it to deps would force this useMemo to rebuild on every parent render (since goTabs identity changes per render), defeating the memoization. The TabsContext consumers only need a fresh value when the LISTED deps change.
  }), [settings.tabsEnabled, tabs.length, activeTabIdx, tabsOverviewOpen]);

  // ── ROUTES — built by src/ui/screen-routes.jsx ──────────────────────
  // The 53-entry dispatch table that decides which screen renders.
  // Factory function takes every App() closure dep as an explicit prop
  // (no spread). Called once per render — cheap object-literal build.
  // The 5 prop-builder helpers (colIdxProps/colReadNavProps/_idxNav/
  // sharedViewProps/_navToChapter) live INSIDE buildScreenRoutes since
  // they're only used by ROUTES entries; the factory's destructure
  // already captures every primitive they need.
  const ROUTES = buildScreenRoutes({
    screen, setScreen,
    bookId, setBookId, chapterNum, setChapterNum,
    letterId, setLetterId,
    studyId, setStudyId, studyChapterId, setStudyChapterId,
    fromStudies, setFromStudies,
    mode, setMode, showStudy, setShowStudy,
    genreId, surpriseAnchor, setSurpriseAnchor,
    theme, setTheme,
    settings, setSettings, toggleSetting, updateSetting,
    titleFocusHidden, setTitleFocusHidden,
    headingsFocusHidden, setHeadingsFocusHidden,
    activeReadKey, setActiveReadKey,
    lastReadChapters, setLastReadChapters,
    lastReadLetterMap, setLastReadForVol,
    readItems, readHistory,
    markRead, unmarkRead, isRead, clearReadForBook, clearAllProgress, clearHistory, pruneHistoryDay,
    activeLetter, activeVolKey,
    book, chapter,
    goHome, goNavOrigin, goSearch, goHistory, goSettings, goAbout,
    goVolumesHome, goScripturesHome, goScriptureGenre, goBibleIdx, goMatthewIdx,
    goStudiesHome,
    goNotesIndex, goLinksIndex, goBookmarksIndex, goJournalHub, goHighlightsIndex,
    goJournalViewer, goJournalEditor,
    goSearchOrigin, goColIdx,
    handleSelect, handleSurprise, handleScriptureSelect, handleVolumeSelect,
    handleSearchSelect, handleSearchCommand,
    selectMatthewCh, selectBibleCh, selectStudy, selectStudyChapter,
    getStudyById, getStudyChapter, studyReadKey,
    prevChainEntry, nextChainEntry, goToChainEntryFirst, goToChainEntryLast,
    studiesLoading, UNIFIED_CHAIN,
    searchQuery, setSearchQuery, searchScope, setSearchScope, searchContext,
    journalEntryId, createAndEditJournal,
    openInAppLetter, openLinkSidebar, navigateToLink,
    backHint, tapThroughBack, goToLetterFromMatthew,
    setNavOrigin, setNoteSheetTarget,
    setShowWelcome,
    bcvPrevBook, bcvNextBook, bcvOnPrevBook, bcvOnNextBook,
    bcvPrevBoundaryTitle, bcvNextBoundaryTitle,
    prophecyCardStatesRef, saveProphecyCardStates,
    fromMatthewChRef, setFromMatthewCh,
    setFromWtlb,
    boundaryConfig,
    gardenPage, setGardenPage,
  });

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

      {/* All 4 ephemeral overlays (welcome modal, tabs overview +
          TabActionSheet, disable-tabs prompt, garden warning) \u2014 see
          AppShellOverlays.jsx. Renders in the same DOM order as
          before, so z-index stacking and click-through behavior are
          preserved. */}
      <AppShellOverlays
        showWelcome={showWelcome} isOnline={isOnline} dismissWelcome={dismissWelcome}
        settings={settings} updateSetting={updateSetting}
        tabsOverviewOpen={tabsOverviewOpen} setTabsOverviewOpen={setTabsOverviewOpen}
        tabs={tabs} activeTabIdx={activeTabIdx} tabThumbnails={tabThumbnails} MAX_TABS={MAX_TABS}
        switchToTab={switchToTab} closeTab={closeTab} openNewTab={openNewTab}
        closeOtherTabs={closeOtherTabs} closeTabsToTheRight={closeTabsToTheRight}
        closeAllTabs={closeAllTabs} deduplicateTabs={deduplicateTabs}
        tabActionIdx={tabActionIdx} setTabActionIdx={setTabActionIdx}
        lastTabCloseStrikesRef={lastTabCloseStrikes}
        disableTabsPromptOpen={disableTabsPromptOpen} setDisableTabsPromptOpen={setDisableTabsPromptOpen}
        gardenWarningOpen={gardenWarningOpen} setGardenWarningOpen={setGardenWarningOpen}
        setSettings={setSettings} setScreen={setScreen}
      />

      {/* Per-screen render slot \u2014 dispatch table built right above the
          return; renders the active screen (or null if no route matches).

          W2.8: wrapped in an inner ErrorBoundary so a render crash in
          the active screen (e.g. corrupted IDB data from a future
          import path) doesn't take down the entire app via the outer
          boundary. The outer boundary still catches anything that
          escapes (chrome, sheets, overlays). The `key={screen}` makes
          the boundary remount on navigation \u2014 React's normal
          screen-component-type change already causes a full remount
          of the route subtree, so the keyed boundary adds no extra
          work, but it auto-clears the error state so the user can
          recover by tapping a different screen in the header chrome.

          This is the load-bearing safety net for the W2.6 import
          path: a malformed v2 backup that writes unexpected types
          into a store could crash on the next render. Without the
          inner boundary, the only recovery is reload. With it, the
          user can navigate away to a working screen and either clear
          the bad data via Settings or re-import a good backup. */}
      <ErrorBoundary key={screen}>{ROUTES[screen]?.() ?? null}</ErrorBoundary>
      <AnnotationDomSync screen={screen} letterId={letterId} noteSheetTarget={noteSheetTarget} setNoteSheetTarget={setNoteSheetTarget} />


      {/* ── 12 annotation / link / journal / bookmark sheets and popovers
              (always mounted; each is internally gated on its own state
              slot). See AppShellSheets.jsx. ── */}
      <AppShellSheets
        openLinkPicker={openLinkPicker} openNoteSheet={openNoteSheet} closeNoteSheet={closeNoteSheet}
        annChip={annChip} setAnnChip={setAnnChip}
        linkSidebarKey={linkSidebarKey} closeLinkSidebar={closeLinkSidebar} navigateToLink={navigateToLink}
        linkPickerSource={linkPickerSource} closeLinkPicker={closeLinkPicker}
        linkPickerMode={linkPickerMode} linkPickerOnPickRef={linkPickerOnPickRef}
        linkRefineRequest={linkRefineRequest} setLinkRefineRequest={setLinkRefineRequest}
        lastLinkCreated={lastLinkCreated} setLastLinkCreated={setLastLinkCreated}
        noteSheetTarget={noteSheetTarget} setNoteSheetTarget={setNoteSheetTarget}
        notebookPickerTarget={notebookPickerTarget} setNotebookPickerTarget={setNotebookPickerTarget}
        multiNotePayload={multiNotePayload} setMultiNotePayload={setMultiNotePayload}
        bookmarkPopoverPayload={bookmarkPopoverPayload} setBookmarkPopoverPayload={setBookmarkPopoverPayload}
        bookmarkCreatePending={bookmarkCreatePending} setBookmarkCreatePending={setBookmarkCreatePending}
        inboundJournalPayload={inboundJournalPayload} setInboundJournalPayload={setInboundJournalPayload}
        goJournalViewer={goJournalViewer}
      />
    </TabsContext.Provider>
  );

}

export { App };
