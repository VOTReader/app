/* ═══════════════════════════════════════════════════════════════════════
   useReadingChainNav — cross-volume + cross-book boundary navigation (P7i)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS the cross-volume reading chain (Revelation → Volume One → ... →
   Letters from Timothy → Garden) AND the within-Bible book prev/next
   navigation. The two systems intersect at the Revelation → Volume One
   bridge: from the last chapter of Revelation, the next-boundary jumps
   to Volume One's first letter via `_goFirst.one` (the chain helper),
   NOT a "next book in BIBLE_BOOK_LIST" call.

   OWNED HELPERS (internal):
     - _first(arr, volKey, scr)        Curried () → void: jump to the
                                       first letter of a volume.
     - _last(arr, volKey, scr)         Curried () → void: jump to the
                                       last letter.
     - _firstPreface(pref, arr, ...)   Curried () → void: jump to the
                                       preface (if present) or first
                                       letter. Some volumes have a
                                       preface; others don't.
     - _goFirst / _goLast              Maps<volKey, () => void> built
                                       once per render by iterating
                                       COLLECTIONS. _goFirst.one is
                                       the Revelation → Volume One
                                       jump used in bcv* below.

   OWNED HELPERS (returned):
     - goToRevelationLast()            Jump to Revelation's last
                                       chapter (the entry into the
                                       reading chain from Bible side).
                                       Used both internally (by
                                       boundaryConfig's V1 → Revelation
                                       prev-boundary) and by external
                                       consumers if any.
     - boundaryConfig(volKey, entry)   The cross-volume boundary
                                       computer. Returns
                                         { prevBoundary, onPrevBoundary,
                                           nextBoundary, onNextBoundary }
                                       null-out when the entry has an
                                       in-collection sibling (entry's
                                       prevLetter/nextLetter / prevEntry/
                                       nextEntry fields). Special cases:
                                         volKey 'one'      → prev =
                                           Revelation last chapter
                                         volKey 'holydays' → next =
                                           Garden first page
                                       Otherwise walks READING_CHAIN
                                       skipping empty collections.
     - goNextBibleBook()               Bible cross-book next nav.
                                       BIBLE_BOOK_LIST is the order;
                                       routes to the next book's first
                                       chapter.
     - goPrevBibleBook()               Same shape, prev book, last
                                       chapter.

   OWNED COMPUTED (returned, render-tree consumers):
     - bookIdx                         BIBLE_BOOK_LIST.findIndex from
                                       current bookId (-1 when not a
                                       bible book).
     - prevBibleBook / nextBibleBook   The adjacent BIBLE_BOOK_LIST
                                       entries (or null at boundaries).
     - chIsFirst / chIsLast            True iff the current chapter is
                                       the first/last in its book.
                                       null-safe (returns null when
                                       chapter is missing).
     - bcvPrevBook / bcvOnPrevBook /   The BibleChapterView prev-boundary
       bcvPrevBoundaryTitle            props. bcvOnPrevBook is just
                                       goPrevBibleBook unconditionally
                                       (BCV decides based on chIsFirst
                                       via the bcvPrevBook prop).
     - bcvNextBook / bcvOnNextBook /   The BCV next-boundary props.
       bcvNextBoundaryTitle            chIsLast + bookId === 'revelation'
                                       triggers the Revelation → Volume
                                       One bridge (uses _goFirst.one
                                       internally).

   DOES NOT OWN:
     - The reading chain ORDER itself (READING_CHAIN const) — cross-
       bundle global, defined in data/scripture-resolution.js.
     - The BIBLE_BOOK_LIST data — cross-bundle global.
     - The destination renderers — render tree.
     - setLastReadForVol — owned by useReadingPositionNav (P7h);
       passed as PARAM.
     - goToGardenFirst — owned by useNav (P7b); passed as PARAM for
       the holydays → Garden special-case.

   PARAMS:
     book                  Current book object (or null). Used by
                           chIsFirst / chIsLast for the chapter
                           neighbor lookup.
     chapter               Current chapter object (or null). Same.
     bookId                Current book id. Used by bookIdx +
                           bcvOnNextBook's Revelation special-case.
     setBookId, setChapterNum, setScreen, setLetterId
                           Nav setters.
     setActiveReadKey      From useReadingDwell. Used by
                           _first/_last/_firstPreface's commit-fn for
                           per-volume last-read.
     setLastReadForVol     From useReadingPositionNav (P7h). Used by
                           the _first/_last/_firstPreface commit-fns.
     goToGardenFirst       From useNav (P7b). The holydays → Garden
                           cross-system jump.

   RETURNS: {
     goToRevelationLast, boundaryConfig,
     bookIdx, prevBibleBook, nextBibleBook,
     goNextBibleBook, goPrevBibleBook,
     chIsFirst, chIsLast,
     bcvPrevBook, bcvOnPrevBook, bcvPrevBoundaryTitle,
     bcvNextBook, bcvOnNextBook, bcvNextBoundaryTitle,
   }

   STORAGE: none directly.

   WINDOW: none.

   READS FROM GLOBAL SCOPE (cross-bundle):
     BOOKS                   For goToRevelationLast + boundaryConfig's
                             "Revelation · Chapter N" title.
     COLLECTIONS             For the _goFirst/_goLast map build.
     COL_BY_KEY              For boundaryConfig + _goFirst lookups.
     READING_CHAIN           The cross-volume order array.
     BIBLE_BOOK_LIST         The within-Bible order array.
     colLetterArr, colPreface, _boundaryShort  data-helpers from
                             scripture-resolution.js.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Reading-chain boundary navigation. Owns the cross-volume chain
 * (Revelation → V1 → ... → Garden) AND the within-Bible book prev/next.
 * The Revelation → Volume One bridge is the load-bearing intersection.
 *
 * @param {{
 *   book: any,
 *   chapter: any,
 *   bookId: string | null,
 *   setBookId: (v: any) => void,
 *   setChapterNum: (v: any) => void,
 *   setScreen: (v: any) => void,
 *   setLetterId: (v: any) => void,
 *   setActiveReadKey: (key: string, commitFn?: (() => void) | null) => void,
 *   setLastReadForVol: (volKey: string, id: string) => void,
 *   goToGardenFirst: () => void
 * }} args
 * @returns {{
 *   goToRevelationLast: () => void,
 *   boundaryConfig: (volKey: string, entry: any) => any,
 *   bookIdx: number,
 *   prevBibleBook: any,
 *   nextBibleBook: any,
 *   goNextBibleBook: () => void,
 *   goPrevBibleBook: () => void,
 *   chIsFirst: any,
 *   chIsLast: any,
 *   bcvPrevBook: any,
 *   bcvOnPrevBook: () => void,
 *   bcvPrevBoundaryTitle: any,
 *   bcvNextBook: any,
 *   bcvOnNextBook: () => void,
 *   bcvNextBoundaryTitle: any
 * }}
 */
export function useReadingChainNav({
  book, chapter, bookId,
  setBookId, setChapterNum, setScreen, setLetterId,
  setActiveReadKey, setLastReadForVol, goToGardenFirst,
}) {
  // ── Cross-volume reading chain (Revelation → V1 → ... → Timothy → Garden) ──
  const goToRevelationLast = () => {
    // BOOKS is in the lazy bundle-a-bible bundle (Q8 lazy-loading). If
    // the user reaches this handler before HomeScreen's pre-fire effect
    // resolved __loadBibleCorpus, a bare `BOOKS.revelation` throws
    // ReferenceError. Match App.jsx's `typeof BOOKS !== 'undefined'`
    // pattern; silently no-op until the corpus loads (the boundary card
    // that wires this handler also short-circuits via boundaryConfig
    // below, so this guard is double-belt-and-braces).
    const rev = (typeof BOOKS !== 'undefined') ? BOOKS.revelation : null;
    if (!rev) return;
    setBookId('revelation');
    setChapterNum(rev.chapters[rev.chapters.length - 1].num);
    setScreen('bible-ch');
  };

  // First/last helpers — curried for direct use as onPrevBoundary /
  // onNextBoundary props.
  const _first = (arr, volKey, scr) => () => {
    if (arr.length > 0) {
      const id = arr[0].id;
      setLetterId(id);
      setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id));
      setScreen(scr);
    }
  };
  const _last = (arr, volKey, scr) => () => {
    if (arr.length > 0) {
      const id = arr[arr.length - 1].id;
      setLetterId(id);
      setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id));
      setScreen(scr);
    }
  };
  const _firstPreface = (preface, arr, volKey, scr) => () => {
    const id = preface ? preface.id : arr.length > 0 ? arr[0].id : null;
    if (id) {
      setLetterId(id);
      setActiveReadKey('vol:' + volKey, () => setLastReadForVol(volKey, id));
      setScreen(scr);
    }
  };

  // _goFirst / _goLast maps — built once per render by iterating
  // COLLECTIONS. Each entry is a curried () → void usable as a
  // boundary-jump handler.
  var _goFirst = {}, _goLast = {};
  COLLECTIONS.forEach(function (col) {
    if (!col.letterScreen) return;
    var arr = colLetterArr(col);
    var pref = colPreface(col);
    _goFirst[col.volKey] = pref ? _firstPreface(pref, arr, col.volKey, col.letterScreen) : _first(arr, col.volKey, col.letterScreen);
    _goLast[col.volKey] = _last(arr, col.volKey, col.letterScreen);
  });

  /* boundaryConfig(volKey, entry) → { prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary }
     Derives reading-chain boundary cards from READING_CHAIN, skipping empty
     collections, with special endpoints (Revelation before V1, Garden after
     HolyDays). Returns null boundaries when the entry has an internal sibling
     in the same collection. */
  const boundaryConfig = (volKey, entry) => {
    const sourceCol = COL_BY_KEY.get(volKey);
    if (!sourceCol) return { prevBoundary: null, onPrevBoundary: null, nextBoundary: null, onNextBoundary: null };
    const hasPrev = !!(entry && (entry.prevLetter || entry.prevEntry));
    const hasNext = !!(entry && (entry.nextLetter || entry.nextEntry));
    const idx = READING_CHAIN.indexOf(volKey);
    let prevBoundary = null, onPrevBoundary = null, nextBoundary = null, onNextBoundary = null;

    if (!hasPrev) {
      if (volKey === 'one') {
        // Special: Revelation precedes Volume One. BOOKS is in the lazy
        // bundle-a-bible bundle (Q8 lazy-loading); guard the bare ref to
        // avoid a ReferenceError on cold-boot direct-to-V1 (saved-tab
        // state landing the user on a Volume One letter before
        // HomeScreen's pre-fire effect resolved __loadBibleCorpus).
        // When BOOKS isn't loaded yet, leave the prev boundary null —
        // the user's prev-card just doesn't render until the corpus
        // arrives; the next render after load will produce it.
        const rev = (typeof BOOKS !== 'undefined') ? BOOKS.revelation : null;
        if (rev) {
          prevBoundary = { short: 'Revelation', title: `Revelation · Chapter ${rev.chapters[rev.chapters.length - 1].num}` };
          onPrevBoundary = goToRevelationLast;
        }
      } else if (idx > 0) {
        // Walk back through chain skipping empties
        for (let i = idx - 1; i >= 0; i--) {
          const pCol = COL_BY_KEY.get(READING_CHAIN[i]);
          const pArr = colLetterArr(pCol);
          if (pArr.length === 0) continue;
          prevBoundary = { short: _boundaryShort(sourceCol, pCol), title: pArr[pArr.length - 1].title || pCol.short };
          onPrevBoundary = _goLast[pCol.volKey];
          break;
        }
      }
    }

    if (!hasNext) {
      if (volKey === 'holydays') {
        // Special: Garden follows Holy Days
        nextBoundary = { short: 'A Return to the Garden', title: 'A Return to the Garden' };
        onNextBoundary = goToGardenFirst;
      } else if (idx >= 0 && idx < READING_CHAIN.length - 1) {
        for (let i = idx + 1; i < READING_CHAIN.length; i++) {
          const nCol = COL_BY_KEY.get(READING_CHAIN[i]);
          const nArr = colLetterArr(nCol);
          if (nArr.length === 0) continue;
          const pref = colPreface(nCol);
          nextBoundary = { short: _boundaryShort(sourceCol, nCol), title: (pref ? pref.title : nArr[0].title) || nCol.short };
          onNextBoundary = _goFirst[nCol.volKey];
          break;
        }
      }
    }
    return { prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary };
  };

  // ── Eph ↔ Heb internal cross-book (BIBLE_BOOK_LIST order) ────────────
  const bookIdx = book ? BIBLE_BOOK_LIST.findIndex((b) => b.id === bookId) : -1;
  const prevBibleBook = bookIdx > 0 ? BIBLE_BOOK_LIST[bookIdx - 1] : null;
  const nextBibleBook = bookIdx >= 0 && bookIdx < BIBLE_BOOK_LIST.length - 1 ? BIBLE_BOOK_LIST[bookIdx + 1] : null;
  const goNextBibleBook = () => {
    if (!nextBibleBook) return;
    setBookId(nextBibleBook.id);
    setChapterNum(nextBibleBook.chapters[0].num);
    setScreen('bible-ch');
  };
  const goPrevBibleBook = () => {
    if (!prevBibleBook) return;
    setBookId(prevBibleBook.id);
    setChapterNum(prevBibleBook.chapters[prevBibleBook.chapters.length - 1].num);
    setScreen('bible-ch');
  };

  // ── Computed BibleChapterView boundary props ─────────────────────────
  const chIsFirst = chapter && !book?.chapters.find((c) => c.num === chapter.num - 1);
  const chIsLast = chapter && !book?.chapters.find((c) => c.num === chapter.num + 1);

  // Prev: first chapters → previous book in BIBLE_BOOK_LIST
  const bcvPrevBook = chIsFirst ? prevBibleBook : null;
  const bcvOnPrevBook = goPrevBibleBook;
  const bcvPrevBoundaryTitle = null;

  // Next: revelation last → Volume One; other last → next book
  const bcvNextBook = chIsLast ?
    bookId === 'revelation' ?
      { title: 'Volume One', chapters: [{ num: 1 }] } :
      nextBibleBook :
    null;
  const bcvOnNextBook = chIsLast && bookId === 'revelation' ?
    _goFirst.one :
    goNextBibleBook;
  const bcvNextBoundaryTitle = chIsLast && bookId === 'revelation' ?
    'Volume One · Letter 1' :
    null;

  // The full surface — including the helpers that App() doesn't
  // CURRENTLY destructure (goToRevelationLast / bookIdx /
  // prev/nextBibleBook / goNext/PrevBibleBook / chIsFirst/chIsLast).
  // App() consumes only the bcv* render props that derive from them,
  // BUT exposing them keeps them individually testable AND leaves the
  // door open for future render-tree consumers (e.g. a "next bible
  // book" button somewhere) without a hook-surface change.
  return {
    goToRevelationLast, boundaryConfig,
    bookIdx, prevBibleBook, nextBibleBook,
    goNextBibleBook, goPrevBibleBook,
    chIsFirst, chIsLast,
    bcvPrevBook, bcvOnPrevBook, bcvPrevBoundaryTitle,
    bcvNextBook, bcvOnNextBook, bcvNextBoundaryTitle,
  };
}
