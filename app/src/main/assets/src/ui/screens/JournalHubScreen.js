/* ═══════════════════════════════════════════════════════════════
   JOURNAL HUB SCREEN — entry list + tabs
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Depends on: React, ScreenLayout, ThemeBtn, JournalStore, JournalHelpers.

   Two tabs: All Entries · Pinned.

   Interaction model (per user direction):
     • The "+" insert FAB belongs ONLY to the editor (editing an actual
       entry). The hub has a clear "New Entry" pill instead.
     • Each card has a ⋯ (3-dot) menu → Open · Edit · Pin/Unpin ·
       Delete. Delete uses the Settings-style triple-confirm because a
       journal entry is precious.

   Props:
     onBack(), onHome()
     onOpenEntry(entryId)     — open the read-only viewer
     onEditEntry(entryId)     — open the editor directly
     onCreateEntry()          — create a fresh entry + open editor
     onSearch(), onHistory(), historyEnabled
     hlTick, setHlTick
     theme, onThemeChange
═══════════════════════════════════════════════════════════════ */

/* Per-card action sheet: Open · Edit · Pin/Unpin · Delete (triple
   confirm). Modeled on the bookmark/link action sheets (reuses the
   .link-action-* shell so it looks native to the app). */
export function JournalCardMenu(props) {
  var useState = React.useState;
  var entry = props.entry;
  var _step = useState(0); // 0 idle, 1/2/3 delete-confirm steps
  var step = _step[0]; var setStep = _step[1];
  var _typed = useState('');
  var typed = _typed[0]; var setTyped = _typed[1];
  if (!entry) return null;

  function close() { props.onClose && props.onClose(); }

  return React.createElement('div', { className: 'link-action-overlay', onClick: close },
    React.createElement('div', { className: 'link-action-sheet', onClick: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'link-action-handle' }),
      step === 0 && React.createElement(React.Fragment, null,
        React.createElement('button', { className: 'link-action-btn', onClick: function() { close(); props.onOpen(); } },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z' }),
            React.createElement('circle', { cx: '12', cy: '12', r: '3' })
          ),
          React.createElement('span', null, 'Open Entry')
        ),
        React.createElement('button', { className: 'link-action-btn', onClick: function() { close(); props.onEdit(); } },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M12 20h9' }),
            React.createElement('path', { d: 'M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z' })
          ),
          React.createElement('span', null, 'Edit Entry')
        ),
        React.createElement('button', { className: 'link-action-btn', onClick: function() { props.onTogglePin(); close(); } },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: entry.pinned ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z' }),
            React.createElement('path', { d: 'M8 12 L3 19' })
          ),
          React.createElement('span', null, entry.pinned ? 'Unpin Entry' : 'Pin Entry')
        ),
        React.createElement('button', { className: 'link-action-btn link-action-btn-danger', onClick: function() { setStep(1); setTyped(''); } },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('polyline', { points: '3 6 5 6 21 6' }),
            React.createElement('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
            React.createElement('path', { d: 'M10 11v6M14 11v6' })
          ),
          React.createElement('span', null, 'Delete Entry')
        )
      ),
      step > 0 && React.createElement('div', { className: 'jrn-tripledel', style: { margin: '6px 4px 4px' } },
        React.createElement('div', { className: 'jrn-tripledel-step-label' }, 'Step ' + step + ' of 3'),
        React.createElement('div', { className: 'jrn-tripledel-question' },
          step === 1 ? 'Delete this entry?'
            : step === 2 ? 'Are you sure? This cannot be undone.'
            : 'Type DELETE to permanently remove this entry.'),
        (function () {
          var summary = (typeof JournalStore !== 'undefined' && JournalStore.associatedDataSummary)
            ? JournalStore.associatedDataSummary(entry.id) : null;
          return summary && React.createElement('div', { className: 'jrn-tripledel-cascade' },
            'This will also permanently delete ' + summary +
            ' you placed inside this entry.');
        })(),
        step === 3 && React.createElement('input', {
          type: 'text', className: 'jrn-tripledel-input', placeholder: 'Type DELETE',
          value: typed, autoFocus: true, onChange: function(e) { setTyped(e.target.value); }
        }),
        React.createElement('div', { className: 'jrn-tripledel-actions' },
          React.createElement('button', { className: 'jrn-tripledel-cancel', onClick: function() { setStep(0); setTyped(''); } }, 'Cancel'),
          step < 3 && React.createElement('button', { className: 'jrn-tripledel-next', onClick: function() { setStep(step + 1); } },
            step === 1 ? 'Continue' : 'I am sure'),
          step === 3 && React.createElement('button', {
            className: 'jrn-tripledel-final',
            disabled: typed.trim().toUpperCase() !== 'DELETE',
            onClick: function() { props.onDelete(); close(); }
          }, 'Delete forever')
        )
      )
    )
  );
}

export function JournalHubScreen(props) {
  var useState = React.useState;
  var useMemo = React.useMemo;

  var onBack = props.onBack;
  var onHome = props.onHome;
  var onOpenEntry = props.onOpenEntry;
  var onEditEntry = props.onEditEntry;
  var onCreateEntry = props.onCreateEntry;
  var hlTick = props.hlTick;
  var setHlTick = props.setHlTick;

  var _tab = useState('all');
  var tab = _tab[0]; var setTab = _tab[1];

  var _q = useState('');
  var query = _q[0]; var setQuery = _q[1];

  var _sortNewest = useState(true);
  var sortNewest = _sortNewest[0]; var setSortNewest = _sortNewest[1];

  // The entry whose ⋯ action sheet is open (or null).
  var _menuEntry = useState(null);
  var menuEntry = _menuEntry[0]; var setMenuEntry = _menuEntry[1];

  var allEntries = useMemo(function() {
    return JournalStore.all();
  }, [hlTick]);

  function bump() { if (setHlTick) setHlTick(function(t) { return t + 1; }); }

  function deleteEntry(id) { JournalStore.remove(id); bump(); }
  function togglePin(id) { JournalStore.togglePin(id); bump(); }

  // ─── Entry card render ─────────────────────────────────────
  function renderCard(entry) {
    var title = JournalHelpers.entryDisplayTitle(entry);
    var preview = JournalHelpers.previewText(entry, 160);
    var attachments = JournalHelpers.attachmentSummary(entry);
    var moodClass = entry.mood ? entry.mood : '';

    return React.createElement('div', {
      key: entry.id,
      className: 'jrn-card' + (entry.pinned ? ' pinned' : ''),
      role: 'button',
      tabIndex: 0,
      onClick: function(e) {
        if (e.target.closest && e.target.closest('.jrn-card-menu-btn')) return;
        onOpenEntry && onOpenEntry(entry.id);
      },
      onKeyDown: function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenEntry(entry.id); }
      }
    },
      React.createElement('span', { className: 'jrn-card-mood ' + moodClass }),
      entry.pinned && React.createElement('div', { className: 'jrn-card-pin-marker', title: 'Pinned' },
        React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round' },
          React.createElement('path', { d: 'M9 4.5 L19.5 15 M15 3.5 a1.5 1.5 0 0 1 0 2.1 L13 7.5 l1.8 4.6 -2 2 -8.4 -8.4 2-2 4.6 1.8 1.9-1.9 a1.5 1.5 0 0 1 2.1 0z' }),
          React.createElement('path', { d: 'M8 12 L3 19' })
        )
      ),
      // 3-dot menu button (upper right). Stops propagation so it doesn't
      // also open the entry.
      React.createElement('button', {
        className: 'jrn-card-menu-btn',
        onClick: function(e) { e.stopPropagation(); setMenuEntry(entry); },
        'aria-label': 'Entry options', title: 'Options'
      },
        React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
          React.createElement('circle', { cx: '12', cy: '5', r: '1.6' }),
          React.createElement('circle', { cx: '12', cy: '12', r: '1.6' }),
          React.createElement('circle', { cx: '12', cy: '19', r: '1.6' })
        )
      ),
      React.createElement('div', { className: 'jrn-card-row' },
        React.createElement('h3', { className: 'jrn-card-title' + (title ? '' : ' untitled') }, title || 'Untitled'),
        React.createElement('span', { className: 'jrn-card-date' },
          JournalHelpers.shortDate(entry.updated || entry.created),
          React.createElement('span', { className: 'jrn-card-time' }, ' · ' + JournalHelpers.shortTime(entry.updated || entry.created))
        )
      ),
      preview && React.createElement('p', { className: 'jrn-card-preview' }, preview),
      attachments.length > 0 && React.createElement('div', { className: 'jrn-card-attachments' },
        attachments.map(function(a, i) {
          return React.createElement('span', { key: i, className: 'jrn-attach' }, a.label);
        })
      ),
      entry.tags && entry.tags.length > 0 && React.createElement('div', { className: 'jrn-card-meta' },
        React.createElement('div', { className: 'jrn-tags' },
          entry.tags.slice(0, 4).map(function(t, i) { return React.createElement('span', { key: i, className: 'jrn-tag' }, '#' + t); })
        )
      )
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
    // Sort by the SAME field both ways (updated||created) and just flip
    // the sign, with a stable id tiebreak. The old code keyed "newest" on
    // updated||created but "oldest" on created — so toggling didn't cleanly
    // reverse (looked broken). Entries store ms timestamps, so this is exact.
    filtered = filtered.slice().sort(function(a, b) {
      var ad = a.updated || a.created || 0;
      var bd = b.updated || b.created || 0;
      if (ad !== bd) return sortNewest ? (bd - ad) : (ad - bd);
      if (a.id === b.id) return 0;
      var cmp = a.id < b.id ? -1 : 1;
      return sortNewest ? cmp : -cmp;
    });

    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'jrn-controls' },
        React.createElement('input', {
          className: 'jrn-search', type: 'text', placeholder: 'Search entries…',
          value: query, onChange: function(e) { setQuery(e.target.value); }
        }),
        React.createElement('button', {
          // Standardized sort control — same class + wording as every
          // other Library list (Notes/Bookmarks/Links/Highlights).
          className: 'notes-index-sort-btn',
          onClick: function() { setSortNewest(function(v) { return !v; }); },
          title: 'Toggle sort order'
        }, sortNewest ? 'Sort: Newest ↓' : 'Sort: Oldest ↑')
      ),
      filtered.length === 0
        ? React.createElement('div', { className: 'jrn-empty' },
            React.createElement('div', { className: 'jrn-empty-title' }, isPinnedTab
              ? (list.length === 0 ? 'No Pinned Entries' : 'No Matches')
              : (list.length === 0 ? 'No Entries Yet' : 'No Matches')),
            React.createElement('div', { className: 'jrn-empty-hint' },
              isPinnedTab && list.length === 0
                ? 'Pin your favorite or most-used journal entries here to access them easily.'
                : list.length === 0
                  ? 'Tap "New Entry" below to write your first reflection. You can embed letters, bookmarks, images, and voice recordings.'
                  : 'Try a different search term.')
          )
        : React.createElement('div', { className: 'jrn-list' }, filtered.map(renderCard))
    );
  }

  // ─── Nav children — back left, everything else right ────────
  // Standard app-wide Library nav (back + Home left, icon cluster right).
  var navChildren = LibraryNav({
    onBack: onBack, onSearch: props.onSearch, onHistory: props.onHistory,
    onSettings: props.onSettings,
    theme: props.theme, onThemeChange: props.onThemeChange
  });

  var pinnedEntries = allEntries.filter(function(e) { return e.pinned; });

  return React.createElement(ScreenLayout, { navChildren: navChildren },
    React.createElement('div', { className: 'jrn-hub' },
      React.createElement('div', { className: 'jrn-hub-header' },
        React.createElement('h1', { className: 'jrn-hub-title' }, 'My Journal'),
        React.createElement('span', { className: 'jrn-hub-count' }, allEntries.length + (allEntries.length === 1 ? ' entry' : ' entries'))
      ),
      React.createElement('div', { className: 'jrn-tabs' },
        React.createElement('button', { className: 'jrn-tab' + (tab === 'all' ? ' active' : ''), onClick: function() { setTab('all'); } }, 'All Entries'),
        React.createElement('button', { className: 'jrn-tab' + (tab === 'pinned' ? ' active' : ''), onClick: function() { setTab('pinned'); } }, 'Pinned')
      ),
      tab === 'all' && renderEntries(allEntries, false),
      tab === 'pinned' && renderEntries(pinnedEntries, true),
      // "New Entry" pill — replaces the old +/edit FAB. The "+" insert
      // affordance now lives ONLY in the editor.
      React.createElement('button', {
        className: 'jrn-fab jrn-fab-newentry',
        onClick: function() { onCreateEntry && onCreateEntry(); },
        title: 'New Entry', 'aria-label': 'New Entry'
      },
        React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round' },
          React.createElement('path', { d: 'M12 20h9' }),
          React.createElement('path', { d: 'M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z' })
        ),
        React.createElement('span', { className: 'jrn-fab-newentry-label' }, 'New Entry')
      ),
      menuEntry && React.createElement(JournalCardMenu, {
        entry: menuEntry,
        onClose: function() { setMenuEntry(null); },
        onOpen: function() { onOpenEntry && onOpenEntry(menuEntry.id); },
        onEdit: function() { onEditEntry ? onEditEntry(menuEntry.id) : (onOpenEntry && onOpenEntry(menuEntry.id)); },
        onTogglePin: function() { togglePin(menuEntry.id); },
        onDelete: function() { deleteEntry(menuEntry.id); }
      })
    )
  );
}
