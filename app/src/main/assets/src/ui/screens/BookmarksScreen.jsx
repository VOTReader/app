/* ═══════════════════════════════════════════════════════════════════════
   BookmarksScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Source label for a bookmark ─────────────────────────────── */
export function _bookmarkSourceLabel(hlKey) {
  if (!hlKey) return 'Bookmark';
  var parts = hlKey.split(':');
  var kind = parts[0];

  if (kind === 'bible') {
    var bookId = parts[1];
    var chap = parts[2];
    var verse = parts[3];
    let title = (typeof _bookTitle === 'function') ? _bookTitle(bookId) : bookId;
    return verse ? (title + ' ' + chap + ':' + verse) : (title + ' ' + chap);
  }

  if (kind === 'study') {
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
  if (kind === 'journal') {
    var eid = parts[1];
    var je = (typeof JournalStore !== 'undefined') ? JournalStore.get(eid) : null;
    if (je) {
      let title = (typeof JournalHelpers !== 'undefined' && JournalHelpers.entryDisplayTitle)
        ? (JournalHelpers.entryDisplayTitle(je) || 'Untitled')
        : (je.title || 'Untitled');
      return 'Journal · ' + title;
    }
    return 'Journal Entry';
  }

  return hlKey;
}

export function _bookmarkSourceEndpoint(hlKey) {
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
  if (kind === 'journal') {
    return { type: 'journal', key: hlKey, entryId: parts[1], screen: 'journal-viewer' };
  }
  return null;
}

/* ── BookmarkRow component ───────────────────────────────────── */
export function BookmarkRow({ bkm, onNavigate, onLongPress, editingId, onEditStart: _onEditStart, onEditSave, onEditCancel }) {
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
export function BookmarkRowActionSheet({ bkm, onClose, onNavigate, onEditLabel, onEditThought, onDelete }) {
  var useState = React.useState;

  var _state = useState(false);
  var confirming = _state[0];
  var setConfirming = _state[1];

  var _te = useState(false); var editingThought = _te[0]; var setEditingThought = _te[1];
  var _tt = useState(''); var thoughtText = _tt[0]; var setThoughtText = _tt[1];

  if (!bkm) return null;
  var hasThought = !!(bkm.thought && bkm.thought.trim());

  function startEditThought() {
    setThoughtText(bkm.thought || '');
    setEditingThought(true);
    setConfirming(false);
  }
  function saveThought() {
    BookmarkStore.update(bkm.id, { thought: thoughtText });
    if (typeof onEditThought === 'function') onEditThought();
    setEditingThought(false);
    onClose();
  }
  function cancelEditThought() {
    setEditingThought(false);
    setThoughtText('');
  }

  var doDelete = function() {
    BookmarkStore.remove(bkm.id);
    onDelete();
    onClose();
  };

  return (
    <div className="link-action-overlay" onClick={onClose}>
      <div className="link-action-sheet" onClick={function(e) { e.stopPropagation(); }}>
        <div className="link-action-handle" />
        {!confirming && !editingThought && (
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
            <button className="link-action-btn" onClick={startEditThought}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span>{hasThought ? 'Edit Thought' : 'Add Thought'}</span>
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
        {editingThought && !confirming && (
          <div className="bkm-action-thought-edit">
            <div className="bkm-action-thought-prompt">Why did you bookmark this?</div>
            <textarea
              className="bkm-popover-thought-textarea"
              autoFocus
              value={thoughtText}
              placeholder="A few words for your future self…"
              onChange={function(e) { setThoughtText(e.target.value); }}
              onKeyDown={function(e) {
                if (e.key === 'Escape') { e.preventDefault(); cancelEditThought(); }
              }}
            />
            <div className="bkm-action-thought-actions">
              <button className="link-action-btn" onClick={cancelEditThought}><span>Cancel</span></button>
              <button className="link-action-btn" onClick={saveThought} style={{ color: 'var(--gold)' }}><span>Save</span></button>
            </div>
          </div>
        )}
        {confirming && (
          <div className="ann-chip-confirm" style={{ padding: '14px 12px' }}>
            <span className="ann-chip-confirm-q">Delete this bookmark?</span>
            <button className="ann-chip-confirm-btn ann-chip-confirm-cancel" onClick={function() { setConfirming(false); }}>Cancel</button>
            <button className="ann-chip-confirm-btn ann-chip-confirm-yes" onClick={doDelete}>Yes, delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── BookmarkPopover ─────────────────────────────────────────── */
export function BookmarkPopover({ bkmIds, x, y, onClose, onNavigate, onDeleteDone }) {
  var useState = React.useState;
  var _ci = useState(null); var confirmingId = _ci[0]; var setConfirmingId = _ci[1];
  var _ei = useState(null); var editingId = _ei[0]; var setEditingId = _ei[1];
  var _et = useState(''); var editText = _et[0]; var setEditText = _et[1];
  var _tick = useState(0); var setTick = _tick[1]; // value unread; setter forces re-render
  function bump() { setTick(function(t) { return t + 1; }); }

  if (!bkmIds || !bkmIds.length) return null;
  var bookmarks = bkmIds.map(function(id) { return BookmarkStore.get(id); }).filter(Boolean);
  if (!bookmarks.length) { onClose(); return null; }

  function doDelete(bkm) {
    BookmarkStore.remove(bkm.id);
    onDeleteDone && onDeleteDone();
    if (bookmarks.length <= 1) onClose();
    else setConfirmingId(null);
  }
  function startEditThought(bkm) {
    setEditingId(bkm.id);
    setEditText(bkm.thought || '');
    setConfirmingId(null);
  }
  function saveThought(bkm) {
    BookmarkStore.update(bkm.id, { thought: editText });
    setEditingId(null);
    bump();
  }
  function cancelEditThought() {
    setEditingId(null);
    setEditText('');
  }

  var popX = Math.max(8, Math.min(x - 80, window.innerWidth - 320));
  var popY = Math.max(8, y);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 8800 }} onClick={onClose} />
      <div
        className="bkm-popover"
        style={{ left: popX, top: popY, zIndex: 8801 }}
        onClick={function(e) { e.stopPropagation(); }}
      >
        {bookmarks.map(function(bkm) {
          var isConfirming = confirmingId === bkm.id;
          var isEditing = editingId === bkm.id;
          var dateStr = (typeof relativeDate === 'function') ? relativeDate(bkm.created) : '';
          var hasThought = !!(bkm.thought && bkm.thought.trim().length);

          return (
            <div key={bkm.id} className="bkm-popover-item">
              {!isConfirming && !isEditing && (
                <>
                  <div className="bkm-popover-label">{bkm.label || '(no label)'}</div>
                  {dateStr && <div className="bkm-popover-date">{dateStr}</div>}
                  {hasThought && <div className="bkm-popover-thought">{bkm.thought}</div>}
                  <div className="bkm-popover-actions">
                    <button className="bkm-popover-btn" onClick={function() { onNavigate(bkm); onClose(); }}>Open</button>
                    <button className="bkm-popover-btn" onClick={function() { startEditThought(bkm); }}>
                      {hasThought ? 'Edit Thought' : 'Add Thought'}
                    </button>
                    <button className="bkm-popover-btn bkm-popover-btn-danger" onClick={function() { setConfirmingId(bkm.id); }}>Delete</button>
                  </div>
                </>
              )}
              {isEditing && (
                <div className="bkm-popover-thought-edit">
                  <div className="bkm-popover-label">{bkm.label || '(no label)'}</div>
                  <textarea
                    className="bkm-popover-thought-textarea"
                    autoFocus
                    value={editText}
                    placeholder="Why did you bookmark this?"
                    onChange={function(e) { setEditText(e.target.value); }}
                    onKeyDown={function(e) {
                      if (e.key === 'Escape') { e.preventDefault(); cancelEditThought(); }
                    }}
                  />
                  <div className="bkm-popover-actions">
                    <button className="bkm-popover-btn" onClick={cancelEditThought}>Cancel</button>
                    <button className="bkm-popover-btn bkm-popover-btn-primary" onClick={function() { saveThought(bkm); }}>Save</button>
                  </div>
                </div>
              )}
              {isConfirming && (
                <div className="ann-chip-confirm" style={{ padding: '8px 10px' }}>
                  <span className="ann-chip-confirm-q">Delete this bookmark?</span>
                  <button className="ann-chip-confirm-btn ann-chip-confirm-cancel" onClick={function() { setConfirmingId(null); }}>Cancel</button>
                  <button className="ann-chip-confirm-btn ann-chip-confirm-yes" onClick={function() { doDelete(bkm); }}>Yes, delete</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── BookmarksScreen ─────────────────────────────────────────── */
export function BookmarksScreen(props) {
  var onBack = props.onBack;
  var onNavigateToSource = props.onNavigateToSource;
  var hlTick = props.hlTick;
  var setHlTick = props.setHlTick;
  var theme = props.theme;
  var onThemeChange = props.onThemeChange;
  var onSearch = props.onSearch;
  var onHistory = props.onHistory;
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

  var _as = useState(null);
  var actionTarget = _as[0];
  var setActionTarget = _as[1];

  var _ei = useState(null);
  var editingId = _ei[0];
  var setEditingId = _ei[1];

  var allBookmarks = useMemo(function() {
    return BookmarkStore.all().slice();
  }, [hlTick]);

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
      return (b.updated || b.created || 0) - (a.updated || a.created || 0);
    });
    return filtered;
  }, [allBookmarks, searchQuery, sortMode]);

  // (Pre-Q3.3f-dead: var sortLabels = {...} — defined but never referenced.)

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
            onClick={function() { setSortMode(function(m) { return m === 'oldest' ? 'recent' : 'oldest'; }); }}
            title="Toggle sort order"
          >
            {sortMode === 'oldest' ? 'Sort: Oldest ↑' : 'Sort: Newest ↓'}
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
            onEditThought={function() { if (setHlTick) setHlTick(function(t){ return t + 1; }); }}
            onDelete={onDeleteDone}
          />
        )}
      </div>
    </ScreenLayout>
  );
}
