/* ═══════════════════════════════════════════════════════════════════════
   useSurprise — discovery domain (P7j)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Single-helper hook owning handleSurprise — the "random pick across
   everything" entry point. Builds a pool from MATTHEW chapters +
   BIBLE_BOOK_LIST chapters + unlocked study chapters + surprise-tagged
   collection letters, picks one uniformly at random, routes to its
   destination.

   OWNS:
     - handleSurprise()    Random pick + nav.

   DOES NOT OWN:
     - The MATTHEW / BIBLE_BOOK_LIST / _studies / COLLECTIONS data —
       cross-bundle module globals; read directly.
     - setSurpriseAnchor / setLastReadForVol / selectStudyChapter — all
       passed as PARAMS.
     - The Surprise Me button itself — render tree, just wires its
       onClick to the returned handleSurprise.

   PARAMS:
     setSurpriseAnchor    Clears the verse-anchor before the random
                          jump (no stale verse highlight).
     setBookId,           Nav setters.
       setChapterNum,
       setScreen,
       setLetterId
     setActiveReadKey     From useReadingDwell. Sets the dwell-timer
                          gate + last-read commit for the col-letter
                          branch.
     setLastReadForVol    From useReadingPositionNav. Same branch.
     selectStudyChapter   From useBibleStudies. The 'study' branch
                          delegates to it.

   RETURNS: { handleSurprise }

   READS FROM GLOBAL SCOPE (cross-bundle):
     MATTHEW, BIBLE_BOOK_LIST, _studies, COLLECTIONS, COL_BY_KEY,
     colLetterArr.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   setSurpriseAnchor: (v: any) => void,
 *   setBookId: (v: any) => void,
 *   setChapterNum: (v: any) => void,
 *   setScreen: (v: any) => void,
 *   setLetterId: (v: any) => void,
 *   setActiveReadKey: (key: string, commitFn?: (() => void) | null) => void,
 *   setLastReadForVol: (volKey: string, id: string) => void,
 *   selectStudyChapter: (sid: string, chId: string) => void
 * }} args
 * @returns {{ handleSurprise: () => void }}
 */
export function useSurprise({
  setSurpriseAnchor,
  setBookId, setChapterNum, setScreen, setLetterId,
  setActiveReadKey, setLastReadForVol, selectStudyChapter,
}) {
  const handleSurprise = () => {
    const pool = [
      ...MATTHEW.chapters.map((ch) => ({ _k: 'matthew', num: ch.num })),
      ...BIBLE_BOOK_LIST.flatMap((b) => b.chapters.map((ch) => ({ _k: 'bible', bookId: b.id, num: ch.num }))),
      ..._studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).flatMap((s) => s.chapters.map((ch) => ({ _k: 'study', studyId: s.id, chId: ch.id }))),
    ];
    for (const col of COLLECTIONS) {
      if (!col.surpriseType) continue;
      for (const l of colLetterArr(col)) pool.push({ _k: 'col', volKey: col.volKey, id: l.id });
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSurpriseAnchor(null);
    if (pick._k === 'matthew') {
      setBookId('matthew'); setChapterNum(pick.num); setScreen('matthew-ch');
    } else if (pick._k === 'bible') {
      setBookId(pick.bookId); setChapterNum(pick.num); setScreen('bible-ch');
    } else if (pick._k === 'study') {
      selectStudyChapter(pick.studyId, pick.chId);
    } else {
      const col = COL_BY_KEY.get(pick.volKey);
      if (!col) return;
      setLetterId(pick.id);
      setActiveReadKey('vol:' + col.volKey, () => setLastReadForVol(col.volKey, pick.id));
      setScreen(col.letterScreen);
    }
  };

  return { handleSurprise };
}
