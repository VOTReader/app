/* ═══════════════════════════════════════════════════════════════════════
   useNavHistoryTracking — auto-record reading history on nav change
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - The single useEffect that decides WHEN to call addToHistory based on
       the current nav state (screen + bookId + chapterNum + letterId +
       studyId + studyChapterId). Fires only on nav-state changes — deps
       are the 6 nav values; the 4 helper callbacks are intentionally
       excluded (see the disable cite below).

   DOES NOT OWN:
     - addToHistory itself (lives in useHistory — this hook is the
       POLICY-when-to-call layer that sits on top of that state-and-API
       layer). useHistory holds the storage + gate + mutators; this hook
       holds the trigger logic.
     - The nav state values + the 3 lookup helpers — those are owned by
       App() and useHistory respectively, and threaded in as params.

   WHY ITS OWN HOOK (extracted from App() during the decomposition phase):
     1. The split between useHistory (state container) and this hook
        (trigger policy) was already documented as intentional in
        use-history.js's header. Pulling the policy half out of App() makes
        the architectural division explicit at the module level instead of
        implicit-by-convention.
     2. The deps-array invariant — "fire ONLY on nav-state change, not on
        every render" — is now expressed at a hook boundary where it's
        testable in isolation. App()'s closure stops being the documentary
        site for it.
     3. The eslint disable cite that explains why _findLetter / getStudyById
        / getStudyChapter / addToHistory are excluded from deps moves with
        the effect to its new home — the rationale is unchanged (they
        change identity every render but behave identically), but it now
        names the four PARAMS, not four App-local closure captures.

   PARAMS (single object, flat — consistent with the other P6 hooks):
     screen, bookId, chapterNum, letterId, studyId, studyChapterId
       Current navigation position. The 6 useEffect dependencies. Any change
       to one of these is the trigger to (re-)evaluate the screen type and
       record an entry.
     addToHistory(entry)
       From useHistory. The state-mutator that this hook decides WHEN to
       call. The decision-vs-execution split is the whole point of having
       two hooks.
     _findLetter(volKey) → letterEntry | null
       App()-local closure: looks up the current letter inside the COLLECTIONS
       array for volKey. Reads `letterId` from App()'s closure — so each
       render rebuilds it; that's why it's intentionally not in deps.
     getStudyById(id) → study | null
       App()-local closure: STUDIES.find(...) helper. Reads BIBLE_STUDIES
       (module global) and `studies` from App()'s closure.
     getStudyChapter(study, chId) → chapter | null
       App()-local closure: study.chapters.find(...) helper. Stateless lookup
       — depends only on its arguments.

   READS FROM GLOBAL SCOPE (cross-bundle, like the rest of the app):
     MATTHEW              — _matthew() result, attached via _entry-b
     BOOKS                — module-global bible-book registry
     COL_BY_LETTER_SC     — Map<screen, collection>, attached via _entry-b

   RETURNS: void (effect-only hook — the side effect IS the contract).

   STORAGE: none directly. Persistence is owned by useHistory.

   WINDOW: none.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {import('./use-history.js').HistoryEntry} HistoryEntry
 */

/**
 * Auto-track nav → reading-history. The effect fires on nav-state changes
 * (the 6 deps) and calls addToHistory with the entry shape for the current
 * screen type. The 4 helper callbacks are excluded from deps by design;
 * see the disable cite in the body for the full rationale.
 *
 * @param {{
 *   screen: string,
 *   bookId: string | null,
 *   chapterNum: number | null,
 *   letterId: string | null,
 *   studyId: string | null,
 *   studyChapterId: string | null,
 *   addToHistory: (entry: HistoryEntry) => void,
 *   _findLetter: (volKey: string) => any,
 *   getStudyById: (id: string) => any,
 *   getStudyChapter: (study: any, chId: string) => any
 * }} args
 * @returns {void}
 */
export function useNavHistoryTracking({
  screen, bookId, chapterNum, letterId, studyId, studyChapterId,
  addToHistory, _findLetter, getStudyById, getStudyChapter,
}) {
  React.useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nav-change-only fire is the contract. The 4 helper params (addToHistory, _findLetter, getStudyById, getStudyChapter) are stable-by-behavior but NOT stable-by-identity: addToHistory closes over useHistory's enabledRef + setReadHistory (new closure each render); _findLetter, getStudyById, getStudyChapter are App()-local arrow/function helpers recreated each render. All four read closure-captured state (App()'s letterId / module-global COLLECTIONS / module-global BIBLE_STUDIES) — their bodies behave identically every render, so adding them to deps would force an every-render fire and lose the "trigger on nav change" intent. The 6 nav-state values ARE in deps; together they fully characterize the entry the effect would record.
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId]);
}
