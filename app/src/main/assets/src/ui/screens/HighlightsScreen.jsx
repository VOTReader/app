/* ═══════════════════════════════════════════════════════════════════════
   HighlightsScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Free globals, not imports: this screen ships in bundle-d (the lazy Personal
   Study bundle-g until lz1) and reads normalizeExcerptDisplay from the window slots
   bundle-d fills — one copy of each law, and no second module state.
   mark-kinds.js is the exception: pure, stateless, a few lines (v05-04). */
import { isCountedMark } from '../../utils/mark-kinds.js';

/* Self-contained CSS injection (segregated from the main stylesheet,
   same pattern as journal-styles.js). All classes prefixed `hlx-`. */
(function injectHighlightStyles() {
  if (typeof document === 'undefined' || document.getElementById('hlx-styles')) return;
  var R = [];
  R.push('.hlx-screen { padding: 0 0 90px; }');
  // The header is the shared personal-study header (.study-head in app.css).
  R.push('.hlx-controls { padding: 10px 18px 6px; display: flex; flex-direction: column; gap: 10px; }');
  // C2-C [C9]: the three `.hlx-search` rules MOVED to app.css (they now sit
  // directly after .notes-index-search, whose class this input also carries).
  // Injected CSS is invisible to the static sheet's tooling and to anyone
  // reading app.css for the search-field treatment; the box itself renders
  // unchanged. Do not re-add them here.
  R.push('.hlx-sort-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }');
  R.push('.hlx-sort-label { font-family: var(--font-cinzel); font-size: var(--fs-10); text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); }');
  // Filter rows (Type chips + Color dots), each with a leading label.
  R.push('.hlx-filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 4px; }');
  // 7px vertical padding lifts the pill to a ≥24px AA touch height (5px read 21px).
  R.push('.hlx-type-chip { appearance: none; -webkit-appearance: none; background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: var(--fs-10); text-transform: uppercase; letter-spacing: 0.06em; padding: 7px 12px; border-radius: 999px; cursor: pointer; flex: 0 0 auto; }');
  R.push('.hlx-type-chip.active { background: var(--gold-faint); border-color: var(--gold); color: var(--gold); }');
  R.push('.hlx-type-chip:hover { color: var(--gold); }');
  // Granular color-filter dots (mirror the highlight/underline picker).
  // Explicit box-sizing + appearance reset + flex:0 0 auto so the
  // <button> never collapses to a sliver inside the flex row.
  R.push('.hlx-color-all { appearance: none; -webkit-appearance: none; background: var(--bg2); border: 1px solid var(--border); color: var(--cream-dim); font-family: var(--font-cinzel); font-size: var(--fs-10); text-transform: uppercase; letter-spacing: 0.06em; padding: 7px 12px; border-radius: 999px; cursor: pointer; flex: 0 0 auto; }');
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
  // A squiggle's swatch is a wavy stroke in the mark's colour (an inline SVG wave, v05-04),
  // sitting where the underline swatch's line sits.
  R.push('.hlx-swatch.is-squiggle { background: transparent !important; border: none; border-radius: 0; width: 16px; height: 8px; margin-top: 7px; display: flex; }');
  R.push('.hlx-swatch.is-underline { background: transparent !important; border-radius: 0; height: 0; margin-top: 10px; border: none; border-bottom: 3px solid; width: 16px; }');
  R.push('.hlx-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }');
  R.push('.hlx-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }');
  R.push('.hlx-source { font-family: var(--font-cinzel); font-size: var(--fs-13); color: var(--gold); letter-spacing: 0.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }');
  R.push('.hlx-kind { font-family: var(--font-cinzel); font-size: var(--fs-10); text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); border: 1px solid var(--gold-border); border-radius: 999px; padding: 1px 7px; }');
  R.push('.hlx-text { font-family: var(--font-garamond); font-style: italic; font-size: var(--fs-14); color: var(--cream-dim); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }');
  R.push('body.light .hlx-text { color: #5a4f3d; }');
  R.push('.hlx-date { font-family: var(--font-cinzel); font-size: var(--fs-10); text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-dim); margin-top: 2px; }');
  R.push('.hlx-empty { padding: 60px 30px; text-align: center; }');
  R.push('.hlx-empty-title { font-family: var(--font-cinzel); color: var(--gold); font-size: var(--fs-18); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }');
  R.push('.hlx-empty-hint { font-family: var(--font-garamond); font-style: italic; color: var(--cream-dim); font-size: var(--fs-15); line-height: 1.5; max-width: 320px; margin: 0 auto; }');
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

/* Reading order of two hlKeys from one view (sweep v067). Every key format ends in its block,
   verse or paragraph index (utils/hl-keys.js), so the parts compare one by one, numbers as
   numbers ('9' before '10', '12' before '12-s0' before '13'). A prophecy group's cards render
   intro, ot, nt, vot (ProphecyGroup.jsx), which is not alphabetical, so they compare by that. */
var _CARD_ORDER = ['intro', 'ot', 'nt', 'vot'];
/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function _hlKeyOrder(a, b) {
  var pa = a.split(':'), pb = b.split(':');
  for (var i = 0; i < pa.length && i < pb.length; i++) {
    if (pa[i] === pb[i]) continue;
    var ca = _CARD_ORDER.indexOf(pa[i]), cb = _CARD_ORDER.indexOf(pb[i]);
    if (ca >= 0 && cb >= 0) return ca - cb;
    return pa[i].localeCompare(pb[i], 'en', { numeric: true });
  }
  return pa.length - pb.length;
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
      // A note made with "No color (icon only)" marks no text: it is a note (Notes lists it), not a mark (A06.4).
      if (!isCountedMark(a)) continue;
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
    /* One selection's segments share `created` (SelectionToolbar adds them in one loop), and
       `start` is an offset inside each segment's own container, so it orders only segments
       that share a key; across keys the order is the keys' reading order (sweep v067). */
    g.segs.sort(function(x, y) {
      return (x.created - y.created) || (x.key === y.key ? x.start - y.start : _hlKeyOrder(x.key, y.key));
    });
    g.text = normalizeExcerptDisplay(g.segs.map(function(s) { return s.text; }).join(' ').replace(/\s+/g, ' ').trim());
    return g;
  });
}

/* One row. The whole row navigates to the source (no expand state —
   highlight text is short by nature; the source IS the full context). */
export function HighlightRow(props) {
  var m = props.mark;
  var sourceLabel = props.source || ((typeof _bookmarkSourceLabel === 'function') ? _bookmarkSourceLabel(m.hlKey) : m.hlKey);
  var date = (typeof relativeDate === 'function') ? relativeDate(m.updated || m.created) : '';
  var hex = _hlColorHex(m.color);
  var isUnderline = m.kind === 'underline';
  var isSquiggle = m.kind === 'squiggle';
  return (
    <div
      className="hlx-row"
      role="button" tabIndex={0}
      onClick={function() { props.onNavigate && props.onNavigate(m); }}
      onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onNavigate && props.onNavigate(m); } }}
    >
      <span
        className={'hlx-swatch' + (isUnderline ? ' is-underline' : isSquiggle ? ' is-squiggle' : '')}
        style={isUnderline ? { borderBottomColor: hex } : isSquiggle ? undefined : { background: hex }}
      >
        {isSquiggle && (
          <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true" focusable="false">
            <path d="M0 4 Q2 0 4 4 T8 4 T12 4 T16 4" fill="none" stroke={hex} strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className="hlx-body">
        <span className="hlx-top">
          <span className="hlx-source">{sourceLabel}</span>
          <span className="hlx-kind">{isUnderline ? 'Underline' : isSquiggle ? 'Squiggle' : 'Highlight'}</span>
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
  var annVer = React.useSyncExternalStore(
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

  /* One walk of the store and one source label per mark per store version (sweep W69): a fresh
     _collectMarks() per render kept both memos below from ever holding, and the search and every
     row resolved each label again (a corpus or journal lookup). */
  var marks = useMemo(_collectMarks, [annVer]);
  var sourceOf = useMemo(function() {
    var m = new Map();
    marks.forEach(function(mk) {
      var t = (typeof _bookmarkSourceLabel === 'function') ? (_bookmarkSourceLabel(mk.hlKey) || '') : '';
      m.set(mk, { text: t, lower: t.toLowerCase() });
    });
    return m;
  }, [marks]);

  // Distinct colors present, in palette order — drives the filter dots.
  var presentColors = useMemo(function() {
    var seen = {};
    marks.forEach(function(m) { seen[m.color === 'cyan' ? 'teal' : m.color] = 1; });
    return _HL_COLOR_ORDER.filter(function(c) { return seen[c]; });
  }, [marks]);

  var sorted = useMemo(function() {
    var q = query.trim().toLowerCase();
    var list = q ? marks.filter(function(m) {
      return (m.text || '').toLowerCase().indexOf(q) >= 0 || sourceOf.get(m).lower.indexOf(q) >= 0;
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
  }, [marks, sourceOf, sortNewest, query, typeFilter, colorFilter]);

  function navigate(m) {
    var ep = (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(m.hlKey) : null;
    if (ep && onNavigateToSource) onNavigateToSource(ep, { sourceLetterTitle: 'My Highlights' });
  }

  // s19.5: an empty filtered list names what filtered it and offers the way back.
  var TYPE_WORDS = { highlight: 'highlights', underline: 'underlines', squiggle: 'squiggles' };
  function filterWords() {
    var parts = [];
    if (colorFilter) parts.push(colorFilter);
    parts.push(typeFilter !== 'all' ? TYPE_WORDS[typeFilter] || typeFilter : 'marks');
    var words = parts.join(' ');
    return query.trim() ? '“' + query.trim() + '” in ' + words : words;
  }
  function showAll() { setQuery(''); setTypeFilter('all'); setColorFilter(null); }

  function typeChip(val, label) {
    return (
      <button
        type="button"
        className={'hlx-type-chip' + (typeFilter === val ? ' active' : '')}
        aria-pressed={typeFilter === val}
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
        <header className="study-head inset">
          <h1 className="study-head-title">Highlights & Underlines</h1>
          <span className="study-head-count">{marks.length + (marks.length === 1 ? ' mark' : ' marks')}</span>
        </header>
        {marks.length > 0 && (
          <div className="hlx-controls">
            {/* C2-C [C9]: same class, same type, same aria wording as every
                sibling index search (Notes / Bookmarks / Links / History).
                type="search" is what gives it the platform clear affordance
                and the search keyboard; `hlx-search` keeps its own look. */}
            <input
              className="notes-index-search hlx-search" type="search"
              placeholder="Search marks…" aria-label="Search marks"
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
              {typeChip('squiggle', 'Squiggles')}
            </div>
            {/* Granular color filter — always available, the actual color dots
                just like the highlight/underline picker. Tap a dot to show only
                that color; tap "All" (or the active dot again) to clear. */}
            {presentColors.length > 0 && (
              <div className="hlx-filter-row">
                <span className="hlx-sort-label">Color</span>
                <button
                  type="button"
                  className={'hlx-color-all' + (colorFilter === null ? ' active' : '')}
                  aria-pressed={colorFilter === null}
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
                      aria-pressed={colorFilter === c}
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
                  : 'Nothing matches ' + filterWords() + '.'}</div>
                {marks.length > 0 && (
                  <button type="button" className="notes-index-sort-btn hlx-show-all" onClick={showAll}>Show all</button>
                )}
              </div>
            )
          : (
              <div className="hlx-list">
                {sorted.map(function(m) {
                  return <HighlightRow key={m.groupId} mark={m} source={sourceOf.get(m).text} onNavigate={navigate} />;
                })}
              </div>
            )
        }
      </div>
    </ScreenLayout>
  );
}
