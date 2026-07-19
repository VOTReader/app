/* ═══════════════════════════════════════════════════════════════════════
   useReadingPositionNav — reading-cursor coordination (P7h)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS the App-local reading-cursor helpers that thread last-read state
   through the various reading-position writes:

     - setLastReadForVol(volKey, id)   the per-volume cursor writer.
                                       Called by useTapThrough,
                                       useReadingChainNav (P7i), the
                                       Surprise Me handler, and several
                                       render-tree nav callbacks.
                                       Thin wrapper over setLastReadLetterMap.
     - selectMatthewCh(num)            Set Matthew chapter num + activeReadKey
                                       with last-read commit callback.
     - selectBibleCh(num)              Same shape for the generic Bible
                                       chapter view (uses bookId from
                                       props).
     - goToLastRead()                  The "global reading dot" entry
                                       point — resumes the user's most
                                       recent reading position. Branches
                                       on activeReadKey's prefix:
                                         'vol:'         → volume letter
                                         'bible-study-' → study chapter
                                         else (bare)    → bible/matthew
                                                          chapter
     - prophecyCardStatesRef           App-global ref holding the
                                       expand/collapse state map for
                                       prophecy cards (keyed by
                                       chapterId:blockIndex:cardType).
                                       Hydrated from localStorage on
                                       first read (lazy-init).
     - saveProphecyCardStates()        Persists the ref to localStorage.
                                       useCallback'd (mount-only deps)
                                       so the bridge effect that calls
                                       it has a stable identity.

   DOES NOT OWN:
     - lastReadLetterMap state itself — App-local useState, passed in
       as PARAM (the setter is what setLastReadForVol writes through).
     - lastReadChapters state — same (per-bookId/study-key chapter
       cursor; the select* helpers and goToLastRead write to it via
       the setter).
     - activeReadKey state — owned by useReadingDwell (P6f). Read by
       goToLastRead; setActiveReadKey is passed in for the select*
       helpers.

   PARAMS:
     bookId                    selectBibleCh's destination bookId.
     screen, chapterNum, letterId, studyId, studyChapterId
                               The LIVE place identity — drives the
                               catch-all arm effect (2026-07-19): any
                               way of being on a reading screen (tab
                               switch, cold-boot restore, the dot's own
                               landing) arms the resume cursor; non-
                               reading screens never touch it.
     activeReadKey             goToLastRead's branch-discriminator.
     lastReadLetterMap         goToLastRead reads it for the 'vol:'
                               branch's letter lookup.
     lastReadChapters          goToLastRead reads it for the chapter
                               cursor lookup. Also written through
                               by the select* helpers.
     setLetterId, setBookId,   Nav setters.
       setChapterNum, setScreen
     setActiveReadKey          From useReadingDwell. Used by
                               select*Ch helpers to install the
                               dwell-timer gate + last-read commit.
     setLastReadLetterMap      Written by setLastReadForVol.
     setLastReadChapters       Written by select*Ch helpers + goToLastRead's
                               commit-fns.
     getStudyById              From useBibleStudies. goToLastRead uses
                               it for the 'bible-study-' branch lookup.
     selectStudy               From useBibleStudies. goToLastRead's
                               fallback when chId is missing.
     selectStudyChapter        From useBibleStudies. goToLastRead's
                               primary study-resume path.

   RETURNS: {
     prophecyCardStatesRef, saveProphecyCardStates,
     setLastReadForVol,
     selectMatthewCh, selectBibleCh,
     goToLastRead,
   }

   STORAGE:
     - 'vot-prophecy-cards' localStorage key (the prophecy card
       expand/collapse map). Owned here entirely — read at hook init,
       written by saveProphecyCardStates.

   WINDOW: none.

   READS FROM GLOBAL SCOPE (cross-bundle):
     COL_BY_KEY                For goToLastRead's 'vol:' branch — maps
                               volKey → collection (gives the letter
                               screen to route to).
   ═══════════════════════════════════════════════════════════════════════ */

import { ProphecyCardsStore } from '../stores/prophecy-cards-store.js';

/**
 * Reading-cursor coordination hook. Owns setLastReadForVol +
 * selectMatthewCh/BibleCh + goToLastRead + the prophecy-card-state
 * persistence. Reads activeReadKey + lastReadLetterMap +
 * lastReadChapters; writes through their setters + getStudyById /
 * selectStudy / selectStudyChapter from useBibleStudies.
 *
 * @param {{
 *   bookId: string | null,
 *   screen: string | null,
 *   chapterNum: number | null,
 *   letterId: string | null,
 *   studyId: string | null,
 *   studyChapterId: string | null,
 *   activeReadKey: string | null,
 *   lastReadLetterMap: Record<string, string>,
 *   lastReadChapters: Record<string, any>,
 *   setLetterId: (v: any) => void,
 *   setBookId: (v: any) => void,
 *   setChapterNum: (v: any) => void,
 *   setScreen: (v: any) => void,
 *   setActiveReadKey: (key: string, commitFn?: (() => void) | null) => void,
 *   setLastReadLetterMap: (updater: (prev: any) => any) => void,
 *   setLastReadChapters: (updater: (prev: any) => any) => void,
 *   getStudyById: (id: string) => any,
 *   selectStudy: (id: string) => void,
 *   selectStudyChapter: (sid: string, chId: string) => void
 * }} args
 * @returns {{
 *   prophecyCardStatesRef: { current: any },
 *   saveProphecyCardStates: () => void,
 *   setLastReadForVol: (volKey: string, id: string) => void,
 *   selectMatthewCh: (num: number) => void,
 *   selectBibleCh: (num: number) => void,
 *   goToLastRead: () => void
 * }}
 */
export function useReadingPositionNav({
  bookId, screen, chapterNum, letterId, studyId, studyChapterId,
  activeReadKey, lastReadLetterMap, lastReadChapters,
  setLetterId, setBookId, setChapterNum, setScreen,
  setActiveReadKey,
  setLastReadLetterMap, setLastReadChapters,
  getStudyById, selectStudy, selectStudyChapter,
}) {
  // ── Catch-all position arm (owner-reported 2026-07-19) ────────────────
  // Every explicit nav selector arms the reading cursor, but some arrival
  // paths had NO selector: switching to a TAB already sitting on a reading
  // screen, a cold-boot restore into one, and the reading dot's own
  // landing. Watch the live screen identity and arm from it — any way of
  // BEING on a reading screen makes it the resume target (and arms the
  // streak dwell). Explicit selectors still arm too; the duplicate arm is
  // idempotent (same key, same cursor value, timer re-arm). Non-reading
  // screens (home, journal, settings, …) match no branch and leave the
  // cursor untouched — a detour can never move the dot.
  React.useEffect(() => {
    if (screen === 'bible-ch' || screen === 'matthew-ch') {
      const bid = screen === 'matthew-ch' ? 'matthew' : bookId;
      if (!bid || chapterNum == null) return;
      setActiveReadKey(bid, () => setLastReadChapters((prev) => ({ ...prev, [bid]: chapterNum })));
    } else if (screen === 'bible-study-chapter') {
      if (!studyId || !studyChapterId) return;
      const study = getStudyById(studyId);
      if (!study) return;
      const key = 'bible-study-' + study.slug;   // studyReadKey format (goToLastRead slices this prefix)
      setActiveReadKey(key, () => setLastReadChapters((prev) => ({ ...prev, [key]: studyChapterId })));
    } else {
      const col = (typeof COL_BY_LETTER_SC !== 'undefined') ? COL_BY_LETTER_SC.get(screen) : null;
      if (!col || !letterId) return;
      setActiveReadKey('vol:' + col.volKey, () => setLastReadForVol(col.volKey, letterId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the PLACE identity only. The setters/lookups (setActiveReadKey, setLastReadChapters, setLastReadForVol, getStudyById) are recreated per render but read call-time state via closures/refs — including them would re-arm the dwell timer EVERY render (breaking the streak dwell) for zero behavioral gain.
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId]);
  // ── Prophecy card expand/collapse state (IDB-backed via ProphecyCardsStore) ─
  // Key format: "chapterId:blockIndex:cardType" → boolean.
  // The ref-cached pattern is preserved so consumers can batch mutations
  // synchronously then flush via saveProphecyCardStates on commit. W2.3b
  // routes the read + write through ProphecyCardsStore (HydrationGate has
  // already resolved by the time this hook runs).
  const prophecyCardStatesRef = React.useRef(() => ProphecyCardsStore.getAll());
  if (typeof prophecyCardStatesRef.current === 'function') {
    prophecyCardStatesRef.current = prophecyCardStatesRef.current();
  }
  const saveProphecyCardStates = React.useCallback(() => {
    ProphecyCardsStore.setAll(prophecyCardStatesRef.current);
  }, []);

  // ── setLastReadForVol — the per-volume cursor writer ──────────────────
  const setLastReadForVol = (volKey, id) => {
    setLastReadLetterMap((prev) => ({ ...prev, [volKey]: id }));
  };

  // ── selectMatthewCh / selectBibleCh — chapter selectors ──────────────
  // Both set chapterNum + screen + activeReadKey with a commit-fn that
  // writes through to lastReadChapters under the right key.
  const selectMatthewCh = (num) => {
    setChapterNum(num);
    setScreen('matthew-ch');
    setActiveReadKey('matthew', () => setLastReadChapters((prev) => ({ ...prev, matthew: num })));
  };
  const selectBibleCh = (num) => {
    setChapterNum(num);
    setScreen('bible-ch');
    setActiveReadKey(bookId, () => setLastReadChapters((prev) => ({ ...prev, [bookId]: num })));
  };

  // ── goToLastRead — the "global reading dot" resume entry ─────────────
  // Branches on activeReadKey's prefix:
  //   'vol:<volKey>'        → volume letter (look up letterId in
  //                            lastReadLetterMap, route to col.letterScreen)
  //   'bible-study-<slug>'  → study chapter (delegate to selectStudyChapter
  //                            OR selectStudy as fallback)
  //   bare (e.g. 'matthew') → bible/matthew chapter (look up chapterNum
  //                            in lastReadChapters, route to matthew-ch
  //                            OR bible-ch)
  const goToLastRead = () => {
    if (!activeReadKey) return;
    if (activeReadKey.startsWith('vol:')) {
      const volKey = activeReadKey.slice(4);
      const col = COL_BY_KEY.get(volKey);
      const lid = lastReadLetterMap[volKey] || null;
      if (lid && col) { setLetterId(lid); setScreen(col.letterScreen); }
    } else if (activeReadKey.startsWith('bible-study-')) {
      // Resume inside a Bible Letter Study
      const slug = activeReadKey.slice('bible-study-'.length);
      const chId = lastReadChapters[activeReadKey];
      const study = getStudyById(slug);
      if (study && chId) {
        selectStudyChapter(slug, chId);
      } else if (study) {
        selectStudy(slug);
      }
    } else {
      const ch = lastReadChapters[activeReadKey];
      if (ch) {
        setBookId(activeReadKey);
        setChapterNum(ch);
        setScreen(activeReadKey === 'matthew' ? 'matthew-ch' : 'bible-ch');
      }
    }
  };

  return {
    prophecyCardStatesRef, saveProphecyCardStates,
    setLastReadForVol,
    selectMatthewCh, selectBibleCh,
    goToLastRead,
  };
}
