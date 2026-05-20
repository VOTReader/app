/* ═══════════════════════════════════════════════════════════════════════
   useSavedState — load + validate vot-state on mount
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   First mechanical hook extraction of P6 (App() decomposition).

   READS  : localStorage['vot-state']
   WRITES : never
   RETURNS: the validated saved-state object (or {} on parse failure)

   The validator coerces stale screen values back to safe defaults — a
   screen string that no longer makes sense (e.g. reading a letter that
   has no letterId saved alongside it) gets rewritten to 'home' or its
   parent index. Runs on the legacy top-level state AND on each entry in
   the multi-tab `s.tabs[]` array so the same rules apply uniformly.

   Why a hook and not a function call?
     useMemo with [] deps gives a single-evaluation guarantee tied to the
     component lifecycle. A plain function called during render would
     re-evaluate every render — same logical outcome but extra work.
     React's useMemo also documents intent: "read once on mount".

   Test contract preserved exactly:
     - same screen-validation rules (no behavior change)
     - same parse-error fallback ({} on JSON.parse throw)
     - same single-pass evaluation (useMemo([]) → once per mount)
   ═══════════════════════════════════════════════════════════════════════ */

function _validateTabState(s) {
  if ((s.screen === "matthew-ch" || s.screen === "bible-ch") && s.chapterNum == null) s.screen = "home";
  if (/^vot-(one|three|four|five|six|seven|timothy|flock|rebuke)-letter$/.test(s.screen) && !s.letterId) s.screen = "home";
  if (s.screen === "vot-letter" && !s.letterId) s.screen = "home";
  if (s.screen === "hm-letter" && !s.letterId) s.screen = "home";
  if (/^(wtlb-one-entry|wtlb-two-entry|blessed-entry|holy-days-entry)$/.test(s.screen) && !s.letterId) s.screen = "home";
  if (s.screen === "garden-view" && s.gardenPage == null) s.screen = "home";
  if (/^vot-(one|three|four|five|six|seven|timothy|flock|rebuke)-index$/.test(s.screen)) s.screen = "volumes-home";
  if ((s.screen === "matthew-idx" || s.screen === "bible-idx") && !s.bookId) s.screen = "home";
  if (s.screen === "search") s.screen = "home";
  if (s.screen === "scripture-genre" && !s.genreId) s.screen = "scriptures-home";
  if (s.screen === "bible-study-chapter" && (!s.studyId || !s.studyChapterId)) s.screen = "studies-home";
  if (s.screen === "bible-study-index" && !s.studyId) s.screen = "studies-home";
  // Journal screens require entryId which lives in local state (not tab
  // state), so they can't be reliably restored on reload. Bounce to hub.
  if (s.screen === "journal-viewer" || s.screen === "journal-editor") s.screen = "journal-home";
  return s;
}

function useSavedState() {
  return React.useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem("vot-state") || "{}");
      _validateTabState(s);
      if (Array.isArray(s.tabs)) s.tabs.forEach(_validateTabState);
      return s;
    } catch (e) { return {}; }
  }, []);
}
