/* ═══════════════════════════════════════════════════════════════════════
   useAndroidBack — the Android hardware/gesture back-navigation handler
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js. The LAST P6 hook.

   Wires window.handleAndroidBack — the function Kotlin's MainActivity
   calls via evaluateJavascript() on every hardware-back / predictive-back
   gesture. It returns "true" (JS consumed the event) or "false" (let
   Android handle it — i.e. exit the app). It is also called by the
   in-app back affordance on Letter/WTLB views (onBack prop).

   ┌─ ROUTING TABLE — what back does, in priority order ───────────────────┐
   │  1. an open sheet (window.__closeSheet)   → close it                  │
   │  2. the Tabs Overview overlay             → close it                  │
   │  3. a LETTER_SCREEN_SET screen with a     → pop the tap-through stack, │
   │     non-empty fromLetter stack              restore the source        │
   │  4. settings / history / about            → goNavOrigin (about also   │
   │                                             marks vot-about-seen)     │
   │  5. notes/links/bookmarks/highlights-index → library                  │
   │     · journal-home                        → library                  │
   │     · journal-viewer                      → journal-home              │
   │     · journal-editor                      → goJournalViewer           │
   │  6. library                               → goHome                   │
   │  7. search                                → goSearchOrigin            │
   │  8. scripture-genre                       → goScripturesHome          │
   │  9. scriptures-home / volumes-home        → goHome                    │
   │ 10. matthew-ch / -idx, bible-study-* ,     → context-aware (fromSearch │
   │     bible-ch / -idx                          / fromStudies / fromWtlb │
   │                                              / single-chapter book …) │
   │ 11. a letter screen (COL_BY_LETTER_SC)    → fromMatthew / fromSearch  │
   │                                             / fromStudies / index     │
   │ 12. an index screen / garden-view         → goVolumesHome             │
   │ 13. anything else                         → "false" (Android exits)   │
   └───────────────────────────────────────────────────────────────────────┘

   OWNS:
     - window.handleAndroidBack    wired in a []-deps effect, with a
                                   `delete` cleanup (invariant 6).
     - 9 useRefMirror refs the handler reads at call time (screen, bookId,
       genreId, fromSearch, fromStudies, fromMatthewCh, studyId, fromWtlb,
       tabsOverviewOpen). They are created HERE from the value params —
       App() no longer carries the 8 that were handleAndroidBack-only;
       it keeps its own fromMatthewChRef (still used elsewhere) and this
       hook just makes a second, private mirror of the same value.

   DOES NOT OWN:
     - the nav-helper functions (goNavOrigin, goHome, goSearchOrigin,
       goScripturesHome, goStudiesHome, goVolumesHome, goJournalViewer) —
       App()-local glue that closes over many hook returns; received as
       params. This is why useAndroidBack has a deliberately WIDE param
       surface — it is the most-coupled handler in the app; a tidy
       narrow signature would be a lie.
     - cancelDwell (useReadingDwell), fromLetterRef + setFromLetterStack
       (useFromLetterStack), the nav setters (useTabs) — all params.
     - LETTER_SCREEN_SET / COL_BY_LETTER_SC / COL_BY_INDEX_SC / BOOKS /
       getStudyById — module globals, used by bare name.

   KNOWN PRE-EXISTING BUG, preserved verbatim (do NOT fix here — fix in a
   follow-up so this extraction stays a pure move):
     `journalEntryId` is read by the handler but is a PLAIN value param,
     captured by this hook's []-deps effect closure at mount — when
     journalEntryId is null. So back from `journal-editor` runs
     goJournalViewer(null), which the `if (eid)` guard turns into a
     no-op. The bug predates P6l (the original App() effect had the same
     []-deps stale capture). The fix is to mirror journalEntryId via
     useRefMirror like the other 9 reads — a one-line follow-up commit.

   PARAMS: a wide bag — 9 mirrored values, journalEntryId, fromLetterRef,
     12 setters, cancelDwell + 7 nav helpers. See the destructure below.
   RETURNS: nothing — pure side-effect hook.
   STORAGE: writes localStorage 'vot-about-seen' on back-from-about.
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';

export function useAndroidBack({
  screen, bookId, genreId, fromSearch, fromStudies, fromMatthewCh, studyId, fromWtlb,
  tabsOverviewOpen, journalEntryId, fromLetterRef,
  setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId,
  setFromLetterStack, setFromSearch, setFromStudies, setFromWtlb, setFromMatthewCh,
  setTabsOverviewOpen,
  cancelDwell, goNavOrigin, goHome, goSearchOrigin, goScripturesHome,
  goStudiesHome, goVolumesHome, goJournalViewer,
}) {
  // Call-time mirrors — handleAndroidBack reads the LATEST nav state when
  // the user presses back, not the value frozen into its []-deps closure.
  const screenRef = useRefMirror(screen);
  const bookIdRef = useRefMirror(bookId);
  const genreIdRef = useRefMirror(genreId);
  const fromSearchRef = useRefMirror(fromSearch);
  const fromStudiesRef = useRefMirror(fromStudies);
  const fromMatthewChRef = useRefMirror(fromMatthewCh);
  const studyIdRef = useRefMirror(studyId);
  const fromWtlbRef = useRefMirror(fromWtlb);
  const tabsOverviewOpenRef = useRefMirror(tabsOverviewOpen);

  // All letter-style screens that can be a tap-through destination. When
  // the user entered via an in-app footnote link, Android back pops the
  // top of the fromLetter stack and returns to the source. Includes
  // bible-study-chapter so tap-throughs INTO a study unwind correctly.
  React.useEffect(() => {
    window.handleAndroidBack = () => {
      if (window.__closeSheet) {window.__closeSheet();window.__closeSheet = null;return "true";}
      if (tabsOverviewOpenRef.current) {
        setTabsOverviewOpen(false);
        return "true";
      }
      cancelDwell();
      const s = screenRef.current;
      const stack = fromLetterRef.current;
      if (LETTER_SCREEN_SET.has(s) && stack && stack.length > 0) {
        const fl = stack[stack.length - 1];
        setFromLetterStack((prev) => prev.slice(0, -1));
        window.__pendingHighlight = null;
        if (fl.sourceBookId !== undefined) setBookId(fl.sourceBookId);
        if (fl.sourceChapterNum !== undefined) setChapterNum(fl.sourceChapterNum);
        if (fl.sourceLetterId !== undefined) setLetterId(fl.sourceLetterId);
        if (fl.sourceStudyId !== undefined) setStudyId(fl.sourceStudyId);
        if (fl.sourceStudyChapterId !== undefined) setStudyChapterId(fl.sourceStudyChapterId);
        setScreen(fl.sourceScreen);
        return "true";
      }
      if (s === "settings") {goNavOrigin();return "true";} else
      if (s === "history") {goNavOrigin();return "true";} else
      if (s === "about") {try{localStorage.setItem('vot-about-seen','1');}catch(e){}goNavOrigin();return "true";} else
      if (s === "notes-index") {setScreen("library");return "true";} else
      if (s === "links-index") {setScreen("library");return "true";} else
      if (s === "bookmarks-index") {setScreen("library");return "true";} else
      if (s === "highlights-index") {setScreen("library");return "true";} else
      if (s === "journal-home") {setScreen("library");return "true";} else
      if (s === "journal-viewer") {setScreen("journal-home");return "true";} else
      if (s === "journal-editor") {goJournalViewer(journalEntryId);return "true";} else
      if (s === "library") {goHome();return "true";} else
      if (s === "search") {goSearchOrigin();return "true";} else
      if (s === "scripture-genre") {goScripturesHome();return "true";} else
      if (s === "scriptures-home") {goHome();return "true";} else
      if (s === "volumes-home") {goHome();return "true";} else
      if (s === "matthew-ch") {if (fromSearchRef.current) {setFromSearch(false);setScreen("search");} else {setChapterNum(null);setScreen("matthew-idx");}return "true";} else
      if (s === "matthew-idx") {if (fromStudiesRef.current) {setFromStudies(false);goStudiesHome();} else {goHome();}return "true";} else
      if (s === "studies-home") {goHome();return "true";} else
      if (s === "bible-study-index") {goStudiesHome();return "true";} else
      if (s === "bible-study-chapter") {if (fromSearchRef.current) {setFromSearch(false);setScreen("search");return "true";}const cur = getStudyById(studyIdRef.current);if (cur && cur.chapters && cur.chapters.length > 1) {setStudyChapterId(null);setScreen("bible-study-index");} else {goStudiesHome();}return "true";} else
      if (s === "bible-ch") {if (fromWtlbRef.current) {const ret = fromWtlbRef.current;setFromWtlb(null);setScreen(ret);return "true";}if (fromSearchRef.current) {setFromSearch(false);setScreen("search");} else {const bid = bookIdRef.current;if (bid && BOOKS[bid]?.chapters.length === 1) {if (genreIdRef.current) {setScreen("scripture-genre");} else {goScripturesHome();}} else {setChapterNum(null);setScreen("bible-idx");}}return "true";} else
      if (s === "bible-idx") {if (genreIdRef.current) {setScreen("scripture-genre");} else {goScripturesHome();}return "true";} else
      // Letter screens: unified back via COLLECTIONS registry
      { const col = COL_BY_LETTER_SC.get(s);
      if (col) {
        if (fromMatthewChRef.current) {setFromMatthewCh(null);setScreen("matthew-ch");}
        else if (fromSearchRef.current) {setFromSearch(false);setScreen("search");}
        else if (fromStudiesRef.current) {setFromStudies(false);setScreen("bible-study-chapter");}
        else if (col.indexScreen) {setScreen(col.indexScreen);}
        else {goHome();}
        return "true";
      }}
      // Index screens + garden: all go back to volumes-home
      if (COL_BY_INDEX_SC.has(s) || s === "garden-view") {goVolumesHome();return "true";}
      return "false";
    };
    return () => {delete window.handleAndroidBack;};
  }, []);
}
