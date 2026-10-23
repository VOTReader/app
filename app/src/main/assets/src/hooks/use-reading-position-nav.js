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
     - selectScriptureBook(id, clear)  A book tile on Scriptures or a genre
                                       screen: the book's index, or a
                                       one-chapter book's chapter. Before
                                       BOOKS loads it opens the loading view
                                       at once instead of dropping the tap.
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
                                       Hydrated from ProphecyCardsStore
                                       (IDB, W2.3b) on first read
                                       (lazy-init) — NOT localStorage.
     - saveProphecyCardStates()        Flushes the ref through
                                       ProphecyCardsStore.setAll().
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
     setLetterId, setBookId,   Nav setters (setGenreId: selectScriptureBook's
       setChapterNum, setScreen,  clearGenre).
       setGenreId
     setActiveReadKey          From useReadingDwell. Used by
                               select*Ch helpers to install the
                               dwell-timer gate + last-read commit.
     setLastReadLetterMap      Written by setLastReadForVol.
     setLastReadChapters       Written by select*Ch helpers + goToLastRead's
                               commit-fns.
     getStudyById              From useBibleStudies. goToLastRead uses
                               it for the 'bible-study-' branch lookup;
                               the arm effect's study key is resolved
                               with it during render (lazy studies).
     selectStudy               From useBibleStudies. goToLastRead's
                               fallback when chId is missing.
     selectStudyChapter        From useBibleStudies. goToLastRead's
                               primary study-resume path.

     tabField, fromSearch      search200 UX B1: the searchLanding tab field
                               is declared here (the arm reads it; useSearch
                               writes it through the returned setter). It
                               names the reading place a search hit opened.
                               While the reader is still there with the
                               search breadcrumb live (isSearchLook), the arm
                               leaves the cursor alone: the look records no
                               progress. Any other reading place retires it,
                               and so does reading the place itself (B1
                               review): the reader's own scroll on the page
                               (utils/reader-hand.js) or a SEARCH_LOOK_MS stay
                               with the app on screen. The arm then runs for
                               it, and the routes' read tracker comes on.

   RETURNS: {
     prophecyCardStatesRef, saveProphecyCardStates,
     setLastReadForVol,
     selectMatthewCh, selectBibleCh, selectScriptureBook,
     goToLastRead,
     searchLanding, setSearchLanding,
   }

   STORAGE:
     - 'vot-prophecy-cards' via ProphecyCardsStore (an IDB-backed
       CachedStore; the prophecy card expand/collapse map). Owned here
       entirely — hydrated on the first read of prophecyCardStatesRef,
       written by saveProphecyCardStates through setAll().

   WINDOW: none.

   READS FROM GLOBAL SCOPE (cross-bundle):
     COL_BY_KEY                For goToLastRead's 'vol:' branch — maps
                               volKey → collection (gives the letter
                               screen to route to).
     BOOKS, SCRIPTURE_GENRES,  selectScriptureBook: the lazy Bible corpus,
       __loadBibleCorpus       the boot-time shelf list, and its loader.
   ═══════════════════════════════════════════════════════════════════════ */

import { ProphecyCardsStore } from '../stores/prophecy-cards-store.js';
import { COL_BY_KEY, COL_BY_LETTER_SC } from '../data/scripture-resolution.js';
import { readingPlaceKey, isSearchLook, SEARCH_LOOK_MS } from '../utils/search-visit.js';
import { watchReaderScroll } from '../utils/reader-hand.js';

/**
 * Whether `id` names a book on the Scriptures shelves (SCRIPTURE_GENRES, an
 * index.html constant present from boot), so it can be opened before BOOKS
 * loads without risking a loading view that never resolves to a book.
 * @param {string} id
 * @returns {boolean}
 */
function _isBibleBookId(id) {
  if (typeof SCRIPTURE_GENRES === 'undefined') return false;
  return [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt].some((g) => g.books.some((b) => b.id === id));
}

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
 *   setGenreId: (v: any) => void,
 *   setActiveReadKey: (key: string, commitFn?: (() => void) | null) => void,
 *   setLastReadLetterMap: (updater: (prev: any) => any) => void,
 *   setLastReadChapters: (updater: (prev: any) => any) => void,
 *   getStudyById: (id: string) => any,
 *   selectStudy: (id: string) => void,
 *   selectStudyChapter: (sid: string, chId: string) => void,
 *   tabField?: (key: string) => any[],
 *   fromSearch?: boolean
 * }} args
 * @returns {{
 *   prophecyCardStatesRef: { current: any },
 *   saveProphecyCardStates: () => void,
 *   setLastReadForVol: (volKey: string, id: string) => void,
 *   selectMatthewCh: (num: number) => void,
 *   selectBibleCh: (num: number) => void,
 *   selectScriptureBook: (id: string, clearGenre?: boolean) => void,
 *   goToLastRead: () => void,
 *   lastReadPlace: () => ({ screen: string, letterId?: string, studyId?: string, studyChapterId?: string, bookId?: string, chapterNum?: number } | null),
 *   searchLanding: string | null,
 *   setSearchLanding: ((v: string | null) => void) | null
 * }}
 */
export function useReadingPositionNav({
  bookId, screen, chapterNum, letterId, studyId, studyChapterId,
  activeReadKey, lastReadLetterMap, lastReadChapters,
  setLetterId, setBookId, setChapterNum, setScreen, setGenreId,
  setActiveReadKey,
  setLastReadLetterMap, setLastReadChapters,
  getStudyById, selectStudy, selectStudyChapter,
  tabField, fromSearch,
}) {
  // search200 UX B1: the place a search hit opened (see PARAMS above). Per tab,
  // so a tab switch or a cold-boot restore onto the look still records nothing.
  const [searchLanding, setSearchLanding] = typeof tabField === 'function' ? tabField('searchLanding') : [null, null];
  const lookHere = isSearchLook({ fromSearch, searchLanding, screen, bookId, chapterNum, letterId, studyId, studyChapterId });
  // ── The look ends when the reader reads (search200 UX B1 review) ──────
  // The landing used to hold for the whole visit, so a letter found by search
  // and read to the end got no completion mark, no frontier and no resume
  // point. The reader's own scroll on the page, or a SEARCH_LOOK_MS stay with
  // the app on screen, retires it: the arm below then runs for the place, and
  // the routes' read tracker comes on (isSearchLook turns false). A tap in and
  // out, or the jump to the hit (no hand near it), still records nothing. Keyed
  // by the landing, so a tab switch onto another look starts its own clock.
  const lookKey = lookHere ? searchLanding : null;
  const setLandingRef = React.useRef(setSearchLanding);
  setLandingRef.current = setSearchLanding;
  React.useEffect(() => {
    if (!lookKey) return undefined;
    let timer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
    let stayed = 0;            // ms on screen before the app last went to the background
    let since = 0;
    let stopWatch = /** @type {(() => void) | null} */ (null);
    const pause = () => {
      if (!timer) return;
      clearTimeout(timer); timer = null;
      stayed += Date.now() - since;
    };
    const stop = () => {
      pause();
      if (stopWatch) { stopWatch(); stopWatch = null; }
      document.removeEventListener('visibilitychange', onVisibility);
    };
    const retire = () => {
      stop();
      const set = setLandingRef.current;
      if (set) set(null);
    };
    const resume = () => {
      if (timer || !stopWatch || document.visibilityState === 'hidden') return;
      since = Date.now();
      timer = setTimeout(retire, Math.max(0, SEARCH_LOOK_MS - stayed));
    };
    function onVisibility() { if (document.visibilityState === 'hidden') pause(); else resume(); }
    stopWatch = watchReaderScroll(null, retire);
    document.addEventListener('visibilitychange', onVisibility);
    resume();
    return stop;
  }, [lookKey]);
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
  //
  // The study's read key is resolved HERE, during render, not inside the
  // effect (sweep v14). BIBLE_STUDIES is lazy: a cold-boot restore or tab
  // switch onto a study chapter renders before it lands, so getStudyById
  // finds nothing. App() re-renders when the studies load (studiesTick), and
  // that render resolves the key; carrying it as a dep makes the effect run
  // again then (ARCHITECTURE "Lazy corpora": an effect with deps that reads a
  // corpus must carry a corpus signal). Only a study chapter resolves a key,
  // so the studies landing never re-arms the dwell on any other screen.
  const armStudy = (screen === 'bible-study-chapter' && studyId && studyChapterId) ? getStudyById(studyId) : null;
  const studyArmKey = armStudy ? 'bible-study-' + armStudy.slug : null;   // studyReadKey format (goToLastRead slices this prefix)
  React.useEffect(() => {
    // A search hit is a look, not a read (search200 UX B1): its own place arms
    // nothing while the search breadcrumb is live and the reader has not read
    // it yet. Any other reading place (the arrows, a link, an index pick that
    // spent the breadcrumb) is reading again and retires the landing. A screen
    // that is not for reading keeps it, for the return to the same hit.
    if (lookHere) return;
    const here = readingPlaceKey({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
    if (here && searchLanding && setSearchLanding) setSearchLanding(null);
    if (screen === 'bible-ch' || screen === 'matthew-ch') {
      const bid = screen === 'matthew-ch' ? 'matthew' : bookId;
      if (!bid || chapterNum == null) return;
      setActiveReadKey(bid, () => setLastReadChapters((prev) => ({ ...prev, [bid]: chapterNum })));
    } else if (screen === 'bible-study-chapter') {
      if (!studyArmKey) return;   // half-populated place, or the studies have not landed yet
      const key = studyArmKey;
      setActiveReadKey(key, () => setLastReadChapters((prev) => ({ ...prev, [key]: studyChapterId })));
    } else {
      const col = (typeof COL_BY_LETTER_SC !== 'undefined') ? COL_BY_LETTER_SC.get(screen) : null;
      if (!col || !letterId) return;
      setActiveReadKey('vol:' + col.volKey, () => setLastReadForVol(col.volKey, letterId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the PLACE identity plus studyArmKey (the study's resolved read key, which turns non-null when the lazy studies land) plus lookHere (the look ending on the same place — the reader read it — arms it then). searchLanding and fromSearch are read, not deps: useSearch sets them in the same batch as the place, and a neighbour retiring the landing must not re-run the arm on that neighbour (lookHere stays false there). The setters (setActiveReadKey, setLastReadChapters, setLastReadForVol) are recreated per render but read call-time state via closures/refs — including them would re-arm the dwell timer EVERY render (breaking the streak dwell) for zero behavioral gain.
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, studyArmKey, lookHere]);
  // ── Prophecy card expand/collapse state (IDB-backed via ProphecyCardsStore) ─
  // Key format: "chapterId:blockIndex:cardType" → boolean.
  // The ref-cached pattern is preserved so consumers can batch mutations
  // synchronously then flush via saveProphecyCardStates on commit. W2.3b
  // routes the read + write through ProphecyCardsStore (HydrationGate has
  // already resolved by the time this hook runs).
  // Lazy: holds the reader until the first render swaps in the data it returns.
  const prophecyCardStatesRef = React.useRef(/** @type {any} */ (() => ProphecyCardsStore.getAll()));
  // datasafe 2026-10-05: a map read before the store loaded is defaults, and
  // setAll is a whole-map replacement - saving it would erase every card state
  // the reader has. Such a mount saves nothing; HydrationGate remounts App
  // when the store loads, and that mount reads the real map.
  const prophecyReadUnloadedRef = React.useRef(false);
  if (typeof prophecyCardStatesRef.current === 'function') {
    const store = /** @type {any} */ (ProphecyCardsStore);
    prophecyReadUnloadedRef.current = typeof store.getState === 'function' && store.getState() !== 'loaded';
    prophecyCardStatesRef.current = prophecyCardStatesRef.current();
  }
  const saveProphecyCardStates = React.useCallback(() => {
    if (prophecyReadUnloadedRef.current) return;
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

  // ── selectScriptureBook — a book tile (Scriptures, a genre screen) ────
  // BOOKS is the lazy ~5 MB Bible corpus. A tap before it landed used to be
  // DROPPED (2026-09-24: the genre screen's book tiles, a restored genre tab):
  // nothing happened, and only a second tap after the load worked. Now the tap
  // opens the book at once: the bible-idx route shows "Loading Bible…" (and a
  // retry on failure) until BOOKS lands, then the chapter tiles. A one-chapter
  // book opens straight into its chapter, as it does when loaded — but only if
  // the reader is still on that loading view when the text arrives, never a
  // yank from wherever they went meanwhile. placeRef is the live place at the
  // moment the load resolves (this render's closure would be stale by then).
  const placeRef = React.useRef({ screen, bookId });
  placeRef.current = { screen, bookId };
  const selectScriptureBook = (id, clearGenre) => {
    if (clearGenre) setGenreId(null);
    if (id === 'matthew') { setBookId('matthew'); setChapterNum(null); setScreen('matthew-idx'); return; }
    const books = typeof BOOKS !== 'undefined' ? BOOKS : null;
    if (books && books[id]) {
      setBookId(id);
      if (books[id].chapters.length === 1) { setChapterNum(1); setScreen('bible-ch'); } else { setChapterNum(null); setScreen('bible-idx'); }
      return;
    }
    // Loaded and still unknown, not a Bible book, or no loader: nothing to open.
    if (books || !_isBibleBookId(id) || typeof window.__loadBibleCorpus !== 'function') return;
    setBookId(id);
    setChapterNum(null);
    setScreen('bible-idx');
    window.__loadBibleCorpus().then(() => {
      const book = typeof BOOKS !== 'undefined' ? BOOKS[id] : null;
      const here = placeRef.current;
      if (!book || book.chapters.length !== 1 || here.screen !== 'bible-idx' || here.bookId !== id) return;
      setChapterNum(1);
      setScreen('bible-ch');
    }, () => { /* the loading view shows the failure and its retry */ });
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

  // Where goToLastRead would go, as a tab-shaped place (utils/tabs.js describeTab
  // names it), so the top bar's resume button says where it goes (mw17 s15.1).
  // Null when there is nowhere to go.
  const lastReadPlace = () => {
    if (!activeReadKey) return null;
    if (activeReadKey.startsWith('vol:')) {
      const col = COL_BY_KEY.get(activeReadKey.slice(4));
      const lid = lastReadLetterMap[activeReadKey.slice(4)] || null;
      return lid && col ? { screen: col.letterScreen, letterId: lid } : null;
    }
    if (activeReadKey.startsWith('bible-study-')) {
      const slug = activeReadKey.slice('bible-study-'.length);
      const chId = lastReadChapters[activeReadKey];
      return chId ? { screen: 'bible-study-chapter', studyId: slug, studyChapterId: chId } : { screen: 'bible-study-index', studyId: slug };
    }
    const ch = lastReadChapters[activeReadKey];
    return ch ? { screen: activeReadKey === 'matthew' ? 'matthew-ch' : 'bible-ch', bookId: activeReadKey, chapterNum: ch } : null;
  };

  return {
    prophecyCardStatesRef, saveProphecyCardStates,
    setLastReadForVol,
    selectMatthewCh, selectBibleCh, selectScriptureBook,
    goToLastRead, lastReadPlace,
    searchLanding, setSearchLanding,
  };
}
