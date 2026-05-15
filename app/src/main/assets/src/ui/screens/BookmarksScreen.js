/* =================================================================
   BOOKMARKS SCREEN — browser for all saved passage anchors.
   =================================================================
   Global-scope module. No import/export — shares the page's global
   scope just like the inline components in index.html.
   Depends on (must load first): BookmarkStore (bookmark-store.js),
     relativeDate, bookCategory, findEntryContext, _bookTitle,
     _verseRangeLabel, ScreenLayout, ThemeBtn, navigateToLink
     (passed as prop), setHlTick (as prop).

   DATA MODEL (from bookmark-store.js):
     bookmark = { id, hlKey, label, created, updated }
     hlKey: e.g. "letter:the-wide-path:2:10-40" or "bible:genesis:1:3"

   DESIGN:
   - Flat list of all bookmarks — one direction, one passage each.
   - Source label (Cinzel gold) + italic label preview + relative date.
   - Search filters on label, source label, and source preview text.
   - Sort: Recent (default), Oldest, Source A-Z, Label A-Z.
   - Tap row → navigate to source with single-shot "Back to My Bookmarks" pill.
   - Long-press row → action sheet: Open / Edit Label / Delete (with
     tap-confirm strip per PLAN.txt §11.1).
   - Edit Label: inline input replaces the label; Enter/blur commits,
     Escape cancels.
   - Empty states: "No Bookmarks Yet" and "No Matches".
   ================================================================= */

/* ── Source label for a bookmark ─────────────────────────────── */
/* Returns a human-readable source label for displaying in the row. */
function _bookmarkSourceLabel(hlKey) {
  if (!hlKey) return 'Bookmark';
  var parts = hlKey.split(':');
  var kind = parts[0];

  if (kind === 'bible') {
    // bible:bookId:chapter:verse  or  bible:bookId:chapter:verse:start-end
    var bookId = parts[1];
    var chap = parts[2];
    var verse = parts[3];
    var title = (typeof _bookTitle === 'function') ? _bookTitle(bookId) : bookId;
    return verse ? (title + ' ' + chap + ':' + verse) : (title + ' ' + chap);
  }

  if (kind === 'study') {
    // study:matthew-N:verse  or study:bookId-chapter:verse:start-end
    var raw = parts[1] || '';
    var m = raw.match(/^(.+)-(\d+)$/);
    var bookName = m ? (m[1].charAt(0).toUpperCase() + m[1].slice(1)) : raw;
    var chapNum = m ? m[2] : '';
    var vs = parts[2] || '';
    return vs ? (bookName + ' ' + chapNum + ':' + vs) : bookName;
  }

  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    var id = parts[1];
    if (typeof findEntryContext === 'function') {
      var ctx = findEntryContext(id, kind === 'letter' ? 'letter' : kind);
      if (ctx && ctx.title) return ctx.title;
    }
    return id;
  }

  return hlKey;
}

/* Returns an endpoint suitable for navigateToLink(), mirroring noteSourceNav(). */
function _bookmarkSourceEndpoint(hlKey) {
  if (!hlKey) return null;
  var parts = hlKey.split(':');
  var kind = parts[0];

  if (kind === 'bible') {
    return { type: 'bible', key: hlKey, bookId: parts[1], chapter: parseInt(parts[2] || '0', 10), verse: parseInt(parts[3] || '0', 10) };
  }
  if (kind === 'study') {
    var m = (parts[1] || '').match(/^(.+)-(\d+)$/);
    if (m) return { type: 'study', key: hlKey, bookId: m[1], chapter: parseInt(m[2], 10), verse: parseInt(parts[2] || '0', 10) };
  }
  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    var ctx = (typeof findEntryContext === 'function') ? findEntryContext(parts[1], kind) : null;
    return { type: kind, key: hlKey, letterId: parts[1], entryId: parts[1], screen: ctx ? ctx.screen : null };
  }
  return null;
}

/* ── BookmarkRow component ───────────────────────────────────── */
/* One row in the bookmarks browser. Shows source label, bookmark label,
   and date. Long-press surfaces the action sheet. */
function BookmarkRow({ bkm, onNavigate, onLongPress, editingId, onEditStart, onEditSave, onEditCancel }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var inputRef = useRef(null);

  var _editState = useState(bkm.label || '');
  var editValue = _editState[0];
  var setEditValue = _editState[1];

  var isEditing = editingId === bkm.id;
  var sourceLabel = _bookmarkSourceLabel(bkm.hlKey);
  var date = (typeof relativeDate === 'function') ? relativeDate(bkm.updated || bkm.created) : '';

  // Keep editValue in sync when we switch to editing this row
  useEffect(function() {
    if (isEditing) {
      setEditValue(bkm.label || '');
      setTimeout(function() {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isEditing]);

  var commitEdit = function() {
    var v = editValue.trim();
    if (v) onEditSave(bkm.id, v);
    else onEditCancel();
  };

  var onKeyDown = function(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    else if (e.key === 'Escape') { onEditCancel(); }
  };

  return React.createElement('div', {
    className: 'bkm-row',
    onContextMenu: function(e) { e.preventDefault(); if (onLongPress) onLongPress(bkm, e); }
  },
    React.createElement('button', {
      className: 'bkm-row-content',
      onClick: function() { if (!isEditing && onNavigate) onNavigate(bkm); },
      disabled: isEditing
    },
      // Source label — Cinzel gold, always visible
      React.createElement('span', { className: 'bkm-row-source' }, sourceLabel),
      // Label — shown or editing
      isEditing
        ? React.createElement('input', {
            ref: inputRef,
            className: 'bkm-row-edit-input',
            type: 'text',
            value: editValue,
            onChange: function(e) { setEditValue(e.target.value); },
            onKeyDown: onKeyDown,
            onBlur: commitEdit,
            onClick: function(e) { e.stopPropagation(); },
            placeholder: 'Bookmark label',
            maxLength: 200
          })
        : React.createElement('span', { className: 'bkm-row-label' }, bkm.label || '(no label)')
    ),
    // Date + long-press affordance (three dots)
    React.createElement('div', { className: 'bkm-row-meta' },
      date && React.createElement('span', { className: 'bkm-row-date' }, date),
      React.createElement('button', {
        className: 'bkm-row-more',
        onClick: function(e) { e.stopPropagation(); if (onLongPress) onLongPress(bkm, e); },
        title: 'Options',
        'aria-label': 'Bookmark options'
      }, React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('circle', { cx: '12', cy: '5', r: '1' }),
        React.createElement('circle', { cx: '12', cy: '12', r: '1' }),
        React.createElement('circle', { cx: '12', cy: '19', r: '1' })
      ))
    )
  );
}

/* ── BookmarkRowActionSheet ──────────────────────────────────── */
/* Bottom sheet with: Open / Edit Label / Delete.
   Delete follows the tap-confirm-strip pattern (PLAN.txt §11.1). */
function BookmarkRowActionSheet({ bkm, onClose, onNavigate, onEditLabel, onDelete }) {
  var useState = React.useState;

  var _state = useState(false);
  var confirming = _state[0];
  var setConfirming = _state[1];

  if (!bkm) return null;

  var doDelete = function() {
    BookmarkStore.remove(bkm.id);
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
        // Open
        React.createElement('button', {
          className: 'link-action-btn',
          onClick: function() { onNavigate(bkm); onClose(); }
        },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
            React.createElement('polyline', { points: '15 3 21 3 21 9' }),
            React.createElement('line', { x1: '10', y1: '14', x2: '21', y2: '3' })
          ),
          React.createElement('span', null, 'Open Bookmark')
        ),
        // Edit label
        React.createElement('button', {
          className: 'link-action-btn',
          onClick: function() { onEditLabel(bkm.id); onClose(); }
        },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }),
            React.createElement('path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' })
          ),
          React.createElement('span', null, 'Edit Label')
        ),
        // Delete
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
          React.createElement('span', null, 'Delete Bookmark')
        )
      ),
      // Tap-confirm strip
      confirming && React.createElement('div', { className: 'ann-chip-confirm', style: { padding: '14px 12px' } },
        React.createElement('span', { className: 'ann-chip-confirm-q' }, 'Delete this bookmark?'),
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

/* ── BookmarkPopover ─────────────────────────────────────────── */
/* Small popover shown when tapping an inline bookmark icon.
   Shows bookmark label(s) and offers Open / Delete per bookmark.
   Positioned near the tap point. */
function BookmarkPopover({ bkmIds, x, y, onClose, onNavigate, onDeleteDone }) {
  var useState = React.useState;
  var confirmingId = useState(null);
  var setConfirmingId = confirmingId[1];
  confirmingId = confirmingId[0];

  if (!bkmIds || !bkmIds.length) return null;
  var bookmarks = bkmIds.map(function(id) { return BookmarkStore.get(id); }).filter(Boolean);
  if (!bookmarks.length) { onClose(); return null; }

  var doDelete = function(bkm) {
    BookmarkStore.remove(bkm.id);
    onDeleteDone && onDeleteDone();
    if (bookmarks.length <= 1) onClose();
    else setConfirmingId(null);
  };

  // Position popover: left-align at tap x, below tap y. Clamp to viewport.
  var popX = Math.max(8, Math.min(x - 80, window.innerWidth - 220));
  var popY = Math.max(8, y);

  return React.createElement(React.Fragment, null,
    // Backdrop
    React.createElement('div', {
      style: { position: 'fixed', inset: 0, zIndex: 8800 },
      onClick: onClose
    }),
    // Popover
    React.createElement('div', {
      className: 'bkm-popover',
      style: { left: popX, top: popY, zIndex: 8801 },
      onClick: function(e) { e.stopPropagation(); }
    },
      bookmarks.map(function(bkm) {
        var isConfirming = confirmingId === bkm.id;
        return React.createElement('div', { key: bkm.id, className: 'bkm-popover-item' },
          !isConfirming && React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'bkm-popover-label' }, bkm.label || '(no label)'),
            React.createElement('div', { className: 'bkm-popover-actions' },
              React.createElement('button', {
                className: 'bkm-popover-btn',
                onClick: function() { onNavigate(bkm); onClose(); }
              }, 'Open'),
              React.createElement('button', {
                className: 'bkm-popover-btn bkm-popover-btn-danger',
                onClick: function() { setConfirmingId(bkm.id); }
              }, 'Delete')
            )
          ),
          isConfirming && React.createElement('div', { className: 'ann-chip-confirm', style: { padding: '8px 10px' } },
            React.createElement('span', { className: 'ann-chip-confirm-q' }, 'Delete?'),
            React.createElement('button', { className: 'ann-chip-confirm-btn ann-chip-confirm-cancel', onClick: function() { setConfirmingId(null); } }, 'No'),
            React.createElement('button', { className: 'ann-chip-confirm-btn ann-chip-confirm-yes', onClick: function() { doDelete(bkm); } }, 'Yes')
          )
        );
      })
    )
  );
}

/* ── BookmarksScreen ─────────────────────────────────────────── */
/* Props:
     onBack                — navigate back to Library
     onNavigateToSource    — function(endpoint, meta) navigate + push back pill
     hlTick / setHlTick    — refresh signal from App
     theme / onThemeChange / onSearch / onHistory / historyEnabled
*/
function BookmarksScreen(props) {
  var onBack = props.onBack;
  var onNavigateToSource = props.onNavigateToSource;
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

  var _as = useState(null); // bookmark being actioned
  var actionTarget = _as[0];
  var setActionTarget = _as[1];

  var _ei = useState(null); // id of bookmark being inline-edited
  var editingId = _ei[0];
  var setEditingId = _ei[1];

  // All bookmarks, re-derived on hlTick
  var allBookmarks = useMemo(function() {
    return BookmarkStore.all().slice();
  }, [hlTick]);

  // Search index text per bookmark (label + source label)
  var displayBookmarks = useMemo(function() {
    var q = searchQuery.trim().toLowerCase();
    var filtered = q
      ? allBookmarks.filter(function(bkm) {
          var srcLabel = _bookmarkSourceLabel(bkm.hlKey).toLowerCase();
          var label = (bkm.label || '').toLowerCase();
          return label.includes(q) || srcLabel.includes(q);
        })
      : allBookmarks.slice();

    filtered.sort(function(a, b) {
      if (sortMode === 'oldest') return (a.created || 0) - (b.created || 0);
      if (sortMode === 'source-az') {
        var la = _bookmarkSourceLabel(a.hlKey).toLowerCase();
        var lb = _bookmarkSourceLabel(b.hlKey).toLowerCase();
        return la < lb ? -1 : la > lb ? 1 : 0;
      }
      if (sortMode === 'label-az') {
        var xa = (a.label || '').toLowerCase();
        var xb = (b.label || '').toLowerCase();
        return xa < xb ? -1 : xa > xb ? 1 : 0;
      }
      // Default: recent (newest first by updated || created)
      return (b.updated || b.created || 0) - (a.updated || a.created || 0);
    });
    return filtered;
  }, [allBookmarks, searchQuery, sortMode]);

  var sortLabels = { recent: 'Recent', oldest: 'Oldest', 'source-az': 'Source A-Z', 'label-az': 'Label A-Z' };

  var navigateToBookmark = function(bkm) {
    var endpoint = _bookmarkSourceEndpoint(bkm.hlKey);
    if (!endpoint) return;
    if (typeof onNavigateToSource === 'function') {
      onNavigateToSource(endpoint, { sourceLetterTitle: 'My Bookmarks' });
    }
  };

  var onDeleteDone = function() {
    if (typeof setHlTick === 'function') setHlTick(function(t) { return t + 1; });
  };

  var onEditSave = function(id, newLabel) {
    BookmarkStore.update(id, { label: newLabel });
    if (typeof setHlTick === 'function') setHlTick(function(t) { return t + 1; });
    setEditingId(null);
  };

  // Nav buttons (mirrors LinksScreen)
  var navChildren = React.createElement(React.Fragment, null,
    React.createElement('button', {
      className: 'nav-home nav-back-icon',
      onClick: onBack, title: 'Back', 'aria-label': 'Back'
    }, String.fromCharCode(8249)), // ‹
    React.createElement('button', {
      className: 'nav-search-btn', onClick: onSearch, title: 'Search'
    },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6' },
        React.createElement('circle', { cx: '11', cy: '11', r: '8' }),
        React.createElement('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' })
      )
    ),
    historyEnabled !== false && React.createElement('button', {
      className: 'nav-search-btn', onClick: onHistory, title: 'History'
    },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('circle', { cx: '12', cy: '12', r: '9' }),
        React.createElement('polyline', { points: '12 7 12 12 15 15' })
      )
    ),
    React.createElement(ThemeBtn, { theme: theme, onThemeChange: onThemeChange })
  );

  return React.createElement(ScreenLayout, { navChildren: navChildren },
    React.createElement('div', { className: 'bkm-screen' },

      // Header
      React.createElement('div', { className: 'notes-index-header' },
        React.createElement('h1', { className: 'notes-index-title' }, 'My Bookmarks'),
        React.createElement('span', { className: 'notes-index-count' },
          allBookmarks.length,
          allBookmarks.length === 1 ? ' bookmark' : ' bookmarks'
        )
      ),

      // Search
      React.createElement('input', {
        className: 'notes-index-search',
        type: 'search',
        placeholder: 'Search bookmarks…',
        value: searchQuery,
        onChange: function(e) { setSearchQuery(e.target.value); }
      }),

      // Controls row: sort
      React.createElement('div', { className: 'notes-index-controls', style: { marginTop: '0.7rem' } },
        React.createElement('div', { style: { position: 'relative', marginLeft: 'auto' } },
          React.createElement('button', {
            className: 'notes-index-sort-btn',
            onClick: function() { setShowSortMenu(function(v) { return !v; }); },
            title: 'Sort order'
          }, 'Sort: ' + (sortLabels[sortMode] || 'Recent') + ' ▾'),
          showSortMenu && React.createElement(React.Fragment, null,
            React.createElement('div', {
              style: { position: 'fixed', inset: 0, zIndex: 3099 },
              onClick: function() { setShowSortMenu(false); }
            }),
            React.createElement('div', { className: 'notes-sort-menu', style: { right: 0, top: '100%' } },
              ['recent', 'oldest', 'source-az', 'label-az'].map(function(mode) {
                return React.createElement('button', {
                  key: mode,
                  className: 'notes-sort-menu-item' + (sortMode === mode ? ' active' : ''),
                  onClick: function() { setSortMode(mode); setShowSortMenu(false); }
                }, sortLabels[mode]);
              })
            )
          )
        )
      ),

      // Empty state: no bookmarks at all
      allBookmarks.length === 0 && React.createElement('div', { className: 'notes-empty' },
        React.createElement('div', { className: 'notes-empty-title' }, 'No Bookmarks Yet'),
        React.createElement('div', { className: 'notes-empty-hint' },
          'Select text in any letter or Bible chapter, then tap Bookmark in the toolbar. Your bookmarks will appear here.'
        )
      ),

      // Empty state: no search matches
      allBookmarks.length > 0 && displayBookmarks.length === 0 && React.createElement('div', { className: 'notes-empty' },
        React.createElement('div', { className: 'notes-empty-title' }, 'No Matches'),
        React.createElement('div', { className: 'notes-empty-hint' }, 'Try a different search term.')
      ),

      // Bookmark rows
      displayBookmarks.length > 0 && React.createElement('div', { className: 'notes-index-list', style: { marginTop: '0.75rem' } },
        displayBookmarks.map(function(bkm) {
          return React.createElement(BookmarkRow, {
            key: bkm.id,
            bkm: bkm,
            onNavigate: navigateToBookmark,
            onLongPress: function(b) { setActionTarget(b); },
            editingId: editingId,
            onEditStart: function(id) { setEditingId(id); },
            onEditSave: onEditSave,
            onEditCancel: function() { setEditingId(null); }
          });
        })
      ),

      // Action sheet (long-press on a row)
      actionTarget && React.createElement(BookmarkRowActionSheet, {
        bkm: actionTarget,
        onClose: function() { setActionTarget(null); },
        onNavigate: function(bkm) { navigateToBookmark(bkm); setActionTarget(null); },
        onEditLabel: function(id) { setEditingId(id); setActionTarget(null); },
        onDelete: onDeleteDone
      })
    )
  );
}
