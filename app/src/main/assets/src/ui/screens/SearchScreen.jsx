/* ═══════════════════════════════════════════════════════════════════════
   SearchScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * SRCH4: build the snippet-highlight term list. SrchSnippet only marks the terms
 * we hand it, so when synonym search is ON we expand each LITERAL query term
 * through the SAME SYNONYM_MAP the engine matched on — otherwise a verse surfaced
 * by a synonym (search "shepherd" → a "pastor" verse) shows the matched word
 * unhighlighted. Phrases are exempt (the engine never synonym-expands a phrase).
 * Cross-translation spelling variants (KJV "armour" vs NKJV "armor") have no such
 * map and stay unhighlighted — rare + acceptable. Pure for testability.
 * @param {{kind?:string, phrase?:string}|null} parsed
 * @param {string[]} parsedTerms
 * @param {Record<string,string[]>|null|undefined} synMap
 * @param {boolean} synonymsOn
 * @returns {string[]}
 */
export function expandSnippetTerms(parsed, parsedTerms, synMap, synonymsOn) {
  if (!parsed || parsed.kind !== 'text') return [];
  const base = [parsed.phrase].filter(Boolean).concat(parsedTerms || []);
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

// The engine keeps at most SEARCH_LIMIT hits PER COLLECTION (its perVolume
// option), so the Bible's verses can no longer crowd the letters out of the All
// corpus, and SEARCH_TOTAL_LIMIT in all, a bound the shipped corpus never
// reaches ("the": about 3,300). A collection that hit its cap may hold more, so
// its count reads "400+", and so does the summary (W0 micro-gap a: never present
// a cap as the full count).
export const SEARCH_LIMIT = 400;
export const SEARCH_TOTAL_LIMIT = 6000;

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
 * shepherd". Whole words, any case; a word the query does not hold as typed (the
 * engine folds accents and apostrophes) leaves the query as it was. Pure.
 * @param {string} query
 * @param {Array<{from:string, to:string}>} corrections
 * @returns {string}
 */
export function correctedQuery(query, corrections) {
  let q = String(query || '').trim();
  for (const c of corrections || []) {
    if (!c || !c.from || !c.to) continue;
    const esc = c.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    q = q.replace(new RegExp('(?<![\\p{L}\\p{N}])' + esc + '(?![\\p{L}\\p{N}])', 'giu'), c.to);
  }
  return q;
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
  const [state, setState] = React.useState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0, capped: [], truncated: false, corrections: [] });
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

  // Compute suggestions as-you-type. Re-show on every query change, hide only
  // on explicit user action (pick / blur / Escape / clear).
  const [suggestDismissed, setSuggestDismissed] = React.useState(false);
  React.useEffect(() => {setSuggestDismissed(false);}, [query]);
  React.useEffect(() => {
    const q = (query || '').trim();
    if (!q || q.length < 1 || q.length > 40) {setSuggestions([]);setShowSuggest(false);return;}
    const E = pickEngine();
    if (!E) return;
    const s = E.suggest(q, { max: 8 });
    setSuggestions(s);
    setShowSuggest(s.length > 0 && !buildInfo.building && !suggestDismissed);
  }, [query, buildInfo.building, suggestDismissed]);

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
    if (q.replace(/[^a-z0-9]/gi, '').length < 2) {setState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0, capped: [], truncated: false, corrections: [] });return;}
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
        perVolume: SEARCH_LIMIT
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
        );
        setState({ phase: 'done', parsed: r.parsed, results: r.results || [], terms, error: r.error ? String(r.error) : null, total: (r.results || []).length, capped: r.capped || [], truncated: !!r.truncated, corrections: r.corrections || [] });
      }).catch((err) => {
        if (stale) return;
        setState({ phase: 'done', parsed: null, results: [], terms: [], error: err?.message || String(err), total: 0, capped: [], truncated: false, corrections: [] });
      });
    }, 140);
    return () => {
      stale = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, buildInfo.ready, settings.translation, settings.searchUseStopWords, settings.searchSynonyms, settings.searchCorpus, searchScope]);

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
      const lbl = p.bookTitle + ' ' + p.chapter + (p.chapterEnd ? '–' + p.chapterEnd : '') + (p.verseStart ? ':' + p.verseStart + (p.verseEnd ? '-' + p.verseEnd : '') : '');
      out.push({ __direct: true, __corpus: curCorpus, __label: lbl, __sub: p.kind === 'named-passage' ? 'Named passage — open' : 'Open chapter', ref: p });
    } else if (p.kind === 'ref-letter' && allowLetter) {
      out.push({ __direct: true, __corpus: curCorpus, __label: p.label, __sub: 'Open letter', ref: p });
    } else if (p.kind === 'ref-book' && allowBible) {
      out.push({ __direct: true, __corpus: curCorpus, __label: p.bookTitle, __sub: 'Open book index', ref: p });
    }
    return out;
  }, [state.parsed, settings.searchCorpus]);

  // Top results: the best 5 hits shown before the groups whenever there is more
  // than one group, in every corpus. The groups follow the site's order, not
  // relevance, so this row is where relevance leads (only for text queries —
  // ref queries already have directEntries cards).
  const topResults = React.useMemo(() => {
    if (!state.results.length) return [];
    if (directEntries.length > 0) return [];
    if (grouped.length <= 1) return [];
    return state.results.slice(0, 5);
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
  const handleSelect = (entry) => { recordSearch(); onSelect(entry, state.terms); };

  const clearQuery = () => {onQueryChange('');setShowSuggest(false);setSuggestDismissed(true);};

  const fireSuggestion = (sug) => {
    onQueryChange(sug.query);
    setShowSuggest(false);
    setSuggestDismissed(true);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { recordSearch(); return; }
    if (e.key === 'Escape') {
      if (showSuggest) {setShowSuggest(false);setSuggestDismissed(true);} else
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
            onFocus={() => setShowSuggest(suggestions.length > 0)}
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
          <div className="srch-suggest">
            {suggestions.map((s, i) => (
              <button key={i} className="srch-suggest-item" onMouseDown={(e) => {e.preventDefault();fireSuggestion(s);}}>
                <span className="srch-suggest-kind">{s.kind}</span>
                <span className="srch-suggest-label">{s.label}</span>
                {s.hint && <span className="srch-suggest-hint">{s.hint}</span>}
              </button>
            ))}
          </div>
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

        {query && buildInfo.ready && state.phase === 'done' && state.results.length > 0 && (
          <div className="srch-results-summary">
            {/* W0 (micro-gap a): at the engine cap the count is a floor — "400+", not "400". */}
            Found <strong>{matchCountLabel(state.results.length, state.capped.length > 0 || state.truncated)} {state.results.length === 1 ? "match" : "matches"}</strong>
            {" across "}<strong>{grouped.length} {grouped.length === 1 ? "section" : "sections"}</strong>
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

        {directEntries.length > 0 && (
          <div className="srch-groups">
            {directEntries.map((d, i) => (
              <SrchCard key={'d' + i} entry={d} terms={[]} onSelect={handleSelect} isDirect={true} />
            ))}
          </div>
        )}

        {topResults.length > 0 && (
          <div className="srch-top-results">
            <div className="srch-section-label">Best Matches</div>
            {topResults.map((entry, i) => (
              <SrchCard key={'top' + i} entry={entry} terms={state.terms} onSelect={handleSelect} />
            ))}
          </div>
        )}

        {visibleGroups.length > 0 && (
          <div className="srch-groups">
            {visibleGroups.map((g) => (
              <SrchGroup
                /* Not keyed by the sort: toggling Book order must not close
                   the group the reader opened (cards carry stable keys). */
                key={g.key + '|' + query}
                gkey={g.key}
                items={g.items}
                capped={cappedGroups.has(g.key)}
                terms={state.terms}
                onSelect={handleSelect}
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

        {query && buildInfo.ready && state.phase === 'done' && state.results.length === 0 && directEntries.length === 0 && !didYouMean && (
          <div className="search-no-results">No results for “{query.trim()}”</div>
        )}

      </div>
    </ScreenLayout>
  );
}
