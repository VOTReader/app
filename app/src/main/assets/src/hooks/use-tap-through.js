/* ═══════════════════════════════════════════════════════════════════════
   useTapThrough — inbound content-link openers (P7f)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   The two "open a letter from inside content" tap-through entry points:

     - goToLetterFromMatthew(vol, letter, excerpt)
                          Called from the Matthew Study Bible's inline
                          "VOT letter" reference chips. Source position
                          is always Matthew chapter N; setFromMatthewCh
                          marks the chapter so Back returns to it.

     - openInAppLetter(target, meta)
                          Called from any letter's footnote whose link
                          is internal (collection + letterTitle). Source
                          position is the current letter/chapter; pushed
                          onto the fromLetterStack so multi-level tap-
                          throughs (A → B → C) unwind correctly. Also
                          records a destSnapshot so the back-hint pill
                          is single-shot per landing.

   Both share the same downstream side-effect shape:
     - Resolve the target via resolveVotLetter (cross-bundle global)
     - Set window.__pendingHighlight (one-shot data slot) when the
       call carries an excerpt, so the destination LetterView
       highlights the matched text on next mount.
     - Branch on dest.isStudy: route into bible-study-chapter (study)
       OR the letter screen (volume); set studyId/studyChapterId OR
       letterId + activeReadKey + last-read for the volume.

   OWNS:
     - goToLetterFromMatthew (returned)
     - openInAppLetter       (returned)

   DOES NOT OWN:
     - fromLetterStack itself + pushFromLetter — owned by
       useFromLetterStack (P6i). This hook receives pushFromLetter as
       a PARAM and calls it.
     - resolveVotLetter — cross-bundle global (letter-linking.js).
     - setLastReadForVol — App-local helper (a #5 useReadingPositionNav
       candidate); passed as PARAM.
     - The destination screens themselves — render tree.

   PARAMS:
     screen, bookId, chapterNum, letterId, studyId, studyChapterId
                       Current nav position. openInAppLetter snapshots
                       these into pushFromLetter's source-context entry.
                       chapterNum is also used by goToLetterFromMatthew
                       (for the Matthew source title).
     pushFromLetter    From useFromLetterStack (P6i). The tap-through
                       back-stack pusher.
     setScreen, setLetterId, setStudyId, setStudyChapterId
                       Nav setters for the destination.
     setFromMatthewCh  From useTabs tabField. Only goToLetterFromMatthew
                       calls it (marks the Matthew chapter the user
                       came from).
     setActiveReadKey  From useReadingDwell. Sets the dwell-timer's
                       active key for the destination + a last-read
                       commit callback (for non-study destinations).
     setLastReadForVol App-local helper. The commit-callback writes
                       through this for non-study destinations.

   RETURNS: { goToLetterFromMatthew, openInAppLetter }

   STORAGE: none directly.

   WINDOW:
     __pendingHighlight   ONE-SHOT data slot — both helpers write the
                          excerpt + dest letterId for LetterView's
                          mount-time highlight wrap; or null when no
                          excerpt. NOT a handler bridge; no cleanup.

   READS FROM GLOBAL SCOPE (cross-bundle):
     resolveVotLetter   letter-linking.js (bundle-b). Resolves
                        collection + letterTitle / id to a `dest`
                        object with shape:
                        { id, screen, volKey, isStudy?, studyId?,
                          studyChapterId?, activeReadKey? }
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Inbound tap-through openers. Two entry points; same downstream shape.
 * The source context is captured into pushFromLetter so multi-level
 * tap-throughs unwind correctly (A → B → C → back → B → back → A).
 *
 * @param {{
 *   screen: string,
 *   bookId: string | null,
 *   chapterNum: number | null,
 *   letterId: string | null,
 *   studyId: string | null,
 *   studyChapterId: string | null,
 *   pushFromLetter: (entry: any) => void,
 *   setScreen: (v: any) => void,
 *   setLetterId: (v: any) => void,
 *   setStudyId: (v: any) => void,
 *   setStudyChapterId: (v: any) => void,
 *   setFromMatthewCh: (v: any) => void,
 *   setActiveReadKey: (key: string, commitFn?: (() => void) | null) => void,
 *   setLastReadForVol: (volKey: string, letterId: string) => void
 * }} args
 * @returns {{
 *   goToLetterFromMatthew: (vol: string, letter: string, excerpt?: string) => void,
 *   openInAppLetter: (target: any, meta?: any) => void
 * }}
 */
export function useTapThrough({
  screen, bookId, chapterNum, letterId, studyId, studyChapterId,
  pushFromLetter,
  setScreen, setLetterId, setStudyId, setStudyChapterId,
  setFromMatthewCh, setActiveReadKey, setLastReadForVol,
}) {
  const goToLetterFromMatthew = (vol, letter, excerpt) => {
    const dest = resolveVotLetter(vol, letter);
    if (!dest) return; // defensive: unknown letter → no-op (no blackscreen)
    pushFromLetter({
      sourceScreen: 'matthew-ch',
      sourceBookId: 'matthew',
      sourceChapterNum: chapterNum,
      sourceLetterId: null,
      sourceStudyId: null,
      sourceStudyChapterId: null,
      sourceLetterTitle: `Matthew ${chapterNum}`,
      sourceVolumeLabel: null,
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
      setActiveReadKey('vol:' + dest.volKey, () => setLastReadForVol(dest.volKey, dest.id));
    }
    setScreen(dest.screen);
  };

  /* In-app letter tap-through from a footnote (link / seeAlso).
     Records the source letter + screen so Android back returns here.
     Sets window.__pendingHighlight so the destination LetterView, on its
     next mount/letter-change, wraps the excerpt with <mark.letter-highlight>. */
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
      destSnapshot: destSnapshot,
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
      setActiveReadKey('vol:' + dest.volKey, () => setLastReadForVol(dest.volKey, dest.id));
    }
    setScreen(dest.screen);
  };

  return { goToLetterFromMatthew, openInAppLetter };
}
