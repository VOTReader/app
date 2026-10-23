/* ═══════════════════════════════════════════════════════════════════════
   SearchScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { foldReprints } from '../components/srch-reprints.js';
import { cardPassage } from '../components/SrchCard.jsx';
import { pickTopic, topicTexts, withOwnPassage } from '../components/srch-topic.js';
import { SrchTopicCard } from '../components/SrchTopicCard.jsx';
import { fewerWords, nearestShown, NEAREST_SHOWN } from '../components/srch-empty.js';
import {
  refQuote, expandSnippetTerms, isStopTerm, typedStopWords, markStopWords, scopeConflict, letterRefCards,
  searchMemo, matchCountLabel, groupInSiteOrder, correctedQuery,
} from './search-model.js';

export { expandSnippetTerms, typedStopWords, scopeConflict, letterRefCards, searchMemo, matchCountLabel, groupInSiteOrder, correctedQuery };

// MiniSearch is THE engine (the owner A/B'd it against the retired FlexSearch
// Classic and kept it — typo tolerance, BM25 ranking, recent searches, warm IDB
// cache). It ships in bundle-d alongside this screen, so it's always loaded by
// the time this renders; pickEngine still guards for a hypothetical load failure.
function pickEngine() {
  return window.VotSearchMini;
}

/* The parses that answer with a card of their own (directEntries). */
const NAV_KINDS = ['ref-bible', 'named-passage', 'ref-book', 'ref-letter'];
/* The ones that are a reference under any tab (search200 B2 review): a chapter, a named passage, a letter. A bare
   book name is not: under Volumes, "revelation" and "john" are the words the letters say. */
const REF_CARD_KINDS = ['ref-bible', 'named-passage', 'ref-letter'];

/* What a held tab is called in a sentence: "No results for “x” in the Scriptures." */
const TAB_NAME = /** @type {Record<string, string>} */ ({ scriptures: 'the Scriptures', volumes: 'the Volumes' });
/* The box names the tab it searches (search200 B5): "Search scriptures, volumes, studies…"
   was cut off on a 360 px phone; the empty screen's hint line says what to type. */
const PLACEHOLDER = /** @type {Record<string, string>} */ ({ all: 'Search everything', scriptures: 'Search the Scriptures', volumes: 'Search the Volumes' });

// The engine keeps at most SEARCH_LIMIT hits PER COLLECTION (its perVolume
// option), so the Bible's verses can no longer crowd the letters out of the All
// corpus, and SEARCH_TOTAL_LIMIT in all, a bound the shipped corpus never
// reaches ("the": about 3,300). A collection that hit its cap may hold more, so
// its count reads "400+", and so does the summary (W0 micro-gap a: never present
// a cap as the full count).
export const SEARCH_LIMIT = 400;
export const SEARCH_TOTAL_LIMIT = 6000;
// Book order opens every collection; each shows its first ten in reading order (sr12).
const SRCH_BOOK_FIRST_PAGE = 10;

/* SEARCH COMES BACK AS THE READER LEFT IT (search audit 2026-09-27). Back from a
   result re-ran the search from nothing, and the screen's scroll was restored
   against an empty list before the results arrived ("flood": 920 px became 379).
   The last finished search is kept, and a screen opened on the same query and
   settings starts from it; what was opened in it is srch-memory's (bundle-d). */
/** @type {{ memo: string, allWordsFor: string, state: any } | null} */
let lastSearch = null;

/**
 * W0 (IME blur): exiting search cost up to 3 back presses because the input
 * kept focus after the IME hid (back 1 closed the keyboard, back 2 only
 * dropped the stranded focus, back 3 finally navigated). Mirrors the
 * use-keyboard-inset signal — visualViewport diff with the same 80px noise
 * clamp — and blurs the input when the keyboard height transitions >0 → 0
 * while the input still holds focus, so the NEXT back press runs the
 * single-dispatcher back contract immediately.
 * @param {import('react').RefObject<HTMLInputElement|null>} inputRef
 * @returns {void}
 */
export function useImeHideBlur(inputRef) {
  const prevKbRef = React.useRef(0);
  React.useEffect(() => {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const onChange = () => {
      const diff = Math.max(0, window.innerHeight - vv.height);
      const kh = diff > 80 ? diff : 0; // same residual-noise clamp as use-keyboard-inset
      if (kh === 0 && prevKbRef.current > 0 && inputRef.current && document.activeElement === inputRef.current) {
        inputRef.current.blur();
      }
      prevKbRef.current = kh;
    };
    vv.addEventListener('resize', onChange);
    vv.addEventListener('scroll', onChange);
    return () => {
      vv.removeEventListener('resize', onChange);
      vv.removeEventListener('scroll', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only listener; inputRef identity is stable.
  }, []);
}

export function SearchScreen({ query, onQueryChange, settings, onSettingsChange, onSelect, onBack, searchScope, searchContext, onToggleScope, onCommand, onOpenSongs = null }) {
  // Songs of the Letters (L8): ONE shortcut row at the top when the LOADED song catalog matches the query — a
  // pure in-memory filter (findSongFamilies, bundle-d). Songs never join the MiniSearch index, so a daily catalog
  // change never forces the index rebuild; a catalog not yet loaded shows nothing and is not fetched from here.
  const songCatalog = typeof SongCatalog !== 'undefined' ? SongCatalog : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (songCatalog ? songCatalog.subscribe(cb) : () => {}), [songCatalog]),
    React.useCallback(() => (songCatalog ? songCatalog.getVersion() : 0), [songCatalog])
  );
  const songQuery = (query || '').trim();
  // Re-read on every render (the catalog's version re-renders this screen): findSongFamilies caches its words.
  const songsFound = songQuery.length >= 2 && typeof findSongFamilies === 'function' ? findSongFamilies(songQuery).length : 0;
  const inputRef = React.useRef(null);
  useImeHideBlur(inputRef);
  const memo = searchMemo((query || '').trim(), settings, searchScope);
  const resumed = lastSearch && lastSearch.memo === memo && (query || '').trim() ? lastSearch : null;
  const [state, setState] = React.useState(resumed ? resumed.state : { phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0, capped: [], truncated: false, corrections: [] });
  // the search this screen opened on, already on screen: not run again
  const resumedFrom = React.useRef(resumed ? memo : null);
  /* Under a card (a named passage, a book name) the words' matches stop at five, so the
     card is not buried (search-2). "resurrection" and "passover" are passages AND the
     words of hundreds of letters, and the rest were out of reach (search audit
     2026-09-27): the summary offers them, for this query only. */
  const [allWordsFor, setAllWordsFor] = React.useState(resumed ? resumed.allWordsFor : '');
  const [buildInfo, setBuildInfo] = React.useState(/** @type {{ ready: boolean, building: boolean, progress: any, error?: string }} */ ({ ready: false, building: false, progress: null }));
  const [showSuggest, setShowSuggest] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState([]);
  const [recents, setRecents] = React.useState([]);
  // W0 (micro-gap b): the recent-search query whose per-chip ✕ was tapped;
  // non-null swaps the chips row for a ConfirmStrip ("remove" vocabulary).
  const [confirmRecent, setConfirmRecent] = React.useState(null);
  const debounceRef = React.useRef(null);

  // Build the index on mount, for the reader's edition. The engine loads every
  // corpus it reads before it builds (engine.js init, sweep W2): a query already
  // here ("search this", a restored tab) or typed meanwhile waits in the engine
  // for the same whole index, rather than building one from what had loaded. A
  // warm boot restores the serialized index from the Cache API (~0.3s) instead
  // of rebuilding (~10s) behind the progress bar. A change of edition here
  // builds again behind it.
  const translation = settings.translation || 'nkjv';
  React.useEffect(() => {
    const E = pickEngine();
    if (!E) {
      // Wave-0: was "…Check browser console." — dev-speak facing the user.
      setBuildInfo({ ready: false, building: false, progress: null, error: "Search couldn't start. Try closing and reopening the app — your data is safe." });
      return undefined;
    }
    // Ready is not enough: an index for another edition, or from fewer texts than are loaded now, is built again.
    if (E.getState().ready && (typeof E.isCurrent !== 'function' || E.isCurrent({ translation }))) {setBuildInfo({ ready: true, building: false, progress: null });return undefined;}
    // A cold build runs ~10s; backing out of Search mid-build must not keep
    // reporting progress into an unmounted screen. The build itself continues
    // (the engine caches it for the next open) — only the setState stops.
    let cancelled = false;
    setBuildInfo({ ready: false, building: true, progress: null });
    E.init({
      translation,
      onProgress: (done, total) => { if (!cancelled) setBuildInfo((b) => ({ ...b, progress: { done, total } })); }
    })
      .then(() => { if (!cancelled) setBuildInfo({ ready: true, building: false, progress: null }); })
      .catch((err) => { if (!cancelled) setBuildInfo({ ready: false, building: false, progress: null, error: err?.message || String(err) }); });
    return () => { cancelled = true; };
  }, [translation]);

  /* THE BOX TAKES THE FOCUS AS IT MOUNTS (search200 B3). An 80 ms timer lost the keys
     typed after the tap that opened the screen ("love your enemies" read "ove your
     enemies"), and a query restored with the screen took the cursor at its end, so
     typing appended to it. The focus comes in the commit that mounts the box; a
     restored query is selected, so the first key replaces it. A screen that took the
     focus back in its first frames gets it once more, and Chrome, which drops a
     selection made before the box is first laid out (it read 0-0), gets it again
     while the query is still the restored one. */
  // The query the box came with, until the reader's first tap on it (D3, below).
  const restoredRef = React.useRef('');
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return undefined;
    const first = el.value;
    restoredRef.current = first;
    const take = () => {
      if (!el.isConnected) return;
      if (document.activeElement !== el) {
        try { el.focus({ preventScroll: true }); } catch { el.focus(); }
      }
      if (first && el.value === first && el.selectionStart === el.selectionEnd) {
        try { el.setSelectionRange(0, first.length); } catch { el.select(); }
      }
    };
    take();
    const t = setTimeout(take, 80);
    return () => clearTimeout(t);
  }, []);

  /* THE TAP BACK INTO A QUERY THE SCREEN CAME WITH TAKES IT WHOLE (search200 UX D3). On a phone the
     mount's focus brings no keyboard; the reader taps the box for one. A box that had let the focus go
     (Enter does, and the app went to the background with it so) took that tap as a caret where the
     finger landed, and the next key went into the query: "Mercy" and an m read "Memrcy" (vot_api34).
     The query the screen mounted with, or still held when the app came back on screen, is selected
     by the reader's first tap on it, so the first key replaces it; the next tap is their own caret,
     and a query they have typed or changed since is theirs to edit where they tap. */
  React.useEffect(() => {
    const onShow = () => {
      const el = inputRef.current;
      if (document.visibilityState === 'visible' && el && el.value) restoredRef.current = el.value;
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);
  const tapRestored = (/** @type {{ currentTarget: HTMLInputElement }} */ e) => {
    const el = e.currentTarget;
    const restored = restoredRef.current;
    restoredRef.current = '';
    if (!restored || el.value !== restored) return;
    try { el.setSelectionRange(0, restored.length); } catch { el.select(); }
  };

  // Compute suggestions as-you-type. They stay closed for the query they were closed
  // on (a pick, Escape, the clear button) and open again once it changes. A flag
  // reset on every query change reopened them on the pick itself, which changes
  // the query (search audit 2026-09-27).
  /* A search Back resumes opens with them closed (search200 bugcheck #1): the list it was read from is the answer,
     and the closed-for query did not survive the remount, so they opened over it. */
  const [dismissedFor, setDismissedFor] = React.useState(/** @type {string|null} */ (resumed ? query : null));
  // The option the arrow keys are on (search200 B3), -1 for none: the box keeps the focus, and names it.
  const [activeSug, setActiveSug] = React.useState(-1);
  React.useEffect(() => {
    const q = (query || '').trim();
    setActiveSug(-1);
    if (!q || q.length < 1 || q.length > 40) {setSuggestions([]);setShowSuggest(false);return;}
    const E = pickEngine();
    if (!E) return;
    /* A suggestion that would search the box's own words offers nothing (search200 UX D4): typed whole, a
       named passage's name opened its own entry over the passage card the search put at the top, whose
       "Named passage — open" strip sat half under the list. It is left out; the rest still open the list. */
    const own = q.toLowerCase().replace(/\s+/g, ' ');
    const s = E.suggest(q, { max: 9 }).filter((x) => String(x.query || '').trim().toLowerCase().replace(/\s+/g, ' ') !== own).slice(0, 8);
    setSuggestions(s);
    setShowSuggest(s.length > 0 && !buildInfo.building && dismissedFor !== query);
  }, [query, buildInfo.building, dismissedFor]);
  const suggestOpen = showSuggest && suggestions.length > 0;
  /** Close the list; `dismiss`: and keep it closed for this query (Enter, Escape), where a blur or a scroll
   *  lets the box open it again. */
  const closeSuggest = (/** @type {boolean} */ dismiss) => {
    setShowSuggest(false);
    setActiveSug(-1);
    if (dismiss) setDismissedFor(query);
  };
  const suggestRef = React.useRef(/** @type {HTMLDivElement|null} */ (null));

  // Run search with debounce — one box, one index, everything included.
  React.useEffect(() => {
    /* NO `if (!buildInfo.ready) return;` HERE — that line was half of search-6.
       `search()` now parses before it waits, so a command or a reference answers
       immediately whatever the index is doing, and a TEXT query waits inside the
       engine exactly where it always did. Gating here as well would put the
       decision in two places and only one of them would know the query's kind. */
    const q = (query || '').trim();
    if (!q) {setState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0, capped: [], truncated: false, corrections: [] });return;}
    // SRCH-6: a 1-char query floods the forward tokenizer with hundreds of title
    // prefix hits ("a" → every "A Warning"/"ABASEMENT"…). Require ≥2 alphanumerics
    // before the full search; the suggest box (above) still reacts at 1 char.
    if (q.replace(/[^\p{L}\p{N}]/gu, '').length < 2) {setState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0, capped: [], truncated: false, corrections: [] });return;}
    // Stale-query guard: the engine yields the main thread mid-search, so a
    // slow older query can resolve AFTER a newer one and silently overwrite
    // its results (and after unmount, setState into a dead screen). The
    // cleanup runs on every dep change, marking this effect's in-flight
    // promise stale — only the latest query's resolution commits.
    let stale = false;
    // ...and the engine stops ranking for it at its next turn (sr7): typing a burst no longer ranks every prefix in full.
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    /* THE MEANING CAN COME AFTER THE SEARCH (sr11 S22 look, 2026-10-15). The on-device model starts when the page is
       idle, so a search typed in a session's first seconds ran on the words alone, and the screen kept that list until
       the query changed. Such a search (meaningLater) runs again once the model is ready: quietly, with no "Searching"
       and no error over the list it replaces; a list resumed on Back is ranked again the same way. */
    const run = (/** @type {boolean} */ quiet) => pickEngine().search(q, {
      translation: settings.translation || 'nkjv',
      useStopWords: settings.searchUseStopWords !== false,
      synonyms: settings.searchSynonyms !== false,
      scope: searchScope || null,
      corpus: settings.searchCorpus || 'all',
      limit: SEARCH_TOTAL_LIMIT,
      perVolume: SEARCH_LIMIT,
      allWords: allWordsFor === q,
      signal: ctl ? ctl.signal : undefined
    }).then((r) => {
      if (stale || (quiet && r.error)) return;
      // SRCH4: include the matched synonyms (when synonym search is on) so the
      // snippet highlights the word that actually surfaced the verse.
      const stop = markStopWords(/** @type {any} */ (window).VotSearchData);
      const terms = expandSnippetTerms(
        // search-2: under a nav card `parsed` is the CARD's kind, so the
        // snippet terms have to come from the text reading of the same query
        // or the hits arrive with nothing highlighted.
        r.textQuery || r.parsed, r.parsedTerms || [],
        /** @type {any} */ (window).VotSearchData && /** @type {any} */ (window).VotSearchData.SYNONYM_MAP,
        settings.searchSynonyms !== false,
        stop,
      );
      // `stopTyped`: the small words typed, whose engine forms ("whom" for "who") a card leaves unmarked.
      const stopTyped = typedStopWords(r.textQuery || r.parsed, r.parsedTerms || [], stop);
      /* `memo`: the search this list came from (search200 B2). The groups are keyed by it, not by the live memo,
         which a tab or scope change moves at once: keyed live, the groups remounted over the OLD list (long, so
         closed), and the new list, a lone group, arrived under the same key and stayed closed over a blank screen.
         `refParsed`: the parse is held to the tab ("john 3:16" under Volumes is words), but a reference answers
         under any tab, so the card reads the query across all of it (the parse needs no index). Only a
         reference does (REF_CARD_KINDS): a bare book name under Volumes stays the words it is. */
      const corpus = settings.searchCorpus || 'all';
      const E = pickEngine();
      let refParsed = null;
      if (corpus !== 'all' && (!r.parsed || r.parsed.kind === 'text') && E && typeof E.parse === 'function') {
        try { const p = E.parse(q, { corpus: 'all' }); if (p && REF_CARD_KINDS.indexOf(p.kind) >= 0) refParsed = p; } catch { /* words, then */ }
      }
      // `q`: the text this list answers (search200 B9 review); the box can be ahead of it, a key typed since.
      const done = { phase: 'done', memo, q, parsed: r.parsed, refParsed, results: r.results || [], terms, stopTyped, error: r.error ? String(r.error) : null, total: (r.results || []).length, capped: r.capped || [], truncated: !!r.truncated, corrections: r.corrections || [], stopWordsOnly: !!r.stopWordsOnly, unquoted: r.unquoted || null, meaningLater: !!r.meaningLater };
      if (!r.error) lastSearch = { memo, allWordsFor, state: done };
      setState(done);
      if (r.meaningLater) rankWithMeaning();
    }).catch((err) => {
      if (stale || quiet) return;
      setState({ phase: 'done', memo, q, parsed: null, results: [], terms: [], error: err?.message || String(err), total: 0, capped: [], truncated: false, corrections: [] });
    });
    const rankWithMeaning = () => {
      const E = pickEngine();
      if (E && typeof E.whenMeaningReady === 'function') E.whenMeaningReady().then((ok) => { if (ok && !stale) run(true); });
    };
    if (resumedFrom.current === memo && lastSearch && lastSearch.allWordsFor === allWordsFor) {
      if (lastSearch.state.meaningLater) rankWithMeaning();
      return () => { stale = true; if (ctl) ctl.abort(); };
    }
    resumedFrom.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // W0 (micro-gap c): mark the search in-flight so the UI shows a
      // live-region indicator until the engine resolves. Prior results stay
      // on screen underneath (state.results is untouched here).
      setState((s) => ({ ...s, phase: 'searching' }));
      run(false);
    }, 140);
    return () => {
      stale = true;
      if (ctl) ctl.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, buildInfo.ready, settings.translation, settings.searchUseStopWords, settings.searchSynonyms, settings.searchCorpus, searchScope, allWordsFor, memo]);

  // The search the list on screen came from (see `done` above): its groups' keys and their memory.
  const listMemo = state.memo || memo;

  /* STUDY NOTES, CHAPTER SUMMARIES AND HEADINGS (Corbin 2026-10-23, DECISIONS item 5). The engine keeps them in an
     index of their own (searchNotes, search/notes-index.js), asked once the list is on screen, so the ranked results
     are the search's alone; the screen lists them as one group after every collection (renderNotes, below). Only a
     search of words asks: a reference or a command has no words to find there. Keyed by the list's memo. */
  const [notes, setNotes] = React.useState(/** @type {{ memo: string, items: any[] }} */ ({ memo: '', items: [] }));
  React.useEffect(() => {
    if (state.phase !== 'done' || !state.memo || state.error || !state.parsed || state.parsed.kind !== 'text') return undefined;
    const E = pickEngine();
    if (!E || typeof E.searchNotes !== 'function') return undefined;
    let stale = false;
    const forMemo = state.memo;
    E.searchNotes(state.q, {
      translation: settings.translation || 'nkjv',
      useStopWords: settings.searchUseStopWords !== false,
      corpus: settings.searchCorpus || 'all',
      scope: searchScope || null,
    }).then((items) => { if (!stale) setNotes({ memo: forMemo, items: Array.isArray(items) ? items : [] }); }).catch(() => {});
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the list's memo names the query, tab, scope and settings it was searched with.
  }, [state.memo, state.phase]);
  const noteItems = notes.memo && notes.memo === state.memo && state.parsed && state.parsed.kind === 'text' ? notes.items : [];

  /* A NEW SEARCH LANDS AT THE TOP (search200 B2). Refining a query while scrolled down
     showed the new list from mid-list ("forgive one another" scrolled to 500, refined to
     "seventy times": the new list opened at 680). A list from a new search is a screen
     landing, the one-shot write LetterView makes on its own landing; it yields to
     scroll-restore, the lease's writer for a list resumed on Back (use-autoscroll.js), and
     a quiet re-rank or "Show every match" keeps the search, so it keeps the place. */
  const screenRef = React.useRef(/** @type {HTMLDivElement|null} */ (null));
  const landedFor = React.useRef(resumed ? memo : '');
  const landedAt = React.useRef(0);
  React.useEffect(() => {
    const m = state.memo || '';
    if (!m || m === landedFor.current) return;
    landedFor.current = m;
    if (document.body.classList.contains('scroll-restoring')) return;
    const sc = screenRef.current && screenRef.current.closest('.screen-scroll');
    if (sc && typeof sc.scrollTo === 'function') { landedAt.current = Date.now(); sc.scrollTo({ top: 0 }); }
  }, [state.memo]);

  /* THE SUGGESTIONS CLOSE WHEN THE RESULTS SCROLL (search200 B3): left open, the list sat
     over the controls under it and caught their taps. The landing above is not the
     reader's scroll: a refined query lands while its suggestions are open. */
  React.useEffect(() => {
    if (!suggestOpen) return undefined;
    const sc = screenRef.current && screenRef.current.closest('.screen-scroll');
    if (!sc) return undefined;
    const onScroll = () => {
      if (Date.now() - landedAt.current < 300) return;
      setShowSuggest(false);
      setActiveSug(-1);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, [suggestOpen]);

  // Handle command-kind parsed results
  React.useEffect(() => {
    if (state.parsed && state.parsed.kind === 'command') {
      if (onCommand) onCommand(state.parsed.action);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: effect should fire only when parsed-result changes. Adding onCommand would re-fire on every parent re-render that rebuilds the callback, calling the command handler multiple times for the same parsed.command. Closure always picks up the latest onCommand at the point state.parsed actually changes.
  }, [state.parsed]);

  // [8] Book order — a client-side view over the fetched set (the corpus
  // pills above narrow what is SEARCHED; this re-orders what is RENDERED —
  // instant, no re-query). Resets on a new query. The result-filter chips
  // that sat beside it (All / Scriptures / Volumes / WTLB / Studies) were the
  // corpus row said twice on one screen, and the one place the app wrote
  // "WTLB"; deleted 2026-09-13 (catalogue SR1 + SR2).
  // It used to re-sort inside the groups only: a long result set opens with every
  // group closed under Best Matches, the one row it never touched, so the switch
  // changed nothing a reader could see (Corbin 2026-10-14, sr12). Book order now
  // drops Best Matches (relevance's row) and opens every collection in reading order.
  const [sortMode, setSortMode] = React.useState('relevance'); // 'relevance' | 'canonical'
  React.useEffect(() => { setSortMode('relevance'); }, [query]);
  const bookOrder = sortMode === 'canonical';
  // Canonical book positions: the CONSTANT map (utils/search.js) — never
  // the lazy corpus, which usually isn't loaded on this screen (the first
  // cut read Object.keys(BOOKS) and silently no-opped; owner-caught).
  const bookIndex = SRCH_CANONICAL_BOOK_INDEX;

  // Group results by source, the groups in the site's order.
  const grouped = React.useMemo(
    () => groupInSiteOrder(state.results, srchGroupKey, SRCH_GROUP_META),
    [state.results]
  );

  // The groups whose collection hit the engine's per-collection cap (it names
  // collections by volumeId; a group is keyed by srchGroupKey, the same id but
  // for the Study Bible, 'matthew-study' -> 'matthew').
  const cappedGroups = React.useMemo(() => {
    const out = new Set();
    if (!state.capped.length) return out;
    const vids = new Set(state.capped);
    for (const entry of state.results) {
      if (entry.doc && vids.has(entry.doc.volumeId)) out.add(srchGroupKey(entry.doc));
    }
    return out;
  }, [state.results, state.capped]);

  // Book order re-sorts EVERY group: verses by book, chapter and verse, a
  // collection's letters, entries and topics by their number (Brianna,
  // 2026-09-26: the volumes in order, and the letters in each).
  const visibleGroups = React.useMemo(() => {
    if (!bookOrder) return grouped;
    return grouped.map((g) => ({ key: g.key, items: srchSortCanonical(g.items, bookIndex) }));
  }, [grouped, bookOrder, bookIndex]);

  // Book order on a passage search (sr13, the S22 10-14): "I am The Lord and I do not change" opened on
  // Genesis 4:9, one of 1,344 texts holding a few of its words, all listed in reading order. The engine
  // marks such a search's results `close` (the typed words together) or not: Book order lists the close
  // ones, each collection in reading order, and the rest behind one line. A search with nothing marked
  // (a keyword, a quote), or with every result on one side, lists them all as before.
  const [showLoose, setShowLoose] = React.useState(false);
  React.useEffect(() => { setShowLoose(false); }, [query]);
  const closeSplit = React.useMemo(() => {
    if (!bookOrder) return null;
    const isClose = (/** @type {any} */ e) => e.close === true;
    if (!state.results.some(isClose) || !state.results.some((/** @type {any} */ e) => e.close === false)) return null;
    const part = (/** @type {boolean} */ want) => visibleGroups
      .map((g) => ({ key: g.key, items: g.items.filter((e) => isClose(e) === want) }))
      .filter((g) => g.items.length > 0);
    const loose = part(false);
    return { close: part(true), loose, looseCount: loose.reduce((n, g) => n + g.items.length, 0) };
  }, [bookOrder, state.results, visibleGroups]);

  /** One list of collections. `view` names the order and the list (each remembers its own open groups);
      `capped`: the list can say a collection holds more than it shows ("400+"), which a close list never does. */
  const renderGroups = (/** @type {Array<{key: string, items: any[], more?: boolean}>} */ groups, /** @type {string} */ view, /** @type {boolean} */ capped) => (
    <div className="srch-groups">
      {groups.map((g) => (
        <SrchGroup
          /* Keyed by the search the list came from (state.memo, search200 B2):
             narrowed to Scriptures, the one group left opens as a lone group
             does, not closed as the All list had it. And by the order: each
             order opens with its own state, and the group remembers each (a
             group opened under Relevance is open again after a trip to Book
             order). */
          key={g.key + '|' + listMemo + '|' + view}
          gkey={g.key}
          items={g.items}
          more={!!g.more}
          capped={capped && cappedGroups.has(g.key)}
          terms={state.terms}
          stopTyped={state.stopTyped}
          onSelect={handleSelect}
          memo={listMemo}
          view={view}
          /* Book order opens every collection with its first ten, so a phone
             draws a few cards per collection, not fifty each. */
          page={bookOrder && groups.length > 1 ? SRCH_BOOK_FIRST_PAGE : undefined}
          /* A long result set opens as a contents list, every collection
             closed under Best Matches, so the reader picks the collection;
             opening the first five used to open whichever five ranked
             highest, which in the site's order would be the Bible and
             Volumes One to Four whatever the query. */
          defaultOpen={bookOrder || groups.length === 1 || state.results.length <= 30}
        />
      ))}
    </div>
  );

  /** The study notes, chapter summaries and headings: one group, after the collections (opened as a short list's are). */
  const renderNotes = () => (
    <div className="srch-groups srch-notes">
      <SrchGroup
        key={'notes|' + listMemo}
        gkey="notes"
        items={noteItems}
        terms={state.terms}
        stopTyped={state.stopTyped}
        onSelect={handleSelect}
        memo={listMemo}
        view="relevance"
        defaultOpen={state.results.length <= 30}
      />
    </div>
  );

  // Build "direct" fake entries from parsed ref/passage/book (shown at top before results).
  // A reference answers under any tab (search200 B2): "john 3:16" typed under Volumes lost
  // its card, because the engine's parse is held to the tab; `refParsed` is the query read
  // across all of it, when the engine's own parse found words.
  /* `engineNav`: the ENGINE read a reference, so its words stop at the closest few under the card and the card
     stands for the row of best matches. A card from `refParsed` sits above the tab's own search, which keeps
     its Best Matches and its count. */
  const engineNav = !!(state.parsed && NAV_KINDS.indexOf(state.parsed.kind) >= 0);
  const navParsed = engineNav ? state.parsed : (state.refParsed || null);
  const directEntries = React.useMemo(() => {
    const p = navParsed;
    if (!p) return [];
    const curCorpus = settings.searchCorpus || 'all';
    const out = [];
    if (p.kind === 'ref-bible' || p.kind === 'named-passage') {
      // A range across chapters names both ends, "John 14:1-16:33" (sweep W32); a chapter range is "Matthew 5-7".
      const lbl = p.bookTitle + ' ' + (p.chapterEnd && p.verseStart
        ? p.chapter + ':' + p.verseStart + '-' + p.chapterEnd + (p.verseEnd ? ':' + p.verseEnd : '')
        : p.chapter + (p.chapterEnd ? '-' + p.chapterEnd : '') + (p.verseStart ? ':' + p.verseStart + (p.verseEnd ? '-' + p.verseEnd : '') : ''));
      const quote = refQuote(p, settings.translation || 'nkjv');
      out.push({ __direct: true, __corpus: curCorpus, __label: lbl, __sub: quote || (p.kind === 'named-passage' ? 'Named passage — open' : 'Open chapter'), ref: p });
    } else if (p.kind === 'ref-letter') {
      const lr = letterRefCards(p, /** @type {any} */ (window).VotSearchData, window);
      for (const c of lr.cards) out.push({ __direct: true, __corpus: curCorpus, ...c });
    } else if (p.kind === 'ref-book') {
      out.push({ __direct: true, __corpus: curCorpus, __label: p.bookTitle, __sub: 'Open book index', ref: p });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildInfo.ready: the collections' letters load with the index, and the cards read them off window.
  }, [navParsed, settings.searchCorpus, settings.translation, buildInfo.ready]);

  // A letter reference to a letter that is not there says so, instead of a card that does nothing.
  const letterRefMissing = React.useMemo(() => {
    const p = navParsed;
    if (!p || p.kind !== 'ref-letter') return null;
    return letterRefCards(p, /** @type {any} */ (window).VotSearchData, window).missing;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildInfo.ready: as above, the letters load with the index.
  }, [navParsed, buildInfo.ready]);

  // Top results: the best 5 hits shown before the groups whenever there is more
  // than one group, in every corpus. The groups follow the site's order, not
  // relevance, so this row is where relevance leads (only for text queries —
  // a reference the engine read already has its card; one read across every
  // tab, `refParsed`, sits above the tab's own row, search200 B2 review).
  const topCards = React.useMemo(() => {
    if (!state.results.length) return [];
    if (engineNav && directEntries.length > 0) return [];
    if (grouped.length <= 1) return [];
    // One card per text: a Holy Days entry reprints its letter word for word, and
    // both took a place in the five. A reprint of another standing whose shown passage
    // is the card's folds under it as "Also in N places" (srch-reprints.js, search200 UX
    // B10 2); a copy the fold cannot read (the same name and opening) is left out.
    const seen = new Set();
    return foldReprints(state.results, (e) => cardPassage(e, state.terms, state.stopTyped), state.terms, {
      take: 5,
      reach: 30,
      skip: (r) => {
        const d = r.doc || {};
        const k = (d.title || d.ref || '') + '|' + String(d.text || '').slice(0, 80);
        if (seen.has(k)) return true;
        seen.add(k);
        return false;
      },
    });
  }, [state.results, state.terms, state.stopTyped, grouped.length, engineNav, directEntries.length]);
  /* A SHORT LIST SHOWS EACH RESULT ONCE (search200 B2). Thirty or fewer results open
     every group (renderGroups' defaultOpen) under Best Matches, which showed its five
     twice. The groups hold the rest, and one that gave some up counts them as "more";
     when the five are the whole list, the open groups are the list, with no row above.
     A reprint folded under a card is in Best Matches too. */
  const restGroups = React.useMemo(() => {
    if (bookOrder || !topCards.length || state.results.length > 30) return null;
    const inTop = new Set(topCards.flatMap((c) => [c.entry].concat(c.also)));
    return visibleGroups
      .map((g) => { const items = g.items.filter((e) => !inTop.has(e)); return { key: g.key, items, more: items.length < g.items.length }; })
      .filter((g) => g.items.length > 0);
  }, [bookOrder, topCards, state.results.length, visibleGroups]);
  const bestRow = restGroups && restGroups.length === 0 ? [] : topCards;
  const listGroups = restGroups && restGroups.length > 0 ? restGroups : visibleGroups;
  /* A section whose results all sit in Best Matches has no header under it (search200 B2 review): "Found 21
     matches across 8 sections" stood over three for "tittle". The summary then says the matches alone. */
  const sectionsListed = !(restGroups && restGroups.length > 0 && restGroups.length < grouped.length);
  /* THE TOPIC A QUESTION ASKS FOR (search200 ideas F, mockups/F-topic-card). "what does the lord say about tithing"
     asks for a topic: the card over Best Matches names the Answers topic among the results the model is surest of,
     wherever the words put it, when it is sure enough (srch-topic.js pickTopic: a confident wrong topic is worse
     than none), with two or three
     texts it quotes that the search found too; a topic quoting none of them quotes its own passage. Relevance's
     row, as Best Matches is: Book order is the list alone. */
  const topic = React.useMemo(() => {
    if (engineNav || !state.results.length || typeof state.q !== 'string') return null;
    const pick = pickTopic(state.q, state.results);
    if (!pick) return null;
    const found = topicTexts(pick.entry, state.results, (e) => cardPassage(e, state.terms, state.stopTyped));
    const texts = withOwnPassage(found, pick.entry, found.length < 2 ? cardPassage(pick.entry, state.terms, state.stopTyped) : '');
    return { entry: pick.entry, texts };
  }, [engineNav, state.results, state.q, state.terms, state.stopTyped]);

  // The switch matters when some group has two or more results to order, or when
  // there is a Best Matches row for Book order to set aside.
  const sortToggleVisible = bestRow.length > 0 || visibleGroups.some((g) => g.items.length > 1);

  // Fuzzy book suggestion for did-you-mean — very conservative.
  // Only fires when the query is a SHORT single-token that plausibly looks
  // like a mistyped book name (≥4 chars, no spaces, no results, no ref parse).
  // It reads the text the list answers (`state.q`), not the box (search200 UX D8): a key
  // typed since put "No results for “gensisx”" up before "gensisx" was searched.
  const didYouMean = React.useMemo(() => {
    if (!state.parsed || state.parsed.kind !== 'text' || state.results.length || !(query || '').trim()) return null;
    const q = (typeof state.q === 'string' ? state.q : query || '').trim();
    if (!q || q.length < 4 || q.length > 15) return null;
    if (/\s/.test(q)) return null; // multi-word: not a book attempt
    if (/[0-9:.,;-]/.test(q)) return null; // has digits/punctuation: already a ref attempt
    const guess = pickEngine().fuzzyBookSuggest(q);
    if (!guess) return null;
    const disp = window.VotSearchData.BOOK_DISPLAY[guess] || guess;
    if (disp.toLowerCase() === q.toLowerCase()) return null;
    return { original: q, suggestion: disp, rewrite: disp };
  }, [state.parsed, state.results.length, state.q, query]);

  // Recent searches (gated by the existing history privacy toggle). Refresh
  // whenever the box is empty (mount / clear / back-to-empty) so the list also
  // reflects a "/clear history".
  React.useEffect(() => {
    if (!query && typeof window.getRecentSearches === 'function') setRecents(window.getRecentSearches());
  }, [query]);

  // Record a query as "recent" only on an explicit commit (Enter or tapping a
  // result) — never per keystroke. Needs >=2 letters or digits (any script: a Greek or Hebrew word
  // counted none under [a-z0-9] and was never kept, sweep low) + history enabled.
  const recordSearch = () => {
    if (settings.historyEnabled === false) return;
    const q = (query || '').trim();
    if (q.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return;
    if (typeof window.addRecentSearch === 'function') setRecents(window.addRecentSearch(q));
  };

  // The query's terms ride along so the dispatcher can cut the matched excerpt
  // out of the doc and land the reader ON the passage (use-search.js).
  // `state.stopTyped`: the landing's find pill finds what the card marked (search200 UX D6).
  const handleSelect = (entry) => { recordSearch(); onSelect(entry, state.terms, (query || '').trim(), state.stopTyped); };

  // The box keeps the focus: the button that cleared it goes away with the query,
  // and the focus went with it (the keyboard closed under the reader's thumb).
  const clearQuery = () => {
    onQueryChange('');
    setShowSuggest(false);
    setActiveSug(-1);
    setDismissedFor('');
    if (inputRef.current) inputRef.current.focus();
  };

  /* A pick is a search, as Enter is: the keyboard goes down so the results it brings
     are not under it (search200 B3). */
  const fireSuggestion = (sug) => {
    setDismissedFor(sug.query);
    onQueryChange(sug.query);
    setShowSuggest(false);
    setActiveSug(-1);
    if (inputRef.current) inputRef.current.blur();
  };

  // The tab in use, and the one tap out of it (search200 B2).
  const corpus = settings.searchCorpus || 'all';
  const tabName = TAB_NAME[corpus] || null;
  const searchAll = () => onSettingsChange('searchCorpus', 'all');
  // Everywhere is no scope AND every text: the Volumes tab kept on found nothing in Luke's words again.
  const searchEverywhere = () => { onToggleScope(); if (corpus !== 'all') searchAll(); };
  const conflict = scopeConflict(searchScope, corpus);
  const scopeLabel = (searchContext && searchContext.label) || (searchScope && searchScope.label) || '';

  /* The recent searches and the quick picks: the empty screen's way in, and the no-results
     screen's way on (search200 B2: it was one grey line). */
  const pickRows = (
    <>
      {settings.historyEnabled !== false && recents.length > 0 && (
        <>
          <h2 className="srch-section-label">Recent</h2>
          {confirmRecent != null ? (
            /* W0 (micro-gap b): per-recent removal. Follows the
               ConfirmStrip convention — per-instance useId registration
               (back dismisses the confirm, not the screen), "remove"
               vocabulary (the stored query list is recoverable by
               searching again, so this is not a "delete"). The strip
               replaces the chips row, the LinkCard actions-row swap
               pattern. */
            <ConfirmStrip
              question={'Remove “' + confirmRecent + '” from recent searches?'}
              yesLabel="Yes, remove"
              onCancel={() => setConfirmRecent(null)}
              onConfirm={() => {
                if (typeof window.removeRecentSearch === 'function') setRecents(window.removeRecentSearch(confirmRecent));
                setConfirmRecent(null);
              }}
            />
          ) : (
            <div className="srch-quick-row">
              {recents.slice(0, 12).map((r) => (
                <span key={r} className="srch-quick-chip-wrap">
                  <button className="srch-quick-chip" onClick={() => onQueryChange(r)}>{r}</button>
                  <button
                    className="srch-chip-remove"
                    aria-label={'Remove recent search ' + r}
                    onClick={() => setConfirmRecent(r)}
                  >{"✕"}</button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <h2 className="srch-section-label">Quick picks</h2>
      <div className="srch-quick-row">
        {SRCH_QUICK_PICKS.map((q) => (
          <button key={q} className="srch-quick-chip" onClick={() => onQueryChange(q.toLowerCase())}>{q}</button>
        ))}
      </div>
    </>
  );

  const handleKey = (e) => {
    // A keyboard still composing a word (an IME) owns its keys, Enter among them.
    if (e.nativeEvent && e.nativeEvent.isComposing) return;
    const key = e.key;
    // The arrow keys walk the suggestions (search200 B3), round from either end; the box keeps the focus.
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      const n = suggestions.length;
      if (!n) return;
      e.preventDefault();
      if (!suggestOpen) { setShowSuggest(true); setActiveSug(key === 'ArrowDown' ? 0 : n - 1); return; }
      setActiveSug((a) => (key === 'ArrowDown' ? (a + 1) % n : (a <= 0 ? n - 1 : a - 1)));
      return;
    }
    if (key === 'Enter') {
      if (suggestOpen && activeSug >= 0 && suggestions[activeSug]) { e.preventDefault(); fireSuggestion(suggestions[activeSug]); return; }
      // Enter is the search done (search200 B3): the list closes, and the box lets go of the
      // focus, so the keyboard stops covering about 40% of the results.
      recordSearch();
      closeSuggest(true);
      if (inputRef.current) inputRef.current.blur();
      return;
    }
    if (key === 'Escape') {
      // A search box clears itself on Escape as well: closing the suggestions
      // emptied the query.
      e.preventDefault();
      if (showSuggest) {closeSuggest(true);} else
      if (query) {clearQuery();} else
      onBack();
    }
  };

  /* WHAT A SCREEN READER HEARS (search200 B9). The only status region was the
     "Searching…" bar, which came and went with its words, so nothing said the count or
     that nothing was found (a region that arrives with its text is not read). One region
     stays in the screen from the first frame and says each step in the screen's own
     words; a quiet re-rank says the same count again, so it says nothing new. */
  const qTrim = (query || '').trim();
  const isDone = !!qTrim && buildInfo.ready && state.phase === 'done';
  /* Under a reference card the words' matches stop at the closest few (search-2), and
     "Found 5+ matches" read as a count of the passage (search200 B5). */
  const closestOnly = engineNav && directEntries.length > 0 && state.truncated && allWordsFor !== qTrim;
  const countText = closestOnly ? 'Showing closest matches' : 'Found ' + matchCountLabel(state.results.length, state.capped.length > 0 || state.truncated) + ' '
    + (state.results.length === 1 ? 'match' : 'matches') + (sectionsListed ? ' across ' + grouped.length + ' ' + (grouped.length === 1 ? 'section' : 'sections') : '');
  const scopeIn = searchScope && searchContext ? ' in ' + searchContext.label : tabName ? ' in ' + tabName : '';
  /* A VERDICT NAMES THE TEXT SEARCHED (search200 B9 review). In the 140 ms before a key's
     search runs, the box is ahead of the list: built from the box, the region said "No
     results for “zzyzxqw”" for text not searched yet, at each key. `answered` is the text
     the list answers; text still waiting for its search is "Searching…", said once. */
  const answered = typeof state.q === 'string' ? state.q : qTrim;
  const pending = isDone && answered !== qTrim && qTrim.replace(/[^\p{L}\p{N}]/gu, '').length >= 2;

  /* A SEARCH THAT FOUND NOTHING OFFERS A WAY ON (search200 ideas G, mockups/G-empty-state). Under "No results for …":
     "Try fewer words: <the query's content words some text holds>" when that finds something under the same tab and
     scope, and the texts nearest by meaning (engine.js nearest) above the model's floor (srch-empty.js), each tagged
     "by meaning". Both are asked for once per search that found nothing (`emptyFor`, the list's memo); the nearest
     wait for the model when it is still loading. */
  const emptyFor = isDone && !pending && !state.error && state.parsed && state.parsed.kind === 'text' && state.results.length === 0 &&
    directEntries.length === 0 && !didYouMean && !letterRefMissing && !state.stopWordsOnly && !(searchScope && conflict) ? (state.memo || '') : '';
  const [emptyHelp, setEmptyHelp] = React.useState(/** @type {{ for: string, fewer: string, nearest: any[] }} */ ({ for: '', fewer: '', nearest: [] }));
  React.useEffect(() => {
    if (!emptyFor) return undefined;
    const E = pickEngine();
    if (!E) return undefined;
    let stale = false;
    const q = answered;
    setEmptyHelp({ for: emptyFor, fewer: '', nearest: [] });
    const put = (/** @type {{ fewer?: string, nearest?: any[] }} */ part) => { if (!stale) setEmptyHelp((h) => (h.for === emptyFor ? { ...h, ...part } : h)); };
    const stop = markStopWords(/** @type {any} */ (window).VotSearchData);
    const fewer = fewerWords(q, (w) => isStopTerm(w, stop), typeof E.knows === 'function' ? E.knows : null);
    if (fewer) {
      E.search(fewer, {
        translation, useStopWords: settings.searchUseStopWords !== false, synonyms: settings.searchSynonyms !== false,
        scope: searchScope || null, corpus, limit: 1, perVolume: 1,
      }).then((r) => { if (r && r.results && r.results.length) put({ fewer }); }).catch(() => {});
    }
    if (typeof E.nearest === 'function') {
      const ready = typeof E.whenMeaningReady === 'function' ? E.whenMeaningReady() : Promise.resolve(true);
      ready.then((ok) => (ok && !stale ? E.nearest(q, { corpus, scope: searchScope || null, limit: NEAREST_SHOWN * 2 }) : []))
        .then((n) => put({ nearest: nearestShown(n) })).catch(() => {});
    }
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- emptyFor is the search (its memo holds the query, tab, scope and settings); what else it reads is that search's.
  }, [emptyFor]);
  const help = emptyFor && emptyHelp.for === emptyFor ? emptyHelp : null;
  let liveText = '';
  if (qTrim && !/[\p{L}\p{N}]/u.test(qTrim)) liveText = 'Type a word, a title or a reference to search.';
  else if (qTrim && buildInfo.ready && (state.phase === 'searching' || pending)) liveText = 'Searching…';
  else if (isDone && state.error) liveText = 'Error: ' + state.error;
  else if (isDone) {
    const said = directEntries.map((d) => d.__label + '.');
    if (topic && !bookOrder) said.push('Answers Only God Can Give: ' + (topic.entry.doc.title || '') + '.');
    if (state.results.length > 0) {
      if (state.corrections.length > 0) said.push('Showing results for ' + correctedQuery(query, state.corrections) + '.');
      said.push(countText + '.');
    }
    if (letterRefMissing) said.push(letterRefMissing);
    else if (state.results.length === 0 && directEntries.length === 0) {
      if (didYouMean) said.push('No results for “' + didYouMean.original + '”. Did you mean ' + didYouMean.suggestion + '?');
      else if (state.stopWordsOnly) said.push('“' + answered + '” is in nearly every verse and letter. Add another word to search.');
      else if (searchScope && conflict) said.push(scopeLabel + ' is in ' + conflict.home + ', and the ' + conflict.tab + ' tab is on.');
      else said.push('No results for “' + answered + '”' + scopeIn + '.');
      if (help && help.fewer) said.push('Try fewer words: ' + help.fewer + '.');
      if (help && help.nearest.length) said.push(help.nearest.length + (help.nearest.length === 1 ? ' text' : ' texts') + ' nearest by meaning.');
    }
    liveText = said.join(' ');
  }

  return (
    /* NOT LibraryNav (documented exception): the search input row REPLACES the
       whole right half of the nav — no Home, no icon cluster — and app.css:319
       exempts this screen from the right-cluster anchor via :not(:has(~ .srch-input-row)). */
    <ScreenLayout hideTabsBtn={true} navChildren={
      <>
        <button className="nav-home nav-back-icon" onClick={onBack} title="Back" aria-label="Back">{"‹"}</button>
        <div className="srch-input-row">
          {/* C2-C [C8]: the app's PRIMARY search field named itself only by
              placeholder — which a screen reader stops announcing the moment
              a character is typed, and which nothing announces on a field
              restored with a query already in it. */}
          {/* search200 B3: a combobox over the suggestions' listbox (the ARIA 1.2
              pattern): the focus stays in the box, which names the option the
              arrow keys are on. */}
          <input
            ref={inputRef}
            className="search-input"
            type="search"
            role="combobox"
            aria-label="Search"
            aria-autocomplete="list"
            aria-expanded={suggestOpen}
            aria-controls={suggestOpen ? 'srch-suggest-list' : undefined}
            aria-activedescendant={suggestOpen && activeSug >= 0 ? 'srch-sug-' + activeSug : undefined}
            enterKeyHint="search"
            placeholder={PLACEHOLDER[corpus] || PLACEHOLDER.all}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onClick={tapRestored}
            onFocus={() => setShowSuggest(suggestions.length > 0 && dismissedFor !== query)}
            onBlur={(e) => {
              // A tap that leaves the box closes the list; a tap on one of its options is the list's own.
              const to = /** @type {Node|null} */ (e.relatedTarget);
              if (to && suggestRef.current && suggestRef.current.contains(to)) return;
              closeSuggest(false);
            }}
            onKeyDown={handleKey}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {/* …and its clear button announced as the bare glyph "✕". */}
          {query ? <button className="srch-clear-btn" onClick={clearQuery} title="Clear search" aria-label="Clear search">{"✕"}</button> : null}
        </div>
      </>
    }>
      <div className="search-screen" ref={screenRef}>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveText}</div>

        <div className="srch-corpus-row" role="tablist" aria-label="Search corpus">
          {[
            { k: 'all', label: 'All' },
            { k: 'scriptures', label: 'Scriptures' },
            { k: 'volumes', label: 'Volumes' }
          ].map((opt) => {
            const active = (settings.searchCorpus || 'all') === opt.k;
            return (
              <button
                key={opt.k}
                role="tab"
                aria-selected={active}
                className={"srch-corpus-btn" + (active ? " active" : "")}
                onClick={() => onSettingsChange('searchCorpus', opt.k)}
              >{opt.label}</button>
            );
          })}
        </div>

        {searchContext && (
          <button
            className={"srch-scope-chip " + (searchScope ? "active" : "")}
            onClick={onToggleScope}
          >
            {searchScope ? (
              <>
                <span className="srch-scope-chip-icon">{"✓"}</span>
                <span>Scoped to {searchContext.label}</span>
                <span className="srch-scope-chip-x">{"✕"}</span>
              </>
            ) : (
              <>
                <span className="srch-scope-chip-icon">{"⌕"}</span>
                <span>Search in {searchContext.label}</span>
              </>
            )}
          </button>
        )}

        {buildInfo.error && <div className="srch-error">{buildInfo.error}</div>}

        {buildInfo.building && !buildInfo.progress && (
          <div className="srch-progress">
            <span>Building search index…</span>
          </div>
        )}

        {buildInfo.building && buildInfo.progress && (
          <div className="srch-progress">
            <span>Building search index… {buildInfo.progress.done.toLocaleString()} / {buildInfo.progress.total.toLocaleString()}</span>
            <div className="srch-progress-bar">
              <div className="srch-progress-bar-fill" style={{ width: 100 * buildInfo.progress.done / Math.max(1, buildInfo.progress.total) + '%' }} />
            </div>
          </div>
        )}

        {suggestOpen && (
          <div className="srch-suggest-anchor"><div className="srch-suggest" id="srch-suggest-list" role="listbox" aria-label="Suggestions" ref={suggestRef}>
            {suggestions.map((s, i) => (
              /* A click picks (search200 B3): a screen reader's activation and a keyboard's
                 send no mousedown. The mousedown only keeps the focus in the box. */
              <button
                key={i}
                type="button"
                id={'srch-sug-' + i}
                role="option"
                aria-selected={i === activeSug}
                tabIndex={-1}
                className={'srch-suggest-item' + (i === activeSug ? ' active' : '')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fireSuggestion(s)}
              >
                <span className="srch-suggest-kind">{s.kind}</span>
                <span className="srch-suggest-label">{s.label}</span>
                {s.hint && <span className="srch-suggest-hint">{s.hint}</span>}
              </button>
            ))}
          </div></div>
        )}

        {state.error && <div className="srch-error">Error: {state.error}</div>}

        {!query && buildInfo.ready && (
          <>
            {/* The hero names the tab in use (search200 B2): a saved Scriptures tab sat lit
                under "Search everything". */}
            <div className="srch-empty-hero">
              {corpus === 'scriptures' ? (
                <>
                  <h2>Search the Scriptures</h2>
                  <p>Verses across all 66 books.{' '}<button type="button" className="srch-more-link" onClick={searchAll}>Search all</button></p>
                </>
              ) : corpus === 'volumes' ? (
                <>
                  <h2>Search the Volumes</h2>
                  <p>Letters, Words To Live By, Answers and Bible studies.{' '}<button type="button" className="srch-more-link" onClick={searchAll}>Search all</button></p>
                </>
              ) : (
                <>
                  <h2>Search everything</h2>
                  <p>Verses, letters, Words To Live By, Answers and Bible studies — across all 66 books and every Volume.</p>
                </>
              )}
              <p className="srch-hint">Try a reference (John 3:16), a phrase, or “exact words” in quotes.</p>
            </div>
            {pickRows}
          </>
        )}

        {didYouMean && (
          <div className="srch-did-you-mean">
            No results for “{didYouMean.original}” — did you mean <button onClick={() => onQueryChange(didYouMean.rewrite)}>{didYouMean.suggestion}</button>?
          </div>
        )}

        {/* W0 (micro-gap c): in-flight indicator; the indeterminate bar animation is
            near-zeroed by the global prefers-reduced-motion rule. The screen's one status
            region says "Searching…" (search200 B9), so the bar is for the eye. */}
        {query && buildInfo.ready && state.phase === 'searching' && (
          <div className="srch-progress srch-searching" aria-hidden="true">
            <span>Searching…</span>
            <div className="srch-progress-bar">
              <div className="srch-progress-bar-fill srch-indeterminate" />
            </div>
          </div>
        )}

        {songsFound > 0 && typeof onOpenSongs === 'function' ? (
          <button type="button" className="srch-songs-row" onClick={() => onOpenSongs(songQuery)}>
            <span aria-hidden="true">♪</span>
            <span className="srch-songs-row-text">{songsFound.toLocaleString('en-US')} {songsFound === 1 ? 'song matches' : 'songs match'} “{songQuery}”</span>
            <span aria-hidden="true">›</span>
          </button>
        ) : null}

        {/* A typo the engine corrected is said out loud, never done silently:
            "No results for “shephard”. Showing results for shepherd." The
            corrected query is a tap that puts it in the box. */}
        {query && state.phase === 'done' && state.results.length > 0 && state.corrections.length > 0 && (
          <div className="srch-corrected">
            No results for {state.corrections.map((c, i) => (
              <React.Fragment key={c.from}>{i > 0 ? ', ' : ''}“{c.from}”</React.Fragment>
            ))}. Showing results for{' '}
            <button type="button" className="srch-corrected-link" onClick={() => onQueryChange(correctedQuery(query, state.corrections))}>
              {correctedQuery(query, state.corrections)}
            </button>.
          </div>
        )}

        {/* The card answers the query; the summary below counts the words' matches,
            so it follows the card rather than seem to count it. */}
        {directEntries.length > 0 && (
          <div className="srch-groups">
            {directEntries.map((d, i) => (
              <SrchCard key={'d' + i} entry={d} terms={[]} onSelect={handleSelect} isDirect={true} />
            ))}
          </div>
        )}

        {/* A quote nothing holds word for word was searched as its words: said, not done silently. */}
        {query && state.phase === 'done' && state.results.length > 0 && state.unquoted && (
          <div className="srch-corrected">No exact match for “{state.unquoted}”. Showing results for its words.</div>
        )}

        {query && buildInfo.ready && state.phase === 'done' && state.results.length > 0 && (
          <div className="srch-results-summary">
            {closestOnly ? (
              <>
                Showing closest matches{' · '}
                <button type="button" className="srch-more-link" onClick={() => setAllWordsFor(qTrim)}>Show all</button>
              </>
            ) : (
              <>
                {/* W0 (micro-gap a): at the engine cap the count is a floor — "400+", not "400". */}
                Found <strong>{matchCountLabel(state.results.length, state.capped.length > 0 || state.truncated)} {state.results.length === 1 ? "match" : "matches"}</strong>
                {sectionsListed ? <>{" across "}<strong>{grouped.length} {grouped.length === 1 ? "section" : "sections"}</strong></> : null}
              </>
            )}
          </div>
        )}

        {/* [8] the order switch: both orders named, the one in use lit, and a line saying what it does
            (the old single button showed the OTHER order's name, which read as the current one). */}
        {sortToggleVisible && (
          <div className="srch-filter-row">
            <span className="srch-sort-note">{bookOrder ? 'Genesis to Revelation, then Volume One onward' : 'Best matches first'}</span>
            <div className="srch-sort" role="group" aria-label="Order results">
              <button type="button" className={'srch-sort-btn' + (bookOrder ? '' : ' active')} aria-pressed={!bookOrder}
                onClick={() => setSortMode('relevance')}>Relevance</button>
              <button type="button" className={'srch-sort-btn' + (bookOrder ? ' active' : '')} aria-pressed={bookOrder}
                onClick={() => setSortMode('canonical')}>Book order</button>
            </div>
          </div>
        )}

        {!bookOrder && topic ? <SrchTopicCard topic={topic} terms={state.terms} stopTyped={state.stopTyped} onSelect={handleSelect} /> : null}

        {!bookOrder && bestRow.length > 0 && (
          <div className="srch-top-results">
            <h2 className="srch-section-label">Best Matches</h2>
            {bestRow.map((c, i) => (
              <SrchCard key={'top' + i} entry={c.entry} also={c.also.length ? c.also : undefined} terms={state.terms} stopTyped={state.stopTyped} onSelect={handleSelect} memo={listMemo} where="best" />
            ))}
          </div>
        )}

        {closeSplit ? (
          <>
            <h2 className="srch-section-label srch-close-label">Closest matches</h2>
            {renderGroups(closeSplit.close, 'book', false)}
            {showLoose ? (
              <>
                <h2 className="srch-section-label srch-loose-label">Partial matches</h2>
                {renderGroups(closeSplit.loose, 'book-more', true)}
              </>
            ) : (
              <button type="button" className="srch-group-more srch-loose-more" onClick={() => setShowLoose(true)}>
                Show {matchCountLabel(closeSplit.looseCount, state.capped.length > 0 || state.truncated)} partial {closeSplit.looseCount === 1 ? 'match' : 'matches'}
              </button>
            )}
          </>
        ) : listGroups.length > 0 && renderGroups(listGroups, bookOrder ? 'book' : 'relevance', true)}

        {/* after the collections, never above one; under "No results" when no text holds the words (below) */}
        {noteItems.length > 0 && state.results.length > 0 ? renderNotes() : null}

        {query && state.phase === 'done' && letterRefMissing && (
          <div className="srch-corrected">{letterRefMissing}</div>
        )}

        {query && buildInfo.ready && state.phase === 'done' && state.results.length === 0 && directEntries.length === 0 && !didYouMean && !letterRefMissing && (
          /* No results says where it looked and offers a way on (search200 B2): the tab or the
             scope it was held to, a scope the tab cannot reach, a tip, and the picks. */
          <>
            <div className={'search-no-results' + (state.stopWordsOnly ? '' : ' has-picks')}>
              {state.stopWordsOnly ? (
                <>“{answered}” is in nearly every verse and letter. Add another word to search.</>
              ) : searchScope && conflict ? (
                <>
                  {scopeLabel} is in {conflict.home}, and the {conflict.tab} tab is on.{' '}
                  <button type="button" className="srch-more-link" onClick={searchAll}>Search {scopeLabel}</button>
                  {' · '}
                  <button type="button" className="srch-more-link" onClick={searchEverywhere}>Search everywhere</button>
                </>
              ) : help && help.fewer ? (
                <>
                  No results for “{answered}”{scopeIn}.
                  {/* The fewer words and the way out of the tab or scope, as one line of links (G's pick). */}
                  <span className="srch-fewer">
                    Try fewer words:{' '}
                    <button type="button" className="srch-more-link" onClick={() => onQueryChange(help.fewer)}>{help.fewer}</button>
                    {searchScope ? <>{' · '}<button type="button" className="srch-more-link" onClick={searchEverywhere}>Search everywhere</button></> :
                      tabName ? <>{' · '}<button type="button" className="srch-more-link" onClick={searchAll}>Search all</button></> : null}
                  </span>
                </>
              ) : (
                <>
                  No results for “{answered}”{scopeIn}.
                  {searchScope ? <>{' '}<button type="button" className="srch-more-link" onClick={searchEverywhere}>Search everywhere</button></> :
                    tabName ? <>{' '}<button type="button" className="srch-more-link" onClick={searchAll}>Search all</button></> : null}
                </>
              )}
              {state.stopWordsOnly || (searchScope && conflict) || (help && help.fewer) ? null : (
                <span className="srch-no-results-tip">Check the spelling, try fewer words, or type a reference such as John 3:16.</span>
              )}
            </div>
            {help && help.nearest.length ? (
              <div className="srch-nearest">
                <h2 className="srch-section-label srch-nearest-label">Nearest by meaning</h2>
                {help.nearest.map((e, i) => (
                  <SrchCard key={'near' + i} entry={e} terms={[]} onSelect={handleSelect} memo={listMemo} where="near" why="by meaning" />
                ))}
              </div>
            ) : null}
            {state.stopWordsOnly ? null : pickRows}
          </>
        )}

        {noteItems.length > 0 && state.results.length === 0 ? renderNotes() : null}

        {/* Nothing to search for: an emoji or punctuation alone left a blank screen. */}
        {query && query.trim() && !/[\p{L}\p{N}]/u.test(query) && (
          <div className="search-no-results">Type a word, a title or a reference to search.</div>
        )}

      </div>
    </ScreenLayout>
  );
}
