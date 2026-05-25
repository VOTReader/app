/* ═══════════════════════════════════════════════════════════════════════
   useNav — App-shell navigation surface (P7b)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS the 20 simple nav-chrome helpers App() used to define inline.
   These are the "go to screen X" callbacks that the home grid, the
   side menu, the library tiles, and the bottom-nav buttons all call.
   They share two patterns this hook canonicalises:

     A) The "navOrigin capture" pattern (8 helpers). goSettings,
        goHistory, goAbout, goLibrary, goJournalHub, goNotesIndex,
        goLinksIndex, goBookmarksIndex, goHighlightsIndex all do:

          setNavOrigin({ screen, bookId, chapterNum, letterId,
                         studyId, studyChapterId });
          setScreen("X");

        The 6-field snapshot was duplicated 8 times in App(). Here it
        becomes a single private `_captureOrigin()` helper.

     B) The "trivial screen-switcher" pattern (rest). goVolumesHome,
        goScripturesHome, goMatthewIdx, goStudiesHome, goBibleIdx,
        goColIdx, etc. are one-liners that setScreen and maybe one
        related state. Grouped here so the entire AppShell-nav surface
        lives in one module.

   OWNED HELPERS:
     - goHome              clears search + wtlb + letter-stack + scroll
                           bridges, sets screen=home + bookId/chapter=null
     - goScripturesHome    setScreen + clear book/chapter/genre
     - goScriptureGenre    setGenreId + setScreen
     - goVolumesHome       setScreen
     - goSettings          _captureOrigin + setScreen
     - goHistory           _captureOrigin + setScreen
     - goAbout             _captureOrigin + setScreen
     - goLibrary           _captureOrigin + setScreen
     - goJournalHub        _captureOrigin + setScreen
     - goJournalViewer     setJournalEntryId + setScreen (no-op if no eid)
     - goJournalEditor     setJournalEntryId + setScreen (no-op if no eid)
     - goNotesIndex        _captureOrigin + setScreen
     - goLinksIndex        _captureOrigin + setScreen
     - goBookmarksIndex    _captureOrigin + setScreen
     - goHighlightsIndex   _captureOrigin + setScreen
     - goColIdx            COL_BY_KEY lookup → setScreen(indexScreen)
     - goMatthewIdx        clear chapter + setScreen
     - goStudiesHome       setScreen
     - goBibleIdx          clear chapter + setScreen
     - goToGardenFirst     setGardenPage(1) + setScreen

   DOES NOT OWN (deferred to a follow-up P7c "useComplexNav" or kept
   inline as App-local helpers — they have wider dependency surfaces
   that this pilot deliberately doesn't tackle):
     - goTabs              needs flushScrollToActiveTab + captureActiveTab
                           Thumbnail (from useThumbnails) + settings.tabsEnabled
     - goNavOrigin         needs navOriginRef + the restore-state-fan-out
     - goSearch            26 lines of search-context computation + the
                           window.__goSearch bridge useEffect
     - goSearchOrigin      needs searchOriginRef
     - goToLastRead        reads activeReadKey + lastReadLetterMap +
                           lastReadChapters; calls selectStudy/getStudyById
                           (Bible Studies block — TDZ-deferred)
     - goNextBibleBook /   needs nextBibleBook/prevBibleBook computed
       goPrevBibleBook     from BIBLE_BOOK_LIST.findIndex
     - goToChainEntryFirst/Last  Bible Studies chain helpers
     - handleSelect, handleSurprise, handleScriptureSelect,
       handleVolumeSelect, handleSearchSelect, handleSearchCommand
                           App-level dispatchers that call this hook's
                           returned helpers — they stay in App() because
                           they wire multiple subsystems together.

   PARAMS (single object — consistent with the other P6/P7 hooks):
     6 nav-state reads:    screen, bookId, chapterNum, letterId,
                           studyId, studyChapterId.
                           Read by _captureOrigin to snapshot the position
                           that the user can return to via Back.
     navigation setters:   setScreen, setBookId, setChapterNum,
                           setLetterId, setGenreId.
     coordination setters: setNavOrigin (capture target),
                           setFromSearch, setFromWtlb, setFromLetterStack
                             (cleared by goHome — the user explicitly
                              going Home means breaking out of any
                              tap-through / search-result chain),
                           setJournalEntryId (set by goJournalViewer/
                             Editor),
                           setGardenPage (reset to 1 by goToGardenFirst).

   RETURNS: { 20 helpers — see OWNED HELPERS above }

   STORAGE: none directly. The setters write through to whichever owner
            (useTabs tabFields, useState locals) the setter came from.

   WINDOW:
     - goHome touches window.__pendingHighlight = null and
       window.__pendingScrollHlKey = null. These are data-slot writes
       (one-shot signals consumed by LetterView's scroll-on-mount path),
       NOT handler bridges — no cleanup needed; the next reader either
       picks up the value or the next writer overwrites.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * App-shell navigation surface. 20 simple "go to X" helpers, owning the
 * navOrigin-capture pattern (8 of them) via a private _captureOrigin
 * helper. Complex helpers (goTabs, goSearch, goNavOrigin, goSearchOrigin)
 * stay in App() for now — see the header for the full list.
 *
 * @param {{
 *   screen: string,
 *   bookId: string | null,
 *   chapterNum: number | null,
 *   letterId: string | null,
 *   studyId: string | null,
 *   studyChapterId: string | null,
 *   setScreen: (v: any) => void,
 *   setBookId: (v: any) => void,
 *   setChapterNum: (v: any) => void,
 *   setGenreId: (v: any) => void,
 *   setNavOrigin: (v: any) => void,
 *   setFromSearch: (v: any) => void,
 *   setFromWtlb: (v: any) => void,
 *   setFromLetterStack: (v: any) => void,
 *   setJournalEntryId: (v: any) => void,
 *   setGardenPage: (v: any) => void
 * }} args
 * @returns {{
 *   goHome: () => void,
 *   goScripturesHome: () => void,
 *   goScriptureGenre: (gid: string) => void,
 *   goVolumesHome: () => void,
 *   goSettings: () => void,
 *   goHistory: () => void,
 *   goAbout: () => void,
 *   goLibrary: () => void,
 *   goJournalHub: () => void,
 *   goJournalViewer: (eid: string | null) => void,
 *   goJournalEditor: (eid: string | null) => void,
 *   goNotesIndex: () => void,
 *   goLinksIndex: () => void,
 *   goBookmarksIndex: () => void,
 *   goHighlightsIndex: () => void,
 *   goColIdx: (volKey: string) => void,
 *   goMatthewIdx: () => void,
 *   goStudiesHome: () => void,
 *   goBibleIdx: () => void,
 *   goToGardenFirst: () => void
 * }}
 */
export function useNav({
  screen, bookId, chapterNum, letterId, studyId, studyChapterId,
  setScreen, setBookId, setChapterNum, setGenreId,
  setNavOrigin, setFromSearch, setFromWtlb, setFromLetterStack,
  setJournalEntryId, setGardenPage,
}) {
  // Snapshot the current reading position so "Back" from the destination
  // restores it. Used by the 8 navOrigin-pattern helpers below. Snapshot
  // is plain values (NOT a ref) — captured at click time, lives in the
  // navOrigin tabField until restored or cleared.
  const _captureOrigin = () => setNavOrigin({
    screen, bookId, chapterNum, letterId, studyId, studyChapterId,
  });

  // ── Core navigation ──────────────────────────────────────────────────
  const goHome = () => {
    setFromSearch(false);
    setFromWtlb(null);
    setFromLetterStack([]);
    window.__pendingHighlight = null;
    window.__pendingScrollHlKey = null;
    setScreen('home');
    setBookId(null);
    setChapterNum(null);
  };
  const goScripturesHome = () => { setScreen('scriptures-home'); setBookId(null); setChapterNum(null); setGenreId(null); };
  const goScriptureGenre = (gid) => { setGenreId(gid); setScreen('scripture-genre'); };
  const goVolumesHome = () => { setScreen('volumes-home'); };

  // ── navOrigin-pattern helpers (8 of them) ────────────────────────────
  // Each captures the current reading position into navOrigin (so Back
  // restores it) and switches to its destination screen.
  const goSettings        = () => { _captureOrigin(); setScreen('settings'); };
  const goHistory         = () => { _captureOrigin(); setScreen('history'); };
  const goAbout           = () => { _captureOrigin(); setScreen('about'); };
  const goLibrary         = () => { _captureOrigin(); setScreen('library'); };
  const goJournalHub      = () => { _captureOrigin(); setScreen('journal-home'); };
  const goNotesIndex      = () => { _captureOrigin(); setScreen('notes-index'); };
  const goLinksIndex      = () => { _captureOrigin(); setScreen('links-index'); };
  const goBookmarksIndex  = () => { _captureOrigin(); setScreen('bookmarks-index'); };
  const goHighlightsIndex = () => { _captureOrigin(); setScreen('highlights-index'); };

  // ── Journal nav (no navOrigin — the journal viewer/editor is its own
  // back-stack, returning via Android-back or the journal header). ─────
  const goJournalViewer = (eid) => { if (eid) { setJournalEntryId(eid); setScreen('journal-viewer'); } };
  const goJournalEditor = (eid) => { if (eid) { setJournalEntryId(eid); setScreen('journal-editor'); } };

  // ── Trivial screen-switchers ─────────────────────────────────────────
  // COL_BY_KEY is a cross-bundle module global (Map<volKey, collection>)
  // populated by _entry-b's Object.assign(window). No-op when the
  // volKey doesn't map or the collection has no indexScreen — protects
  // against stale volKeys from old vot-state payloads.
  const goColIdx = (volKey) => {
    const c = COL_BY_KEY.get(volKey);
    if (c && c.indexScreen) setScreen(c.indexScreen);
  };
  const goMatthewIdx    = () => { setChapterNum(null); setScreen('matthew-idx'); };
  const goStudiesHome   = () => { setScreen('studies-home'); };
  const goBibleIdx      = () => { setChapterNum(null); setScreen('bible-idx'); };
  const goToGardenFirst = () => { setGardenPage(1); setScreen('garden-view'); };

  return {
    goHome, goScripturesHome, goScriptureGenre, goVolumesHome,
    goSettings, goHistory, goAbout, goLibrary,
    goJournalHub, goJournalViewer, goJournalEditor,
    goNotesIndex, goLinksIndex, goBookmarksIndex, goHighlightsIndex,
    goColIdx, goMatthewIdx, goStudiesHome, goBibleIdx, goToGardenFirst,
  };
}
