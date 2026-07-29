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

// W0 (micro-gap a/c): the engine is asked for at most SEARCH_LIMIT hits, so a
// result count of exactly SEARCH_LIMIT means "at least that many" — the summary
// must say "400+", never present the cap as the full count.
export const SEARCH_LIMIT = 400;

/**
 * Honest result-count label: "<limit>+" when the engine cap was hit, else the
 * exact count as a string. Pure for testability.
 * @param {number} count
 * @param {number|null|undefined} limit 0/null/undefined = uncapped
 * @returns {string}
 */
export function matchCountLabel(count, limit) {
  return (limit && count >= limit) ? limit + '+' : String(count);
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

export function SearchScreen({ query, onQueryChange, settings, onSettingsChange, onSelect, onBack, searchScope, searchContext, onToggleScope, onCommand }) {
  const inputRef = React.useRef(null);
  useImeHideBlur(inputRef);
  const [state, setState] = React.useState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0 });
  const [buildInfo, setBuildInfo] = React.useState({ ready: false, building: false, progress: null });
  const [showSuggest, setShowSuggest] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState([]);
  const [recents, setRecents] = React.useState([]);
  // W0 (micro-gap b): the recent-search query whose per-chip ✕ was tapped;
  // non-null swaps the chips row for a ConfirmStrip ("remove" vocabulary).
  const [confirmRecent, setConfirmRecent] = React.useState(null);
  const debounceRef = React.useRef(null);

  // Build the index on mount. The engine reads the lazy corpus globals
  // (BOOKS / MATTHEW / VOT); building before they arrive yields an empty
  // index, so load every corpus first, then build. A warm boot restores the
  // serialized index from the vot-minisearch-cache IDB (~0.3s) instead of
  // rebuilding (~10s) behind the progress bar.
  React.useEffect(() => {
    const E = pickEngine();
    if (!E) {
      // Wave-0: was "…Check browser console." — dev-speak facing the user.
      setBuildInfo({ ready: false, building: false, progress: null, error: "Search couldn't start. Try closing and reopening the app — your data is safe." });
      return;
    }
    if (E.getState().ready) {setBuildInfo({ ready: true, building: false, progress: null });return;}
    setBuildInfo({ ready: false, building: true, progress: null });
    const loadBible = (typeof window.__loadBibleCorpus === 'function') ? window.__loadBibleCorpus().catch(() => {}) : Promise.resolve();
    const loadMatthew = (typeof window.__loadMatthewCorpus === 'function') ? window.__loadMatthewCorpus().catch(() => {}) : Promise.resolve();
    const loadVot = (typeof window.__loadVotCorpus === 'function') ? window.__loadVotCorpus().catch(() => {}) : Promise.resolve();
    Promise.all([loadBible, loadMatthew, loadVot])
      .then(() => E.init({
        onProgress: (done, total) => setBuildInfo((b) => ({ ...b, progress: { done, total } }))
      }))
      .then(() => setBuildInfo({ ready: true, building: false, progress: null }))
      .catch((err) => setBuildInfo({ ready: false, building: false, progress: null, error: err?.message || String(err) }));
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
    if (!buildInfo.ready) return;
    const q = (query || '').trim();
    if (!q) {setState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0 });return;}
    // SRCH-6: a 1-char query floods the forward tokenizer with hundreds of title
    // prefix hits ("a" → every "A Warning"/"ABASEMENT"…). Require ≥2 alphanumerics
    // before the full search; the suggest box (above) still reacts at 1 char.
    if (q.replace(/[^a-z0-9]/gi, '').length < 2) {setState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0 });return;}
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
        limit: SEARCH_LIMIT
      }).then((r) => {
        // SRCH4: include the matched synonyms (when synonym search is on) so the
        // snippet highlights the word that actually surfaced the verse.
        const terms = expandSnippetTerms(
          r.parsed, r.parsedTerms || [],
          /** @type {any} */ (window).VotSearchData && /** @type {any} */ (window).VotSearchData.SYNONYM_MAP,
          settings.searchSynonyms !== false,
        );
        setState({ phase: 'done', parsed: r.parsed, results: r.results || [], terms, error: r.error ? String(r.error) : null, total: (r.results || []).length });
      }).catch((err) => {
        setState({ phase: 'done', parsed: null, results: [], terms: [], error: err?.message || String(err), total: 0 });
      });
    }, 140);
    return () => {if (debounceRef.current) clearTimeout(debounceRef.current);};
  }, [query, buildInfo.ready, settings.translation, settings.searchUseStopWords, settings.searchSynonyms, settings.searchCorpus, searchScope]);

  // Handle command-kind parsed results
  React.useEffect(() => {
    if (state.parsed && state.parsed.kind === 'command') {
      if (onCommand) onCommand(state.parsed.action);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: effect should fire only when parsed-result changes. Adding onCommand would re-fire on every parent re-render that rebuilds the callback, calling the command handler multiple times for the same parsed.command. Closure always picks up the latest onCommand at the point state.parsed actually changes.
  }, [state.parsed]);

  // [8] Result filter chips + canonical sort — client-side views over the
  // fetched set (the corpus pills above narrow what is SEARCHED; these
  // narrow/sort what is RENDERED — instant, no re-query). Both reset on a
  // new query so a stale filter can't hide fresh results.
  const [groupFilter, setGroupFilter] = React.useState('all');
  const [sortMode, setSortMode] = React.useState('relevance'); // 'relevance' | 'canonical'
  React.useEffect(() => { setGroupFilter('all'); setSortMode('relevance'); }, [query]);
  // Canonical book positions: the CONSTANT map (utils/search.js) — never
  // the lazy corpus, which usually isn't loaded on this screen (the first
  // cut read Object.keys(BOOKS) and silently no-opped; owner-caught).
  const bookIndex = SRCH_CANONICAL_BOOK_INDEX;

  // Group results by source
  const grouped = React.useMemo(() => {
    if (!state.results.length) return [];
    const groups = {};
    for (let i = 0; i < state.results.length; i++) {
      const entry = state.results[i];
      const g = srchGroupKey(entry.doc);
      if (!groups[g]) groups[g] = [];
      groups[g].push(entry);
    }
    const keys = Object.keys(groups);
    keys.sort((a, b) => {
      const aTop = groups[a][0]?.score || 0;
      const bTop = groups[b][0]?.score || 0;
      if (aTop !== bTop) return bTop - aTop;
      return (SRCH_GROUP_META[a]?.order || 99) - (SRCH_GROUP_META[b]?.order || 99);
    });
    return keys.map((k) => ({ key: k, items: groups[k] }));
  }, [state.results]);

  // Chip categories present in THIS result set (empty = don't render chips),
  // the filtered view, and the canonical re-sort of scripture groups.
  const filterCats = React.useMemo(() => srchFilterCategories(grouped), [grouped]);
  const visibleGroups = React.useMemo(() => {
    const filtered = srchApplyFilter(grouped, groupFilter);
    if (sortMode !== 'canonical') return filtered;
    return filtered.map((g) => (
      (g.key === 'bible' || g.key === 'matthew')
        ? { key: g.key, items: srchSortCanonical(g.items, bookIndex) }
        : g
    ));
  }, [grouped, groupFilter, sortMode, bookIndex]);
  // Sort toggle only matters when a scripture group with ≥2 verses is visible.
  const sortToggleVisible = React.useMemo(
    () => visibleGroups.some((g) => (g.key === 'bible' || g.key === 'matthew') && g.items.length > 1),
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

  // Top results: best 5 cross-corpus hits shown before groups (All mode only,
  // only for text queries — ref queries already have directEntries cards)
  const topResults = React.useMemo(() => {
    if (!state.results.length) return [];
    if (directEntries.length > 0) return [];
    const corpus = settings.searchCorpus || 'all';
    if (corpus !== 'all') return [];
    if (grouped.length <= 1) return [];
    return state.results.slice(0, 5);
  }, [state.results, grouped.length, settings.searchCorpus, directEntries.length]);

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

  const handleSelect = (entry) => { recordSearch(); onSelect(entry); };

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
    <ScreenLayout hideTabsBtn={true} navChildren={
      <>
        <button className="nav-home nav-back-icon" onClick={onBack} title="Back" aria-label="Back">{"‹"}</button>
        <div className="srch-input-row">
          <input
            ref={inputRef}
            className="search-input"
            type="search"
            placeholder="Search scriptures, volumes, studies…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setShowSuggest(suggestions.length > 0)}
            onKeyDown={handleKey}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query ? <button className="srch-clear-btn" onClick={clearQuery}>{"✕"}</button> : null}
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
              <p>Verses, letters, study notes, footnotes — across all 66 books and every Volume.</p>
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

        {query && buildInfo.ready && state.phase === 'done' && state.results.length > 0 && (
          <div className="srch-results-summary">
            {/* W0 (micro-gap a): at the engine cap the count is a floor — "400+", not "400". */}
            Found <strong>{matchCountLabel(state.results.length, SEARCH_LIMIT)} {state.results.length === 1 ? "match" : "matches"}</strong>
            {" across "}<strong>{grouped.length} {grouped.length === 1 ? "section" : "sections"}</strong>
          </div>
        )}

        {/* [8] filter chips (rendered only when >1 category is present) +
            the relevance/book-order sort toggle for verse results. */}
        {filterCats.length > 0 && (
          <div className="srch-filter-row" role="tablist" aria-label="Filter results">
            <button
              className={"srch-filter-chip" + (groupFilter === 'all' ? ' active' : '')}
              role="tab" aria-selected={groupFilter === 'all'}
              onClick={() => setGroupFilter('all')}
            >All</button>
            {filterCats.map((c) => (
              <button
                key={c.id}
                className={"srch-filter-chip" + (groupFilter === c.id ? ' active' : '')}
                role="tab" aria-selected={groupFilter === c.id}
                onClick={() => setGroupFilter(groupFilter === c.id ? 'all' : c.id)}
              >{c.label} · {c.count}</button>
            ))}
            {sortToggleVisible && (
              <button
                className="srch-sort-btn"
                aria-label={sortMode === 'relevance' ? 'Sort verses in book order' : 'Sort verses by relevance'}
                onClick={() => setSortMode(sortMode === 'relevance' ? 'canonical' : 'relevance')}
              >{sortMode === 'relevance' ? 'Book order' : 'Relevance'}</button>
            )}
          </div>
        )}

        {directEntries.length > 0 && (
          <div className="srch-groups">
            {directEntries.map((d, i) => (
              <SrchCard key={'d' + i} entry={d} terms={[]} onSelect={handleSelect} isDirect={true} />
            ))}
          </div>
        )}

        {/* Best Matches are a cross-corpus view — hidden while a chip filter
            narrows the set (they could show results the filter excludes). */}
        {topResults.length > 0 && groupFilter === 'all' && (
          <div className="srch-top-results">
            <div className="srch-section-label">Best Matches</div>
            {topResults.map((entry, i) => (
              <SrchCard key={'top' + i} entry={entry} terms={state.terms} onSelect={handleSelect} />
            ))}
          </div>
        )}

        {visibleGroups.length > 0 && (
          <div className="srch-groups">
            {visibleGroups.map((g, i) => (
              <SrchGroup
                key={g.key + '|' + query + '|' + sortMode}
                gkey={g.key}
                items={g.items}
                terms={state.terms}
                onSelect={handleSelect}
                defaultOpen={state.results.length <= 30 || i < 5 || groupFilter !== 'all'}
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
