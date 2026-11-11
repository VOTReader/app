/* ═══════════════════════════════════════════════════════════════════════
   HighlightsScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Free globals, not imports: this screen ships in bundle-d (the lazy Personal
   Study bundle-g until lz1) and reads normalizeExcerptDisplay from the window slots
   bundle-d fills — one copy of each law, and no second module state.
   mark-kinds.js is the exception: pure, stateless, a few lines (v05-04). */
import { isCountedMark } from '../../utils/mark-kinds.js';
import { ListSearch, ListLine } from '../components/LibraryList.jsx';
import { Chip, EmptyState, UiButton } from '../components/UiParts.jsx';

/* The screen's CSS is app.css's "W2 LIBRARY FAMILY: Highlights" block (the UI pass moved it out of the old injected
   sheet, so the static sheet's tooling sees it). */

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

/** A colour's hex at a given strength, for the mark drawn behind the words. @param {string} hex @param {number} alpha */
function _tint(hex, alpha) {
  var n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

/** The three kinds by their one name each (X-hidden-decisions: Highlighter, Underline, Squiggle). */
export var KIND_NAME = { highlight: 'Highlighter', underline: 'Underline', squiggle: 'Squiggle' };

/* One row (mock v2 l-high): a colour bar, the words drawn in their own mark (a highlighter behind them, an
   underline or a squiggle under them), then "place · when". The whole row opens the place. */
export function HighlightRow(props) {
  var m = props.mark;
  var sourceLabel = props.source || ((typeof _bookmarkSourceLabel === 'function') ? _bookmarkSourceLabel(m.hlKey) : m.hlKey);
  var date = (typeof relativeDate === 'function') ? relativeDate(m.updated || m.created) : '';
  var hex = _hlColorHex(m.color);
  var kind = m.kind === 'underline' || m.kind === 'squiggle' ? m.kind : 'highlight';
  /** @type {any} */
  var markStyle = kind === 'highlight'
    ? { background: _tint(hex, 0.24) }
    : { textDecorationLine: 'underline', textDecorationStyle: kind === 'squiggle' ? 'wavy' : 'solid', textDecorationColor: hex };
  var open = function() { if (props.onNavigate) props.onNavigate(m); };
  return (
    <button type="button" className={'hlx-row is-' + kind} onClick={open}
      aria-label={KIND_NAME[kind] + ': ' + (m.text || '') + ' · ' + sourceLabel}>
      <span className="hlx-swatch" style={{ background: hex }} aria-hidden="true" />
      <span className="hlx-body">
        {m.text && <span className="hlx-text"><span className="hlx-mark" style={markStyle}>{m.text}</span></span>}
        <span className="hlx-meta">{[sourceLabel, date].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
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
  var TYPE_WORDS = { highlight: 'highlighter marks', underline: 'underlines', squiggle: 'squiggles' };
  function filterWords() {
    var parts = [];
    if (colorFilter) parts.push(colorFilter);
    parts.push(typeFilter !== 'all' ? TYPE_WORDS[typeFilter] || typeFilter : 'highlights');
    var words = parts.join(' ');
    return query.trim() ? '“' + query.trim() + '” in ' + words : words;
  }
  function showAll() { setQuery(''); setTypeFilter('all'); setColorFilter(null); }

  var TYPES = [['all', 'All'], ['highlight', 'Highlighter'], ['underline', 'Underline'], ['squiggle', 'Squiggle']];

  return (
    <ScreenLayout utility={{ title: 'Highlights', onBack: onBack }}>
      <div className="hlx-screen lib-screen">
        {marks.length === 0 ? (
          <EmptyState icon="pen" title="No highlights yet"
            text="Select some words while you read and tap a colour to mark them. Every mark you make collects here."
            action={props.onStartReading ? { label: 'Start reading', onClick: props.onStartReading } : null} />
        ) : (
          <>
            <ListSearch placeholder="Search highlights" value={query} onChange={setQuery} />
            <div className="ui-chips hlx-chips" role="group" aria-label="Kind">
              {TYPES.map(function(t) {
                return <Chip key={t[0]} on={typeFilter === t[0]} onClick={function() { setTypeFilter(t[0]); }}>{t[1]}</Chip>;
              })}
            </div>
            {presentColors.length > 1 && (
              <div className="ui-chips hlx-chips" role="group" aria-label="Colour">
                <Chip on={colorFilter === null} onClick={function() { setColorFilter(null); }}>Any colour</Chip>
                {presentColors.map(function(c) {
                  return (
                    <Chip key={c} on={colorFilter === c} onClick={function() { setColorFilter(colorFilter === c ? null : c); }}>
                      <span className="hlx-dot" style={{ background: _hlColorHex(c) }} aria-hidden="true" />{c.charAt(0).toUpperCase() + c.slice(1)}
                    </Chip>
                  );
                })}
              </div>
            )}
            <ListLine count={sorted.length} of={marks.length} noun="highlight" sort={sortNewest ? 'newest' : 'oldest'}
              onSort={function(id) { setSortNewest(id === 'newest'); }} />
            {sorted.length === 0 ? (
              <div className="lib-none">
                <p className="hlx-none-text">Nothing matches {filterWords()}.</p>
                <UiButton kind="text" small className="hlx-show-all" onClick={showAll}>Show all</UiButton>
              </div>
            ) : (
              <div className="hlx-list ui-group">
                {sorted.map(function(m) {
                  return <HighlightRow key={m.groupId} mark={m} source={sourceOf.get(m).text} onNavigate={navigate} />;
                })}
              </div>
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
}
