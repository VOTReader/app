/* ═══════════════════════════════════════════════════════════════════════
   SearchScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { kjvEncode } from '../../search/tokenize.js';
import { applyCorrections } from '../../search/query-parse.js';

/**
 * SRCH4: build the snippet-highlight term list. SrchSnippet only marks the terms
 * we hand it, so when synonym search is ON we expand each LITERAL query term
 * through the SAME SYNONYM_MAP the engine matched on — otherwise a verse surfaced
 * by a synonym (search "shepherd" → a "pastor" verse) shows the matched word
 * unhighlighted. Phrases are exempt (the engine never synonym-expands a phrase).
 * Cross-translation spelling variants (KJV "armour" vs NKJV "armor") have no such
 * map and stay unhighlighted — rare + acceptable. Pure for testability.
 * @param {{kind?:string, phrase?:string, run?:string}|null} parsed
 * @param {string[]} parsedTerms
 * @param {Record<string,string[]>|null|undefined} synMap
 * @param {boolean} synonymsOn
 * @param {Set<string>|null} [stop]  the stop words: dropped when real words were typed too
 * @returns {string[]}
 */
export function expandSnippetTerms(parsed, parsedTerms, synMap, synonymsOn, stop) {
  if (!parsed || parsed.kind !== 'text') return [];
  // A stop word typed among real words ("faith is the substance") ranks, but is not
  // a word to mark or count as a place (search audit 2026-09-27: the find pill read
  // "1 of 22" on a lone "is").
  const isStop = (/** @type {string} */ t) => { const toks = kjvEncode(t); return !!stop && toks.length > 0 && toks.every((w) => stop.has(w)); };
  const typed = (parsedTerms || []).some((t) => !isStop(t)) ? (parsedTerms || []).filter((t) => !isStop(t)) : (parsedTerms || []);
  // `run`: the engine found the typed words in a row, one real word among small ones ("for you to embrace me").
  const base = [parsed.phrase, parsed.run].filter(Boolean).concat(typed);
  if (!synonymsOn || !synMap) return base;
  const out = new Set(base);
  for (const t of (parsedTerms || [])) {
    const grp = synMap[String(t).toLowerCase()];
    if (Array.isArray(grp)) grp.forEach((g) => out.add(g));
  }
  return [...out];
}

// MiniSearch is THE engine (the owner A/B'd it against the retired FlexSearch
// Classic and kept it — typo tolerance, BM25 ranking, recent searches, warm IDB
// cache). It ships in bundle-e alongside this screen, so it's always loaded by
// the time this renders; pickEngine still guards for a hypothetical load failure.
function pickEngine() {
  return window.VotSearchMini;
}

/* A LETTER REFERENCE OPENS A LETTER THAT EXISTS (search audit 2026-09-27). "letter 55"
   made a card for Volume Two's Letter 55, which does not exist, and the tap did nothing;
   "volume 7 letter 99" the same. The numbered collections, in the site's order. */
const NUMBERED_LETTERS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'timothy', 'flock', 'rebuke'];

/**
 * The cards a letter reference offers, each naming the letter's title: the letter
 * named when its collection holds it; for "letter N" alone, each numbered collection
 * that holds a letter N. A collection whose letters have not loaded yet gets the card
 * as parsed (its tap resolves once they have). `missing` says a letter is not there.
 * @param {any} p  a ref-letter parse
 * @param {any} D  VotSearchData
 * @param {any} win  where the collections' letters live (window)
 * @returns {{ cards: Array<{__label:string, __sub:string, ref:any}>, missing: string|null }}
 */
export function letterRefCards(p, D, win) {
  const cols = (D && D.VOLUME_COLLECTIONS) || [];
  /** undefined: not loaded; null: not there */
  const letterOf = (/** @type {any} */ vc, /** @type {number} */ num) => {
    const arr = vc.dataVar && win ? win[vc.dataVar] : null;
    if (!Array.isArray(arr)) return undefined;
    if (num === 0) return (vc.prefaceVar && win[vc.prefaceVar]) || arr.find((l) => l && l.num === 0) || null;
    return arr.find((l) => l && l.num === num) || null;
  };
  const card = (/** @type {any} */ vc, /** @type {any} */ L, /** @type {string} */ label) => ({
    __label: label,
    __sub: (L && L.title) || 'Open letter',
    ref: { ...p, anyVolume: false, volumeId: vc.id, volumeScreen: vc.screen, letterId: (L && L.id) || null },
  });
  if (p.anyVolume) {
    const cards = [];
    let unknown = false;
    for (const id of NUMBERED_LETTERS) {
      const vc = cols.find((/** @type {any} */ c) => c.id === id);
      if (!vc) continue;
      const L = letterOf(vc, p.letterNum);
      if (L === undefined) unknown = true;
      else if (L) cards.push(card(vc, L, vc.label + ' · Letter ' + p.letterNum));
    }
    if (cards.length) return { cards, missing: null };
    if (unknown) return { cards: [{ __label: p.label, __sub: 'Open letter', ref: p }], missing: null };
    return { cards: [], missing: 'No collection has a Letter ' + p.letterNum + '.' };
  }
  const vc = cols.find((/** @type {any} */ c) => c.id === p.volumeId);
  if (!vc) return { cards: [{ __label: p.label, __sub: 'Open letter', ref: p }], missing: null };
  const L = letterOf(vc, p.letterNum);
  if (L === null) {
    const arr = win[vc.dataVar] || [];
    let hi = 0;
    for (const l of arr) if (l && typeof l.num === 'number' && l.num > hi) hi = l.num;
    const what = p.letterNum === 0 ? 'a preface' : (/^v\d$/.test(vc.id) || NUMBERED_LETTERS.indexOf(vc.id) >= 0 ? 'Letter ' : 'number ') + p.letterNum;
    return { cards: [], missing: vc.label + ' has no ' + what + (hi ? ' (it runs 1 to ' + hi + ').' : '.') };
  }
  return { cards: [card(vc, L, p.label)], missing: null };
}

// The engine keeps at most SEARCH_LIMIT hits PER COLLECTION (its perVolume
// option), so the Bible's verses can no longer crowd the letters out of the All
// corpus, and SEARCH_TOTAL_LIMIT in all, a bound the shipped corpus never
// reaches ("the": about 3,300). A collection that hit its cap may hold more, so
// its count reads "400+", and so does the summary (W0 micro-gap a: never present
// a cap as the full count).
export const SEARCH_LIMIT = 400;
export const SEARCH_TOTAL_LIMIT = 6000;

/* SEARCH COMES BACK AS THE READER LEFT IT (search audit 2026-09-27). Back from a
   result re-ran the search from nothing, and the screen's scroll was restored
   against an empty list before the results arrived ("flood": 920 px became 379).
   The last finished search is kept, and a screen opened on the same query and
   settings starts from it; what was opened in it is srch-memory's (bundle-d). */
/** @type {{ memo: string, allWordsFor: string, state: any } | null} */
let lastSearch = null;

/**
 * The one string a search's results, and what was opened in them, are kept under.
 * @param {string} q  the query, trimmed
 * @param {any} settings
 * @param {any} scope
 * @returns {string}
 */
export function searchMemo(q, settings, scope) {
  const s = settings || {};
  return [q, s.searchCorpus || 'all', s.translation || 'nkjv', s.searchUseStopWords !== false, s.searchSynonyms !== false, scope ? JSON.stringify(scope) : ''].join('\u0001');
}

/**
 * Honest result-count label: "<count>+" when the engine cut the results short
 * (a collection hit its cap, or the total did), else the exact count, grouped
 * ("1,290"). Pure for testability.
 * @param {number} count
 * @param {boolean} [more] the engine cut the results short
 * @returns {string}
 */
export function matchCountLabel(count, more) {
  return count.toLocaleString('en-US') + (more ? '+' : '');
}

/**
 * Bucket results by collection and list the buckets in the SITE's order
 * (SRCH_GROUP_META `order`: the Bible, then the collections as
 * trumpetcallofgodonline.com lists them). Relevance used to order the buckets, so
 * Volume Seven could sit above Volume Two and the list reshuffled on every
 * query; a reader who navigates by collection now finds each one where it
 * always is (Brianna, 2026-09-26). Relevance keeps its place in each bucket's
 * own order and in the Best Matches row above the buckets. Pure for testability.
 * @param {Array<{doc:Object}>} results  the engine's hits, relevance order
 * @param {(doc:Object) => string} groupKey
 * @param {Record<string, {order?:number}>} meta
 * @returns {Array<{key:string, items:Array<{doc:Object}>}>}
 */
export function groupInSiteOrder(results, groupKey, meta) {
  const groups = Object.create(null);
  const keys = [];
  for (const entry of results) {
    const g = groupKey(entry.doc);
    if (!groups[g]) { groups[g] = []; keys.push(g); }
    groups[g].push(entry);
  }
  const rank = (k) => (meta[k] && meta[k].order) || 99;
  // Array.prototype.sort is stable: two unknown keys keep their first-seen order.
  keys.sort((a, b) => rank(a) - rank(b));
  return keys.map((k) => ({ key: k, items: groups[k] }));
}

/**
 * The query with each corrected word put in (the engine's `corrections`: a typed
 * word that found nothing of its own, searched as the nearest indexed word). The
 * note under the corpus row offers it: "Showing results for the lord is my
 * shepherd". A query word is matched the way the engine read it (kjvEncode: any
 * case, accents and apostrophes folded), so an accented typo is rewritten too
 * (review of 875dff9f). Pure.
 * @param {string} query
 * @param {Array<{from:string, to:string}>} corrections
 * @returns {string}
 */
export function correctedQuery(query, corrections) {
  return applyCorrections(query, corrections);
}

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

  // Build the index on mount. The engine reads the lazy corpus globals
  // (BOOKS / MATTHEW / VOT / ANSWERS); building before they arrive yields an
  // empty index, so load every corpus first, then build. A warm boot restores the
  // serialized index from the vot-minisearch-cache IDB (~0.3s) instead of
  // rebuilding (~10s) behind the progress bar.
  React.useEffect(() => {
    const E = pickEngine();
    if (!E) {
      // Wave-0: was "…Check browser console." — dev-speak facing the user.
      setBuildInfo({ ready: false, building: false, progress: null, error: "Search couldn't start. Try closing and reopening the app — your data is safe." });
      return undefined;
    }
    if (E.getState().ready) {setBuildInfo({ ready: true, building: false, progress: null });return undefined;}
    // A cold build runs ~10s; backing out of Search mid-build must not keep
    // reporting progress into an unmounted screen. The build itself continues
    // (the engine caches it for the next open) — only the setState stops.
    let cancelled = false;
    setBuildInfo({ ready: false, building: true, progress: null });
    const loadBible = (typeof window.__loadBibleCorpus === 'function') ? window.__loadBibleCorpus().catch(() => {}) : Promise.resolve();
    const loadMatthew = (typeof window.__loadMatthewCorpus === 'function') ? window.__loadMatthewCorpus().catch(() => {}) : Promise.resolve();
    const loadVot = (typeof window.__loadVotCorpus === 'function') ? window.__loadVotCorpus().catch(() => {}) : Promise.resolve();
    const loadAnswers = (typeof window.__loadAnswersCorpus === 'function') ? window.__loadAnswersCorpus().catch(() => {}) : Promise.resolve();
    // The studies too (v09-perf-01): without them a boot-then-Search index had no
    // study chapters, and the cache key flipped on whether Studies had been opened.
    const loadStudies = (typeof loadBibleStudies === 'function') ? Promise.resolve(loadBibleStudies()).catch(() => {}) : Promise.resolve();
    Promise.all([loadBible, loadMatthew, loadVot, loadAnswers, loadStudies])
      .then(() => E.init({
        onProgress: (done, total) => { if (!cancelled) setBuildInfo((b) => ({ ...b, progress: { done, total } })); }
      }))
      .then(() => { if (!cancelled) setBuildInfo({ ready: true, building: false, progress: null }); })
      .catch((err) => { if (!cancelled) setBuildInfo({ ready: false, building: false, progress: null, error: err?.message || String(err) }); });
    return () => { cancelled = true; };
  }, []);

  // Focus input on mount
  React.useEffect(() => {
    const t = setTimeout(() => {if (inputRef.current) inputRef.current.focus();}, 80);
    return () => clearTimeout(t);
  }, []);

  // Compute suggestions as-you-type. They stay closed for the query they were closed
  // on (a pick, Escape, the clear button) and open again once it changes. A flag
  // reset on every query change reopened them on the pick itself, which changes
  // the query (search audit 2026-09-27).
  const [dismissedFor, setDismissedFor] = React.useState(/** @type {string|null} */ (null));
  React.useEffect(() => {
    const q = (query || '').trim();
    if (!q || q.length < 1 || q.length > 40) {setSuggestions([]);setShowSuggest(false);return;}
    const E = pickEngine();
    if (!E) return;
    const s = E.suggest(q, { max: 8 });
    setSuggestions(s);
    setShowSuggest(s.length > 0 && !buildInfo.building && dismissedFor !== query);
  }, [query, buildInfo.building, dismissedFor]);

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
    if (resumedFrom.current === memo && lastSearch && lastSearch.allWordsFor === allWordsFor) return;
    resumedFrom.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Stale-query guard: the engine yields the main thread mid-search, so a
    // slow older query can resolve AFTER a newer one and silently overwrite
    // its results (and after unmount, setState into a dead screen). The
    // cleanup runs on every dep change, marking this effect's in-flight
    // promise stale — only the latest query's resolution commits.
    let stale = false;
    debounceRef.current = setTimeout(() => {
      // W0 (micro-gap c): mark the search in-flight so the UI shows a
      // live-region indicator until the engine resolves. Prior results stay
      // on screen underneath (state.results is untouched here).
      setState((s) => ({ ...s, phase: 'searching' }));
      pickEngine().search(q, {
        translation: settings.translation || 'nkjv',
        useStopWords: settings.searchUseStopWords !== false,
        synonyms: settings.searchSynonyms !== false,
        scope: searchScope || null,
        corpus: settings.searchCorpus || 'all',
        limit: SEARCH_TOTAL_LIMIT,
        perVolume: SEARCH_LIMIT,
        allWords: allWordsFor === q
      }).then((r) => {
        if (stale) return;
        // SRCH4: include the matched synonyms (when synonym search is on) so the
        // snippet highlights the word that actually surfaced the verse.
        const terms = expandSnippetTerms(
          // search-2: under a nav card `parsed` is the CARD's kind, so the
          // snippet terms have to come from the text reading of the same query
          // or the hits arrive with nothing highlighted.
          r.textQuery || r.parsed, r.parsedTerms || [],
          /** @type {any} */ (window).VotSearchData && /** @type {any} */ (window).VotSearchData.SYNONYM_MAP,
          settings.searchSynonyms !== false,
          /** @type {any} */ (window).VotSearchData && /** @type {any} */ (window).VotSearchData.STOP_WORDS_TRIMMED,
        );
        const done = { phase: 'done', parsed: r.parsed, results: r.results || [], terms, error: r.error ? String(r.error) : null, total: (r.results || []).length, capped: r.capped || [], truncated: !!r.truncated, corrections: r.corrections || [], stopWordsOnly: !!r.stopWordsOnly, unquoted: r.unquoted || null };
        if (!r.error) lastSearch = { memo, allWordsFor, state: done };
        setState(done);
      }).catch((err) => {
        if (stale) return;
        setState({ phase: 'done', parsed: null, results: [], terms: [], error: err?.message || String(err), total: 0, capped: [], truncated: false, corrections: [] });
      });
    }, 140);
    return () => {
      stale = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, buildInfo.ready, settings.translation, settings.searchUseStopWords, settings.searchSynonyms, settings.searchCorpus, searchScope, allWordsFor, memo]);

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
  const [sortMode, setSortMode] = React.useState('relevance'); // 'relevance' | 'canonical'
  React.useEffect(() => { setSortMode('relevance'); }, [query]);
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
    if (sortMode !== 'canonical') return grouped;
    return grouped.map((g) => ({ key: g.key, items: srchSortCanonical(g.items, bookIndex) }));
  }, [grouped, sortMode, bookIndex]);
  // The toggle only matters when some group has two or more results to order.
  const sortToggleVisible = React.useMemo(
    () => visibleGroups.some((g) => g.items.length > 1),
    [visibleGroups]
  );

  // Build "direct" fake entries from parsed ref/passage/book (shown at top before results).
  // Engine-gated: Scriptures corpus shows only bible/book/named-passage refs;
  // Volumes corpus shows only letter refs. No crossover.
  const directEntries = React.useMemo(() => {
    const p = state.parsed;
    if (!p) return [];
    const curCorpus = settings.searchCorpus || 'all';
    const allowBible = curCorpus === 'all' || curCorpus === 'scriptures';
    const allowLetter = curCorpus === 'all' || curCorpus === 'volumes';
    const out = [];
    if ((p.kind === 'ref-bible' || p.kind === 'named-passage') && allowBible) {
      const lbl = p.bookTitle + ' ' + p.chapter + (p.chapterEnd ? '-' + p.chapterEnd : '') + (p.verseStart ? ':' + p.verseStart + (p.verseEnd ? '-' + p.verseEnd : '') : '');
      out.push({ __direct: true, __corpus: curCorpus, __label: lbl, __sub: p.kind === 'named-passage' ? 'Named passage — open' : 'Open chapter', ref: p });
    } else if (p.kind === 'ref-letter' && allowLetter) {
      const lr = letterRefCards(p, /** @type {any} */ (window).VotSearchData, window);
      for (const c of lr.cards) out.push({ __direct: true, __corpus: curCorpus, ...c });
    } else if (p.kind === 'ref-book' && allowBible) {
      out.push({ __direct: true, __corpus: curCorpus, __label: p.bookTitle, __sub: 'Open book index', ref: p });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildInfo.ready: the collections' letters load with the index, and the cards read them off window.
  }, [state.parsed, settings.searchCorpus, buildInfo.ready]);

  // A letter reference to a letter that is not there says so, instead of a card that does nothing.
  const letterRefMissing = React.useMemo(() => {
    const p = state.parsed;
    if (!p || p.kind !== 'ref-letter' || (settings.searchCorpus || 'all') === 'scriptures') return null;
    return letterRefCards(p, /** @type {any} */ (window).VotSearchData, window).missing;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildInfo.ready: as above, the letters load with the index.
  }, [state.parsed, settings.searchCorpus, buildInfo.ready]);

  // Top results: the best 5 hits shown before the groups whenever there is more
  // than one group, in every corpus. The groups follow the site's order, not
  // relevance, so this row is where relevance leads (only for text queries —
  // ref queries already have directEntries cards).
  const topResults = React.useMemo(() => {
    if (!state.results.length) return [];
    if (directEntries.length > 0) return [];
    if (grouped.length <= 1) return [];
    // One card per text: a Holy Days entry reprints its letter word for word, and
    // both took a place in the five.
    const seen = new Set();
    const top = [];
    for (const r of state.results) {
      const d = r.doc || {};
      const k = (d.title || d.ref || '') + '|' + String(d.text || '').slice(0, 80);
      if (seen.has(k)) continue;
      seen.add(k);
      top.push(r);
      if (top.length === 5) break;
    }
    return top;
  }, [state.results, grouped.length, directEntries.length]);

  // Fuzzy book suggestion for did-you-mean — very conservative.
  // Only fires when the query is a SHORT single-token that plausibly looks
  // like a mistyped book name (≥4 chars, no spaces, no results, no ref parse).
  const didYouMean = React.useMemo(() => {
    if (!state.parsed || state.parsed.kind !== 'text' || state.results.length) return null;
    const q = (query || '').trim();
    if (!q || q.length < 4 || q.length > 15) return null;
    if (/\s/.test(q)) return null; // multi-word: not a book attempt
    if (/[0-9:.,;-]/.test(q)) return null; // has digits/punctuation: already a ref attempt
    const guess = pickEngine().fuzzyBookSuggest(q);
    if (!guess) return null;
    const disp = window.VotSearchData.BOOK_DISPLAY[guess] || guess;
    if (disp.toLowerCase() === q.toLowerCase()) return null;
    return { original: q, suggestion: disp, rewrite: disp };
  }, [state.parsed, state.results.length, query]);

  // Recent searches (gated by the existing history privacy toggle). Refresh
  // whenever the box is empty (mount / clear / back-to-empty) so the list also
  // reflects a "/clear history".
  React.useEffect(() => {
    if (!query && typeof window.getRecentSearches === 'function') setRecents(window.getRecentSearches());
  }, [query]);

  // Record a query as "recent" only on an explicit commit (Enter or tapping a
  // result) — never per keystroke. Needs >=2 alphanumerics + history enabled.
  const recordSearch = () => {
    if (settings.historyEnabled === false) return;
    const q = (query || '').trim();
    if (q.replace(/[^a-z0-9]/gi, '').length < 2) return;
    if (typeof window.addRecentSearch === 'function') setRecents(window.addRecentSearch(q));
  };

  // The query's terms ride along so the dispatcher can cut the matched excerpt
  // out of the doc and land the reader ON the passage (use-search.js).
  const handleSelect = (entry) => { recordSearch(); onSelect(entry, state.terms, (query || '').trim()); };

  // The box keeps the focus: the button that cleared it goes away with the query,
  // and the focus went with it (the keyboard closed under the reader's thumb).
  const clearQuery = () => {
    onQueryChange('');
    setShowSuggest(false);
    setDismissedFor('');
    if (inputRef.current) inputRef.current.focus();
  };

  const fireSuggestion = (sug) => {
    setDismissedFor(sug.query);
    onQueryChange(sug.query);
    setShowSuggest(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { recordSearch(); return; }
    if (e.key === 'Escape') {
      // A search box clears itself on Escape as well: closing the suggestions
      // emptied the query.
      e.preventDefault();
      if (showSuggest) {setShowSuggest(false);setDismissedFor(query);} else
      if (query) {clearQuery();} else
      onBack();
    }
  };

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
          <input
            ref={inputRef}
            className="search-input"
            type="search"
            aria-label="Search"
            placeholder="Search scriptures, volumes, studies…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setShowSuggest(suggestions.length > 0 && dismissedFor !== query)}
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
      <div className="search-screen">

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

        {showSuggest && suggestions.length > 0 && (
          <div className="srch-suggest-anchor"><div className="srch-suggest">
            {suggestions.map((s, i) => (
              <button key={i} className="srch-suggest-item" onMouseDown={(e) => {e.preventDefault();fireSuggestion(s);}}>
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
            <div className="srch-empty-hero">
              <h3>Search everything</h3>
              <p>Verses, letters, Words To Live By and Bible studies — across all 66 books and every Volume.</p>
            </div>
            {settings.historyEnabled !== false && recents.length > 0 && (
              <>
                <div className="srch-section-label">Recent</div>
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
            <div className="srch-section-label">Quick picks</div>
            <div className="srch-quick-row">
              {SRCH_QUICK_PICKS.map((q) => (
                <button key={q} className="srch-quick-chip" onClick={() => onQueryChange(q.toLowerCase())}>{q}</button>
              ))}
            </div>
          </>
        )}

        {didYouMean && (
          <div className="srch-did-you-mean">
            No results for “{didYouMean.original}” — did you mean <button onClick={() => onQueryChange(didYouMean.rewrite)}>{didYouMean.suggestion}</button>?
          </div>
        )}

        {/* W0 (micro-gap c): in-flight indicator. role="status" + aria-live
            polite per the live-region discipline (AutoScrollControl readout
            precedent); the indeterminate bar animation is near-zeroed by the
            global prefers-reduced-motion rule. */}
        {query && buildInfo.ready && state.phase === 'searching' && (
          <div className="srch-progress srch-searching" role="status" aria-live="polite">
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
            {/* W0 (micro-gap a): at the engine cap the count is a floor — "400+", not "400". */}
            Found <strong>{matchCountLabel(state.results.length, state.capped.length > 0 || state.truncated)} {state.results.length === 1 ? "match" : "matches"}</strong>
            {" across "}<strong>{grouped.length} {grouped.length === 1 ? "section" : "sections"}</strong>
            {directEntries.length > 0 && state.truncated && allWordsFor !== query.trim() && (
              <>
                {' · '}
                <button type="button" className="srch-more-link" onClick={() => setAllWordsFor(query.trim())}>Show every match</button>
              </>
            )}
          </div>
        )}

        {/* [8] the relevance/book-order sort toggle for verse results — the row's one button. */}
        {sortToggleVisible && (
          <div className="srch-filter-row">
            <button
              className="srch-sort-btn"
              aria-label={sortMode === 'relevance' ? 'Sort results in book order' : 'Sort results by relevance'}
              onClick={() => setSortMode(sortMode === 'relevance' ? 'canonical' : 'relevance')}
            >{sortMode === 'relevance' ? 'Book order' : 'Relevance'}</button>
          </div>
        )}

        {topResults.length > 0 && (
          <div className="srch-top-results">
            <div className="srch-section-label">Best Matches</div>
            {topResults.map((entry, i) => (
              <SrchCard key={'top' + i} entry={entry} terms={state.terms} onSelect={handleSelect} memo={memo} where="best" />
            ))}
          </div>
        )}

        {visibleGroups.length > 0 && (
          <div className="srch-groups">
            {visibleGroups.map((g) => (
              <SrchGroup
                /* Not keyed by the sort: toggling Book order must not close
                   the group the reader opened (cards carry stable keys). */
                /* ...but keyed by the search: narrowed to Scriptures, the one group left
                   opens as a lone group does, not closed as the All list had it. */
                key={g.key + '|' + memo}
                gkey={g.key}
                items={g.items}
                capped={cappedGroups.has(g.key)}
                terms={state.terms}
                onSelect={handleSelect}
                memo={memo}
                /* A long result set opens as a contents list, every collection
                   closed under Best Matches, so the reader picks the collection;
                   opening the first five used to open whichever five ranked
                   highest, which in the site's order would be the Bible and
                   Volumes One to Four whatever the query. */
                defaultOpen={visibleGroups.length === 1 || state.results.length <= 30}
              />
            ))}
          </div>
        )}

        {query && state.phase === 'done' && letterRefMissing && (
          <div className="srch-corrected">{letterRefMissing}</div>
        )}

        {query && buildInfo.ready && state.phase === 'done' && state.results.length === 0 && directEntries.length === 0 && !didYouMean && !letterRefMissing && (
          <div className="search-no-results">
            {state.stopWordsOnly ?
            <>“{query.trim()}” is in nearly every verse and letter. Add another word to search.</> :
            <>No results for “{query.trim()}”{searchScope && searchContext ? ' in ' + searchContext.label : ''}.</>}
            {searchScope && !state.stopWordsOnly ? <>{' '}<button type="button" className="srch-more-link" onClick={onToggleScope}>Search everywhere</button></> : null}
          </div>
        )}

        {/* Nothing to search for: an emoji or punctuation alone left a blank screen. */}
        {query && query.trim() && !/[\p{L}\p{N}]/u.test(query) && (
          <div className="search-no-results">Type a word, a title or a reference to search.</div>
        )}

      </div>
    </ScreenLayout>
  );
}
