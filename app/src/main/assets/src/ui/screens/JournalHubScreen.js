/* ═══════════════════════════════════════════════════════════════
   JOURNAL HUB SCREEN — entry list + stats + notebooks
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, ScreenLayout, ThemeBtn, JournalStore,
     JournalStatsStore, JournalNotebookStore, JournalHelpers.

   Three tabs:
     - All Entries: flat chronological list
     - Notebooks: card grid (Uncategorized + user notebooks + New)
     - Pinned: filtered list of pinned entries

   FAB creates a new entry and opens the editor.

   Props:
     onBack()
     onOpenEntry(entryId)
     onCreateEntry()         — opens editor with a fresh entry pre-created
     onSearch()
     onHistory()
     historyEnabled
     hlTick                  — bump signal to recompute
     setHlTick               — caller's setter, bumped on store mutations
     theme, onThemeChange
═══════════════════════════════════════════════════════════════ */

function JournalHubScreen(props) {
  var useState = React.useState;
  var useMemo = React.useMemo;
  var useEffect = React.useEffect;

  var onBack = props.onBack;
  var onOpenEntry = props.onOpenEntry;
  var onCreateEntry = props.onCreateEntry;
  var hlTick = props.hlTick;
  var setHlTick = props.setHlTick;

  var _tab = useState('all');           // 'all' | 'notebooks' | 'pinned'
  var tab = _tab[0]; var setTab = _tab[1];

  var _drilled = useState(null);        // notebook id (or 'uncategorized') we've drilled into
  var drilled = _drilled[0]; var setDrilled = _drilled[1];

  var _q = useState('');
  var query = _q[0]; var setQuery = _q[1];

  var _sortNewest = useState(true);
  var sortNewest = _sortNewest[0]; var setSortNewest = _sortNewest[1];

  var _newNbInline = useState(false);
  var newNbInline = _newNbInline[0]; var setNewNbInline = _newNbInline[1];
  var _newNbName = useState('');
  var newNbName = _newNbName[0]; var setNewNbName = _newNbName[1];

  var _renaming = useState(null);
  var renaming = _renaming[0]; var setRenaming = _renaming[1];
  var _renameVal = useState('');
  var renameVal = _renameVal[0]; var setRenameVal = _renameVal[1];

  var _confirmDel = useState(null);
  var confirmDel = _confirmDel[0]; var setConfirmDel = _confirmDel[1];

  // Streak recompute on mount (in case a day was missed)
  useEffect(function() {
    if (typeof JournalStatsStore !== 'undefined') JournalStatsStore.recomputeFromLoad();
  }, []);

  var allEntries = useMemo(function() {
    return JournalStore.all();
  }, [hlTick]);

  var stats = useMemo(function() {
    return JournalStatsStore.get();
  }, [hlTick]);

  var milestones = useMemo(function() {
    return JournalStatsStore.unlockedMilestones();
  }, [hlTick]);

  var notebooks = useMemo(function() {
    return JournalNotebookStore.list();
  }, [hlTick]);

  // Notebook entry counts
  var notebookCounts = useMemo(function() {
    var counts = { uncategorized: 0 };
    notebooks.forEach(function(nb) { counts[nb.id] = 0; });
    allEntries.forEach(function(e) {
      var nbIds = e.notebookIds || [];
      if (nbIds.length === 0) counts.uncategorized++;
      else nbIds.forEach(function(id) { if (counts[id] != null) counts[id]++; });
    });
    return counts;
  }, [allEntries, notebooks]);

  function bump() { if (setHlTick) setHlTick(function(t) { return t + 1; }); }

  // ─── Entry card render ─────────────────────────────────────
  function renderCard(entry) {
    var title = JournalHelpers.entryDisplayTitle(entry);
    var preview = JournalHelpers.previewText(entry, 160);
    var attachments = JournalHelpers.attachmentSummary(entry);
    var moodClass = entry.mood ? entry.mood : '';
    var nbNames = (entry.notebookIds || [])
      .map(function(id) { var n = JournalNotebookStore.get(id); return n ? n.name : null; })
      .filter(Boolean)
      .slice(0, 2);

    return React.createElement('div', {
      key: entry.id,
      className: 'jrn-card' + (entry.pinned ? ' pinned' : ''),
      role: 'button',
      tabIndex: 0,
      onClick: function() { onOpenEntry && onOpenEntry(entry.id); },
      onKeyDown: function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenEntry(entry.id); } }
    },
      React.createElement('span', { className: 'jrn-card-mood ' + moodClass }),
      React.createElement('div', { className: 'jrn-card-row' },
        React.createElement('h3', { className: 'jrn-card-title' + (title ? '' : ' untitled') }, title || 'Untitled'),
        React.createElement('span', { className: 'jrn-card-date' }, JournalHelpers.shortDate(entry.updated || entry.created))
      ),
      preview && React.createElement('p', { className: 'jrn-card-preview' }, preview),
      attachments.length > 0 && React.createElement('div', { className: 'jrn-card-attachments' },
        attachments.map(function(a, i) {
          return React.createElement('span', { key: i, className: 'jrn-attach' }, a.label);
        })
      ),
      (nbNames.length > 0 || (entry.tags && entry.tags.length)) && React.createElement('div', { className: 'jrn-card-meta' },
        nbNames.length > 0 && React.createElement('span', null, nbNames.join(', ')),
        nbNames.length > 0 && entry.tags && entry.tags.length > 0 && React.createElement('span', { className: 'jrn-card-meta-sep' }, '·'),
        entry.tags && entry.tags.length > 0 && React.createElement('div', { className: 'jrn-tags' },
          entry.tags.slice(0, 4).map(function(t, i) { return React.createElement('span', { key: i, className: 'jrn-tag' }, '#' + t); })
        )
      )
    );
  }

  // ─── Stats strip ────────────────────────────────────────────
  function renderStats() {
    return React.createElement('div', { className: 'jrn-stats' },
      React.createElement('div', { className: 'jrn-stats-streak' },
        React.createElement('div', { className: 'jrn-stats-flame' },
          React.createElement('svg', { viewBox: '0 0 24 24' },
            React.createElement('path', { d: 'M12 2c-1 2-2 3-2 5 0 1 1 2 2 2-2 1-4 3-4 6 0 4 3 7 6 7s6-3 6-7c0-3-2-5-4-6 1 0 2-1 2-2 0-2-2-3-3-5-1 1-2 0-3 0z' })
          )
        ),
        React.createElement('span', { className: 'jrn-stats-value' }, (stats.currentStreak || 0) + (stats.currentStreak === 1 ? ' day' : ' days')),
        stats.longestStreak > 0 && React.createElement(React.Fragment, null,
          React.createElement('span', { className: 'jrn-stats-sep' }, '·'),
          React.createElement('span', { className: 'jrn-stats-meta' }, 'longest: ' + stats.longestStreak)
        )
      ),
      milestones.length > 0 && React.createElement('div', { className: 'jrn-stats-milestones' },
        milestones.map(function(m) {
          return React.createElement('span', { key: m.key, className: 'jrn-badge' }, m.label);
        })
      )
    );
  }

  // ─── Notebooks tab ──────────────────────────────────────────
  function renderNotebooks() {
    if (drilled) return renderDrilled();

    return React.createElement('div', null,
      React.createElement('div', { className: 'jrn-nb-grid' },
        // Uncategorized always-first
        React.createElement('div', {
          className: 'jrn-nb-card uncategorized',
          role: 'button',
          onClick: function() { setDrilled('uncategorized'); }
        },
          React.createElement('div', { className: 'jrn-nb-eyebrow' }, 'Default'),
          React.createElement('div', { className: 'jrn-nb-title' }, 'Uncategorized'),
          React.createElement('div', { className: 'jrn-nb-count' }, (notebookCounts.uncategorized || 0) + (notebookCounts.uncategorized === 1 ? ' entry' : ' entries'))
        ),
        // User notebooks
        notebooks.map(function(nb) {
          return React.createElement('div', {
            key: nb.id,
            className: 'jrn-nb-card',
            role: 'button',
            onClick: function() { setDrilled(nb.id); }
          },
            React.createElement('div', { className: 'jrn-nb-eyebrow' }, 'Notebook'),
            React.createElement('div', { className: 'jrn-nb-title' }, nb.name),
            React.createElement('div', { className: 'jrn-nb-count' }, (notebookCounts[nb.id] || 0) + ((notebookCounts[nb.id] || 0) === 1 ? ' entry' : ' entries'))
          );
        }),
        // New notebook tile
        newNbInline
          ? React.createElement('div', { className: 'jrn-nb-card new', style: { gap: '8px', justifyContent: 'center', flexDirection: 'column' } },
              React.createElement('input', {
                className: 'jrn-rename-input',
                autoFocus: true, type: 'text', placeholder: 'Notebook name', value: newNbName,
                onChange: function(e) { setNewNbName(e.target.value); },
                onClick: function(e) { e.stopPropagation(); },
                onKeyDown: function(e) {
                  if (e.key === 'Enter') { e.preventDefault(); commitNewNb(); }
                  if (e.key === 'Escape') { setNewNbInline(false); setNewNbName(''); }
                }
              }),
              React.createElement('div', { style: { display: 'flex', gap: '6px', justifyContent: 'center' } },
                React.createElement('button', { className: 'jrn-nb-action', onClick: function(e) { e.stopPropagation(); setNewNbInline(false); setNewNbName(''); } }, 'Cancel'),
                React.createElement('button', { className: 'jrn-nb-action', onClick: function(e) { e.stopPropagation(); commitNewNb(); }, disabled: !newNbName.trim() }, 'Create')
              )
            )
          : React.createElement('div', {
              className: 'jrn-nb-card new',
              role: 'button',
              onClick: function() { setNewNbInline(true); }
            },
              React.createElement('div', { className: 'plus' }, '+'),
              React.createElement('div', { className: 'label' }, 'New Notebook')
            )
      )
    );
  }

  function commitNewNb() {
    var trimmed = newNbName.trim();
    if (!trimmed) return;
    JournalNotebookStore.add(trimmed);
    setNewNbName('');
    setNewNbInline(false);
    bump();
  }

  // ─── Drilled-in notebook view ───────────────────────────────
  function renderDrilled() {
    var nb = drilled === 'uncategorized' ? null : JournalNotebookStore.get(drilled);
    if (drilled !== 'uncategorized' && !nb) {
      // Notebook was deleted — bail back
      setDrilled(null);
      return null;
    }
    var nbEntries = allEntries.filter(function(e) {
      if (drilled === 'uncategorized') return !(e.notebookIds && e.notebookIds.length);
      return (e.notebookIds || []).indexOf(drilled) >= 0;
    });
    nbEntries.sort(function(a, b) {
      return sortNewest
        ? (b.updated || b.created || 0) - (a.updated || a.created || 0)
        : (a.created || 0) - (b.created || 0);
    });

    var title = drilled === 'uncategorized' ? 'Uncategorized' : nb.name;

    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'jrn-nb-drill-header' },
        React.createElement('button', { className: 'jrn-nb-action', onClick: function() { setDrilled(null); setRenaming(null); setConfirmDel(null); } }, '‹ Back'),
        renaming === drilled
          ? React.createElement('input', {
              className: 'jrn-rename-input', autoFocus: true, type: 'text', value: renameVal,
              onChange: function(e) { setRenameVal(e.target.value); },
              onBlur: function() { commitRename(); },
              onKeyDown: function(e) {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') { setRenaming(null); }
              },
              style: { flex: 1 }
            })
          : React.createElement('div', { className: 'jrn-nb-drill-title' }, title),
        drilled !== 'uncategorized' && renaming !== drilled && React.createElement('button', { className: 'jrn-nb-action', onClick: function() { setRenameVal(nb.name); setRenaming(drilled); } }, 'Rename'),
        drilled !== 'uncategorized' && React.createElement('button', { className: 'jrn-nb-action danger', onClick: function() { setConfirmDel(drilled); } }, 'Delete')
      ),
      confirmDel === drilled && React.createElement('div', { className: 'jrn-inline-confirm' },
        React.createElement('span', { className: 'jrn-inline-confirm-q' }, 'Delete "', nb.name, '"? Entries will move to Uncategorized.'),
        React.createElement('button', { onClick: function() { setConfirmDel(null); } }, 'Cancel'),
        React.createElement('button', { className: 'danger', onClick: function() { JournalNotebookStore.remove(drilled); setDrilled(null); setConfirmDel(null); bump(); } }, 'Yes, delete')
      ),
      React.createElement('div', { className: 'jrn-controls' },
        React.createElement('button', { className: 'jrn-sort-btn', onClick: function() { setSortNewest(function(v) { return !v; }); } }, sortNewest ? 'Newest first ↓' : 'Oldest first ↑')
      ),
      nbEntries.length === 0
        ? React.createElement('div', { className: 'jrn-empty' },
            React.createElement('div', { className: 'jrn-empty-title' }, 'No Entries Yet'),
            React.createElement('div', { className: 'jrn-empty-hint' }, drilled === 'uncategorized' ? 'Every new entry starts here until you assign it a notebook.' : 'Add entries to this notebook from the editor.')
          )
        : React.createElement('div', { className: 'jrn-list' }, nbEntries.map(renderCard))
    );
  }

  function commitRename() {
    var v = renameVal.trim();
    if (v && drilled !== 'uncategorized') {
      JournalNotebookStore.rename(drilled, v);
      bump();
    }
    setRenaming(null);
  }

  // ─── All-entries / Pinned tabs ──────────────────────────────
  function renderEntries(list) {
    var q = query.trim().toLowerCase();
    var filtered = q ? list.filter(function(e) {
      if ((e.title || '').toLowerCase().indexOf(q) >= 0) return true;
      var preview = JournalHelpers.previewText(e, 400).toLowerCase();
      if (preview.indexOf(q) >= 0) return true;
      if (e.tags && e.tags.join(' ').toLowerCase().indexOf(q) >= 0) return true;
      return false;
    }) : list;
    filtered = filtered.slice().sort(function(a, b) {
      return sortNewest
        ? (b.updated || b.created || 0) - (a.updated || a.created || 0)
        : (a.created || 0) - (b.created || 0);
    });

    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'jrn-controls' },
        React.createElement('input', {
          className: 'jrn-search', type: 'text', placeholder: 'Search entries…',
          value: query, onChange: function(e) { setQuery(e.target.value); }
        }),
        React.createElement('button', { className: 'jrn-sort-btn', onClick: function() { setSortNewest(function(v) { return !v; }); } }, sortNewest ? 'Newest ↓' : 'Oldest ↑')
      ),
      filtered.length === 0
        ? React.createElement('div', { className: 'jrn-empty' },
            React.createElement('div', { className: 'jrn-empty-title' }, list.length === 0 ? 'No Entries Yet' : 'No Matches'),
            React.createElement('div', { className: 'jrn-empty-hint' }, list.length === 0
              ? 'Tap the + button below to write your first reflection. You can embed letters, bookmarks, images, and voice recordings.'
              : 'Try a different search term.')
          )
        : React.createElement('div', { className: 'jrn-list' }, filtered.map(renderCard))
    );
  }

  // ─── Nav children ───────────────────────────────────────────
  var navChildren = React.createElement(React.Fragment, null,
    React.createElement('button', { className: 'nav-home nav-back-icon', onClick: onBack, title: 'Back', 'aria-label': 'Back' }, '‹'),
    React.createElement('button', { className: 'nav-search-btn', onClick: props.onSearch, title: 'Search' },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6' },
        React.createElement('circle', { cx: '11', cy: '11', r: '8' }),
        React.createElement('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' })
      )
    ),
    props.historyEnabled !== false && React.createElement('button', { className: 'nav-search-btn', onClick: props.onHistory, title: 'History' },
      React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('circle', { cx: '12', cy: '12', r: '9' }),
        React.createElement('polyline', { points: '12 7 12 12 15 15' })
      )
    ),
    React.createElement(ThemeBtn, { theme: props.theme, onThemeChange: props.onThemeChange })
  );

  var pinnedEntries = allEntries.filter(function(e) { return e.pinned; });

  return React.createElement(ScreenLayout, { navChildren: navChildren },
    React.createElement('div', { className: 'jrn-hub' },
      React.createElement('div', { className: 'jrn-hub-header' },
        React.createElement('h1', { className: 'jrn-hub-title' }, 'My Journal'),
        React.createElement('span', { className: 'jrn-hub-count' }, allEntries.length + (allEntries.length === 1 ? ' entry' : ' entries'))
      ),
      (stats.totalEntries > 0 || stats.currentStreak > 0) && renderStats(),
      drilled
        ? renderNotebooks()
        : React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'jrn-tabs' },
              React.createElement('button', { className: 'jrn-tab' + (tab === 'all' ? ' active' : ''), onClick: function() { setTab('all'); } }, 'All Entries'),
              React.createElement('button', { className: 'jrn-tab' + (tab === 'notebooks' ? ' active' : ''), onClick: function() { setTab('notebooks'); } }, 'Notebooks'),
              React.createElement('button', { className: 'jrn-tab' + (tab === 'pinned' ? ' active' : ''), onClick: function() { setTab('pinned'); } }, 'Pinned')
            ),
            tab === 'all' && renderEntries(allEntries),
            tab === 'notebooks' && renderNotebooks(),
            tab === 'pinned' && renderEntries(pinnedEntries)
          ),
      React.createElement('button', { className: 'jrn-fab', onClick: onCreateEntry, title: 'New entry', 'aria-label': 'New entry' },
        React.createElement('svg', { viewBox: '0 0 24 24' },
          React.createElement('path', { d: 'M12 5v14M5 12h14' })
        )
      )
    )
  );
}
