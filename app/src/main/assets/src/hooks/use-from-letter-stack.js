/* ═══════════════════════════════════════════════════════════════════════
   useFromLetterStack — multi-level tap-through back-stack + "Back to …" pill
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - fromLetterStack state    Array<{ sourceScreen, sourceBookId,
                                  sourceChapterNum, sourceLetterId,
                                  sourceStudyId, sourceStudyChapterId,
                                  sourceLetterTitle, sourceVolumeLabel,
                                  destSnapshot }>  — a per-tab tabField,
                                  capped at 50 entries
     - fromLetterRef            useRefMirror of fromLetterStack — gives
                                  call-time (event-handler) reads of the
                                  current stack without a stale closure
     - pushFromLetter(entry)    append a source-context entry
     - tapThroughBack()         the "Back to …" pill handler — pops the
                                  top and restores its captured screen/IDs
     - the prune useEffect      a CONSISTENCY-ENFORCEMENT effect: when the
                                  user navigates away from a recorded
                                  destination, it evicts the now-stale top
                                  entry. Its only side effect is
                                  setFromLetterStack; it reads nav state
                                  purely to decide whether to mutate its
                                  OWN state. It guards an invariant
                                  intrinsic to what fromLetterStack means
                                  ("the top entry's destSnapshot must match
                                  the current location") — so it belongs
                                  with fromLetterStack, not in App(). It is
                                  NOT a composition-level sink (which would
                                  write to many subsystems); it writes to
                                  exactly one — its own state.
     - backHint                 the computed { title, volumeLabel } the
                                  pill renders, or null

   DOES NOT OWN:
     - _navToLinkRef / navigateToLink / the deferred `_navToLinkRef.current
       = …` assignment — those stay in App() (P6j). The dependency runs the
       OTHER way: that deferred body CALLS this hook's pushFromLetter.
     - openInAppLetter / goToLetterFromMatthew — App()-local tap-through
       builders; they call pushFromLetter but are not part of this cluster.
     - handleAndroidBack — reads fromLetterRef + calls setFromLetterStack,
       but stays in App() (P6l). setFromLetterStack is returned for it.
     - the __goHome window bridge — clears the stack via setFromLetterStack;
       stays in App(). setFromLetterStack is returned for it too.
     - the 6 navigation tabFields (screen/bookId/chapterNum/letterId/
       studyId/studyChapterId) — owned by the tabs block (P6k); received
       here as params (values for reads, setters for tapThroughBack's
       source-restore).

   PARAMS:
     tabField — the per-tab field accessor from App()'s tabs block; called
       as tabField('fromLetterStack') to get [state, setter] (the setter is
       identity-stable, cached per-key by App()).
     screen, bookId, chapterNum, letterId, studyId, studyChapterId — current
       navigation position; read by _destMatches / the prune effect deps /
       backHint.
     setScreen, setBookId, setChapterNum, setLetterId, setStudyId,
       setStudyChapterId — navigation setters; tapThroughBack calls them to
       restore the popped entry's captured source position.

   RETURNS: { fromLetterStack, setFromLetterStack, pushFromLetter,
              tapThroughBack, fromLetterRef, backHint }

   STORAGE: none directly. fromLetterStack is a tabField, so it rides along
            in the vot-state tab persistence (usePersistedState, P6k+1).

   WINDOW: none. The only window touch is `window.__pendingHighlight = null`
     inside tapThroughBack — a one-shot data-slot write consumed by
     LetterView, not a handler bridge. No cleanup needed.
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';

/**
 * Multi-level tap-through back-stack + "Back to …" pill handler. Pushes
 * source contexts onto a per-tab stack (via tabField); the pill on the
 * destination screen pops the top and restores its captured nav state.
 * The prune effect enforces "top entry's destSnapshot matches current
 * location" as an invariant intrinsic to fromLetterStack's meaning.
 *
 * @param {{
 *   tabField: (key: string) => any[],
 *   screen: string,
 *   bookId: string | null,
 *   chapterNum: number | null,
 *   letterId: string | null,
 *   studyId: string | null,
 *   studyChapterId: string | null,
 *   setScreen: (val: any) => void,
 *   setBookId: (val: any) => void,
 *   setChapterNum: (val: any) => void,
 *   setLetterId: (val: any) => void,
 *   setStudyId: (val: any) => void,
 *   setStudyChapterId: (val: any) => void
 * }} args
 * @returns {{
 *   fromLetterStack: any[],
 *   setFromLetterStack: (val: any) => void,
 *   pushFromLetter: (entry: any) => void,
 *   tapThroughBack: () => void,
 *   fromLetterRef: { current: any[] },
 *   backHint: any
 * }}
 */
export function useFromLetterStack({
  tabField,
  screen, bookId, chapterNum, letterId, studyId, studyChapterId,
  setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId,
}) {
  // Multi-level tap-through back-stack — a per-tab tabField so each tab
  // unwinds its own A → B → C tap-through chain independently.
  const [fromLetterStack, setFromLetterStack] = tabField('fromLetterStack');
  // Mirror so call-time reads (tapThroughBack, App()'s handleAndroidBack)
  // always see the current stack — tabField setters run their updater fns
  // async, so a stale closure would pop the wrong entry.
  const fromLetterRef = useRefMirror(fromLetterStack);

  const pushFromLetter = (entry) => setFromLetterStack((prev) => { var next = [...prev, entry]; return next.length > 50 ? next.slice(-50) : next; });

  // Tap-through "Back to …" pill handler: pops the top of the from-letter
  // stack and restores the captured screen + IDs. tabField setters run
  // their updater fns ASYNC, so we read the current stack from its ref
  // (fromLetterRef) and call setFromLetterStack with a plain value.
  const tapThroughBack = () => {
    const stack = fromLetterRef.current;
    if (!stack || stack.length === 0) return;
    const popped = stack[stack.length - 1];
    setFromLetterStack(stack.slice(0, -1));
    window.__pendingHighlight = null;
    if (popped.sourceBookId !== undefined) setBookId(popped.sourceBookId);
    if (popped.sourceChapterNum !== undefined) setChapterNum(popped.sourceChapterNum);
    if (popped.sourceLetterId !== undefined) setLetterId(popped.sourceLetterId);
    if (popped.sourceStudyId !== undefined) setStudyId(popped.sourceStudyId);
    if (popped.sourceStudyChapterId !== undefined) setStudyChapterId(popped.sourceStudyChapterId);
    if (popped.sourceScreen) setScreen(popped.sourceScreen);
  };

  // destSnapshot uses BOTH null (push paths explicitly null out unused
  // fields) and undefined (legacy entries without a recorded field), and
  // both should mean "don't care about this field". Loose-equal nullish
  // check (`!= null`) catches both — strict `=== undefined` missed the
  // null case and matched against stale state, so the single-shot back
  // pill was being silently pruned in the primary cross-screen flow
  // (Notes index → Bible/Study → expected "Back to My Notes" pill).
  const _destMatches = (dest) => {
    if (!dest) return true;
    if (dest.screen !== screen) return false;
    if (dest.bookId != null && dest.bookId !== bookId) return false;
    if (dest.chapterNum != null && dest.chapterNum !== chapterNum) return false;
    if (dest.letterId != null && dest.letterId !== letterId) return false;
    if (dest.studyId != null && dest.studyId !== studyId) return false;
    if (dest.studyChapterId != null && dest.studyChapterId !== studyChapterId) return false;
    return true;
  };

  // (See JSDoc above the export for hook contract.)
  // Prune stale tap-through entries. When the user navigates away from a
  // recorded destination (next chapter, different book, etc.), pop the entry
  // so the pill doesn't reappear if they happen to land back on the dest
  // later, and so Android-back doesn't trigger a confusing jump.
  React.useEffect(() => {
    if (fromLetterStack.length === 0) return;
    const top = fromLetterStack[fromLetterStack.length - 1];
    if (!top.destSnapshot) return;
    if (!_destMatches(top.destSnapshot)) {
      setFromLetterStack((prev) => prev.slice(0, -1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- _destMatches is a local helper that closes over screen/bookId/chapterNum/letterId/studyId/studyChapterId — all already in deps — so each re-fire gets a fresh helper. setFromLetterStack is a useState setter from useTabs (identity-stable). Adding either would either re-fire the effect on every render or no-op.
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, fromLetterStack]);

  // Top-of-stack back-hint — shows above the hero on tap-through destinations
  // so the user knows where Android back will return.
  // If the entry has a destSnapshot (recorded at push time), the pill is
  // suppressed when the current state has diverged from that destination —
  // the pill is single-shot, not persistent. Legacy entries without a
  // destSnapshot show the pill unconditionally (preserves the existing
  // letter→letter tap-through multi-level back behavior).
  const backHint = fromLetterStack.length > 0 ?
  (() => {
    const top = fromLetterStack[fromLetterStack.length - 1];
    if (top.destSnapshot && !_destMatches(top.destSnapshot)) return null;
    return {
      title: top.sourceLetterTitle || "previous",
      volumeLabel: top.sourceVolumeLabel || null
    };
  })() :
  null;

  return {
    fromLetterStack, setFromLetterStack, pushFromLetter,
    tapThroughBack, fromLetterRef, backHint,
  };
}
