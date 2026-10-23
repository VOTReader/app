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
     - fromSearchIndex,              The reading place was picked from the
       setFromSearchIndex            chapter index a book-level hit opened
                                     (search200 UX Track D): its back goes to
                                     that index, whose back goes to the results.
                                     Set by the index routes, read by the back
                                     handler and the routes; every hit resets it.
     - searchScope, setSearchScope   SearchScreen's scope-chip state
                                     (null = global, populated = scoped
                                     to a context).
     - searchContext                 The "where was the user when they
                                     opened search?" context that
                                     SearchScreen renders as the
                                     scope-chip label.

   OWNED HELPERS (internal):
     - srchVolLookup(searchVolId) → { screen }
                                  Resolves a search-result's volumeId
                                  to its letter screen. Reads
                                  COL_BY_SEARCH_ID (cross-bundle module
                                  global).
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
                                           latest closure (intentional
                                           per-render identity churn).

   DOES NOT OWN:
     - The search engine itself (window.VotSearchMini) — that's search/'s
       responsibility. handleSearchCommand's 'rebuild-index' action
       calls into it, but the engine is external.
     - The SearchScreen component — render tree, stays in ui/screens/.
       useSearch returns the state/handlers SearchScreen needs as
       props; the screen owns its own UI state.
     - handleSurprise — discovery domain, App-local for now (planned
       extraction: useSurprise). Passed in as a PARAM and called from
       handleSearchCommand's 'random' action.
     - goSettings, goHome — useNav-owned (P7b). Passed in as PARAMS.
     - The reading cursor. A hit no longer moves it (search200 UX B1):
       it names its place through setSearchLanding (useReadingPositionNav
       owns that tab field) and the catch-all arm skips the place.

   PARAMS (single object, flat):
     tabField                 Per-tab field accessor (from useTabs).
                              Used to declare the 4 search tabFields
                              internally.
     screen, bookId,          Current nav position. Read by goSearch's
       chapterNum, letterId   context-snapshot logic AND by
                              goSearchOrigin's snapshot-restore
                              comparison.
     studyId, studyChapterId  The open Bible Study + chapter. Captured
                              into searchOrigin with the rest of the
                              position: a bible-study hit overwrites
                              them, so Back from Search must put them
                              back (sweep v060).
     setScreen, setBookId,    Nav setters. Used by goSearch (sets to
       setChapterNum,         'search'), goSearchOrigin (restores
       setLetterId,           captured position), handleSearchSelect
       setStudyId,            (routes to result destination),
       setStudyChapterId,     handleSearchCommand ('home' / 'scriptures'
       setSurpriseAnchor      / 'volumes' direct setScreen calls).
     setFromSearch            Marks the next nav as originated from
                              search (so back-from-letter knows to
                              return to search results).
     setGenreId               Cleared on every handleSearchSelect
                              dispatch — a search result is a non-genre
                              entry, and a stale genreId would misroute
                              a later index-level Back into a genre
                              visited in an earlier session leg.
     setSearchLanding         From useReadingPositionNav (search200 UX
                              B1). handleSearchSelect names the reading
                              place a hit opens (readingPlaceKey); the
                              catch-all arm leaves the cursor alone
                              there and the routes switch the read
                              tracker off, so the look records no
                              progress. Null for a book (an index).
                              (The hit used to arm the cursor itself
                              through setActiveReadKey; it no longer
                              touches it.)
     setFromWtlb,             Breadcrumbs only an older path sets (a
       setFromMatthewCh       WTLB {{nav}} hop, a Matthew card). They
                              outrank fromSearch in the reader's back,
                              so a stale one sent a hit's back to an
                              old entry; a hit starts a new trail.
     handleSurprise           From App() (a #6 dissolution → useSurprise
                              candidate). Called by handleSearchCommand
                              for the 'random' action — cross-domain
                              handoff to discovery.
     goSettings, goHome       From useNav. Called by handleSearchCommand
                              ('settings') and goSearchOrigin (fallback).

   RETURNS: {
     searchQuery, setSearchQuery, fromSearchIndex, setFromSearchIndex,
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
                                (book title lookup). Lazy (bundle-a-bible):
                                read only through scopeBookTitle's guard.
     SCRIPTURE_GENRES           index.html boot constant: the book title
                                while BOOKS has not loaded.
     COL_BY_LETTER_SC           For goSearch's volume-context lookup
                                from the current screen.
     COL_BY_INDEX_SC            [9] same lookup for volume INDEX screens
                                (chapter/letter lists offer the chip too).
     COL_BY_SEARCH_ID           Used by srchVolLookup +
                                srchResolveLetterId.
     colLetterArr, colPreface   Used by srchResolveLetterId for
                                letterNum → letterId resolution.
     window.VotSearchMini       For handleSearchCommand's 'rebuild-index'
                                action (delegates to the search engine
                                in bundle-d since lz1).
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';
import { COL_BY_INDEX_SC, COL_BY_LETTER_SC, COL_BY_SEARCH_ID, colLetterArr, colPreface } from '../data/scripture-resolution.js';
import { readingPlaceKey } from '../utils/search-visit.js';
import { formsToMark } from '../utils/marked-forms.js';
import { kjvVisitEdition } from '../utils/kjv-visit.js';
import { warmSearchAtLaunch } from '../search/warm-at-launch.js';

/**
 * The "In {Book}" scope chip's label for a Bible book. BOOKS ships in the lazy
 * bundle-a-bible, and bible-idx is opened on purpose before it lands (the
 * "Loading Bible" view, which stays up if the load fails), so a bare BOOKS read
 * there threw and the '/' or Ctrl+F shortcut never opened Search (sweep v012).
 * Until the corpus lands, the title comes from index.html's SCRIPTURE_GENRES.
 * @param {string} bookId
 * @returns {string}
 */
function scopeBookTitle(bookId) {
  const bk = typeof BOOKS !== 'undefined' && BOOKS ? BOOKS[bookId] : null;
  if (bk) return bk.title;
  if (typeof SCRIPTURE_GENRES !== 'undefined' && SCRIPTURE_GENRES) {
    for (const g of [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt]) {
      const b = g.books.find((x) => x.id === bookId);
      if (b) return b.title;
    }
  }
  return bookId;
}

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
 *   studyId: string | null,
 *   studyChapterId: string | null,
 *   translation?: string,
 *   setScreen: (v: any) => void,
 *   setBookId: (v: any) => void,
 *   setChapterNum: (v: any) => void,
 *   setLetterId: (v: any) => void,
 *   setStudyId: (v: any) => void,
 *   setStudyChapterId: (v: any) => void,
 *   setSurpriseAnchor: (v: any) => void,
 *   setFromSearch: (v: any) => void,
 *   setFromSurprise?: (v: boolean) => void,
 *   setGenreId: (v: any) => void,
 *   setSearchLanding?: (v: string | null) => void,
 *   setFromWtlb?: (v: string | null) => void,
 *   setFromMatthewCh?: (v: any) => void,
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
 *   fromSearchIndex: boolean,
 *   setFromSearchIndex: (v: boolean) => void,
 *   goSearch: () => void,
 *   goSearchOrigin: () => void,
 *   handleSearchSelect: (entry: any, terms?: string[]) => void,
 *   handleSearchCommand: (action: string) => void
 * }}
 */
/**
 * The chapter id of study `studyId` at chapter number `num`, from the loaded
 * BIBLE_STUDIES (lazy — null until a Studies screen or the index has pulled
 * it in; a study hit exists only when it had). Null when nothing resolves.
 * @param {string} studyId  the study's slug (=== id for every shipped study)
 * @param {number} num
 * @returns {string | null}
 */
export function studyChapterIdByNum(studyId, num) {
  const all = /** @type {any} */ (globalThis).BIBLE_STUDIES;
  if (!Array.isArray(all) || !studyId) return null;
  const study = all.find((s) => s && (s.slug === studyId || s.id === studyId));
  const ch = study && Array.isArray(study.chapters) ? study.chapters.find((c) => c && c.num === num) : null;
  return ch && ch.id ? ch.id : null;
}

export function useSearch({
  tabField,
  screen, bookId, chapterNum, letterId, studyId, studyChapterId, translation = 'nkjv',
  setScreen, setBookId, setChapterNum, setLetterId,
  setStudyId, setStudyChapterId, setSurpriseAnchor, setFromSearch, setFromSurprise, setGenreId,
  setSearchLanding, setFromWtlb, setFromMatthewCh,
  handleSurprise, goSettings, goHome,
}) {
  // U10.3 (search200): the search index is built at launch, in idle time after the first chapter has
  // the page (search/warm-at-launch.js), not the first time Search opens; for the edition read when it starts.
  const searchEditionRef = useRefMirror(translation);
  React.useEffect(() => warmSearchAtLaunch({ engine: () => window.VotSearchMini, translation: () => searchEditionRef.current }), [searchEditionRef]);   // a stable ref: once, on mount
  // ── Search tabFields (per-tab state) ────────────────────────────────────
  const [searchQuery, setSearchQuery] = tabField('searchQuery');
  const [searchOrigin, setSearchOrigin] = tabField('searchOrigin');
  const [searchScope, setSearchScope] = tabField('searchScope');
  const [searchContext, setSearchContext] = tabField('searchContext');
  const [fromSearchIndex, setFromSearchIndex] = tabField('fromSearchIndex');

  // searchOriginRef so goSearchOrigin's closure reads the latest origin
  // without recreating the function each render (same pattern as the
  // other ref-mirrored origin handlers).
  const searchOriginRef = useRefMirror(searchOrigin);

  // ── goSearch ────────────────────────────────────────────────────────────
  // Opens the search screen with a computed context snapshot. Takes the
  // navHandoff 'pendingSearchQuery' one-shot to pre-fill from SelectionToolbar.
  const goSearch = () => {
    // The study fields ride along: a bible-study hit overwrites them, and Back
    // to a 'bible-study-chapter' origin would otherwise open the hit's study
    // (sweep v060).
    setSearchOrigin({ screen, bookId, chapterNum, letterId, studyId, studyChapterId });
    // Compute the reading-position context so SearchScreen can offer an
    // optional "In {Book/Volume}" scope chip. null = opened outside a
    // reading screen (home/indexes/settings) → no chip shown.
    // searchScope always starts null (global); user taps chip to apply.
    let ctx = null;
    if (screen === 'matthew-ch' || screen === 'matthew-idx') {
      // [9] index screens offer the same scope chip as their reading
      // screens — browsing a book's chapter list (or a volume's letter
      // list) is just as clear a "search HERE" context as reading it.
      ctx = { kind: 'book', bookId: 'matthew', label: 'Matthew' };
    } else if ((screen === 'bible-ch' || screen === 'bible-idx') && bookId) {
      ctx = { kind: 'book', bookId, label: scopeBookTitle(bookId) };
    } else {
      const _scCol = COL_BY_LETTER_SC.get(screen) || COL_BY_INDEX_SC.get(screen);
      // A collection search never indexes offers no scope: kept to it, every search found nothing (sweep W34).
      if (_scCol && _scCol.indexed !== false) ctx = { kind: 'volume', volumeId: _scCol.searchVolId, label: _scCol.label };
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
  // closure to SelectionToolbar: each render's goSearch closure captures
  // the latest nav state, so SelectionToolbar's Search action always
  // opens search with up-to-date context.
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
      // An origin persisted before v060 has no study keys: leave the study alone.
      if (o.studyId !== undefined) setStudyId(o.studyId);
      if (o.studyChapterId !== undefined) setStudyChapterId(o.studyChapterId);
    } else {
      goHome();
    }
  };

  // ── Search-internal helpers (volume + letter resolution) ────────────────
  // Derive search-volume map from COLLECTIONS registry.
  const srchVolLookup = (searchVolId) => {
    const col = COL_BY_SEARCH_ID.get(searchVolId);
    if (!col) return null;
    return { screen: col.letterScreen };
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
  //   (a) entry.__direct: a directly-parsed reference (the engine's
  //       __direct entries). Sub-dispatched by r.kind: ref-bible /
  //       named-passage / ref-letter / ref-book.
  //   (b) Orama doc hits: entry.doc carries kind: verse / chapter-title /
  //       heading / study-note / cross-ref / letter / letter-title /
  //       footnote / wtlb / wtlb-title / blessed / blessed-title /
  //       holy-day / holy-day-title / bible-study.
  //
  // Each branch sets the appropriate nav state + setSurpriseAnchor (for
  // verse-anchor scroll) and routes to the destination screen.
  // "FIND" LANDS ON THE PASSAGE (2026-09-20). A letter / WTLB / study hit used
  // to set nav state only, so the letter opened at its first line and the
  // reader scrolled to find the words again. The matched excerpt now rides the
  // same `{type:'excerpt'}` anchor "Surprise me" was designed to use:
  // LetterView / WtlbEntryView resolve it to a block, scroll and flash it, and
  // — when that unit is the LOADED recording — hand the block to
  // ReadAlongHighlight as `seekTo`, so the voice goes where the eye went. Bible
  // hits already carry a verse anchor and take the same seek. `terms` are the
  // query's (SearchScreen); `entry.terms` the engine's per-hit matched words
  // (a typo-corrected match), merged the way SrchCard merges them for <mark>.
  // The engine is a window global (bundle-d): without it, no excerpt — the letter opens
  // at the top exactly as before, never a thrown dispatch.
  // `letterId` names the unit the excerpt was cut from: the consumers land it
  // ONLY on that unit, so an anchor that outlives the landing (the follower
  // turning the page, the arrows) cannot re-land a stale search on a letter it
  // was never about. For a study doc that is the CHAPTER id (what LetterView
  // renders), not doc.letterId (the study).
  // FIND IN THE UNIT (2026-09-26): the anchor also carries what to find, the
  // words the result card marked (the query's own, its synonyms, the engine's
  // matched forms) and the query as typed, for the host's FindInUnit pill
  // ("flood  2 of 3").
  // ...by the rule the card marks by (search200 UX D6): `stopTyped`, the small words typed, keeps
  // the engine's forms of them out (formsToMark). The pill counted "whom" and "whoever" in a letter
  // opened from a lone "who", words its card left unmarked. The landing's excerpt is still cut as
  // before (below): a hit only such a form found lands where it was found.
  const excerptAnchor = (doc, terms, entry, letterId, query, stopTyped) => {
    const own = Array.isArray(terms) ? terms : [];
    const hit = (entry && Array.isArray(entry.terms)) ? entry.terms.filter((t) => own.indexOf(t) < 0) : [];
    const marked = own.concat(formsToMark(hit, own, Array.isArray(stopTyped) ? stopTyped : []));
    // `typed`: the words the reader typed (and their synonyms), so the pill tells them from the rest (search200 ideas D)
    const find = marked.length ? { terms: marked, label: String(query || '').trim() || marked[0], typed: own } : null;
    // A tapped PLACE (SrchCard's "more places" list) names where in the text it
    // starts, a word start: the landing reads the same 48 chars matchExcerpt cuts.
    // A landing at the text's very start is the engine saying a TITLE was named
    // (search200 B5, the S22 look): `top` opens the unit at its top, where the
    // title is, and the find pill counts the places without landing on one.
    if (entry && typeof entry.placeStart === 'number' && doc && doc.text && entry.placeStart >= 0 && entry.placeStart < doc.text.length) {
      const a = { type: 'excerpt', text: doc.text.slice(entry.placeStart, entry.placeStart + 48), letterId: letterId || null, find };
      return entry.placeStart === 0 ? { ...a, top: true } : a;
    }
    const sm = /** @type {any} */ (window).VotSearchMini;
    if (!sm || typeof sm.matchExcerpt !== 'function' || !doc || !doc.text) return null;
    // The query's OWN words cut the excerpt. The engine's per-hit terms are
    // prefix expansions ('in' -> into, indeed; 'the' -> these, them, they...),
    // and matchExcerpt scores a window by DISTINCT terms, so merged in as equals
    // a stretch dense in "them / they / there" outscored the phrase the reader
    // typed and the landing missed its block (study find, 2026-09-22). They
    // stay as the fallback for a hit the typed words cannot find at all — a
    // typo the engine corrected — and count with them where one is another form
    // of a typed word ("keep" for a typed "keeping", matchExcerpt).
    const text = (own.length ? sm.matchExcerpt(doc.text, own, undefined, hit) : '') || (hit.length ? sm.matchExcerpt(doc.text, own.concat(hit)) : '');
    return text ? { type: 'excerpt', text, letterId: letterId || null, find } : null;
  };

  /** @param {any} entry @param {string[]} [terms] the query terms (SearchScreen state.terms) @param {string} [query] the query as typed
   *  @param {string[]} [stopTyped] the small words typed (SearchScreen state.stopTyped) */
  const handleSearchSelect = (entry, terms, query, stopTyped) => {
    setFromSearch(true);
    // v01-04: this unit came from search, so its Back returns to search. A Surprise
    // breadcrumb left from earlier outranks fromSearch in the letter screens' Back
    // and sent it Home instead.
    if (typeof setFromSurprise === 'function') setFromSurprise(false);
    // Wave 0 (sticky genreId): genreId is set ONLY by goScriptureGenre and
    // consulted by the bible-idx / matthew-idx / single-chapter back
    // branches, but goHome doesn't clear it — so it can outlive the genre
    // visit that set it. Every search-result dispatch is a non-genre entry
    // into the corpus; clear it here (once, top-level) so a later
    // index-level Back can't misroute into a genre never visited this leg.
    setGenreId(null);
    // search200 UX B1: a new trail for the breadcrumbs only an older path sets.
    // They outrank fromSearch in the reader's back: a fromWtlb left by a WTLB
    // entry's {{nav}} hop sent a hit's Bible chapter back to that entry, and a
    // fromMatthewCh sent a hit's letter back to Matthew.
    if (typeof setFromWtlb === 'function') setFromWtlb(null);
    if (typeof setFromMatthewCh === 'function') setFromMatthewCh(null);
    // Track D: a chapter picked from the index a book-level hit opens backs to that index;
    // every hit starts that trail over (the index routes set it on a pick).
    setFromSearchIndex(false);
    // ...and the place the hit opens is a look, not a read (set per branch below).
    const land = (place) => { if (typeof setSearchLanding === 'function') setSearchLanding(place ? readingPlaceKey(place) : null); };
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
          // Across chapters ("John 14:20-15:3") verseEnd is in the end chapter, so the first chapter
          // lights from the start verse to its end (sweep W32): 176 verses is the longest chapter
          // (Psalm 119), and a number past the last verse lights nothing.
          const vEnd = r.chapterEnd > r.chapter ? r.verseStart + 175 : (r.verseEnd || r.verseStart);
          for (let v = r.verseStart; v <= vEnd; v++) vs.push(v);
          setSurpriseAnchor({ type: 'verse', verses: vs });
        } else {
          setSurpriseAnchor(null);
        }
        land({ screen: effectiveBookId === 'matthew' ? 'matthew-ch' : 'bible-ch', bookId: effectiveBookId, chapterNum: r.chapter });
        setScreen(effectiveBookId === 'matthew' ? 'matthew-ch' : 'bible-ch');
        return;
      }
      if (r.kind === 'ref-letter') {
        const vm = SRCH_VOL_MAP[r.volumeId];
        if (!vm) return;
        const lid = srchResolveLetterId(r.volumeId, r.letterNum, r.letterId);
        if (!lid) return;
        setLetterId(lid);
        setSurpriseAnchor(null);   // a reference names the letter, not a place in it
        land({ screen: vm.screen, letterId: lid });   // no cursor move: the arm skips the landing
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
        land(null);   // an index is no reading place; a chapter picked from it is a read
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
        // `edition` (search200 idea A): a verse its KJV wording found opens in the KJV for this visit (BibleChapterView);
        // the Matthew Study Bible reads one edition.
        const edition = entry.kjvWording && doc.bookId !== 'matthew' ? kjvVisitEdition(doc.translation) : null;
        setSurpriseAnchor(edition ? { type: 'verse', verses: [doc.verseNum], edition } : { type: 'verse', verses: [doc.verseNum] });
      } else {
        setSurpriseAnchor(null);
      }
      land({ screen: doc.bookId === 'matthew' ? 'matthew-ch' : 'bible-ch', bookId: doc.bookId, chapterNum: doc.chapterNum });
      setScreen(doc.bookId === 'matthew' ? 'matthew-ch' : 'bible-ch');
      return;
    }
    if (k === 'letter' || k === 'letter-title' || k === 'footnote' || k === 'wtlb' || k === 'wtlb-title' || k === 'blessed' || k === 'blessed-title' || k === 'holy-day' || k === 'holy-day-title' || k === 'answers' || k === 'answers-title') {
      const vm = SRCH_VOL_MAP[doc.volumeId];
      if (!vm || !doc.letterId) return;
      setLetterId(doc.letterId);
      setSurpriseAnchor(excerptAnchor(doc, terms, entry, doc.letterId, query, stopTyped));
      land({ screen: vm.screen, letterId: doc.letterId });   // no cursor move: the arm skips the landing
      setScreen(vm.screen);
      return;
    }
    if (k === 'bible-study') {
      // Open the study at the given chapter — by the chapter's ID, which is what
      // BibleStudyChapterView (getStudyChapter) and LetterView's excerpt anchor
      // key on. The doc carries it since index m4; an older cached doc has only
      // chapterNum (a NUMBER — dispatching that as the id opened nothing), so it
      // is resolved through the loaded studies by number.
      const chId = doc.studyChapterId || studyChapterIdByNum(doc.letterId, doc.chapterNum);
      setStudyId(doc.letterId || null);
      setStudyChapterId(chId || null);
      setSurpriseAnchor(excerptAnchor(doc, terms, entry, chId, query, stopTyped));
      land({ screen: 'bible-study-chapter', studyId: doc.letterId || null, studyChapterId: chId || null });
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
      // store (window-exposed by bundle-d, which loads at cold boot). Guarded
      // anyway (the command is typed in SearchScreen, in the same bundle).
      if (typeof window.clearRecentSearches === 'function') window.clearRecentSearches();
      return;
    }
    if (action === 'clear-query') { setSearchQuery(''); return; }
    if (action === 'rebuild-index') {
      // Guarded: the engine lives in bundle-d (cold boot since lz1), with
      // SearchScreen, where the command is typed.
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
    fromSearchIndex: !!fromSearchIndex, setFromSearchIndex,
    searchScope, setSearchScope,
    searchContext,
    goSearch, goSearchOrigin,
    handleSearchSelect, handleSearchCommand,
  };
}
