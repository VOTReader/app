/* =================================================================
   LINKS SCREEN — browser for all cross-reference links.
   =================================================================
   Global-scope module. No import/export — shares the page's global
   scope just like the inline components in index.html.
   Depends on (must load first): LinkStore (link-store.js),
     relativeDate, bookCategory, findEntryContext, ScreenLayout,
     ThemeBtn, navigateToLink (passed as prop), setHlTick (as prop).

   DATA MODEL (from link-store.js):
     link = { id, source: LinkEndpoint, target: LinkEndpoint, created }
     LinkEndpoint = { type, key, label, collection?, preview?, text?, ... }

   DESIGN:
   - One "All Links" tab — a pair of endpoints per row makes separate
     By-Source / By-Target tabs redundant and adds little value once
     you can see the direction inline on each row.
   - Direction is shown explicitly: SOURCE on top (gold), chain icon
     in the middle, TARGET on the bottom (cream-dim). Both sides are
     individually tappable to navigate there.
   - Rows are navigable from EITHER side via individual tap areas.
   - Search filters on source label, target label, source text, target
     text, and category text.
   - Sort: Recent (default), Oldest, Source A–Z, Target A–Z.
   - Long-press shows an action sheet with: Open Source / Open Target /
     Delete (with tap-confirm strip per PLAN.txt §11.1).
   - Broken-link callout: links where one or both endpoints no longer
     resolve to a navigable location are surfaced passively so the
     user can clean them up. Never auto-deleted.
   ================================================================= */

/* ── Helpers ─────────────────────────────────────────────────────── */

/* Human-readable category label for a link endpoint.
   Mirrors the logic in LinkCard inside index.html so the two surfaces
   stay in sync. */
export function _linkEndpointCategory(ep) {
  if (!ep) return '';
  if (ep.type === 'bible') return (typeof bookCategory === 'function') ? bookCategory(ep.bookId) : 'Bible';
  if (ep.type === 'study') return 'Matthew Study Bible';
  if (ep.type === 'study-letter') return ep.collection || 'Bible Study';
  if (ep.type === 'letter') return ep.collection || 'Letter';
  if (ep.type === 'wtlb') return ep.collection || 'Words To Live By';
  if (ep.type === 'blessed') return 'The Blessed';
  if (ep.type === 'holy-days') return 'Holy Days';
  return ep.type || '';
}

/* Cheap "is this endpoint still navigable?" check. We only use
   already-loaded globals — no extra fetches. Returns true if
   the endpoint resolves to a known destination. */
export function _endpointResolves(ep) {
  if (!ep || !ep.type || !ep.key) return false;
  if (ep.type === 'bible') {
    var books = (typeof _allBooks === 'function') ? _allBooks() : {};
    return !!(ep.bookId && books[ep.bookId]);
  }
  if (ep.type === 'study') {
    var M = (typeof _matthew === 'function') ? _matthew() : null;
    if (!M) return true; // matthew may not be loaded yet — don't mark broken
    return !!(M.chapters && M.chapters.find(function(c) { return c.num === ep.chapter; }));
  }
  // Journal endpoints: the entry may have been deleted — verify it exists.
  if (ep.type === 'journal') {
    if (typeof JournalStore === 'undefined') return true; // can't verify
    var jid = ep.entryId || (ep.key && ep.key.split(':')[1]) || null;
    return !!(jid && JournalStore.get(jid));
  }
  // For letter/wtlb/blessed/holy-days, try findEntryContext
  if (typeof findEntryContext === 'function') {
    var kind = ep.type === 'letter' ? 'letter' : ep.type === 'wtlb' ? 'wtlb' : ep.type === 'blessed' ? 'blessed' : ep.type === 'holy-days' ? 'holy-days' : null;
    var id = ep.letterId || ep.entryId || (ep.key && ep.key.split(':')[1]) || null;
    if (!id) return false;
    var ctx = findEntryContext(id, kind);
    return !!ctx;
  }
  return true; // can't verify — assume OK
}

/* Build a text string for the search index from an endpoint. */
export function _epSearchText(ep) {
  if (!ep) return '';
  return [ep.label || '', _linkEndpointCategory(ep), ep.text || '', ep.preview || ''].join(' ').toLowerCase();
}

/* ── LinkRow component ───────────────────────────────────────────── */
/* One row in the links browser. Shows SOURCE above, chain, TARGET below.
   Each side is its own tappable button. Long-press surfaces the action
   sheet (passed down as onLongPress). */
export function LinkRow({ lnk, onNavigateSource, onNavigateTarget, onLongPress }) {
  var src = lnk.source;
  var tgt = lnk.target;
  var date = (typeof relativeDate === 'function') ? relativeDate(lnk.created) : '';
  var srcCat = _linkEndpointCategory(src);
  var tgtCat = _linkEndpointCategory(tgt);
  var srcPreview = (src && (src.text || src.preview)) || '';
  var tgtPreview = (tgt && (tgt.text || tgt.preview)) || '';

  // Chain icon SVG — reused from LinkCard styling
  var chainSvg = React.createElement('svg', {
    className: 'link-row-chain',
    viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: '1.6',
    strokeLinecap: 'round', strokeLinejoin: 'round'
  },
    React.createElement('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }),
    React.createElement('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' })
  );

  return React.createElement('div', {
    className: 'link-row',
    onContextMenu: function(e) { e.preventDefault(); if (onLongPress) onLongPress(lnk, e); }
  },
    // Source side — tappable
    React.createElement('button', {
      className: 'link-row-side link-row-source',
      onClick: function() { if (onNavigateSource) onNavigateSource(lnk); },
      title: 'Open source: ' + (src && src.label ? src.label : '')
    },
      React.createElement('span', { className: 'link-row-side-eyebrow' }, 'SOURCE'),
      React.createElement('span', { className: 'link-row-side-label' }, src && src.label ? src.label : '(unknown)'),
      srcCat && React.createElement('span', { className: 'link-row-side-cat' }, srcCat),
      srcPreview && React.createElement('span', { className: 'link-row-side-preview' }, srcPreview)
    ),
    // Chain icon + date
    React.createElement('div', { className: 'link-row-mid' },
      chainSvg,
      date && React.createElement('span', { className: 'link-row-date' }, date)
    ),
    // Target side — tappable
    React.createElement('button', {
      className: 'link-row-side link-row-target',
      onClick: function() { if (onNavigateTarget) onNavigateTarget(lnk); },
      title: 'Open target: ' + (tgt && tgt.label ? tgt.label : '')
    },
      React.createElement('span', { className: 'link-row-side-eyebrow' }, 'TARGET'),
      React.createElement('span', { className: 'link-row-side-label' }, tgt && tgt.label ? tgt.label : '(unknown)'),
      tgtCat && React.createElement('span', { className: 'link-row-side-cat' }, tgtCat),
      tgtPreview && React.createElement('span', { className: 'link-row-side-preview' }, tgtPreview)
    )
  );
}

/* ── LinkRowActionSheet ──────────────────────────────────────────── */
/* Bottom sheet with: Open Source / Open Target / Delete.
   Delete follows the tap-confirm-strip pattern (PLAN.txt §11.1). */
export function LinkRowActionSheet({ lnk, onClose, onNavigateSource, onNavigateTarget, onDelete }) {
  var useState = React.useState;
  var _state = useState(false);
  var confirming = _state[0];
  var setConfirming = _state[1];

  if (!lnk) return null;

  var doDelete = function() {
    LinkStore.remove(lnk.id);
    onDelete();
    onClose();
  };

  return React.createElement('div', {
    className: 'link-action-overlay',
    onClick: onClose
  },
    React.createElement('div', {
      className: 'link-action-sheet',
      onClick: function(e) { e.stopPropagation(); }
    },
      React.createElement('div', { className: 'link-action-handle' }),
      !confirming && React.createElement(React.Fragment, null,
        React.createElement('button', {
          className: 'link-action-btn',
          onClick: function() { onNavigateSource(lnk); onClose(); }
        },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('circle', { cx: '12', cy: '12', r: '10' }),
            React.createElement('line', { x1: '12', y1: '8', x2: '12', y2: '16' }),
            React.createElement('line', { x1: '8', y1: '12', x2: '16', y2: '12' })
          ),
          React.createElement('span', null, 'Open Source')
        ),
        React.createElement('button', {
          className: 'link-action-btn',
          onClick: function() { onNavigateTarget(lnk); onClose(); }
        },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M5 12h14' }),
            React.createElement('polyline', { points: '12 5 19 12 12 19' })
          ),
          React.createElement('span', null, 'Open Target')
        ),
        React.createElement('button', {
          className: 'link-action-btn link-action-btn-danger',
          onClick: function() { setConfirming(true); }
        },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('polyline', { points: '3 6 5 6 21 6' }),
            React.createElement('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
            React.createElement('path', { d: 'M10 11v6' }),
            React.createElement('path', { d: 'M14 11v6' })
          ),
          React.createElement('span', null, 'Delete Link')
        )
      ),
      confirming && React.createElement('div', { className: 'ann-chip-confirm', style: { padding: '14px 12px' } },
        React.createElement('span', { className: 'ann-chip-confirm-q' }, 'Delete this link?'),
        React.createElement('button', {
          className: 'ann-chip-confirm-btn ann-chip-confirm-cancel',
          onClick: function() { setConfirming(false); }
        }, 'Cancel'),
        React.createElement('button', {
          className: 'ann-chip-confirm-btn ann-chip-confirm-yes',
          onClick: doDelete
        }, 'Yes, delete')
      )
    )
  );
}

/* ── LinksScreen ─────────────────────────────────────────────────── */
/* Props:
     onBack              — navigate back to Library
     onNavigateToSource  — function(endpoint, meta) navigate + push back pill
     onNavigateToTarget  — function(endpoint, meta) navigate + push back pill
     hlTick / setHlTick  — refresh signal from App
     theme / onThemeChange / onSearch / onHistory / historyEnabled
*/
export function LinksScreen(props) {
  var onBack = props.onBack;
  var onHome = props.onHome;
  var onNavigateToSource = props.onNavigateToSource;
  var onNavigateToTarget = props.onNavigateToTarget;
  var hlTick = props.hlTick;
  var setHlTick = props.setHlTick;
  var theme = props.theme;
  var onThemeChange = props.onThemeChange;
  var onSearch = props.onSearch;
  var onHistory = props.onHistory;
  var historyEnabled = props.historyEnabled;

  var useState = React.useState;
  var useMemo = React.useMemo;

  var _sq = useState('');
  var searchQuery = _sq[0];
  var setSearchQuery = _sq[1];

  var _ss = useState('recent');
  var sortMode = _ss[0];
  var setSortMode = _ss[1];

  var _sm = useState(false);
  var showSortMenu = _sm[0];
  var setShowSortMenu = _sm[1];

  var _as = useState(null); // link being actioned, or null
  var actionTarget = _as[0];
  var setActionTarget = _as[1];

  // All links, re-derived whenever hlTick changes
  var allLinks = useMemo(function() {
    return LinkStore.all();
  }, [hlTick]);

  // Filter + sort
  var displayLinks = useMemo(function() {
    var q = searchQuery.trim().toLowerCase();
    var filtered = q
      ? allLinks.filter(function(lnk) {
          return _epSearchText(lnk.source).includes(q) || _epSearchText(lnk.target).includes(q);
        })
      : allLinks.slice();

    filtered.sort(function(a, b) {
      if (sortMode === 'oldest') return (a.created || 0) - (b.created || 0);
      if (sortMode === 'source-az') {
        var la = (a.source && a.source.label) ? a.source.label.toLowerCase() : '';
        var lb = (b.source && b.source.label) ? b.source.label.toLowerCase() : '';
        return la < lb ? -1 : la > lb ? 1 : 0;
      }
      if (sortMode === 'target-az') {
        var ta = (a.target && a.target.label) ? a.target.label.toLowerCase() : '';
        var tb = (b.target && b.target.label) ? b.target.label.toLowerCase() : '';
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      }
      // Default: recent (newest first)
      return (b.created || 0) - (a.created || 0);
    });
    return filtered;
  }, [allLinks, searchQuery, sortMode]);

  // Broken links: where source OR target no longer resolves
  var brokenLinks = useMemo(function() {
    return allLinks.filter(function(lnk) {
      return !_endpointResolves(lnk.source) || !_endpointResolves(lnk.target);
    });
  }, [allLinks]);

  var sortLabels = { recent: 'Recent', oldest: 'Oldest', 'source-az': 'Source A–Z', 'target-az': 'Target A–Z' };

  var navigateToEndpoint = function(endpoint, label) {
    if (!endpoint) return;
    if (typeof onNavigateToSource === 'function') {
      onNavigateToSource(endpoint, { sourceLetterTitle: label || 'My Links' });
    }
  };

  var onNavigateSource = function(lnk) {
    navigateToEndpoint(lnk.source, 'My Links');
  };

  var onNavigateTarget = function(lnk) {
    // Re-use the same navigation pipeline — just pass target endpoint
    if (!lnk.target) return;
    if (typeof onNavigateToTarget === 'function') {
      onNavigateToTarget(lnk.target, { sourceLetterTitle: 'My Links' });
    } else {
      // Fallback: same handler
      navigateToEndpoint(lnk.target, 'My Links');
    }
  };

  var onDeleteFromSheet = function() {
    if (typeof setHlTick === 'function') setHlTick(function(t) { return t + 1; });
  };

  // Nav buttons (mirrors NotesIndexScreen)
  // Standard app-wide Library nav (back + Home left, icon cluster right).
  var navChildren = LibraryNav({
    onBack: onBack, onSearch: onSearch, onHistory: onHistory,
    onSettings: props.onSettings,
    theme: theme, onThemeChange: onThemeChange
  });

  return React.createElement(ScreenLayout, { navChildren: navChildren },
    React.createElement('div', { className: 'links-screen' },

      // Header
      React.createElement('div', { className: 'notes-index-header' },
        React.createElement('h1', { className: 'notes-index-title' }, 'My Links'),
        React.createElement('span', { className: 'notes-index-count' },
          allLinks.length,
          allLinks.length === 1 ? ' link' : ' links'
        )
      ),

      // Search
      React.createElement('input', {
        className: 'notes-index-search',
        type: 'search',
        placeholder: 'Search links…',
        value: searchQuery,
        onChange: function(e) { setSearchQuery(e.target.value); }
      }),

      // Controls row: single sort TOGGLE (replaces the unreliable dropdown).
      React.createElement('div', { className: 'notes-index-controls', style: { marginTop: '0.7rem' } },
        React.createElement('button', {
          className: 'notes-index-sort-btn',
          style: { marginLeft: 'auto' },
          onClick: function() { setSortMode(function(m) { return m === 'oldest' ? 'recent' : 'oldest'; }); },
          title: 'Toggle sort order'
        }, sortMode === 'oldest' ? 'Sort: Oldest ↑' : 'Sort: Newest ↓')
      ),

      // Broken links callout (passive — shown only when broken links exist
      // and the user hasn't filtered them away)
      brokenLinks.length > 0 && !searchQuery && React.createElement('div', { className: 'links-broken-callout' },
        React.createElement('span', { className: 'links-broken-icon' },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }),
            React.createElement('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }),
            React.createElement('line', { x1: '2', y1: '2', x2: '22', y2: '22' })
          )
        ),
        React.createElement('span', { className: 'links-broken-text' },
          brokenLinks.length,
          brokenLinks.length === 1
            ? ' link points to content that can no longer be found (the source or target was deleted).'
            : ' links point to content that can no longer be found (a source or target was deleted).',
          ' Long-press a link to remove it.'
        )
      ),

      // Empty state: no links at all
      allLinks.length === 0 && React.createElement('div', { className: 'notes-empty' },
        React.createElement('div', { className: 'notes-empty-title' }, 'No Links Yet'),
        React.createElement('div', { className: 'notes-empty-hint' },
          'Select text in any letter or Bible chapter, tap Link in the toolbar, and pick a destination. Your links will appear here.'
        )
      ),

      // Empty state: no matches for search/filter
      allLinks.length > 0 && displayLinks.length === 0 && React.createElement('div', { className: 'notes-empty' },
        React.createElement('div', { className: 'notes-empty-title' }, 'No Matches'),
        React.createElement('div', { className: 'notes-empty-hint' }, 'Try a different search term.')
      ),

      // Link rows
      displayLinks.length > 0 && React.createElement('div', { className: 'notes-index-list', style: { marginTop: '0.75rem' } },
        displayLinks.map(function(lnk) {
          return React.createElement(LinkRow, {
            key: lnk.id,
            lnk: lnk,
            onNavigateSource: onNavigateSource,
            onNavigateTarget: onNavigateTarget,
            onLongPress: function(l) { setActionTarget(l); }
          });
        })
      ),

      // Action sheet (long-press on a row)
      actionTarget && React.createElement(LinkRowActionSheet, {
        lnk: actionTarget,
        onClose: function() { setActionTarget(null); },
        onNavigateSource: function(lnk) { onNavigateSource(lnk); setActionTarget(null); },
        onNavigateTarget: function(lnk) { onNavigateTarget(lnk); setActionTarget(null); },
        onDelete: onDeleteFromSheet
      })
    )
  );
}
