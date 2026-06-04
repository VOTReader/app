/* ═══════════════════════════════════════════════════════════════════════
   HighlightsScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Self-contained CSS injection (segregated from the main stylesheet,
   same pattern as journal-styles.js). All classes prefixed `hlx-`. */
(function injectHighlightStyles() {
  if (typeof document === 'undefined' || document.getElementById('hlx-styles')) return;
  var R = [];
  R.push('.hlx-screen { padding: 0 0 90px; }');
  R.push('.hlx-header { padding: 18px 22px 4px; }');
  R.push('.hlx-eyebrow { font-family: var(--font-cinzel); font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--gold-dim); display: block; }');
  R.push('.hlx-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 1.375rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin: 4px 0 2px; }');
  R.push('.hlx-count { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 0.8125rem; }');
  R.push('.hlx-controls { padding: 10px 18px 6px; display: flex; flex-direction: column; gap: 10px; }');
  R.push('.hlx-search { background: var(--bg2); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; color: var(--cream); font-family: var(--font-garamond); font-size: 0.875rem; outline: none; box-sizing: border-box; }');
  R.push('body.light .hlx-search { background: #f7f2e8; color: #2a2520; border-color: var(--gold-border); }');
  R.push('.hlx-search:focus { border-color: var(--gold); }');
  R.push('.hlx-sort-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }');
  R.push('.hlx-sort-label { font-family: var(--font-cinzel); font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); }');
  R.push('.hlx-sort-btn { background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; }');
  R.push('.hlx-sort-btn.active { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }');
  R.push('.hlx-sort-btn:hover { color: var(--gold); }');
  // Filter rows (Type chips + Color dots), each with a leading label.
  R.push('.hlx-filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 4px; }');
  R.push('.hlx-type-chip { appearance: none; -webkit-appearance: none; background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; flex: 0 0 auto; }');
  R.push('.hlx-type-chip.active { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }');
  R.push('.hlx-type-chip:hover { color: var(--gold); }');
  // Granular color-filter dots (mirror the highlight/underline picker).
  // Explicit box-sizing + appearance reset + flex:0 0 auto so the
  // <button> never collapses to a sliver inside the flex row.
  R.push('.hlx-color-all { appearance: none; -webkit-appearance: none; background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; flex: 0 0 auto; }');
  R.push('.hlx-color-all.active { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }');
  R.push('.hlx-color-dot { appearance: none; -webkit-appearance: none; box-sizing: border-box; width: 24px; height: 24px; min-width: 24px; flex: 0 0 24px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.15); cursor: pointer; padding: 0; margin: 0; line-height: 0; font-size: 0; transition: transform 0.1s, border-color 0.12s; }');
  R.push('.hlx-color-dot:hover { transform: scale(1.12); }');
  R.push('.hlx-color-dot.active { border-color: var(--cream); box-shadow: 0 0 0 2px var(--gold), 0 0 6px var(--gold-glow); transform: scale(1.12); }');
  R.push('.hlx-list { padding: 8px 14px; display: flex; flex-direction: column; gap: 8px; }');
  R.push('.hlx-row { display: flex; gap: 12px; padding: 12px 14px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: background 0.15s, border-color 0.15s; }');
  R.push('body.light .hlx-row { background: #faf5e7; }');
  R.push('.hlx-row:hover { background: var(--bg3); border-color: var(--gold-border); }');
  R.push('.hlx-row:active { transform: scale(0.995); }');
  R.push('.hlx-swatch { flex-shrink: 0; width: 14px; height: 14px; border-radius: 4px; margin-top: 3px; border: 1px solid rgba(255,255,255,0.12); }');
  R.push('.hlx-swatch.is-underline { background: transparent !important; border-radius: 0; height: 0; margin-top: 10px; border: none; border-bottom: 3px solid; width: 16px; }');
  R.push('.hlx-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }');
  R.push('.hlx-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }');
  R.push('.hlx-source { font-family: var(--font-cinzel); font-size: 0.8125rem; color: var(--gold); letter-spacing: 0.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }');
  R.push('.hlx-kind { font-family: var(--font-cinzel); font-size: 0.5625rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); border: 1px solid var(--gold-border); border-radius: 999px; padding: 1px 7px; }');
  R.push('.hlx-text { font-family: var(--font-garamond); font-style: italic; font-size: 0.875rem; color: var(--cream-dim); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }');
  R.push('body.light .hlx-text { color: #5a4f3d; }');
  R.push('.hlx-date { font-family: var(--font-cinzel); font-size: 0.5625rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); margin-top: 2px; }');
  R.push('.hlx-empty { padding: 60px 30px; text-align: center; }');
  R.push('.hlx-empty-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 1.125rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }');
  R.push('.hlx-empty-hint { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 0.9375rem; line-height: 1.5; max-width: 320px; margin: 0 auto; }');
  var el = document.createElement('style');
  el.id = 'hlx-styles';
  el.textContent = R.join('\n');
  document.head.appendChild(el);
})();

/* Canonical palette order + display hex (mirrors HL_COLORS). 'cyan'
   is a legacy alias for teal kept so old marks still resolve. */
export var _HL_COLOR_ORDER = ['yellow', 'green', 'pink', 'red', 'orange', 'blue', 'purple', 'teal', 'brown', 'gray'];
export var _HL_COLOR_HEX = {
  yellow: '#ffd700', green: '#76ff03', pink: '#ff4081', red: '#f44336',
  orange: '#ff9100', blue: '#2196f3', purple: '#ba68c8', teal: '#00bcd4',
  brown: '#8d6e63', gray: '#9e9e9e', cyan: '#00bcd4'
};
export function _hlColorHex(c) { return _HL_COLOR_HEX[c] || '#ffd700'; }
export function _hlColorIndex(c) {
  var i = _HL_COLOR_ORDER.indexOf(c === 'cyan' ? 'teal' : c);
  return i < 0 ? 99 : i;
}

/* Flatten AnnotationStore into one row per groupId. */
export function _collectMarks() {
  if (typeof AnnotationStore === 'undefined') return [];
  var data = AnnotationStore.all() || {};
  var groups = {}; // groupId -> aggregate
  Object.keys(data).forEach(function(hlKey) {
    var arr = data[hlKey] || [];
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      if (a.kind !== 'highlight' && a.kind !== 'underline') continue;
      var gid = a.groupId || a.id;
      var g = groups[gid];
      if (!g) {
        g = groups[gid] = {
          groupId: gid, kind: a.kind, color: a.color || 'yellow',
          hlKey: hlKey, created: a.created || 0, updated: a.updated || a.created || 0,
          segs: []
        };
      }
      g.segs.push({ key: hlKey, start: a.start || 0, text: a.text || '', created: a.created || 0 });
      if ((a.created || 0) < g.created || g.created === 0) { g.created = a.created || 0; g.hlKey = hlKey; }
      if ((a.updated || a.created || 0) > g.updated) g.updated = a.updated || a.created || 0;
    }
  });
  return Object.keys(groups).map(function(gid) {
    var g = groups[gid];
    g.segs.sort(function(x, y) { return (x.created - y.created) || (x.start - y.start); });
    g.text = g.segs.map(function(s) { return s.text; }).join(' ').replace(/\s+/g, ' ').trim();
    return g;
  });
}

/* One row. The whole row navigates to the source (no expand state —
   highlight text is short by nature; the source IS the full context). */
export function HighlightRow(props) {
  var m = props.mark;
  var sourceLabel = (typeof _bookmarkSourceLabel === 'function') ? _bookmarkSourceLabel(m.hlKey) : m.hlKey;
  var date = (typeof relativeDate === 'function') ? relativeDate(m.updated || m.created) : '';
  var hex = _hlColorHex(m.color);
  var isUnderline = m.kind === 'underline';
  return (
    <div
      className="hlx-row"
      role="button" tabIndex={0}
      onClick={function() { props.onNavigate && props.onNavigate(m); }}
      onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onNavigate && props.onNavigate(m); } }}
    >
      <span
        className={'hlx-swatch' + (isUnderline ? ' is-underline' : '')}
        style={isUnderline ? { borderBottomColor: hex } : { background: hex }}
      />
      <span className="hlx-body">
        <span className="hlx-top">
          <span className="hlx-source">{sourceLabel}</span>
          <span className="hlx-kind">{isUnderline ? 'Underline' : 'Highlight'}</span>
        </span>
        {m.text && <span className="hlx-text">{'“'}{m.text}{'”'}</span>}
        {date && <span className="hlx-date">{date}</span>}
      </span>
    </div>
  );
}

export function HighlightsScreen(props) {
  var useState = React.useState;
  var useMemo = React.useMemo;

  var onBack = props.onBack;
  var onNavigateToSource = props.onNavigateToSource;

  // Subscribe to AnnotationStore — highlights are AnnotationStore entries
  // with kind=highlight or kind=underline.
  React.useSyncExternalStore(
    React.useCallback(function(cb) { return AnnotationStore.subscribe(cb); }, []),
    function() { return AnnotationStore.getVersion(); }
  );

  // Standardized date sort (matches Notes/Bookmarks/Links/Journal):
  // a single toggle, newest-first by default.
  var _sn = useState(true); var sortNewest = _sn[0]; var setSortNewest = _sn[1];
  var _q = useState(''); var query = _q[0]; var setQuery = _q[1];
  // Independent filters: by type (all/highlight/underline) and by color.
  var _tf = useState('all'); var typeFilter = _tf[0]; var setTypeFilter = _tf[1];
  var _cf = useState(null); var colorFilter = _cf[0]; var setColorFilter = _cf[1];

  var marks = _collectMarks();

  // Distinct colors present, in palette order — drives the filter dots.
  var presentColors = useMemo(function() {
    var seen = {};
    marks.forEach(function(m) { seen[m.color === 'cyan' ? 'teal' : m.color] = 1; });
    return _HL_COLOR_ORDER.filter(function(c) { return seen[c]; });
  }, [marks]);

  var sorted = useMemo(function() {
    var q = query.trim().toLowerCase();
    var list = q ? marks.filter(function(m) {
      var lbl = (typeof _bookmarkSourceLabel === 'function') ? _bookmarkSourceLabel(m.hlKey) : '';
      return (m.text || '').toLowerCase().indexOf(q) >= 0 || (lbl || '').toLowerCase().indexOf(q) >= 0;
    }) : marks.slice();
    if (typeFilter !== 'all') {
      list = list.filter(function(m) { return m.kind === typeFilter; });
    }
    if (colorFilter) {
      list = list.filter(function(m) {
        return (m.color === 'cyan' ? 'teal' : m.color) === colorFilter;
      });
    }
    // Always sort by date. A deterministic tiebreak (hlKey, then text)
    // means the Newest/Oldest toggle ALWAYS visibly reverses order even
    // when several marks share a timestamp (the old bug: same-ms test
    // data made the sort look like it "did nothing").
    list.sort(function(a, b) {
      var ad = a.updated || a.created || 0;
      var bd = b.updated || b.created || 0;
      if (ad !== bd) return sortNewest ? (bd - ad) : (ad - bd);
      var ak = (a.hlKey || '') + '|' + (a.text || '');
      var bk = (b.hlKey || '') + '|' + (b.text || '');
      if (ak === bk) return 0;
      var cmp = ak < bk ? -1 : 1;
      return sortNewest ? cmp : -cmp;
    });
    return list;
  }, [marks, sortNewest, query, typeFilter, colorFilter]);

  function navigate(m) {
    var ep = (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(m.hlKey) : null;
    if (ep && onNavigateToSource) onNavigateToSource(ep, { sourceLetterTitle: 'My Highlights' });
  }

  function typeChip(val, label) {
    return (
      <button
        className={'hlx-type-chip' + (typeFilter === val ? ' active' : '')}
        onClick={function() { setTypeFilter(val); }}
      >{label}</button>
    );
  }

  // Standard app-wide Library nav (back + Home left, icon cluster right).
  var navChildren = LibraryNav({
    onBack: onBack, onSearch: props.onSearch, onHistory: props.onHistory,
    onSettings: props.onSettings,
    theme: props.theme, onThemeChange: props.onThemeChange
  });

  return (
    <ScreenLayout navChildren={navChildren}>
      <div className="hlx-screen">
        <div className="hlx-header">
          <span className="hlx-eyebrow">My Marks</span>
          <h1 className="hlx-title">Highlights & Underlines</h1>
          <span className="hlx-count">{marks.length + (marks.length === 1 ? ' mark' : ' marks')}</span>
        </div>
        {marks.length > 0 && (
          <div className="hlx-controls">
            <input
              className="hlx-search" type="text" placeholder="Search marks…"
              value={query} onChange={function(e) { setQuery(e.target.value); }}
            />
            {/* Standardized date sort — identical class + wording to every
                other Library list (Notes/Bookmarks/Links/Journal). */}
            <div className="hlx-sort-row">
              <button
                className="notes-index-sort-btn"
                onClick={function() { setSortNewest(function(v) { return !v; }); }}
                title="Toggle sort order"
              >{sortNewest ? 'Sort: Newest ↓' : 'Sort: Oldest ↑'}</button>
            </div>
            {/* Type filter chips */}
            <div className="hlx-filter-row">
              <span className="hlx-sort-label">Type</span>
              {typeChip('all', 'All')}
              {typeChip('highlight', 'Highlights')}
              {typeChip('underline', 'Underlines')}
            </div>
            {/* Granular color filter — always available, the actual color dots
                just like the highlight/underline picker. Tap a dot to show only
                that color; tap "All" (or the active dot again) to clear. */}
            {presentColors.length > 0 && (
              <div className="hlx-filter-row">
                <span className="hlx-sort-label">Color</span>
                <button
                  className={'hlx-color-all' + (colorFilter === null ? ' active' : '')}
                  onClick={function() { setColorFilter(null); }}
                >All</button>
                {presentColors.map(function(c) {
                  return (
                    <button
                      key={c}
                      type="button"
                      className={'hlx-color-dot' + (colorFilter === c ? ' active' : '')}
                      style={{ backgroundColor: _hlColorHex(c) }}
                      title={c.charAt(0).toUpperCase() + c.slice(1)}
                      aria-label={'Filter ' + c}
                      onClick={function() { setColorFilter(colorFilter === c ? null : c); }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
        {sorted.length === 0
          ? (
              <div className="hlx-empty">
                <div className="hlx-empty-title">{marks.length === 0 ? 'No Marks Yet' : 'No Matches'}</div>
                <div className="hlx-empty-hint">{marks.length === 0
                  ? 'Select any passage while reading and tap a color to highlight or underline it. Your marks collect here.'
                  : 'Try a different search term.'}</div>
              </div>
            )
          : (
              <div className="hlx-list">
                {sorted.map(function(m) {
                  return <HighlightRow key={m.groupId} mark={m} onNavigate={navigate} />;
                })}
              </div>
            )
        }
      </div>
    </ScreenLayout>
  );
}
