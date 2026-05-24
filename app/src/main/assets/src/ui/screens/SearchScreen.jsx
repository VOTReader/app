/* ═══════════════════════════════════════════════════════════════════════
   SearchScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function SearchScreen({ query, onQueryChange, settings, onSettingsChange, onSelect, onBack, searchScope, searchContext, onToggleScope, onCommand }) {
  const inputRef = React.useRef(null);
  const [state, setState] = React.useState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0 });
  const [buildInfo, setBuildInfo] = React.useState({ ready: false, building: false, progress: null });
  const [showSuggest, setShowSuggest] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState([]);
  const debounceRef = React.useRef(null);

  // Build index on first mount
  React.useEffect(() => {
    if (!window.VotSearch) {
      setBuildInfo({ ready: false, building: false, progress: null, error: 'Search engine failed to load. Check browser console.' });
      return;
    }
    if (window.VotSearch.getState().ready) {setBuildInfo({ ready: true, building: false, progress: null });return;}
    setBuildInfo({ ready: false, building: true, progress: null });
    window.VotSearch.init({
      onProgress: (done, total) => setBuildInfo((b) => ({ ...b, progress: { done, total } }))
    }).then(() => setBuildInfo({ ready: true, building: false, progress: null })).
    catch((err) => setBuildInfo({ ready: false, building: false, progress: null, error: err?.message || String(err) }));
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
    const s = window.VotSearch.suggest(q, { max: 8 });
    setSuggestions(s);
    setShowSuggest(s.length > 0 && !buildInfo.building && !suggestDismissed);
  }, [query, buildInfo.building, suggestDismissed]);

  // Run search with debounce — one box, one index, everything included.
  React.useEffect(() => {
    if (!buildInfo.ready) return;
    const q = (query || '').trim();
    if (!q) {setState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0 });return;}
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      window.VotSearch.search(q, {
        translation: settings.translation || 'nkjv',
        useStopWords: settings.searchUseStopWords !== false,
        scope: searchScope || null,
        corpus: settings.searchCorpus || 'all',
        limit: 400
      }).then((r) => {
        const terms = r.parsed && r.parsed.kind === 'text' ?
        [r.parsed.phrase].filter(Boolean).concat(r.parsedTerms || []) :
        [];
        setState({ phase: 'done', parsed: r.parsed, results: r.results || [], terms, error: r.error ? String(r.error) : null, total: (r.results || []).length });
      }).catch((err) => {
        setState({ phase: 'done', parsed: null, results: [], terms: [], error: err?.message || String(err), total: 0 });
      });
    }, 140);
    return () => {if (debounceRef.current) clearTimeout(debounceRef.current);};
  }, [query, buildInfo.ready, settings.translation, settings.searchUseStopWords, settings.searchCorpus, searchScope]);

  // Handle command-kind parsed results
  React.useEffect(() => {
    if (state.parsed && state.parsed.kind === 'command') {
      if (onCommand) onCommand(state.parsed.action);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: effect should fire only when parsed-result changes. Adding onCommand would re-fire on every parent re-render that rebuilds the callback, calling the command handler multiple times for the same parsed.command. Closure always picks up the latest onCommand at the point state.parsed actually changes.
  }, [state.parsed]);

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
    const guess = window.VotSearch.fuzzyBookSuggest(q);
    if (!guess) return null;
    const disp = window.VotSearchData.BOOK_DISPLAY[guess] || guess;
    if (disp.toLowerCase() === q.toLowerCase()) return null;
    return { original: q, suggestion: disp, rewrite: disp };
  }, [state.parsed, state.results.length, query]);

  const clearQuery = () => {onQueryChange('');setShowSuggest(false);setSuggestDismissed(true);};

  const fireSuggestion = (sug) => {
    onQueryChange(sug.query);
    setShowSuggest(false);
    setSuggestDismissed(true);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      if (showSuggest) {setShowSuggest(false);setSuggestDismissed(true);} else
      if (query) {clearQuery();} else
      onBack();
    }
  };

  return (
    <ScreenLayout hideTabsBtn={true} navChildren={
      <>
        <button className="nav-home" onClick={onBack} aria-label="Back">{"←"}</button>
        <div className="srch-input-row">
          <input
            ref={inputRef}
            className="search-input"
            type="text"
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
              <p>Verses, letters, study notes, headings, footnotes — across all 66 books and every Volume.</p>
            </div>
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

        {query && buildInfo.ready && state.phase === 'done' && state.results.length > 0 && (
          <div className="srch-results-summary">
            Found <strong>{state.results.length} {state.results.length === 1 ? "match" : "matches"}</strong>
            {" across "}<strong>{grouped.length} {grouped.length === 1 ? "section" : "sections"}</strong>
          </div>
        )}

        {directEntries.length > 0 && (
          <div className="srch-groups">
            {directEntries.map((d, i) => (
              <SrchCard key={'d' + i} entry={d} terms={[]} onSelect={onSelect} isDirect={true} />
            ))}
          </div>
        )}

        {topResults.length > 0 && (
          <div className="srch-top-results">
            <div className="srch-section-label">Best Matches</div>
            {topResults.map((entry, i) => (
              <SrchCard key={'top' + i} entry={entry} terms={state.terms} onSelect={onSelect} />
            ))}
          </div>
        )}

        {grouped.length > 0 && (
          <div className="srch-groups">
            {grouped.map((g, i) => (
              <SrchGroup
                key={g.key + '|' + query}
                gkey={g.key}
                items={g.items}
                terms={state.terms}
                onSelect={onSelect}
                defaultOpen={state.results.length <= 30 || i < 5}
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
