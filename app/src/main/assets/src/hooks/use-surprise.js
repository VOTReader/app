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
     colLetterArr, colPreface.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Uniform random integer in [0, max). Uses crypto.getRandomValues with
 * rejection sampling to avoid modulo bias regardless of max. Falls back
 * to Math.random when crypto is unavailable. For our pool sizes (~2k)
 * the rejection loop terminates on the first draw essentially always
 * (acceptCeiling ~= 4_294_967_000 of 2^32 — bias zone is microscopic).
 *
 * @param {number} max
 * @returns {number}
 */
function _randomIndex(max) {
  if (!Number.isInteger(max) || max <= 0) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const RANGE = 0x100000000; // 2^32
    const acceptCeiling = RANGE - (RANGE % max);
    const buf = new Uint32Array(1);
    // Loops < 1-in-a-million for our pool sizes.
    for (let i = 0; i < 16; i++) {
      crypto.getRandomValues(buf);
      if (buf[0] < acceptCeiling) return buf[0] % max;
    }
    // Pathological fallback (should be statistically impossible).
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/**
 * @param {{
 *   setSurpriseAnchor: (v: any) => void,
 *   setFromSurprise: (v: boolean) => void,
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
  setSurpriseAnchor, setFromSurprise,
  setBookId, setChapterNum, setScreen, setLetterId,
  setActiveReadKey, setLastReadForVol, selectStudyChapter,
}) {
  const handleSurprise = () => {
    // Q8 lazy-load made MATTHEW / BIBLE_BOOK_LIST undefined until their loaders
    // resolve. Guard each source so the pool builds cleanly during the load
    // window; if everything is empty, kick off the loaders and bail (user
    // sees no-op for the brief race; subsequent tap works).
    const _MATTHEW = (typeof MATTHEW !== 'undefined' && MATTHEW) ? MATTHEW : null;
    const _BBL = (typeof BIBLE_BOOK_LIST !== 'undefined' && BIBLE_BOOK_LIST) ? BIBLE_BOOK_LIST : [];
    const pool = [
      ...(_MATTHEW ? _MATTHEW.chapters.map((ch) => ({ _k: 'matthew', num: ch.num })) : []),
      ..._BBL.flatMap((b) => b.chapters.map((ch) => ({ _k: 'bible', bookId: b.id, num: ch.num }))),
      ..._studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).flatMap((s) => s.chapters.map((ch) => ({ _k: 'study', studyId: s.id, chId: ch.id }))),
    ];
    // Every COLLECTION whose surpriseType is set contributes its preface (if
    // any) + all its letters/entries to the pool. Holy Days IS now included
    // (surpriseType: 'holydays'); Hidden Manna stays out (surpriseType: null)
    // per the CLAUDE.md rule that it's reachable only via the Matthew study
    // chain. "Return to the Garden" is a separate garden-view screen, not in
    // COLLECTIONS at all, so it's naturally excluded.
    for (const col of COLLECTIONS) {
      if (!col.surpriseType) continue;
      const pref = (typeof colPreface === 'function') ? colPreface(col) : null;
      if (pref && pref.id) pool.push({ _k: 'col', volKey: col.volKey, id: pref.id });
      for (const l of colLetterArr(col)) pool.push({ _k: 'col', volKey: col.volKey, id: l.id });
    }
    if (pool.length === 0) {
      if (typeof window.__loadBibleCorpus === 'function') window.__loadBibleCorpus();
      if (typeof window.__loadMatthewCorpus === 'function') window.__loadMatthewCorpus();
      if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus();
      return;
    }
    const pick = pool[_randomIndex(pool.length)];
    setSurpriseAnchor(null);
    // UX1: flag the jump so Android-back returns Home, not the chapter index of
    // a book the user never chose. The back router consumes + clears the flag.
    setFromSurprise(true);
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
