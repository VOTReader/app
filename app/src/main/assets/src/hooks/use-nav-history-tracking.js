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
  /* The nav position this hook has already written a history entry for.
     Set ONLY on a successful record, which is what makes the retry below
     safe: an unrecorded position keeps re-evaluating on later renders, a
     recorded one is skipped until the user navigates somewhere else (and
     back — revisiting the same chapter is a new visit and records again,
     exactly as the old deps-array version did). */
  const recordedKeyRef = React.useRef(/** @type {string | null} */ (null));

  /* NO DEPENDENCY ARRAY, deliberately (2026-08-04, owner-reported: Bible
     chapters and study chapters were missing from History).

     Every branch below depends on data that can arrive LATER than the nav
     state: BOOKS / MATTHEW are lazy corpora, and getStudyById /
     getStudyChapter resolve out of one. On a cold boot into a saved tab —
     or any deep link — this effect used to fire once, find the corpus
     absent, `return`, and never run again: its deps were the six nav
     values, and a corpus landing changes none of them. The visit was
     silently dropped. (The old comment claimed "a subsequent effect re-run
     after corpus arrival picks it up" — nothing re-ran it.)

     Running on every render and guarding with recordedKeyRef turns that
     into a retry: the first render where the lookups resolve records the
     entry, and the ref keeps it to exactly one record per visit. The body
     is a couple of string joins plus a Map.get on the miss path, and it
     short-circuits at the ref check on the hit path — cheaper than the
     corpus-version plumbing the alternative would need, and it keeps the
     four helper params free to change identity every render (which they
     do). */
  React.useEffect(() => {
    const navKey = [screen, bookId, chapterNum, letterId, studyId, studyChapterId].join('|');
    if (recordedKeyRef.current === navKey) return;
    /** Mark this position recorded — called only where an entry was written. */
    const done = () => { recordedKeyRef.current = navKey; };

    if (screen === 'matthew-ch' && chapterNum) {
      // Q8.2: MATTHEW is lazy-loaded. Landing here via saved tab state runs
      // this before the corpus arrives — leave the position unrecorded and
      // the next render retries (see the no-deps note above).
      const _MATTHEW = (typeof window !== 'undefined') ? window.MATTHEW : undefined;
      if (!_MATTHEW) return;
      const ch = _MATTHEW.chapters.find((c) => c.num === chapterNum);
      addToHistory({ type: 'chapter', bookId: 'matthew', bookTitle: 'Matthew', chapterNum, chapterTitle: ch?.title || null });
      done();
    } else if (screen === 'bible-ch' && bookId && chapterNum) {
      // Q8: BOOKS is lazy-loaded; if the user lands directly on bible-ch via
      // saved tab state, this effect fires BEFORE the corpus loads. Use
      // window.BOOKS rather than the bare identifier — esbuild's IIFE
      // captures `BOOKS` as a free identifier and bare reference throws
      // a ReferenceError before our typeof guard can short-circuit.
      const _BOOKS = (typeof window !== 'undefined') ? window.BOOKS : undefined;
      if (!_BOOKS) return;
      const book = _BOOKS[bookId];
      const ch = book?.chapters.find((c) => c.num === chapterNum);
      addToHistory({ type: 'chapter', bookId, bookTitle: book?.title || bookId, chapterNum, chapterTitle: ch?.title || null });
      done();
    } else if (letterId) {
      var _hcol = COL_BY_LETTER_SC.get(screen);
      // The VOT corpus is lazy too: an unresolved letter leaves the position
      // unrecorded so a later render can retry it.
      if (_hcol) { var _he = _findLetter(_hcol.volKey); if (_he) { addToHistory({ type: 'letter', letterId, letterTitle: _he.title, letterNum: _he.num || null, volumeScreen: _hcol.indexScreen }); done(); } }
    } else if (screen === 'bible-study-chapter' && studyId && studyChapterId) {
      const study = getStudyById(studyId);
      const ch = getStudyChapter(study, studyChapterId);
      if (study && ch) { addToHistory({ type: 'study-chapter', studyId, studyChapterId, studyTitle: study.title, studySlug: study.slug, chapterTitle: ch.title, chapterNum: ch.num }); done(); }
    }
    // No deps array: recordedKeyRef IS the fire-once-per-visit guard, and the
    // retry it enables is the point (see the note above the effect). The four
    // helper params change identity every render and always did — that was the
    // reason they were excluded from the old deps array, and it costs nothing
    // now that the ref, not the array, decides when an entry is written.
  });
}
