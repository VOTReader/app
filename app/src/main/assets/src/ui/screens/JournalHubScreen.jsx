/* ═══════════════════════════════════════════════════════════════════════
   JournalHubScreen — Cluster B (esbuild bundle-b.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function JournalCardMenu(props) {
  var useState = React.useState;
  var entry = props.entry;
  var _step = useState(0);
  var step = _step[0]; var setStep = _step[1];
  var _typed = useState('');
  var typed = _typed[0]; var setTyped = _typed[1];
  if (!entry) return null;

  function close() { props.onClose && props.onClose(); }

  return (
    <div className="link-action-overlay" onClick={close}>
      <div className="link-action-sheet" onClick={function(e) { e.stopPropagation(); }}>
        <div className="link-action-handle" />
        {step === 0 && (
          <>
            <button className="link-action-btn" onClick={function() { close(); props.onOpen(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Open Entry</span>
            </button>
            <button className="link-action-btn" onClick={function() { close(); props.onEdit(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
              </svg>
              <span>Edit Entry</span>
            </button>
            <button className="link-action-btn" onClick={function() { props.onTogglePin(); close(); }}>
              <svg viewBox="0 0 24 24" fill={entry.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z" />
                <path d="M8 12 L3 19" />
              </svg>
              <span>{entry.pinned ? 'Unpin Entry' : 'Pin Entry'}</span>
            </button>
            <button className="link-action-btn link-action-btn-danger" onClick={function() { setStep(1); setTyped(''); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
              <span>Delete Entry</span>
            </button>
          </>
        )}
        {step > 0 && (
          <div className="jrn-tripledel" style={{ margin: '6px 4px 4px' }}>
            <div className="jrn-tripledel-step-label">{'Step ' + step + ' of 3'}</div>
            <div className="jrn-tripledel-question">
              {step === 1 ? 'Delete this entry?'
                : step === 2 ? 'Are you sure? This cannot be undone.'
                : 'Type DELETE to permanently remove this entry.'}
            </div>
            {(function () {
              var summary = (typeof JournalStore !== 'undefined' && JournalStore.associatedDataSummary)
                ? JournalStore.associatedDataSummary(entry.id) : null;
              return summary && (
                <div className="jrn-tripledel-cascade">
                  {'This will also permanently delete ' + summary + ' you placed inside this entry.'}
                </div>
              );
            })()}
            {step === 3 && (
              <input
                type="text"
                className="jrn-tripledel-input"
                placeholder="Type DELETE"
                value={typed}
                autoFocus
                onChange={function(e) { setTyped(e.target.value); }}
              />
            )}
            <div className="jrn-tripledel-actions">
              <button className="jrn-tripledel-cancel" onClick={function() { setStep(0); setTyped(''); }}>Cancel</button>
              {step < 3 && (
                <button className="jrn-tripledel-next" onClick={function() { setStep(step + 1); }}>
                  {step === 1 ? 'Continue' : 'I am sure'}
                </button>
              )}
              {step === 3 && (
                <button
                  className="jrn-tripledel-final"
                  disabled={typed.trim().toUpperCase() !== 'DELETE'}
                  onClick={function() { props.onDelete(); close(); }}
                >
                  Delete forever
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function JournalHubScreen(props) {
  var useState = React.useState;

  var onBack = props.onBack;
  var onOpenEntry = props.onOpenEntry;
  var onEditEntry = props.onEditEntry;
  var onCreateEntry = props.onCreateEntry;

  // Subscribe to JournalStore — hub re-renders on any entry mutation.
  React.useSyncExternalStore(
    React.useCallback(function(cb) { return JournalStore.subscribe(cb); }, []),
    function() { return JournalStore.getVersion(); }
  );

  var _tab = useState('all');
  var tab = _tab[0]; var setTab = _tab[1];

  var _q = useState('');
  var query = _q[0]; var setQuery = _q[1];

  var _sortNewest = useState(true);
  var sortNewest = _sortNewest[0]; var setSortNewest = _sortNewest[1];

  var _menuEntry = useState(null);
  var menuEntry = _menuEntry[0]; var setMenuEntry = _menuEntry[1];

  var allEntries = JournalStore.all();

  function bump() { if (window.__bumpHlTick) window.__bumpHlTick(); }

  function deleteEntry(id) { JournalStore.remove(id); bump(); }
  function togglePin(id) { JournalStore.togglePin(id); bump(); }

  // ─── Entry card render ─────────────────────────────────────
  function renderCard(entry) {
    var title = JournalHelpers.entryDisplayTitle(entry);
    var preview = JournalHelpers.previewText(entry, 160);
    var attachments = JournalHelpers.attachmentSummary(entry);
    var moodClass = entry.mood ? entry.mood : '';

    return (
      <div
        key={entry.id}
        className={'jrn-card' + (entry.pinned ? ' pinned' : '')}
        role="button"
        tabIndex={0}
        onClick={function(e) {
          if (e.target.closest && e.target.closest('.jrn-card-menu-btn')) return;
          onOpenEntry && onOpenEntry(entry.id);
        }}
        onKeyDown={function(e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenEntry(entry.id); }
        }}
      >
        <span className={'jrn-card-mood ' + moodClass} />
        {entry.pinned && (
          <div className="jrn-card-pin-marker" title="Pinned">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z" />
              <path d="M8 12 L3 19" />
            </svg>
          </div>
        )}
        <button
          className="jrn-card-menu-btn"
          onClick={function(e) { e.stopPropagation(); setMenuEntry(entry); }}
          aria-label="Entry options"
          title="Options"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
        <div className="jrn-card-row">
          <h3 className={'jrn-card-title' + (title ? '' : ' untitled')}>{title || 'Untitled'}</h3>
          <span className="jrn-card-date">
            {JournalHelpers.shortDate(entry.updated || entry.created)}
            <span className="jrn-card-time">{' · ' + JournalHelpers.shortTime(entry.updated || entry.created)}</span>
          </span>
        </div>
        {preview && <p className="jrn-card-preview">{preview}</p>}
        {attachments.length > 0 && (
          <div className="jrn-card-attachments">
            {attachments.map(function(a, i) {
              return <span key={i} className="jrn-attach">{a.label}</span>;
            })}
          </div>
        )}
        {entry.tags && entry.tags.length > 0 && (
          <div className="jrn-card-meta">
            <div className="jrn-tags">
              {entry.tags.slice(0, 4).map(function(t, i) {
                return <span key={i} className="jrn-tag">{'#' + t}</span>;
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── All-entries / Pinned tabs ──────────────────────────────
  function renderEntries(list, isPinnedTab) {
    var q = query.trim().toLowerCase();
    var filtered = q ? list.filter(function(e) {
      if ((e.title || '').toLowerCase().indexOf(q) >= 0) return true;
      var preview = JournalHelpers.previewText(e, 400).toLowerCase();
      if (preview.indexOf(q) >= 0) return true;
      if (e.tags && e.tags.join(' ').toLowerCase().indexOf(q) >= 0) return true;
      return false;
    }) : list;
    filtered = filtered.slice().sort(function(a, b) {
      var ad = a.updated || a.created || 0;
      var bd = b.updated || b.created || 0;
      if (ad !== bd) return sortNewest ? (bd - ad) : (ad - bd);
      if (a.id === b.id) return 0;
      var cmp = a.id < b.id ? -1 : 1;
      return sortNewest ? cmp : -cmp;
    });

    return (
      <>
        <div className="jrn-controls">
          <input
            className="jrn-search"
            type="text"
            placeholder="Search entries…"
            value={query}
            onChange={function(e) { setQuery(e.target.value); }}
          />
          <button
            className="notes-index-sort-btn"
            onClick={function() { setSortNewest(function(v) { return !v; }); }}
            title="Toggle sort order"
          >
            {sortNewest ? 'Sort: Newest ↓' : 'Sort: Oldest ↑'}
          </button>
        </div>
        {filtered.length === 0 ? (
          <div className="jrn-empty">
            <div className="jrn-empty-title">
              {isPinnedTab
                ? (list.length === 0 ? 'No Pinned Entries' : 'No Matches')
                : (list.length === 0 ? 'No Entries Yet' : 'No Matches')}
            </div>
            <div className="jrn-empty-hint">
              {isPinnedTab && list.length === 0
                ? 'Pin your favorite or most-used journal entries here to access them easily.'
                : list.length === 0
                  ? 'Tap "New Entry" below to write your first reflection. You can embed letters, bookmarks, images, and voice recordings.'
                  : 'Try a different search term.'}
            </div>
          </div>
        ) : (
          <div className="jrn-list">{filtered.map(renderCard)}</div>
        )}
      </>
    );
  }

  var navChildren = LibraryNav({
    onBack: onBack, onSearch: props.onSearch, onHistory: props.onHistory,
    onSettings: props.onSettings,
    theme: props.theme, onThemeChange: props.onThemeChange
  });

  var pinnedEntries = allEntries.filter(function(e) { return e.pinned; });

  return (
    <ScreenLayout navChildren={navChildren}>
      <div className="jrn-hub">
        <div className="jrn-hub-header">
          <h1 className="jrn-hub-title">My Journal</h1>
          <span className="jrn-hub-count">{allEntries.length + (allEntries.length === 1 ? ' entry' : ' entries')}</span>
        </div>
        <div className="jrn-tabs">
          <button className={'jrn-tab' + (tab === 'all' ? ' active' : '')} onClick={function() { setTab('all'); }}>All Entries</button>
          <button className={'jrn-tab' + (tab === 'pinned' ? ' active' : '')} onClick={function() { setTab('pinned'); }}>Pinned</button>
        </div>
        {tab === 'all' && renderEntries(allEntries, false)}
        {tab === 'pinned' && renderEntries(pinnedEntries, true)}
        <button
          className="jrn-fab jrn-fab-newentry"
          onClick={function() { onCreateEntry && onCreateEntry(); }}
          title="New Entry"
          aria-label="New Entry"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
          </svg>
          <span className="jrn-fab-newentry-label">New Entry</span>
        </button>
        {menuEntry && (
          <JournalCardMenu
            entry={menuEntry}
            onClose={function() { setMenuEntry(null); }}
            onOpen={function() { onOpenEntry && onOpenEntry(menuEntry.id); }}
            onEdit={function() { onEditEntry ? onEditEntry(menuEntry.id) : (onOpenEntry && onOpenEntry(menuEntry.id)); }}
            onTogglePin={function() { togglePin(menuEntry.id); }}
            onDelete={function() { deleteEntry(menuEntry.id); }}
          />
        )}
      </div>
    </ScreenLayout>
  );
}
