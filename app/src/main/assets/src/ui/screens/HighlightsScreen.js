/* =================================================================
   HIGHLIGHTS & UNDERLINES SCREEN — browser for all color marks.
   =================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Loads AFTER BookmarksScreen.js so it can reuse the shared
   _bookmarkSourceLabel / _bookmarkSourceEndpoint resolvers (highlight
   hlKeys use the exact same format as bookmark hlKeys).

   Depends on (load first): AnnotationStore (vot-annotations),
     _bookmarkSourceLabel, _bookmarkSourceEndpoint, relativeDate,
     ScreenLayout, ThemeBtn.

   DATA: AnnotationStore.all() → { hlKey: [ { id, groupId, kind,
     color, start, end, text, created, updated } ] }. We surface only
     kind 'highlight' | 'underline' (notes live in the Notes hub).
     Segments are grouped by groupId (a multi-paragraph mark is one
     logical row even though it has N segments across keys).

   SORT: by Date (newest/oldest), by Type (highlight ↔ underline),
     by Color (palette order). One active mode at a time; Date + Type
     have a direction toggle.

   Tap a row → navigate to the source passage with a single-shot
   "Back to My Highlights" pill (same contract as Bookmarks/Notes).
   ================================================================= */

/* Self-contained CSS injection (segregated from the main stylesheet,
   same pattern as journal-styles.js). All classes prefixed `hlx-`. */
(function injectHighlightStyles() {
  if (typeof document === 'undefined' || document.getElementById('hlx-styles')) return;
  var R = [];
  R.push('.hlx-screen { padding: 0 0 90px; }');
  R.push('.hlx-header { padding: 18px 22px 4px; }');
  R.push('.hlx-eyebrow { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--gold-dim); display: block; }');
  R.push('.hlx-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 22px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin: 4px 0 2px; }');
  R.push('.hlx-count { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 13px; }');
  R.push('.hlx-controls { padding: 10px 18px 6px; display: flex; flex-direction: column; gap: 10px; }');
  R.push('.hlx-search { background: var(--bg2); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; color: var(--cream); font-family: var(--font-garamond); font-size: 14px; outline: none; box-sizing: border-box; }');
  R.push('body.light .hlx-search { background: #f7f2e8; color: #2a2520; border-color: var(--gold-border); }');
  R.push('.hlx-search:focus { border-color: var(--gold); }');
  R.push('.hlx-sort-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }');
  R.push('.hlx-sort-label { font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); }');
  R.push('.hlx-sort-btn { background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; }');
  R.push('.hlx-sort-btn.active { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }');
  R.push('.hlx-sort-btn:hover { color: var(--gold); }');
  // Filter rows (Type chips + Color dots), each with a leading label.
  R.push('.hlx-filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 4px; }');
  R.push('.hlx-type-chip { appearance: none; -webkit-appearance: none; background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; flex: 0 0 auto; }');
  R.push('.hlx-type-chip.active { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }');
  R.push('.hlx-type-chip:hover { color: var(--gold); }');
  // Granular color-filter dots (mirror the highlight/underline picker).
  // Explicit box-sizing + appearance reset + flex:0 0 auto so the
  // <button> never collapses to a sliver inside the flex row.
  R.push('.hlx-color-all { appearance: none; -webkit-appearance: none; background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; flex: 0 0 auto; }');
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
  R.push('.hlx-source { font-family: var(--font-cinzel); font-size: 13px; color: var(--gold); letter-spacing: 0.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }');
  R.push('.hlx-kind { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); border: 1px solid var(--gold-border); border-radius: 999px; padding: 1px 7px; }');
  R.push('.hlx-text { font-family: var(--font-garamond); font-style: italic; font-size: 14px; color: var(--cream-dim); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }');
  R.push('body.light .hlx-text { color: #5a4f3d; }');
  R.push('.hlx-date { font-family: var(--font-cinzel); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); margin-top: 2px; }');
  R.push('.hlx-empty { padding: 60px 30px; text-align: center; }');
  R.push('.hlx-empty-title { font-family: var(--font-cinzel); color: var(--gold); font-size: 18px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }');
  R.push('.hlx-empty-hint { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: 15px; line-height: 1.5; max-width: 320px; margin: 0 auto; }');
  var el = document.createElement('style');
  el.id = 'hlx-styles';
  el.textContent = R.join('\n');
  document.head.appendChild(el);
})();

/* Canonical palette order + display hex (mirrors HL_COLORS). 'cyan'
   is a legacy alias for teal kept so old marks still resolve. */
var _HL_COLOR_ORDER = ['yellow', 'green', 'pink', 'red', 'orange', 'blue', 'purple', 'teal', 'brown', 'gray'];
var _HL_COLOR_HEX = {
  yellow: '#ffd700', green: '#76ff03', pink: '#ff4081', red: '#f44336',
  orange: '#ff9100', blue: '#2196f3', purple: '#ba68c8', teal: '#00bcd4',
  brown: '#8d6e63', gray: '#9e9e9e', cyan: '#00bcd4'
};
function _hlColorHex(c) { return _HL_COLOR_HEX[c] || '#ffd700'; }
function _hlColorIndex(c) {
  var i = _HL_COLOR_ORDER.indexOf(c === 'cyan' ? 'teal' : c);
  return i < 0 ? 99 : i;
}

/* Flatten AnnotationStore into one row per groupId. */
function _collectMarks() {
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
function HighlightRow(props) {
  var m = props.mark;
  var sourceLabel = (typeof _bookmarkSourceLabel === 'function') ? _bookmarkSourceLabel(m.hlKey) : m.hlKey;
  var date = (typeof relativeDate === 'function') ? relativeDate(m.updated || m.created) : '';
  var hex = _hlColorHex(m.color);
  var isUnderline = m.kind === 'underline';
  return React.createElement('div', {
    className: 'hlx-row',
    role: 'button', tabIndex: 0,
    onClick: function() { props.onNavigate && props.onNavigate(m); },
    onKeyDown: function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onNavigate && props.onNavigate(m); } }
  },
    React.createElement('span', {
      className: 'hlx-swatch' + (isUnderline ? ' is-underline' : ''),
      style: isUnderline ? { borderBottomColor: hex } : { background: hex }
    }),
    React.createElement('span', { className: 'hlx-body' },
      React.createElement('span', { className: 'hlx-top' },
        React.createElement('span', { className: 'hlx-source' }, sourceLabel),
        React.createElement('span', { className: 'hlx-kind' }, isUnderline ? 'Underline' : 'Highlight')
      ),
      m.text && React.createElement('span', { className: 'hlx-text' }, '“', m.text, '”'),
      date && React.createElement('span', { className: 'hlx-date' }, date)
    )
  );
}

function HighlightsScreen(props) {
  var useState = React.useState;
  var useMemo = React.useMemo;

  var onBack = props.onBack;
  var onHome = props.onHome;
  var onNavigateToSource = props.onNavigateToSource;
  var hlTick = props.hlTick;

  // Standardized date sort (matches Notes/Bookmarks/Links/Journal):
  // a single toggle, newest-first by default.
  var _sn = useState(true); var sortNewest = _sn[0]; var setSortNewest = _sn[1];
  var _q = useState(''); var query = _q[0]; var setQuery = _q[1];
  // Independent filters: by type (all/highlight/underline) and by color.
  var _tf = useState('all'); var typeFilter = _tf[0]; var setTypeFilter = _tf[1];
  var _cf = useState(null); var colorFilter = _cf[0]; var setColorFilter = _cf[1];

  var marks = useMemo(function() { return _collectMarks(); }, [hlTick]);

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
    return React.createElement('button', {
      className: 'hlx-type-chip' + (typeFilter === val ? ' active' : ''),
      onClick: function() { setTypeFilter(val); }
    }, label);
  }

  // Standard app-wide Library nav (back + Home left, icon cluster right).
  var navChildren = LibraryNav({
    onBack: onBack, onSearch: props.onSearch, onHistory: props.onHistory,
    onSettings: props.onSettings,
    theme: props.theme, onThemeChange: props.onThemeChange
  });

  return React.createElement(ScreenLayout, { navChildren: navChildren },
    React.createElement('div', { className: 'hlx-screen' },
      React.createElement('div', { className: 'hlx-header' },
        React.createElement('span', { className: 'hlx-eyebrow' }, 'My Marks'),
        React.createElement('h1', { className: 'hlx-title' }, 'Highlights & Underlines'),
        React.createElement('span', { className: 'hlx-count' }, marks.length + (marks.length === 1 ? ' mark' : ' marks'))
      ),
      marks.length > 0 && React.createElement('div', { className: 'hlx-controls' },
        React.createElement('input', {
          className: 'hlx-search', type: 'text', placeholder: 'Search marks…',
          value: query, onChange: function(e) { setQuery(e.target.value); }
        }),
        // Standardized date sort — identical class + wording to every
        // other Library list (Notes/Bookmarks/Links/Journal).
        React.createElement('div', { className: 'hlx-sort-row' },
          React.createElement('button', {
            className: 'notes-index-sort-btn',
            onClick: function() { setSortNewest(function(v) { return !v; }); },
            title: 'Toggle sort order'
          }, sortNewest ? 'Sort: Newest ↓' : 'Sort: Oldest ↑')
        ),
        // Type filter chips
        React.createElement('div', { className: 'hlx-filter-row' },
          React.createElement('span', { className: 'hlx-sort-label' }, 'Type'),
          typeChip('all', 'All'),
          typeChip('highlight', 'Highlights'),
          typeChip('underline', 'Underlines')
        ),
        // Granular color filter — always available, the actual color dots
        // just like the highlight/underline picker. Tap a dot to show only
        // that color; tap "All" (or the active dot again) to clear.
        presentColors.length > 0 && React.createElement('div', { className: 'hlx-filter-row' },
          React.createElement('span', { className: 'hlx-sort-label' }, 'Color'),
          React.createElement('button', {
            className: 'hlx-color-all' + (colorFilter === null ? ' active' : ''),
            onClick: function() { setColorFilter(null); }
          }, 'All'),
          presentColors.map(function(c) {
            return React.createElement('button', {
              key: c,
              type: 'button',
              className: 'hlx-color-dot' + (colorFilter === c ? ' active' : ''),
              style: { backgroundColor: _hlColorHex(c) },
              title: c.charAt(0).toUpperCase() + c.slice(1),
              'aria-label': 'Filter ' + c,
              onClick: function() { setColorFilter(colorFilter === c ? null : c); }
            });
          })
        )
      ),
      sorted.length === 0
        ? React.createElement('div', { className: 'hlx-empty' },
            React.createElement('div', { className: 'hlx-empty-title' }, marks.length === 0 ? 'No Marks Yet' : 'No Matches'),
            React.createElement('div', { className: 'hlx-empty-hint' }, marks.length === 0
              ? 'Select any passage while reading and tap a color to highlight or underline it. Your marks collect here.'
              : 'Try a different search term.')
          )
        : React.createElement('div', { className: 'hlx-list' },
            sorted.map(function(m) {
              return React.createElement(HighlightRow, { key: m.groupId, mark: m, onNavigate: navigate });
            })
          )
    )
  );
}
