/* ═══════════════════════════════════════════════════════════════════════
   BookmarksScreen — Cluster G (esbuild bundle-g.js, lazy)
   ═══════════════════════════════════════════════════════════════════════
   My Bookmarks is a screen a reader opens on purpose, never on boot, so it
   travels with the other Personal Study screens in bundle-g rather than
   costing every launch its parse (lanes/myweb/out/perf-report-2026-09-22.md
   §6). Two pieces of this file could not come along and now live in
   bundle-d, where the always-present app shell can always reach them:
   BookmarkPopover (ui/sheets/BookmarkPopover.jsx) and the two hlKey
   derivations (utils/bookmark-source.js).

   Which is why the screen asks for those derivations the way every lazy
   bundle asks bundle-d for a shared law — as a free global at call time,
   through the two guards below. BookmarkRow and its action sheet have no
   reader outside this file, so they ride with the screen.
   ═══════════════════════════════════════════════════════════════════════ */

/* The bundle-d slots, guarded so that rendering this screen alone (a test,
   or a bundle-g that somehow arrived first) degrades to the raw key rather
   than throwing. */
function srcLabel(hlKey) {
  return (typeof _bookmarkSourceLabel === 'function') ? _bookmarkSourceLabel(hlKey) : String(hlKey || 'Bookmark');
}
function srcEndpoint(hlKey) {
  return (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(hlKey) : null;
}

/* ── BookmarkRow component ───────────────────────────────────── */
/**
 * @param {{ key?: any, bkm: any, onNavigate: any, onLongPress: any, editingId: any, onEditStart: any, onEditSave: any, onEditCancel: any }} props
 */
export function BookmarkRow({ bkm, onNavigate, onLongPress, editingId, onEditStart: _onEditStart, onEditSave, onEditCancel }) {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var inputRef = useRef(null);

  var _editState = useState(bkm.label || '');
  var editValue = _editState[0];
  var setEditValue = _editState[1];

  var isEditing = editingId === bkm.id;
  var sourceLabel = srcLabel(bkm.hlKey);
  var date = (typeof relativeDate === 'function') ? relativeDate(bkm.updated || bkm.created) : '';
  var hasThought = !isEditing && bkm.thought && bkm.thought.trim();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot at edit-start: fires only when isEditing flips. bkm.label is read at that moment for the seed; tracking it in deps would clobber in-progress edits if the underlying bookmark mutated externally. setEditValue is a useState setter (identity-stable).
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

  return (
    <div
      className="bkm-row"
      onContextMenu={function(e) { e.preventDefault(); if (onLongPress) onLongPress(bkm, e); }}
    >
      <div
        className={'bkm-row-content' + (isEditing ? ' is-disabled' : '')}
        role="button"
        tabIndex={isEditing ? -1 : 0}
        onClick={function() { if (!isEditing && onNavigate) onNavigate(bkm); }}
        onKeyDown={function(e) {
          if ((e.key === 'Enter' || e.key === ' ') && !isEditing && onNavigate) {
            e.preventDefault(); onNavigate(bkm);
          }
        }}
      >
        <span className="bkm-row-source">{sourceLabel}</span>
        {isEditing
          ? (
            <input
              ref={inputRef}
              className="bkm-row-edit-input"
              type="text"
              value={editValue}
              onChange={function(e) { setEditValue(e.target.value); }}
              onKeyDown={onKeyDown}
              onBlur={commitEdit}
              onClick={function(e) { e.stopPropagation(); }}
              placeholder="Bookmark label"
              maxLength={200}
            />
          )
          : <span className="bkm-row-label">{bkm.label || '(no label)'}</span>
        }
        {hasThought && (typeof JrnExpandable !== 'undefined'
          ? (
            <div className="bkm-row-thought" onClick={function(e) { e.stopPropagation(); }}>
              <JrnExpandable text={bkm.thought} threshold={140} className="bkm-row-thought-body" />
            </div>
          )
          : <span className="bkm-row-thought">{bkm.thought}</span>
        )}
      </div>
      <div className="bkm-row-meta">
        {date && <span className="bkm-row-date">{date}</span>}
        <button
          className="bkm-row-more"
          onClick={function(e) { e.stopPropagation(); if (onLongPress) onLongPress(bkm, e); }}
          title="Options"
          aria-label="Bookmark options"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── BookmarkRowActionSheet ──────────────────────────────────── */
export function BookmarkRowActionSheet({ bkm, onClose, onNavigate, onEditLabel, onDelete }) {
  var useState = React.useState;

  var _state = useState(false);
  var confirming = _state[0];
  var setConfirming = _state[1];
  var trapRef = useFocusTrap(!!bkm);

  if (!bkm) return null;

  var doDelete = function() {
    BookmarkStore.remove(bkm.id);
    onDelete();
    onClose();
  };

  return (
    <div className="link-action-overlay" onClick={onClose}>
      <div className="link-action-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-label="Bookmark actions" onClick={function(e) { e.stopPropagation(); }}>
        <SheetHandle onClose={onClose} />
        {!confirming && (
          <>
            <button className="link-action-btn" onClick={function() { onNavigate(bkm); onClose(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span>Open Bookmark</span>
            </button>
            <button className="link-action-btn" onClick={function() { onEditLabel(bkm.id); onClose(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>Edit Label</span>
            </button>
            <button className="link-action-btn link-action-btn-danger" onClick={function() { setConfirming(true); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              <span>Delete Bookmark</span>
            </button>
          </>
        )}
        {confirming && (
          <ConfirmStrip
            style={{ padding: '14px 12px' }}
            question="Delete this bookmark?"
            onCancel={function() { setConfirming(false); }}
            onConfirm={doDelete}
          />
        )}
      </div>
    </div>
  );
}


/* The sort cycle, in the order the one button steps through it. Each `mode`
   IS a branch of displayBookmarks' comparator; adding a mode to one without
   the other is what produced the dead branches C2-C [C10] found. */
var SORT_CYCLE = [
  { mode: 'recent',    label: 'Sort: Newest ↓' },
  { mode: 'oldest',    label: 'Sort: Oldest ↑' },
  { mode: 'source-az', label: 'Sort: Source A-Z' },
  { mode: 'label-az',  label: 'Sort: Label A-Z' },
];

/* ── BookmarksScreen ─────────────────────────────────────────── */
export function BookmarksScreen(props) {
  var onBack = props.onBack;
  var onNavigateToSource = props.onNavigateToSource;
  var theme = props.theme;
  var onThemeChange = props.onThemeChange;
  var onSearch = props.onSearch;
  var onHistory = props.onHistory;

  // Subscribe to BookmarkStore — re-renders when any bookmark mutates.
  React.useSyncExternalStore(
    React.useCallback(function(cb) { return BookmarkStore.subscribe(cb); }, []),
    function() { return BookmarkStore.getVersion(); }
  );
  // (onHome, historyEnabled props are accepted by the component's API but
  //  this screen doesn't use them — removed local var bindings.)

  var useState = React.useState;
  var useMemo = React.useMemo;

  var _sq = useState('');
  var searchQuery = _sq[0];
  var setSearchQuery = _sq[1];

  var _ss = useState('recent');
  var sortMode = _ss[0];
  var setSortMode = _ss[1];

  // (Pre-Q3.3f-dead: var _sm = useState(false) + showSortMenu/setShowSortMenu
  //  destructure — neither half was referenced. Removed.)
  //
  // C2-C [C10]: 'source-az' and 'label-az' were IMPLEMENTED in the comparator
  // below and unreachable from the UI — the control was a two-state
  // recent/oldest toggle, so half the sort logic was dead weight that read as
  // a finished feature. The toggle becomes a CYCLE over the same one button
  // (the screen's existing control shape — see NotesIndexScreen), so the
  // comparator's four branches and the affordance finally describe each other.
  var nextSort = function() {
    setSortMode(function(m) {
      var i = SORT_CYCLE.findIndex(function(s) { return s.mode === m; });
      return SORT_CYCLE[(i + 1) % SORT_CYCLE.length].mode;
    });
  };
  var sortLabel = (SORT_CYCLE.find(function(s) { return s.mode === sortMode; }) || SORT_CYCLE[0]).label;

  var _as = useState(null);
  var actionTarget = _as[0];
  var setActionTarget = _as[1];

  // W1.5(a.2) — Escape-key dispatch registration for the long-press
  // action sheet rendered at the bottom of this screen.
  useModalRegistry({
    id: 'bookmark-row-action-sheet',
    dismiss: function() { setActionTarget(null); },
    active: !!actionTarget,
  });

  var _ei = useState(null);
  var editingId = _ei[0];
  var setEditingId = _ei[1];

  var allBookmarks = BookmarkStore.all().slice();

  var displayBookmarks = useMemo(function() {
    var q = searchQuery.trim().toLowerCase();
    var filtered = q
      ? allBookmarks.filter(function(bkm) {
          var source = srcLabel(bkm.hlKey).toLowerCase();
          var label = (bkm.label || '').toLowerCase();
          return label.includes(q) || source.includes(q);
        })
      : allBookmarks.slice();

    filtered.sort(function(a, b) {
      if (sortMode === 'oldest') return (a.created || 0) - (b.created || 0);
      if (sortMode === 'source-az') {
        var la = srcLabel(a.hlKey).toLowerCase();
        var lb = srcLabel(b.hlKey).toLowerCase();
        return la < lb ? -1 : la > lb ? 1 : 0;
      }
      if (sortMode === 'label-az') {
        var xa = (a.label || '').toLowerCase();
        var xb = (b.label || '').toLowerCase();
        return xa < xb ? -1 : xa > xb ? 1 : 0;
      }
      return (b.updated || b.created || 0) - (a.updated || a.created || 0);
    });
    return filtered;
  }, [allBookmarks, searchQuery, sortMode]);

  // (Pre-Q3.3f-dead: var sortLabels = {...} — defined but never referenced.)

  var navigateToBookmark = function(bkm) {
    var endpoint = srcEndpoint(bkm.hlKey);
    if (!endpoint) return;
    if (typeof onNavigateToSource === 'function') {
      onNavigateToSource(endpoint, { sourceLetterTitle: 'My Bookmarks' });
    }
  };

  var onDeleteDone = function() {};

  var onEditSave = function(id, newLabel) {
    BookmarkStore.update(id, { label: newLabel });
    setEditingId(null);
  };

  var navChildren = LibraryNav({
    onBack: onBack, onSearch: onSearch, onHistory: onHistory,
    onSettings: props.onSettings,
    theme: theme, onThemeChange: onThemeChange
  });

  return (
    <ScreenLayout navChildren={navChildren}>
      <div className="bkm-screen">
        <div className="notes-index-header">
          <h1 className="notes-index-title">My Bookmarks</h1>
          <span className="notes-index-count">
            {allBookmarks.length}
            {allBookmarks.length === 1 ? ' bookmark' : ' bookmarks'}
          </span>
        </div>

        <input
          className="notes-index-search"
          type="search"
          placeholder="Search bookmarks…"
          value={searchQuery}
          onChange={function(e) { setSearchQuery(e.target.value); }}
        />

        <div className="notes-index-controls" style={{ marginTop: '0.7rem' }}>
          <button
            className="notes-index-sort-btn"
            style={{ marginLeft: 'auto' }}
            onClick={nextSort}
            title="Cycle sort order"
          >
            {sortLabel}
          </button>
        </div>

        {allBookmarks.length === 0 && (
          <div className="notes-empty">
            <div className="notes-empty-title">No Bookmarks Yet</div>
            <div className="notes-empty-hint">
              Select text in any letter or Bible chapter, then tap Bookmark in the toolbar. Your bookmarks will appear here.
            </div>
          </div>
        )}

        {allBookmarks.length > 0 && displayBookmarks.length === 0 && (
          <div className="notes-empty">
            <div className="notes-empty-title">No Matches</div>
            <div className="notes-empty-hint">Try a different search term.</div>
          </div>
        )}

        {displayBookmarks.length > 0 && (
          <div className="notes-index-list" style={{ marginTop: '0.75rem' }}>
            {displayBookmarks.map(function(bkm) {
              return (
                <BookmarkRow
                  key={bkm.id}
                  bkm={bkm}
                  onNavigate={navigateToBookmark}
                  onLongPress={function(b) { setActionTarget(b); }}
                  editingId={editingId}
                  onEditStart={function(id) { setEditingId(id); }}
                  onEditSave={onEditSave}
                  onEditCancel={function() { setEditingId(null); }}
                />
              );
            })}
          </div>
        )}

        {actionTarget && (
          <BookmarkRowActionSheet
            bkm={actionTarget}
            onClose={function() { setActionTarget(null); }}
            onNavigate={function(bkm) { navigateToBookmark(bkm); setActionTarget(null); }}
            onEditLabel={function(id) { setEditingId(id); setActionTarget(null); }}
            onDelete={onDeleteDone}
          />
        )}
      </div>
    </ScreenLayout>
  );
}
