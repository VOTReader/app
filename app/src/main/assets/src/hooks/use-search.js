/* ═══════════════════════════════════════════════════════════════════════
   useSearch — search domain (P7c)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS the full search domain App() used to define inline: state +
   refs + helpers + dispatcher handlers + the window.__goSearch bridge.
   The 4 search tabFields (searchOrigin, searchScope, searchContext,
   searchQuery) live here too — they're search-domain state, not
   AppShell state.

   OWNED STATE (tabFields, internal):
     - searchOrigin tabField    captured nav position to return to via
                                goSearchOrigin (the back-from-search
                                affordance). Per-tab so each tab unwinds
                                its own search-origin independently.
     - searchOriginRef          useRefMirror of searchOrigin so the
                                goSearchOrigin closure sees the LATEST
                                origin without recreating the function.

   OWNED STATE (returned for render-tree consumers):
     - searchQuery, setSearchQuery   SearchScreen's input binding.
     - searchScope, setSearchScope   SearchScreen's scope-chip state
                                     (null = global, populated = scoped
                                     to a context).
     - searchContext                 The "where was the user when they
                                     opened search?" context that
                                     SearchScreen renders as the
                                     scope-chip label.

   OWNED HELPERS (internal):
     - srchVolLookup(searchVolId) → { screen, lastReadFn, activeKey }
                                  Resolves a search-result's volumeId
                                  to its letter screen + last-read
                                  bookkeeping. Reads COL_BY_SEARCH_ID
                                  (cross-bundle module global).
     - SRCH_VOL_MAP               Proxy facade over srchVolLookup; used
                                  by handleSearchSelect / handleSearchCommand
                                  as a dict-style lookup. Kept as a
                                  compat alias — same shape as the old
                                  inline definition so test assertions
                                  on call shape stay stable.
     - srchResolveLetterId(volumeId, letterNum, letterId) → string | null
                                  Search-emitted entries may carry the
                                  letterId OR a letterNum index; this
                                  resolves either to the canonical id.

   OWNED HELPERS (returned for callers):
     - goSearch()                 Opens the search screen with a
                                  computed context snapshot of the
                                  current reading position. Takes the
                                  navHandoff 'pendingSearchQuery' one-shot
                                  to pre-fill from SelectionToolbar.
     - goSearchOrigin()           Restores the captured searchOrigin
                                  position (back from search). Falls
                                  back to goHome() if no origin captured.
     - handleSearchSelect(entry)  Routes a clicked search result to
                                  its destination. The 80-line branchy
                                  dispatcher — handles direct parsed
                                  refs (bible/letter/book) + Orama doc
                                  hits (verse/heading/letter/study).
     - handleSearchCommand(action) Handles command parses from SearchScreen
                                   (home/settings/scriptures/volumes/
                                   clear-query/rebuild-index/random).
                                   The 'random' action delegates to the
                                   handleSurprise prop (discovery domain
                                   — cross-domain handoff is intentional).

   OWNED EFFECT:
     - window.__goSearch binding effect    No deps array (fires every
                                           render). Re-binds the
                                           window bridge with the
                                           current goSearch closure so
                                           SelectionToolbar's Search
                                           action always calls the
                                           latest closure. Same
                                           identity-churn pattern as
                                           useReadingDwell's __onDwellCommit
                                           bridge (intentional design).

   DOES NOT OWN:
     - The search engine itself (window.VotSearch) — that's bundle-a's
       responsibility. handleSearchCommand's 'rebuild-index' action
       calls into it, but the engine is external.
     - The SearchScreen component — render tree, stays in ui/screens/.
       useSearch returns the state/handlers SearchScreen needs as
       props; the screen owns its own UI state.
     - handleSurprise — discovery domain, App-local for now (planned
       extraction: useSurprise). Passed in as a PARAM and called from
       handleSearchCommand's 'random' action.
     - goSettings, goHome — useNav-owned (P7b). Passed in as PARAMS.
     - setLastReadForVol — App-local last-read coordination (planned
       extraction: useReadingPositionNav). Passed in as a PARAM.
     - setActiveReadKey — useReadingDwell-owned (P6f). Passed as PARAM.

   PARAMS (single object, flat):
     tabField                 Per-tab field accessor (from useTabs).
                              Used to declare the 4 search tabFields
                              internally.
     screen, bookId,          Current nav position. Read by goSearch's
       chapterNum, letterId   context-snapshot logic AND by
                              goSearchOrigin's snapshot-restore
                              comparison.
     setScreen, setBookId,    Nav setters. Used by goSearch (sets to
       setChapterNum,         'search'), goSearchOrigin (restores
       setLetterId,           captured position), handleSearchSelect
       setStudyId,            (routes to result destination),
       setStudyChapterId,     handleSearchCommand ('home' / 'scriptures'
       setSurpriseAnchor      / 'volumes' direct setScreen calls).
     setFromSearch            Marks the next nav as originated from
                              search (so back-from-letter knows to
                              return to search results).
     setActiveReadKey         From useReadingDwell. Used by
                              handleSearchSelect to set the dwell-timer
                              gate when navigating into a letter.
     setLastReadForVol        From App() (a #5 useReadingPositionNav
                              candidate). Used by handleSearchSelect
                              via srchVolLookup's lastReadFn closure.
     handleSurprise           From App() (a #6 dissolution → useSurprise
                              candidate). Called by handleSearchCommand
                              for the 'random' action — cross-domain
                              handoff to discovery.
     goSettings, goHome       From useNav. Called by handleSearchCommand
                              ('settings') and goSearchOrigin (fallback).

   RETURNS: {
     searchQuery, setSearchQuery,
     searchScope, setSearchScope,
     searchContext,
     goSearch, goSearchOrigin,
     handleSearchSelect, handleSearchCommand,
   }

   STORAGE: searchOrigin / searchScope / searchContext / searchQuery
            are tabFields — ride along in the vot-state JSON via
            usePersistedState (P6k+1).

   WINDOW:
     __goSearch                  Bridge effect re-binds every render
                                 to expose the current goSearch
                                 closure to SelectionToolbar (the
                                 "Search" action in the selection
                                 toolbar reads this).
     navHandoff 'pendingSearchQuery'  ONE-SHOT slot — goSearch takes it
                                 (read+clear) to pre-fill the search input.
                                 See utils/nav-handoff.js.

   READS FROM GLOBAL SCOPE (cross-bundle):
     BOOKS                      For goSearch's context computation
                                (book title lookup).
     COL_BY_LETTER_SC           For goSearch's volume-context lookup
                                from the current screen.
     COL_BY_SEARCH_ID           Used by srchVolLookup +
                                srchResolveLetterId.
     colLetterArr, colPreface   Used by srchResolveLetterId for
                                letterNum → letterId resolution.
     window.VotSearch           For handleSearchCommand's 'rebuild-index'
                                action (delegates to the search engine
                                in bundle-a).
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';

/**
 * Search domain hook. Owns search state (4 tabFields), the
 * searchOriginRef, the search-internal helpers (srchVolLookup,
 * SRCH_VOL_MAP, srchResolveLetterId), the 2 nav helpers (goSearch +
 * goSearchOrigin), the 2 dispatcher handlers (handleSearchSelect +
 * handleSearchCommand), and the window.__goSearch bridge effect.
 *
 * Cross-domain handoff: handleSearchCommand's 'random' action calls the
 * passed-in handleSurprise (discovery domain — useSurprise is the
 * planned extraction destination). handleSearchCommand's 'settings'
 * action calls goSettings (useNav). goSearchOrigin's no-origin fallback
 * calls goHome (useNav).
 *
 * @param {{
 *   tabField: (key: string) => any[],
 *   screen: string,
 *   bookId: string | null,
 *   chapterNum: number | null,
 *   letterId: string | null,
 *   setScreen: (v: any) => void,
 *   setBookId: (v: any) => void,
 *   setChapterNum: (v: any) => void,
 *   setLetterId: (v: any) => void,
 *   setStudyId: (v: any) => void,
 *   setStudyChapterId: (v: any) => void,
 *   setSurpriseAnchor: (v: any) => void,
 *   setFromSearch: (v: any) => void,
 *   setActiveReadKey: (key: string, commitFn?: (() => void) | null) => void,
 *   setLastReadForVol: (volKey: string, letterId: string) => void,
 *   handleSurprise: () => void,
 *   goSettings: () => void,
 *   goHome: () => void
 * }} args
 * @returns {{
 *   searchQuery: string,
 *   setSearchQuery: (v: any) => void,
 *   searchScope: any,
 *   setSearchScope: (v: any) => void,
 *   searchContext: any,
 *   goSearch: () => void,
 *   goSearchOrigin: () => void,
 *   handleSearchSelect: (entry: any) => void,
 *   handleSearchCommand: (action: string) => void
 * }}
 */
export function useSearch({
  tabField,
  screen, bookId, chapterNum, letterId,
  setScreen, setBookId, setChapterNum, setLetterId,
  setStudyId, setStudyChapterId, setSurpriseAnchor, setFromSearch,
  setActiveReadKey, setLastReadForVol,
  handleSurprise, goSettings, goHome,
}) {
  // ── Search tabFields (per-tab state) ────────────────────────────────────
  const [searchQuery, setSearchQuery] = tabField('searchQuery');
  const [searchOrigin, setSearchOrigin] = tabField('searchOrigin');
  const [searchScope, setSearchScope] = tabField('searchScope');
  const [searchContext, setSearchContext] = tabField('searchContext');

  // searchOriginRef so goSearchOrigin's closure reads the latest origin
  // without recreating the function each render (same pattern as the
  // other ref-mirrored origin handlers).
  const searchOriginRef = useRefMirror(searchOrigin);

  // ── goSearch ────────────────────────────────────────────────────────────
  // Opens the search screen with a computed context snapshot. Takes the
  // navHandoff 'pendingSearchQuery' one-shot to pre-fill from SelectionToolbar.
  const goSearch = () => {
    setSearchOrigin({ screen, bookId, chapterNum, letterId });
    // Compute the reading-position context so SearchScreen can offer an
    // optional "In {Book/Volume}" scope chip. null = opened outside a
    // reading screen (home/indexes/settings) → no chip shown.
    // searchScope always starts null (global); user taps chip to apply.
    let ctx = null;
    if (screen === 'matthew-ch') {
      ctx = { kind: 'book', bookId: 'matthew', label: 'Matthew' };
    } else if (screen === 'bible-ch' && bookId) {
      const bk = BOOKS[bookId];
      ctx = { kind: 'book', bookId, label: bk ? bk.title : bookId };
    } else {
      const _scCol = COL_BY_LETTER_SC.get(screen);
      if (_scCol) ctx = { kind: 'volume', volumeId: _scCol.searchVolId, label: _scCol.label };
    }
    setSearchContext(ctx);
    setSearchScope(null);
    // If a pending query was stashed by the SelectionToolbar's Search
    // action, pre-fill the search input.
    const pendingQuery = window.navHandoff.take('pendingSearchQuery');
    if (pendingQuery) {
      setSearchQuery(pendingQuery);
    }
    setScreen('search');
  };

  // ── window.__goSearch bridge effect ─────────────────────────────────────
  // No deps array — re-binds every render to expose the current goSearch
  // closure to SelectionToolbar. Same identity-churn pattern as
  // useReadingDwell's __onDwellCommit bridge: each render's goSearch
  // closure captures the latest nav state, so SelectionToolbar's Search
  // action always opens search with up-to-date context.
  React.useEffect(() => {
    window.__goSearch = goSearch;
    return () => { window.__goSearch = null; };
  });

  // ── goSearchOrigin (back from search) ───────────────────────────────────
  const goSearchOrigin = () => {
    // UX2: clear the search verse-anchor so the restored reading screen gets no
    // stray highlight pulse and useScrollMemory's scroll-restore isn't blocked
    // (its Effect 3 early-returns while a surpriseAnchor is set).
    setSurpriseAnchor(null);
    const o = searchOriginRef.current;
    if (o) {
      setSearchOrigin(null);
      setScreen(o.screen);
      if (o.bookId !== undefined) setBookId(o.bookId);
      if (o.chapterNum !== undefined) setChapterNum(o.chapterNum);
      if (o.letterId !== undefined) setLetterId(o.letterId);
    } else {
      goHome();
    }
  };

  // ── Search-internal helpers (volume + letter resolution) ────────────────
  // Derive search-volume map from COLLECTIONS registry.
  const srchVolLookup = (searchVolId) => {
    const col = COL_BY_SEARCH_ID.get(searchVolId);
    if (!col) return null;
    return {
      screen: col.letterScreen,
      lastReadFn: (id) => setLastReadForVol(col.volKey, id),
      activeKey: 'vol:' + col.volKey,
    };
  };
  // Compat alias — same shape as the old inline Proxy so call-site
  // semantics in handleSearchSelect / handleSearchCommand are identical.
  const SRCH_VOL_MAP = new Proxy({}, { get: (_, key) => srchVolLookup(key) });

  const srchResolveLetterId = (volumeId, letterNum, lid) => {
    if (lid) return lid;
    if (letterNum == null) return null;
    const col = COL_BY_SEARCH_ID.get(volumeId);
    if (!col) return null;
    const arr = colLetterArr(col);
    for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].num === letterNum) return arr[i].id;
    const pref = colPreface(col);
    if (pref && (letterNum === 0 || arr.length === 0)) return pref.id;
    return null;
  };

  // ── handleSearchSelect — the 80-line result-routing dispatcher ──────────
  // Two top-level branches:
  //   (a) entry.__direct: a directly-parsed reference (from VotSearch's
  //       __direct entries). Sub-dispatched by r.kind: ref-bible /
  //       named-passage / ref-letter / ref-book.
  //   (b) Orama doc hits: entry.doc carries kind: verse / chapter-title /
  //       heading / study-note / cross-ref / letter / letter-title /
  //       footnote / wtlb / wtlb-title / blessed / blessed-title /
  //       holy-day / holy-day-title / bible-study.
  //
  // Each branch sets the appropriate nav state + setSurpriseAnchor (for
  // verse-anchor scroll) and routes to the destination screen.
  const handleSearchSelect = (entry) => {
    setFromSearch(true);
    // Direct parsed reference (from __direct entries)
    if (entry && entry.__direct && entry.ref) {
      const r = entry.ref;
      // Scriptures corpus → plain Matthew (bible-ch). Volumes/All → study.
      const useStudyMatthew = entry.__corpus !== 'scriptures';
      if (r.kind === 'ref-bible' || r.kind === 'named-passage') {
        const matthewHit = r.bookId === 'matthew' || r.bookId === 'matthew-plain';
        const effectiveBookId = matthewHit ?
        useStudyMatthew ? 'matthew' : 'matthew-plain' :
        r.bookId;
        setBookId(effectiveBookId);
        setChapterNum(r.chapter);
        if (r.verseStart) {
          const vs = [];
          const vEnd = r.verseEnd || r.verseStart;
          for (let v = r.verseStart; v <= vEnd; v++) vs.push(v);
          setSurpriseAnchor({ type: 'verse', verses: vs });
        } else {
          setSurpriseAnchor(null);
        }
        setScreen(effectiveBookId === 'matthew' ? 'matthew-ch' : 'bible-ch');
        return;
      }
      if (r.kind === 'ref-letter') {
        const vm = SRCH_VOL_MAP[r.volumeId];
        if (!vm) return;
        const lid = srchResolveLetterId(r.volumeId, r.letterNum, r.letterId);
        if (!lid) return;
        setLetterId(lid);
        if (vm.activeKey) setActiveReadKey(vm.activeKey, () => vm.lastReadFn(lid));
        else vm.lastReadFn(lid);
        setScreen(vm.screen);
        return;
      }
      if (r.kind === 'ref-book') {
        const matthewHit = r.bookId === 'matthew' || r.bookId === 'matthew-plain';
        const effectiveBookId = matthewHit ?
        useStudyMatthew ? 'matthew' : 'matthew-plain' :
        r.bookId;
        setBookId(effectiveBookId);
        setChapterNum(null);
        setScreen(effectiveBookId === 'matthew' ? 'matthew-idx' : 'bible-idx');
        return;
      }
      return;
    }
    // Result doc from Orama
    const doc = entry && entry.doc;
    if (!doc) return;
    const k = doc.kind;
    if (k === 'verse' || k === 'chapter-title' || k === 'heading' || k === 'study-note' || k === 'cross-ref') {
      // doc.bookId is 'matthew' only in the Volumes engine (Study Bible);
      // Scriptures engine emits 'matthew-plain'. Route accordingly.
      setBookId(doc.bookId);
      setChapterNum(doc.chapterNum);
      if (doc.verseNum) {
        setSurpriseAnchor({ type: 'verse', verses: [doc.verseNum] });
      } else {
        setSurpriseAnchor(null);
      }
      setScreen(doc.bookId === 'matthew' ? 'matthew-ch' : 'bible-ch');
      return;
    }
    if (k === 'letter' || k === 'letter-title' || k === 'footnote' || k === 'wtlb' || k === 'wtlb-title' || k === 'blessed' || k === 'blessed-title' || k === 'holy-day' || k === 'holy-day-title') {
      const vm = SRCH_VOL_MAP[doc.volumeId];
      if (!vm || !doc.letterId) return;
      setLetterId(doc.letterId);
      if (vm.activeKey) setActiveReadKey(vm.activeKey, () => vm.lastReadFn(doc.letterId));
      else vm.lastReadFn(doc.letterId);
      setScreen(vm.screen);
      return;
    }
    if (k === 'bible-study') {
      // Open the study at the given chapter
      setStudyId(doc.letterId || null);
      setStudyChapterId(doc.chapterNum || null);
      setScreen('bible-study-chapter');
      return;
    }
  };

  // ── handleSearchCommand (commands from SearchScreen's list) ─────────────
  const handleSearchCommand = (action) => {
    if (action === 'home') { setScreen('home'); return; }
    if (action === 'settings') { goSettings(); return; }
    if (action === 'scriptures') { setScreen('scriptures-home'); return; }
    if (action === 'volumes') { setScreen('volumes-home'); return; }
    if (action === 'clear-history') {
      // Wires the long-dormant "/clear history" command to the recent-searches
      // store (window-exposed by bundle-e). Guarded: bundle-e is loaded whenever
      // this fires (the command is typed in SearchScreen, which lives there).
      if (typeof window.clearRecentSearches === 'function') window.clearRecentSearches();
      return;
    }
    if (action === 'clear-query') { setSearchQuery(''); return; }
    if (action === 'rebuild-index') {
      // Rebuild whichever engines are loaded (Classic always; MiniSearch once
      // its lazy bundle has loaded).
      if (window.VotSearch) window.VotSearch.rebuild().catch(() => {});
      if (window.VotSearchMini) window.VotSearchMini.rebuild().catch(() => {});
      return;
    }
    if (action === 'random') {
      // Cross-domain handoff to discovery (handleSurprise will become
      // useSurprise per the Phase 1 dissolution plan).
      handleSurprise();
      return;
    }
  };

  return {
    searchQuery, setSearchQuery,
    searchScope, setSearchScope,
    searchContext,
    goSearch, goSearchOrigin,
    handleSearchSelect, handleSearchCommand,
  };
}
