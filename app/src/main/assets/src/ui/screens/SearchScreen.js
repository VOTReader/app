const SRCH_KIND_LABEL = {
  'verse': { label: 'Verse', cls: 'badge-verse' },
  'chapter-title': { label: 'Chapter', cls: 'badge-heading' },
  'heading': { label: 'Heading', cls: 'badge-heading' },
  'study-note': { label: 'Study Note', cls: 'badge-note' },
  'cross-ref': { label: 'Cross-Ref', cls: 'badge-note' },
  'letter': { label: 'Letter', cls: 'badge-letter' },
  'letter-title': { label: 'Letter', cls: 'badge-letter' },
  'footnote': { label: 'Footnote', cls: 'badge-footnote' },
  'wtlb': { label: 'WTLB', cls: 'badge-letter' },
  'wtlb-title': { label: 'WTLB', cls: 'badge-letter' },
  'blessed': { label: 'Blessed', cls: 'badge-letter' },
  'blessed-title': { label: 'Blessed', cls: 'badge-letter' },
  'holy-day': { label: 'Holy Day', cls: 'badge-letter' },
  'holy-day-title': { label: 'Holy Day', cls: 'badge-letter' },
  'bible-study': { label: 'Study', cls: 'badge-note' }
};

function srchGroupKey(doc) {
  if (!doc) return 'other';
  const k = doc.kind;
  if (k === 'verse' || k === 'chapter-title' || k === 'heading') return doc.bookId === 'matthew' ? 'matthew' : 'bible';
  if (k === 'study-note' || k === 'cross-ref') return 'matthew-study';
  if (k === 'letter' || k === 'letter-title' || k === 'footnote') return doc.volumeId || 'letters';
  if (k === 'wtlb' || k === 'wtlb-title') return doc.volumeId || 'wtlb';
  if (k === 'blessed' || k === 'blessed-title') return 'blessed';
  if (k === 'holy-day' || k === 'holy-day-title') return 'holydays';
  if (k === 'bible-study') return 'bible-studies';
  return 'other';
}

const SRCH_GROUP_META = {
  'matthew': { label: 'Matthew Study Bible', order: 1 },
  'bible': { label: 'Scriptures', order: 2 },
  'matthew-study': { label: 'Matthew · Notes', order: 3 },
  'v1': { label: 'Volume One', order: 4 },
  'v2': { label: 'Volume Two', order: 5 },
  'v3': { label: 'Volume Three', order: 6 },
  'v4': { label: 'Volume Four', order: 7 },
  'v5': { label: 'Volume Five', order: 8 },
  'v6': { label: 'Volume Six', order: 9 },
  'v7': { label: 'Volume Seven', order: 10 },
  'timothy': { label: 'Letters from Timothy', order: 11 },
  'flock': { label: "Lord's Little Flock", order: 12 },
  'rebuke': { label: "The Lord's Rebuke", order: 13 },
  'blessed': { label: 'The Blessed', order: 14 },
  'wtlb1': { label: 'WTLB · Part One', order: 15 },
  'wtlb2': { label: 'WTLB · Part Two', order: 16 },
  'holydays': { label: 'Holy Days', order: 17 },
  'hidden-manna': { label: 'Hidden Manna', order: 18 },
  'bible-studies': { label: 'Bible Studies', order: 19 },
  'letters': { label: 'Letters', order: 20 },
  'other': { label: 'Other', order: 99 }
};

function SrchSnippet({ text, terms, maxLen = 180 }) {
  if (!text) return null;
  const snippet = window.VotSearch.snippet(text, terms || [], maxLen);
  const spans = window.VotSearch.highlightSpans(snippet, terms || []);
  return (/*#__PURE__*/
    React.createElement("span", null,
    spans.map((s, i) =>
    s.hit ? /*#__PURE__*/
    React.createElement("mark", { key: i, className: "search-highlight" }, s.text) : /*#__PURE__*/
    React.createElement(React.Fragment, { key: i }, s.text)
    )
    ));
}

function SrchCard({ entry, terms, onSelect, isDirect }) {
  if (isDirect) {
    return (/*#__PURE__*/
      React.createElement("button", { className: "srch-card card-direct", onClick: () => onSelect(entry) }, /*#__PURE__*/
      React.createElement("div", { className: "srch-card-top" }, /*#__PURE__*/
      React.createElement("span", { className: "srch-card-ref" }, entry.__label)
      ), /*#__PURE__*/
      React.createElement("div", { className: "srch-card-snippet" }, entry.__sub || 'Go')
      ));

  }
  const doc = entry.doc;
  const meta = SRCH_KIND_LABEL[doc.kind] || { label: doc.kind, cls: '' };
  const refLine = doc.ref || (doc.title || '') + (doc.chapterNum ? ' ' + doc.chapterNum : '');
  const body = doc.kind === 'heading' ? (doc.heading || doc.text) :
  (doc.kind === 'chapter-title' || doc.kind === 'letter-title' || doc.kind === 'wtlb-title' || doc.kind === 'blessed-title' || doc.kind === 'holy-day-title') ?
  (doc.title || doc.text) :
  doc.text;
  return (/*#__PURE__*/
    React.createElement("button", { className: "srch-card", onClick: () => onSelect(entry) }, /*#__PURE__*/
    React.createElement("div", { className: "srch-card-top" }, /*#__PURE__*/
    React.createElement("span", { className: "srch-card-ref" }, refLine), /*#__PURE__*/
    React.createElement("span", { className: "srch-card-badge " + (meta.cls || '') }, meta.label),
    doc.translation && doc.translation !== 'nkjv' && /*#__PURE__*/React.createElement("span", { className: "srch-card-badge" }, doc.translation.toUpperCase()),
    doc.heading && doc.kind === 'verse' && /*#__PURE__*/React.createElement("span", { className: "srch-card-badge badge-heading" }, doc.heading.length > 28 ? doc.heading.slice(0, 28) + '…' : doc.heading)
    ), /*#__PURE__*/
    React.createElement("div", { className: "srch-card-snippet" }, /*#__PURE__*/
    React.createElement(SrchSnippet, { text: body || '', terms: terms })
    )
    ));
}

function SrchGroup({ gkey, items, terms, onSelect, defaultOpen }) {
  const [open, setOpen] = React.useState(defaultOpen !== false);
  const meta = SRCH_GROUP_META[gkey] || { label: gkey };
  return (/*#__PURE__*/
    React.createElement("div", { className: "srch-group" + (open ? '' : ' collapsed') }, /*#__PURE__*/
    React.createElement("button", { className: "srch-group-header", onClick: () => setOpen((o) => !o) }, /*#__PURE__*/
    React.createElement("span", null, meta.label, /*#__PURE__*/React.createElement("span", { className: "srch-group-count-inline" }, " · ", items.length, " ", items.length === 1 ? "match" : "matches")), /*#__PURE__*/
    React.createElement("span", { className: "srch-group-count" }, open ? '▾' : '▸')
    ), /*#__PURE__*/
    React.createElement("div", { className: "srch-group-items" },
    items.map((entry, i) => /*#__PURE__*/
    React.createElement(SrchCard, { key: i, entry: entry, terms: terms, onSelect: onSelect })
    )
    )
    ));
}

const SRCH_QUICK_PICKS = [
  'Beatitudes', 'Armor of God', 'Love Chapter', 'Faith Chapter', 'Shepherd Psalm',
  'Ten Commandments', 'Great Commission', 'Fruit of the Spirit', 'New Jerusalem',
  'Four Horsemen', 'Valley of Dry Bones'
];

function SearchScreen({ query, onQueryChange, settings, onSettingsChange, onSelect, onBack, searchScope, searchContext, onToggleScope, onCommand }) {
  const inputRef = React.useRef(null);
  const [state, setState] = React.useState({ phase: 'idle', parsed: null, results: [], terms: [], error: null, total: 0 });
  const [buildInfo, setBuildInfo] = React.useState({ ready: false, building: false, progress: null });
  const [showSuggest, setShowSuggest] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState([]);
  const debounceRef = React.useRef(null);

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

  React.useEffect(() => {
    const t = setTimeout(() => {if (inputRef.current) inputRef.current.focus();}, 80);
    return () => clearTimeout(t);
  }, []);

  const [suggestDismissed, setSuggestDismissed] = React.useState(false);
  React.useEffect(() => {setSuggestDismissed(false);}, [query]);
  React.useEffect(() => {
    const q = (query || '').trim();
    if (!q || q.length < 1 || q.length > 40) {setSuggestions([]);setShowSuggest(false);return;}
    const s = window.VotSearch.suggest(q, { max: 8 });
    setSuggestions(s);
    setShowSuggest(s.length > 0 && !buildInfo.building && !suggestDismissed);
  }, [query, buildInfo.building, suggestDismissed]);

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

  React.useEffect(() => {
    if (state.parsed && state.parsed.kind === 'command') {
      if (onCommand) onCommand(state.parsed.action);
    }
  }, [state.parsed]);

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

  const topResults = React.useMemo(() => {
    if (!state.results.length) return [];
    if (directEntries.length > 0) return [];
    const corpus = settings.searchCorpus || 'all';
    if (corpus !== 'all') return [];
    if (grouped.length <= 1) return [];
    return state.results.slice(0, 5);
  }, [state.results, grouped.length, settings.searchCorpus, directEntries.length]);

  const didYouMean = React.useMemo(() => {
    if (!state.parsed || state.parsed.kind !== 'text' || state.results.length) return null;
    const q = (query || '').trim();
    if (!q || q.length < 4 || q.length > 15) return null;
    if (/\s/.test(q)) return null;
    if (/[0-9:.,;\-]/.test(q)) return null;
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

  return (/*#__PURE__*/
    React.createElement(ScreenLayout, { hideTabsBtn: true, navChildren: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/
      React.createElement("button", { className: "nav-home", onClick: onBack, "aria-label": "Back" }, "\u2190"), /*#__PURE__*/
      React.createElement("div", { className: "srch-input-row" }, /*#__PURE__*/
      React.createElement("input", {
        ref: inputRef,
        className: "search-input",
        type: "text",
        placeholder: "Search scriptures, volumes, studies\u2026",
        value: query,
        onChange: (e) => onQueryChange(e.target.value),
        onFocus: () => setShowSuggest(suggestions.length > 0),
        onKeyDown: handleKey,
        autoComplete: "off",
        autoCorrect: "off",
        spellCheck: false }
      ),
      query ? /*#__PURE__*/React.createElement("button", { className: "srch-clear-btn", onClick: clearQuery }, "\u2715") : null
      )
      ) }, /*#__PURE__*/
    React.createElement("div", { className: "search-screen" }, /*#__PURE__*/

    React.createElement("div", { className: "srch-corpus-row", role: "tablist", "aria-label": "Search corpus" },
    [
    { k: 'all', label: 'All' },
    { k: 'scriptures', label: 'Scriptures' },
    { k: 'volumes', label: 'Volumes' }].
    map((opt) => {
      const active = (settings.searchCorpus || 'all') === opt.k;
      return (/*#__PURE__*/
        React.createElement("button", {
          key: opt.k,
          role: "tab",
          "aria-selected": active,
          className: "srch-corpus-btn" + (active ? " active" : ""),
          onClick: () => onSettingsChange('searchCorpus', opt.k) },
        opt.label));

    })
    ),


    searchContext && /*#__PURE__*/
    React.createElement("button", {
      className: "srch-scope-chip " + (searchScope ? "active" : ""),
      onClick: onToggleScope },

    searchScope ? /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", { className: "srch-scope-chip-icon" }, "\u2713"), /*#__PURE__*/React.createElement("span", null, "Scoped to ", searchContext.label), /*#__PURE__*/React.createElement("span", { className: "srch-scope-chip-x" }, "\u2715")) : /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", { className: "srch-scope-chip-icon" }, "\u2315"), /*#__PURE__*/React.createElement("span", null, "Search in ", searchContext.label))

    ),

    buildInfo.error && /*#__PURE__*/
    React.createElement("div", { className: "srch-error" }, buildInfo.error),

    buildInfo.building && !buildInfo.progress && /*#__PURE__*/
    React.createElement("div", { className: "srch-progress" }, /*#__PURE__*/
    React.createElement("span", null, "Building search index\u2026")
    ),

    buildInfo.building && buildInfo.progress && /*#__PURE__*/
    React.createElement("div", { className: "srch-progress" }, /*#__PURE__*/
    React.createElement("span", null, "Building search index\u2026 ", buildInfo.progress.done.toLocaleString(), " / ", buildInfo.progress.total.toLocaleString()), /*#__PURE__*/
    React.createElement("div", { className: "srch-progress-bar" }, /*#__PURE__*/React.createElement("div", { className: "srch-progress-bar-fill", style: { width: 100 * buildInfo.progress.done / Math.max(1, buildInfo.progress.total) + '%' } }))
    ),

    showSuggest && suggestions.length > 0 && /*#__PURE__*/
    React.createElement("div", { className: "srch-suggest" },
    suggestions.map((s, i) => /*#__PURE__*/
    React.createElement("button", { key: i, className: "srch-suggest-item", onMouseDown: (e) => {e.preventDefault();fireSuggestion(s);} }, /*#__PURE__*/
    React.createElement("span", { className: "srch-suggest-kind" }, s.kind), /*#__PURE__*/
    React.createElement("span", { className: "srch-suggest-label" }, s.label),
    s.hint && /*#__PURE__*/React.createElement("span", { className: "srch-suggest-hint" }, s.hint)
    )
    )
    ),

    state.error && /*#__PURE__*/React.createElement("div", { className: "srch-error" }, "Error: ", state.error),

    !query && buildInfo.ready && /*#__PURE__*/
    React.createElement(React.Fragment, null, /*#__PURE__*/
    React.createElement("div", { className: "srch-empty-hero" }, /*#__PURE__*/
    React.createElement("h3", null, "Search everything"), /*#__PURE__*/
    React.createElement("p", null, "Verses, letters, study notes, headings, footnotes \u2014 across all 66 books and every Volume.")
    ), /*#__PURE__*/
    React.createElement("div", { className: "srch-section-label" }, "Quick picks"), /*#__PURE__*/
    React.createElement("div", { className: "srch-quick-row" },
    SRCH_QUICK_PICKS.map((q) => /*#__PURE__*/
    React.createElement("button", { key: q, className: "srch-quick-chip", onClick: () => onQueryChange(q.toLowerCase()) }, q)
    )
    )
    ),

    didYouMean && /*#__PURE__*/
    React.createElement("div", { className: "srch-did-you-mean" }, "No results for \"",
    didYouMean.original, "\" \u2014 did you mean ", /*#__PURE__*/React.createElement("button", { onClick: () => onQueryChange(didYouMean.rewrite) }, didYouMean.suggestion), "?"
    ),

    query && buildInfo.ready && state.phase === 'done' && state.results.length > 0 && /*#__PURE__*/
    React.createElement("div", { className: "srch-results-summary" },
    "Found ", /*#__PURE__*/React.createElement("strong", null, state.results.length, " ", state.results.length === 1 ? "match" : "matches"),
    " across ", /*#__PURE__*/React.createElement("strong", null, grouped.length, " ", grouped.length === 1 ? "section" : "sections")
    ),

    directEntries.length > 0 && /*#__PURE__*/
    React.createElement("div", { className: "srch-groups" },
    directEntries.map((d, i) => /*#__PURE__*/
    React.createElement(SrchCard, { key: 'd' + i, entry: d, terms: [], onSelect: onSelect, isDirect: true })
    )
    ),

    topResults.length > 0 && /*#__PURE__*/
    React.createElement("div", { className: "srch-top-results" }, /*#__PURE__*/
    React.createElement("div", { className: "srch-section-label" }, "Best Matches"),
    topResults.map((entry, i) => /*#__PURE__*/
    React.createElement(SrchCard, { key: 'top' + i, entry: entry, terms: state.terms, onSelect: onSelect })
    )
    ),

    grouped.length > 0 && /*#__PURE__*/
    React.createElement("div", { className: "srch-groups" },
    grouped.map((g, i) => /*#__PURE__*/
    React.createElement(SrchGroup, {
      key: g.key + '|' + query,
      gkey: g.key,
      items: g.items,
      terms: state.terms,
      onSelect: onSelect,
      defaultOpen: state.results.length <= 30 || i < 5 })
    )
    ),

    query && buildInfo.ready && state.phase === 'done' && state.results.length === 0 && directEntries.length === 0 && !didYouMean && /*#__PURE__*/
    React.createElement("div", { className: "search-no-results" }, "No results for \"", query.trim(), "\"")

    )
    )
  );
}
