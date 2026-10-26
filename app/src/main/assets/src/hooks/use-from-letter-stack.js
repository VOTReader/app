/* ═══════════════════════════════════════════════════════════════════════
   useFromLetterStack — multi-level tap-through back-stack + "Back to …" pill
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - fromLetterStack state    Array<{ sourceScreen, sourceBookId,
                                  sourceChapterNum, sourceLetterId,
                                  sourceStudyId, sourceStudyChapterId,
                                  sourceJournalEntryId,
                                  sourceLetterTitle, sourceVolumeLabel,
                                  destSnapshot, silent }>  — a per-tab
                                  tabField, capped at 50 entries. `silent`
                                  suppresses the PILL only (History pushes
                                  it); back still pops and restores.
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
     - backActive               true when a live (destSnapshot-matching)
                                  top entry exists — INCLUDING a `silent`
                                  one. Hardware back keys off THIS, not
                                  backHint, so a History-entered chapter
                                  still unwinds to History with no pill.
     - retargetTop(dest)        moves a LIVE top entry's destSnapshot to
                                  `dest`, for a navigation that carries the
                                  reader's way back along (the audio
                                  follower's in-place move, sweep v041)
                                  instead of leaving it for the prune.

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
     - journalEntryId — a tabField too since W40 (it was an App()-wide
       useState), the 7th tracked position; same param treatment.

   PARAMS:
     tabField — the per-tab field accessor from App()'s tabs block; called
       as tabField('fromLetterStack') to get [state, setter] (the setter is
       identity-stable, cached per-key by App()), and read-only as
       tabField('searchOrigin') (useSearch's) and tabField('navOrigin')
       (App's), so a detour from the top entry's destination does not
       evict it.
     screen, bookId, chapterNum, letterId, studyId, studyChapterId,
       journalEntryId — current navigation position; read by _destMatches /
       the prune effect deps / backHint.
     setScreen, setBookId, setChapterNum, setLetterId, setStudyId,
       setStudyChapterId, setJournalEntryId — navigation setters;
       tapThroughBack calls them to restore the popped entry's captured
       source position.

   RETURNS: { fromLetterStack, setFromLetterStack, pushFromLetter,
              tapThroughBack, fromLetterRef, backHint, backActive,
              retargetTop }

   STORAGE: none directly. fromLetterStack is a tabField, so it rides along
            in the vot-state tab persistence (usePersistedState, P6k+1).

   NAV HAND-OFF: the only touch is `navHandoff.clear('pendingHighlight')`
     inside tapThroughBack — clearing the one-shot slot consumed by
     LetterView, not a handler bridge. See utils/nav-handoff.js.
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
 *   journalEntryId: string | null,
 *   setScreen: (val: any) => void,
 *   setBookId: (val: any) => void,
 *   setChapterNum: (val: any) => void,
 *   setLetterId: (val: any) => void,
 *   setStudyId: (val: any) => void,
 *   setStudyChapterId: (val: any) => void,
 *   setJournalEntryId: (val: any) => void
 * }} args
 * @returns {{
 *   fromLetterStack: any[],
 *   setFromLetterStack: (val: any) => void,
 *   pushFromLetter: (entry: any) => void,
 *   tapThroughBack: () => void,
 *   fromLetterRef: { current: any[] },
 *   backHint: any,
 *   backActive: boolean,
 *   retargetTop: (dest: any) => void
 * }}
 */
export function useFromLetterStack({
  tabField,
  screen, bookId, chapterNum, letterId, studyId, studyChapterId, journalEntryId,
  setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId, setJournalEntryId,
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
    window.navHandoff.clear('pendingHighlight');
    if (popped.sourceBookId !== undefined) setBookId(popped.sourceBookId);
    if (popped.sourceChapterNum !== undefined) setChapterNum(popped.sourceChapterNum);
    if (popped.sourceLetterId !== undefined) setLetterId(popped.sourceLetterId);
    if (popped.sourceStudyId !== undefined) setStudyId(popped.sourceStudyId);
    if (popped.sourceStudyChapterId !== undefined) setStudyChapterId(popped.sourceStudyChapterId);
    if (popped.sourceJournalEntryId !== undefined) setJournalEntryId(popped.sourceJournalEntryId);
    // share-fn: left from inside a footnote, Back lands on that footnote, open again.
    if (popped.sourceFootnote != null && popped.sourceLetterId) window.navHandoff.set('reopenFootnote', { letterId: popped.sourceLetterId, num: popped.sourceFootnote });
    if (popped.sourceScreen) setScreen(popped.sourceScreen);
  };

  // destSnapshot uses BOTH null (push paths explicitly null out unused
  // fields) and undefined (legacy entries without a recorded field), and
  // both should mean "don't care about this field". Loose-equal nullish
  // check (`!= null`) catches both — strict `=== undefined` missed the
  // null case and matched against stale state, so the single-shot back
  // pill was being silently pruned in the primary cross-screen flow
  // (Notes index → Bible/Study → expected "Back to My Notes" pill).
  const _matchesAt = (dest, at) => {
    if (!dest) return true;
    if (dest.screen !== at.screen) return false;
    if (dest.bookId != null && dest.bookId !== at.bookId) return false;
    if (dest.chapterNum != null && dest.chapterNum !== at.chapterNum) return false;
    if (dest.letterId != null && dest.letterId !== at.letterId) return false;
    if (dest.studyId != null && dest.studyId !== at.studyId) return false;
    if (dest.studyChapterId != null && dest.studyChapterId !== at.studyChapterId) return false;
    // 7th field. Old persisted tabs deserialize without it (undefined) — the
    // same `!= null` don't-care that covers an explicit null covers them.
    if (dest.journalEntryId != null && dest.journalEntryId !== at.journalEntryId) return false;
    return true;
  };
  const _destMatches = (dest) => _matchesAt(dest, { screen, bookId, chapterNum, letterId, studyId, studyChapterId, journalEntryId });

  // A detour opened FROM the top entry's destination keeps the entry (the
  // hub's seam walk, F5, 2026-10-22). Scripture Web's "Open in reader" landed
  // Genesis 3:19; Search from there evicted the web's entry the moment Search
  // opened, the entries under it went the same way render by render, and Back
  // from Genesis 3 climbed the chapter list to Home. The letter's own entry
  // (Answers > Punishment) had already gone when its footnote opened the web.
  // A detour holds its own way back: Search's searchOrigin (use-search.js),
  // and navOrigin with its returnOrigin chain for the web, the audio library
  // and the rest (goNavOrigin). While one of them names the destination the
  // reader is still on the way back there, so the prune waits, and the return
  // makes the entry live again (pill and Back both). It is not live meanwhile:
  // Back inside the detour is the detour's own.
  const [searchOrigin] = tabField('searchOrigin');
  const [navOrigin] = tabField('navOrigin');
  const _detourFrom = (dest) => {
    if (!dest) return false;
    if (searchOrigin && _matchesAt(dest, searchOrigin)) return true;
    for (let o = navOrigin, n = 0; o && n < 8; o = o.returnOrigin, n++) {
      if (_matchesAt(dest, o)) return true;
    }
    return false;
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
    if (!_destMatches(top.destSnapshot) && !_detourFrom(top.destSnapshot)) {
      setFromLetterStack((prev) => prev.slice(0, -1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- _destMatches and _detourFrom are local helpers that close over screen/bookId/chapterNum/letterId/studyId/studyChapterId/journalEntryId and searchOrigin — all already in deps — so each re-fire gets fresh helpers. setFromLetterStack is a useState setter from useTabs (identity-stable). Adding either would either re-fire the effect on every render or no-op.
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, journalEntryId, searchOrigin, navOrigin, fromLetterStack]);

  // Carry the live top entry to a new destination (sweep v041). The audio
  // follower ("Turn the Page with the Audio", use-audio-follow.js) moves the
  // pane IN PLACE to the next reading; the prune effect above would read that
  // as "the user navigated away" and evict the entry, so the "Back to …" pill
  // vanished and hardware Back skipped the place the reader came from. When
  // the top is live (its destSnapshot matches where the pane is NOW, i.e. the
  // reading being left) its destSnapshot becomes `dest`; an empty stack, a
  // top with no destSnapshot (prune-exempt already) or a stale top is left
  // alone. The caller moves the pane in the same tick, so the carried entry
  // and the new position commit in one render before the prune effect looks.
  const retargetTop = (dest) => setFromLetterStack((prev) => {
    const top = Array.isArray(prev) && prev.length > 0 ? prev[prev.length - 1] : null;
    if (!top || !top.destSnapshot || !_destMatches(top.destSnapshot)) return prev;
    return [...prev.slice(0, -1), { ...top, destSnapshot: dest }];
  });

  // Top-of-stack back-hint — shows above the hero on tap-through destinations
  // so the user knows where Android back will return.
  // If the entry has a destSnapshot (recorded at push time), the pill is
  // suppressed when the current state has diverged from that destination —
  // the pill is single-shot, not persistent. Legacy entries without a
  // destSnapshot show the pill unconditionally (preserves the existing
  // letter→letter tap-through multi-level back behavior).
  const _liveTop = fromLetterStack.length > 0 ?
  (() => {
    const top = fromLetterStack[fromLetterStack.length - 1];
    if (top.destSnapshot && !_destMatches(top.destSnapshot)) return null;
    return top;
  })() :
  null;
  // A `silent` entry (History pushes them — the owner does NOT want a pill on
  // links tapped there) is still a live back target: back must return to
  // History. So the PILL is suppressed here while backActive stays true, and
  // hardware back keys off backActive.
  const backHint = (_liveTop && !_liveTop.silent) ? {
    title: _liveTop.sourceLetterTitle || "previous",
    volumeLabel: _liveTop.sourceVolumeLabel || null
  } : null;
  const backActive = !!_liveTop;

  return {
    fromLetterStack, setFromLetterStack, pushFromLetter,
    tapThroughBack, fromLetterRef, backHint, backActive, retargetTop,
  };
}
